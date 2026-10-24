// ═══════════════════════════════════════════════════════════════════════════
// strikePlanner — meilleur plan d'une frappe aéronavale, en points de victoire
// ═══════════════════════════════════════════════════════════════════════════
//
// Une escadrille (avions de puissance anti-ship donnée, cf.
// lib/airStrike.js::antiShipPower) attaque les navires d'une task force :
// quels navires viser, et comment découper l'escadrille en attaques
// séparées (un GROUPE d'avions additionne ses puissances ; chaque groupe a
// son propre jet AA, et les dégâts reçus par un même navire s'additionnent)
// pour obtenir, EN MOYENNE sur tous les jets, le plus de points de victoire
// — barème par résultat du navire touché (rien, mineur, significatif,
// critique, coulé ; cf. coral-sea.json, `victoryPoints`). Tous les avions
// attaquent ; un navire peut ne pas être visé.
//
// Calcul repris de l'optimiseur de l'artefact « Frappe aéronavale · Task
// Force », sur les tableaux du module (cf. lib/airStrike.js) :
//   1. loi EXACTE des dégâts d'une attaque, sur toutes les combinaisons des
//      deux dés (`attackDamage`) ; plusieurs attaques sur un navire : loi du
//      total par convolution, tronquée au seuil "coulé" (au-delà, le nombre
//      de dégâts ne change plus rien) ;
//   2. des avions de même puissance sont interchangeables : l'escadrille est
//      décrite par "combien d'avions de chaque puissance" (`describeSquad`),
//      et une sous-escadrille par un vecteur de ces nombres, numéroté en
//      base mixte (numéro(S1) + numéro(S2) = numéro(S1 + S2)) ;
//   3. recherche EXACTE (`exactSearch`) : tous les découpages de chaque
//      sous-escadrille, les meilleures attaques de chaque navire avec chaque
//      sous-escadrille, puis la répartition entre navires par programmation
//      dynamique — les meilleurs plans possibles, sans approximation ;
//   4. si l'escadrille mélange trop de puissances pour cela, recherche
//      APPROCHÉE par recuit simulé (`annealingSearch`), à graine fixe : les
//      mêmes données donnent toujours le même plan.
import { resolveStrike, damageOutcome, STRIKE_OUTCOMES } from './airStrike.js'

// Garde-fous de la recherche exacte : au-delà, recherche approchée.
const MAX_SPLITS = 600000
const MAX_SUBSQUADS = 1000

/** Puissance au-delà de laquelle un groupe ne gagne plus rien : la dernière
 *  colonne de l'Air-to-Surface Chart est atteinte même avec le pire malus
 *  AA (18 avec les tableaux de la boîte). Plafonner reconnaît comme
 *  identiques des groupes qui le sont vraiment (ex. 19 et 25). */
function usefulPowerCap(table) {
  const { columns, min = 1 } = table.airToSurface
  const lastColumnFrom = columns.length > 1 ? columns[columns.length - 2].max + 1 : min
  const worstMalus = Math.max(0, ...table.antiAir.results.flat().map((cell) => cell?.[1] ?? 0))
  return lastColumnFrom + worstMalus
}

/** Loi des dégâts d'une attaque de puissance `antiShip` sur une défense AA
 *  `antiAir` : `[p(0 dégât), p(1), ...]`, tronquée à `ceiling` (les totaux
 *  au-delà vont dans la dernière case). */
function attackDamage(table, antiAir, antiShip, ceiling) {
  const law = new Float64Array(ceiling + 1)
  const share = 1 / (table.die * table.die)
  for (let aaRoll = 1; aaRoll <= table.die; aaRoll++) {
    for (let attackRoll = 1; attackRoll <= table.die; attackRoll++) {
      law[Math.min(resolveStrike(table, { antiAir, antiShip }, aaRoll, attackRoll).damage, ceiling)] += share
    }
  }
  return law
}

/** Loi du total de deux attaques indépendantes, tronquée à `ceiling`. */
function addAttacks(lawA, lawB, ceiling) {
  const total = new Float64Array(ceiling + 1)
  for (let a = 0; a <= ceiling; a++) {
    if (!lawA[a]) continue
    for (let b = 0; b <= ceiling; b++) if (lawB[b]) total[Math.min(a + b, ceiling)] += lawA[a] * lawB[b]
  }
  return total
}

/** Évaluateur d'un navire `target` (`{ antiAir, durability: { intact,
 *  reduced }, points }`, `points` : un barème par résultat de
 *  `STRIKE_OUTCOMES`) : puissances des attaques qu'il reçoit (liste
 *  croissante, plafonnée) -> `{ expectedPoints, outcomes }` (probabilité de
 *  chaque résultat). Tout est mémorisé, par puissance et par liste. */
