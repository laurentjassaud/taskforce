// ═══════════════════════════════════════════════════════════════════════════
// useCoralSea — règles PARTICULIÈRES au module "coral-sea"
// ═══════════════════════════════════════════════════════════════════════════
//
// Patron des règles particulières (cf. lib/moduleRules.js) : convention
// `null` = "pas de règle particulière", composable INERTE sur tout autre
// module.
//
// Bataille de la mer de Corail (7-8 mai 1942) : seuls les 12 leurres (Dummy)
// japonais sont sur la carte au coup d'envoi. Les Américains posent ensuite
// leurs task forces et autant de leurres qu'ils veulent pendant leur mise en
// place (`turnTrack.setup`, avant le tour 1). Task forces et marqueurs de
// recherche (Detected!, Contact Lost, Misdirect) attendent tous dans le
// panneau latéral, d'où les joueurs les posent sur la carte (zone d'entrée
// IJN en haut de la carte ; USN n'importe où, à la mise en place).
//
// FORMATION JAPONAISE : au coup d'envoi, sans intervention humaine, l'appli
// tire à chances égales une des formations du scénario (`formations.ijn`,
// cf. coral-sea.json et `drawFormation`) : deux groupements fixes, ou un
// groupement ALÉATOIRE composé selon sa règle (cf. `composeRandomFormation`
// — chaque CV avec 2 CA + 1 DD, le CVL avec 2 DD, les AK par 2 ou 3 avec 1
// DD chacun, le reste en 2 groupes). Chaque task force prend un comportement
// d'après ses navires (cf. `behaviorOfShips`, `movementPlan`). Les navires
// viennent du catalogue de la flotte (cf. lib/moduleLoader.js) ; sans lui,
// l'ancien tirage (TF1, TF2, TF3, TF7, TF8, TF10) s'applique.
//
// IDENTITÉ SECRÈTE DES LEURRES JAPONAIS : chaque task force de la formation
// est portée en secret par un des 12 leurres, tiré au hasard. Les autres
// (12 moins le nombre de task forces) sont de vrais leurres, dont chacun se
// déplace, à pile ou face, comme une task force normale ou comme un
// transport (pour ne pas se trahir par son allure). Allures (cf.
// `movementAllowance`) :
//   - normale : celle de la piste de tour (2 hex de nuit, 1 de jour) ;
//   - transport (AK) : 1 hex de nuit, 1 hex aux tours de jour impairs, 0
//     aux tours de jour pairs — exactement les tours où la piste coche
//     "Mouvement AK" (`turnInfo.conditions.akMovement`, cf. coral-sea.json).
// Ce tirage est inscrit dans l'entrée `setup` du journal (cf. `setupSecrets`
// et HexMap.vue::logDeploymentOnce/startSharedJournal) : il survit donc au
// rejeu et est commun à tous les joueurs en ligne.
//
// GROUPES : chaque leurre porteur d'une task force reçoit un leurre
// d'escorte, porte-avions d'abord, tant qu'il reste de vrais leurres, posé
// sur un hex adjacent de la zone de départ ; les vrais leurres restants
// forment un faux groupe, posé au hasard, les autres adjacents au premier
// (cf. `drawLeaders`, `arrangeInitialPositions`). Un suiveur suit son
// meneur en restant adjacent, à SON allure (cf. `followTarget`,
// `isTransport`) ; si le meneur disparaît, il reprend son hex-objectif.
//
// MOUVEMENTS PARTICULIERS (cf. `movementPlan`), qui REMPLACENT la marche
// vers l'hex-objectif, selon les navires de la task force : avec des AK,
// elle reste à plus de 6 hex de toute TF alliée repérée ; avec un CV ou un
// CVL, elle fonce à 5 hex d'une TF alliée vue comme porte-avions (les
// porte-avions s'attendent à 6 hex, 2 tours au plus), et, sans porte-avions
// allié repéré, s'écarte à plus de 6 hex de toute unité alliée dès qu'elle
// est elle-même repérée ; rien que des DD, elle va vers la TF alliée non
// repérée la plus proche ; les autres vont vers la TF alliée repérée la
// plus proche. Leurs suiveurs suivent. Ces règles forment un ARBRE DE
// DÉCISION, décrit en données dans lib/ai/coralSeaTrees.js, sur ce que sait
// le Japonais (cf. lib/ai/coralSeaPerception.js).
//
// HEX-OBJECTIF : chaque MENEUR (leurre porteur, tête du faux couple) reçoit
// au coup d'envoi une destination tirée au hasard parmi les hex d'arrivée
// japonais (`terrain.ijnArrivalHexes`, cf. coral-sea.json). À chaque phase
// de Mouvement japonaise, le moteur les rapproche automatiquement de cet
// objectif, puis les suiveurs les rejoignent (cf. `autoMoveTarget` et
// HexMap.vue::runAutoMoves). Tirés avec l'identité des leurres, groupes et
// objectifs sont inscrits au journal de la même façon.
//
// RECONNAISSANCE JAPONAISE : pendant la phase de Reconnaissance du camp
// japonais (joué par le moteur), chaque SOURCE fait UN check, et un seul :
// les bases aériennes japonaises (Rabaul 0506, Buka 1004, Gasmata 0510, Lae
// 0115) et les task forces de porte-avions japonaises sur la carte (`role`
// "carrier", cf. coral-sea.json — vrais pions, ou leurres qui les portent en
// secret). Chacune explore UN hex parmi ceux, à 8 hex ou moins d'elle, où se
// trouve une task force ou un leurre allié pas encore exploré (cf.
// `reconChecks` et HexMap.vue::continueEngineRecon) — un porte-avions qui a
// trois leurres à portée n'en explore qu'un. Lequel, et quelle source joue
// d'abord, c'est l'arbre de décision du repérage qui le choisit (cf.
// `reconChoice`, lib/ai/coralSeaTrees.js::reconTree). Et
// seulement un hex COUVERT : assez d'unités japonaises (task forces,
// leurres et bases) à 8 hex ou moins de lui — 4 avec 12 task forces et
// leurres japonais en jeu, 3 de 8 à 11, 2 de 4 à 7, 1 en dessous (cf.
// `ijnCoverageFilter`). Les sources
// jouent une par une, dans l'ordre que choisit l'arbre ; pour chacune, le
// joueur ouvre le rapport (clic droit sur l'unité) et un chit est tiré de
// la tasse de recherche (cf. `drawSearch`) : 30 Detected!, 12 Misdirect,
// 12 Contact Lost. Les chits tirés ne retournent pas dans la tasse : elle
// n'est remplie à nouveau qu'aux tours "Tous rendus" de la piste
// (`turnInfo.conditions.reconChits`, les tours de nuit), où les marqueurs
// quittent la carte et les task forces repérées redeviennent de simples
// drapeaux.
//
// RECONNAISSANCE ALLIÉE (camp du joueur, `manualReconSide`) : le joueur
// clique une task force de porte-avions alliée (`role` "carrier"), puis
// jusqu'à 2 hex DIFFÉRENTS à 8 hex ou moins d'elle où se trouve une task
// force ou un leurre japonais. Pas de base alliée dans ce scénario. Même
// tasse et mêmes résultats, mais le chit tiré lui reste caché : un pion
// "Search" générique est posé à la place, et un toast lui dit ce qu'il a vu.
// Un leurre japonais qui porte en secret une task force est jugé comme
// elle (cf. `roleOf`).
//
// RÉSULTAT D'UNE RECHERCHE (cf. `searchOutcome`) : chaque chit donne à
// l'unité explorée un ÉTAT DE REPÉRAGE, selon ce qu'elle est vraiment —
// leurre, task force de porte-avions ou de flotte (`role` des task forces,
// cf. coral-sea.json) :
//   - Contact Lost : "no contact", quelle que soit l'unité ;
//   - Misdirect : "no contact" sur un leurre ; sur une task force, elle est
//     prise pour l'autre sorte (porte-avions vu comme flotte, et
//     inversement), avec un pion "Sighted" de ce qu'on a cru voir ;
//   - Detected! : un leurre est démasqué ("no TF") et retiré du jeu ; une
//     task force est vue pour ce qu'elle est, avec son pion "Sighted".
// Sur la carte, les leurres sont des drapeaux de flotte ; le pion "Sighted"
// REMPLACE à l'affichage l'image de l'unité repérée, leurre ou task force —
// sauf les vraies task forces alliées, qui gardent leur pion et empilent
// tous les pions de repérage posés sur elles, chacun avec son tour de pose
// au survol (cf. HexMap.vue::keepsOwnLook, unitSrc).
//
// RENFORT DE LEURRES : au premier tour de chaque nuit (tours 11 et 23,
// `dummyReinforcement` de la piste), juste avant que les repérages ne
// tombent, les leurres japonais éliminés reviennent pour ramener à 12 les
// task forces japonaises sur la carte — sur les porte-avions repérés,
// sinon les flottes repérées, sinon au hasard (cf.
// `planDummyReinforcement`) : chacun posé SUR l'hex de l'unité qu'il
// suivra désormais, puis tous bougent (le suiveur s'en écarte à son
// mouvement, cf. HexMap.vue::runAutoMoves).
//
// MISE EN PLACE US : le joueur pose 12 task forces, leurres compris (cf.
// `setupCount`) — moins, il confirme qu'il commence quand même ; plus, il
// ne peut pas commencer. Il peut les empiler, pendant la mise en place comme
// pendant ses mouvements (`rules.stackingLimit` du module : aucune limite,
// pour aucun camp — les task forces japonaises s'empilent aussi, ce qui
// laisse le moteur les déplacer sans qu'elles se bloquent entre elles).
//
// Aux mêmes tours, le joueur US peut lui aussi poser des leurres, AVANT de
// bouger quoi que ce soit dans sa phase de Mouvement : chacun sur l'hex d'une
// de ses task forces, jusqu'à 12 task forces américaines (leurres compris)
// sur la carte ; puis il fait son mouvement (cf.
// `playerDummyReinforcement`).
//
// SUPPORT DE TASK FORCE (cf. `fleetDisplay`, FleetDisplayModal.vue) :
// pendant SA phase d'Opérations aériennes, le joueur US clique une task
// force japonaise repérée ("Sighted Carrier" ou "Sighted Fleet") pour voir
// ses navires posés sur leur support, d'après ce qu'elle est VRAIMENT :
// avec un porte-avions (CV, CVL), celui-ci au centre du support "Carrier TF"
// et ses escortes au hasard dans les 4 cases autour ; sinon, ses navires
// dans l'ordre d'un tirage au hasard sur les cases 1, 2, 3... du support
// "Fleet TF". La disposition, tirée à la première ouverture, ne change plus
// de la partie.
//
// Un porte-avions repéré COMME porte-avions ("Sighted Carrier" sur un vrai
// porte-avions) n'a plus rien à cacher : il cherche sans règle de
// couverture.
//
// Le Japonais ne revient pas sur une task force alliée déjà repérée
// ("Sighted Carrier" ou "Sighted Fleet") tant qu'une source a à portée une
// autre unité alliée non repérée.
import { computed, ref, unref } from 'vue'
import { INERT_RULES } from './moduleRules.js'
import { hexDistance } from './hex.js'
import { resolveAirStrikeTable, strikeOdds } from './airStrike.js'
import { decide } from './ai/decisionTree.js'
import { perceiveTaskForce, perceiveReconTarget } from './ai/coralSeaPerception.js'
import { movementTree, movementTests, movementActions, reconTree, reconTests } from './ai/coralSeaTrees.js'

