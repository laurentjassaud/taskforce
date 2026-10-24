// ═══════════════════════════════════════════════════════════════════════════
// coralSeaPerception — ce que SAIT le camp japonais, joué par le moteur
// ═══════════════════════════════════════════════════════════════════════════
//
// Faits que lisent les questions des arbres de décision (cf.
// lib/ai/coralSeaTrees.js, lib/ai/decisionTree.js). Trois sources, et rien
// d'autre :
//   - la CARTE, telle que la voit le joueur japonais : positions des task
//     forces alliées (leurres compris, indiscernables) et pions de repérage
//     ("Sighted Carrier", "Sighted Fleet") posés sur elles ou sur les
//     siennes ;
//   - l'ORDRE DE BATAILLE allié du scénario, public : de quoi les task forces
//     alliées PEUVENT être faites — d'où des moyennes (cf.
//     `sightedDefenseEstimate`), le joueur composant ses task forces ;
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

/** Défenseurs d'une cible sur le support de sa task force (cf.
 *  useCoralSea.js::strikeDefenders) : les escortes autour du porte-avions
 *  d'une "Carrier TF", et les navires qui défendent une cible de "Fleet TF"
 *  (elle et ses deux voisins). */
export const CARRIER_TF_ESCORTS = 4
export const FLEET_TF_DEFENDERS = 3
const CARRIERS = new Set(['CV', 'CVL'])
/** Hors de la moyenne des escortes d'une Carrier TF : les autres
 *  porte-avions, les pétroliers et les transports. */
const NOT_ESCORTS = new Set(['CV', 'CVL', 'AO', 'AK'])

/** Défense ESTIMÉE d'une task force repérée, dont on ne sait pas de quoi elle
 *  est faite : des moyennes sur les navires `ships` de l'ordre de bataille de
 *  son camp (catalogue, faces intactes — un pion compte pour un navire, un
 *  pion DD aussi) —
 *   - "Carrier TF", visée au porte-avions : le porte-avions (CV ou CVL) à la
 *     meilleure défense AA — à égalité, le plus solide —, plus 4 escortes
 *     moyennes (moyenne hors CV, CVL, AO et AK) ; durabilité : celle de ce
 *     porte-avions ;
 *   - "Fleet TF", visée à un navire moyen : 3 navires moyens, la cible et ses
 *     deux voisins (moyenne hors CV et CVL, pétroliers et transports
 *     compris) ; durabilité : la moyenne de ces navires (0 en face réduite
 *     pour qui n'a pas de face endommagée).
 *  `{ carrierTF: { antiAir, durability, carrier, escortAntiAir }, fleetTF: {
 *  antiAir, durability, shipAntiAir } }` — valeurs non arrondies ;
 *  `durability` : `{ intact, reduced }` (cf. lib/airStrike.js::
 *  damageOutcome) ; `null` pour une sorte de TF que l'ordre de bataille ne
 *  permet pas (pas de porte-avions, ou rien d'autre). */
export function sightedDefenseEstimate(ships) {
  const average = (list, valueOf) => (list.length ? list.reduce((sum, ship) => sum + valueOf(ship), 0) / list.length : null)
  const durabilityOf = (ship) => ({ intact: ship.intact.durability, reduced: ship.damaged?.durability ?? 0 })
  // Meilleur porte-avions : défense AA, puis durabilité intacte, puis réduite.
  const stronger = (a, b) => a.intact.antiAir - b.intact.antiAir || a.intact.durability - b.intact.durability
    || durabilityOf(a).reduced - durabilityOf(b).reduced
  const carrier = ships.filter((ship) => CARRIERS.has(ship.type))
    .reduce((best, ship) => (!best || stronger(ship, best) > 0 ? ship : best), null)
  const escorts = ships.filter((ship) => !NOT_ESCORTS.has(ship.type))
  const fleet = ships.filter((ship) => !CARRIERS.has(ship.type))
  const escortAntiAir = average(escorts, (ship) => ship.intact.antiAir)
  const shipAntiAir = average(fleet, (ship) => ship.intact.antiAir)
  return {
    carrierTF: carrier && escortAntiAir != null
      ? { antiAir: carrier.intact.antiAir + CARRIER_TF_ESCORTS * escortAntiAir, durability: durabilityOf(carrier), carrier, escortAntiAir }
      : null,
    fleetTF: shipAntiAir != null
      ? {
          antiAir: FLEET_TF_DEFENDERS * shipAntiAir,
          durability: { intact: average(fleet, (ship) => durabilityOf(ship).intact), reduced: average(fleet, (ship) => durabilityOf(ship).reduced) },
          shipAntiAir,
        }
      : null,
  }
}

/** Navires ESTIMÉS d'une task force repérée, cibles d'une frappe
 *  aéronavale (cf. lib/strikePlanner.js), sur les mêmes moyennes que
 *  `sightedDefenseEstimate` —
 *   - "Carrier TF" : le porte-avions (défendu par lui-même et ses 4
 *     escortes) et 4 escorteurs moyens (chacun défendu par lui-même et le
 *     porte-avions) ;
 *   - "Fleet TF" : 3 navires moyens, chacun défendu par lui-même et deux
 *     voisins moyens.
 *  Chaque navire : `{ role: 'carrier' | 'escort' | 'ship', antiAir,
 *  durability, points }` — défense AA et durabilité arrondies à l'entier le
 *  plus proche pour lire les tableaux ; `points`, les points de victoire de
 *  chaque résultat (rien, mineur, significatif, critique, coulé) :
 *  `pointsOf(type)` du navire, en moyenne pour un navire moyen. `{
 *  carrierTF, fleetTF }`, chacun `null` comme dans `sightedDefenseEstimate`. */
export function sightedTargetsEstimate(ships, pointsOf) {
  const { carrierTF, fleetTF } = sightedDefenseEstimate(ships)
  const meanOf = (list, valueOf) => list.reduce((sum, ship) => sum + valueOf(ship), 0) / list.length
  // Durabilité et barème moyens des navires `list`.
  const averageShip = (list) => ({
    durability: { intact: Math.round(meanOf(list, (ship) => ship.intact.durability)), reduced: Math.round(meanOf(list, (ship) => ship.damaged?.durability ?? 0)) },
    points: pointsOf(list[0].type).map((_, index) => meanOf(list, (ship) => pointsOf(ship.type)[index] ?? 0)),
  })
  const repeat = (count, make) => Array.from({ length: count }, make)
  let carrierTargets = null
  if (carrierTF) {
    const escort = averageShip(ships.filter((ship) => !NOT_ESCORTS.has(ship.type)))
    carrierTargets = [
      { role: 'carrier', antiAir: Math.round(carrierTF.antiAir),
        durability: { intact: carrierTF.durability.intact, reduced: carrierTF.durability.reduced }, points: pointsOf(carrierTF.carrier.type) },
      ...repeat(CARRIER_TF_ESCORTS, () => ({ role: 'escort', antiAir: Math.round(carrierTF.escortAntiAir + carrierTF.carrier.intact.antiAir), ...escort })),
    ]
  }
  const fleetTargets = fleetTF
    ? repeat(FLEET_TF_DEFENDERS, () => ({ role: 'ship', antiAir: Math.round(fleetTF.antiAir), ...averageShip(ships.filter((ship) => !CARRIERS.has(ship.type))) }))
    : null
  return { carrierTF: carrierTargets, fleetTF: fleetTargets }
}
