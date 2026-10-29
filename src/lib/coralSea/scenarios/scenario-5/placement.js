// ═══════════════════════════════════════════════════════════════════════════
// Scénario 5 — PLACEMENT (moteur `placement`, cf. ../index.js)
// ═══════════════════════════════════════════════════════════════════════════
//
// DÉPLOIEMENT : seuls les 12 leurres (Dummy) japonais sont sur la carte au
// coup d'envoi, tirés au hasard dans leur plage `setup` (bord haut,
// 0601-2801, cf. coral-sea.json). Tous les autres pions partent du panneau
// latéral.
//
// GROUPES : chaque leurre porteur d'une task force reçoit un leurre
// d'escorte, porte-avions d'abord, tant qu'il reste de vrais leurres, posé
// sur un hex adjacent de la zone de départ ; les vrais leurres restants
// forment un faux groupe, posé au hasard, les autres adjacents au premier
// (cf. `drawGroups`, `arrangeInitialPositions`). Un suiveur suit son meneur
// en restant adjacent, à SON allure (cf. lib/useCoralSea.js::followTarget,
// isTransport, et HexMap.vue::moveFollower) ; si le meneur disparaît, il
// reprend son hex-objectif.
//
// HEX-OBJECTIF : chaque MENEUR (leurre porteur, tête du faux couple) reçoit
// au coup d'envoi une destination tirée au hasard parmi les hex d'arrivée
// japonais (`terrain.ijnArrivalHexes`, cf. coral-sea.json) ; les task forces
// de porte-avions, des hex proches les uns des autres (cf.
// `drawObjectives`). À chaque phase de Mouvement japonaise, le moteur les
// rapproche de cet objectif, sauf quand le moteur de déplacement en décide
// autrement (cf. ./movement.js). Tirés avec l'identité des leurres, groupes
// et objectifs sont inscrits au journal de la même façon.
//
// MISE EN PLACE US : le joueur pose 12 task forces, leurres compris (cf.
// `setupTotal`) — moins, il confirme qu'il commence quand même ; plus, il ne
// peut pas commencer.
//
// RENFORT DE LEURRES : au premier tour de chaque nuit (tours 11 et 23,
// `dummyReinforcement` de la piste), juste avant que les repérages ne
// tombent, les leurres japonais éliminés reviennent pour ramener à 12 les
// task forces japonaises sur la carte — sur les porte-avions repérés,
// sinon les flottes repérées, sinon au hasard (cf. `planDummyReinforcement`)
// : chacun posé SUR l'hex de l'unité qu'il suivra désormais, puis tous
// bougent (le suiveur s'en écarte à son mouvement). Aux mêmes tours, le
// joueur US peut lui aussi poser des leurres, AVANT de bouger quoi que ce
// soit dans sa phase de Mouvement : chacun sur l'hex d'une de ses task
// forces, jusqu'à 12 task forces américaines (leurres compris) sur la carte
// (cf. `playerDummyReinforcement`).
import { hexDistance } from '../../../hex.js'
import { hexOfId, isDummy, isIjnTaskForce, shuffle } from '../../shared.js'

/** Task forces de chaque camp, leurres compris : celles que pose le joueur
 *  US à sa mise en place, et le total que rétablissent les renforts de
 *  leurres. */
export const setupTotal = 12

/** Rayon dans lequel sont tirés les hex-objectifs des porte-avions (cf.
 *  `drawObjectives`). */
const GROUPED_RADIUS = 5

/** Ce pion est-il posé sur la carte au chargement ? Les leurres japonais. */
export function deploysAtLoad(counter) {
  return isDummy(counter)
}

/** Groupes de départ, d'après les rôles secrets des leurres (`roles`) et le
 *  comportement de chaque task force (`behaviorOf(tf)`) : chaque leurre qui
 *  porte une task force reçoit un leurre d'escorte, porte-avions d'abord,
 *  tant qu'il en reste ; les leurres restants forment un faux couple (le
 *  premier mène, les autres le suivent). Suiveur id -> meneur id. */
export function drawGroups(roles, behaviorOf) {
  const plain = shuffle(Object.keys(roles).filter((id) => !roles[id].tf))
  const leaders = {}
  const carried = Object.keys(roles).filter((id) => roles[id].tf)
  const isCarrier = (id) => behaviorOf(roles[id].tf) === 'carrier'
  for (const id of [...carried.filter(isCarrier), ...carried.filter((id) => !isCarrier(id))]) {
    const escort = plain.shift()
    if (escort) leaders[escort] = id
  }
  const [pairLeader, ...others] = plain
  for (const id of others) leaders[id] = pairLeader
  return leaders
}

/** Hex-objectifs des meneurs `counterIds` (task forces japonaises sans
 *  meneur) : id -> id d'hex "CCRR", tirés parmi les hex d'arrivée
 *  `arrivalHexes`, tous différents tant qu'il y en a assez. Les task forces
 *  de porte-avions (`behaviorOf(tf)` 'carrier' — un leurre qui en porte une,
 *  d'après `roles`, comme le vrai pion) reçoivent des hex GROUPÉS : un hex
 *  d'arrivée tiré au hasard sert de centre, chacune un hex d'arrivée à 5 hex
 *  ou moins de lui (cf. `GROUPED_RADIUS`). */