function makeEvaluator(table, target, powerCap) {
  const { intact, reduced } = target.durability
  const ceiling = intact + reduced + 2 // seuil "coulé"
  const byPower = Array.from({ length: powerCap + 1 }, (_, power) => attackDamage(table, target.antiAir, power, ceiling))
  const none = new Float64Array(ceiling + 1)
  none[0] = 1
  const lawByList = new Map([['', none]])
  const resultByList = new Map()

  function lawOf(powers, key) {
    let law = lawByList.get(key)
    if (law) return law
    const rest = powers.slice(0, -1)
    law = addAttacks(lawOf(rest, rest.join(',')), byPower[powers[powers.length - 1]], ceiling)
    lawByList.set(key, law)
    return law
  }

  return function evaluate(powers, knownKey) {
    const key = knownKey ?? powers.join(',')
    let result = resultByList.get(key)
    if (!result) {
      const outcomes = STRIKE_OUTCOMES.map(() => 0)
      lawOf(powers, key).forEach((p, damage) => { outcomes[STRIKE_OUTCOMES.indexOf(damageOutcome(damage, { intact, reduced }))] += p })
      result = { expectedPoints: outcomes.reduce((sum, p, index) => sum + p * (target.points[index] ?? 0), 0), outcomes }
      resultByList.set(key, result)
    }
    return result
  }
}

/** L'escadrille `powers` (une puissance par avion, déjà plafonnée) décrite
 *  par puissance : puissances distinctes (décroissantes), nombre d'avions de
 *  chacune, et la numérotation en base mixte de ses sous-escadrilles. */
function describeSquad(powers) {
  const distinct = [...new Set(powers)].sort((a, b) => b - a)
  const planesOf = distinct.map((power) => powers.flatMap((p, index) => (p === power ? [index] : [])))
  const base = planesOf.map((planes) => planes.length + 1)
  const weights = []
  base.reduce((weight, b) => { weights.push(weight); return weight * b }, 1)
  const size = base.reduce((product, b) => product * b, 1)
  const toVector = (id) => base.map((b, k) => Math.floor(id / weights[k]) % b)
  const totalPower = (id) => toVector(id).reduce((sum, count, k) => sum + count * distinct[k], 0)
  return { distinct, planesOf, weights, size, full: size - 1, toVector, totalPower }
}

/** `action(id)` pour chaque sous-escadrille incluse dans le vecteur `max`. */
function eachSubsquad(squad, max, action) {
  (function walk(digit, id) {
    if (digit === max.length) return action(id)
    for (let count = 0; count <= max[digit]; count++) walk(digit + 1, id + count * squad.weights[digit])
  })(0, 0)
}

function insertSorted(list, value) {
  const result = list.slice()
  let position = result.length
  while (position > 0 && result[position - 1] > value) position--
  result.splice(position, 0, value)
  return result
}

/** Garde les `size` meilleurs éléments proposés (par `expectedPoints`) ;
 *  `make` n'est appelé que pour un élément qui entre. */
class Best {
  constructor(size) { this.size = size; this.items = [] }
  threshold() { return this.items.length < this.size ? -Infinity : this.items[this.items.length - 1].expectedPoints }
  offer(score, make) {
    if (score < this.threshold()) return
    let position = this.items.length
    while (position > 0 && this.items[position - 1].expectedPoints < score) position--
    this.items.splice(position, 0, make())
    if (this.items.length > this.size) this.items.pop()
  }
  list() { return this.items.length ? this.items : null }
}

/** Recherche exacte : les `keep` meilleurs plans, ou `null` si elle serait
 *  trop longue. */
