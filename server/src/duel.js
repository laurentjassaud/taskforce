import { RoomError } from './errors.js'
import { resolveEdges } from '../../shared/edges.js'
import { hexExists, removedHexSet } from '../../shared/mapShape.js'
import { hexId } from '../../shared/calibration.js'
import { resolveTrack, duelTrackOptions, stepSequence, setupSteps, turnOfStep, slotOfStep } from '../../shared/turnTrack.js'
import { RECON_PHASE, inContact, reconFits, resolveRecon, nightTurnsOf, nightSince } from '../../shared/duelRules.js'

// ═══════════════════════════════════════════════════════════════════════════
// Arbitre des parties EN LIGNE à deux joueurs en double aveugle (mode `duel`,
// cf. `scenario.duel` du module). Le serveur garde les vraies positions
// (`game.boardState`) et n'envoie à chaque joueur que ce que son camp a le
// droit de voir : ses pions, et les task forces adverses qu'il a découvertes
// au contact. Ce que les deux camps comparent, c'est donc lui qui le
// calcule, avec les règles partagées du jeu (shared/duelRules.js) :
//   - le contact, après chaque pas d'une task force (cf. `contactAfterMove`) ;
//   - la reconnaissance — tirage des chits compris (cf. `recon`) : le
//     chercheur ne reçoit que ses pions "Sighted", jamais les chits ni les
//     task forces de ses zones ; l'adversaire, ses seules task forces
//     survolées.
// L'état propre au duel vit dans `game.duel` (cf. rooms.js::createGame) :
// `seen` (camp -> { id de task force adverse : tour où il l'a découverte }),
// `reconSteps` (pas de la piste où une reconnaissance a eu lieu).
// ═══════════════════════════════════════════════════════════════════════════

// Version de la piste des pas inscrits au journal (cf. HexMap.vue,
// `TRACK_VERSION`).
const TRACK_VERSION = 2

/** Arbitre du duel pour le scénario `scenarioId` du module `module` (JSON
 *  complet), ou `null` si ce scénario ne se joue pas à deux. */
