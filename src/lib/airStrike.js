// ═══════════════════════════════════════════════════════════════════════════
// airStrike — frappe aéronavale (Anti-Air Chart + Air-to-Surface Chart)
// ═══════════════════════════════════════════════════════════════════════════
//
// Les deux tableaux sont une DONNÉE de la boîte de jeu (`module.airStrike`,
// cf. public/modules/coral-sea/coral-sea.json) ; ce fichier les lit, les
// vérifie, et fournit la résolution d'une frappe et ses probabilités
// EXACTES — de quoi peser les attaques de l'IA (cf. lib/strikePlanner.js).
//
// Une frappe, deux d6 :
//   1. jet AA sur l'Anti-Air Chart, colonne = défense AA de la cible (la
//      sienne et celle de ses voisins sur le support de sa task force, cf.
//      useCoralSea.js::strikeDefenders) : `[bonus, malus]` (case vide :
//      aucun effet) ;
//   2. le malus est SOUSTRAIT à la puissance anti-ship de l'attaquant
//      (somme des `attack` de ses avions, cf. `antiShipPower`) — 12 avec un
//      malus de 2 donne 10. Tombée à gauche de la 1re colonne, il n'y a pas
//      d'attaque (`aborted`) ;
//   3. jet d'attaque sur l'Air-to-Surface Chart : ligne = d6 + bonus + le
//      modificateur de la cible (`rowModifiers`, ex. -2 pour un navire au
//      mouillage ou une base terrestre), bornée au tableau ; colonne = la
//      puissance anti-ship restante ; la case donne les dégâts.
// Les dégâts se lisent ensuite contre la durabilité du navire touché (cf.
// `damageOutcome`).
//
// Forme de `module.airStrike` : `die` (faces du dé), et deux tableaux
// `antiAir` / `airToSurface` : `min` (en dessous, pas de colonne), `columns`
// (`{ max, label }`, de gauche à droite — une colonne couvre toute valeur ≤
// `max` que la précédente ne couvre pas, la dernière, sans `max`, absorbe le
// reste) et `results` (`antiAir.results[dé - 1][colonne]` : `[bonus, malus]`
// ou `null` ; `airToSurface.results[ligne][colonne]` : dégâts) ;
// `airToSurface.rowModifiers` : situation de la cible -> modificateur de
// ligne.

/** Résultats d'une frappe sur un navire, du moins au plus grave (cf.
 *  `damageOutcome`). */
export const STRIKE_OUTCOMES = ['none', 'minor', 'significant', 'critical', 'sunk']

/** `module.airStrike` → tableaux vérifiés, ou `null` (pas de frappe
 *  aéronavale) — avec un avertissement en console s'ils sont incohérents. */
export function resolveAirStrikeTable(raw) {
  if (!raw) return null
  const problem = airStrikeProblem(raw)
  if (problem) {
    console.warn(`airStrike : ${problem} — frappe aéronavale désactivée`)
    return null
  }
  return raw
}

function airStrikeProblem(raw) {
  if (!Number.isInteger(raw.die) || raw.die < 1) return '`die` doit être un entier positif'
  for (const name of ['antiAir', 'airToSurface']) {
    const chart = raw[name]
    if (!chart?.columns?.length || !chart.results?.length) return `\`${name}\` sans colonnes ni résultats`
    if (chart.columns.slice(0, -1).some((column) => typeof column.max !== 'number')) return `\`${name}\` : seule la dernière colonne peut omettre \`max\``
    if (chart.results.some((row) => row.length !== chart.columns.length)) return `\`${name}\` : une ligne n'a pas autant de cases que de colonnes`
  }
  if (raw.antiAir.results.length !== raw.die) return '`antiAir` doit avoir une ligne par face du dé'
  if (Object.values(raw.airToSurface.rowModifiers ?? {}).some((value) => !Number.isInteger(value))) return '`airToSurface.rowModifiers` : des entiers'
  return null
}

/** Colonne (index) de `value` dans le tableau `chart`, ou -1 s'il n'en a
 *  pas (`value` < `chart.min`). */
function columnOf(chart, value) {
  if (value < (chart.min ?? -Infinity)) return -1
  return chart.columns.findIndex((column) => column.max == null || value <= column.max)
}

/** Puissance anti-ship d'un raid : somme des `attack` des faces de ses
 *  avions (`faces`, cf. air-ijn.json — les chasseurs n'en ont pas). */
export function antiShipPower(faces) {
  return faces.reduce((sum, face) => sum + (face?.attack ?? 0), 0)
}

/** Frappe de puissance anti-ship `antiShip` sur une cible de défense AA
 *  `antiAir`, dans la situation `situation` (clé de
 *  `airToSurface.rowModifiers`, ex. 'dock' ; rien : en mer), avec les jets
 *  `aaRoll` et `attackRoll` (1 à `die`) : `{ aaColumn, bonus, malus,
 *  effectiveAntiShip, aborted, column, row, damage }` — colonnes en index
 *  (-1 : hors tableau) ; `aborted` : pas d'attaque, la puissance restante
 *  est à gauche de la 1re colonne (0 dégât). */
