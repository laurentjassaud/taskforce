// ═══════════════════════════════════════════════════════════════════════════
// Règles du duel (deux joueurs en double aveugle, cf. `scenario.duel` du
// module) qui comparent les forces des DEUX camps : contact, reconnaissance,
// et ce que la nuit efface. Partagées par le jeu — partie sur un seul écran,
// cf. src/components/HexMap.vue — et par le serveur, qui les arbitre en
// ligne (cf. server/src/duel.js) : les positions adverses ne quittent alors
// jamais le serveur. JavaScript pur : ni Vue, ni i18n.
//
// ─── RÈGLES DE LA RECONNAISSANCE ────────────────────────────────────────────
// Réglages du scénario : `scenario.duel.recon` du module (cf.
// public/modules/coral-sea/coral-sea.json) — `role`, `range`, `zones`,
// `carriers`.
//
//  1. Porte-avions. Seules les task forces de rôle `role` ("carrier") font
//     des reconnaissances. Un camp n'en pose pas plus sur la carte que son
//     scénario n'a de porte-avions (`carriers[camp]` : Japonais 3,
//     Américains 2 — cf. HexMap.vue::canPlaceNow, server/src/duel.js::
//     allowsMove).
//  2. Hex de reco. Pendant sa phase de Reconnaissance, chaque porte-avions
//     du camp actif désigne jusqu'à `zones[camp]` hex de reco (Japonais 2,
//     Américains 3 : 3 × 2 et 2 × 3 hex au plus), chacun à `range` (8) hex
//     ou moins de lui (cf. `reconFits`).
//  3. Zone. Un hex de reco explore une zone de 7 hex : lui et ses 6 voisins
//     sur la carte (cf. `reconZone`).
//  4. Recouvrement. Un hex couvert par plusieurs zones n'appartient qu'à UNE
//     seule — celle dont l'hex de reco est le plus proche, à égalité la
//     première désignée (cf. `reconZones`) : jamais deux chits pour un hex.
//     La carte trace la limite de chaque zone.
//  5. Tirage. Un chit par zone, tiré de la tasse de recherche SANS remise
//     (cf. `drawChit`) ; à la fin de la phase de reco du joueur, tous les
//     chits y reviennent : chaque reconnaissance part d'une tasse pleine
//     (`SEARCH_CHITS` : 30 Detected, 12 Misdirect, 12 Contact Lost).
//  6. Résultat sur CHAQUE task force ennemie de la zone (cf. `sightingOf`) :
//     Detected, vue pour ce qu'elle est ("Sighted Carrier" pour un
//     porte-avions, "Sighted Fleet" sinon) ; Misdirect, pour ce qu'elle
//     n'est pas ; Contact Lost, rien.
//  7. Zone vide. Un Misdirect y fait tirer un second chit : s'il est encore
//     Misdirect, un faux pion — porte-avions ou flotte, à pile ou face — est
//     posé sur un hex de la zone tiré au hasard ; sinon, rien (cf.
//     `resolveRecon`). Jamais sur une task force ni à côté d'une task force,
//     de l'un ou l'autre camp : deux task forces adverses voisines sont au
//     contact (cf. `inContact`), un faux pion là serait aussitôt démasqué.
//     Aucun hex possible dans la zone : pas de faux pion.
//  8. Ce que voit chacun. Le chercheur ne voit que ses pions "Sighted" — ni
//     les chits, ni les task forces de ses zones. La cible apprend lesquelles
//     de ses task forces ont été survolées, et où (cf. server/src/duel.js::
//     recon).
// ═══════════════════════════════════════════════════════════════════════════

import { hexDistance, neighborsOf } from './hex.js'
import { hexId } from './calibration.js'

/** Phase de reconnaissance de la piste (id de `turnStructure.phases`). */
export const RECON_PHASE = 'reconnaissance'

/** Tasse de recherche pleine : nombre de chits par résultat. Partagée avec
 *  la tasse des parties contre l'IA (cf. src/lib/useCoralSea.js). */
export const SEARCH_CHITS = { detected: 30, misdirect: 12, contactLost: 12 }

/** Tire un chit de la tasse `bag` (`{ résultat: nombre }`, cf.
 *  `SEARCH_CHITS`), SANS remise : le chit tiré en est retiré. Clé du chit,
 *  ou `null` si la tasse est vide. `random` : tirage dans [0, 1[. */
