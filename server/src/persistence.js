import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { RoomError, GAME_ID_PATTERN, GAME_TTL_MS, adoptGame, getGame, onGameChange, serializeGame } from './rooms.js'
import { createDuelReferee } from './duel.js'
import { loadModule } from './modules.js'

// ═══════════════════════════════════════════════════════════════════════════
// Sauvegarde des parties en ligne. Chaque partie est écrite sur le disque à
// chaque changement (cf. rooms.js::onGameChange), un fichier par partie
// (`DATA_DIR/games/<id>.tfsave`), et relue :
//   - au démarrage du serveur, pour les parties encore actives ;
//   - à la demande (cf. `findGame`) pour celles sorties de la mémoire —
//     abandonnées plus de 72 h, ou pas encore relues.
// Un joueur peut aussi télécharger sa propre sauvegarde (cf. socket.js,
// `game:save`) et la rendre au serveur (cf. `restoreFromSave`) si celui-ci
// l'a perdue. Tout est chiffré (AES-256-GCM) avec une clé que seul le
// serveur connaît : une sauvegarde contient les positions des deux camps,
// qu'un joueur ne doit ni lire — le double aveugle — ni modifier.
// ═══════════════════════════════════════════════════════════════════════════

// Dossier des données : `DATA_DIR`, à défaut `data/` à côté de `server/` et
// `shared/` — hors de `server/`, pour survivre à son remplacement.
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? fileURLToPath(new URL('../../data/', import.meta.url)))
const GAMES_DIR = path.join(DATA_DIR, 'games')
const KEY_FILE = path.join(DATA_DIR, 'save.key')
const SAVE_EXT = '.tfsave'

const WRITE_DELAY_MS = 1000                    // regroupe les changements en rafale
const SAVE_TTL_MS = 30 * 24 * 60 * 60 * 1000   // partie sans activité : fichier supprimé
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000

// --- Chiffrement -------------------------------------------------------------
// `tfsave1.` + base64( iv (12 o) | tag (16 o) | AES-256-GCM( gzip( JSON ) ) ).
const MAGIC = 'tfsave1.'
const AAD = Buffer.from('taskforce-save')
let key = null

/** Clé de chiffrement : `SAVE_KEY` (32 octets en base64), à défaut le
 *  fichier `save.key`, créé au premier démarrage. Perdue, elle rend
 *  illisibles toutes les sauvegardes — disque et fichiers des joueurs. */
async function loadKey() {
  if (process.env.SAVE_KEY) {
    const fromEnv = Buffer.from(process.env.SAVE_KEY, 'base64')
    if (fromEnv.length !== 32) throw new Error('SAVE_KEY : 32 octets en base64 attendus')
    return fromEnv
  }
  try {
    const fromFile = Buffer.from((await readFile(KEY_FILE, 'utf8')).trim(), 'base64')
    if (fromFile.length !== 32) throw new Error(`${KEY_FILE} : 32 octets en base64 attendus`)
    return fromFile
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  const created = randomBytes(32)
  await writeFile(KEY_FILE, `${created.toString('base64')}\n`, { mode: 0o600, flag: 'wx' })
  console.log(`Clé de sauvegarde créée : ${KEY_FILE}`)
  return created
}

/** `value` chiffré, en texte (cf. MAGIC). */
export function seal(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(AAD)
  const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify(value))), cipher.final()])
  return MAGIC + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
}

/** Contenu d'un texte produit par `seal` — `bad-save` s'il n'en vient pas,
 *  a été modifié, ou a été chiffré avec une autre clé. */
export function open(text) {
  try {
    if (typeof text !== 'string' || !text.startsWith(MAGIC)) throw new Error('format')
    const raw = Buffer.from(text.slice(MAGIC.length).trim(), 'base64')
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
    decipher.setAAD(AAD)
    decipher.setAuthTag(raw.subarray(12, 28))
    const zipped = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()])
    return JSON.parse(gunzipSync(zipped).toString('utf8'))
  } catch {
    throw new RoomError('bad-save')
  }
}

