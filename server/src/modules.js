import { RoomError } from './errors.js'

// Données des modules (public/modules/ du jeu), lues sur le site lui-même —
// le serveur est déployé seul, sans elles. Il n'en a besoin que pour
// arbitrer les parties à deux joueurs en double aveugle (cf. duel.js), et
// les relit à chaque création : une mise à jour du site vaut pour les
// parties suivantes, sans redémarrage. `MODULES_URL` : adresse du site, à
// défaut celle du client autorisé (`CLIENT_ORIGIN`).
const MODULES_URL = process.env.MODULES_URL ?? process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status} — ${url}`)
  return response.json()
}

/** JSON complet du module `moduleId`, tel que le site le sert (cf.
 *  public/modules/index.json). */
export async function loadModule(moduleId) {
  const index = await fetchJson(new URL('/modules/index.json', MODULES_URL))
  const entry = Array.isArray(index) ? index.find((candidate) => candidate.id === moduleId) : null
  if (!entry?.path) throw new RoomError('unknown-module')
  return fetchJson(new URL(entry.path, MODULES_URL))
}
