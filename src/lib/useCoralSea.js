// ═══════════════════════════════════════════════════════════════════════════
// useCoralSea — règles PARTICULIÈRES au module "coral-sea"
// ═══════════════════════════════════════════════════════════════════════════
//
// Patron des règles particulières (cf. lib/moduleRules.js) : convention
// `null` = "pas de règle particulière", composable INERTE sur tout autre
// module.
//
// Bataille de la mer de Corail (7-8 mai 1942). Task forces et marqueurs de
// recherche (Detected!, Contact Lost, Misdirect) attendent dans le panneau
// latéral, d'où les joueurs les posent sur la carte (zone d'entrée IJN en
// haut de la carte ; USN n'importe où, à la mise en place —
// `turnTrack.setup`, avant le tour 1).
//
// SCÉNARIOS (cf. lib/coralSea/scenarios/) : ce qui dépend du scénario joué
// — la CONSTITUTION des flottes japonaises (formation, task forces portées
// en secret par les leurres), le PLACEMENT (déploiement, groupes,
// hex-objectifs, mise en place US, renforts de leurres), le DÉPLACEMENT
// (allures, arbre de décision du mouvement) et le REPÉRAGE (bases, portée,
// couverture, arbre de décision des reconnaissances) — vit à part, un
// dossier par scénario (ex. scenario-5/), en quatre moteurs (cf.
// `engines`) ; chaque scénario a les siens. Ce
// composable garde l'état qu'ils tirent au coup d'envoi — rôle secret de
// chaque leurre japonais (`dummyRoles`), groupes (`leaders`, suiveur ->
// meneur) et hex-objectifs (`objectives`) —, l'inscrit au journal avec le
// déploiement (cf. `setupSecrets` et HexMap.vue::logDeploymentOnce/
// startSharedJournal : il survit au rejeu et est commun à tous les joueurs
// en ligne), et le fait vivre : un suiveur suit son meneur en restant
// adjacent, à SON allure (cf. `followTarget`, `isTransport`,
// HexMap.vue::moveFollower) ; si le meneur disparaît, il reprend son
// hex-objectif (cf. `promote`) ; à chaque phase de Mouvement japonaise, le
// moteur rapproche chaque meneur de son objectif (cf. `autoMoveTarget`,
// HexMap.vue::runAutoMoves), sauf mouvement particulier décidé par le
// moteur de déplacement du scénario (cf. `movementPlan`).
//
// RECONNAISSANCE JAPONAISE : pendant la phase de Reconnaissance du camp
// japonais (joué par le moteur), chaque SOURCE fait ses checks : les bases
// aériennes japonaises et les task forces de porte-avions japonaises sur la
// carte (`role` "carrier", cf. coral-sea.json — vrais pions, ou leurres qui
// les portent en secret). Chacune explore un hex à sa portée où se trouve
// une task force ou un leurre allié pas encore exploré pendant la phase (cf.
// `reconChecks` et HexMap.vue::continueEngineRecon). Quelles bases, quelle
// portée, combien de checks, quels hex sont permis (couverture) et lequel
// le moteur explore d'abord, c'est le moteur de repérage du scénario qui le
// dit (cf. lib/coralSea/scenarios/, ex. scenario-5/recon.js). Les sources
// jouent une par une ; pour chacune, le joueur ouvre le rapport (clic droit
// sur l'unité) et un chit est tiré de la tasse de recherche (cf.
// `drawSearch`) : 30 Detected!, 12 Misdirect, 12 Contact Lost. Les chits
// tirés ne retournent pas dans la tasse : elle n'est remplie à nouveau
// qu'aux tours "Tous rendus" de la piste (`turnInfo.conditions.reconChits`,
// les tours de nuit), où les marqueurs quittent la carte et les task forces
// repérées redeviennent de simples drapeaux.
//
// RECONNAISSANCE ALLIÉE (camp du joueur, `manualReconSide`) : le joueur
// clique une task force de porte-avions alliée (`role` "carrier"), puis les
// hex DIFFÉRENTS à sa portée où se trouve une task force ou un leurre
// japonais (combien, et à quelle distance : cf. le moteur de repérage du
// scénario). Même tasse et mêmes résultats, mais le chit tiré lui reste
// caché : un pion "Search" générique est posé à la place, et un toast lui
// dit ce qu'il a vu. Un leurre japonais qui porte en secret une task force
// est jugé comme elle (cf. `roleOf`).
//
// RÉSULTAT D'UNE RECHERCHE (cf. `searchOutcome`) : une recherche explore un
// HEX — le chit tiré vaut pour toutes les task forces et tous les leurres
// adverses qui s'y trouvent (cf. HexMap.vue::performSearch), et donne à
// chacun un ÉTAT DE REPÉRAGE, selon ce qu'il est vraiment — leurre, task
// force de porte-avions ou de flotte (`role` des task forces, cf.
// coral-sea.json) :
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
// RENFORT DE LEURRES : aux tours `dummyReinforcement` de la piste (le
// premier de chaque nuit), juste avant que les repérages ne tombent, les
// leurres japonais éliminés reviennent sur la carte, et le joueur US peut
// poser des leurres sur ses task forces avant de bouger (cf.
// `planDummyReinforcement`, `playerDummyReinforcement` — où et combien,
// c'est le moteur de placement du scénario qui le dit).
//
// MISE EN PLACE US : le joueur pose ses task forces, leurres compris (cf.
// `setupCount`, total du moteur de placement) — moins, il confirme qu'il
// commence quand même ; plus, il ne peut pas commencer. Il peut les
// empiler, pendant la mise en place comme pendant ses mouvements
// (`rules.stackingLimit` du module : aucune limite, pour aucun camp — les
// task forces japonaises s'empilent aussi, ce qui laisse le moteur les
// déplacer sans qu'elles se bloquent entre elles).
//
// ADJACENCE (cf. `adjacent`) : deux hex voisins sont adjacents si l'on peut
// passer de l'un à l'autre — pas à travers une barrière de corail (arête
// infranchissable, cf. lib/edges.js). Aucune task force n'entre jamais sur
// l'hex d'une task force ennemie (cf. `barredHexes`).
//
// CONTACT DES LEURRES (cf. `barredHexes`, `movementEndRemovals`) : un vrai
// leurre — américain, ou japonais qui ne porte pas de task force — n'entre
// jamais, en mouvement, sur un hex adjacent à une task force ennemie,
// qu'elle soit repérée ou non. Les leurres ennemis comptent : rien ne les
// distingue des vraies task forces aux yeux de son camp. Interdit au
// joueur US comme au moteur japonais (suiveurs compris) ; s'éloigner reste
// permis. Une fois que les deux camps ont fait leur Mouvement (une seule
// fois par tour), un vrai leurre au contact d'une task force ennemie (venue
// jusqu'à lui, ou posé là par un renfort) est retiré du jeu (cf.
// HexMap.vue::removeAtMovementEnd).
//
// COMBAT NAVAL (cf. lib/navalCombat.js, `navalContacts`, `navalBattle`,
// HexMap.vue::startNavalCombat) : à la phase Combat naval, les task forces
// ennemies adjacentes se battent, un round par tour. Le contact les fait se
// connaître : la task force américaine l'est du Japonais comme après un raid
// (bordure verte, cf. `noteRaided`), la japonaise du joueur US (son vrai
// pion TF remplace le drapeau, cf. `revealedLook`) — jusqu'au premier tour
// de nuit qui suit. Comme après un raid, leurs pions de reconnaissance
// quittent la carte (cf. HexMap.vue::forgetRecon) ; le joueur US n'explore
// plus une task force japonaise connue, et la frappe sans la repérer (cf.
// `isRevealed`). Le camp qui a l'initiative organise les batailles
// (flèches de ses task forces vers les task forces ennemies qu'elles
// attaquent ; une bataille = toutes celles reliées, chaque camp y compte
// comme une seule flotte) ; le moteur japonais prend l'organisation qui lui
// rapporte le plus (cf. `planNavalBattles`). Dans chaque bataille, tous les
// navires sont visibles des deux camps :
//   - de jour, PORTÉE : seuls tirent les navires dont la portée est au moins
//     celle du combat (BB > CA > CL > DD) — par défaut la plus longue
//     présente. Chaque camp, l'initiative d'abord, peut proposer une portée
//     plus courte, que l'autre accepte ou refuse ; le moteur propose et
//     accepte selon son intérêt (cf. `navalRangeProposal`,
//     `navalAcceptsRange`). De nuit, tous tirent, et les DD japonais ont une
//     puissance de feu doublée ;
//   - ATTAQUES : l'initiative choisit les siennes, puis l'autre camp, qui
//     les voit ; le moteur cherche les points de victoire espérés les plus
//     hauts (cf. `navalPlan`) ;
//   - RÉSOLUTION simultanée (cf. `resolveNavalAttacks`) : un d6 par attaque
//     (l'IJN +1), dégâts appliqués comme ceux des raids, attaque après
//     attaque, sans s'additionner.
//
// SUPPORT DE TASK FORCE (cf. `fleetDisplay`, FleetDisplayModal.vue) :
// pendant SA phase d'Opérations aériennes, le joueur US choisit "Attaque
// aérienne" au clic droit d'une task force japonaise repérée ("Sighted
// Carrier" ou "Sighted Fleet") à 5 hex ou moins d'un de ses porte-avions
// (cf. `alliedAirReach`), pour voir ses navires posés sur leur support,
// d'après ce qu'elle est VRAIMENT :
// avec un porte-avions (CV, CVL), celui-ci au centre du support "Carrier TF"
// et ses escortes au hasard dans les 4 cases autour ; sinon, ses navires
// dans l'ordre d'un tirage au hasard sur les cases 1, 2, 3... du support
// "Fleet TF". La disposition, tirée à la première ouverture, ne change plus
// de la partie. Sur "Carrier TF", les avions du porte-avions (groupe aérien
// du scénario) sont en Ready et en Reserve (cf. lib/airGroups.js).
//
// DÉFENSE AA D'UNE TF ALLIÉE REPÉRÉE (cf. `sightedDefense`,
// `sightedStrikeOdds`) : le joueur compose lui-même ses task forces avec
// l'ordre de bataille allié du scénario ; le Japonais ne sait donc pas de
// quoi est faite celle qu'il a repérée, et l'estime par des moyennes sur cet
// ordre de bataille (cf. lib/ai/coralSeaPerception.js::
// sightedDefenseEstimate) — de quoi régler l'arbre de décision des attaques
// aériennes.
//
// COMPOSITION DES TASK FORCES ALLIÉES (cf. `alliedFleet`,
// TaskForceComposer.vue) : le joueur US pose les pions navires de l'ordre
// de bataille (par groupe : Carrier Air Group, Attack Group...) sur le
// support de chacune de ses task forces — "Carrier TF" pour TF1 à TF6
// (`role` "carrier"), porte-avions dans la case centrale et elle seule ;
// "Fleet TF" pour les autres, sans porte-avions. Les avions du porte-avions
// posé (groupe aérien du scénario, cf. `alliedDeck`) vont dans les 4 cases
// Ready et la Reserve — rangés par défaut comme ceux du Japonais (cf.
// lib/airGroups.js), le joueur les déplace à son gré. Il le fait à sa mise
// en place et à sa phase Administrative (en partie Libre, quand il veut).
// Inscrite au journal (entrée `alliedFleet`), la composition sert aux
// frappes sur ses navires (cf. `strikeTarget`) ; l'IA japonaise, elle, ne
// la lit que pour une task force qu'elle a déjà frappée (cf. `raidPlan`),
// et s'en tient sinon à son estimation.
import { computed, ref, unref } from 'vue'
import { INERT_RULES } from './moduleRules.js'
import { hexDistance, neighborsOf } from './hex.js'
import { resolveEdges } from './edges.js'
import { RECON_PHASE, SEARCH_CHITS, adjacentAcross, inContact as touching } from '../../shared/duelRules.js'
import { resolveNavalTable, rangeOptions, firingShips, planNavalAttacks, navalDamage, connectedGroups } from './navalCombat.js'
import { resolveAirStrikeTable, strikeOdds, damageOutcome } from './airStrike.js'
import { airGroupCounters, chooseReady, deckAircraft, withPlaneStates } from './airGroups.js'
import { planAcrossFleets, planStrike } from './strikePlanner.js'
import { sightedDefenseEstimate, sightedTargetsEstimate } from './ai/coralSeaPerception.js'
import { CARRIER_TYPES, RAID_RADIUS, expandShips, hexOfId, isDummy, isIjnTaskForce, shuffle } from './coralSea/shared.js'
import { scenarioEngines } from './coralSea/scenarios/index.js'