export function drawChit(bag, random = Math.random) {
  const total = Object.values(bag).reduce((sum, count) => sum + count, 0)
  if (!total) return null
  let pick = Math.floor(random() * total)
  const chit = Object.keys(bag).find((key) => (pick -= bag[key]) < 0)
  bag[chit] -= 1
  return chit
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
 *  sur la carte (`onMap(col, row)`) — règle 3. */
export function reconZone(center, onMap) {
  return [center, ...neighborsOf(center.col, center.row)].filter((hex) => onMap(hex.col, hex.row))
}

/** Zones des hex de reco `centers`, dans leur ordre (`[[{ col, row }]]`),
 *  sans recouvrement — règle 4 : un hex couvert par plusieurs zones va à
 *  celle dont l'hex de reco est le plus proche, à égalité à la première
 *  désignée. Chaque hex de reco reste dans sa propre zone. */
export function reconZones(centers, onMap) {
  const owners = new Map() // "col,row" -> { zone, distance, hex }
  centers.forEach((center, zone) => {
    for (const hex of reconZone(center, onMap)) {
      const key = `${hex.col},${hex.row}`
      const distance = hexDistance(center, hex)
      if (!owners.has(key) || distance < owners.get(key).distance) owners.set(key, { zone, distance, hex })
    }
  })
  const zones = centers.map(() => [])
  for (const { zone, hex } of owners.values()) zones[zone].push({ col: hex.col, row: hex.row })
  return zones
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

/** Résultat d'une reconnaissance (règles 4 à 7) : un chit par hex de reco
 *  de `centers`, tiré pour sa zone (cf. `reconZones`, sans recouvrement)
 *  sur les task forces ennemies `enemies` (`{ id, col, row, role, faction
 *  }`) qui s'y trouvent, d'une tasse pleine vidée au fil des tirages.
 *  Detected : chaque task force vue pour ce qu'elle est ; Misdirect, pour
 *  ce qu'elle n'est pas — dans une zone vide, un second chit, et s'il est
 *  encore Misdirect, un faux pion porte-avions ou flotte à pile ou face,
 *  sur un hex de la zone (aux couleurs de `enemyFaction`) ni occupé ni
 *  voisin d'une task force — des `enemies` comme des `friends`, celles du
 *  chercheur (`{ col, row }`) ; Contact Lost : rien. Une zone par hex de
 *  reco : `{ hex, col, row, fleets, chit, redraw?, sightings: [{ col, row,
 *  sighted, faction }] }` — `fleets`, ids des task forces ennemies qui s'y
 *  trouvent ; `redraw`, le second chit d'une zone vide. */
export function resolveRecon({ centers, enemies, friends = [], enemyFaction, onMap, random = Math.random }) {
  const bag = { ...SEARCH_CHITS }
  const areas = reconZones(centers, onMap)
  // Hex d'un faux pion : ni sur une task force, ni à côté (règle 7).
  const taskForces = [...enemies, ...friends]
  const fakeAllowed = (hex) => !taskForces.some((taskForce) => hexDistance(taskForce, hex) <= 1)
  return centers.map((center, index) => {
    const area = areas[index]
    const fleets = enemies.filter((enemy) => area.some((hex) => hex.col === enemy.col && hex.row === enemy.row))
    const chit = drawChit(bag, random)
    const sightings = fleets.map((fleet) => ({ col: fleet.col, row: fleet.row, sighted: sightingOf(chit, fleet.role), faction: fleet.faction ?? enemyFaction }))
      .filter((sighting) => sighting.sighted)
    const zone = { hex: hexId(center.col + 1, center.row), col: center.col, row: center.row,
      fleets: fleets.map((fleet) => String(fleet.id)), chit, sightings }
    if (!fleets.length && chit === 'misdirect') {
      zone.redraw = drawChit(bag, random)
      const free = area.filter(fakeAllowed)
      if (zone.redraw === 'misdirect' && free.length) {
        const sighted = random() < 0.5 ? 'carrierTF' : 'fleetTF'
        const hex = free[Math.floor(random() * free.length)]
        sightings.push({ col: hex.col, row: hex.row, sighted, faction: enemyFaction })
      }
    }
    return zone
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
