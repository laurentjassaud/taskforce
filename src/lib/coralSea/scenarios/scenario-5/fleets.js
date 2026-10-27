// ═══════════════════════════════════════════════════════════════════════════
// Scénario 5 — CONSTITUTION DES FLOTTES japonaises (moteur `fleets`, cf.
// ../index.js)
// ═══════════════════════════════════════════════════════════════════════════
//
// FORMATION JAPONAISE : au coup d'envoi, sans intervention humaine, l'appli
// tire à chances égales une des formations du scénario (`formations.ijn`,
// cf. coral-sea.json et `drawFormation`) : deux groupements fixes, ou un
// groupement ALÉATOIRE composé selon sa règle (cf. `composeRandomFormation`
// — chaque CV avec 2 CA + 1 DD, le CVL avec 2 DD, les AK par 2 ou 3 avec 1
// DD chacun, le reste en 2 groupes). Chaque task force prend un comportement
// d'après ses navires (cf. `behaviorOfShips`), que lit le moteur de
// déplacement (cf. ./movement.js). Les navires viennent du catalogue de la
// flotte (cf. lib/moduleLoader.js) ; sans lui, l'ancien tirage (TF1, TF2,
// TF3, TF7, TF8, TF10) s'applique.
//
// IDENTITÉ SECRÈTE DES LEURRES JAPONAIS : chaque task force de la formation
// est portée en secret par un des 12 leurres, tiré au hasard. Les autres
// (12 moins le nombre de task forces) sont de vrais leurres, dont chacun se
// déplace, à pile ou face, comme une task force normale ou comme un
// transport (pour ne pas se trahir par son allure, cf. ./movement.js).
// Ce tirage est inscrit dans l'entrée `setup` du journal (cf.
// lib/useCoralSea.js::setupSecrets) : il survit au rejeu et est commun à
// tous les joueurs en ligne.
import { CARRIER_TYPES, expandShips, shuffle } from '../../shared.js'

/** Task forces portées en secret par un leurre quand le scénario ne déclare
 *  pas de formations, ou que le catalogue de navires manque — et rôles d'un
 *  journal antérieur aux formations (cf. lib/useCoralSea.js::taskForceRole). */
export const legacyTaskForces = [
  { tf: 'ijn-tf1', code: 'TF1', movement: 'normal', behavior: 'carrier' },
  { tf: 'ijn-tf2', code: 'TF2', movement: 'normal', behavior: 'carrier' },
  { tf: 'ijn-tf3', code: 'TF3', movement: 'normal', behavior: 'carrier' },
  { tf: 'ijn-tf7', code: 'TF7', movement: 'transport', behavior: 'transport' },
  { tf: 'ijn-tf8', code: 'TF8', movement: 'transport', behavior: 'transport' },
  { tf: 'ijn-tf10', code: 'TF10', movement: 'transport', behavior: 'transport' },
]

/** Comportement d'une task force d'après ses navires (`typeOf(id)` : type
 *  du catalogue, CV, CVL, CA, CL, DD, AK) :
 *   - 'carrier' : un CV ou un CVL — elle attaque ;
 *   - 'transport' : des AK — allure de transport, à l'écart des Alliés ;
 *   - 'destroyers' : rien que des DD — vers les TF alliées non repérées ;
 *   - 'surface' : les autres — vers les TF alliées repérées. */
function behaviorOfShips(ships, typeOf) {
  const types = ships.map(typeOf)
  if (types.some((type) => CARRIER_TYPES.has(type))) return 'carrier'
  if (types.includes('AK')) return 'transport'
  if (types.length && types.every((type) => type === 'DD')) return 'destroyers'
  return 'surface'
}

/** Découpages de `total` en groupes dont la taille est dans `sizes` (ex. 6
 *  en [2, 2, 2] ou [3, 3]), chacun trié. */
function partitions(total, sizes) {
  if (total === 0) return [[]]
  const sorted = [...sizes].sort((a, b) => a - b)
  return sorted.filter((size) => size <= total)
    .flatMap((size) => partitions(total - size, sorted.filter((other) => other >= size)).map((rest) => [size, ...rest]))
}

/** Formation ALÉATOIRE (`random` d'une formation, cf. coral-sea.json),
 *  composée à partir des navires de l'ordre de bataille (`pool`) :
 *   - chaque CV avec `carrierEscort` (2 CA + 1 DD), chaque CVL avec
 *     `lightCarrierEscort` (2 DD), pris au hasard ;
 *   - les AK en groupes de `transportGroupSizes` (2 ou 3 — découpage tiré au
 *     hasard parmi les possibles), chacun avec `transportEscort` (1 DD) ;
 *   - le reste, mélangé et partagé en `remainderGroups` groupes équilibrés.
 *  Les navires `spare` (le DD isolé) n'escortent personne et vont au reste —
 *  sauf s'il ne reste plus d'autre DD pour un groupe d'AK.
 *  Porte-avions (CV puis CVL) -> `carrierTaskForces`, dans l'ordre ; groupes
 *  d'AK puis le reste -> `fleetTaskForces`. Task force -> ids des navires. */