export const CORAL_SEA_MODULE_ID = 'coral-sea'

const ENEMY = { ijn: 'usn', usn: 'ijn' }
/** Raids aériens japonais (cf. `raidPlan`) : phase, et pion "IJN Raid" posé
 *  sur la cible, un par raid, le temps du raid. Leur portée : cf.
 *  coralSea/shared.js::RAID_RADIUS. */
const RAID_PHASE = 'airOperations'
const RAID_MARKER = { name: 'IJN Raid', src: '/modules/coral-sea/images/counters/markers/Marker_Raid-IJN.png' }
/** Supports des task forces JAPONAISES (cf. `fleetDisplay`) : image, taille
 *  en px, et cases où poser les navires, en px de l'image. "Carrier TF" : la
 *  case du porte-avions et les 4 cases d'escorte autour (haut, gauche,
 *  droite, bas) ; "Fleet TF" : les cases numérotées 1 à 9. */
const DISPLAYS = '/modules/coral-sea/images/displays/'
export const FLEET_DISPLAYS = {
  carrier: {
    src: `${DISPLAYS}carrier-tf.png`, width: 667, height: 699,
    // Avions du porte-avions (cf. lib/airGroups.js) : les 4 cases Ready, et
    // la bande Reserve.
    ready: [238, 342, 447, 551].map((x) => ({ x, y: 138, w: 103, h: 100 })),
    reserve: { x: 16, y: 252, w: 638, h: 99 },
    // Case "Landing from Map" : avions de retour d'un raid (cf. `landFromRaid`) ;
    // case "Landing from C.A.P." et bande C.A.P. (cf. `airCycle`).
    landing: { x: 17, y: 134, w: 98, h: 98 },
    landingCap: { x: 123, y: 134, w: 98, h: 98 },
    cap: { x: 122, y: 27, w: 415, h: 98 },
    carrier: { x: 237, y: 468, w: 201, h: 100 },
    escorts: [
      { x: 237, y: 360, w: 201, h: 101 },
      { x: 28, y: 468, w: 201, h: 100 },
      { x: 446, y: 468, w: 201, h: 100 },
      { x: 237, y: 576, w: 201, h: 100 },
    ],
  },
  fleet: {
    src: `${DISPLAYS}fleet-tf.png`, width: 1854, height: 130,
    slots: Array.from({ length: 9 }, (_, index) => ({ x: 1 + index * 204, y: 15, w: 204, h: 101 })),
  },
}
/** Supports des task forces ALLIÉES (cf. `alliedFleet`), aux couleurs
 *  américaines : mêmes cases, dans le même ordre, que `FLEET_DISPLAYS`. */
export const ALLIED_FLEET_DISPLAYS = {
  carrier: {
    src: `${DISPLAYS}carrier-tf-usn.png`, width: 659, height: 678,
    ready: [233, 337, 442, 546].map((x) => ({ x, y: 127, w: 103, h: 100 })),
    reserve: { x: 11, y: 241, w: 638, h: 99 },
    // Bande C.A.P., cases "Landing from Map" et "Landing from C.A.P." : le
    // joueur y place ses avions à sa phase d'Opérations aériennes (cf.
    // TaskForceComposer.vue, `alliedAirPhase`).
    cap: { x: 117, y: 16, w: 415, h: 98 },
    landing: { x: 12, y: 123, w: 98, h: 98 },
    landingCap: { x: 118, y: 123, w: 98, h: 98 },
    carrier: { x: 231, y: 456, w: 204, h: 103 },
    escorts: [
      { x: 231, y: 348, w: 204, h: 102 },
      { x: 22, y: 456, w: 204, h: 103 },
      { x: 440, y: 456, w: 204, h: 103 },
      { x: 231, y: 564, w: 204, h: 103 },
    ],
  },
  fleet: {
    src: `${DISPLAYS}fleet-tf-usn.png`, width: 1848, height: 121,
    slots: Array.from({ length: 9 }, (_, index) => ({ x: 5 + index * 204, y: 9, w: 203, h: 101 })),
  },
}
const FLEET_DISPLAY_PHASE = 'airOperations'
/** Phase (id de la piste) des combats de surface (cf. `navalContacts`). */
const NAVAL_COMBAT_PHASE = 'navalCombat'
/** Contacts d'un même groupe au-delà desquels le moteur ne cherche plus à le
 *  découper en batailles (cf. `planNavalBattles` : 2^n découpages). */
const MAX_SPLIT_CONTACTS = 6
/** Phase (id de la piste) où le joueur US compose ses task forces, en plus
 *  de sa mise en place (cf. `alliedFleet`). */
const ALLIED_FLEET_PHASE = 'administrative'

/** Cases d'un support, sous la clé où la composition alliée range un navire
 *  (cf. `alliedFleets`) : 'carrier' et 'escort0' à 'escort3' sur "Carrier
 *  TF", 'slot0' à 'slot8' sur "Fleet TF". */
export function displayCells(kind) {
  return kind === 'carrier'
    ? ['carrier', ...ALLIED_FLEET_DISPLAYS.carrier.escorts.map((_, index) => `escort${index}`)]
    : ALLIED_FLEET_DISPLAYS.fleet.slots.map((_, index) => `slot${index}`)
}

/** Cases Ready de "Carrier TF", sous la clé où la composition alliée range
 *  un avion du porte-avions : 'ready0' à 'ready3'. Ses autres avions sont
 *  en Reserve ('reserve0', 'reserve1'... — cf. `alliedFleet`). */
export const READY_CELLS = ALLIED_FLEET_DISPLAYS.carrier.ready.map((_, index) => `ready${index}`)
/** Case d'un avion dans la composition alliée : Ready, et, pour les zones à
 *  plusieurs avions, zone + rang — Reserve, C.A.P., "Landing from Map",
 *  "Landing from C.A.P.". */
export const isAirCell = (cell) => /^(ready|reserve|cap|landingMap|landingCap)\d+$/.test(cell)
/** Clé de pion d'un avion : celle de son porte-avions, '/', son rang. */
const carrierOfPlane = (key) => key.split('/')[0]

/** Pion posé sur l'hex exploré pour chaque chit de la tasse de recherche
 *  (cf. shared/duelRules.js::SEARCH_CHITS). */
export const SEARCH_RESULTS = {
  detected: { name: 'Detected!', src: '/modules/coral-sea/images/counters/markers/Marker_Detected.png' },
  misdirect: { name: 'Misdirect', src: '/modules/coral-sea/images/counters/markers/Marker_Misdirect.png' },
  contactLost: { name: 'Contact Lost', src: '/modules/coral-sea/images/counters/markers/Marker_Contact-Lost.png' },
  // Pion posé à la place du chit quand celui-ci reste caché au joueur.
  hidden: { name: 'Search', src: '/modules/coral-sea/images/counters/markers/Marker_Search.png' },
}
const MARKERS = '/modules/coral-sea/images/counters/markers/'

/** Dommages d'un navire (cf. `shipDamage`), du moins au plus grave, et ce
 *  qui le montre sur son support : `reduced`, le pion passe sur sa face
 *  réduite ; `marker`, un pion posé dessus ; `sunk`, le pion est retiré de
 *  son groupe (et un porte-avions, avec ses avions). Dommages critiques :
 *  défense AA et puissance de feu à 0 (cf. le pion "Crit. Dmg"). */
export const SHIP_DAMAGE = {
  none: { reduced: false, marker: null },
  minor: { reduced: false, marker: { name: 'Minor Damage', src: `${MARKERS}Marker_Minor-Damage.png` } },
  significant: { reduced: true, marker: null },
  critical: { reduced: true, marker: { name: 'Crit. Dmg', src: `${MARKERS}Marker_Critical-Damage.png` } },
  sunk: { reduced: false, marker: null, sunk: true },
}

/** Pertes possibles d'un pion avion (cf. `planeStateOf`) : intact, réduit
 *  (face réduite), éliminé (retiré du groupe aérien). */
export const PLANE_STATES = ['none', 'reduced', 'eliminated']

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

/** Navires qui défendent le navire `targetKey` contre une frappe
 *  aéronavale, sur le support de sa task force (`layout`, cf.
 *  `fleetDisplay`) : lui d'abord, puis ses voisins — sur "Carrier TF", le
 *  porte-avions est défendu par ses (jusqu'à 4) escortes, une escorte par le
 *  porte-avions seul (les escortes ne se touchent pas) ; sur "Fleet TF", les
 *  navires des cases à sa gauche et à sa droite. Un navire hors du support
 *  (`extra`) se défend seul. `[]` s'il n'est pas dans la task force. Une
 *  task force alliée peut n'avoir que des escortes (`carrier` nul). */