function exactSearch(powers, targets, evaluators, keep, powerCap) {
  const squad = describeSquad(powers)
  if (squad.size > MAX_SUBSQUADS) return null

  // A. Découpages de chaque sous-escadrille S, notés par leur liste triée de
  // puissances : le groupe qui contient un avion de la plus forte puissance
  // présente, plus un découpage (déjà connu) du reste.
  const splits = new Array(squad.size)
  splits[0] = new Map([['', { powers: [], group: 0, restId: -1, restKey: null }]])
  let splitCount = 1
  for (let id = 1; id < squad.size; id++) {
    const vector = squad.toVector(id)
    const first = vector.findIndex((count) => count > 0)
    const found = new Map()
    eachSubsquad(squad, vector, (group) => {
      if (!squad.toVector(group)[first]) return
      const groupPower = Math.min(squad.totalPower(group), powerCap)
      for (const [restKey, rest] of splits[id - group]) {
        const list = insertSorted(rest.powers, groupPower)
        const key = list.join(',')
        if (!found.has(key)) found.set(key, { powers: list, group, restId: id - group, restKey })
      }
    })
    splits[id] = found
    splitCount += found.size
    if (splitCount > MAX_SPLITS) return null
  }

  // B. Meilleures attaques de chaque navire avec chaque S (partagées entre
  // navires identiques pour le calcul).
  const signature = (target) => [target.antiAir, target.durability.intact, target.durability.reduced, target.points.join('/')].join('|')
  const shared = new Map()
  const options = targets.map((target, index) => {
    const key = signature(target)
    if (shared.has(key)) return shared.get(key)
    const byId = new Array(squad.size)
    byId[0] = [{ expectedPoints: 0, outcomes: [1, 0, 0, 0, 0], key: '' }]
    for (let id = 1; id < squad.size; id++) {
      byId[id] = [...splits[id]].map(([splitKey, split]) => ({ ...evaluators[index](split.powers, splitKey), key: splitKey }))
        .sort((a, b) => b.expectedPoints - a.expectedPoints).slice(0, keep)
    }
    shared.set(key, byId)
    return byId
  })

  // C. Répartition entre navires, un par un : best[S] = meilleurs plans qui
  // emploient exactement S sur les navires déjà traités. Au dernier, seule
  // l'escadrille complète compte (tous les avions attaquent).
  let best = new Array(squad.size).fill(null)
  best[0] = [{ expectedPoints: 0, choices: [] }]
  targets.forEach((_, targetIndex) => {
    const last = targetIndex === targets.length - 1
    const next = new Array(squad.size).fill(null)
    for (const total of last ? [squad.full] : [...Array(squad.size).keys()]) {
      const top = new Best(keep)
      eachSubsquad(squad, squad.toVector(total), (part) => {
        const previous = best[total - part]
        if (!previous) return
        const attacks = options[targetIndex][part]
        for (const plan of previous) {
          if (plan.expectedPoints + attacks[0].expectedPoints < top.threshold()) break
          for (const attack of attacks) {
            const score = plan.expectedPoints + attack.expectedPoints
            if (score < top.threshold()) break
            top.offer(score, () => ({ expectedPoints: score, choices: [...plan.choices, { targetIndex, part, attack }] }))
          }
        }
      })
      next[total] = top.list()
    }
    best = next
  })

  // Retour aux avions réels, piochés par puissance.
  return (best[squad.full] ?? []).map((plan) => {
    const pool = squad.planesOf.map((planes) => planes.slice())
    const attacks = []
    for (const { targetIndex, part, attack } of plan.choices) {
      if (!part) continue
      const groups = []
      for (let id = part, key = attack.key; id > 0;) {
        const split = splits[id].get(key)
        const group = []
        squad.toVector(split.group).forEach((count, k) => { for (let i = 0; i < count; i++) group.push(pool[k].shift()) })
        groups.push(group)
        id = split.restId
        key = split.restKey
      }
      attacks.push({ target: targetIndex, groups, expectedPoints: attack.expectedPoints, outcomes: attack.outcomes })
    }
    return { expectedPoints: plan.expectedPoints, attacks }
  })
}

/** Recherche approchée (recuit simulé) : les `keep` meilleurs plans
 *  rencontrés sur 16 départs de 12 000 essais. */