export const CORAL_SEA_MODULE_ID = 'coral-sea'

/** Bases aériennes japonaises d'où partent les reconnaissances, rayon
 *  d'action en hex, et porte-avions qui en lancent aussi. */
const RECON_BASES = { '0506': 'Rabaul', '1004': 'Buka', '0510': 'Gasmata', '0115': 'Lae' }
const RECON_RANGE = 8
/** Hex que chaque source explore par phase. */
const BASE_CHECKS = 1
const CARRIER_CHECKS = { ijn: 1, usn: 2 }
const ENEMY = { ijn: 'usn', usn: 'ijn' }
/** Couverture des reconnaissances japonaises : `[task forces japonaises en
 *  jeu au moins, unités japonaises requises à 8 hex de l'hex exploré]`, du
 *  plus grand au plus petit (cf. `ijnCoverageFilter`). */
const COVERAGE_THRESHOLDS = [[12, 4], [8, 3], [4, 2], [1, 1]]
const RECON_PHASE = 'reconnaissance'
/** Raids aériens japonais (cf. `raidPlan`) : phase, task forces qui en
 *  lancent, rayon d'action, et pion posé sur la cible pour chacune. */
const RAID_PHASE = 'airOperations'
const RAID_RADIUS = 5
const RAID_MARKERS = {
  'ijn-tf1': { name: 'Raid TF1', src: '/modules/coral-sea/images/counters/markers/Marker_Raid-IJN-TF1.png' },
  'ijn-tf2': { name: 'Raid TF2', src: '/modules/coral-sea/images/counters/markers/Marker_Raid-IJN-TF2.png' },
  'ijn-tf3': { name: 'Raid TF3', src: '/modules/coral-sea/images/counters/markers/Marker_Raid-IJN-TF3.png' },
}
/** Supports de task force (cf. `fleetDisplay`) : image, taille en px, et
 *  cases où poser les navires, en px de l'image. "Carrier TF" : la case du
 *  porte-avions et les 4 cases d'escorte autour (haut, gauche, droite,
 *  bas) ; "Fleet TF" : les cases numérotées 1 à 9. */
const DISPLAYS = '/modules/coral-sea/images/displays/'
export const FLEET_DISPLAYS = {
  carrier: {
    src: `${DISPLAYS}carrier-tf.png`, width: 667, height: 699,
    carrier: { x: 237, y: 468, w: 201, h: 100 },
    escorts: [
      { x: 237, y: 360, w: 201, h: 101 },
      { x: 28, y: 468, w: 201, h: 100 },
      { x: 446, y: 468, w: 201, h: 100 },
      { x: 237, y: 576, w: 201, h: 100 },
    ],
  },
  fleet: {
    src: `${DISPLAYS}fleet-tf.png`, width: 1970, height: 130,
    slots: Array.from({ length: 9 }, (_, index) => ({ x: 117 + index * 204, y: 15, w: 203, h: 100 })),
  },
}
const FLEET_DISPLAY_PHASE = 'airOperations'

