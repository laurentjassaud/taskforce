// ═══════════════════════════════════════════════════════════════════════════
// decisionTree — parcours d'un ARBRE DE DÉCISION décrit en données
// ═══════════════════════════════════════════════════════════════════════════
//
// Moteur des IA symboliques (cf. lib/ai/coralSeaTrees.js) : l'arbre ne
// contient que des NOMS de questions et d'actions, les questions vivent dans
// un dictionnaire `tests` (nom -> `facts => valeur`). Les questions ne font
// que LIRE les faits (cf. lib/ai/coralSeaPerception.js) : c'est l'appelant
// qui applique la feuille atteinte.
//
// Trois sortes de nœuds :
//   - question oui/non : `{ test: 'nom', yes: nœud, no: nœud }` ;
//   - aiguillage : `{ cases: 'nom', branches: { valeur: nœud, ... } }` — la
//     question renvoie la clé de la branche à suivre ;
//   - feuille : `{ do: 'nom', ...paramètres }`.

/** Parcourt `tree` avec les faits `facts` : `{ leaf, trace }` — `leaf`, la
 *  feuille atteinte ; `trace`, le chemin suivi, `[{ question, answer }]`
 *  (`answer` : booléen d'une question oui/non, clé de la branche d'un
 *  aiguillage), de quoi expliquer la décision (cf. HexMap.vue::
 *  logAiDecision). Une question inconnue ou une branche manquante est une
 *  erreur de l'arbre : elle lève une exception plutôt que de laisser l'IA
 *  décider au hasard. */
export function decide(tree, facts, tests) {
  const trace = []
  let node = tree
  while (!node.do) {
    const name = node.cases ?? node.test
    const question = tests[name]
    if (!question) throw new Error(`Arbre de décision : question inconnue « ${name} »`)
    if (node.cases) {
      const key = question(facts)
      trace.push({ question: name, answer: key })
      node = node.branches[key]
      if (!node) throw new Error(`Arbre de décision : pas de branche « ${key} » pour « ${name} »`)
    } else {
      const answer = !!question(facts)
      trace.push({ question: name, answer })
      node = answer ? node.yes : node.no
    }
  }
  return { leaf: node, trace }
}
