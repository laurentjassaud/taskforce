// Chargement du JSON d'un module, complété de ses catalogues de flotte.
//
// Un module peut déclarer ses navires dans des fichiers à part (`fleets`,
// camp -> chemin, ex. coral-sea.json -> fleet-ijn.json). Ils sont lus ici,
// avec le module, et rangés dans `fleetCatalog` (camp -> contenu du
// fichier) : les règles particulières du module en ont besoin dès la mise
// en place (cf. lib/useCoralSea.js, composition des task forces). Un
// catalogue illisible n'empêche pas de jouer : il manque simplement.

/** JSON du module `path`, avec `fleetCatalog` s'il déclare des `fleets`. */
export async function fetchModule(path) {
  const data = await fetch(path, { cache: 'no-store' }).then((response) => response.json())
  if (!data?.fleets) return data
  const entries = await Promise.all(Object.entries(data.fleets).map(async ([side, fleetPath]) => {
    try {
      return [side, await fetch(fleetPath, { cache: 'no-store' }).then((response) => response.json())]
    } catch {
      return [side, null]
    }
  }))
  data.fleetCatalog = Object.fromEntries(entries.filter(([, catalog]) => catalog))
  return data
}
