// ═══════════════════════════════════════════════════════════════════════════
// Scénario 5 — REPÉRAGE (moteur `recon`, cf. ../index.js)
// ═══════════════════════════════════════════════════════════════════════════
//
// SOURCES (cf. lib/useCoralSea.js::reconSources) : les bases aériennes
// japonaises (Rabaul 0506, Buka 1004, Gasmata 0510, Lae 0115 — aucune base
// alliée dans ce scénario) et les task forces de porte-avions de chaque camp
// sur la carte. À chaque phase de Reconnaissance de son camp, chacune
// explore `checksPerPhase` hex à `range` hex (8) ou moins d'elle : une base
// 1, un porte-avions japonais 1, un porte-avions américain 2 (des hex
// différents, choisis par le joueur).
//
// COUVERTURE JAPONAISE (cf. `createTargetFilter`) : le Japonais n'explore un
// hex que s'il est COUVERT — assez d'unités japonaises (task forces,
// leurres et bases) à 8 hex ou moins de lui : 4 avec 12 task forces et
// leurres japonais en jeu, 3 de 8 à 11, 2 de 4 à 7, 1 en dessous. Un
// porte-avions repéré COMME porte-avions ("Sighted Carrier" sur un vrai
// porte-avions) n'a plus rien à cacher : il cherche sans règle de
// couverture. Et le Japonais ne revient pas sur une task force alliée déjà
// repérée ("Sighted Carrier" ou "Sighted Fleet") tant qu'une source a à
// portée une autre unité alliée non repérée.
//
// CHOIX DU MOTEUR (cf. `chooseRecon`) : parmi ses checks ouverts, l'arbre
// de décision du repérage (./reconTree.js) donne une priorité à chaque
// couple source/hex ; le plus prioritaire est exploré, à égalité celui de
// la source qui a le moins de cibles (elle n'a pas d'autre choix), puis au
// hasard.
import { hexDistance } from '../../../hex.js'
import { decide } from '../../../ai/decisionTree.js'
import { perceiveReconTarget } from '../../../ai/coralSeaPerception.js'
import { hexOfId, isIjnTaskForce, shuffle } from '../../shared.js'
import { reconTree, reconTests } from './reconTree.js'

/** Portée d'une source de reconnaissance, en hex. */
export const range = 8

/** Bases aériennes de chaque camp d'où partent des reconnaissances : hex
 *  "CCRR" -> nom. */
export const bases = {
  ijn: { '0506': 'Rabaul', '1004': 'Buka', '0510': 'Gasmata', '0115': 'Lae' },
}

/** Hex que chaque source explore par phase : une base, un porte-avions de
 *  chaque camp. */
export const checksPerPhase = { base: 1, carrier: { ijn: 1, usn: 2 } }

/** Couverture des reconnaissances japonaises : `[task forces japonaises en
 *  jeu au moins, unités japonaises requises à `range` hex de l'hex
 *  exploré]`, du plus grand au plus petit. */
const COVERAGE_THRESHOLDS = [[12, 4], [8, 3], [4, 2], [1, 1]]

/** Hex que les sources du camp `side` peuvent explorer cette phase, parmi
 *  ceux à leur portée où se trouve une cible : `(source, hexes) -> hexes`.
 *  Faits de la carte : `counters` ; `isOwnUnit(pion)` : task force ou
 *  leurre de ce camp ; `isTarget(pion)` : cible de ses reconnaissances.
 *  Couverture et préférence pour les cibles non repérées : cf. l'en-tête —
 *  pour le Japonais seulement. */
export function createTargetFilter({ side, counters, isOwnUnit, isTarget }) {
  if (side !== 'ijn') return (source, hexes) => hexes
  const key = (hex) => hex.col + ',' + hex.row
  const units = counters.filter(isOwnUnit)
  const needed = COVERAGE_THRESHOLDS.find(([minUnits]) => units.length >= minUnits)?.[1] ?? 1
  const anchors = [...units, ...Object.keys(bases.ijn).map(hexOfId)]
  const covered = (hex) => anchors.filter((anchor) => hexDistance(anchor, hex) <= range).length >= needed
  const seenAsCarrier = new Set(counters.filter((counter) => counter.sighted === 'carrierTF').map((counter) => counter.attachedTo))
  const sighted = new Set(counters.filter((counter) => counter.sighted === 'carrierTF' || counter.sighted === 'fleetTF')
    .map((counter) => counter.attachedTo))
  const undetected = new Set(counters.filter((counter) => isTarget(counter) && !sighted.has(String(counter.id))).map(key))
  return (source, hexes) => {
    const allowed = seenAsCarrier.has(source.unitId) ? hexes : hexes.filter(covered)
    const fresh = allowed.filter((hex) => undetected.has(key(hex)))
    return fresh.length ? fresh : allowed
  }
}

/** Hex que le moteur japonais explore maintenant, parmi ses checks encore
 *  ouverts (`checks` : `[{ source, targets }]`, sources qui ont un check et
 *  des cibles), sur la carte `counters` : `{ source, target, action,
 *  priority, trace, options }` — `options`, nombre de couples pesés —, ou
 *  `null` sans check. Ce que sait le Japonais de ses forces lui vient du
 *  module : `taskForceOf(pion)`, `behaviorOf(tf)` (cf. ./fleets.js), et
 *  `lastSeen(id)` — dernier repérage d'une unité alliée, même tombé depuis. */
export function chooseRecon(checks, counters, { taskForceOf, behaviorOf, lastSeen }) {
  const own = counters.filter(isIjnTaskForce)
  const ownCarriers = own.filter((counter) => behaviorOf(taskForceOf(counter)) === 'carrier')
  const ownTransports = own.filter((counter) => behaviorOf(taskForceOf(counter)) === 'transport')
  const options = shuffle(checks.flatMap((check) => check.targets.map((target) => {
    const facts = perceiveReconTarget(target, counters, { ownCarriers, ownTransports, lastSeen })
    return { check, target, ...decide(reconTree, facts, reconTests) }
  })))
  if (!options.length) return null
  const better = (a, b) => a.leaf.priority > b.leaf.priority
    || (a.leaf.priority === b.leaf.priority && a.check.targets.length < b.check.targets.length)
  const best = options.reduce((top, option) => (better(option, top) ? option : top))
  return { source: best.check.source, target: best.target, action: best.leaf.do,
    priority: best.leaf.priority, trace: best.trace, options: options.length }
}
