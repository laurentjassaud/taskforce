// ═══════════════════════════════════════════════════════════════════════════
// turnTrack — lecture de la piste de tour d'un module (`module.turnTrack`)
// ═══════════════════════════════════════════════════════════════════════════
//
// Forme de base (cf. README) : `{ turns, order: [campKey...], sides }` — le
// même ordre des camps à chaque tour. Un module peut en plus détailler
// chaque tour dans `turnInfo` (tableau indexé par tour - 1), dont chaque
// entrée peut porter :
//   - `time`        : heure ou libellé court affiché sous le numéro ;
//   - `initiative`  : camp qui joue EN PREMIER ce tour-ci (les autres camps
//                     suivent dans l'ordre de `order`) ;
//   - `movement`    : potentiel de mouvement (en MP) de toute unité ce
//                     tour-ci, à la place de son `mov` ;
//   - `skipPhases`  : ids de phases (`turnStructure.phases`) absentes de ce
//                     tour ;
//   - `conditions`  : valeurs des lignes de `turnTrack.conditions` (texte,
//                     ou booléen affiché ✓/✗).
// Et `turnTrack.periods` (`[{ label, from, to, style }]`) regroupe des tours
// sous un bandeau ("Nuit", "Premier jour"...).
//
// `turnTrack.setup` (`{ side, label, short }`) ajoute, AVANT le tour 1, une
// étape de MISE EN PLACE jouée par le seul camp `side` (tour 0) : il y pose
// ses pions de tour 0 depuis le panneau (cf. lib/useAssisted.js, phase
// "setup"). Avec `sides` (camps dans l'ordre) à la place de `side`, chaque
// camp a sa propre étape de mise en place, l'un après l'autre (ex. le mode
// à deux joueurs, cf. `resolveTrack`).
//
// Le nombre de camps par tour reste constant (`order.length`) : un pas de la
// piste est toujours `[mise en place] + (tour - 1) × order.length + rang du
// camp`.
//
// PHASES ENTREMÊLÉES (`turnTrack.interleaved: true`, ex. la mer de Corail) :
// il n'y a plus de "tour d'un joueur". Chaque phase du tour est jouée par
// tous les camps, l'un après l'autre, avant de passer à la phase suivante :
// Mouvement japonais, Mouvement allié, Combat naval..., Administrative
// japonaise, Administrative alliée. Un pas de la piste est alors un
// CRÉNEAU `{ turn, phase, side }` (cf. `resolveTrack`, qui les calcule à
// partir de `turnStructure.phases`) ; les phases absentes d'un tour
// (`turnInfo.skipPhases`) n'ont pas de créneau. Une phase déclarée
// `"order": "roll"` a un ordre tiré au dé à chaque tour (cf. HexMap.vue::
// rollPhaseOrder) : ses créneaux portent `side: null` et `rollIndex` (0 pour
// le premier à jouer, 1 pour le second), le camp n'étant connu qu'une fois
// le dé tiré (`rollOrders`, tour -> camps dans l'ordre de jeu). Une phase
// déclarée `"shared": true` (ex. le Combat naval de la mer de Corail) se
// joue une seule fois pour tous les camps : un seul créneau par tour, au
// camp qui a l'initiative (`shared: true` sur le créneau).

/** Joker de `stepSequence` pour un créneau dont le camp est tiré au dé : le
 *  serveur laisse alors jouer n'importe quel joueur (cf. server/src/rooms.js
 *  ::isPlayersTurn) — le client, lui, sait qui a la main. */
export const ANY_SIDE = '*'

/** `module` → sa piste de tour, complétée des créneaux (`slots`) si elle
 *  entremêle les phases. À utiliser partout où la piste sert à compter les
 *  pas (TurnTracker.vue, HexMap.vue, server/src/duel.js). */
export function resolveTrack(module, { setup, phases: kept } = {}) {
  // `setup` : mise en place propre à la partie, à la place de celle du
  // module (ex. une étape par camp en mode deux joueurs) ; `phases` : ids
  // des seules phases jouées (ex. Mouvement et Reconnaissance à deux
  // joueurs), toutes à défaut.
  const track = module?.turnTrack && setup ? { ...module.turnTrack, setup } : module?.turnTrack
  if (!track?.interleaved) return track ?? null
  const phases = phasesOf(module, kept)
  const slots = []
  for (let turn = 1; turn <= (track.turns ?? 0); turn++) {
    const skipped = turnInfoOf(track, turn)?.skipPhases ?? []
    const sides = sidesOfTurn(track, turn)
    for (const phase of phases) {
      if (phase.kind !== 'movement' && skipped.includes(phase.id)) continue
      if (phase.shared) {
        slots.push({ turn, phase: phase.id, side: sides[0], shared: true })
        continue
      }
      sides.forEach((side, rank) => {
        slots.push(phase.order === 'roll'
          ? { turn, phase: phase.id, side: null, rollIndex: rank }
          : { turn, phase: phase.id, side })
      })
    }
  }
  return { ...track, slots }
}

/** Options de `resolveTrack` d'une partie à deux joueurs (mode `duel`) :
 *  une étape de mise en place par camp, dans l'ordre de la piste
 *  (`turnTrack.order`), et les seules phases du scénario `scenario`
 *  (`duel.phases`). `label` : libellé de la mise en place. `{}` sans piste.
 *  Partagé par le plateau (HexMap.vue) et l'arbitre des parties en ligne
 *  (server/src/duel.js), qui en tire la séquence des camps. */