function annealingSearch(powers, targets, evaluators, keep, powerCap) {
  let seed = 0x9e3779b9
  const random = () => { // mulberry32
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = (bound) => Math.floor(random() * bound)
  const groupPower = (planes) => Math.min(planes.reduce((sum, index) => sum + powers[index], 0), powerCap)

  // Un plan : des groupes `{ target, planes }`.
  function evaluatePlan(groups) {
    let expectedPoints = 0
    const attacks = []
    targets.forEach((_, target) => {
      const own = groups.filter((group) => group.target === target)
      if (!own.length) return
      const result = evaluators[target](own.map((group) => groupPower(group.planes)).sort((a, b) => a - b))
      expectedPoints += result.expectedPoints
      attacks.push({ target, groups: own.map((group) => group.planes.slice()), ...result })
    })
    return { expectedPoints, attacks }
  }
  // Clé indépendante de l'ordre et des avions de même puissance.
  const keyOf = (plan) => plan.attacks.map((attack) => `${attack.target}:${attack.groups.map((group) => group.map((index) => powers[index]).sort().join('+')).sort().join('|')}`).join('/')
  const seen = new Map()
  function note(plan) {
    const key = keyOf(plan)
    if (!seen.has(key)) seen.set(key, plan)
    if (seen.size > 600) {
      const kept = [...seen].sort((a, b) => b[1].expectedPoints - a[1].expectedPoints).slice(0, 200)
      seen.clear()
      kept.forEach(([k, p]) => seen.set(k, p))
    }
  }
  const copy = (groups) => groups.map((group) => ({ target: group.target, planes: group.planes.slice() }))
  function tweak(groups) {
    const next = copy(groups)
    const roll = random()
    if (roll < 0.5 || next.length < 2) { // déplacer un avion
      const from = pick(next.length)
      const plane = next[from].planes.splice(pick(next[from].planes.length), 1)[0]
      if (random() < 0.5 && next.length > 1) {
        let to = pick(next.length)
        if (to === from) to = (to + 1) % next.length
        next[to].planes.push(plane)
      } else next.push({ target: pick(targets.length), planes: [plane] })
    } else if (roll < 0.7) { // changer la cible d'un groupe
      next[pick(next.length)].target = pick(targets.length)
    } else if (roll < 0.85) { // échanger deux avions
      const a = pick(next.length)
      let b = pick(next.length)
      if (a === b) b = (b + 1) % next.length
      const ia = pick(next[a].planes.length)
      const ib = pick(next[b].planes.length)
      ;[next[a].planes[ia], next[b].planes[ib]] = [next[b].planes[ib], next[a].planes[ia]]
    } else { // fusionner deux groupes
      const a = pick(next.length)
      let b = pick(next.length)
      if (a === b) b = (b + 1) % next.length
      next[a].planes.push(...next[b].planes)
      next[b].planes = []
    }
    return next.filter((group) => group.planes.length)
  }

  const STARTS = 16
  const TRIES = 12000
  const HOT = 2
  const COLD = 0.005
  const all = powers.map((_, index) => index)
  for (let start = 0; start < STARTS; start++) {
    let groups
    if (start % 3 === 0) groups = all.map((index) => ({ target: pick(targets.length), planes: [index] }))
    else if (start % 3 === 1) groups = [{ target: pick(targets.length), planes: all.slice() }]
    else {
      groups = []
      all.forEach((index) => {
        if (groups.length && random() < 0.6) groups[pick(groups.length)].planes.push(index)
        else groups.push({ target: pick(targets.length), planes: [index] })
      })
    }
    let current = evaluatePlan(groups)
    note(current)
    for (let tryIndex = 0; tryIndex < TRIES; tryIndex++) {
      const temperature = HOT * Math.pow(COLD / HOT, tryIndex / TRIES)
      const proposed = tweak(groups)
      const plan = evaluatePlan(proposed)
      const gain = plan.expectedPoints - current.expectedPoints
      if (gain >= 0 || random() < Math.exp(gain / temperature)) {
        groups = proposed
        current = plan
        note(current)
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.expectedPoints - a.expectedPoints).slice(0, keep)
}

/** Meilleurs plans de la frappe des avions `powers` (puissance anti-ship de
 *  chacun ; un chasseur, 0, n'entre pas dans le calcul) sur les navires
 *  `targets` (`{ antiAir, durability: { intact, reduced }, points }`), avec
 *  les tableaux `table` (cf. lib/airStrike.js::resolveAirStrikeTable) : `{
 *  method: 'exact' | 'approximate', plans }`, `plans` du meilleur au moins
 *  bon (`keep` au plus) — `{ expectedPoints, attacks: [{ target, groups,
 *  expectedPoints, outcomes }] }`, une attaque par navire visé (`target` :
 *  son index), `groups` : index dans `powers` des avions de chaque attaque,
 *  `outcomes` : probabilité de chaque résultat de `STRIKE_OUTCOMES`. */
export function planStrike(table, powers, targets, keep = 1) {
  const attackers = powers.flatMap((power, index) => (power > 0 ? [index] : []))
  if (!table || !attackers.length || !targets.length) return { method: 'exact', plans: [] }
  const powerCap = usefulPowerCap(table)
  const capped = attackers.map((index) => Math.min(powers[index], powerCap))
  const evaluators = targets.map((target) => makeEvaluator(table, target, powerCap))
  const exact = exactSearch(capped, targets, evaluators, keep, powerCap)
  const result = exact
    ? { method: 'exact', plans: exact }
    : { method: 'approximate', plans: annealingSearch(capped, targets, evaluators, keep, powerCap) }
  // Index dans `capped` -> index dans `powers`.
  for (const plan of result.plans) {
    for (const attack of plan.attacks) attack.groups = attack.groups.map((group) => group.map((index) => attackers[index]))
  }
  return result
}
