// ═══════════════════════════════════════════════════════════════════════════
// coralSeaPerception — ce que SAIT le camp japonais, joué par le moteur
// ═══════════════════════════════════════════════════════════════════════════
//
// Faits que lisent les questions des arbres de décision (cf.
// lib/ai/coralSeaTrees.js, lib/ai/decisionTree.js). Deux sources, et rien
// d'autre :
//   - la CARTE, telle que la voit le joueur japonais : positions des task
//     forces alliées (leurres compris, indiscernables) et pions de repérage
//     ("Sighted Carrier", "Sighted Fleet") posés sur elles ou sur les
//     siennes ;
//   - le SECRET japonais, que fournit lib/useCoralSea.js : comportement de
//     la task force, porte-avions partenaires, mémoire d'attente, et mémoire
//     des repérages (ce qu'on a vu d'une unité alliée, même une fois son
//     pion "Sighted" retiré au retour des chits).
// Jamais ce qu'est VRAIMENT une task force alliée : l'IA ne triche pas.
import { hexDistance } from '../hex.js'

const hexOf = (unit) => ({ col: unit.col, row: unit.row })

/** Hex de l'unité de `units` la plus proche de `from` (la première à
 *  distance égale), ou `null` sans unité. */
function nearestHex(from, units) {
  if (!units.length) return null
  return hexOf(units.reduce((best, unit) => (hexDistance(from, unit) < hexDistance(from, best) ? unit : best)))
}

/** Faits du mouvement de la task force japonaise `counter`, parmi les pions
 *  de la carte `counters`. `own` : ce que le Japonais sait de ses propres
 *  forces —
 *   - `behavior` : comportement de la task force (cf. useCoralSea.js::
 *     behaviorOfShips), `null` pour un vrai leurre ;
 *   - `partners` : les AUTRES task forces japonaises de porte-avions sur la
 *     carte ;
 *   - `allowanceOf(pion)` : MP du tour ;
 *   - `turn`, `waitingSince` : tour en cours, et tour où cette task force a
 *     commencé à attendre ses partenaires (ou `null`). */
export function perceiveTaskForce(counter, counters, own) {
  const allies = counters.filter((other) => other.faction === 'usn' && other.type === 'task force')
  const sightingsOf = (unit) => counters.filter((marker) => marker.sighted && marker.attachedTo === String(unit.id)).map((marker) => marker.sighted)
  const isSighted = (unit) => sightingsOf(unit).some((sighting) => sighting === 'carrierTF' || sighting === 'fleetTF')
  const sightedAllies = allies.filter(isSighted)
  const unsightedAllies = allies.filter((unit) => !isSighted(unit))
  const sightedCarriers = allies.filter((unit) => sightingsOf(unit).includes('carrierTF'))
  const nearestSightedCarrier = nearestHex(counter, sightedCarriers)
  const stepsOf = (unit) => Math.max(1, own.allowanceOf(unit) || 1)
  return {
    behavior: own.behavior,
    allies,
    sightedAllies,
    unsightedAllies,
    sightedCarriers,
    nearestSightedAlly: nearestHex(counter, sightedAllies),
    nearestUnsightedAlly: nearestHex(counter, unsightedAllies),
    nearestSightedCarrier,
    // Repérée elle-même ("Sighted Carrier" ou "Sighted Fleet" sur elle).
    selfSighted: isSighted(counter),
    // Hex parcourus ce tour-ci, et distance au porte-avions allié visé —
    // pour elle comme pour ses partenaires.
    steps: stepsOf(counter),
    distanceToSightedCarrier: nearestSightedCarrier ? hexDistance(counter, nearestSightedCarrier) : null,
    partners: nearestSightedCarrier
      ? own.partners.map((partner) => ({ distance: hexDistance(partner, nearestSightedCarrier), steps: stepsOf(partner) }))
      : [],
    turnsWaiting: own.waitingSince == null ? 0 : own.turn - own.waitingSince,
  }
}

/** Faits d'un hex `hex` qu'une source de reconnaissance japonaise peut
 *  explorer (cf. useCoralSea.js::reconChoice), parmi les pions de la carte
 *  `counters`. `own` : ce que le Japonais sait de ses
 *  propres forces —
 *   - `ownCarriers`, `ownTransports` : ses task forces de porte-avions et
 *     de transports sur la carte ;
 *   - `lastSeen(id)` : dernier repérage d'une unité alliée ("carrierTF" ou
 *     "fleetTF"), même tombé depuis, ou `null`. */
export function perceiveReconTarget(hex, counters, own) {
  const here = counters.filter((unit) => unit.faction === 'usn' && unit.type === 'task force' && unit.col === hex.col && unit.row === hex.row)
  const sighted = new Set(counters.filter((marker) => marker.sighted === 'carrierTF' || marker.sighted === 'fleetTF').map((marker) => marker.attachedTo))
  const unsightedHere = here.filter((unit) => !sighted.has(String(unit.id)))
  const nearest = (units) => (units.length ? Math.min(...units.map((unit) => hexDistance(unit, hex))) : Infinity)
  return {
    // Une unité alliée au moins n'y est pas repérée en ce moment.
    unsighted: unsightedHere.length > 0,
    // L'une d'elles a déjà été vue comme porte-avions.
    rememberedAsCarrier: unsightedHere.some((unit) => own.lastSeen(String(unit.id)) === 'carrierTF'),
    distanceToOwnCarrier: nearest(own.ownCarriers),
    distanceToOwnTransport: nearest(own.ownTransports),
  }
}