export function resolveStrike(table, { antiAir, antiShip, situation = null }, aaRoll, attackRoll) {
  const aaColumn = columnOf(table.antiAir, antiAir)
  const [bonus, malus] = (aaColumn < 0 ? null : table.antiAir.results[aaRoll - 1][aaColumn]) ?? [0, 0]
  const effectiveAntiShip = antiShip - malus
  const column = columnOf(table.airToSurface, effectiveAntiShip)
  const aborted = column < 0
  const modifier = (situation && table.airToSurface.rowModifiers?.[situation]) ?? 0
  const row = Math.min(table.airToSurface.results.length - 1, Math.max(0, attackRoll + bonus + modifier))
  const damage = aborted ? 0 : table.airToSurface.results[row][column]
  return { aaColumn, bonus, malus, effectiveAntiShip, aborted, column, row, damage }
}

/** État d'un navire de durabilité `intact` (face intacte) et `reduced`
 *  (face endommagée, 0 sans elle), déjà dans l'état `current` (cf.
 *  `STRIKE_OUTCOMES`), après `damage` nouveaux dégâts :
 *   - intact : 'none' en dessous de `intact`, 'minor' à `intact`,
 *     'significant' jusqu'à `intact` + `reduced`, 'critical' au point
 *     suivant, 'sunk' au-delà ;
 *   - dommages mineurs : 'significant' de 1 à `reduced`, 'critical' à
 *     `reduced` + 1, 'sunk' au-delà ;
 *   - dommages significatifs : 'critical' à `reduced`, 'sunk' au-delà ;
 *   - dommages critiques : 'sunk' dès 1 dégât.
 *  En dessous, il reste dans son état. Ex. `reduced` 4, mineur : significatif
 *  de 1 à 4 dégâts, critique à 5, coulé à 6 ou plus. */
export function damageOutcome(damage, { intact, reduced = 0 }, current = 'none') {
  if (current === 'sunk') return 'sunk'
  if (current === 'critical') return damage >= 1 ? 'sunk' : 'critical'
  if (current === 'significant') {
    if (damage < 1 || damage < reduced) return 'significant'
    return damage === reduced ? 'critical' : 'sunk'
  }
  if (current === 'minor') {
    if (damage < 1) return 'minor'
    if (damage <= reduced) return 'significant'
    return damage === reduced + 1 ? 'critical' : 'sunk'
  }
  if (damage < intact) return 'none'
  if (damage === intact) return 'minor'
  if (damage <= intact + reduced) return 'significant'
  if (damage === intact + reduced + 1) return 'critical'
  return 'sunk'
}

/** Points de victoire du résultat `outcome` sur un navire déjà dans l'état
 *  `current`, d'après son barème `points` (un par résultat de
 *  `STRIKE_OUTCOMES`) : ceux de son nouvel état s'il s'aggrave, rien sinon —
 *  un navire déjà en dommages significatifs ne rapporte plus les points d'un
 *  mineur ni d'un significatif. */
export function outcomePoints(points, outcome, current = 'none') {
  const index = STRIKE_OUTCOMES.indexOf(outcome)
  return index > STRIKE_OUTCOMES.indexOf(current) ? points[index] ?? 0 : 0
}

/** Probabilités EXACTES d'une frappe (`strike` : `{ antiAir, antiShip,
 *  situation }`, cf. `resolveStrike`), sur toutes les combinaisons des deux
 *  dés : `{ combinations, aborted, damage, expectedDamage, outcomes }` —
 *  `aborted` : probabilité qu'il n'y ait pas d'attaque ; `damage` : dégâts
 *  -> probabilité ; `outcomes` (si la durabilité `durability` du navire
 *  visé est donnée, cf. `damageOutcome` — et ses dommages actuels
 *  `current` —, sinon `null`) : résultat -> probabilité. Chaque
 *  probabilité est un nombre exact de combinaisons sur `combinations`. */
export function strikeOdds(table, strike, durability = null, current = 'none') {
  const combinations = table.die * table.die
  // Comptes entiers, divisés à la fin : pas d'erreur d'arrondi cumulée.
  const damage = {}
  const outcomes = durability ? Object.fromEntries(STRIKE_OUTCOMES.map((outcome) => [outcome, 0])) : null
  let aborted = 0
  let totalDamage = 0
  for (let aaRoll = 1; aaRoll <= table.die; aaRoll++) {
    for (let attackRoll = 1; attackRoll <= table.die; attackRoll++) {
      const result = resolveStrike(table, strike, aaRoll, attackRoll)
      if (result.aborted) aborted++
      damage[result.damage] = (damage[result.damage] ?? 0) + 1
      totalDamage += result.damage
      if (outcomes) outcomes[damageOutcome(result.damage, durability, current)] += 1
    }
  }
  const share = (counts) => Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, count / combinations]))
  return { combinations, aborted: aborted / combinations, damage: share(damage), expectedDamage: totalDamage / combinations,
    outcomes: outcomes && share(outcomes) }
}
