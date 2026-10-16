// ═══════════════════════════════════════════════════════════════════════════
// rules — paramètres des règles GÉNÉRIQUES, déclarés par le module
// ═══════════════════════════════════════════════════════════════════════════
//
// Le moteur applique les mêmes règles à tous les modules (empilement, ZOC,
// congestion d'entrée), mais LEURS VALEURS sont celles de la boîte de jeu :
// elles viennent de `module.rules` (cf. public/modules/*.json, README
// "Anatomie d'un module"). Ce fichier les lit, les assainit et complète ce
// qui manque par des défauts raisonnables.
//
// Les clés que le moteur ne connaît pas sont conservées telles quelles : ce
// sont celles des RÈGLES PARTICULIÈRES d'un module (cf. lib/moduleRules.js),
// qui n'ont pas besoin d'être listées ici pour être déclarées dans le JSON.

export const DEFAULT_RULES = Object.freeze({
  // Nombre maximal d'unités AMIES par hex à la fin d'un mouvement (cf.
  // lib/useAssisted.js, section "Empilement"). `"none"` : le jeu n'a pas de
  // règle d'empilement, résolu en `Infinity`. Le module peut aussi la donner
  // PAR CAMP : `{ "ijn": 1, "usn": "none" }` (clés de `module.sides`) — un
  // camp absent prend la valeur par défaut. Cf. `stackingLimitOf`.
  stackingLimit: 1,
  // Zones de contrôle (cf. lib/useAssisted.js, section "ZOC") :
  //   - `lockIfStarting` : une unité qui COMMENCE son mouvement en ZOC
  //     ennemie ne peut pas bouger ;
  //   - `stopOnEntry` : une unité qui ENTRE en ZOC ennemie doit s'y arrêter.
  zoc: Object.freeze({ lockIfStarting: true, stopOnEntry: true }),
  // Congestion des hex d'entrée de renfort (cf. lib/useAssisted.js, section
  // "Congestion") : 'multiply' — la N-ième entrée par un même hex, le même
  // tour, coûte N fois le coût de base ; 'none' — toujours le coût de base.
  entryCongestion: 'multiply',
})

export const ENTRY_CONGESTION_MODES = ['multiply', 'none']

// Pas (`phaseStep`, cf. lib/useAssisted.js) des phases d'un module : 0 pour
// la phase de Mouvement, puis 3, 4, 5... pour les autres, dans l'ordre
// déclaré. Les pas 1 et 2 ne servent plus, mais restent réservés : des
// journaux déjà enregistrés portent ces numéros de phase.
export const CUSTOM_PHASE_BASE = 3
export const MOVEMENT_STEP = 0

/** `turnStructure.phases` → liste `[{ id, label, kind, step }]` vérifiée.
 *  Chaque entrée déclare :
 *   - `id`    : clé stable (journal, marqueur allumé) ;
 *   - `label` : libellé affiché, en français (traduit par le dictionnaire
 *               `i18n` du module, cf. src/i18n::mt) ;
 *   - `kind`  : facultatif — "movement" (règles de déplacement, MP, pas 0).
 *               Sans `kind`, la phase est un simple jalon du tour.
 *  Une liste sans phase "movement" n'autoriserait jamais aucun déplacement
 *  en mode Assisté : la 1re phase en tient alors lieu. Un module sans liste
 *  joue une seule phase, le Mouvement. */
function resolvePhases(raw) {
  const phases = (Array.isArray(raw) ? raw : [])
    .filter((phase) => phase && typeof phase.id === 'string')
    .map((phase) => ({ id: phase.id, label: typeof phase.label === 'string' ? phase.label : phase.id, kind: phase.kind === 'movement' ? 'movement' : null }))
  if (!phases.length) return [{ id: 'movement', label: 'Mouvement', kind: 'movement', step: MOVEMENT_STEP }]
  if (!phases.some((phase) => phase.kind === 'movement')) phases[0].kind = 'movement'
  let custom = CUSTOM_PHASE_BASE
  let movementSeen = false
  for (const phase of phases) {
    // Deux phases "movement" : la seconde n'est qu'un jalon.
    if (phase.kind === 'movement' && movementSeen) phase.kind = null
    if (phase.kind === 'movement') movementSeen = true
    phase.step = phase.kind ? MOVEMENT_STEP : custom++
  }
  return phases
}

/** `module.turnStructure` → `{ phases }` : la liste des phases du tour (cf.
 *  `resolvePhases`). */
export function resolveTurnStructure(raw) {
  const structure = raw && typeof raw === 'object' ? raw : {}
  return { phases: resolvePhases(structure.phases) }
}

/** Une limite d'empilement déclarée (nombre ou `"none"`) → nombre
 *  (`Infinity` pour `"none"`), `fallback` si invalide. */
function resolveLimit(value, fallback) {
  if (value === 'none') return Infinity
  return Number.isInteger(value) && value >= 1 ? value : fallback
}

/** `rules.stackingLimit` → `{ default, bySide }` : limite par défaut et
 *  limites propres à certains camps (cf. `DEFAULT_RULES.stackingLimit`). */
function resolveStacking(raw) {
  if (raw && typeof raw === 'object') {
    const bySide = Object.fromEntries(Object.entries(raw).map(([side, value]) => [side, resolveLimit(value, DEFAULT_RULES.stackingLimit)]))
    return { default: DEFAULT_RULES.stackingLimit, bySide }
  }
  return { default: resolveLimit(raw, DEFAULT_RULES.stackingLimit), bySide: {} }
}

/** Limite d'empilement du camp `side` (clé de `module.sides`, ou `null`),
 *  d'après des règles résolues (cf. `resolveRules`). */
export function stackingLimitOf(rules, side) {
  return rules.stackingLimit.bySide[side] ?? rules.stackingLimit.default
}

/** `module.rules` (objet libre, éventuellement absent) → règles prêtes à
 *  l'emploi : entiers vérifiés, défauts appliqués, clés inconnues
 *  conservées. */
export function resolveRules(raw) {
  const rules = raw && typeof raw === 'object' ? raw : {}
  const zoc = rules.zoc && typeof rules.zoc === 'object' ? rules.zoc : {}
  const zocFlag = (key) => (typeof zoc[key] === 'boolean' ? zoc[key] : DEFAULT_RULES.zoc[key])
  return {
    ...rules,
    stackingLimit: resolveStacking(rules.stackingLimit),
    zoc: { lockIfStarting: zocFlag('lockIfStarting'), stopOnEntry: zocFlag('stopOnEntry') },
    entryCongestion: ENTRY_CONGESTION_MODES.includes(rules.entryCongestion) ? rules.entryCongestion : DEFAULT_RULES.entryCongestion,
  }
}
