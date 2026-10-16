// ═══════════════════════════════════════════════════════════════════════════
// units — classification des pions : qu'est-ce qu'une "vraie unité" ?
// ═══════════════════════════════════════════════════════════════════════════
//
// Deux sortes de pions circulent dans le moteur (cf. public/modules/*.json) :
//   - les MARQUEURS (`type: "marker"`, ex. Detected!, Sighted Carrier) :
//     posés sur la carte pour l'information, ils n'occupent jamais un hex au
//     sens du jeu — n'importe combien de pions peuvent partager leur case,
//     ils ne bougent pas, ne projettent pas de ZOC ;
//   - les UNITÉS : tout le reste — les seules à se déplacer selon les
//     règles, à s'empiler et à projeter une ZOC.
//
// Ces tests vivent ICI, et nulle part ailleurs. Tous acceptent
// `null`/`undefined` (réponse : faux), pour pouvoir être appelés sur le
// résultat d'un `find` sans garde.

/** Un marqueur — jamais une unité. */
export function isMarker(counter) {
  return counter?.type === 'marker'
}

/** Une vraie unité, par opposition à un marqueur : occupe une case, se
 *  déplace, s'empile, projette une ZOC, bloque l'entrée d'un renfort. */
export function isUnit(counter) {
  return !!counter && !isMarker(counter)
}
