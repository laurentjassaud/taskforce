// ═══════════════════════════════════════════════════════════════════════════
// coralSeaTrees — arbres de décision de l'IA japonaise (mer de Corail)
// ═══════════════════════════════════════════════════════════════════════════
//
// Ce que décide le moteur pour le camp japonais, écrit en données (cf.
// lib/ai/decisionTree.js) : régler l'IA, c'est modifier ce fichier. Les
// questions lisent les faits de lib/ai/coralSeaPerception.js ; les feuilles
// deviennent les plans de mouvement qu'exécute HexMap.vue::planAutoMoves.
//
// MOUVEMENT d'une task force japonaise (cf. useCoralSea.js::movementPlan),
// selon son comportement — il REMPLACE la marche vers son hex-objectif :
//
//   comportement ?
//   ├─ vrai leurre  → hex-objectif
//   ├─ transport    → TF alliée repérée ?      oui : s'écarter à > 6 hex des repérées
//   ├─ destroyers   → TF alliée non repérée ?  oui : au contact de la plus proche
//   ├─ surface      → TF alliée repérée ?      oui : au contact de la plus proche
//   └─ porte-avions → allié vu comme porte-avions ?
//        ├─ oui → peut entrer ce tour-ci à 5 hex de lui ?
//        │    ├─ oui → un partenaire y entrera dans 2 tours au plus ?
//        │    │    ├─ oui → attend déjà depuis 2 tours ?  oui : frappe | non : attend à 6 hex
//        │    │    └─ non → frappe (à 5 hex)
//        │    └─ non → frappe (marche vers les 5 hex)
//        └─ non → elle-même repérée, et des alliés sur la carte ?
//                 oui : s'écarter à > 6 hex de tous | non : hex-objectif
//   (« non » partout ailleurs : hex-objectif)
//
// REPÉRAGE : priorité de chaque hex qu'une source japonaise peut explorer
// (cf. useCoralSea.js::reconChoice — les règles du jeu, portée et
// couverture, ont déjà écarté les autres). Le moteur explore l'hex de plus
// haute priorité ; à égalité, celui de la source qui a le moins de choix,
// puis au hasard :
//
//   TF alliée non repérée sur l'hex ?
//   ├─ oui → à 5 hex ou moins d'un de nos porte-avions ?       oui : menace (5)
//   │        └─ non → déjà vue comme porte-avions ?            oui : porte-avions perdu de vue (4)
//   │                 └─ non → à 6 hex ou moins de nos transports ? oui : escorte (3) | non : éclairage (2)
//   └─ non → nouvelle vérification (1)

/** Distances des mouvements : écart gardé par celles qui évitent les Alliés,
 *  rayon d'attaque des porte-avions et leur attente maximale, et distance à
 *  laquelle les autres s'arrêtent de leur cible (adjacentes). */
export const AVOID_RANGE = 6
export const ATTACK_RADIUS = 5
export const MAX_WAIT_TURNS = 2
export const SEEK_RADIUS = 1

const OBJECTIVE = { do: 'objective' }
const STRIKE = { do: 'attack', target: 'nearestSightedCarrier', radius: ATTACK_RADIUS }

export const movementTree = {
  cases: 'behavior',
  branches: {
    none: OBJECTIVE,
    transport: {
      test: 'alliesSighted',
      yes: { do: 'avoid', from: 'sightedAllies', range: AVOID_RANGE },
      no: OBJECTIVE,
    },
    destroyers: {
      test: 'unsightedAlliesPresent',
      yes: { do: 'attack', target: 'nearestUnsightedAlly', radius: SEEK_RADIUS },
      no: OBJECTIVE,
    },
    surface: {
      test: 'alliesSighted',
      yes: { do: 'attack', target: 'nearestSightedAlly', radius: SEEK_RADIUS },
      no: OBJECTIVE,
    },
    carrier: {
      test: 'alliedCarrierSighted',
      yes: {
        test: 'canStrikeThisTurn',
        yes: {
          test: 'partnerJoinsSoon',
          yes: {
            test: 'waitedTooLong',
            yes: STRIKE,
            no: { do: 'hold', target: 'nearestSightedCarrier', radius: ATTACK_RADIUS },
          },
          no: STRIKE,
        },
        no: STRIKE,
      },
      no: {
        test: 'selfSighted',
        yes: {
          test: 'alliesPresent',
          yes: { do: 'avoid', from: 'allies', range: AVOID_RANGE },
          no: OBJECTIVE,
        },
        no: OBJECTIVE,
      },
    },
  },
}