export function strikeDefenders(layout, targetKey) {
  if (layout.kind === 'carrier') {
    if (layout.carrier && layout.carrier.key === targetKey) return [layout.carrier, ...layout.escorts.map((escort) => escort.ship)]
    const escort = layout.escorts.find((entry) => entry.ship.key === targetKey)
    if (escort) return [escort.ship, ...(layout.carrier ? [layout.carrier] : [])]
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
  /** Pion déclaré `id` (cf. coral-sea.json), ou `null`. */
  const counterById = (id) => allCounters.find((counter) => String(counter.id) === String(id)) ?? null
  // Moteurs du scénario joué — constitution des flottes, placement,
  // déplacement (cf. lib/coralSea/scenarios/).
  const engines = active.value ? scenarioEngines(ctx.scenario?.id) : null

  // Rôle secret de chaque leurre japonais, tiré au coup d'envoi par le
  // moteur de constitution des flottes : la task force qu'il porte, ou rien
  // (vrai leurre) ; et la formation tirée.
  const composed = active.value
    ? engines.fleets.composeFleets({ scenario: ctx.scenario, fleets: ctx.fleets, allCounters,
        dummyIds: allCounters.filter(isDummy).map((counter) => String(counter.id)) })
    : null
  const formationId = ref(composed?.formationId ?? null)
  const dummyRoles = ref(composed?.roles ?? {})
  // Task forces japonaises qui ont perdu leurs porte-avions (cf.
  // `convertFleet`) : task force -> pion "Fleet TF" qu'elle montre
  // désormais. Elle garde son identité (composition, clés de ses navires,
  // leurre qui la porte) ; refait au rejeu avec les entrées
  // `fleetConversion`.
  const convertedIjn = ref(new Map())
  /** Pion de task force que montre la task force japonaise `tf`. */
  const shownTaskForce = (tf) => convertedIjn.value.get(tf) ?? tf

  /** Rôle de la task force `tf` parmi les rôles des leurres (`roles`), ou,
   *  pour un journal antérieur aux formations (aucun rôle n'a de
   *  `behavior`), celui de l'ancien tirage du scénario. */
  function taskForceRole(tf, roles = dummyRoles.value) {
    const all = Object.values(roles)
    const pool = all.some((role) => role.behavior) ? all : engines?.fleets.legacyTaskForces ?? []
    return pool.find((role) => role.tf === tf) ?? null
  }

  /** Comportement de la task force `tf` (cf. le moteur `fleets` du
   *  scénario), ou `null` (vrai leurre, task force hors de la formation).
   *  Celle qui a perdu ses porte-avions le reprend d'après ses navires à
   *  flot. */
  function behaviorOf(tf) {
    if (!tf) return null
    if (convertedIjn.value.has(tf)) {
      const types = new Map((ctx.fleets?.ijn?.ships ?? []).map((ship) => [ship.id, ship.type]))
      const afloat = (taskForceRole(tf)?.ships ?? []).filter((id, index) => !isSunk(ijnShipKey(tf, id, index)))
      return engines.fleets.behaviorOfShips(afloat, (id) => types.get(id))
    }
    return taskForceRole(tf)?.behavior ?? null
  }

  // Suiveurs (escortes, second du faux couple, leurres d'un renfort de
  // nuit) : id -> id de leur meneur, qu'ils suivent en restant adjacents
  // (cf. `followTarget`) ; pas d'hex-objectif à eux. Puis l'hex-objectif de
  // chaque meneur. Tirés au coup d'envoi par le moteur de placement.
  const leaders = ref(active.value ? engines.placement.drawGroups(dummyRoles.value, behaviorOf) : {})
  const objectives = ref(active.value
    ? engines.placement.drawObjectives({
        counterIds: allCounters.filter(isIjnTaskForce).map((counter) => String(counter.id)).filter((id) => !leaders.value[id]),
        roles: dummyRoles.value, behaviorOf, arrivalHexes: ctx.terrain?.ijnArrivalHexes,
      })
    : {})
  // Décideur du mouvement japonais du scénario, avec sa mémoire (cf.
  // `movementPlan`).
  const planMovement = active.value ? engines.movement.createMovementPlanner() : null

  /** Ce pion est-il posé sur la carte au chargement (cf. le moteur de
   *  placement — au scénario 5, les leurres japonais, tirés dans leur plage
   *  `setup`) ? Tous les autres partent du panneau. */
  function autoPlacesAtLoad(counter) {
    if (!active.value) return null
    return engines.placement.deploysAtLoad(counter)
  }

  /** Mise en place US : task forces sur la carte, leurres compris, pour le
   *  total du moteur de placement (le même que celui des renforts de
   *  leurres). */
  function setupCount(counters) {
    if (!active.value) return null
    const count = counters.filter((counter) => counter.faction === 'usn' && counter.type === 'task force').length
    return { count, total: engines.placement.setupTotal }
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
    const role = dummyRoles.value[head] ?? taskForceRole(head)
    return role?.movement === 'transport'
  }

  /** Potentiel de mouvement de ce pion au tour `turnInfo`, selon le moteur
   *  de déplacement du scénario (ex. allure de transport), ou `null` (allure
   *  de la piste). */
  function movementAllowance(counter, turnInfo) {
    if (!active.value) return null
    return engines.movement.allowance(counter, turnInfo, { transport: isTransport(counter) })
  }

  /** Étiquette privée d'un leurre (rôle secret), réservée au joueur japonais. */
  function privateLabel(counter) {
    const role = dummyRole(counter)
    if (!role) return null
    if (role.code) return convertedIjn.value.has(role.tf) ? counterById(convertedIjn.value.get(role.tf))?.code : role.code
    return isTransport(counter) ? 'Leurre AK' : 'Leurre'
  }

  /** Task force que ce pion EST (id, ex. 'ijn-tf1') : celle que porte un
   *  leurre, ou le pion lui-même ; `null` pour un vrai leurre. */
  function taskForceOf(counter) {
    if (counter?.code === 'Dummy') return dummyRole(counter)?.tf ?? null
    return String(counter?.id)
  }

  /** Mouvement PARTICULIER d'une task force japonaise, qui REMPLACE la
   *  marche vers son hex-objectif (cf. HexMap.vue::runAutoMoves) — ses
   *  suiveurs la suivent comme d'habitude. Décidé par le moteur de
   *  déplacement du scénario (cf. lib/coralSea/scenarios/, ex.
   *  scenario-5/movement.js) sur ce que sait le Japonais : la carte, et ce
   *  que ce composable sait de ses forces (`taskForceOf`, `behaviorOf`).
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
    const { action, trace, plan } = planMovement(counter, counters, { turn, allowanceOf, taskForceOf, behaviorOf })
    onDecision?.({ side: 'ijn', action, trace, plan })
    return plan
  }

  // Navires ESTIMÉS des task forces alliées repérées, cibles des frappes
  // japonaises (cf. ai/coralSeaPerception.js::sightedTargetsEstimate) :
  // estimés une fois, l'ordre de bataille ne changeant pas.
  let alliedTargets = null
  function estimatedAlliedTargets() {
    if (!alliedTargets) alliedTargets = sightedTargetsEstimate(orderOfBattleShips('usn'), pointsOfAlliedType)
    return alliedTargets
  }
  /** Points de victoire d'un navire allié de type `type` touché par une
   *  frappe, par résultat (rien, mineur, significatif, critique, coulé). */
  function pointsOfAlliedType(type) {
    return shipPoints('usn', type)
  }

  // Statut d'une task force alliée pour le Japonais : INCONNUE (rien à
  // faire), REPÉRÉE (pion "Sighted" : reconnaissances pour affiner, au
  // risque de perdre le contact, et raids) ou CONNUE — frappée par un de ses
  // raids : il sait exactement ce qu'elle porte (navires, défense, dommages,
  // points ; cf. `actualAlliedTargets`), même recomposée, la frappe quand il
  // veut à portée de ses raids sans la repérer, et ne la reconnaît plus (cf.
  // `reconTargetOf`) ; ses pions de reconnaissance sont retirés (cf.
  // HexMap.vue::placeRaidMarkers). Elle redevient inconnue au premier tour
  // de nuit qui suit son dernier raid (cf. `NIGHT_TURNS`).
  // Unité id -> tour de son dernier raid ; refait au rejeu avec les entrées
  // `raid`. Réactif : la carte montre les task forces connues (cf.
  // `isKnownTarget`, bordure verte).
  const knownAllied = ref(new Map())
  // Tours de nuit de la piste (`turnTrack.periods`, style "night").
  const NIGHT_TURNS = new Set((ctx.turnTrack?.periods ?? []).filter((period) => period.style === 'night')
    .flatMap((period) => Array.from({ length: period.to - period.from + 1 }, (_, index) => period.from + index)))
  // Tour en cours (cf. `noteTurn`).
  const currentTurn = ref(1)
  /** Tour en cours, à chaque changement (cf. HexMap.vue). */
  function noteTurn(turn) {
    if (active.value && turn != null) currentTurn.value = turn
  }
  /** L'unité alliée `unitId` vient de subir un raid, au tour `turn`. */
  function noteRaided(unitId, turn = null) {
    if (!active.value || unitId == null) return
    knownAllied.value = new Map(knownAllied.value).set(String(unitId), turn ?? currentTurn.value)
  }
  /** L'unité `id` de `known` (unité id -> tour où elle l'est devenue)
   *  est-elle connue au tour en cours ? Plus après le premier tour de nuit
   *  qui suit. */
  function knownIn(known, id) {
    const since = known.get(String(id))
    if (since == null) return false
    for (let turn = since + 1; turn <= currentTurn.value; turn++) if (NIGHT_TURNS.has(turn)) return false
    return true
  }
  /** La task force alliée `id` est-elle connue au tour en cours ? */
  function isKnownId(id) {
    return knownIn(knownAllied.value, id)
  }

  // Task forces japonaises que le joueur US connaît (contact d'un combat
  // naval, cf. en-tête) : unité id -> tour du contact ; refait au rejeu
  // avec les entrées `navalContact`. Même durée que `knownAllied`.
  const knownIjn = ref(new Map())
  /** Le joueur US vient de connaître la task force japonaise `unitId`, au
   *  tour `turn`. */
  function noteRevealed(unitId, turn = null) {
    if (!active.value || unitId == null) return
    knownIjn.value = new Map(knownIjn.value).set(String(unitId), turn ?? currentTurn.value)
  }
  /** Le joueur US connaît-il la task force japonaise `counter` ? */
  function isRevealed(counter) {
    return active.value && isIjnTaskForce(counter) && knownIn(knownIjn.value, counter.id)
  }
  /** Pion d'une task force japonaise CONNUE du joueur US (`{ src, name }`
   *  de son vrai pion TF, cf. coral-sea.json), qui remplace son drapeau sur
   *  la carte ; `null` sinon. */
  function revealedLook(counter) {
    if (!isRevealed(counter)) return null
    const tf = taskForceOf(counter)
    const look = tf && counterById(shownTaskForce(tf))
    return look?.src ? { src: look.src, name: look.name } : null
  }
  /** Le Japonais connaît-il exactement cette task force alliée ? */
  function isKnownTarget(counter) {
    return active.value && isKnownId(counter?.id)
  }

  /** Navires RÉELS de la task force alliée `counter` (cf. `alliedFleet`),
   *  cibles d'une frappe : `[{ role, key, name, type, antiAir, durability,
   *  points, damage }]` — `role` : 'carrier' ou 'escort' sur "Carrier TF",
   *  'ship' sur "Fleet TF" ; défense AA (avec ses voisins) et durabilité
   *  comme `strikeTarget` ; `damage` : ses dommages actuels (cf.
   *  lib/airStrike.js::damageOutcome). `null` si aucun navire n'y est posé. */
  function actualAlliedTargets(counter) {
    const layout = alliedFleet(counter)?.layout
    if (!layout) return null
    const placed = layout.kind === 'carrier'
      ? [...(layout.carrier ? [[layout.carrier, 'carrier']] : []), ...layout.escorts.map((entry) => [entry.ship, 'escort'])]
      : layout.slots.map((entry) => [entry.ship, 'ship'])
    const targets = placed.flatMap(([ship, role]) => {
      const target = strikeTarget(counter, ship.key)
      return target
        ? [{ role, key: ship.key, name: ship.name, type: ship.type, antiAir: target.antiAir, durability: target.durability,
            points: pointsOfAlliedType(ship.type), damage: damageOf(ship.key) }]
        : []
    })
    return targets.length ? targets : null
  }

  /** Repérage de chaque unité alliée d'après les pions "Sighted" de
   *  `counters` : unité id -> 'carrierTF' ou 'fleetTF' ("Sighted Carrier"
   *  l'emporte). */
  function sightingsOn(counters) {
    const sightings = new Map()
    for (const marker of counters) {
      if (marker.sighted === 'carrierTF' || (marker.sighted === 'fleetTF' && !sightings.has(marker.attachedTo))) sightings.set(marker.attachedTo, marker.sighted)
    }
    return sightings
  }

  /** Debug (cf. RaidOddsModal.vue) : toutes les task forces alliées que les
   *  avions `planes` d'un raid (`[{ tf }]`, cf. `raidPlan`) pourraient
   *  viser, avec ce que le Japonais en sait : `[{ id, name, status,
   *  sighting, distance, inRange, estimate, actual }]` — `status` : 'known'
   *  (cf. `isKnownId`), 'sighted' (pion "Sighted", `sighting`) ou 'unknown'
   *  ; `distance` : en hex, de la plus proche task force du raid (`inRange`
   *  : à portée, `RAID_RADIUS`) ; `estimate` : les navires que l'IA croit y
   *  trouver d'après le repérage (cf. `estimatedAlliedTargets`, `null` hors
   *  repérage) ; `actual` : ses navires réels (cf. `actualAlliedTargets`).
   *  Connues, puis repérées, puis inconnues ; les plus proches d'abord. */
  function raidCandidates(counters, planes) {
    if (!active.value) return []
    const tfs = new Set((planes ?? []).map((plane) => plane.tf))
    const raiders = counters.filter((counter) => counter.faction === 'ijn' && counter.type === 'task force' && counter.col != null
      && tfs.has(taskForceOf(counter)))
    const sightings = sightingsOn(counters)
    const estimates = estimatedAlliedTargets()
    const order = { known: 0, sighted: 1, unknown: 2 }
    return counters.filter((counter) => isAlliedTaskForce(counter) && counter.col != null).map((counter) => {
      const id = String(counter.id)
      const status = isKnownId(id) ? 'known' : sightings.has(id) ? 'sighted' : 'unknown'
      const distance = raiders.length ? Math.min(...raiders.map((unit) => hexDistance(unit, counter))) : null
      return { id, name: counter.name, status, sighting: sightings.get(id) ?? null, distance, inRange: distance != null && distance <= RAID_RADIUS,
        estimate: status === 'sighted' ? estimates[sightings.get(id)] ?? null : null, actual: actualAlliedTargets(counter) }
    }).filter((candidate) => candidate.estimate || candidate.actual)
      .sort((a, b) => order[a.status] - order[b.status] || (a.distance ?? Infinity) - (b.distance ?? Infinity))
  }

  /** Meilleurs plans des avions de puissances `powers` sur les task forces
   *  `fleets` (cf. lib/strikePlanner.js::planAcrossFleets), ou `null` sans
   *  tableaux de frappe. */
  function planRaidOptions(powers, fleets, options) {
    return airStrikeTable ? planAcrossFleets(airStrikeTable, powers, fleets, options) : null
  }

  /** Raids aériens japonais de la phase "Opérations aériennes" : les task
   *  forces japonaises dont le porte-avions est à flot (cf.
   *  `raidingTaskForces` — au scénario 5, TF1, TF2 et TF3) envoient tous les
   *  avions des cases Ready de leur porte-avions (cf. `carrierAir`) sur une
   *  TF alliée repérée ("Sighted Carrier" ou "Sighted
   *  Fleet" : toujours une vraie task force, mais un Misdirect a pu faire
   *  prendre un porte-avions pour une flotte et inversement) ou connue (cf.
   *  `isKnownId`) à 5 hex ou moins d'elles. Les avions des task forces qui frappent la même cible
   *  sont MIS EN COMMUN, et chaque frappe vise une seule TF alliée. Deux
   *  étapes :
   *   1. CHOIX DES CIBLES : pour chaque façon d'affecter ses task forces aux
   *      cibles à portée, le meilleur plan de chaque frappe (cf.
   *      lib/strikePlanner.js::planStrike : navires visés et groupes
   *      d'avions, en points de victoire espérés), sur les navires que l'IA
   *      croit y trouver — estimés d'après le repérage (cf.
   *      `estimatedAlliedTargets`), ou réels pour une task force déjà
   *      frappée (cf. `knownAllied`) ; elle garde l'affectation qui en
   *      espère le plus (à égalité, celle qui engage le plus de task forces,
   *      puis au hasard) ;
   *   2. ATTAQUE : frappée, la cible se dévoile — le plan de chaque frappe
   *      est recalculé sur ses navires RÉELS (cf. `actualAlliedTargets` ;
   *      l'estimation reste faute de composition alliée), et la task force
   *      est désormais connue.
   *  Les chasseurs, sans puissance anti-ship, accompagnent la frappe de leur
   *  task force.
   *  `[{ targetId, sighting, marker: { name, src }, raiders: [{ tf, name }], planes: [{ tf,
   *  key, name, code, face, mission, attack, src, reducedSrc }],
   *  estimatedPoints, expectedPoints,
   *  attacks: [{ target: { role, index, key, name, type }, groups,
   *  expectedPoints, outcomes }] }]` — `estimatedPoints` : points espérés au
   *  choix des cibles, `expectedPoints` : ceux de l'attaque ; `target` :
   *  navire visé (rôle et rang parmi ceux de ce rôle ; et, réel, sa clé de
   *  pion, son nom et son type) ; `groups` : index dans `planes` des avions
   *  de chaque attaque. Vide sans cible à portée ou sans tableaux de frappe. */
  function raidPlan(counters) {
    if (!active.value || !airStrikeTable) return []
    // Une entrée par TF, avec les pions qui la sont (elle, ou le leurre qui
    // la porte) et ses avions.
    const byTf = new Map()
    const raiding = new Set(raidingTaskForces())
    for (const counter of counters) {
      const tf = counter.faction === 'ijn' && counter.type === 'task force' ? taskForceOf(counter) : null
      if (raiding.has(tf)) byTf.set(tf, [...(byTf.get(tf) ?? []), counter])
    }
    const raiders = [...byTf].map(([tf, units]) => ({ tf, units, planes: (carrierAir(tf)?.ready ?? []).map((plane) => ({ tf, ...plane })) }))
      .filter((raider) => raider.planes.length)
    const sightings = sightingsOn(counters)
    // Navires que l'IA croit trouver dans chaque cible repérée (étape 1) —
    // ceux qu'elle sait y trouver, pour une task force connue.
    const estimates = estimatedAlliedTargets()
    const believed = new Map()
    for (const counter of counters) {
      const id = String(counter.id)
      if (counter.faction !== 'usn' || counter.type !== 'task force') continue
      const known = isKnownId(id)
      if (!known && !sightings.has(id)) continue
      if (known) sightings.set(id, 'known')
      const ships = (known && actualAlliedTargets(counter)) || estimates[sightings.get(id)] || estimates[roleOf(counter) === 'carrier' ? 'carrierTF' : 'fleetTF']
      if (ships) believed.set(counter, ships)
    }
    const targets = shuffle([...believed.keys()])
    const choices = raiders.map((raider) => [null, ...targets.filter((target) => raider.units.some((unit) => hexDistance(unit, target) <= RAID_RADIUS))])
    const powersOf = (planes) => planes.map((plane) => plane.attack ?? 0)

    // Étape 1 : meilleur plan de la frappe des task forces `group` (index
    // dans `raiders`) sur `target`, mémorisé.
    const strikes = new Map()
    function strikeOf(target, group) {
      const key = `${target.id}|${group.join(',')}`
      if (!strikes.has(key)) {
        const planes = group.flatMap((index) => raiders[index].planes)
        strikes.set(key, { target, group, planes, plan: planStrike(airStrikeTable, powersOf(planes), believed.get(target)).plans[0] ?? null })
      }
      return strikes.get(key)
    }

    // Toutes les affectations (au plus 4 choix par task force, 3 task forces).
    let best = null
    const assign = (index, picked) => {
      if (index < raiders.length) {
        for (const choice of choices[index]) assign(index + 1, [...picked, choice])
        return
      }
      const groups = new Map()
      picked.forEach((target, raider) => { if (target) groups.set(target, [...(groups.get(target) ?? []), raider]) })
      const struck = [...groups].map(([target, group]) => strikeOf(target, group)).filter((strike) => strike.plan)
      const points = struck.reduce((sum, strike) => sum + strike.plan.expectedPoints, 0)
      const engaged = struck.reduce((sum, strike) => sum + strike.group.length, 0)
      if (!best || points > best.points + 1e-9 || (points > best.points - 1e-9 && engaged > best.engaged)) best = { points, engaged, struck }
    }
    assign(0, [])

    // Étape 2 : l'attaque, sur les navires réels de chaque cible.
    return (best?.struck ?? []).map(({ target, group, planes, plan: estimated }) => {
      const actual = actualAlliedTargets(target)
      const plan = (actual && planStrike(airStrikeTable, powersOf(planes), actual).plans[0]) || estimated
      const ships = plan === estimated ? believed.get(target) : actual
      // Rang de chaque navire parmi ceux de son rôle.
      const rank = ships.map((ship, index) => ships.slice(0, index).filter((other) => other.role === ship.role).length)
      return {
        targetId: String(target.id),
        sighting: sightings.get(String(target.id)),
        marker: RAID_MARKER,
        raiders: group.map((index) => raiders[index].tf).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .map((tf) => ({ tf, name: raidName(tf) })),
        planes: planes.map(({ tf, key, name, code, face, mission, attack, src, reducedFace }) => ({ tf, key, name, code, face, mission, attack, src, reducedSrc: reducedFace?.src ?? null })),
        estimatedPoints: estimated.expectedPoints,
        expectedPoints: plan.expectedPoints,
        attacks: plan.attacks.map((attack) => {
          const { role, key, name, type } = ships[attack.target]
          return { ...attack, target: { role, index: rank[attack.target], ...(key && { key, name, type }) } }
        }),
      }
    })
  }

  // Tableaux de la frappe aéronavale (cf. lib/airStrike.js, coral-sea.json),
  // ou `null`.
  const airStrikeTable = active.value ? resolveAirStrikeTable(ctx.airStrike) : null

  /** Probabilités exactes d'une frappe aéronavale (cf. lib/airStrike.js::
   *  strikeOdds) : `strike` `{ antiAir, antiShip, situation }` — défense AA
   *  de la cible (cf. `strikeTarget`), puissance anti-ship du raid (cf.
   *  lib/airStrike.js::antiShipPower), situation de la cible ('dock',
   *  'landBase', rien en mer) — et, avec la durabilité `{ intact, reduced }`
   *  du navire visé (et ses dommages actuels `current`), de chaque résultat
   *  (rien, mineur, significatif, critique, coulé) : de quoi peser les
   *  attaques de l'IA. `null` sans tableaux. */
  function airStrikeOdds(strike, durability = null, current = 'none') {
    return airStrikeTable ? strikeOdds(airStrikeTable, strike, durability, current) : null
  }

  // Défense AA estimée des task forces repérées de chaque camp (cf.
  // `sightedDefense`) : camp -> estimation, calculée une fois.
  const defenseEstimates = new Map()

  /** Navires de l'ordre de bataille du camp `side` dans le scénario joué,
   *  pris dans le catalogue de ce camp — un par pion. Un id absent du
   *  catalogue est signalé en console et ignoré. */
  function orderOfBattleShips(side) {
    const catalog = new Map((ctx.fleets?.[side]?.ships ?? []).map((ship) => [ship.id, ship]))
    const ids = (ctx.scenario?.orderOfBattle?.[side] ?? []).flatMap((group) => expandShips(group.ships))
    const missing = [...new Set(ids.filter((id) => !catalog.has(id)))]
    if (missing.length) console.warn(`orderOfBattle.${side} : navires absents du catalogue — ${missing.join(', ')}`)
    return ids.filter((id) => catalog.has(id)).map((id) => catalog.get(id))
  }

  /** Défense estimée (AA, durabilité du navire visé) d'une task force
   *  repérée du camp `side`, dont on ne sait pas de quoi elle est faite : des
   *  moyennes sur l'ordre de bataille du scénario (cf.
   *  lib/ai/coralSeaPerception.js::sightedDefenseEstimate). `{ carrierTF,
   *  fleetTF }`, ou `null` hors mer de Corail. */
  function sightedDefense(side) {
    if (!active.value) return null
    if (!defenseEstimates.has(side)) defenseEstimates.set(side, sightedDefenseEstimate(orderOfBattleShips(side)))
    return defenseEstimates.get(side)
  }

  /** Probabilités d'une frappe de puissance anti-ship `antiShip` sur une task
   *  force du camp `side` repérée comme `sighting` ('carrierTF' : "Sighted
   *  Carrier", 'fleetTF' : "Sighted Fleet") : dégâts, et résultat sur le
   *  navire visé (rien, mineur, significatif, critique, coulé), d'après sa
   *  défense AA et sa durabilité estimées (cf. `sightedDefense`), arrondies à
   *  l'entier le plus proche pour lire les tableaux (cf. `airStrikeOdds`).
   *  `null` sans estimation ou sans tableaux. */
  function sightedStrikeOdds(side, sighting, antiShip) {
    const estimate = sightedDefense(side)?.[sighting]
    if (!estimate) return null
    const durability = { intact: Math.round(estimate.durability.intact), reduced: Math.round(estimate.durability.reduced) }
    return airStrikeOdds({ antiAir: Math.round(estimate.antiAir), antiShip }, durability)
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

  /** Placement initial des groupes (`placed`, pions déjà tirés dans leur
   *  plage, modifiés sur place) : cf. le moteur de placement du scénario. */
  function arrangeInitialPositions(placed, adjacentHexes) {
    if (!active.value) return
    engines.placement.arrangeInitialPositions(placed, adjacentHexes, leaders.value)
  }

  /** `role` déclaré de chaque pion (cf. coral-sea.json). */
  const declaredRoles = new Map(allCounters.map((counter) => [String(counter.id), counter.role ?? null]))

  /** Ce qu'est VRAIMENT un pion : 'carrier', 'fleet' ou 'dummy'. Un leurre
   *  japonais qui porte une task force est cette task force ; une task force
   *  sans `role` compte comme une flotte. */
  function roleOf(counter) {
    if (counter?.code !== 'Dummy') return counter?.role ?? declaredRoles.get(String(counter?.id)) ?? 'fleet'
    const tf = dummyRole(counter)?.tf
    if (!tf) return 'dummy'
    return convertedIjn.value.has(tf) ? 'fleet' : declaredRoles.get(tf) ?? 'fleet'
  }

  /** Sources de reconnaissance du camp `side` : `{ key, base, name,
   *  unitId, checks, col, row }` — `base`, nom de la base aérienne (`null`
   *  pour un porte-avions) ; `checks`, hex qu'elle explore par phase. Bases
   *  et nombre de checks : cf. le moteur de repérage du scénario. Un
   *  porte-avions japonais porté par un leurre part de l'hex du leurre, sous
   *  la clé de la task force (une seule source, même si le vrai pion est
   *  posé). */
  function reconSources(counters, side) {
    const { bases, checksPerPhase } = engines.recon
    const sources = new Map(Object.entries(bases[side] ?? {})
      .map(([id, base]) => [`base:${id}`, { key: `base:${id}`, base, name: base, unitId: null, checks: checksPerPhase.base, ...hexOfId(id) }]))
    for (const counter of counters) {
      if (counter.faction !== side || counter.type !== 'task force' || roleOf(counter) !== 'carrier') continue
      const tf = counter.code === 'Dummy' ? dummyRole(counter).tf : String(counter.id)
      if (sources.has(`tf:${tf}`)) continue
      sources.set(`tf:${tf}`, { key: `tf:${tf}`, base: null, name: counter.name, unitId: String(counter.id),
        checks: checksPerPhase.carrier[side] ?? 1, col: counter.col, row: counter.row })
    }
    return [...sources.values()]
  }

  /** Ce pion est-il une cible de reconnaissance pour le camp `side` ? Une
   *  task force ou un leurre du camp adverse, que ce camp ne connaît pas
   *  déjà (raid, contact d'un combat naval). */
  function reconTargetOf(counter, side) {
    return active.value && counter?.faction === ENEMY[side] && counter.type === 'task force'
      && !(side === 'ijn' ? isKnownId(counter.id) : isRevealed(counter))
  }

  /** Checks de reconnaissance possibles du camp `side` (japonais par
   *  défaut) : pour chaque source, les hex (`{ col, row }`) qu'elle peut
   *  explorer — une cible (cf. `reconTargetOf`) s'y trouve, à portée de la
   *  source, aucun résultat de recherche n'y a été posé PENDANT CETTE PHASE
   *  (`step`, pas de la piste noté sur le pion — un hex marqué à une phase
   *  précédente peut être exploré à nouveau ; une même source n'explore
   *  jamais deux fois le même hex dans la phase), et le moteur de repérage
   *  du scénario le permet (portée, couverture, préférences de l'IA — cf.
   *  son `createTargetFilter`). `[{ source, targets }]`, sources sans cible
   *  comprises ; `null` hors mer de Corail. */
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
    const { range, createTargetFilter } = engines.recon
    const allowed = createTargetFilter({ side, counters,
      isOwnUnit: (counter) => counter.faction === side && counter.type === 'task force',
      isTarget: (counter) => reconTargetOf(counter, side) })
    return reconSources(counters, side).map((source) => ({
      source,
      targets: allowed(source, [...enemies.values()].filter((hex) => hexDistance(source, hex) <= range)),
    }))
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
   *  check et des cibles) : le choix de l'IA de repérage du scénario (cf.
   *  son `chooseRecon`), sur ce que sait le Japonais. `{ source, target,
   *  side, action, priority, trace, options }` — `options`, nombre de
   *  couples pesés —, ou `null` sans check. */
  function reconChoice(checks, counters) {
    if (!active.value) return null
    const lastSeen = (id) => lastSightings.get(id) ?? null
    const choice = engines.recon.chooseRecon(checks, counters, { taskForceOf, behaviorOf, lastSeen })
    return choice && { ...choice, side: 'ijn' }
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

  /** Renfort de leurres japonais, tiré par le moteur de placement du
   *  scénario d'après les pions de la carte (`counters`), les repérages
   *  alliés du jour (`sightings`, id -> clé de `SIGHTINGS`, avant qu'ils ne
   *  tombent) et les leurres éliminés (`freeDummyIds`) : `{ placements: [{
   *  id, col, row }], roles, leaders }`, ou `null` s'il n'y a rien à poser
   *  (cf. `applyDummyReinforcement`). */
  function planDummyReinforcement(counters, sightings, freeDummyIds) {
    if (!active.value) return null
    return engines.placement.planDummyReinforcement({ counters, sightings, freeDummyIds })
  }

  /** Renfort de leurres du JOUEUR US, aux mêmes tours que le japonais (cf.
   *  `dummyReinforcementTurn`) : `{ total, anchors }` si `counter` est un
   *  leurre qu'il peut poser (cf. le moteur de placement du scénario),
   *  `null` sinon. Le moment (phase Mouvement US, avant tout mouvement) est
   *  vérifié par HexMap.vue. */
  function playerDummyReinforcement(counter, turnInfo) {
    if (!dummyReinforcementTurn(turnInfo)) return null
    return engines.placement.playerDummyReinforcement(counter)
  }

  /** Un VRAI leurre, d'un camp ou de l'autre : un leurre américain, ou un
   *  leurre japonais qui ne porte pas de task force (cf. `roleOf`). */
  function isPlainDummy(counter) {
    return counter?.type === 'task force' && roleOf(counter) === 'dummy'
  }

  /** Task forces sur la carte du camp ennemi de `counter`, leurres compris. */
  function enemyTaskForces(counter, counters) {
    return counters.filter((other) => other.faction === ENEMY[counter.faction] && other.type === 'task force' && other.col != null)
  }

  // Côtés d'hex du module (barrières de corail, cf. lib/edges.js).
  const edges = resolveEdges(ctx.terrain)
  /** Les hex `a` et `b` (`{ col, row }`) sont-ils adjacents : voisins, sans
   *  barrière entre eux (cf. en-tête, shared/duelRules.js) ? */
  const adjacent = (a, b) => adjacentAcross(a, b, edges)
  /** `a` et `b` sont-ils au contact : même hex, ou adjacents ? */
  const inContact = (a, b) => touching(a, b, edges)

  /** Hex ("col,row") où une task force ne peut pas entrer en mouvement (cf.
   *  en-tête) : ceux des task forces ennemies — et, pour un vrai leurre, les
   *  hex qui leur sont adjacents. `null` pour tout autre pion. */
  function barredHexes(counter, counters) {
    if (!active.value || counter?.type !== 'task force' || !ENEMY[counter.faction]) return null
    const plain = isPlainDummy(counter)
    const barred = new Set()
    for (const enemy of enemyTaskForces(counter, counters)) {
      barred.add(enemy.col + ',' + enemy.row)
      if (plain) for (const hex of neighborsOf(enemy.col, enemy.row)) if (adjacent(enemy, hex)) barred.add(hex.col + ',' + hex.row)
    }
    return barred
  }

  /** Vrais leurres au contact (même hex ou adjacent) d'une task force
   *  ennemie une fois les Mouvements des deux camps joués, retirés du jeu
   *  (cf. en-tête) : ids. */
  function movementEndRemovals(counters) {
    if (!active.value) return []
    return counters.filter((counter) => counter.col != null && isPlainDummy(counter)
      && enemyTaskForces(counter, counters).some((enemy) => inContact(enemy, counter)))
      .map((counter) => String(counter.id))
  }

  // --- Combat naval (cf. en-tête, lib/navalCombat.js) ----------------------
  // Tableau du module (`navalCombat` de coral-sea.json), ou `null`.
  const navalTable = active.value ? resolveNavalTable(ctx.navalCombat) : null

  /** Une task force qui se bat : vraie task force américaine, ou japonaise
   *  (son pion, ou le leurre qui la porte) — pas un vrai leurre. */
  function isCombatFleet(counter) {
    return counter?.type === 'task force' && counter.col != null && !!ENEMY[counter.faction] && !isPlainDummy(counter)
  }

  /** Contacts du combat naval : paires `{ ijn, usn }` (ids) de task forces
   *  ennemies au contact (cf. `inContact`), sauf celles de `excluded` (ids,
   *  déjà battues ce tour). Vide sans tableau de combat. */
  function navalContacts(counters, excluded = new Set()) {
    if (!navalTable) return []
    const fleets = counters.filter((counter) => isCombatFleet(counter) && !excluded.has(String(counter.id)))
    const usn = fleets.filter((counter) => counter.faction === 'usn')
    return fleets.filter((counter) => counter.faction === 'ijn')
      .flatMap((ijn) => usn.filter((other) => inContact(ijn, other)).map((other) => ({ ijn: String(ijn.id), usn: String(other.id) })))
  }

  /** Barème de points de victoire d'un navire du camp `side` touché, par
   *  résultat. Sans barème pour ce camp, celui de l'autre (même type). */
  function shipPoints(side, type) {
    const table = ctx.airStrike?.victoryPoints ?? {}
    return table[side]?.[type] ?? table[ENEMY[side]]?.[type] ?? [0, 0, 0, 0, 0]
  }

  /** Navires à flot de la task force `counter`, tels qu'ils se battent : `[{
   *  key, id, name, type, side, fleetId, src, intactSrc, reducedSrc, marker,
   *  damage, firepower, durability, points }]` — `src`/`marker` : face et
   *  pion de dommages du moment ; `firepower` : celle de sa face du moment
   *  (0 en dommages critiques), doublée de nuit pour les types
   *  `nightDoubled` de son camp. */
  function combatShips(counter, night) {
    const side = counter.faction
    const layout = side === 'ijn' ? fleetDisplay(counter) : alliedFleet(counter)?.layout
    if (!layout) return []
    const placed = layout.kind === 'carrier'
      ? [layout.carrier, ...layout.escorts.map((entry) => entry.ship)]
      : layout.slots.map((entry) => entry.ship)
    const catalog = new Map((ctx.fleets?.[side]?.ships ?? []).map((ship) => [ship.id, ship]))
    return [...placed, ...(layout.extra ?? [])].filter((ship) => ship && !isSunk(ship.key)).map((ship) => {
      const entry = catalog.get(ship.id)
      const damage = damageOf(ship.key)
      const { reduced, marker } = SHIP_DAMAGE[damage]
      const base = damage === 'critical' ? 0 : ((reduced ? entry?.damaged?.firepower : null) ?? entry?.intact?.firepower ?? 0)
      const doubled = night && (navalTable.nightDoubled[side] ?? []).includes(ship.type)
      return {
        key: ship.key, id: ship.id, name: ship.name, type: ship.type, side, fleetId: String(counter.id),
        src: (reduced && ship.reducedSrc) || ship.src, intactSrc: ship.src, reducedSrc: ship.reducedSrc ?? null,
        marker, damage, firepower: doubled ? base * 2 : base,
        durability: { intact: entry?.intact?.durability ?? 0, reduced: entry?.damaged?.durability ?? 0 },
        points: shipPoints(side, ship.type),
      }
    })
  }

  /** Bataille entre les task forces `fleetIds` (des deux camps) au tour
   *  `turn` : `{ key, fleetIds, night, ships: { ijn, usn }, ranges }` —
   *  `ranges` : portées possibles de jour, la plus longue d'abord (cf.
   *  lib/navalCombat.js::rangeOptions), vide de nuit. */
  function navalBattle(fleetIds, counters, turn) {
    const ids = new Set(fleetIds.map(String))
    const night = NIGHT_TURNS.has(turn)
    const ships = { ijn: [], usn: [] }
    // Une task force japonaise ne compte qu'une fois, même si son leurre et
    // son vrai pion sont tous deux sur la carte (cf. `taskForceOf`).
    const seen = new Set()
    for (const counter of counters) {
      if (!ids.has(String(counter.id)) || !isCombatFleet(counter)) continue
      const tf = counter.faction === 'ijn' ? taskForceOf(counter) : String(counter.id)
      if (seen.has(tf)) continue
      seen.add(tf)
      ships[counter.faction].push(...combatShips(counter, night))
    }
    return { key: `${turn}|${[...ids].sort().join(',')}`, turn, fleetIds: [...ids], night, ships,
      ranges: night ? [] : rangeOptions(navalTable, [...ships.ijn, ...ships.usn]) }
  }

  /** Navires du camp `side` qui tirent dans `battle` à la portée `range`
   *  (tous de nuit ; personne de jour sans portée, cf. `rangeOptions`). */
  function navalFiring(battle, side, range) {
    if (!battle.night && range == null) return []
    return firingShips(navalTable, battle.ships[side], battle.night ? null : range)
  }

  /** Meilleur plan de tir du camp `side` dans `battle` à la portée `range`
   *  (cf. lib/navalCombat.js::planNavalAttacks), en points de victoire
   *  espérés : `{ expectedPoints, attacks: [{ side, shooters, target }] }`
   *  (clés de pions navires, dans l'ordre de résolution). Mémorisé pour le
   *  tour de la bataille (un round par tour : la mémoire repart à neuf au
   *  tour suivant, elle ne grossit pas de partie en partie). */
  const navalPlans = new Map()
  let navalPlansTurn = null
  function navalPlan(battle, side, range) {
    if (battle.turn !== navalPlansTurn) {
      navalPlans.clear()
      navalPlansTurn = battle.turn
    }
    const key = `${battle.key}|${side}|${range}|${battle.ships.ijn.concat(battle.ships.usn).map((ship) => ship.damage).join('')}`
    if (!navalPlans.has(key)) {
      const shooters = navalFiring(battle, side, range)
      const targets = battle.ships[ENEMY[side]]
      const plan = planNavalAttacks(navalTable, shooters.map((ship) => ship.firepower), targets, navalTable.bonus[side] ?? 0)
      navalPlans.set(key, { expectedPoints: plan.expectedPoints,
        attacks: plan.attacks.map((attack) => ({ side, shooters: attack.shooters.map((index) => shooters[index].key), target: targets[attack.target].key })) })
    }
    return navalPlans.get(key)
  }

  /** Ce que la bataille rapporte au Japonais à la portée `range` : ses
   *  points espérés moins ceux du joueur US, chacun tirant au mieux. */
  function navalBalance(battle, range) {
    return navalPlan(battle, 'ijn', range).expectedPoints - navalPlan(battle, 'usn', range).expectedPoints
  }

  /** Portée plus courte que le moteur japonais propose dans `battle` : la
   *  plus rentable pour lui, si elle l'est plus que la portée la plus
   *  longue ; `null` sinon (et de nuit). */
  function navalRangeProposal(battle) {
    if (battle.night || battle.ranges.length < 2) return null
    let best = { range: null, value: navalBalance(battle, battle.ranges[0]) }
    for (const range of battle.ranges.slice(1)) {
      const value = navalBalance(battle, range)
      if (value > best.value + 1e-9) best = { range, value }
    }
    return best.range
  }

  /** Le moteur japonais accepte-t-il la portée `range` proposée par le
   *  joueur US ? Seulement si elle lui rapporte plus que la plus longue. */
  function navalAcceptsRange(battle, range) {
    return navalBalance(battle, range) > navalBalance(battle, battle.ranges[0]) + 1e-9
  }

  /** Organisation des combats que décide le moteur japonais quand il a
   *  l'initiative : pour chaque groupe de task forces en contact (les
   *  groupes ne se touchent pas : chacun s'organise seul), parmi toutes les
   *  façons de le découper en batailles (chaque task force dans une
   *  bataille, chaque bataille d'un seul tenant), celle qui lui rapporte le
   *  plus (cf. `navalBalance`, à la portée la plus longue — c'est elle qui
   *  s'applique tant que l'adversaire n'accepte rien d'autre). Au-delà de
   *  `MAX_SPLIT_CONTACTS` contacts dans un groupe, il s'y bat en une seule
   *  bataille. `{ battles: [[ids]], arrows: [{ from, to }] }` — flèches de
   *  ses task forces vers celles qu'elles attaquent. */
  function planNavalBattles(contacts, counters, turn) {
    const value = new Map()
    const valueOf = (ids) => {
      const key = [...ids].sort().join(',')
      if (!value.has(key)) {
        const battle = navalBattle(ids, counters, turn)
        value.set(key, navalBalance(battle, battle.ranges[0] ?? null))
      }
      return value.get(key)
    }
    const pairOf = (contact) => [contact.ijn, contact.usn]
    const battles = connectedGroups(contacts.map(pairOf)).flatMap((group) => {
      const members = new Set(group)
      const links = contacts.filter((contact) => members.has(contact.ijn))
      if (links.length > MAX_SPLIT_CONTACTS) return [group]
      let best = null
      for (let mask = 1; mask < 1 << links.length; mask++) {
        const chosen = links.filter((_, index) => mask & (1 << index))
        if (new Set(chosen.flatMap(pairOf)).size !== group.length) continue
        const split = connectedGroups(chosen.map(pairOf))
        const total = split.reduce((sum, ids) => sum + valueOf(ids), 0)
        if (!best || total > best.total + 1e-9) best = { total, split }
      }
      return best?.split ?? [group]
    })
    const battleOf = new Map(battles.flatMap((ids, index) => ids.map((id) => [id, index])))
    const arrows = contacts.filter((contact) => battleOf.get(contact.ijn) === battleOf.get(contact.usn))
      .map((contact) => ({ from: contact.ijn, to: contact.usn }))
    return { battles, arrows }
  }

  /** Résout les attaques `attacks` (`[{ side, shooters, target }]`, clés de
   *  pions navires, dans leur ordre) de `battle` — les dés sont tirés ici :
   *  `[{ side, shooters, target, firepower, die, bonus, damage, before, after
   *  }]`. Tout se résout en même temps : chaque tireur garde la puissance
   *  qu'il avait avant le combat ; chaque navire visé passe d'état en état,
   *  attaque après attaque, sans que les dégâts s'additionnent. */
  function resolveNavalAttacks(battle, attacks) {
    const byKey = new Map([...battle.ships.ijn, ...battle.ships.usn].map((ship) => [ship.key, ship]))
    const states = new Map()
    return attacks.map((attack) => {
      const target = byKey.get(attack.target)
      const firepower = attack.shooters.reduce((sum, key) => sum + (byKey.get(key)?.firepower ?? 0), 0)
      const die = 1 + Math.floor(Math.random() * navalTable.die)
      const bonus = navalTable.bonus[attack.side] ?? 0
      const damage = navalDamage(navalTable, firepower, die + bonus)
      const before = states.get(attack.target) ?? target.damage
      const after = damageOutcome(damage, target.durability, before)
      states.set(attack.target, after)
      return { ...attack, firepower, die, bonus, damage, before, after }
    })
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
  /** Clé de pion du `index`-ième navire (`id`) de la task force japonaise
   *  `tf` : propre à cette task force (deux DD de deux task forces
   *  différentes ne se confondent pas, cf. `shipDamage`). */
  const ijnShipKey = (tf, id, index) => `${tf}:${id}-${index}`

  // --- Cycle des avions japonais sur le support de leur porte-avions :
  // chaque avion est dans une ZONE — 'ready', 'cap', 'raid' (sur la carte),
  // 'landingMap', 'landingCap' ou 'reserve' — et n'avance que d'une zone à
  // la fois :
  //   - seuls ceux des cases Ready partent en opération (raid, cf.
  //     `launchRaid` ; C.A.P., que l'IA ne décide pas encore) ;
  //   - à la fin du raid, dans la même phase, ils vont en "Landing from Map"
  //     (cf. `landFromRaid`) ; à la fin de la phase d'Opérations aériennes
  //     japonaise, ceux en C.A.P. vont en "Landing from C.A.P." ;
  //   - au début de la phase d'Opérations aériennes japonaise (cf.
  //     `airCycle`) : "Landing from Map" -> Reserve, puis "Landing from
  //     C.A.P." et Reserve -> Ready, dans la limite de 4 points (cf.
  //     lib/airGroups.js::chooseReady : 1 point de F, le plus de T, de DB,
  //     de points) ; ceux de "Landing from C.A.P." qui n'entrent pas vont en
  //     Reserve, ceux de la Reserve y restent.
  // Déduit du journal (entrées `raid`, `raidEnd` et pas de la piste) : le
  // rejeu et les autres joueurs refont le même cycle.
  const READY_POINTS = FLEET_DISPLAYS.carrier.ready.length
  // Zone de chaque avion qui a bougé (clé de pion -> zone) ; les autres sont
  // dans leur zone de départ (cf. `startZonesOf`).
  const airZones = ref({})
  // Zones de départ, par task force : les meilleures cases Ready (cf.
  // `chooseReady`), le reste en Reserve.
  const startZones = new Map()

  /** Pions avions du porte-avions de la task force japonaise `tf` (groupe
   *  aérien du scénario ; clé `tf/clé`, propre à cette task force), ou
   *  `null` sans porte-avions — ou s'il est coulé. */
  function carrierCounters(tf) {
    const types = new Map((ctx.fleets?.ijn?.ships ?? []).map((ship) => [ship.id, ship.type]))
    const carrier = (taskForceRole(tf)?.ships ?? [])
      .find((id, index) => CARRIER_TYPES.has(types.get(id)) && !isSunk(ijnShipKey(tf, id, index)))
    if (!carrier) return null
    return airGroupCounters(ctx.scenario?.airGroups?.ijn?.[carrier], ctx.air?.ijn)
      .map((plane) => ({ ...plane, key: `${tf}/${plane.key}` }))
  }
  function startZonesOf(tf, counters) {
    if (!startZones.has(tf)) {
      const ready = new Set(chooseReady([], counters, READY_POINTS).map((plane) => plane.key))
      startZones.set(tf, new Map(counters.map((plane) => [plane.key, ready.has(plane.key) ? 'ready' : 'reserve'])))
    }
    return startZones.get(tf)
  }

  /** Task forces japonaises qui lancent des raids : celles de la formation
   *  (rôles des leurres, cf. le moteur `fleets` du scénario) dont le
   *  porte-avions est à flot (cf. `carrierCounters`). */
  function raidingTaskForces() {
    return [...new Set(Object.values(dummyRoles.value).map((role) => role.tf).filter(Boolean))].filter((tf) => carrierCounters(tf))
  }
  /** Nom au journal d'un raid de la task force `tf` : "Raid TF1". */
  const raidName = (tf) => `Raid ${taskForceRole(tf)?.code ?? tf}`

  /** Avions du porte-avions de la task force japonaise `tf`, selon leurs
   *  pertes (cf. `planeStateOf`), par zone : `{ ready, reserve, cap, raid,
   *  landing, landingCap, lost }` — `landing` : "Landing from Map" ; `lost`
   *  : les éliminés. `null` sans porte-avions — ou s'il est coulé. */
  function carrierAir(tf) {
    const counters = carrierCounters(tf)
    if (!counters) return null
    const start = startZonesOf(tf, counters)
    const { planes, lost } = withPlaneStates(counters, planeStateOf)
    const inZone = (zone) => planes.filter((plane) => (airZones.value[plane.key] ?? start.get(plane.key)) === zone)
    return { ready: inZone('ready'), reserve: inZone('reserve'), cap: inZone('cap'), raid: inZone('raid'),
      landing: inZone('landingMap'), landingCap: inZone('landingCap'), lost }
  }

  function moveAir(keys, zone) {
    if (active.value && keys?.length) airZones.value = { ...airZones.value, ...Object.fromEntries(keys.map((key) => [key, zone])) }
  }
  /** Les avions `keys` partent en raid (cf. HexMap.vue::placeRaidMarkers). */
  function launchRaid(keys) {
    moveAir(keys, 'raid')
  }
  /** Les avions `keys` rentrent de raid (cf. HexMap.vue::endRaid). */
  function landFromRaid(keys) {
    moveAir(keys, 'landingMap')
  }

  // Pas de la piste où la phase d'Opérations aériennes japonaise a commencé
  // (cf. `airCycle`), ou `null`.
  let airOpsStep = null
  /** À chaque pas de la piste, et dès que son camp est connu (ordre tiré au
   *  dé) : `phaseId` et `side` du créneau du pas `step`. Le premier appel
   *  d'une phase d'Opérations aériennes japonaise fait avancer les avions au
   *  pont ; le premier pas suivant fait rentrer ceux en C.A.P. */
  function airCycle(step, phaseId, side) {
    if (!active.value) return
    if (airOpsStep != null && step !== airOpsStep) {
      for (const tf of raidingTaskForces()) moveAir(carrierAir(tf)?.cap.map((plane) => plane.key), 'landingCap')
      airOpsStep = null
    }
    if (phaseId !== RAID_PHASE || side !== 'ijn' || airOpsStep === step) return
    airOpsStep = step
    for (const tf of raidingTaskForces()) {
      const air = carrierAir(tf)
      if (!air) continue
      // Un raid jamais terminé compte comme rentré : en Reserve lui aussi.
      moveAir([...air.landing, ...air.raid].map((plane) => plane.key), 'reserve')
      const chosen = chooseReady(air.ready, [...air.landingCap, ...air.reserve], READY_POINTS)
      moveAir(chosen.map((plane) => plane.key), 'ready')
      // "Landing from C.A.P." sans place en Ready : en Reserve.
      moveAir(air.landingCap.filter((plane) => !chosen.includes(plane)).map((plane) => plane.key), 'reserve')
    }
  }
  /** Nouveau rejeu : chaque avion dans sa zone de départ. */
  function restoreAirZones() {
    if (!active.value) return
    airZones.value = {}
    airOpsStep = null
  }

  /** Navires de la task force que ce pion EST VRAIMENT (cf. `taskForceOf`),
   *  posés sur son support : `{ kind: 'carrier', carrier, escorts: [{ ship,
   *  cell }], extra }` (case d'escorte de `FLEET_DISPLAYS.carrier`) ou `{
   *  kind: 'fleet', slots: [{ ship, slot }], extra }` (case 0 à 8) ;
   *  `extra` : navires de trop pour les cases. Chaque navire : `{ key, id,
   *  name, type, src }` (face intacte du catalogue). Sur "Carrier TF", `air`
   *  : les avions du porte-avions, selon leurs pertes du moment (cf.
   *  `carrierAir`). Les navires coulés n'y sont plus
   *  (`carrier` nul, sans avions, pour un porte-avions coulé) ; `sunk` les
   *  liste. Une task force qui a perdu ses porte-avions est sur "Fleet TF"
   *  (cf. `convertFleet`). `null` : pas une task force japonaise, vrai
   *  leurre, ou composition inconnue (journal antérieur aux formations,
   *  catalogue manquant). */
  function fleetDisplay(counter) {
    if (!active.value || !isIjnTaskForce(counter)) return null
    const tf = taskForceOf(counter)
    if (!tf) return null
    const drawn = drawnLayout(tf)
    if (!drawn) return null
    // Plus de porte-avions à flot : "Fleet TF" tout de suite, sans attendre
    // que la task force change de pion (cf. `convertFleet`).
    const layout = convertedIjn.value.has(tf) || !carrierCounters(tf) ? asFleetLayout(drawn) : drawn
    const afloat = (ship) => !isSunk(ship.key)
    const sunk = [layout.carrier, ...(layout.escorts ?? []).map((entry) => entry.ship), ...(layout.slots ?? []).map((entry) => entry.ship), ...layout.extra]
      .filter((ship) => ship && !afloat(ship))
    if (layout.kind !== 'carrier') {
      return sunk.length
        ? { ...layout, slots: layout.slots.filter((entry) => afloat(entry.ship)), extra: layout.extra.filter(afloat), sunk }
        : { ...layout, sunk }
    }
    // Avions : ceux du moment (pertes comprises) ; aucun, porte-avions coulé.
    const air = carrierAir(tf)
    return sunk.length
      ? { ...layout, carrier: afloat(layout.carrier) ? layout.carrier : null, air,
          escorts: layout.escorts.filter((entry) => afloat(entry.ship)), extra: layout.extra.filter(afloat), sunk }
      : { ...layout, air, sunk }
  }

  /** Disposition tirée de la task force japonaise `tf` (cf. `fleetDisplay`),
   *  tous ses navires compris, ou `null`. */
  function drawnLayout(tf) {
    if (displayLayouts.has(tf)) return displayLayouts.get(tf)
    const catalog = new Map((ctx.fleets?.ijn?.ships ?? []).map((ship) => [ship.id, ship]))
    const ships = (taskForceRole(tf)?.ships ?? [])
      .map((id, index) => {
        const ship = catalog.get(id)
        return ship && { key: ijnShipKey(tf, id, index), id, name: ship.name, type: ship.type, src: ship.intact?.src, reducedSrc: ship.damaged?.src ?? null }
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

  /** Disposition "Fleet TF" d'une task force qui a perdu ses porte-avions
   *  (cf. `convertFleet`), tirée de sa disposition `layout` : ses navires à
   *  flot dans les cases 1 à 9, dans l'ordre des cases de "Carrier TF"
   *  (escortes, puis navires de trop) ; les coulés en `extra` (cf.
   *  `fleetDisplay`, qui les en sort). */
  function asFleetLayout(layout) {
    if (layout.kind !== 'carrier') return layout
    const ships = [layout.carrier, ...[...layout.escorts].sort((a, b) => a.cell - b.cell).map((entry) => entry.ship), ...layout.extra]
    const afloat = ships.filter((ship) => !isSunk(ship.key))
    const slots = FLEET_DISPLAYS.fleet.slots.length
    return { kind: 'fleet', slots: afloat.slice(0, slots).map((ship, slot) => ({ ship, slot })),
      extra: [...afloat.slice(slots), ...ships.filter((ship) => isSunk(ship.key))] }
  }

  /** Cible `shipKey` (clé d'un navire du support, cf. `fleetDisplay` et,
   *  pour une task force alliée, `alliedFleet`) de la task force que ce pion
   *  EST : `{ ship, defenders, antiAir, durability }`
   *  — `defenders`, les navires qui la défendent (cf. `strikeDefenders`) ;
   *  `antiAir`, la somme de leur défense AA ; `durability`, `{ intact,
   *  reduced }` du navire visé (cf. lib/airStrike.js::damageOutcome). La
   *  défense AA de chacun est celle de sa face du moment (cf. `shipDamage` :
   *  face réduite, 0 en dommages critiques) ; la durabilité, celle du
   *  catalogue. `null` : pas de support, ou navire absent du catalogue de
   *  son camp. */
  function strikeTarget(counter, shipKey) {
    const layout = isIjnTaskForce(counter) ? fleetDisplay(counter) : alliedFleet(counter)?.layout
    if (!layout) return null
    const catalog = new Map((ctx.fleets?.[counter.faction]?.ships ?? []).map((ship) => [ship.id, ship]))
    const defenders = strikeDefenders(layout, shipKey)
    const target = catalog.get(defenders[0]?.id)
    if (!target) return null
    const antiAirOf = (ship) => {
      const entry = catalog.get(ship.id)
      const damage = damageOf(ship.key)
      if (damage === 'critical') return 0
      return (SHIP_DAMAGE[damage].reduced ? entry?.damaged?.antiAir : null) ?? entry?.intact?.antiAir ?? 0
    }
    return {
      ship: defenders[0],
      defenders,
      antiAir: defenders.reduce((sum, ship) => sum + antiAirOf(ship), 0),
      durability: { intact: target.intact.durability, reduced: target.damaged?.durability ?? 0 },
    }
  }

  // --- Dommages des navires, des deux camps (cf. `SHIP_DAMAGE`) : clé de
  // pion navire (cf. `fleetDisplay`, `alliedGroups`) -> 'minor',
  // 'significant' ou 'critical' ; absent, intact. Posés par le joueur sur
  // les supports (cf. FleetDisplayModal.vue, TaskForceComposer.vue),
  // inscrits au journal (entrée `shipDamage`).
  const shipDamage = ref({})
  /** Dommages du navire `key` : 'none', 'minor', 'significant' ou
   *  'critical'. */
  function damageOf(key) {
    return shipDamage.value[key] ?? 'none'
  }
  /** Le navire `key` passe à l'état `state` (cf. `SHIP_DAMAGE`). Coulé, il
   *  quitte la composition de sa task force alliée (avec ses avions, pour un
   *  porte-avions) ; un navire japonais coulé disparaît de son support (cf.
   *  `fleetDisplay`). */
  function setShipDamage(key, state) {
    if (!active.value || !key || !SHIP_DAMAGE[state]) return
    const next = { ...shipDamage.value }
    if (state === 'none') delete next[key]
    else next[key] = state
    shipDamage.value = next
    if (SHIP_DAMAGE[state].sunk) {
      const fleets = {}
      for (const [tf, cells] of Object.entries(alliedFleets.value)) {
        if (cells.carrier === key && declaredRoles.get(tf) === 'carrier') carrierLost.add(tf)
        const kept = Object.fromEntries(Object.entries(cells).filter(([cell, shipKey]) => (isAirCell(cell) ? carrierOfPlane(shipKey) : shipKey) !== key))
        if (Object.keys(kept).length) fleets[tf] = kept
      }
      alliedFleets.value = fleets
    }
  }
  const isSunk = (key) => !!SHIP_DAMAGE[damageOf(key)]?.sunk
  // "Carrier TF" alliées dont le porte-avions a coulé (cf. `isCarrierless`) :
  // refaites au rejeu avec les entrées `shipDamage`.
  const carrierLost = new Set()
  /** Dommages lus dans le journal ; `null` les efface (nouveau rejeu). */
  function restoreShipDamage(damage) {
    if (!active.value) return
    shipDamage.value = damage ? { ...damage } : {}
    carrierLost.clear()
  }

  // --- Pertes des avions, des deux camps (cf. `PLANE_STATES`) : clé de pion
  // avion (cf. `carrierAir`, `alliedDeck`) -> 'reduced' ou 'eliminated' ;
  // absent, intact. Posées par le joueur au clic droit sur un avion (cf.
  // FleetDisplayModal.vue, TaskForceComposer.vue), inscrites au journal
  // (entrée `planeState`). Elles changent les groupes aériens : face
  // réduite, éliminés retirés — et donc les raids japonais.
  const planeDamage = ref({})
  /** Pertes de l'avion `key` : 'none', 'reduced' ou 'eliminated'. */
  function planeStateOf(key) {
    return planeDamage.value[key] ?? 'none'
  }
  /** L'avion `key` passe à l'état `state` (cf. `PLANE_STATES`). */
  function setPlaneState(key, state) {
    if (!active.value || !key || !PLANE_STATES.includes(state)) return
    const next = { ...planeDamage.value }
    if (state === 'none') delete next[key]
    else next[key] = state
    planeDamage.value = next
  }
  /** Pertes lues dans le journal ; `null` les efface (nouveau rejeu). */
  function restorePlaneDamage(damage) {
    if (active.value) planeDamage.value = damage ? { ...damage } : {}
  }

  // --- Composition des task forces alliées (cf. en-tête) : task force ->
  // `{ case -> clé de pion navire }` (cases : cf. `displayCells`).
  const alliedFleets = ref({})

  /** Pions navires de l'ordre de bataille allié, par groupe : `[{ id, name,
   *  ships: [{ key, id, name, type, src }] }]` — `key` distingue les pions
   *  d'un même navire ('usn-dd#1', 'usn-dd#2'...). Un navire absent du
   *  catalogue (ou sans image) est laissé de côté. */
  const alliedGroups = (() => {
    if (!active.value) return []
    const catalog = new Map((ctx.fleets?.usn?.ships ?? []).map((ship) => [ship.id, ship]))
    const seen = new Map()
    return (ctx.scenario?.orderOfBattle?.usn ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      ships: expandShips(group.ships).filter((id) => catalog.get(id)?.intact?.src).map((id) => {
        const n = (seen.get(id) ?? 0) + 1
        seen.set(id, n)
        const ship = catalog.get(id)
        return { key: `${id}#${n}`, id, name: ship.name, type: ship.type, src: ship.intact.src, reducedSrc: ship.damaged?.src ?? null }
      }),
    }))
  })()
  const alliedShips = new Map(alliedGroups.flatMap((group) => group.ships).map((ship) => [ship.key, ship]))

  /** Une vraie task force alliée (pas un leurre). */
  function isAlliedTaskForce(counter) {
    return counter?.faction === 'usn' && counter.type === 'task force' && counter.code !== 'Dummy'
  }

  /** Le navire `type` (CV, CA...) peut-il aller dans la case `cell` (cf.
   *  `displayCells`) ? Un porte-avions dans la case centrale de "Carrier
   *  TF", et elle ne prend que lui. */
  function alliedShipFits(type, cell) {
    return CARRIER_TYPES.has(type) === (cell === 'carrier')
  }

  /** Task force alliée de ce pion, telle que le joueur l'a composée : `{
   *  tf, kind, cellIds, cells, layout }` — `kind`, son support ('carrier'
   *  pour une task force de porte-avions, sinon 'fleet') ; `cellIds`, ses
   *  cases (cf. `displayCells`) ; `cells`, case -> clé de
   *  pion navire ; `layout`, la même chose sous la forme de `fleetDisplay`
   *  (`carrier` nul sans porte-avions). `null` : pas une task force alliée,
   *  ou pas d'ordre de bataille allié. */
  function alliedFleet(counter) {
    if (!active.value || !alliedShips.size || !isAlliedTaskForce(counter)) return null
    const tf = String(counter.id)
    const kind = roleOf(counter) === 'carrier' ? 'carrier' : 'fleet'
    const cellIds = displayCells(kind)
    const stored = Object.entries(alliedFleets.value[tf] ?? {})
    const cells = Object.fromEntries(stored.filter(([cell, key]) => cellIds.includes(cell) && alliedShips.has(key) && !isSunk(key)))
    const ship = (cell) => alliedShips.get(cells[cell]) ?? null
    const layout = kind === 'carrier'
      ? { kind, carrier: ship('carrier'), escorts: ALLIED_FLEET_DISPLAYS.carrier.escorts.map((_, cell) => ({ ship: ship(`escort${cell}`), cell })).filter((entry) => entry.ship), extra: [] }
      : { kind, slots: ALLIED_FLEET_DISPLAYS.fleet.slots.map((_, slot) => ({ ship: ship(`slot${slot}`), slot })).filter((entry) => entry.ship), extra: [] }
    // Avions du porte-avions posé : ceux des cases Ready et Reserve
    // enregistrées, sinon sa mise en place par défaut (cf. `alliedDeck`).
    if (layout.carrier) {
      const deck = alliedDeck(layout.carrier.key)
      const planes = new Map(deck.planes.map((plane) => [plane.key, plane]))
      const air = stored.filter(([cell, key]) => isAirCell(cell) && planes.has(key))
      for (const [cell, key] of air.length ? air : deck.ready.map((plane, index) => [READY_CELLS[index], plane.key])) cells[cell] = key
      const ready = READY_CELLS.map((cell) => planes.get(cells[cell]) ?? null)
      const zone = (name) => Object.entries(cells).filter(([cell]) => cell.replace(/\d+$/, '') === name).map(([, key]) => planes.get(key)).filter(Boolean)
      const away = new Set([...zone('cap'), ...zone('landingMap'), ...zone('landingCap')])
      layout.air = { ready, reserve: deck.planes.filter((plane) => !ready.includes(plane) && !away.has(plane)),
        cap: zone('cap'), landing: zone('landingMap'), landingCap: zone('landingCap'), lost: deck.lost }
    }
    return { tf, kind, cellIds, airCellIds: kind === 'carrier' ? READY_CELLS : [], cells, layout }
  }

  // Pions avions de chaque porte-avions allié (pion navire -> pions, cf.
  // `alliedDeck`), tirés une fois du groupe aérien.
  const alliedDecks = new Map()
  /** Avions du porte-avions allié de clé de pion `shipKey` (groupe aérien
   *  du scénario, `airGroups.usn`), selon leurs pertes (cf. `planeStateOf`),
   *  et leur mise en place par défaut sur le support (cf.
   *  lib/airGroups.js::deckAircraft) : `{ planes, ready, reserve, lost }` —
   *  `planes`, ceux encore en jeu ; `lost`, les éliminés ; chaque avion avec
   *  une clé de pion propre (`shipKey/rang`). Rien pour un navire sans
   *  groupe aérien. */
  function alliedDeck(shipKey) {
    if (!alliedDecks.has(shipKey)) {
      const id = alliedShips.get(shipKey)?.id
      alliedDecks.set(shipKey, airGroupCounters(ctx.scenario?.airGroups?.usn?.[id], ctx.air?.usn)
        .map((plane, index) => ({ ...plane, key: `${shipKey}/${index}` })))
    }
    const { planes, lost } = withPlaneStates(alliedDecks.get(shipKey), planeStateOf)
    return { planes, ...deckAircraft(planes, READY_CELLS.length), lost }
  }

  /** Le joueur US peut-il frapper `target` à sa phase d'Opérations
   *  aériennes : une de ses task forces avec un porte-avions (celui posé au
   *  centre de sa composition, cf. `alliedFleet`) est-elle à 5 hex ou moins
   *  (`RAID_RADIUS`, la portée des raids japonais) ? Sans aucune composition
   *  enregistrée (journal antérieur aux compositions), une task force de
   *  porte-avions (`role` "carrier") compte pour un porte-avions. */
  function alliedAirReach(target, counters) {
    if (!active.value) return true
    const composed = Object.keys(alliedFleets.value).length > 0
    return counters.some((counter) => isAlliedTaskForce(counter) && counter.col != null
      && (composed ? !!alliedFleet(counter)?.layout.carrier : roleOf(counter) === 'carrier')
      && hexDistance(counter, target) <= RAID_RADIUS)
  }

  /** Task force alliée de chaque pion navire posé : clé -> task force. */
  function alliedAssignments() {
    const out = new Map()
    for (const [tf, cells] of Object.entries(alliedFleets.value)) {
      for (const [cell, key] of Object.entries(cells)) if (!isAirCell(cell)) out.set(key, tf)
    }
    return out
  }

  /** Nouvelle composition `cells` de la task force `tf` (navires, et avions
   *  de son porte-avions) : ses navires quittent les autres task forces où
   *  ils étaient — un porte-avions avec ses avions. Rend toutes les
   *  compositions, à inscrire au journal (cf. `restoreAlliedFleets`). */
  function setAlliedFleet(tf, cells) {
    const taken = new Set(Object.values(cells))
    const next = {}
    for (const [other, otherCells] of Object.entries(alliedFleets.value)) {
      if (other === tf) continue
      const kept = Object.fromEntries(Object.entries(otherCells)
        .filter(([cell, key]) => !taken.has(isAirCell(cell) ? carrierOfPlane(key) : key)))
      if (Object.keys(kept).length) next[other] = kept
    }
    if (taken.size) next[tf] = { ...cells }
    alliedFleets.value = next
    return next
  }

  /** Compositions lues dans le journal (rejeu, partie en ligne) ; `null`
   *  les vide (nouveau rejeu). */
  function restoreAlliedFleets(fleets) {
    if (active.value) alliedFleets.value = fleets ? { ...fleets } : {}
  }

  // --- CARRIER TF SANS PORTE-AVIONS (cf. HexMap.vue::
  // convertCarrierlessFleets) : une "Carrier TF", d'un camp comme de
  // l'autre, dont le dernier porte-avions coule devient une "Fleet TF" —
  // elle prend le pion "Fleet TF" libre de plus petit numéro et la
  // disposition "Fleet TF" (cf. `convertFleet`) ; son ancien pion redevient
  // disponible.

  /** La "Carrier TF" `tf` a-t-elle perdu ses porte-avions — aucun à flot —,
   *  sans avoir encore changé de pion ? */
  function isCarrierless(tf) {
    if (!active.value || declaredRoles.get(tf) !== 'carrier' || convertedIjn.value.has(tf)) return false
    // Une task force alliée peut être composée sans porte-avions : seule
    // celle dont le porte-avions a coulé l'a perdu.
    return counterById(tf)?.faction === 'ijn' ? !carrierCounters(tf) : carrierLost.has(tf) && !alliedFleets.value[tf]?.carrier
  }

  /** Pion "Fleet TF" libre de plus petit numéro du camp de la task force
   *  `tf` — ni sur la carte (`counters`), ni éliminé (`eliminated`, ids),
   *  ni montré par une task force japonaise (formation, conversion) —, ou
   *  `null`. */
  function freeFleetTaskForce(tf, counters, eliminated = new Set()) {
    if (!active.value) return null
    const side = counterById(tf)?.faction
    const used = new Set([...counters.map((counter) => String(counter.id)), ...eliminated,
      ...Object.values(dummyRoles.value).map((role) => role.tf).filter(Boolean), ...convertedIjn.value.values()])
    const number = (counter) => Number(String(counter.code ?? '').replace(/\D/g, '')) || 0
    const free = allCounters
      .filter((counter) => counter.faction === side && counter.type === 'task force' && counter.role === 'fleet' && !used.has(String(counter.id)))
      .sort((a, b) => number(a) - number(b))
    return free.length ? String(free[0].id) : null
  }

  /** La "Carrier TF" `from` devient la "Fleet TF" `to` — en jeu comme au
   *  rejeu (entrée `fleetConversion`). Japonaise : elle garde son identité
   *  et montre désormais le pion `to` (cf. `shownTaskForce`), sur "Fleet
   *  TF" (cf. `asFleetLayout`), au comportement de ses navires à flot (cf.
   *  `behaviorOf`). Alliée : sa composition passe à `to` — ses escortes
   *  dans les premières cases de "Fleet TF", dans l'ordre —, et ce que le
   *  Japonais savait d'elle aussi ; HexMap.vue remplace son pion sur la
   *  carte. */
  function convertFleet(from, to) {
    if (!active.value || !from || !to) return
    if (counterById(from)?.faction === 'ijn') {
      convertedIjn.value = new Map(convertedIjn.value).set(from, to)
      return
    }
    const cells = alliedFleets.value[from] ?? {}
    const escorts = displayCells('carrier').filter((cell) => cell !== 'carrier').map((cell) => cells[cell]).filter(Boolean)
    carrierLost.delete(from)
    const next = { ...alliedFleets.value }
    delete next[from]
    delete next[to]
    if (escorts.length) next[to] = Object.fromEntries(escorts.map((key, slot) => [`slot${slot}`, key]))
    alliedFleets.value = next
    if (knownAllied.value.has(from)) {
      const known = new Map(knownAllied.value)
      known.set(to, known.get(from))
      known.delete(from)
      knownAllied.value = known
    }
    if (lastSightings.has(from)) {
      lastSightings.set(to, lastSightings.get(from))
      lastSightings.delete(from)
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
    // avec ses entrées `search` (cf. `noteSighting`), celle des task forces
    // connues avec ses entrées `raid` (cf. `noteRaided`) et `navalContact`
    // (cf. `noteRevealed`).
    lastSightings.clear()
    knownAllied.value = new Map()
    knownIjn.value = new Map()
    // Les task forces sans porte-avions, avec ses entrées `fleetConversion`.
    convertedIjn.value = new Map()
  }

  // Les autres règles : celles du composable inerte (aucune particularité).
  return {
    ...INERT_RULES, active, autoPlacesAtLoad, setupCount, movementAllowance, privateLabel,
    privateLabelSide: 'ijn', setupSecrets, restoreSetupSecrets, autoMoveTarget, autoMoveSide: 'ijn',
    reconPhase: RECON_PHASE, reconChecks, reconChoice, noteSighting, reconTargetOf, manualReconSide: 'usn', searchBag, searchBagFull: SEARCH_CHITS, drawSearch, refillSearchBag, restoreSearchBag, searchChitsReturn,
    searchResults: SEARCH_RESULTS, searchOutcome, sightings: SIGHTINGS,
    isReusableDummy: isDummy, dummyReinforcementTurn, planDummyReinforcement, applyDummyReinforcement, playerDummyReinforcement,
    followTarget, arrangeInitialPositions, movementPlan, barredHexes, movementEndRemovals,
    navalCombatPhase: navalTable ? NAVAL_COMBAT_PHASE : null, navalContacts, navalBattle, navalFiring, navalPlan,
    navalRangeProposal, navalAcceptsRange, planNavalBattles, resolveNavalAttacks, noteRevealed, isRevealed, revealedLook, raidPhase: RAID_PHASE, raidSide: 'ijn', raidPlan, raidCandidates, planRaidOptions, noteRaided, noteTurn, isKnownTarget, airStrikeOdds, strikeTarget, sightedDefense, sightedStrikeOdds,
    fleetDisplay, fleetDisplays: FLEET_DISPLAYS, fleetDisplayPhase: FLEET_DISPLAY_PHASE, fleetDisplaySide: 'usn',
    airStrikeReach: alliedAirReach, airStrikeRadius: RAID_RADIUS,
    shipDamages: SHIP_DAMAGE, damageOf, setShipDamage, restoreShipDamage,
    planeStates: PLANE_STATES, planeStateOf, setPlaneState, restorePlaneDamage, launchRaid, landFromRaid, airCycle, restoreAirZones,
    alliedFleet, alliedFleetDisplays: ALLIED_FLEET_DISPLAYS, alliedDeck, alliedGroups, alliedAssignments, alliedShipFits, setAlliedFleet, restoreAlliedFleets,
    isCarrierless, freeFleetTaskForce, convertFleet, taskForceOf, inContact,
    alliedFleetSide: 'usn', alliedFleetPhase: ALLIED_FLEET_PHASE, alliedAirPhase: RAID_PHASE, isAirCell,
    // Deux joueurs (`ctx.duel`, cf. HexMap.vue, prop `duel`) : pas de moteur
    // japonais — ni leurres posés au coup d'envoi, ni mouvements, raids ou
    // reconnaissances de l'IA, ni renfort de leurres —, une mise en place
    // camp par camp que compte HexMap.vue, un mouvement sans contrainte —
    // l'allure de la piste pour tous, aucun hex interdit par l'ennemi (les
    // côtes et récifs de la carte restent), aucun pion retiré
    // à la fin des Mouvements —, et aucune composition de flotte : on ne fait
    // que déplacer et rechercher les task forces — la reconnaissance par
    // zones de HexMap.vue (cf. shared/duelRules.js::resolveRecon), à la place
    // de celle du joueur contre l'IA.
    ...(ctx.duel && {
      autoPlacesAtLoad: () => false, autoMoveSide: null, raidPhase: null, raidSide: null, privateLabelSide: null, manualReconSide: null,
      setupCount: () => null, dummyReinforcementTurn: () => false,
      // Pas de tirage secret (formation japonaise, rôles des leurres) : il
      // ne sert qu'au moteur, et le journal le montrerait aux deux joueurs.
      setupSecrets: () => null,
      movementAllowance: () => null, barredHexes: () => null, movementEndRemovals: () => [],
      alliedFleetSide: null, fleetDisplay: () => null,
    }),
  }
}
