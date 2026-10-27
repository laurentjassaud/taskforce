// ═══════════════════════════════════════════════════════════════════════════
// coralSea/shared — outils communs aux règles du module "coral-sea" (cf.
// lib/useCoralSea.js) et aux moteurs de ses scénarios (cf. ./scenarios/)
// ═══════════════════════════════════════════════════════════════════════════
import { parseHexId } from '../calibration.js'

/** Types de navires qui font d'une task force une task force de
 *  porte-avions. */
export const CARRIER_TYPES = new Set(['CV', 'CVL'])

/** Portée des raids aériens, en hex : une règle du module, commune à tous
 *  ses scénarios (cf. lib/useCoralSea.js::raidPlan, alliedAirReach), que
 *  les IA des scénarios respectent (ex. le rayon d'attaque des porte-avions,
 *  scenarios/scenario-5/movementTree.js). */
export const RAID_RADIUS = 5

/** Hex "CCRR" (numéro imprimé sur la carte) -> `{ col, row }` (col 0-based) :
 *  cf. lib/calibration.js::parseHexId. */
export const hexOfId = parseHexId

/** Navires d'une liste d'ordre de bataille (`"id"` ou `{ ship, count }`,
 *  cf. coral-sea.json), un id par navire. */
export function expandShips(list) {
  return (list ?? []).flatMap((entry) => (typeof entry === 'string' ? [entry] : Array(entry?.count ?? 1).fill(entry?.ship)))
}

/** Une task force JAPONAISE (vrai pion) ou un leurre japonais : les pions
 *  que déplace le moteur. */
export function isIjnTaskForce(counter) {
  return counter?.faction === 'ijn' && counter.type === 'task force'
}

/** Un leurre (Dummy) JAPONAIS : task force factice, qui peut porter en
 *  secret une vraie task force (cf. le moteur `fleets` du scénario). */
export function isDummy(counter) {
  return counter?.code === 'Dummy' && counter.faction === 'ijn'
}

/** Copie de `list` dans un ordre tiré au hasard. */
export function shuffle(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