/** Tours qu'un porte-avions (`{ distance, steps }`) attendrait avant de
 *  pouvoir entrer à `ATTACK_RADIUS` hex de sa cible : 0 s'il y entre ce
 *  tour-ci. */
function turnsToStrike({ distance, steps }) {
  const gap = distance - ATTACK_RADIUS
  return gap <= steps ? 0 : Math.ceil(gap / steps) - 1
}

/** Questions de `movementTree` (faits : cf. coralSeaPerception.js::
 *  perceiveTaskForce). */
export const movementTests = {
  behavior: (facts) => facts.behavior ?? 'none',
  alliesPresent: (facts) => facts.allies.length > 0,
  alliesSighted: (facts) => facts.sightedAllies.length > 0,
  unsightedAlliesPresent: (facts) => facts.unsightedAllies.length > 0,
  alliedCarrierSighted: (facts) => facts.sightedCarriers.length > 0,
  selfSighted: (facts) => facts.selfSighted,
  // Pas encore à portée, mais elle peut y entrer ce tour-ci.
  canStrikeThisTurn: (facts) => {
    const gap = facts.distanceToSightedCarrier - ATTACK_RADIUS
    return gap > 0 && gap <= facts.steps
  },
  // Un partenaire n'y entrera pas ce tour-ci, mais dans 2 tours au plus.
  partnerJoinsSoon: (facts) => facts.partners.map(turnsToStrike).some((wait) => wait > 0 && wait <= MAX_WAIT_TURNS),
  waitedTooLong: (facts) => facts.turnsWaiting >= MAX_WAIT_TURNS,
}

const hexOf = (unit) => ({ col: unit.col, row: unit.row })

/** Feuilles de `movementTree` -> plan de mouvement de HexMap.vue::
 *  planAutoMoves : `{ kind: 'avoid', avoid: [hex], range }`, `{ kind:
 *  'attack', target: hex, radius, hold }` ou `null` (marche vers
 *  l'hex-objectif). */
export const movementActions = {
  objective: () => null,
  avoid: (facts, leaf) => ({ kind: 'avoid', avoid: facts[leaf.from].map(hexOf), range: leaf.range }),
  attack: (facts, leaf) => ({ kind: 'attack', target: facts[leaf.target], radius: leaf.radius, hold: false }),
  // Comme `attack`, mais s'arrête à `radius` + 1 hex pour attendre.
  hold: (facts, leaf) => ({ kind: 'attack', target: facts[leaf.target], radius: leaf.radius, hold: true }),
}

/** Distances du repérage : une TF alliée inconnue à `THREAT_RANGE` hex ou
 *  moins d'un porte-avions japonais peut le frapper (rayon d'attaque) ; à
 *  `ESCORT_RANGE` hex ou moins d'un transport, elle le menace (l'écart que
 *  gardent les transports). */
export const THREAT_RANGE = ATTACK_RADIUS
export const ESCORT_RANGE = AVOID_RANGE

export const reconTree = {
  test: 'unsighted',
  yes: {
    test: 'nearOwnCarrier',
    yes: { do: 'threat', priority: 5 },
    no: {
      test: 'rememberedAsCarrier',
      yes: { do: 'carrierLead', priority: 4 },
      no: {
        test: 'nearOwnTransport',
        yes: { do: 'escort', priority: 3 },
        no: { do: 'scout', priority: 2 },
      },
    },
  },
  no: { do: 'recheck', priority: 1 },
}

/** Questions de `reconTree` (faits : cf. coralSeaPerception.js::
 *  perceiveReconTarget). */
export const reconTests = {
  unsighted: (facts) => facts.unsighted,
  nearOwnCarrier: (facts) => facts.distanceToOwnCarrier <= THREAT_RANGE,
  rememberedAsCarrier: (facts) => facts.rememberedAsCarrier,
  nearOwnTransport: (facts) => facts.distanceToOwnTransport <= ESCORT_RANGE,
}