export function createDuelReferee(module, scenarioId) {
  const scenario = (module.scenarios ?? []).find((entry) => entry.id === scenarioId) ?? module.scenarios?.[0] ?? null
  if (!scenario?.duel || !module.turnTrack) return null
  const track = resolveTrack(module, duelTrackOptions(module, scenario))
  const edges = resolveEdges(module.terrain)
  const removed = removedHexSet(module.map)
  const onMap = (col, row) => hexExists(col, row, module.map, removed)
  const nights = nightTurnsOf(module.turnTrack)
  const reconRules = scenario.duel.recon ?? null
  const sides = Object.keys(module.sides ?? {})

  // Task forces des deux camps (ni leurres ni marqueurs) : seuls pions du
  // duel (cf. HexMap.vue::isDuelPiece).
  const sideOfFaction = (faction) => sides.find((side) => module.sides[side]?.includes(faction)) ?? null
  const pieces = new Map()
  for (const counter of Object.values(module.counters ?? {}).flat()) {
    if (counter?.type !== 'task force' || counter.code === 'Dummy') continue
    pieces.set(String(counter.id), { id: String(counter.id), side: sideOfFaction(counter.faction), faction: counter.faction, role: counter.role ?? null })
  }

  const turnAt = (step) => turnOfStep(track, step)
  const positionOf = (game, id) => game.boardState.get(id) ?? null
  /** Task forces du camp `side` sur la carte, avec leur position. */
  const piecesOf = (game, side) => [...pieces.values()]
    .filter((piece) => piece.side === side && game.boardState.has(piece.id))
    .map((piece) => ({ ...piece, ...positionOf(game, piece.id) }))
  const enemyOf = (side) => sides.find((other) => other !== side) ?? null

  /** Le camp `side` voit-il encore la task force adverse `id` — découverte
   *  au contact, jusqu'à la nuit suivante ? */
  function seenBy(game, side, id) {
    const since = game.duel.seen[side]?.[id]
    return since != null && !nightSince(since, turnAt(game.turnStep), nights)
  }

  return {
    /** Camp qui a la main à chaque pas de la piste, mise en place comprise. */
    turnOrder: stepSequence(track),

    /** Camp du pion `id` s'il est une task force du duel, sinon `null`. */
    ownerOf: (id) => pieces.get(String(id))?.side ?? null,

    /** L'hex (`col` 0-based, `row` 1-based) est-il sur la carte ? */
    onMap,

    /** La task force `id` peut-elle aller sur la carte ? Pas un porte-avions
     *  de plus que n'en a le scénario pour son camp (`recon.carriers`, cf.
     *  shared/duelRules.js, règle 1) — un déjà posé se déplace librement. */
    allowsMove(game, id) {
      const piece = pieces.get(String(id))
      const cap = reconRules?.carriers?.[piece?.side]
      if (!piece || cap == null || piece.role !== reconRules.role || game.boardState.has(piece.id)) return true
      return piecesOf(game, piece.side).filter((other) => other.role === reconRules.role).length < cap
    },

    /** Camps à qui transmettre la position du pion `id` : le sien, et
     *  l'adversaire tant qu'il le voit. */
    audienceOf(game, id) {
      const owner = pieces.get(id)?.side
      return owner ? [owner, ...sides.filter((side) => side !== owner && seenBy(game, side, id))] : []
    },

    /** Pions adverses que le camp `side` voit encore, à leur position
     *  actuelle (`{ id: { col, row } }`) — pour un joueur qui (re)joint la
     *  partie (cf. HexMap.vue, prop `initialRevealed`). */
    revealedFor(game, side) {
      return Object.fromEntries(piecesOf(game, enemyOf(side)).filter((piece) => seenBy(game, side, piece.id))
        .map((piece) => [piece.id, { col: piece.col, row: piece.row }]))
    },

    /** La task force `id` vient de bouger : au contact (cf. shared/
     *  duelRules.js::inContact) de task forces adverses qu'elle ne voyait
     *  pas encore ? Chaque camp voit alors l'autre jusqu'à la nuit
     *  suivante. Renvoie les données de l'entrée `contact` du journal (cf.
     *  HexMap.vue::applyDuelContact) — positions des task forces dévoilées
     *  comprises —, ou `null`. Jamais pendant la mise en place. */
    contactAfterMove(game, id) {
      const piece = pieces.get(id)
      const at = positionOf(game, id)
      if (!piece || !at || game.turnStep < setupSteps(track)) return null
      const ids = piecesOf(game, enemyOf(piece.side))
        .filter((enemy) => !seenBy(game, piece.side, enemy.id) && inContact(at, enemy, edges)).map((enemy) => enemy.id)
      if (!ids.length) return null
      const turn = turnAt(game.turnStep)
      const other = enemyOf(piece.side)
      game.duel.seen[piece.side] = { ...game.duel.seen[piece.side], ...Object.fromEntries(ids.map((enemyId) => [enemyId, turn])) }
      game.duel.seen[other] = { ...game.duel.seen[other], [id]: turn }
      const positions = Object.fromEntries([id, ...ids].map((shown) => [shown, { ...positionOf(game, shown) }]))
      return { step: game.turnStep, turn, side: piece.side, unitId: id, ids, hex: hexId(at.col + 1, at.row), positions, track: TRACK_VERSION }
    },

    /** Reconnaissance du camp `side` au pas `step`, sur les hex de reco
     *  `centers` (cf. HexMap.vue::launchDuelRecon) : vérifiée (phase,
     *  portée et quota de ses porte-avions, une seule par phase), puis
     *  tirée. Renvoie les données des deux entrées `duelRecon` du journal :
     *  `searcher` — hex de reco et pions "Sighted", sans chit ni task force
     *  —, `target` — les task forces adverses survolées, rien de plus —, et
     *  `targetSide`. */
    recon(game, side, { step, centers } = {}) {
      if (!reconRules || step !== game.turnStep || slotOfStep(track, step)?.phase !== RECON_PHASE || game.duel.reconSteps.has(step)) {
        throw new RoomError('bad-recon')
      }
      const cells = Array.isArray(centers) ? centers : []
      const valid = cells.length > 0 && cells.length <= 32 && cells.every((cell) => Number.isInteger(cell?.col) && Number.isInteger(cell?.row) && onMap(cell.col, cell.row))
        && new Set(cells.map((cell) => `${cell.col},${cell.row}`)).size === cells.length
      const carriers = piecesOf(game, side).filter((piece) => piece.role === reconRules.role)
      if (!valid || !reconFits(cells, carriers, reconRules.zones?.[side] ?? 0, reconRules.range)) throw new RoomError('bad-recon')
      const targetSide = enemyOf(side)
      const zones = resolveRecon({
        centers: cells.map(({ col, row }) => ({ col, row })),
        enemies: piecesOf(game, targetSide),
        friends: piecesOf(game, side),
        enemyFaction: module.sides?.[targetSide]?.[0] ?? targetSide,
        onMap,
      })
      game.duel.reconSteps.add(step)
      const turn = turnAt(step)
      // La cible connaît ses task forces : elle apprend lesquelles ont été
      // survolées, et l'hex où elles l'ont été (`hexes`, pour son journal).
      const fleets = [...new Set(zones.flatMap((zone) => zone.fleets))]
      const hexes = Object.fromEntries(fleets.map((id) => {
        const at = positionOf(game, id)
        return [id, at ? hexId(at.col + 1, at.row) : null]
      }))
      return {
        searcher: { side, step, turn, track: TRACK_VERSION, zones: zones.map(({ hex, col, row, sightings }) => ({ hex, col, row, sightings })) },
        target: { side, step, turn, track: TRACK_VERSION, zones: [{ fleets }], hexes },
        targetSide,
      }
    },
  }
}