const hexOfId = (id) => ({ col: Number(id.slice(0, 2)) - 1, row: Number(id.slice(2)) })

/** Tasse de recherche pleine : nombre de chits par résultat, et pion posé
 *  sur l'hex exploré pour chacun. */
const SEARCH_CHITS = { detected: 30, misdirect: 12, contactLost: 12 }
export const SEARCH_RESULTS = {
  detected: { name: 'Detected!', src: '/modules/coral-sea/images/counters/markers/Marker_Detected.png' },
  misdirect: { name: 'Misdirect', src: '/modules/coral-sea/images/counters/markers/Marker_Misdirect.png' },
  contactLost: { name: 'Contact Lost', src: '/modules/coral-sea/images/counters/markers/Marker_Contact-Lost.png' },
  // Pion posé à la place du chit quand celui-ci reste caché au joueur.
  hidden: { name: 'Search', src: '/modules/coral-sea/images/counters/markers/Marker_Search.png' },
}
const MARKERS = '/modules/coral-sea/images/counters/markers/'

/** État de repérage, et pion "Sighted" qui remplace à l'affichage le
 *  drapeau de la task force repérée (vraie ou leurre), jusqu'au prochain
 *  retour des chits dans la tasse. */
// Image par camp de l'unité repérée.
export const SIGHTINGS = {
  noContact: {},
  noTF: {},
  carrierTF: { name: 'Sighted Carrier', src: { usn: `${MARKERS}Marker_Sighted-Carrier.png`, ijn: `${MARKERS}Marker_Sighted-Carrier-IJN.png` } },
  fleetTF: { name: 'Sighted Fleet', src: { usn: `${MARKERS}Marker_Sighted-Fleet.png`, ijn: `${MARKERS}Marker_Sighted-Fleet-IJN.png` } },
}

/** Task forces japonaises (leurres compris) ramenées sur la carte à chaque
 *  renfort de leurres (cf. `planDummyReinforcement`). */
const DUMMY_TOTAL = 12

/** Rayon dans lequel sont tirés les hex-objectifs des porte-avions (cf.
 *  `groupCarrierObjectives`). */
const GROUPED_RADIUS = 5

/** Types de navires qui font d'une task force une task force de
 *  porte-avions (cf. `behaviorOfShips`). */
const CARRIER_TYPES = new Set(['CV', 'CVL'])

/** Task forces portées en secret par un leurre quand le scénario ne déclare
 *  pas de formations, ou que le catalogue de navires manque — et rôles d'un
 *  journal antérieur aux formations (cf. `behaviorIn`). */
const LEGACY_TASK_FORCES = [
  { tf: 'ijn-tf1', code: 'TF1', movement: 'normal', behavior: 'carrier' },
  { tf: 'ijn-tf2', code: 'TF2', movement: 'normal', behavior: 'carrier' },
  { tf: 'ijn-tf3', code: 'TF3', movement: 'normal', behavior: 'carrier' },
  { tf: 'ijn-tf7', code: 'TF7', movement: 'transport', behavior: 'transport' },
  { tf: 'ijn-tf8', code: 'TF8', movement: 'transport', behavior: 'transport' },
  { tf: 'ijn-tf10', code: 'TF10', movement: 'transport', behavior: 'transport' },
]

/** Navires d'une liste d'ordre de bataille (`"id"` ou `{ ship, count }`,
 *  cf. coral-sea.json), un id par navire. */
function expandShips(list) {
  return (list ?? []).flatMap((entry) => (typeof entry === 'string' ? [entry] : Array(entry?.count ?? 1).fill(entry?.ship)))
}

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
  if (!formation) return LEGACY_TASK_FORCES
  return Object.entries(formation.taskForces).map(([tf, ships]) => {
    const behavior = behaviorOfShips(ships, formation.typeOf)
    const code = allCounters.find((counter) => String(counter.id) === tf)?.code ?? tf
    return { tf, code, movement: behavior === 'transport' ? 'transport' : 'normal', behavior, ships }
  })
}

/** Rôle de la task force `tf` parmi les rôles des leurres (`roles`), ou,
 *  pour un journal antérieur aux formations (aucun rôle n'a de
 *  `behavior`), celui de l'ancien tirage. */
function taskForceRoleIn(roles, tf) {
  const all = Object.values(roles)
  const pool = all.some((role) => role.behavior) ? all : LEGACY_TASK_FORCES
  return pool.find((role) => role.tf === tf) ?? null
}

/** Une task force JAPONAISE (vrai pion) ou un leurre japonais : les pions
 *  qui marchent seuls vers leur hex-objectif. */
function isIjnTaskForce(counter) {
  return counter?.faction === 'ijn' && counter.type === 'task force'
}

/** Un leurre (Dummy) JAPONAIS : task force factice déployée d'office au coup
 *  d'envoi. Les leurres américains, eux, se posent à la mise en place US
 *  et aux renforts de leurres (cf. `playerDummyReinforcement`). */
function isDummy(counter) {
  return counter?.code === 'Dummy' && counter.faction === 'ijn'
}