function composeRandomFormation(rule, pool, typeOf) {
  const spare = new Set(rule.spare ?? [])
  const left = shuffle(pool)
  const take = (type, count, spareToo) => {
    const out = []
    while (out.length < count) {
      let index = left.findIndex((id) => typeOf(id) === type && !spare.has(id))
      if (index === -1 && spareToo) index = left.findIndex((id) => typeOf(id) === type)
      if (index === -1) break
      out.push(...left.splice(index, 1))
    }
    return out
  }
  const escort = (spec, spareToo = false) => Object.entries(spec ?? {}).flatMap(([type, count]) => take(type, count, spareToo))
  const carriers = []
  for (const [type, spec] of [['CV', rule.carrierEscort], ['CVL', rule.lightCarrierEscort]]) {
    for (const ship of pool.filter((id) => typeOf(id) === type)) {
      left.splice(left.indexOf(ship), 1)
      carriers.push([ship, ...escort(spec)])
    }
  }
  const transports = left.filter((id) => typeOf(id) === 'AK')
  for (const ship of transports) left.splice(left.indexOf(ship), 1)
  const splits = partitions(transports.length, rule.transportGroupSizes ?? [transports.length])
  const sizes = splits.length ? splits[Math.floor(Math.random() * splits.length)] : [transports.length]
  const fleets = []
  let start = 0
  for (const size of sizes.filter(Boolean)) {
    fleets.push([...transports.slice(start, start += size), ...escort(rule.transportEscort, true)])
  }
  const rest = shuffle(left)
  const groups = Math.min(rule.remainderGroups ?? 1, rest.length)
  for (let group = 0; group < groups; group++) fleets.push(rest.filter((_, index) => index % groups === group))
  const taskForces = {}
  carriers.forEach((ships, index) => { if (rule.carrierTaskForces?.[index]) taskForces[rule.carrierTaskForces[index]] = ships })
  fleets.forEach((ships, index) => { if (rule.fleetTaskForces?.[index]) taskForces[rule.fleetTaskForces[index]] = ships })
  return taskForces
}

/** Formation des task forces japonaises, tirée au hasard (à chances égales)
 *  parmi celles du scénario (`formations.ijn`, cf. coral-sea.json) : `{ id,
 *  taskForces }` (task force -> ids de ses navires) et `typeOf` (id de
 *  navire -> type), ou `null` sans formations ou sans catalogue (cf.
 *  lib/moduleLoader.js). */
function drawFormation(scenario, fleets) {
  const options = scenario?.formations?.ijn
  const catalog = fleets?.ijn?.ships
  if (!options?.length || !catalog) return null
  const types = new Map(catalog.map((ship) => [ship.id, ship.type]))
  const typeOf = (id) => types.get(id) ?? null
  const choice = options[Math.floor(Math.random() * options.length)]
  const taskForces = choice.random
    ? composeRandomFormation(choice.random, (scenario.orderOfBattle?.ijn ?? []).flatMap((group) => expandShips(group.ships)), typeOf)
    : Object.fromEntries(Object.entries(choice.taskForces ?? {}).map(([tf, list]) => [tf, expandShips(list)]))
  return { id: choice.id, taskForces, typeOf }
}

/** Task forces que portent les leurres pour la formation `formation` :
 *  `{ tf, code, movement, behavior, ships }` (`code` lu sur le pion de la
 *  task force), ou l'ancien tirage sans formation. */
function hiddenTaskForces(formation, allCounters) {
  if (!formation) return legacyTaskForces
  return Object.entries(formation.taskForces).map(([tf, ships]) => {
    const behavior = behaviorOfShips(ships, formation.typeOf)
    const code = allCounters.find((counter) => String(counter.id) === tf)?.code ?? tf
    return { tf, code, movement: behavior === 'transport' ? 'transport' : 'normal', behavior, ships }
  })
}

/** Constitution des flottes au coup d'envoi : la formation tirée, et le rôle
 *  secret de chacun des leurres `dummyIds` — `{ formationId, roles }`, rôle :
 *  `{ tf, code, movement, behavior, ships }` pour ceux qui portent une task
 *  force, `{ tf: null, code: null, movement }` pour les vrais leurres. */
export function composeFleets({ scenario, fleets, allCounters, dummyIds }) {
  const formation = drawFormation(scenario, fleets)
  const hidden = hiddenTaskForces(formation, allCounters)
  const roles = {}
  shuffle(dummyIds).forEach((id, index) => {
    roles[id] = hidden[index] ?? { tf: null, code: null, movement: Math.random() < 0.5 ? 'normal' : 'transport' }
  })
  return { formationId: formation?.id ?? null, roles }
}
