// ═══════════════════════════════════════════════════════════════════════════
// Moteurs de SCÉNARIO de la mer de Corail — registre
// ═══════════════════════════════════════════════════════════════════════════
//
// Les règles du module (lib/useCoralSea.js : tasse et résultats de
// recherche, raids, combat naval, supports, dommages, contact des
// leurres...) valent pour tous ses scénarios. Ce qui dépend du SCÉNARIO joué
// vit à part, un dossier par scénario — chaque scénario a les siens —, en
// quatre moteurs :
//   - `fleets` — CONSTITUTION DES FLOTTES japonaises au coup d'envoi :
//     formation, task forces portées en secret par les leurres ;
//   - `placement` — PLACEMENT : déploiement au chargement, groupes de
//     leurres, hex-objectifs, mise en place US, renforts de leurres ;
//   - `movement` — DÉPLACEMENT : allures, et mouvement de l'IA japonaise
//     (arbre de décision) ;
//   - `recon` — REPÉRAGE : bases et portée des reconnaissances, hex que
//     chaque camp peut explorer (couverture), et choix de l'IA japonaise
//     (arbre de décision).
// useCoralSea.js garde l'ÉTAT (rôles secrets, groupes, objectifs — inscrits
// au journal, cf. setupSecrets ; mémoire des repérages) et ce que le
// Japonais sait de ses forces (taskForceOf, behaviorOf...) ; il demande aux
// moteurs du scénario de tirer cet état et de décider.
//
// AJOUTER UN SCÉNARIO : un dossier `scenario-N/` sur le modèle de
// `scenario-5/` (mêmes exports), puis une ligne dans `ENGINES` — la clé est
// l'`id` du scénario dans coral-sea.json (`scenarios[]`). Un scénario peut
// reprendre un moteur d'un autre en l'important simplement. Un scénario
// sans moteurs est une erreur (cf. `scenarioEngines`).
//
// INTERFACE des moteurs d'un scénario :
//   fleets
//     composeFleets({ scenario, fleets, allCounters, dummyIds })
//       -> { formationId, roles } — rôle secret de chaque leurre japonais :
//          `{ tf, code, movement, behavior, ships }` s'il porte une task
//          force, `{ tf: null, code: null, movement }` sinon ; `movement` :
//          'normal' ou 'transport' ; `behavior` : lu par les moteurs
//          `movement` et `recon` (ex. 'carrier', 'transport'...).
//     legacyTaskForces : rôles des task forces d'un journal antérieur aux
//       formations (sans `behavior`).
//     behaviorOfShips(ids, typeOf) -> `behavior` d'une task force d'après
//       ses navires (ex. une task force qui a perdu ses porte-avions).
//   placement
//     setupTotal : task forces (leurres compris) de la mise en place US et
//       des renforts de leurres.
//     deploysAtLoad(pion) -> posé sur la carte au chargement ?
//     drawGroups(roles, behaviorOf) -> { suiveur id: meneur id }
//     drawObjectives({ counterIds, roles, behaviorOf, arrivalHexes })
//       -> { id: hex "CCRR" }
//     arrangeInitialPositions(placés, adjacentHexes, leaders) : place les
//       suiveurs (pions modifiés sur place).
//     planDummyReinforcement({ counters, sightings, freeDummyIds })
//       -> { placements, roles, leaders } ou `null`.
//     playerDummyReinforcement(pion) -> { total, anchors } ou `null`.
//   movement
//     allowance(pion, turnInfo, { transport }) -> MP du tour, ou `null`
//       (allure de la piste).
//     createMovementPlanner() -> (pion, pions, { turn, allowanceOf,
//       taskForceOf, behaviorOf }) -> { action, trace, plan }.
//   recon
//     range : portée d'une source de reconnaissance, en hex.
//     bases : { camp: { hex "CCRR": nom } } — bases aériennes sources.
//     checksPerPhase : { base, carrier: { camp: n } } — hex explorés par
//       source et par phase.
//     createTargetFilter({ side, counters, isOwnUnit, isTarget })
//       -> (source, hexes) -> hexes permis.
//     chooseRecon(checks, pions, { taskForceOf, behaviorOf, lastSeen })
//       -> { source, target, action, priority, trace, options } ou `null`.
import scenario5 from './scenario-5/index.js'

const ENGINES = {
  'scenario-5': scenario5,
}

/** Moteurs du scénario `scenarioId` (cf. l'en-tête). Chaque scénario a les
 *  siens : un scénario qui n'en a pas est une erreur de développement, qui
 *  arrête le chargement de la partie avec un message explicite. */
export function scenarioEngines(scenarioId) {
  const engines = ENGINES[scenarioId]
  if (!engines) throw new Error(`Mer de Corail : aucun moteur pour le scénario « ${scenarioId} » — ajoutez-le à lib/coralSea/scenarios/index.js.`)
  return engines
}