export function duelTrackOptions(module, scenario, label) {
  if (!module?.turnTrack) return {}
  return {
    setup: { sides: module.turnTrack.order ?? [], label, short: module.turnTrack.setup?.short },
    phases: scenario?.duel?.phases ?? null,
  }
}

/** Phases du tour de `module` (`turnStructure.phases`), réduites aux ids
 *  `kept` s'ils sont donnés. */
function phasesOf(module, kept) {
  const phases = module?.turnStructure?.phases ?? []
  return kept ? phases.filter((phase) => kept.includes(phase.id)) : phases
}

/** Pas d'un journal tenu quand les phases `shared` avaient encore un
 *  créneau par camp (cf. HexMap.vue::deploymentData, `track`) : fonction
 *  ancien pas -> pas de la piste de `module` (même tour, même phase, même
 *  camp — ou le créneau unique de la phase partagée). `null` si la piste
 *  n'a pas de phase partagée : rien à convertir. */
export function legacyStepMapper(module, options = {}) {
  const track = resolveTrack(module, options)
  const phases = phasesOf(module, options.phases)
  if (!track?.slots || !phases.some((phase) => phase.shared)) return null
  const shared = new Set(phases.filter((phase) => phase.shared).map((phase) => phase.id))
  const unshared = phases.map(({ shared: _shared, ...phase }) => phase)
  const legacy = resolveTrack({ ...module, turnStructure: { ...module.turnStructure, phases: unshared } }, options).slots
  const keyOf = (slot) => `${slot.turn}|${slot.phase}|${shared.has(slot.phase) ? '' : slot.side ?? slot.rollIndex}`
  const stepOfKey = new Map(track.slots.map((slot, index) => [keyOf(slot), index]))
  const offset = setupSteps(track)
  return (step) => {
    const slot = legacy[step - offset]
    const index = slot ? stepOfKey.get(keyOf(slot)) : null
    return index == null ? step : index + offset
  }
}

/** Créneau du pas `step` (piste entremêlée), ou `null`. */
export function slotOfStep(config, step) {
  return config?.slots?.[step - setupSteps(config)] ?? null
}

/** Nombre total de pas de la piste, mise en place comprise. */
export function totalStepsOf(config) {
  if (!config) return 0
  const perTurns = config.slots ? config.slots.length : (config.turns ?? 0) * (config.order?.length ?? 0)
  return setupSteps(config) + perTurns
}

/** Détail du tour `turn` (1-based), ou `null`. */
export function turnInfoOf(config, turn) {
  return config?.turnInfo?.[turn - 1] ?? null
}

/** Camps du tour `turn`, dans leur ordre de jeu : le camp qui a
 *  l'initiative d'abord, puis les autres dans l'ordre de `order`. */
export function sidesOfTurn(config, turn) {
  const order = config?.order ?? []
  const first = turnInfoOf(config, turn)?.initiative
  if (!first || !order.includes(first)) return order
  const start = order.indexOf(first)
  return [...order.slice(start), ...order.slice(0, start)]
}

/** La piste commence-t-elle par une étape de mise en place ? */
export function hasSetup(config) {
  return setupSidesOf(config).length > 0
}

/** Camps de la mise en place, un par étape, dans l'ordre (cf. l'en-tête). */
export function setupSidesOf(config) {
  return config?.setup?.sides ?? (config?.setup?.side ? [config.setup.side] : [])
}

/** Nombre de pas avant le premier tour : une étape par camp de la mise en
 *  place, 0 sans mise en place. */
export function setupSteps(config) {
  return setupSidesOf(config).length
}

/** Numéro du tour au pas `step` — 0 pendant la mise en place. */
export function turnOfStep(config, step) {
  const count = config?.order?.length || 1
  const offset = setupSteps(config)
  if (step < offset) return 0
  if (config?.slots) return slotOfStep(config, step)?.turn ?? config.turns ?? 0
  return Math.floor((step - offset) / count) + 1
}

/** Camp qui a la main au pas `step` (0-based), ou `null`. `rollOrders` (tour
 *  -> camps dans l'ordre de jeu) tranche les créneaux tirés au dé ; `null`
 *  tant que le dé n'a pas été tiré. */
export function sideOfStep(config, step, rollOrders = null) {
  const count = config?.order?.length ?? 0
  if (!count) return null
  const offset = setupSteps(config)
  if (step < offset) return setupSidesOf(config)[step] ?? null
  if (config.slots) {
    const slot = slotOfStep(config, step)
    if (!slot) return null
    return slot.side ?? rollOrders?.[slot.turn]?.[slot.rollIndex] ?? null
  }
  return sidesOfTurn(config, turnOfStep(config, step))[(step - offset) % count] ?? null
}

/** Séquence complète des camps, pas par pas, pour toute la partie — ce que
 *  le serveur tient comme `turnOrder` (cf. server/src/duel.js) : il y lit le
 *  camp actif par `turnOrder[pas % longueur]`, ce qui revient au même que
 *  `order` quand aucun tour ne change l'initiative. */
export function stepSequence(config) {
  const order = config?.order ?? []
  if (config?.slots) return [...setupSidesOf(config), ...config.slots.map((slot) => slot.side ?? ANY_SIDE)]
  if (!config?.turnInfo && !hasSetup(config)) return order
  const sequence = [...setupSidesOf(config)]
  for (let turn = 1; turn <= (config.turns ?? 0); turn++) sequence.push(...sidesOfTurn(config, turn))
  return sequence
}

/** Bandeau (`turnTrack.periods`) qui contient le tour `turn`, ou `null`. */
export function periodOf(config, turn) {
  return config?.periods?.find((period) => turn >= period.from && turn <= period.to) ?? null
}
