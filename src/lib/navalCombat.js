// ═══════════════════════════════════════════════════════════════════════════
// navalCombat — combat de surface : tableau, tireurs, meilleur plan de tir
// ═══════════════════════════════════════════════════════════════════════════
//
// Deux camps se battent (cf. lib/useCoralSea.js, combat naval) : chacun
// forme des ATTAQUES d'un ou deux pions navires (puissances de feu
// additionnées), chacune sur un navire ennemi — plusieurs attaques peuvent
// viser le même. Chaque attaque lance un dé sur le Naval Combat Chart
// (`navalCombat` de coral-sea.json) : colonne = puissance de feu, ligne = dé
// + bonus du camp. Les dégâts se lisent comme ceux d'une frappe aéronavale
// (cf. lib/airStrike.js::damageOutcome), mais ne s'ADDITIONNENT PAS : les
// attaques sur un même navire se résolvent une par une, dans leur ordre,
// chacune sur l'état que lui ont laissé les précédentes (ex. un navire 4/3
// qui prend 5 puis 2 : dommages significatifs, puis rien).
//
// Le meilleur plan (pour l'IA) est celui qui rapporte, en moyenne sur tous
// les jets, le plus de points de victoire (barème par résultat du navire
// touché, cf. lib/airStrike.js::outcomePoints). Calcul :
//   1. des pions de même puissance sont interchangeables : les tireurs sont
//      décrits par "combien de pions de chaque puissance", une partie d'entre
//      eux par un vecteur de ces nombres, numéroté en base mixte (cf.
//      lib/strikePlanner.js::describeSquad) ;
//   2. découpages de chaque partie en attaques de 1 ou 2 pions ; meilleure
//      valeur de chaque navire avec chaque partie (meilleur ordre de ses
//      attaques compris) ;
//   3. répartition des tireurs entre les navires par programmation
//      dynamique — le meilleur plan possible, sans approximation ;
//   4. trop de puissances différentes pour cela : recherche locale à graine
//      fixe (les mêmes données donnent toujours le même plan).
// Tous les tireurs tirent : une attaque de plus ne peut jamais faire perdre
// de points.
import { damageOutcome, outcomePoints } from './airStrike.js'
import { describeSquad, eachSubsquad } from './strikePlanner.js'

// Garde-fou de la recherche exacte (somme des sous-parties de chaque partie,
// par navire) : au-delà, recherche locale.
const MAX_EXACT_WORK = 2_000_000
// Au-delà de ce nombre d'attaques sur un même navire, on n'essaie plus tous
// leurs ordres (plus forte d'abord, ou plus faible d'abord).
const MAX_ORDERED = 5

/** Tableau du module (`navalCombat` de coral-sea.json) : `{ die, bonus,
 *  ranges, nightDoubled, results }` — `bonus` : camp -> bonus au dé ;
 *  `ranges` : classes de portée, de la plus longue à la plus courte ;
 *  `nightDoubled` : camp -> types dont la puissance double de nuit. `null`
 *  sans tableau. */
export function resolveNavalTable(raw) {
  if (!Array.isArray(raw?.results) || !raw.results.length) return null
  return { die: raw.die ?? 6, bonus: raw.bonus ?? {}, ranges: raw.ranges ?? [], nightDoubled: raw.nightDoubled ?? {}, results: raw.results }
}

/** Puissance au-delà de laquelle une attaque ne gagne plus rien : la
 *  dernière colonne du tableau (16+). */
const powerCap = (table) => Math.max(...table.results.map((row) => row.length))

/** Dégâts d'une attaque de puissance `firepower` au jet `roll` (dé + bonus
 *  du camp) : ligne bornée au tableau, puissance à sa dernière colonne. */
export function navalDamage(table, firepower, roll) {
  if (!(firepower >= 1)) return 0
  const row = table.results[Math.min(Math.max(roll, 1), table.results.length) - 1]
  return row[Math.min(firepower, row.length) - 1] ?? 0
}

/** Rang de portée du type `type` (0 = la plus longue), -1 s'il n'en a pas
 *  (porte-avions, transports...). */
export const rangeRank = (table, type) => table.ranges.indexOf(type)

/** Portées possibles d'un combat de jour entre les navires `ships` (`{ type,
 *  firepower }`, des deux camps) : la plus longue des navires qui ont une
 *  puissance de feu, puis les plus courtes. Vide si personne ne peut tirer. */