function shuffle(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Tirage des rôles : id de leurre -> `{ tf, code, movement, behavior,
 *  ships }` pour ceux qui portent une des task forces `hidden`, `{ tf: null,
 *  code: null, movement }` pour les vrais leurres (tous les autres). */
function drawDummyRoles(dummyIds, hidden) {
  const roles = {}
  shuffle(dummyIds).forEach((id, index) => {
    roles[id] = hidden[index]
      ?? { tf: null, code: null, movement: Math.random() < 0.5 ? 'normal' : 'transport' }
  })
  return roles
}

/** Groupes de départ : chaque leurre qui porte une task force reçoit un
 *  leurre d'escorte, porte-avions d'abord, tant qu'il en reste ; les
 *  leurres restants forment un faux couple (le premier mène, le second le
 *  suit). Suiveur id -> meneur id. */
function drawLeaders(roles) {
  const plain = shuffle(Object.keys(roles).filter((id) => !roles[id].tf))
  const leaders = {}
  const carried = Object.keys(roles).filter((id) => roles[id].tf)
  const isCarrier = (id) => taskForceRoleIn(roles, roles[id].tf)?.behavior === 'carrier'
  for (const id of [...carried.filter(isCarrier), ...carried.filter((id) => !isCarrier(id))]) {
    const escort = plain.shift()
    if (escort) leaders[escort] = id
  }
  const [pairLeader, ...others] = plain
  for (const id of others) leaders[id] = pairLeader
  return leaders
}

/** Tirage des hex-objectifs : id de pion -> id d'hex "CCRR", tous
 *  différents tant qu'il y a assez d'hex d'arrivée. */
function drawObjectives(counterIds, arrivalHexes) {
  const objectives = {}
  if (!arrivalHexes?.length) return objectives
  let pool = []
  for (const id of counterIds) {
    if (!pool.length) pool = shuffle(arrivalHexes)
    objectives[id] = pool.pop()
  }
  return objectives
}

/** Hex-objectifs GROUPÉS des task forces de porte-avions (comportement
 *  'carrier', cf. `behaviorOfShips`) : un hex d'arrivée tiré au hasard sert
 *  de centre, et chacune reçoit un hex d'arrivée à 5 hex ou moins de lui
 *  (cf. `GROUPED_RADIUS`). Concerne les leurres qui les portent (`roles`)
 *  comme les vrais pions. Remplace leur tirage dans `objectives`, renvoyé
 *  modifié. */
function groupCarrierObjectives(objectives, roles, arrivalHexes) {
  if (!arrivalHexes?.length) return objectives
  const center = hexOfId(arrivalHexes[Math.floor(Math.random() * arrivalHexes.length)])
  const carriers = Object.keys(objectives).filter((id) => taskForceRoleIn(roles, roles[id]?.tf ?? id)?.behavior === 'carrier')
  // Jamais deux task forces sur le même hex-objectif : ni entre elles, ni
  // avec un objectif déjà tiré pour une autre (tant qu'il reste de quoi).
  const taken = new Set(Object.keys(objectives).filter((id) => !carriers.includes(id)).map((id) => objectives[id]))
  const near = arrivalHexes.filter((id) => hexDistance(hexOfId(id), center) <= GROUPED_RADIUS)
  const free = shuffle(near.filter((id) => !taken.has(id)))
  const pool = free.length >= carriers.length ? free : shuffle(near)
  carriers.forEach((id, index) => { objectives[id] = pool[index % pool.length] })
  return objectives
}

/** Navires qui défendent le navire `targetKey` contre une frappe
 *  aéronavale, sur le support de sa task force (`layout`, cf.
 *  `fleetDisplay`) : lui d'abord, puis ses voisins — sur "Carrier TF", le
 *  porte-avions est défendu par ses (jusqu'à 4) escortes, une escorte par le
 *  porte-avions seul (les escortes ne se touchent pas) ; sur "Fleet TF", les
 *  navires des cases à sa gauche et à sa droite. Un navire hors du support
 *  (`extra`) se défend seul. `[]` s'il n'est pas dans la task force. */
export function strikeDefenders(layout, targetKey) {
  if (layout.kind === 'carrier') {
    if (layout.carrier.key === targetKey) return [layout.carrier, ...layout.escorts.map((escort) => escort.ship)]
    const escort = layout.escorts.find((entry) => entry.ship.key === targetKey)
    if (escort) return [escort.ship, layout.carrier]
  } else {
    const placed = layout.slots.find((entry) => entry.ship.key === targetKey)
    if (placed) {
      const neighbors = layout.slots.filter((entry) => Math.abs(entry.slot - placed.slot) === 1).map((entry) => entry.ship)
      return [placed.ship, ...neighbors]
    }
  }
  const alone = (layout.extra ?? []).find((ship) => ship.key === targetKey)
  return alone ? [alone] : []
}

export function useCoralSea(moduleId, ctx = {}) {
  const active = computed(() => unref(moduleId) === CORAL_SEA_MODULE_ID)

  const allCounters = ctx.allCounters?.() ?? []
  // Formation des task forces japonaises, tirée au hasard au coup d'envoi
  // (cf. `drawFormation`) ; chacune est ensuite portée en secret par un
  // leurre, les autres leurres restant de vrais leurres.
  const drawn = active.value ? drawFormation(ctx.scenario, ctx.fleets) : null
  const formationId = ref(drawn?.id ?? null)
  const dummyRoles = ref(active.value
    ? drawDummyRoles(allCounters.filter(isDummy).map((counter) => String(counter.id)), hiddenTaskForces(drawn, allCounters))
    : {})
  // Suiveurs (escortes, second du faux couple, leurres d'un renfort de
  // nuit) : id -> id de leur meneur, qu'ils suivent en restant adjacents
  // (cf. `followTarget`). Pas d'hex-objectif à eux.
  const leaders = ref(active.value ? drawLeaders(dummyRoles.value) : {})
  const objectives = ref(active.value
    ? groupCarrierObjectives(drawObjectives(allCounters.filter(isIjnTaskForce).map((counter) => String(counter.id))
      .filter((id) => !leaders.value[id]), ctx.terrain?.ijnArrivalHexes), dummyRoles.value, ctx.terrain?.ijnArrivalHexes)
    : {})

  /** Au chargement, seuls les 12 leurres (Dummy) japonais sont posés, tirés
   *  au hasard dans leur plage `setup` (bord haut, 0601-2701, cf.
   *  coral-sea.json) ; tous les autres pions partent du panneau. */
  function autoPlacesAtLoad(counter) {
    if (!active.value) return null
    return isDummy(counter)
  }

  /** Mise en place US : 12 task forces sur la carte, leurres compris (cf.
   *  `DUMMY_TOTAL`, le même total que les renforts de leurres). */
  function setupCount(counters) {
    if (!active.value) return null
    const count = counters.filter((counter) => counter.faction === 'usn' && counter.type === 'task force').length
    return { count, total: DUMMY_TOTAL }
  }

  /** Rôle secret d'un leurre japonais, ou `null`. */
  function dummyRole(counter) {
    if (!active.value || !isDummy(counter)) return null
    return dummyRoles.value[String(counter.id)] ?? null
  }

  /** Tête du groupe de ce pion (id) : il en prend l'allure. */
  function headOf(id) {
    const seen = new Set([id])
    let head = id
    while (leaders.value[head] && !seen.has(leaders.value[head])) seen.add(head = leaders.value[head])
    return head
  }

  /** Ce pion se déplace-t-il comme un transport ? Un suiveur va à l'allure
   *  de la tête de son groupe. */
  function isTransport(counter) {
    const head = headOf(String(counter?.id))
    const role = dummyRoles.value[head] ?? taskForceRoleIn(dummyRoles.value, head)
    return role?.movement === 'transport'
  }

  /** Comportement de la task force `tf` (cf. `behaviorOfShips`), ou `null`
   *  (vrai leurre, task force hors de la formation). */
  function behaviorOf(tf) {
    return tf ? taskForceRoleIn(dummyRoles.value, tf)?.behavior ?? null : null
  }

  /** Allure de transport : 1 hex aux tours "Mouvement AK" de la piste, 0
   *  sinon. `null` (allure de la piste) pour tout autre pion. */
  function movementAllowance(counter, turnInfo) {
    if (!active.value || !turnInfo || !isTransport(counter)) return null
    return turnInfo.conditions?.akMovement ? 1 : 0
  }

  /** Étiquette privée d'un leurre (rôle secret), réservée au joueur japonais. */
  function privateLabel(counter) {
    const role = dummyRole(counter)
    if (!role) return null
    if (role.code) return role.code
    return isTransport(counter) ? 'Leurre AK' : 'Leurre'
  }

  /** Task force que ce pion EST (id, ex. 'ijn-tf1') : celle que porte un
   *  leurre, ou le pion lui-même ; `null` pour un vrai leurre. */
  function taskForceOf(counter) {
    if (counter?.code === 'Dummy') return dummyRole(counter)?.tf ?? null
    return String(counter?.id)
  }

  // Attente des porte-avions aux portes du rayon d'attaque (cf.
  // `movementPlan`) : task force -> tour où elle a commencé à attendre les
  // autres.
  const waitingSince = new Map()

  /** Mouvement PARTICULIER d'une task force japonaise, qui REMPLACE la
   *  marche vers son hex-objectif (cf. HexMap.vue::runAutoMoves) — ses
   *  suiveurs la suivent comme d'habitude. Décidé par l'arbre
   *  `movementTree` (cf. lib/ai/coralSeaTrees.js, où il est dessiné) sur ce
   *  que sait le Japonais : la carte, plus le comportement de la task force
   *  et ses porte-avions partenaires (cf. lib/ai/coralSeaPerception.js).
   *  Seule la feuille 'hold' (attendre les partenaires) entretient la
   *  mémoire d'attente ; toute autre décision l'efface.
   *  `{ kind: 'avoid', avoid: [hex], range }` (vers l'objectif, en restant à
   *  plus de `range` hex des `avoid`, ou en s'en éloignant), `{ kind:
   *  'attack', target: hex, radius, hold }` (jusqu'à `radius` hex de
   *  `target` ; `hold` : s'arrêter à `radius` + 1), ou `null` (marche
   *  ordinaire). `allowanceOf(pion)` : MP du tour. `onDecision({ side,
   *  action, trace, plan })` (facultatif) reçoit la décision de chaque task
   *  force japonaise — `action`, nom de la feuille atteinte ; `trace`, le
   *  chemin suivi (cf. lib/ai/decisionTree.js::decide) — pour le journal de
   *  debug (cf. HexMap.vue::logAiDecision). */
  function movementPlan(counter, counters, turn, allowanceOf, onDecision = null) {
    if (!active.value || !isIjnTaskForce(counter)) return null
    const tf = taskForceOf(counter)
    const behavior = behaviorOf(tf)
    const partners = behavior === 'carrier'
      ? counters.filter((other) => isIjnTaskForce(other) && taskForceOf(other)
        && taskForceOf(other) !== tf && behaviorOf(taskForceOf(other)) === 'carrier')
      : []
    const facts = perceiveTaskForce(counter, counters, { behavior, partners, allowanceOf, turn, waitingSince: waitingSince.get(tf) ?? null })
    const { leaf, trace } = decide(movementTree, facts, movementTests)
    if (leaf.do === 'hold') waitingSince.set(tf, waitingSince.get(tf) ?? turn)
    else waitingSince.delete(tf)
    const plan = movementActions[leaf.do](facts, leaf)
    onDecision?.({ side: 'ijn', action: leaf.do, trace, plan })
    return plan
  }

  /** Raid aérien japonais de la phase "Opérations aériennes" : TF1, TF2 et
   *  TF3 frappent une TF alliée vue comme porte-avions ("Sighted Carrier",
   *  vrai ou faux) à 5 hex ou moins d'elles. Elles se CONCENTRENT : d'abord
   *  la cible que le plus de ces task forces peuvent atteindre (au hasard
   *  entre ex aequo), frappée par toutes celles qui l'atteignent ; celles
   *  qui ne l'atteignent pas recommencent entre elles sur les autres cibles.
   *  `[{ targetId, raiders: [{ tf, name, src }] }]`, vide sans cible à
   *  portée. */
  function raidPlan(counters) {
    if (!active.value) return []
    const raiders = counters.filter((counter) => counter.faction === 'ijn' && counter.type === 'task force' && RAID_MARKERS[taskForceOf(counter)])
    const seenAsCarrier = new Set(counters.filter((marker) => marker.sighted === 'carrierTF').map((marker) => marker.attachedTo))
    const targets = counters.filter((counter) => counter.faction === 'usn' && counter.type === 'task force' && seenAsCarrier.has(String(counter.id)))
    const raids = []
    let free = raiders
    let open = shuffle(targets)
    for (;;) {
      const options = open.map((target) => ({ target, inRange: free.filter((raider) => hexDistance(raider, target) <= RAID_RADIUS) }))
        .filter((option) => option.inRange.length)
      if (!options.length) return raids
      const best = options.reduce((top, option) => (option.inRange.length > top.inRange.length ? option : top))
      const tfs = [...new Set(best.inRange.map(taskForceOf))].sort()
      raids.push({ targetId: String(best.target.id), raiders: tfs.map((tf) => ({ tf, ...RAID_MARKERS[tf] })) })
      free = free.filter((raider) => !best.inRange.includes(raider))
      open = open.filter((target) => target !== best.target)
    }
  }

  // Tableaux de la frappe aéronavale (cf. lib/airStrike.js, coral-sea.json),
  // ou `null`.
  const airStrikeTable = active.value ? resolveAirStrikeTable(ctx.airStrike) : null

  /** Probabilités exactes d'une frappe aéronavale (cf. lib/airStrike.js::
   *  strikeOdds) : `strike` `{ antiAir, antiShip, situation }` — défense AA
   *  de la cible (cf. `strikeTarget`), puissance anti-ship du raid (cf.
   *  lib/airStrike.js::antiShipPower), situation de la cible ('dock',
   *  'landBase', rien en mer) — et, avec la durabilité `{ intact, reduced }`
   *  du navire visé, de chaque résultat (rien, mineur, significatif,
   *  critique, coulé) : de quoi peser les attaques de l'IA. `null` sans
   *  tableaux. */
  function airStrikeOdds(strike, durability = null) {
    return airStrikeTable ? strikeOdds(airStrikeTable, strike, durability) : null
  }

  /** Hex-objectif de ce pion (`{ col, row }`, col 0-based), ou `null`. */
  function autoMoveTarget(counter) {
    if (!active.value) return null
    const id = objectives.value[String(counter?.id)]
    if (!id) return null
    return { col: Number(id.slice(0, 2)) - 1, row: Number(id.slice(2)) }
  }

  /** Meneur que ce pion suit (pion de `counters`), ou `null` s'il n'en a
   *  pas. Un meneur disparu (leurre démasqué) est remplacé par le sien ;
   *  sans meneur restant, le suiveur reprend l'hex-objectif de son ancien
   *  meneur et mène à son tour (ses propres suiveurs le suivent toujours). */
  function followTarget(counter, counters) {
    if (!active.value) return null
    const id = String(counter?.id)
    let leaderId = leaders.value[id]
    if (!leaderId) return null
    const onMap = new Map(counters.map((other) => [String(other.id), other]))
    const seen = new Set([id])
    while (!onMap.has(leaderId)) {
      const above = leaders.value[leaderId]
      if (!above || seen.has(above)) { promote(id, leaderId); return null }
      seen.add(leaderId)
      leaderId = above
    }
    if (leaderId !== leaders.value[id]) leaders.value = { ...leaders.value, [id]: leaderId }
    return onMap.get(leaderId)
  }

  /** Le suiveur `id` perd son meneur `lostId` : il en reprend l'objectif. */
  function promote(id, lostId) {
    const next = { ...leaders.value }
    delete next[id]
    leaders.value = next
    const objective = objectives.value[lostId]
    if (objective) objectives.value = { ...objectives.value, [id]: objective }
  }

  /** Placement initial des groupes : chaque suiveur posé (`placed`, pions
   *  déjà tirés dans leur plage) va sur un hex adjacent à son meneur, au
   *  hasard parmi `adjacentHexes(pion, col, row)`, de préférence libre. */
  function arrangeInitialPositions(placed, adjacentHexes) {
    if (!active.value) return
    const byId = new Map(placed.map((counter) => [String(counter.id), counter]))
    for (const [followerId, leaderId] of Object.entries(leaders.value)) {
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

  /** `role` déclaré de chaque pion (cf. coral-sea.json). */
  const declaredRoles = new Map(allCounters.map((counter) => [String(counter.id), counter.role ?? null]))

  /** Ce qu'est VRAIMENT un pion : 'carrier', 'fleet' ou 'dummy'. Un leurre
   *  japonais qui porte une task force est cette task force ; une task force
   *  sans `role` compte comme une flotte. */
  function roleOf(counter) {
    if (counter?.code !== 'Dummy') return counter?.role ?? declaredRoles.get(String(counter?.id)) ?? 'fleet'
    const tf = dummyRole(counter)?.tf
    return tf ? declaredRoles.get(tf) ?? 'fleet' : 'dummy'
  }

  /** Sources de reconnaissance du camp `side` : `{ key, base, name,
   *  unitId, checks, col, row }` — `base`, nom de la base aérienne (`null`
   *  pour un porte-avions) ; `checks`, hex qu'elle explore par phase. Les
   *  bases sont japonaises (aucune base alliée dans ce scénario). Un
   *  porte-avions japonais porté par un leurre part de l'hex du leurre, sous
   *  la clé de la task force (une seule source, même si le vrai pion est
   *  posé). */
  function reconSources(counters, side) {
    const sources = new Map(side !== 'ijn' ? [] : Object.entries(RECON_BASES)
      .map(([id, base]) => [`base:${id}`, { key: `base:${id}`, base, name: base, unitId: null, checks: BASE_CHECKS, ...hexOfId(id) }]))
    for (const counter of counters) {
      if (counter.faction !== side || counter.type !== 'task force' || roleOf(counter) !== 'carrier') continue
      const tf = counter.code === 'Dummy' ? dummyRole(counter).tf : String(counter.id)
      if (sources.has(`tf:${tf}`)) continue
      sources.set(`tf:${tf}`, { key: `tf:${tf}`, base: null, name: counter.name, unitId: String(counter.id),
        checks: CARRIER_CHECKS[side] ?? 1, col: counter.col, row: counter.row })
    }
    return [...sources.values()]
  }

  /** Ce pion est-il une cible de reconnaissance pour le camp `side` ? Une
   *  task force ou un leurre du camp adverse. */
  function reconTargetOf(counter, side) {
    return active.value && counter?.faction === ENEMY[side] && counter.type === 'task force'
  }

  /** Checks de reconnaissance possibles du camp `side` (japonais par
   *  défaut) : pour chaque source, les hex (`{ col, row }`) qu'elle peut
   *  explorer — une cible (cf. `reconTargetOf`) s'y trouve, à 8 hex ou
   *  moins, et aucun résultat de recherche n'y a été posé PENDANT CETTE
   *  PHASE (`step`, pas de la piste noté sur le pion — un hex marqué à une
   *  phase précédente peut être exploré à nouveau ; une même source
   *  n'explore jamais deux fois le même hex dans la phase). `[{ source,
   *  targets }]`, sources sans cible comprises ; `null` hors mer de Corail. */
  function reconChecks(counters, side = 'ijn', step = null) {
    if (!active.value) return null
    const searched = new Set(counters.filter((counter) => counter.searchResult && counter.step === step)
      .map((counter) => counter.col + ',' + counter.row))
    const enemies = new Map()
    for (const counter of counters) {
      if (!reconTargetOf(counter, side)) continue
      const key = counter.col + ',' + counter.row
      if (!searched.has(key)) enemies.set(key, { col: counter.col, row: counter.row })
    }
    const covered = side === 'ijn' ? ijnCoverageFilter(counters) : () => true
    // Porte-avions déjà repéré COMME porte-avions : plus rien à cacher, il
    // cherche quoi qu'il arrive (pas celui pris pour une flotte).
    const seenAsCarrier = new Set(counters.filter((counter) => counter.sighted === 'carrierTF').map((counter) => counter.attachedTo))
    // Hex dont une cible au moins n'est pas encore repérée (ni "Sighted
    // Carrier" ni "Sighted Fleet") : le Japonais y cherche d'abord, et ne
    // revient sur une task force déjà repérée que s'il n'a plus rien d'autre
    // à portée.
    const sighted = new Set(counters.filter((counter) => counter.sighted === 'carrierTF' || counter.sighted === 'fleetTF')
      .map((counter) => counter.attachedTo))
    const undetected = new Set(counters.filter((counter) => reconTargetOf(counter, side) && !sighted.has(String(counter.id)))
      .map((counter) => counter.col + ',' + counter.row))
    return reconSources(counters, side).map((source) => {
      const targets = [...enemies.values()].filter((hex) => hexDistance(source, hex) <= RECON_RANGE
        && (seenAsCarrier.has(source.unitId) || covered(hex)))
      if (side !== 'ijn') return { source, targets }
      const fresh = targets.filter((hex) => undetected.has(hex.col + ',' + hex.row))
      return { source, targets: fresh.length ? fresh : targets }
    })
  }

  // Mémoire des repérages : unité id -> dernier "carrierTF" ou "fleetTF" posé
  // sur elle, gardé quand son pion "Sighted" tombe au retour des chits (cf.
  // `noteSighting`, `reconChoice`).
  const lastSightings = new Map()

  /** L'unité `unitId` reçoit l'état de repérage `sighting` (cf.
   *  HexMap.vue::applySighting, en jeu comme au rejeu) : l'IA s'en souvient
   *  s'il dit ce qu'elle est. Un "Contact Lost" n'efface pas ce qu'on a vu. */
  function noteSighting(unitId, sighting) {
    if (active.value && (sighting === 'carrierTF' || sighting === 'fleetTF')) lastSightings.set(String(unitId), sighting)
  }

  /** Hex que le moteur explore maintenant, parmi les checks encore ouverts
   *  du camp japonais (`checks`, cf. `reconChecks` — sources qui ont un
   *  check et des cibles) : chaque couple source/hex passe dans l'arbre
   *  `reconTree` (cf. lib/ai/coralSeaTrees.js), qui lui donne une priorité.
   *  Le plus prioritaire l'emporte ; à égalité, celui de la source qui a le
   *  moins de cibles (elle n'a pas d'autre choix), puis au hasard. `{ source,
   *  target, side, action, priority, trace, options }` — `options`, nombre
   *  de couples pesés —, ou `null` sans check. */
  function reconChoice(checks, counters) {
    if (!active.value) return null
    const own = counters.filter(isIjnTaskForce)
    const ownCarriers = own.filter((counter) => behaviorOf(taskForceOf(counter)) === 'carrier')
    const ownTransports = own.filter((counter) => behaviorOf(taskForceOf(counter)) === 'transport')
    const lastSeen = (id) => lastSightings.get(id) ?? null
    const options = shuffle(checks.flatMap((check) => check.targets.map((target) => {
      const facts = perceiveReconTarget(target, counters, { ownCarriers, ownTransports, lastSeen })
      return { check, target, ...decide(reconTree, facts, reconTests) }
    })))
    if (!options.length) return null
    const better = (a, b) => a.leaf.priority > b.leaf.priority
      || (a.leaf.priority === b.leaf.priority && a.check.targets.length < b.check.targets.length)
    const best = options.reduce((top, option) => (better(option, top) ? option : top))
    return { source: best.check.source, target: best.target, side: 'ijn', action: best.leaf.do,
      priority: best.leaf.priority, trace: best.trace, options: options.length }
  }

  /** Règle de couverture des reconnaissances JAPONAISES : un hex n'est
   *  exploré que si assez d'unités japonaises sont à 8 hex ou moins de lui
   *  — task forces et leurres sur la carte, plus les bases (cf.
   *  `RECON_BASES`). Le seuil suit le nombre de task forces et leurres
   *  japonais en jeu (cf. `COVERAGE_THRESHOLDS`). Filtre `hex -> booléen`. */
  function ijnCoverageFilter(counters) {
    const units = counters.filter(isIjnTaskForce)
    const needed = COVERAGE_THRESHOLDS.find(([minUnits]) => units.length >= minUnits)?.[1] ?? 1
    const anchors = [...units, ...Object.keys(RECON_BASES).map(hexOfId)]
    return (hex) => anchors.filter((anchor) => hexDistance(anchor, hex) <= RECON_RANGE).length >= needed
  }

  // Chits restant dans la tasse de recherche (cf. `drawSearch`).
  const searchBag = ref({ ...SEARCH_CHITS })

  /** Tire un chit de la tasse, sans remise : `{ result, bag }` (`bag` =
   *  contenu restant), ou `null` si la tasse est vide. */
  function drawSearch() {
    if (!active.value) return null
    const bag = { ...searchBag.value }
    const total = Object.values(bag).reduce((sum, count) => sum + count, 0)
    if (!total) return null
    let pick = Math.floor(Math.random() * total)
    const result = Object.keys(bag).find((key) => (pick -= bag[key]) < 0)
    bag[result] -= 1
    searchBag.value = bag
    return { result, bag }
  }

  /** Remet tous les chits dans la tasse. */
  function refillSearchBag() {
    if (active.value) searchBag.value = { ...SEARCH_CHITS }
  }

  /** Contenu de la tasse lu dans le journal (rejeu, partie en ligne). */
  function restoreSearchBag(bag) {
    if (active.value && bag) searchBag.value = { ...bag }
  }

  /** Ce que donne le chit `result` sur l'unité explorée : `{ sighting,
   *  removed }` — `sighting`, clé de `SIGHTINGS` ; `removed`, vrai pour un
   *  leurre démasqué, retiré du jeu. Une task force sans `role` compte
   *  comme une flotte. */
  function searchOutcome(result, counter) {
    if (!active.value) return null
    if (result === 'contactLost') return { sighting: 'noContact', removed: false }
    const role = roleOf(counter)
    if (role === 'dummy') {
      return result === 'detected' ? { sighting: 'noTF', removed: true } : { sighting: 'noContact', removed: false }
    }
    const carrier = role === 'carrier'
    const seenAsCarrier = result === 'detected' ? carrier : !carrier
    return { sighting: seenAsCarrier ? 'carrierTF' : 'fleetTF', removed: false }
  }

  /** Les chits reviennent-ils tous dans la tasse à ce tour de la piste ? */
  function searchChitsReturn(turnInfo) {
    return active.value && turnInfo?.conditions?.reconChits === 'Tous rendus'
  }

  /** Tour de renfort de leurres (`dummyReinforcement` de la piste : le
   *  premier tour de chaque nuit) ? */
  function dummyReinforcementTurn(turnInfo) {
    return active.value && !!turnInfo?.dummyReinforcement
  }

  /** Renfort de leurres japonais : de quoi ramener à `DUMMY_TOTAL` les task
   *  forces japonaises sur la carte, en reprenant les leurres éliminés
   *  (`freeDummyIds`). Où les poser, d'après les repérages alliés du jour
   *  (`sightings`, id -> clé de `SIGHTINGS`), avant qu'ils ne tombent :
   *    1. sur les hex des unités vues comme porte-avions ;
   *    2. sinon, sur ceux des unités vues comme flottes ;
   *    3. sinon, au hasard parmi les task forces japonaises.
   *  Répartis à tour de rôle entre les unités retenues, chacun SUR l'hex de
   *  l'unité qu'il SUIVRA désormais (pas d'hex-objectif à lui) : il s'en
   *  écarte au mouvement qui suit. Chaque leurre posé est un vrai leurre.
   *  `{ placements: [{ id, col, row }], roles, leaders }`, ou `null` s'il
   *  n'y a rien à poser. */
  function planDummyReinforcement(counters, sightings, freeDummyIds) {
    if (!active.value) return null
    const onMap = counters.filter(isIjnTaskForce)
    const missing = Math.min(DUMMY_TOTAL - onMap.length, freeDummyIds.length)
    if (missing <= 0) return null
    const seenAs = (sighting) => onMap.filter((counter) => sightings.get(String(counter.id)) === sighting)
    const anchors = shuffle([seenAs('carrierTF'), seenAs('fleetTF'), onMap].find((list) => list.length) ?? [])
    if (!anchors.length) return null
    const ids = freeDummyIds.slice(0, missing)
    const placements = ids.map((id, index) => {
      const anchor = anchors[index % anchors.length]
      return { id, col: anchor.col, row: anchor.row }
    })
    const roles = Object.fromEntries(ids.map((id) => [id, { tf: null, code: null, movement: 'normal' }]))
    const newLeaders = Object.fromEntries(ids.map((id, index) => [id, String(anchors[index % anchors.length].id)]))
    return { placements, roles, leaders: newLeaders }
  }

  /** Renfort de leurres du JOUEUR US, aux mêmes tours que le japonais (cf.
   *  `dummyReinforcementTurn`) : si `counter` est le leurre américain (pion
   *  en nombre illimité du panneau), `{ total, anchors }` — il se pose sur
   *  l'hex d'une task force américaine (`anchors(pion)`), tant qu'il y en a
   *  moins de `total` sur la carte, leurres compris. `null` sinon. Le moment
   *  (phase Mouvement US, avant tout mouvement) est vérifié par HexMap.vue. */
  function playerDummyReinforcement(counter, turnInfo) {
    if (!dummyReinforcementTurn(turnInfo) || counter?.code !== 'Dummy' || counter.faction !== 'usn') return null
    return { total: DUMMY_TOTAL, anchors: (other) => other.faction === 'usn' && other.type === 'task force' }
  }

  /** Rôles et hex-objectifs des leurres d'un renfort (en jeu comme au
   *  rejeu, cf. `planDummyReinforcement`). */
  function applyDummyReinforcement(plan) {
    if (!active.value || !plan) return
    // Leurres repris : ceux qui les suivaient encore les perdent d'abord
    // (cf. `promote`), puis ils quittent leurs anciens groupe et objectif.
    const reused = new Set((plan.placements ?? []).map((placement) => String(placement.id)))
    for (const [followerId, leaderId] of Object.entries(leaders.value)) {
      if (reused.has(leaderId) && !reused.has(followerId)) promote(followerId, leaderId)
    }
    const nextLeaders = { ...leaders.value }
    const nextObjectives = { ...objectives.value }
    for (const id of reused) { delete nextLeaders[id]; delete nextObjectives[id] }
    leaders.value = { ...nextLeaders, ...plan.leaders }
    objectives.value = { ...nextObjectives, ...plan.objectives }
    dummyRoles.value = { ...dummyRoles.value, ...plan.roles }
  }

  // Disposition de chaque task force sur son support (cf. `fleetDisplay`),
  // tirée à la première ouverture : task force -> disposition.
  const displayLayouts = new Map()

  /** Navires de la task force que ce pion EST VRAIMENT (cf. `taskForceOf`),
   *  posés sur son support : `{ kind: 'carrier', carrier, escorts: [{ ship,
   *  cell }], extra }` (case d'escorte de `FLEET_DISPLAYS.carrier`) ou `{
   *  kind: 'fleet', slots: [{ ship, slot }], extra }` (case 0 à 8) ;
   *  `extra` : navires de trop pour les cases. Chaque navire : `{ key, id,
   *  name, type, src }` (face intacte du catalogue). `null` : pas une task
   *  force japonaise, vrai leurre, ou composition inconnue (journal antérieur
   *  aux formations, catalogue manquant). */
  function fleetDisplay(counter) {
    if (!active.value || !isIjnTaskForce(counter)) return null
    const tf = taskForceOf(counter)
    if (!tf) return null
    if (displayLayouts.has(tf)) return displayLayouts.get(tf)
    const catalog = new Map((ctx.fleets?.ijn?.ships ?? []).map((ship) => [ship.id, ship]))
    const ships = (taskForceRoleIn(dummyRoles.value, tf)?.ships ?? [])
      .map((id, index) => {
        const ship = catalog.get(id)
        return ship && { key: `${id}-${index}`, id, name: ship.name, type: ship.type, src: ship.intact?.src }
      })
      .filter((ship) => ship?.src)
    if (!ships.length) return null
    const carrierIndex = ships.findIndex((ship) => CARRIER_TYPES.has(ship.type))
    let layout
    if (carrierIndex >= 0) {
      const cells = FLEET_DISPLAYS.carrier.escorts.length
      const escorts = shuffle(ships.filter((_, index) => index !== carrierIndex))
      const order = shuffle([...Array(cells).keys()])
      layout = {
        kind: 'carrier',
        carrier: ships[carrierIndex],
        escorts: escorts.slice(0, cells).map((ship, index) => ({ ship, cell: order[index] })),
        extra: escorts.slice(cells),
      }
    } else {
      const slots = FLEET_DISPLAYS.fleet.slots.length
      const order = shuffle(ships)
      layout = { kind: 'fleet', slots: order.slice(0, slots).map((ship, slot) => ({ ship, slot })), extra: order.slice(slots) }
    }
    displayLayouts.set(tf, layout)
    return layout
  }

  /** Cible `shipKey` (clé d'un navire du support, cf. `fleetDisplay`) de la
   *  task force que ce pion EST : `{ ship, defenders, antiAir, durability }`
   *  — `defenders`, les navires qui la défendent (cf. `strikeDefenders`) ;
   *  `antiAir`, la somme de leur défense AA ; `durability`, `{ intact,
   *  reduced }` du navire visé (cf. lib/airStrike.js::damageOutcome). Faces
   *  intactes : les dégâts des navires ne sont pas encore suivis. `null` :
   *  pas de support, ou navire absent du catalogue de son camp. */
  function strikeTarget(counter, shipKey) {
    const layout = fleetDisplay(counter)
    if (!layout) return null
    const catalog = new Map((ctx.fleets?.[counter.faction]?.ships ?? []).map((ship) => [ship.id, ship]))
    const defenders = strikeDefenders(layout, shipKey)
    const target = catalog.get(defenders[0]?.id)
    if (!target) return null
    return {
      ship: defenders[0],
      defenders,
      antiAir: defenders.reduce((sum, ship) => sum + (catalog.get(ship.id)?.intact?.antiAir ?? 0), 0),
      durability: { intact: target.intact.durability, reduced: target.damaged?.durability ?? 0 },
    }
  }

  /** Tirage secret à inscrire au journal avec le déploiement. */
  function setupSecrets() {
    return active.value
      ? { formation: formationId.value, dummyRoles: dummyRoles.value, objectives: objectives.value, leaders: leaders.value }
      : null
  }

  /** Rétablit le tirage lu dans le journal (rejeu, partie en ligne). Les
   *  rôles des leurres portent la composition et le comportement de chaque
   *  task force : la formation n'est pas retirée. */
  function restoreSetupSecrets(secrets) {
    if (!active.value) return
    formationId.value = secrets?.formation ?? null
    if (secrets?.dummyRoles) dummyRoles.value = secrets.dummyRoles
    if (secrets?.objectives) objectives.value = secrets.objectives
    // Journal antérieur aux groupes : personne ne suit personne.
    leaders.value = secrets?.leaders ?? {}
    // Le rejeu repart du déploiement : la mémoire des repérages se refait
    // avec ses entrées `search` (cf. `noteSighting`).
    lastSightings.clear()
  }

  // Les autres règles : celles du composable inerte (aucune particularité).
  return {
    ...INERT_RULES, active, autoPlacesAtLoad, setupCount, movementAllowance, privateLabel,
    privateLabelSide: 'ijn', setupSecrets, restoreSetupSecrets, autoMoveTarget, autoMoveSide: 'ijn',
    reconPhase: RECON_PHASE, reconChecks, reconChoice, noteSighting, reconTargetOf, manualReconSide: 'usn', searchBag, searchBagFull: SEARCH_CHITS, drawSearch, refillSearchBag, restoreSearchBag, searchChitsReturn,
    searchResults: SEARCH_RESULTS, searchOutcome, sightings: SIGHTINGS,
    isReusableDummy: isDummy, dummyReinforcementTurn, planDummyReinforcement, applyDummyReinforcement, playerDummyReinforcement,
    followTarget, arrangeInitialPositions, movementPlan, raidPhase: RAID_PHASE, raidSide: 'ijn', raidPlan, airStrikeOdds, strikeTarget,
    fleetDisplay, fleetDisplays: FLEET_DISPLAYS, fleetDisplayPhase: FLEET_DISPLAY_PHASE, fleetDisplaySide: 'usn',
  }
}