// --- Fichiers ----------------------------------------------------------------
const fileOf = (id) => path.join(GAMES_DIR, `${id}${SAVE_EXT}`)

// Écritures en attente (`id` -> `{ game, timer }`) et en cours (`id` ->
// `{ game, done }`) : une seule à la fois par partie, la dernière l'emporte.
const pending = new Map()
const writing = new Map()

/** Écrit `game` tel qu'il est maintenant (fichier temporaire, puis
 *  renommage : jamais de fichier à moitié écrit). */
function write(game) {
  pending.delete(game.id)
  const text = seal({ game: serializeGame(game) })
  const previous = writing.get(game.id)?.done ?? Promise.resolve()
  const done = previous
    .then(async () => {
      const temp = `${fileOf(game.id)}.tmp`
      await writeFile(temp, text, { mode: 0o600 })
      await rename(temp, fileOf(game.id))
    })
    .catch((err) => console.error(`Partie ${game.id} non sauvegardée :`, err.message))
    .finally(() => { if (writing.get(game.id)?.done === done) writing.delete(game.id) })
  writing.set(game.id, { game, done })
}

function schedule(game) {
  if (!pending.has(game.id)) pending.set(game.id, { game, timer: setTimeout(() => write(game), WRITE_DELAY_MS) })
}

function flush(id) {
  const waiting = pending.get(id)
  if (!waiting) return
  clearTimeout(waiting.timer)
  write(waiting.game)
}

async function remove(id) {
  clearTimeout(pending.get(id)?.timer)
  pending.delete(id)
  await writing.get(id)?.done
  await rm(fileOf(id), { force: true })
}

/** Arrêt du serveur (pm2 restart, déploiement…) : les parties en attente
 *  d'écriture, ou en cours, sont écrites tout de suite, en synchrone. */
function flushAllSync() {
  const games = new Map([...writing, ...pending].map(([id, { game }]) => [id, game]))
  for (const { timer } of pending.values()) clearTimeout(timer)
  pending.clear()
  for (const game of games.values()) {
    try {
      const temp = `${fileOf(game.id)}.sync.tmp`
      writeFileSync(temp, seal({ game: serializeGame(game) }), { mode: 0o600 })
      renameSync(temp, fileOf(game.id))
    } catch (err) {
      console.error(`Partie ${game.id} non sauvegardée à l'arrêt :`, err.message)
    }
  }
}

// --- Reprise -----------------------------------------------------------------
/** Arbitre de la partie de `snapshot` en double aveugle (cf. duel.js),
 *  recréé depuis le module lu sur le site ; `null` hors double aveugle. */
async function refereeFor(snapshot) {
  if (!snapshot.duel) return null
  let module
  try {
    module = await loadModule(snapshot.moduleId)
  } catch (err) {
    console.error(`Module ${snapshot.moduleId} illisible :`, err.message)
    throw new RoomError('module-unavailable')
  }
  const referee = createDuelReferee(module, snapshot.scenarioId)
  if (!referee) throw new RoomError('no-duel')
  return referee
}

async function adopt(snapshot) {
  return adoptGame(snapshot, await refereeFor(snapshot))
}

// Relectures en cours (`id` -> promesse) : deux demandes simultanées de la
// même partie n'en créent qu'une.
const reviving = new Map()

/** Partie `id`, en mémoire ou relue depuis le disque — `null` si elle
 *  n'existe nulle part. */
