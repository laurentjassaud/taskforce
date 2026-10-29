// ═══════════════════════════════════════════════════════════════════════════
// Règles du duel (deux joueurs en double aveugle, cf. `scenario.duel` du
// module) qui comparent les forces des DEUX camps : contact, reconnaissance,
// et ce que la nuit efface. Partagées par le jeu — partie sur un seul écran,
// cf. src/components/HexMap.vue — et par le serveur, qui les arbitre en
// ligne (cf. server/src/duel.js) : les positions adverses ne quittent alors
// jamais le serveur. JavaScript pur : ni Vue, ni i18n.
// ═══════════════════════════════════════════════════════════════════════════

import { hexDistance, neighborsOf } from './hex.js'
import { hexId } from './calibration.js'

/** Phase de reconnaissance de la piste (id de `turnStructure.phases`). */
export const RECON_PHASE = 'reconnaissance'

/** Tasse de recherche pleine : nombre de chits par résultat. */
export const SEARCH_CHITS = { detected: 30, misdirect: 12, contactLost: 12 }

/** Tire un chit AVEC remise, au prorata de la tasse pleine — la tasse ne
 *  change pas. Clé de `SEARCH_CHITS`. `random` : tirage dans [0, 1[. */
export function drawChit(random = Math.random) {
  const total = Object.values(SEARCH_CHITS).reduce((sum, count) => sum + count, 0)
  let pick = Math.floor(random() * total)
  return Object.keys(SEARCH_CHITS).find((key) => (pick -= SEARCH_CHITS[key]) < 0)
}

/** Ce que le chit `chit` fait voir d'une task force de rôle `role` :
 *  "carrierTF" ou "fleetTF" — Detected, pour ce qu'elle est ; Misdirect,
 *  pour ce qu'elle n'est pas —, ou `null` (Contact Lost). Une task force sans
 *  rôle "carrier" compte comme une flotte. */
export function sightingOf(chit, role) {
  if (chit === 'contactLost') return null
  const carrier = role === 'carrier'
  return (chit === 'detected' ? carrier : !carrier) ? 'carrierTF' : 'fleetTF'
}

/** Les hex `a` et `b` (`{ col, row }`) sont-ils voisins, sans côté d'hex
 *  infranchissable entre eux (`edges`, cf. edges.js::resolveEdges) ? */
export function adjacentAcross(a, b, edges) {
  return hexDistance(a, b) === 1 && !edges.propsOf(`${hexId(a.col + 1, a.row)}-${hexId(b.col + 1, b.row)}`)?.impassable
}

/** Deux task forces sont-elles au contact : même hex, ou voisines sans
 *  barrière entre elles ? */
export function inContact(a, b, edges) {
  return (a.col === b.col && a.row === b.row) || adjacentAcross(a, b, edges)
}

/** Zone d'un hex de reco `center` : lui et ceux de ses 6 voisins qui sont
 *  sur la carte (`onMap(col, row)`). */
export function reconZone(center, onMap) {
  return [center, ...neighborsOf(center.col, center.row)].filter((hex) => onMap(hex.col, hex.row))
}

/** Les hex de reco `centers` se répartissent-ils entre les porte-avions
 *  `carriers` (`{ col, row }`) — chacun à `range` hex ou moins du sien,
 *  aucun porte-avions au-delà de `quota` hex ? Couplage biparti par chemins
 *  augmentants, un créneau par hex du quota de chaque porte-avions. */
export function reconFits(centers, carriers, quota, range) {
  const slots = carriers.flatMap((carrier) => Array(quota).fill(carrier))
  const zoneOf = Array(slots.length).fill(-1)
  const augment = (zone, seen) => slots.some((carrier, slot) => {
    if (seen.has(slot) || hexDistance(carrier, centers[zone]) > range) return false
    seen.add(slot)
    if (zoneOf[slot] !== -1 && !augment(zoneOf[slot], seen)) return false
    zoneOf[slot] = zone
    return true
  })
  return centers.every((_, zone) => augment(zone, new Set()))
}

/** Résultat d'une reconnaissance : un chit par hex de reco de `centers`,
 *  tiré pour sa zone (cf. `reconZone`) sur les task forces ennemies
 *  `enemies` (`{ id, col, row, role, faction }`) qui s'y trouvent.
 *  Detected : chaque task force vue pour ce qu'elle est ; Misdirect, pour
 *  ce qu'elle n'est pas — et, dans une zone vide, un leurre porte-avions ou
 *  flotte à pile ou face, sur un hex de la zone (aux couleurs de
 *  `enemyFaction`) ; Contact Lost : rien. Une zone par hex de reco : `{ hex,
 *  col, row, fleets, chit, sightings: [{ col, row, sighted, faction }] }` —
 *  `fleets`, ids des task forces ennemies de la zone. */
export function resolveRecon({ centers, enemies, enemyFaction, onMap, random = Math.random }) {
  return centers.map((center) => {
    const area = reconZone(center, onMap)
    const fleets = enemies.filter((enemy) => area.some((hex) => hex.col === enemy.col && hex.row === enemy.row))
    const chit = drawChit(random)
    const sightings = fleets.map((fleet) => ({ col: fleet.col, row: fleet.row, sighted: sightingOf(chit, fleet.role), faction: fleet.faction ?? enemyFaction }))
      .filter((sighting) => sighting.sighted)
    if (!fleets.length && chit === 'misdirect') {
      const sighted = random() < 0.5 ? 'carrierTF' : 'fleetTF'
      const hex = area[Math.floor(random() * area.length)]
      sightings.push({ col: hex.col, row: hex.row, sighted, faction: enemyFaction })
    }
    return { hex: hexId(center.col + 1, center.row), col: center.col, row: center.row,
      fleets: fleets.map((fleet) => String(fleet.id)), chit, sightings }
  })
}

/** Tours de nuit de la piste (`turnTrack.periods` de style "night"). */
export function nightTurnsOf(turnTrack) {
  return new Set((turnTrack?.periods ?? []).filter((period) => period.style === 'night')
    .flatMap((period) => Array.from({ length: period.to - period.from + 1 }, (_, index) => period.from + index)))
}

/** Une nuit a-t-elle commencé depuis le tour `since` — un premier tour de
 *  nuit (`nights`, cf. `nightTurnsOf`) après un tour de jour, jusqu'au tour
 *  `current` ? Ce qu'on a vu au tour `since` dure ainsi jusqu'à la nuit
 *  SUIVANTE : vu de nuit, le reste de cette nuit et le jour qui suit. */
export function nightSince(since, current, nights) {
  for (let next = since + 1; next <= current; next++) {
    if (nights.has(next) && !nights.has(next - 1)) return true
  }
  return false
}
