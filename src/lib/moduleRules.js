// ═══════════════════════════════════════════════════════════════════════════
// moduleRules — registre des règles PARTICULIÈRES par module
// ═══════════════════════════════════════════════════════════════════════════
//
// Chaque boîte de jeu peut avoir des règles qu'aucun champ du JSON ne sait
// exprimer (cf. lib/useCoralSea.js, qui suit le patron et la convention
// `null` = "pas de règle particulière"). Le moteur (HexMap.vue) ne connaît
// pas chaque module par son nom : il demande ICI le composable de règles du
// module joué, et reçoit un composable INERTE pour un module qui n'en a pas.
//
// AJOUTER UN MODULE : écrire `lib/useMonModule.js` sur le patron de
// useCoralSea.js (mêmes fonctions que `INERT_RULES`, chacune rendant `null` ou
// ne faisant rien quand elle n'a rien à dire), puis l'inscrire dans
// `REGISTRY` — c'est la seule ligne du moteur à toucher.
import { unref } from 'vue'
import { useCoralSea, CORAL_SEA_MODULE_ID } from './useCoralSea.js'

/** Interface qu'expose tout composable de règles particulières — et ce que
 *  reçoit le moteur pour un module sans règles particulières. */
export const INERT_RULES = Object.freeze({
  active: false,
  /** Ce pion est-il posé au chargement ? `true`/`false` pour trancher, `null` pour laisser la règle générique. */
  autoPlacesAtLoad: () => null,
  /** Pions attendus à la fin de la mise en place (`turnTrack.setup`) :
   *  `{ count, total }` — posés sur la carte, et nombre exigé —, ou `null`
   *  (aucune exigence). Moins : le joueur confirme ; plus : refusé. */
  setupCount: () => null,
  /** Potentiel de mouvement de ce pion ce tour-ci (`turnInfo` = détail du tour de la piste), ou `null` (règle générique). */
  movementAllowance: () => null,
  /** Étiquette secrète d'un pion, montrée au seul camp `privateLabelSide`, ou `null`. */
  privateLabel: () => null,
  privateLabelSide: null,
  /** Tirage secret à inscrire au journal avec le déploiement, ou `null`. */
  setupSecrets: () => null,
  /** Rétablit ce tirage, lu dans le journal (rejeu, partie en ligne). */
  restoreSetupSecrets: () => {},
  /** Hex vers lequel ce pion marche SEUL à chaque phase de Mouvement de
   *  `autoMoveSide` (`{ col, row }`), ou `null` (déplacé par le joueur). */
  autoMoveTarget: () => null,
  autoMoveSide: null,
  /** Phase (id de `turnStructure.phases`) où `autoMoveSide` fait ses
   *  reconnaissances, ou `null` (pas de reconnaissance du moteur). */
  reconPhase: null,
  /** Checks de reconnaissance du camp donné, au pas de piste donné : chaque
   *  source (`{ key, base, name, unitId, checks, col, row }`) explore
   *  jusqu'à `checks` de ses hex par phase (`[{ source, targets: [{ col,
   *  row }] }]`), ou `null`. */
  reconChecks: () => null,
  /** Hex que le moteur explore maintenant parmi ses checks ouverts : `{ source, target, side, action, priority, trace,
   *  options }`, ou `null` (le moteur tire alors au hasard, cf. HexMap.vue::continueEngineRecon). */
  reconChoice: () => null,
  /** Une unité reçoit un état de repérage (en jeu comme au rejeu) : de quoi s'en souvenir. */
  noteSighting: () => {},
  /** Ce pion est-il une cible de reconnaissance pour ce camp ? */
  reconTargetOf: () => false,
  /** Camp qui fait SES reconnaissances à la main (clic source puis cible), ou `null`. */
  manualReconSide: null,
  /** Chits restant dans la tasse de recherche (`{ résultat: nombre }`), ou `null`. */
  searchBag: null,
  /** Contenu d'une tasse de recherche pleine, même forme que `searchBag`, ou `null`. */
  searchBagFull: null,
  /** Tire un chit de recherche : `{ result, bag }`, ou `null`. */
  drawSearch: () => null,
  /** Remet tous les chits dans la tasse. */
  refillSearchBag: () => {},
  /** Rétablit le contenu de la tasse, lu dans le journal. */
  restoreSearchBag: () => {},
  /** Les chits reviennent-ils dans la tasse à ce tour (`turnInfo` de la piste) ? */
  searchChitsReturn: () => false,
  /** Pion posé pour chaque résultat : `{ résultat: { name, src } }`, ou `null`. */
  searchResults: null,
  /** Effet d'un chit sur l'unité explorée : `{ sighting, removed }`, ou `null`. */
  searchOutcome: () => null,
  /** États de repérage : `{ état: { name?, src? } }` (`src` = pion "Sighted" à poser, par camp), ou `null`. */
  sightings: null,
  /** Ce pion éliminé peut-il revenir en jeu par un renfort de leurres ? */
  isReusableDummy: () => false,
  /** Ce tour (`turnInfo` de la piste) amène-t-il un renfort de leurres ? */
  dummyReinforcementTurn: () => false,
  /** Renfort de leurres à poser : `{ placements: [{ id, col, row }], roles, objectives }`, ou `null`. */
  planDummyReinforcement: () => null,
  /** Applique les rôles secrets et hex-objectifs d'un renfort de leurres. */
  applyDummyReinforcement: () => {},
  /** Renfort de leurres posé par le JOUEUR : `{ total, anchors }` si ce pion en est un à ce tour (`turnInfo` de la piste), `null` sinon. */
  playerDummyReinforcement: () => null,
  /** Pion que celui-ci suit en restant adjacent (cf. `runAutoMoves`), ou `null`. */
  followTarget: () => null,
  /** Réarrange le déploiement initial (`placed`, modifié sur place). */
  arrangeInitialPositions: () => {},
  /** Mouvement particulier d'un pion à hex-objectif, qui remplace sa marche (cf. `runAutoMoves`), ou `null`.
   *  Son 5e argument facultatif, `onDecision({ side, action, trace, plan })`, reçoit la décision de l'IA (journal de debug). */
  movementPlan: () => null,
  /** Hex ("col,row") où ce pion ne peut pas entrer en mouvement (`(pion, pions)`), ou `null` (aucune interdiction). */
  barredHexes: () => null,
  /** Pions retirés du jeu une fois les Mouvements de tous les camps joués, une fois par tour (`(pions)`) : leurs ids. */
  movementEndRemovals: () => [],
  /** Phase (id de la piste) des combats de surface, ou `null` (pas de combat naval). */
  navalCombatPhase: null,
  /** Task forces ennemies au contact (`(pions, ids exclus)`) : `[{ ijn, usn }]`. */
  navalContacts: () => [],
  /** Bataille entre ces task forces (`(ids, pions, tour)`) : `{ key, fleetIds, night, ships: { camp: navires }, ranges }`. */
  navalBattle: () => null,
  /** Navires d'un camp qui tirent dans une bataille, à une portée (`(bataille, camp, portée)`). */
  navalFiring: () => [],
  /** Meilleur plan de tir d'un camp (`(bataille, camp, portée)`) : `{ expectedPoints, attacks: [{ side, shooters, target }] }`. */
  navalPlan: () => null,
  /** Portée plus courte que propose le moteur dans une bataille, ou `null`. */
  navalRangeProposal: () => null,
  /** Le moteur accepte-t-il cette portée (`(bataille, portée)`) ? */
  navalAcceptsRange: () => false,
  /** Organisation des combats décidée par le moteur (`(contacts, pions, tour)`) : `{ battles: [[ids]], arrows: [{ from, to }] }`. */
  planNavalBattles: () => ({ battles: [], arrows: [] }),
  /** Résout des attaques (`(bataille, attaques)`), dés compris : une ligne de résultat par attaque. */
  resolveNavalAttacks: () => [],
  /** L'unité `unitId` (du camp du moteur) devient connue de l'adversaire, au tour donné. */
  noteRevealed: () => {},
  /** Deux pions sont-ils au contact (`(a, b)`) — même hex, ou adjacents sans barrière entre eux ? */
  inContact: () => false,
  /** Task force (id) que ce pion EST VRAIMENT — celle que porte un leurre —, ou `null`. */
  taskForceOf: () => null,
  /** L'adversaire connaît-il cette unité du camp du moteur (cf. `noteRevealed`) ? */
  isRevealed: () => false,
  /** Pion qui remplace sur la carte une unité connue de l'adversaire (`{ src, name }`), ou `null`. */
  revealedLook: () => null,
  /** Phase (id de la piste) où le moteur lance ses raids aériens, ou `null`. */
  raidPhase: null,
  /** Camp qui lance ces raids, ou `null`. */
  raidSide: null,
  /** Raids à lancer : `[{ targetId, marker: { name, src }, raiders: [{ tf, name }] }]`, et, pour une frappe planifiée (cf.
   *  lib/useCoralSea.js::raidPlan), ses avions (`planes`), ses attaques (`attacks`) et ses points espérés. */
  raidPlan: () => [],
  /** L'unité `unitId` vient de subir un raid (en jeu comme au rejeu) : le camp qui l'a frappée la connaît. */
  noteRaided: () => {},
  /** Debug : task forces que les avions d'un raid pourraient viser, et ce qu'en sait le camp qui frappe (cf. RaidOddsModal.vue). */
  raidCandidates: () => [],
  /** Debug : meilleurs plans d'une frappe sur plusieurs task forces, ou `null`. */
  planRaidOptions: () => null,
  /** Tour en cours, à chaque changement (statut des unités connues, cf. `isKnownTarget`). */
  noteTurn: () => {},
  /** Le camp qui lance les raids connaît-il exactement cette unité (déjà frappée) ? Bordure verte sur la carte. */
  isKnownTarget: () => false,
  /** Probabilités d'une frappe aéronavale (cf. lib/airStrike.js::strikeOdds), ou `null`. */
  airStrikeOdds: () => null,
  /** Navire visé par une frappe : `{ ship, defenders, antiAir, durability }`, ou `null`. */
  strikeTarget: () => null,
  /** Défense estimée (AA, durabilité) d'une task force repérée d'un camp : `{ carrierTF, fleetTF }`, ou `null`. */
  sightedDefense: () => null,
  /** Probabilités d'une frappe sur une task force repérée, d'après sa défense estimée, ou `null`. */
  sightedStrikeOdds: () => null,
  /** Navires de cette task force posés sur son support (cf.
   *  FleetDisplayModal.vue), ou `null`. */
  fleetDisplay: () => null,
  /** Supports de task force : `{ carrier, fleet }` (image, taille, cases), ou `null`. */
  fleetDisplays: null,
  /** Phase (id de la piste) où `fleetDisplaySide` peut voir les supports des task forces ennemies repérées, ou `null`. */
  fleetDisplayPhase: null,
  fleetDisplaySide: null,
  /** `fleetDisplaySide` peut-il frapper cette task force ennemie (`(cible, pions)`) — à portée de ses porte-avions ? */
  airStrikeReach: () => true,
  /** Portée de ces frappes, en hex (pour le message hors de portée), ou `null`. */
  airStrikeRadius: null,
  /** Dommages possibles d'un navire : état -> `{ reduced, marker }` (face réduite, pion posé dessus), ou `null`. */
  shipDamages: null,
  /** Dommages du navire de cette clé de pion ('none' : intact). */
  damageOf: () => 'none',
  /** Pose des dommages sur un navire (`(clé, état)`). */
  setShipDamage: () => {},
  /** Dommages lus dans le journal (`null` : aucun). */
  restoreShipDamage: () => {},
  /** Cette task force "porte-avions" a-t-elle perdu ses porte-avions, sans avoir encore changé de pion ? */
  isCarrierless: () => false,
  /** Pion de task force sans porte-avions libre pour remplacer celui de cette task force (`(tf, pions, ids éliminés)`), ou `null`. */
  freeFleetTaskForce: () => null,
  /** La task force `from` devient la task force sans porte-avions `to` (`(from, to)`). */
  convertFleet: () => {},
  /** Pertes possibles d'un pion avion (`['none', 'reduced', 'eliminated']`), ou `null`. */
  planeStates: null,
  /** Pertes de l'avion de cette clé de pion ('none' : intact). */
  planeStateOf: () => 'none',
  /** Pose des pertes sur un avion (`(clé, état)`). */
  setPlaneState: () => {},
  /** Pertes lues dans le journal (`null` : aucune). */
  restorePlaneDamage: () => {},
  /** Avions (clés de pion) qui partent en raid du moteur, et qui en rentrent (case "Landing from Map" de leur support). */
  launchRaid: () => {},
  landFromRaid: () => {},
  /** Cycle des avions sur leur support, à chaque pas de la piste (`(pas, phase, camp)`). */
  airCycle: () => {},
  /** Nouveau rejeu : chaque avion dans sa zone de départ. */
  restoreAirZones: () => {},
  /** Task force que le joueur compose lui-même : `{ tf, kind, cellIds, airCellIds, cells, layout }` (cf. TaskForceComposer.vue), ou `null`. */
  alliedFleet: () => null,
  /** Supports des task forces que le joueur compose : `{ carrier, fleet }` (même forme que `fleetDisplays`), ou `null`. */
  alliedFleetDisplays: null,
  /** Avions du porte-avions de ce pion navire et leur mise en place par défaut : `{ planes, ready, reserve, lost }` (`lost` : éliminés). */
  alliedDeck: () => ({ planes: [], ready: [], reserve: [], lost: [] }),
  /** Pions navires à poser, par groupe de l'ordre de bataille : `[{ id, name, ships: [{ key, id, name, type, src }] }]`. */
  alliedGroups: [],
  /** Task force où est posé chaque pion navire : `Map` clé -> task force. */
  alliedAssignments: () => new Map(),
  /** Un navire de ce type peut-il aller dans cette case du support ? */
  alliedShipFits: () => true,
  /** Nouvelle composition d'une task force ; rend toutes les compositions, à inscrire au journal. */
  setAlliedFleet: () => ({}),
  /** Rétablit les compositions lues dans le journal (`null` : les vide). */
  restoreAlliedFleets: () => {},
  /** Camp qui compose ses task forces, et phase (id de la piste) où il le fait en plus de sa mise en place, ou `null`. */
  alliedFleetSide: null,
  alliedFleetPhase: null,
  /** Phase (id de la piste) où ce camp place librement les avions de ses task forces, ou `null`. */
  alliedAirPhase: null,
  /** Cette case d'une composition range-t-elle un avion (et non un navire) ? */
  isAirCell: () => false,
})

const REGISTRY = {
  [CORAL_SEA_MODULE_ID]: useCoralSea,
}

/** Composable de règles particulières du module `moduleId` (chaîne ou ref),
 *  avec le contexte `ctx` que le moteur lui prête (cf. HexMap.vue, appel de
 *  `useModuleRules`) — `INERT_RULES` si le module n'en déclare pas. */
export function useModuleRules(moduleId, ctx = {}) {
  const hook = REGISTRY[unref(moduleId)]
  return hook ? hook(moduleId, ctx) : { ...INERT_RULES }
}