export function rangeOptions(table, ships) {
  const ranks = ships.filter((ship) => ship.firepower > 0).map((ship) => rangeRank(table, ship.type)).filter((rank) => rank >= 0)
  return ranks.length ? table.ranges.slice(Math.min(...ranks)) : []
}

/** Navires de `ships` qui tirent : de nuit (`range` nul), tous ceux qui ont
 *  une puissance de feu ; de jour, ceux dont la portée est au moins `range`. */
export function firingShips(table, ships, range) {
  if (range == null) return ships.filter((ship) => ship.firepower > 0)
  const limit = rangeRank(table, range)
  return ships.filter((ship) => {
    const rank = rangeRank(table, ship.type)
    return ship.firepower > 0 && rank >= 0 && rank <= limit
  })
}

/** Probabilité de chaque état final d'un navire `target` (`{ durability: {
 *  intact, reduced }, damage }`) après les attaques de puissances `powers`,
 *  dans cet ordre, d'un camp au bonus `bonus` : état -> probabilité. */
export function attackSequenceOutcomes(table, target, powers, bonus = 0) {
  let states = new Map([[target.damage ?? 'none', 1]])
  for (const power of powers) {
    const next = new Map()
    for (const [state, p] of states) {
      for (let die = 1; die <= table.die; die++) {
        const after = damageOutcome(navalDamage(table, power, die + bonus), target.durability, state)
        next.set(after, (next.get(after) ?? 0) + p / table.die)
      }
    }
    states = next
  }
  return states
}

/** Ordres distincts de la liste `list` (permutations d'un multiensemble),
 *  en index de `list`. */
function uniqueOrders(list) {
  const out = []
  const used = new Array(list.length).fill(false)
  ;(function walk(order) {
    if (order.length === list.length) { out.push(order.slice()); return }
    const tried = new Set()
    list.forEach((value, index) => {
      if (used[index] || tried.has(value)) return
      tried.add(value)
      used[index] = true
      order.push(index)
      walk(order)
      order.pop()
      used[index] = false
    })
  })([])
  return out
}

/** Évaluateur d'un navire `target` (`{ durability, points, damage }`) :
 *  puissances des attaques qu'il reçoit (liste croissante) -> `{
 *  expectedPoints, order }` — `order`, le meilleur ordre de ces attaques (en
 *  index de la liste). Mémorisé par liste. */
function makeEvaluator(table, target, bonus) {
  const current = target.damage ?? 'none'
  const memo = new Map([['', { expectedPoints: 0, order: [] }]])
  const valueOf = (powers) => {
    let points = 0
    for (const [state, p] of attackSequenceOutcomes(table, target, powers, bonus)) points += p * outcomePoints(target.points, state, current)
    return points
  }
  return function evaluate(sorted) {
    const key = sorted.join(',')
    let result = memo.get(key)
    if (!result) {
      const orders = sorted.length <= MAX_ORDERED ? uniqueOrders(sorted)
        : [sorted.map((_, index) => sorted.length - 1 - index), sorted.map((_, index) => index)]
      result = { expectedPoints: -Infinity, order: [] }
      for (const order of orders) {
        const points = valueOf(order.map((index) => sorted[index]))
        if (points > result.expectedPoints + 1e-12) result = { expectedPoints: points, order }
      }
      memo.set(key, result)
    }
    return result
  }
}

/** Recherche exacte : le meilleur plan (`{ expectedPoints, byTarget }` —
 *  `byTarget[t]` : attaques sur le navire `t`, dans leur ordre, chacune une
 *  liste d'index de `powers`), ou `null` si elle serait trop longue. */
