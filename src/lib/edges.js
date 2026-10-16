// ═══════════════════════════════════════════════════════════════════════════
// edges — nature des HEXSIDES (arêtes entre deux hex), déclarée par le module
// ═══════════════════════════════════════════════════════════════════════════
//
// Une carte porte, en plus de ses hex, des éléments posés SUR les côtés d'hex
// (ex. les barrières côtières de la mer de Corail). Le module les liste en
// COUCHES (`terrain.seaBarriers`... — des paires "AAAA-BBBB" d'hex adjacents)
// et DÉCLARE ce que chaque couche veut dire dans `terrain.edges` ; le moteur
// (lib/useAssisted.js pour le mouvement et la ZOC) n'interprète que cette
// déclaration :
//
//   "edges": {
//     "layers": { "seaBarriers": "barrier" },
//     "kinds": { "barrier": { "impassable": true, "blocksZoc": true } },
//     "movementPriority": ["barrier"]
//   }
//
//   - `layers` : couche du JSON → NATURE d'arête (plusieurs couches peuvent
//     partager une nature) ;
//   - `kinds` : propriétés de chaque nature, toutes facultatives —
//       • `impassable` : arête infranchissable pour tout le monde ;
//       • `blocksZoc` : la zone de contrôle ne s'étend pas à travers ;
//   - `movementPriority` : quand une arête porte PLUSIEURS natures, celle qui
//     fait foi est la première de cette liste présente sur l'arête.
//
// Sans `terrain.edges`, aucune arête n'a d'effet (les couches sont ignorées).

/** `module.terrain` → interprète des arêtes (cf. l'en-tête). */
export function resolveEdges(terrain) {
  const declaration = terrain?.edges ?? {}
  const kinds = declaration.kinds && typeof declaration.kinds === 'object' ? declaration.kinds : {}

  // Nature → ensemble des arêtes "AAAA-BBBB", stockées dans les DEUX sens (le
  // JSON ne liste chaque arête qu'une fois, dans un ordre arbitraire).
  const edgesByKind = new Map()
  for (const [layer, kind] of Object.entries(declaration.layers ?? {})) {
    if (!kinds[kind]) continue
    const set = edgesByKind.get(kind) ?? new Set()
    for (const edge of terrain?.[layer] ?? []) {
      const [hexA, hexB] = String(edge).split('-')
      set.add(hexA + '-' + hexB)
      set.add(hexB + '-' + hexA)
    }
    edgesByKind.set(kind, set)
  }

  const priority = (Array.isArray(declaration.movementPriority) ? declaration.movementPriority : Object.keys(kinds))
    .filter((kind) => kinds[kind])

  return {
    /** Propriétés de la nature qui fait foi sur l'arête `edgeKey`
     *  ("CCRR-CCRR"), ou `null` (arête ordinaire). */
    propsOf: (edgeKey) => {
      const kind = priority.find((candidate) => edgesByKind.get(candidate)?.has(edgeKey))
      return kind ? kinds[kind] : null
    },
  }
}