export async function findGame(id) {
  const inMemory = getGame(id)
  if (inMemory || typeof id !== 'string' || !GAME_ID_PATTERN.test(id)) return inMemory ?? null
  if (!reviving.has(id)) {
    const revival = (async () => {
      let text
      try {
        text = await readFile(fileOf(id), 'utf8')
      } catch (err) {
        if (err.code === 'ENOENT') return null
        throw err
      }
      const game = await adopt(open(text).game)
      // Quelqu'un revient : la purge repart de maintenant.
      game.lastActivity = Date.now()
      return game
    })().finally(() => reviving.delete(id))
    reviving.set(id, revival)
  }
  return reviving.get(id)
}

/** Sauvegarde de la partie `game` pour son joueur `playerId`, à télécharger
 *  (cf. socket.js, `game:save`). */
export function saveFor(game, playerId) {
  return seal({ game: serializeGame(game), owner: playerId })
}

/** Rend au serveur la partie d'une sauvegarde téléchargée (cf. `saveFor`).
 *  Si le serveur a encore la partie, c'est SA copie qui fait foi — jamais
 *  une sauvegarde plus ancienne qui effacerait des tours joués ; la
 *  sauvegarde ne sert alors qu'à rendre son siège au joueur. Renvoie de
 *  quoi la rejoindre : `{ id, passcode, playerId }`. */
export async function restoreFromSave(text) {
  const { game: snapshot, owner } = open(text)
  if (!snapshot || typeof owner !== 'string') throw new RoomError('bad-save')
  // Copie du serveur illisible : la sauvegarde la remplace.
  let game = await findGame(snapshot.id).catch(() => null)
  if (game && game.passcode !== snapshot.passcode) throw new RoomError('bad-save')
  if (!game) {
    game = await adopt(snapshot)
    game.lastActivity = Date.now()
    schedule(game)
  }
  if (!game.players.has(owner)) throw new RoomError('bad-save')
  return { id: game.id, passcode: game.passcode, playerId: owner }
}

// --- Démarrage ---------------------------------------------------------------
/** Fichiers (sauvegardes, restes d'écriture) des parties hors mémoire sans
 *  activité depuis `SAVE_TTL_MS` : supprimés. */
async function cleanup(now = Date.now()) {
  for (const name of await readdir(GAMES_DIR).catch(() => [])) {
    if (getGame(name.split('.')[0])) continue
    const { mtimeMs } = await stat(path.join(GAMES_DIR, name)).catch(() => ({ mtimeMs: now }))
    if (now - mtimeMs > SAVE_TTL_MS) await rm(path.join(GAMES_DIR, name), { force: true })
  }
}

/** Prépare la sauvegarde (dossier, clé), s'abonne aux changements de
 *  parties, et remet en mémoire celles qui étaient actives (moins de
 *  `GAME_TTL_MS` sans activité). Une partie illisible maintenant (module
 *  injoignable…) reste sur le disque : `findGame` la relira à la demande. */
export async function startPersistence() {
  await mkdir(GAMES_DIR, { recursive: true, mode: 0o700 })
  key = await loadKey()

  onGameChange((game, event) => {
    if (event === 'change') schedule(game)
    else if (event === 'unload') flush(game.id)
    else if (event === 'delete') remove(game.id).catch((err) => console.error(`Partie ${game.id} non supprimée :`, err.message))
  })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      flushAllSync()
      process.exit(0)
    })
  }

  let restored = 0
  const now = Date.now()
  for (const name of await readdir(GAMES_DIR)) {
    if (!name.endsWith(SAVE_EXT)) continue
    try {
      const { game: snapshot } = open(await readFile(path.join(GAMES_DIR, name), 'utf8'))
      if (now - (snapshot.lastActivity ?? 0) > GAME_TTL_MS) continue
      await adopt(snapshot)
      restored += 1
    } catch (err) {
      console.error(`Partie ${name} non relue au démarrage :`, err.code ?? err.message)
    }
  }
  if (restored) console.log(`${restored} partie(s) relue(s) depuis ${GAMES_DIR}`)

  await cleanup()
  setInterval(() => cleanup().catch(() => {}), CLEANUP_INTERVAL_MS).unref?.()
}