function exactSearch(table, powers, targets, evaluators) {
  const squad = describeSquad(powers)
  const cap = powerCap(table)
  // Travail de la programmation dynamique : Σ des sous-parties de chaque
  // partie, par navire.
  const work = squad.base.reduce((product, b) => product * (b * (b + 1)) / 2, 1) * targets.length
  if (work > MAX_EXACT_WORK) return null

  // Découpages de chaque partie en attaques de 1 ou 2 pions (groupes de
  // classes de puissance, ex. [k] ou [k, j]), notés par leur liste triée de
  // puissances.
  const groupPower = (group) => Math.min(group.reduce((sum, k) => sum + squad.distinct[k], 0), cap)
  const splitMemo = new Map()
  function splitsOf(id) {
    let found = splitMemo.get(id)
    if (found) return found
    found = new Map()
    if (id === 0) found.set('', [])
    else {
      const vector = squad.toVector(id)
      const k = vector.findIndex((count) => count > 0)
      const groups = [[k]]
      for (let j = k; j < vector.length; j++) if (vector[j] > (j === k ? 1 : 0)) groups.push([k, j])
      for (const group of groups) {
        const rest = id - group.reduce((sum, index) => sum + squad.weights[index], 0)
        for (const restGroups of splitsOf(rest).values()) {
          const all = [...restGroups, group]
          const key = all.map(groupPower).sort((a, b) => a - b).join(',')
          if (!found.has(key)) found.set(key, all)
        }
      }
    }
    splitMemo.set(id, found)
    return found
  }

  // Meilleures attaques de chaque navire avec chaque partie (partagées entre
  // navires identiques).
  const signature = (target) => [target.durability.intact, target.durability.reduced, target.points.join('/'), target.damage ?? 'none'].join('|')
  const shared = new Map()
  const bestFor = targets.map((target, index) => {
    const key = signature(target)
    if (shared.has(key)) return shared.get(key)
    const byPart = new Array(squad.size)
    for (let id = 0; id < squad.size; id++) {
      let best = null
      for (const groups of splitsOf(id).values()) {
        const ordered = groups.map((group) => ({ group, power: groupPower(group) })).sort((a, b) => a.power - b.power)
        const result = evaluators[index](ordered.map((entry) => entry.power))
        if (!best || result.expectedPoints > best.expectedPoints + 1e-12) {
          best = { expectedPoints: result.expectedPoints, groups: result.order.map((at) => ordered[at].group) }
        }
      }
      byPart[id] = best
    }
    shared.set(key, byPart)
    return byPart
  })

  // Répartition entre navires : value[S] = meilleur total qui emploie
  // exactement S sur les navires déjà traités ; `picks[t][S]` : la part du
  // navire t.
  let value = new Float64Array(squad.size).fill(-Infinity)
  value[0] = 0
  const picks = []
  for (let t = 0; t < targets.length; t++) {
    const next = new Float64Array(squad.size).fill(-Infinity)
    const pick = new Int32Array(squad.size)
    for (let total = 0; total < squad.size; total++) {
      eachSubsquad(squad, squad.toVector(total), (part) => {
        const before = value[total - part]
        if (before === -Infinity) return
        const score = before + bestFor[t][part].expectedPoints
        if (score > next[total] + 1e-12) { next[total] = score; pick[total] = part }
      })
    }
    value = next
    picks.push(pick)
  }

  // Retour aux tireurs réels, piochés par puissance.
  const pool = squad.planesOf.map((list) => list.slice())
  const byTarget = targets.map(() => [])
  let left = squad.full
  for (let t = targets.length - 1; t >= 0; t--) {
    const part = picks[t][left]
    byTarget[t] = bestFor[t][part].groups.map((group) => group.map((k) => pool[k].shift()))
    left -= part
  }
  return { expectedPoints: value[squad.full], byTarget }
}

/** Recherche locale (recuit simulé à graine fixe) : le meilleur plan
 *  rencontré, même forme que `exactSearch`. */
