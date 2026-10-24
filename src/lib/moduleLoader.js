// Chargement du JSON d'un module, complété de ses catalogues de flotte et
// d'avions.
//
// Un module peut déclarer ses navires dans des fichiers à part (`fleets`,
// camp -> chemin, ex. coral-sea.json -> fleet-ijn.json). Ils sont lus ici,
// avec le module, et rangés dans `fleetCatalog` (camp -> contenu du
// fichier) : les règles particulières du module en ont besoin dès la mise
// en place (cf. lib/useCoralSea.js, composition des task forces). De même
// pour ses avions (`air` -> `airCatalog`, ex. air-ijn.json : groupes
// aériens des porte-avions). Un catalogue illisible n'empêche pas de
// jouer : il manque simplement.

/** Catalogues `paths` (camp -> chemin) : camp -> contenu, sans ceux qui
 *  n'ont pu être lus. */
async function fetchCatalogs(paths) {
  const entries = await Promise.all(Object.entries(paths).map(async ([side, path]) => {
    try {
      return [side, await fetch(path, { cache: 'no-store' }).then((response) => response.json())]
    } catch {
      return [side, null]
    }
  }))
  return Object.fromEntries(entries.filter(([, catalog]) => catalog))
}

/** JSON du module `path`, avec `fleetCatalog` s'il déclare des `fleets`, et
 *  `airCatalog` s'il déclare des `air`. */
export async function fetchModule(path) {
  const data = await fetch(path, { cache: 'no-store' }).then((response) => response.json())
  const [fleetCatalog, airCatalog] = await Promise.all([data?.fleets, data?.air].map((paths) => paths && fetchCatalogs(paths)))
  if (fleetCatalog) data.fleetCatalog = fleetCatalog
  if (airCatalog) data.airCatalog = airCatalog
  return data
}
