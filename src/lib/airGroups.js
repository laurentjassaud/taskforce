// Groupes aériens des porte-avions (cf. coral-sea.json, scenarios[].airGroups,
// et le catalogue d'avions air-ijn.json, lu par lib/moduleLoader.js).
//
// MISE EN PLACE SUR LE SUPPORT "Carrier TF" : les cases Ready (4) se
// remplissent en priorité, dans cet ordre — 1 chasseur, puis le plus de
// torpilleurs (T), puis le plus de bombardiers en piqué (DB), puis tous les
// autres ; ce qui ne tient pas va en Reserve. Ex. ZUIKAKU (2 ZERO, 2 KATE,
// 2 VAL) : Ready 1 F + 2 T + 1 DB, Reserve 1 F + 1 DB ; SHŌHŌ (ZERO,
// CLAUDE, KATE) : Ready 2 F + 1 T.

/** Pions avions du groupe `entries` (`[{ aircraft, count, code, face }]`),
 *  d'après le catalogue `catalog` (contenu d'air-ijn.json) : `{ key, id,
 *  name, code, face, mission, attack, airCombat, src, reducedFace }` —
 *  `face` : 'full' (par défaut) ou 'reduced' ; `reducedFace` : la face
 *  réduite du catalogue d'un pion posé sur sa face pleine (`null` sinon, ou
 *  si le catalogue ne la donne pas). Un avion absent du catalogue est
 *  ignoré. */
export function airGroupCounters(entries, catalog) {
  const aircraft = new Map((catalog?.aircraft ?? []).map((plane) => [plane.id, plane]))
  return (entries ?? []).flatMap((entry) => {
    const plane = aircraft.get(entry.aircraft)
    const face = entry.face ?? 'full'
    if (!plane?.[face]) {
      console.warn(`airGroups : avion absent du catalogue — ${entry.aircraft} (${face})`)
      return []
    }
    const { mission, attack, airCombat, src } = plane[face]
    const reducedFace = face === 'full' ? plane.reduced ?? null : null
    return Array.from({ length: entry.count ?? 1 }, () => ({ id: plane.id, name: plane.name, code: entry.code ?? null, face, mission, attack, airCombat, src, reducedFace }))
  }).map((counter, index) => ({ key: `${counter.id}-${index}`, ...counter }))
}

/** Points d'avions d'un pion dans les cases Ready : 1 sur sa face pleine,
 *  0,5 réduit. */
export const planePoints = (plane) => (plane.face === 'reduced' || plane.state === 'reduced' ? 0.5 : 1)

/** Avions de `candidates` à faire entrer dans les cases Ready, où sont déjà
 *  `fixed`, sans dépasser `capacity` points (cf. `planePoints`). Parmi tous
 *  les choix possibles, dans l'ordre : au moins 1 point de chasseurs (F,
 *  ceux déjà en Ready compris), le plus de points de torpilleurs (T), puis
 *  de bombardiers en piqué (DB), puis le plus de points en tout, enfin la
 *  plus forte attaque ; à égalité, les premiers de `candidates`. Recherche
 *  exhaustive : un groupe aérien n'a que quelques pions. */
export function chooseReady(fixed, candidates, capacity) {
  const points = (planes, mission) => planes.reduce((sum, plane) => sum + (!mission || plane.mission === mission ? planePoints(plane) : 0), 0)
  const room = capacity - points(fixed)
  let best = []
  let bestScore = null
  for (let mask = 0; mask < 1 << candidates.length; mask++) {
    const picked = candidates.filter((_, index) => mask & (1 << index))
    if (points(picked) > room) continue
    const all = [...fixed, ...picked]
    const score = [points(all, 'F') >= 1 ? 1 : 0, points(all, 'T'), points(all, 'DB'), points(all), picked.reduce((sum, plane) => sum + (plane.attack ?? 0), 0)]
    // Premier critère qui départage, comparé au meilleur choix trouvé.
    const first = bestScore ? score.findIndex((value, index) => value !== bestScore[index]) : 0
    if (!bestScore || (first >= 0 && score[first] > bestScore[first])) { best = picked; bestScore = score }
  }
  return best
}

/** Pions `counters` selon leurs pertes : `stateOf(clé)` — 'none',
 *  'reduced' (le pion passe sur sa face réduite ; sans face réduite au
 *  catalogue, il garde son image et ses valeurs) ou 'eliminated'. `{ planes,
 *  lost }` : les pions encore en jeu, et les éliminés. Chaque pion porte
 *  son état (`state`). */
export function withPlaneStates(counters, stateOf) {
  const out = counters.map((counter) => {
    const state = stateOf(counter.key)
    if (state !== 'reduced' || !counter.reducedFace) return { ...counter, state }
    const { mission, attack, airCombat, src } = counter.reducedFace
    return { ...counter, state, face: 'reduced', mission, attack, airCombat, src: src ?? counter.src, reducedFace: null }
  })
  return { planes: out.filter((plane) => plane.state !== 'eliminated'), lost: out.filter((plane) => plane.state === 'eliminated') }
}

/** Pions `counters` (cf. `airGroupCounters`) posés sur le support : `{
 *  ready, reserve }`, `ready` limité à `readySlots` pions, dans l'ordre de
 *  priorité (le meilleur chasseur, les T puis les DB par attaque
 *  décroissante, puis les autres dans l'ordre du groupe). */
export function deckAircraft(counters, readySlots) {
  const byAttack = (mission) => counters.filter((counter) => counter.mission === mission).sort((a, b) => (b.attack ?? 0) - (a.attack ?? 0))
  const fighter = counters.filter((counter) => counter.mission === 'F').sort((a, b) => b.airCombat - a.airCombat)[0]
  const first = [fighter, ...byAttack('T'), ...byAttack('DB')].filter(Boolean)
  const order = [...first, ...counters.filter((counter) => !first.includes(counter))]
  return { ready: order.slice(0, readySlots), reserve: order.slice(readySlots) }
}