function localSearch(table, powers, targets, evaluators) {
  let seed = 0x2545f491
  const random = () => { // mulberry32
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = (bound) => Math.floor(random() * bound)
  const cap = powerCap(table)
  const powerOf = (group) => Math.min(group.reduce((sum, index) => sum + powers[index], 0), cap)
  // Un plan : des attaques `{ target, shooters }` (1 ou 2 tireurs).
  function evaluate(attacks) {
    let expectedPoints = 0
    const byTarget = targets.map(() => [])
    targets.forEach((_, target) => {
      const own = attacks.filter((attack) => attack.target === target).map((attack) => ({ group: attack.shooters, power: powerOf(attack.shooters) }))
        .sort((a, b) => a.power - b.power)
      if (!own.length) return
      const result = evaluators[target](own.map((entry) => entry.power))
      expectedPoints += result.expectedPoints
      byTarget[target] = result.order.map((at) => own[at].group.slice())
    })
    return { expectedPoints, byTarget }
  }
  const copy = (attacks) => attacks.map((attack) => ({ target: attack.target, shooters: attack.shooters.slice() }))
  function tweak(attacks) {
    const next = copy(attacks)
    const roll = random()
    const a = pick(next.length)
    if (roll < 0.35) next[a].target = pick(targets.length)
    else if (roll < 0.6 && next[a].shooters.length === 2) next.push({ target: pick(targets.length), shooters: [next[a].shooters.pop()] })
    else if (roll < 0.85) {
      const b = next.findIndex((attack, index) => index !== a && attack.shooters.length === 1 && next[a].shooters.length === 1)
      if (b >= 0) { next[a].shooters.push(...next[b].shooters); next.splice(b, 1) }
    } else if (next.length > 1) {
      let b = pick(next.length)
      if (b === a) b = (b + 1) % next.length
      const ia = pick(next[a].shooters.length)
      const ib = pick(next[b].shooters.length)
      ;[next[a].shooters[ia], next[b].shooters[ib]] = [next[b].shooters[ib], next[a].shooters[ia]]
    }
    return next
  }
  let best = null
  const all = powers.map((_, index) => index)
  for (let start = 0; start < 12; start++) {
    let attacks = start % 2 === 0
      ? all.map((index) => ({ target: pick(targets.length), shooters: [index] }))
      : all.reduce((list, index) => {
        const open = list.find((attack) => attack.shooters.length === 1)
        if (open && random() < 0.5) open.shooters.push(index)
        else list.push({ target: pick(targets.length), shooters: [index] })
        return list
      }, [])
    let current = evaluate(attacks)
    const tries = 6000
    for (let tryIndex = 0; tryIndex < tries; tryIndex++) {
      const temperature = 2 * Math.pow(0.0025, tryIndex / tries)
      const proposed = tweak(attacks)
      const plan = evaluate(proposed)
      const gain = plan.expectedPoints - current.expectedPoints
      if (gain >= 0 || random() < Math.exp(gain / temperature)) { attacks = proposed; current = plan }
      if (!best || current.expectedPoints > best.expectedPoints + 1e-12) best = current
    }
  }
  return best
}

/** Meilleur plan de tir des pions de puissances `powers` (de feu, une par
 *  pion ; 0 ne tire pas) sur les navires `targets` (`{ durability: { intact,
 *  reduced }, points, damage }` — `points` : un barème par résultat, cf.
 *  lib/airStrike.js::STRIKE_OUTCOMES), d'un camp au bonus `bonus` : `{ method, expectedPoints,
 *  attacks }` — `attacks` : `[{ target, shooters }]` dans leur ordre de
 *  résolution (`target` : index dans `targets`, `shooters` : index dans
 *  `powers`, 1 ou 2), `method` : 'exact' ou 'approximate'. */
export function planNavalAttacks(table, powers, targets, bonus = 0) {
  const shooters = powers.flatMap((power, index) => (power > 0 ? [index] : []))
  if (!table || !shooters.length || !targets.length) return { method: 'exact', expectedPoints: 0, attacks: [] }
  const capped = shooters.map((index) => Math.min(powers[index], powerCap(table)))
  const evaluators = targets.map((target) => makeEvaluator(table, target, bonus))
  const exact = exactSearch(table, capped, targets, evaluators)
  const found = exact ?? localSearch(table, capped, targets, evaluators)
  const attacks = found.byTarget.flatMap((groups, target) => groups.map((group) => ({ target, shooters: group.map((index) => shooters[index]) })))
  return { method: exact ? 'exact' : 'approximate', expectedPoints: found.expectedPoints, attacks }
}

/** Batailles formées par les liens `links` (`[[a, b]]`, ids de task forces
 *  qui se battent) : groupes d'ids reliés entre eux, de proche en proche. */
export function connectedGroups(links) {
  const parent = new Map()
  const root = (id) => {
    while (parent.get(id) !== id) id = parent.get(id)
    return id
  }
  for (const [a, b] of links) {
    for (const id of [a, b]) if (!parent.has(id)) parent.set(id, id)
    parent.set(root(a), root(b))
  }
  const groups = new Map()
  for (const id of parent.keys()) groups.set(root(id), [...(groups.get(root(id)) ?? []), id])
  return [...groups.values()]
}
