// ═══════════════════════════════════════════════════════════════════════════
// Scénario 5 — DÉPLACEMENT (moteur `movement`, cf. ../index.js)
// ═══════════════════════════════════════════════════════════════════════════
//
// ALLURES (cf. `allowance`) :
//   - normale : celle de la piste de tour (2 hex de nuit, 1 de jour) ;
//   - transport (AK) : 1 hex de nuit, 1 hex aux tours de jour impairs, 0
//     aux tours de jour pairs — exactement les tours où la piste coche
//     "Mouvement AK" (`turnInfo.conditions.akMovement`, cf. coral-sea.json).
// Une task force de transports va à l'allure de transport, comme les vrais
// leurres qui l'ont tirée à pile ou face (cf. ./fleets.js) ; un suiveur va à
// l'allure de la tête de son groupe (cf. lib/useCoralSea.js::isTransport).
//
// MOUVEMENTS PARTICULIERS (cf. `createMovementPlanner`), qui REMPLACENT la
// marche vers l'hex-objectif, selon les navires de la task force : avec des
// AK, elle reste à plus de 6 hex de toute TF alliée repérée ; avec un CV ou
// un CVL, elle fonce à 5 hex d'une TF alliée vue comme porte-avions (les
// porte-avions s'attendent à 6 hex, 2 tours au plus), et, sans porte-avions
// allié repéré, s'écarte à plus de 6 hex de toute unité alliée dès qu'elle
// est elle-même repérée ; rien que des DD, elle va vers la TF alliée non
// repérée la plus proche ; les autres vont vers la TF alliée repérée la
// plus proche. Leurs suiveurs suivent. Ces règles forment un ARBRE DE
// DÉCISION, décrit en données dans ./movementTree.js, sur ce que sait le
// Japonais (cf. lib/ai/coralSeaPerception.js).
import { decide } from '../../../ai/decisionTree.js'
import { perceiveTaskForce } from '../../../ai/coralSeaPerception.js'
import { isIjnTaskForce } from '../../shared.js'
import { movementTree, movementTests, movementActions } from './movementTree.js'

/** MP du tour d'un pion qui se déplace comme un transport (`transport`) :
 *  1 aux tours "Mouvement AK" de la piste (`turnInfo`), 0 sinon. `null`
 *  (allure de la piste) pour tout autre pion. */
export function allowance(counter, turnInfo, { transport }) {
  if (!turnInfo || !transport) return null
  return turnInfo.conditions?.akMovement ? 1 : 0
}

/** Décideur du mouvement des task forces japonaises, avec sa mémoire :
 *  `(pion, pions, { turn, allowanceOf, taskForceOf, behaviorOf }) -> {
 *  action, trace, plan }` — `action`, nom de la feuille atteinte ; `trace`,
 *  le chemin suivi dans l'arbre (cf. lib/ai/decisionTree.js::decide) ;
 *  `plan`, le mouvement particulier (`{ kind: 'avoid', avoid: [hex], range
 *  }`, `{ kind: 'attack', target: hex, radius, hold }`), ou `null` (marche
 *  vers l'hex-objectif). Ce que sait le Japonais de ses propres forces lui
 *  vient du module : `taskForceOf(pion)` (task force qu'il est, `null` pour
 *  un vrai leurre), `behaviorOf(tf)` (cf. ./fleets.js), `allowanceOf(pion)`
 *  (MP du tour). Seule la feuille 'hold' (attendre les partenaires)
 *  entretient la mémoire d'attente ; toute autre décision l'efface. */
export function createMovementPlanner() {
  // Attente des porte-avions aux portes du rayon d'attaque : task force ->
  // tour où elle a commencé à attendre les autres.
  const waitingSince = new Map()
  return function planMovement(counter, counters, { turn, allowanceOf, taskForceOf, behaviorOf }) {
    const tf = taskForceOf(counter)
    const behavior = behaviorOf(tf)
    // Porte-avions partenaires : les autres task forces japonaises de
    // porte-avions sur la carte.
    const partners = behavior === 'carrier'
      ? counters.filter((other) => isIjnTaskForce(other) && taskForceOf(other)
        && taskForceOf(other) !== tf && behaviorOf(taskForceOf(other)) === 'carrier')
      : []
    const facts = perceiveTaskForce(counter, counters, { behavior, partners, allowanceOf, turn, waitingSince: waitingSince.get(tf) ?? null })
    const { leaf, trace } = decide(movementTree, facts, movementTests)
    if (leaf.do === 'hold') waitingSince.set(tf, waitingSince.get(tf) ?? turn)
    else waitingSince.delete(tf)
    return { action: leaf.do, trace, plan: movementActions[leaf.do](facts, leaf) }
  }
}
