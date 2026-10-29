// Réglages d'une partie (scénario, mode de jeu), choisis sur la page
// d'accueil (SoloHome.vue -> DemoPlay.vue). Mêmes clés que
// lib/journalStorage.js::SETTING_KEYS, toutes en chaînes (format de l'URL).
// Les libellés sont des getters : lus au moment de l'affichage, ils suivent
// la langue choisie (cf. src/i18n).

import { t, mt } from '../i18n/index.js'

// --- Scénarios ---------------------------------------------------------------
// Chaque module déclare ses scénarios (`module.scenarios`, cf. coral-sea.json) :
// `{ id, label, deployment, available }`. Le MOTEUR, lui, sait quels
// modes de déploiement il applique (`SUPPORTED_DEPLOYMENTS`) : un scénario
// dont le déploiement n'est pas encore implémenté est proposé grisé ("Bientôt
// disponible") et jamais retenu (cf. `scenarioOptions`, `resolveSettings`) —
// c'est le cas d'un placement libre, qui demande un déploiement au
// choix des joueurs que HexMap.vue ne fait pas encore.
//   - 'setup' : chaque pion à l'hex d'entrée déclaré par son `setup` (cf.
//     HexMap.vue::buildInitialCounters) — le seul mode existant ;
//   - 'free'  : placement au choix des joueurs — pas encore implémenté.
export const SUPPORTED_DEPLOYMENTS = ['setup']
// Scénario d'un module qui n'en déclare aucun : le déploiement du module.
export const DEFAULT_SCENARIOS = [{ id: 'historique', get label() { return t('settings.scenarioHistorical') }, deployment: 'setup' }]

/** Scénarios proposés pour `module` (JSON du module, ou `null` s'il n'est pas
 *  encore connu) — `DEFAULT_SCENARIOS` à défaut —, chacun complété :
 *  `{ id, label, deployment, available }`, `available` étant faux si le module l'écarte ou si le moteur n'en sait pas
 *  appliquer le déploiement. */
export function scenarioOptions(module) {
  const declared = Array.isArray(module?.scenarios) && module.scenarios.length ? module.scenarios : DEFAULT_SCENARIOS
  return declared
    .filter((scenario) => typeof scenario?.id === 'string' && scenario.id)
    .map((scenario) => {
      const deployment = scenario.deployment ?? 'setup'
      return {
        id: scenario.id,
        get label() { return mt(scenario.label) ?? scenario.id },
        deployment,
        available: scenario.available !== false && SUPPORTED_DEPLOYMENTS.includes(deployment),
      }
    })
}

// Modes de jeu (cf. GameSetupSteps.vue). Un mode pas encore développé
// (`available: false`) est proposé grisé ("Bientôt disponible") et jamais
// retenu (cf. `resolveSettings`) :
//   - 'duel' : deux joueurs en double aveugle, sur le même écran, à tour de
//     rôle (cf. HexMap.vue, prop `duel`) — en cours : la mise en place ;
//   - 'assiste' : un joueur contre l'IA, ses forces sur la carte parmi des
//     leurres — partie Assistée, cf. lib/useAssisted.js ;
//   - 'aveugle' : un joueur contre l'IA, en aveugle (ses forces hors de la
//     carte tant qu'elles ne sont pas repérées) — à venir.
// L'ancien mode 'libre' (bac à sable sans règles) n'est plus proposé : une
// sauvegarde ou une URL qui le demande retombe sur le mode par défaut.
export const PARTY_OPTIONS = [
  { id: 'duel', get label() { return t('settings.party.duel') } },
  { id: 'assiste', get label() { return t('settings.party.assiste') } },
  { id: 'aveugle', available: false, get label() { return t('settings.party.aveugle') } },
]

// Réglages qui changent les RÈGLES de la partie : seuls ceux-là comptent pour
// savoir si une sauvegarde peut être reprise telle quelle (cf.
// lib/journalStorage.js::sameSettings). `scenario` n'en fait pas partie tant
// que le seul déploiement appliqué est 'setup' (cf. `SUPPORTED_DEPLOYMENTS`)
// — à ajouter ici le jour où deux scénarios disponibles déploieront
// différemment.
export const RULE_SETTING_KEYS = ['party']

const labelOf = (options, id) => (options.find((option) => option.id === id) ?? options[0]).label

// Identifiant de scénario plausible (reçu de l'URL, du serveur, d'un fichier).
const SCENARIO_ID_RE = /^[\w-]{1,32}$/

/** Réglages par défaut ; `scenarios` (cf. `scenarioOptions`) : le scénario
 *  par défaut est alors le premier disponible du module. */
export function defaultSettings(scenarios = null) {
  const scenario = scenarios?.find((option) => option.available)?.id ?? DEFAULT_SCENARIOS[0].id
  return { scenario, party: 'assiste' }
}

/** Complète/assainit des réglages partiels (URL, réponse serveur, fichier de
 *  sauvegarde) avec les valeurs par défaut — une valeur inconnue OU pas
 *  encore disponible retombe sur le défaut, une clé inconnue est ignorée. Le
 *  résultat est ce que le moteur applique réellement : deux réglages qui se résolvent
 *  pareil donnent la même partie.
 *
 *  `scenarios` (cf. `scenarioOptions`) : scénarios du module joué. Sans eux
 *  (module pas encore chargé, liste des parties, comparaison de
 *  sauvegardes), le scénario est gardé tel quel s'il est plausible — sa
 *  disponibilité ne peut être vérifiée qu'avec le module. */
export function resolveSettings(raw, scenarios = null) {
  const defaults = defaultSettings(scenarios)
  const pick = (options, value, fallback) =>
    (options.some((option) => option.id === value && option.available !== false) ? value : fallback)
  const scenario = scenarios
    ? pick(scenarios, raw?.scenario, defaults.scenario)
    : (SCENARIO_ID_RE.test(raw?.scenario ?? '') ? raw.scenario : defaults.scenario)
  return { scenario, party: pick(PARTY_OPTIONS, raw?.party, defaults.party) }
}

/** Libellés affichés dans le bandeau de la partie et la liste des parties —
 *  `scenarios` (cf. `scenarioOptions`) pour le libellé du scénario ; à
 *  défaut, celui des scénarios par défaut, ou son identifiant. */
export function describeSettings(settings, scenarios = null) {
  return {
    scenario: (scenarios ?? DEFAULT_SCENARIOS).find((option) => option.id === settings.scenario)?.label ?? settings.scenario,
    party: labelOf(PARTY_OPTIONS, settings.party),
  }
}
