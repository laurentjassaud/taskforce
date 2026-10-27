// ═══════════════════════════════════════════════════════════════════════════
// Scénario 5 — arbre de décision du REPÉRAGE japonais (cf. ./recon.js)
// ═══════════════════════════════════════════════════════════════════════════
//
// Ce que décide le moteur pour les reconnaissances du camp japonais, écrit en
// données (cf. lib/ai/decisionTree.js) : régler cette IA, c'est modifier ce
// fichier. Les questions lisent les faits de lib/ai/coralSeaPerception.js::
// perceiveReconTarget. Priorité de chaque hex qu'une source japonaise peut
// explorer (les règles — portée, couverture — ont déjà écarté les autres,
// cf. ./recon.js::createTargetFilter). Le moteur explore l'hex de plus haute
// priorité ; à égalité, celui de la source qui a le moins de choix, puis au
// hasard :
//
//   TF alliée non repérée sur l'hex ?
//   ├─ oui → à 5 hex ou moins d'un de nos porte-avions ?       oui : menace (5)
//   │        └─ non → déjà vue comme porte-avions ?            oui : porte-avions perdu de vue (4)
//   │                 └─ non → à 6 hex ou moins de nos transports ? oui : escorte (3) | non : éclairage (2)
//   └─ non → nouvelle vérification (1)
import { ATTACK_RADIUS, AVOID_RANGE } from './movementTree.js'

/** Distances du repérage : une TF alliée inconnue à `THREAT_RANGE` hex ou
 *  moins d'un porte-avions japonais peut le frapper (son rayon d'attaque) ;
 *  à `ESCORT_RANGE` hex ou moins d'un transport, elle le menace (l'écart que
 *  gardent les transports). Cf. ./movementTree.js. */
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