export function drawObjectives({ counterIds, roles, behaviorOf, arrivalHexes }) {
  const objectives = {}
  if (!arrivalHexes?.length) return objectives
  let pool = []
  for (const id of counterIds) {
    if (!pool.length) pool = shuffle(arrivalHexes)
    objectives[id] = pool.pop()
  }
  const center = hexOfId(arrivalHexes[Math.floor(Math.random() * arrivalHexes.length)])
  const carriers = counterIds.filter((id) => behaviorOf(roles[id]?.tf ?? id) === 'carrier')
  // Jamais deux task forces sur le même hex-objectif : ni entre elles, ni
  // avec un objectif déjà tiré pour une autre (tant qu'il reste de quoi).
  const taken = new Set(counterIds.filter((id) => !carriers.includes(id)).map((id) => objectives[id]))
  const near = arrivalHexes.filter((id) => hexDistance(hexOfId(id), center) <= GROUPED_RADIUS)
  const free = shuffle(near.filter((id) => !taken.has(id)))
  const nearPool = free.length >= carriers.length ? free : shuffle(near)
  carriers.forEach((id, index) => { objectives[id] = nearPool[index % nearPool.length] })
  return objectives
}

/** Placement initial des groupes : chaque suiveur posé (`placed`, pions
 *  déjà tirés dans leur plage, modifiés sur place) va sur un hex adjacent à
 *  son meneur (`leaders` : suiveur id -> meneur id), au hasard parmi
 *  `adjacentHexes(pion, col, row)`, de préférence libre. */
export function arrangeInitialPositions(placed, adjacentHexes, leaders) {
  const byId = new Map(placed.map((counter) => [String(counter.id), counter]))
  for (const [followerId, leaderId] of Object.entries(leaders)) {
    const follower = byId.get(followerId)
    const leader = byId.get(leaderId)
    if (!follower || !leader) continue
    const around = adjacentHexes(follower, leader.col, leader.row)
    const free = around.filter((hex) => !placed.some((other) => other !== follower && other.col === hex.col && other.row === hex.row))
    const pool = free.length ? free : around
    if (!pool.length) continue
    const hex = pool[Math.floor(Math.random() * pool.length)]
    follower.col = hex.col
    follower.row = hex.row
  }
}

/** Renfort de leurres japonais : de quoi ramener à `setupTotal` les task
 *  forces japonaises sur la carte (`counters`), en reprenant les leurres
 *  éliminés (`freeDummyIds`). Où les poser, d'après les repérages alliés du
 *  jour (`sightings`, id -> état de repérage), avant qu'ils ne tombent :
 *    1. sur les hex des unités vues comme porte-avions ;
 *    2. sinon, sur ceux des unités vues comme flottes ;
 *    3. sinon, au hasard parmi les task forces japonaises.
 *  Répartis à tour de rôle entre les unités retenues, chacun SUR l'hex de
 *  l'unité qu'il SUIVRA désormais (pas d'hex-objectif à lui) : il s'en
 *  écarte au mouvement qui suit. Chaque leurre posé est un vrai leurre.
 *  `{ placements: [{ id, col, row }], roles, leaders }`, ou `null` s'il
 *  n'y a rien à poser. */
export function planDummyReinforcement({ counters, sightings, freeDummyIds }) {
  const onMap = counters.filter(isIjnTaskForce)
  const missing = Math.min(setupTotal - onMap.length, freeDummyIds.length)
  if (missing <= 0) return null
  const seenAs = (sighting) => onMap.filter((counter) => sightings.get(String(counter.id)) === sighting)
  const anchors = shuffle([seenAs('carrierTF'), seenAs('fleetTF'), onMap].find((list) => list.length) ?? [])
  if (!anchors.length) return null
  const ids = freeDummyIds.slice(0, missing)
  const anchorOf = (index) => anchors[index % anchors.length]
  return {
    placements: ids.map((id, index) => ({ id, col: anchorOf(index).col, row: anchorOf(index).row })),
    roles: Object.fromEntries(ids.map((id) => [id, { tf: null, code: null, movement: 'normal' }])),
    leaders: Object.fromEntries(ids.map((id, index) => [id, String(anchorOf(index).id)])),
  }
}

/** Renfort de leurres du JOUEUR US : si `counter` est le leurre américain
 *  (pion en nombre illimité du panneau), `{ total, anchors }` — il se pose
 *  sur l'hex d'une task force américaine (`anchors(pion)`), tant qu'il y en
 *  a moins de `total` sur la carte, leurres compris. `null` sinon. */
export function playerDummyReinforcement(counter) {
  if (counter?.code !== 'Dummy' || counter.faction !== 'usn') return null
  return { total: setupTotal, anchors: (other) => other.faction === 'usn' && other.type === 'task force' }
}
