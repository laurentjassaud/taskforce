// ═══════════════════════════════════════════════════════════════════════════
// useAssisted — logique du mode "Assisté" vs mode "Libre"
// ═══════════════════════════════════════════════════════════════════════════
//
// Ce composable centralise TOUTES les règles qui différencient les deux
// modes de partie proposés dans LocalGameSetup.vue (paramètre `party`) :
//
//   • Mode "Libre"   (assisted = false, valeur PAR DÉFAUT)
//       → un vrai bac à sable, sans aucun garde-fou :
//         - la grille hexagonale est toujours masquée,
//         - les pions ne sont sélectionnables qu'au glisser-déposer
//           (un simple clic ne les sélectionne pas),
//         - aucune restriction de tour : n'importe quel camp peut
//           déplacer n'importe quel pion à tout moment.
//       C'est le mode pensé pour rejouer une partie librement, sans que
//       l'appli n'impose les règles du jeu.
//
//   • Mode "Assisté" (assisted = true)
//       → l'appli ajoute des garde-fous, mais ils restent OPT-IN
//         (l'utilisateur peut les activer/désactiver au fil de la partie) :
//         - la grille peut être affichée/masquée via une case à cocher,
//         - les pions deviennent sélectionnables au clic (affichage d'un
//           contour vert autour du pion sélectionné),
//         - le déplacement d'un pion est restreint au camp dont c'est le
//           tour, en s'appuyant sur le composant TurnTracker.vue (le
//           tracker de tour affiché dans HexMap.vue) qui sait quelles
//           factions sont "actives" au pas courant,
//         - le tour se joue dans les PHASES déclarées par le module (cf.
//           section "Phases" plus bas) ; seule la phase de Mouvement permet
//           de déplacer des pions,
//         - chaque pion ne peut entrer dans un hex que s'il lui reste assez
//           de POINTS DE MOUVEMENT (MP) — 1 MP par hex (cf. section "Points
//           de mouvement" plus bas),
//         - les HEXSIDES (côtés d'hex) peuvent être infranchissables ou
//           couper la ZOC, selon ce que DÉCLARE le module (`terrain.edges`,
//           cf. lib/edges.js) ; un hex COUPÉ par une île ne se traverse que
//           d'un côté à un côté de même couleur (cf. lib/passages.js),
//         - ZONE DE CONTRÔLE (ZOC, cf. section dédiée plus bas) : un pion
//           qui commence son tour dans la ZOC d'un pion ennemi ne peut pas
//           bouger du tout ; un pion qui ENTRE dans une ZOC ennemie doit s'y
//           arrêter (aucun déplacement supplémentaire ce tour-ci),
//         - EMPILEMENT (cf. section dédiée plus bas) : jamais plus de
//           `rules.stackingLimit` unités amies sur un hex en fin de
//           mouvement (limite du camp de l'unité, cf. `limitOf`),
//         - CONGESTION DES HEX D'ENTRÉE (cf. section dédiée plus bas) : un
//           renfort qui entre sur un hex paie le coût de cet hex ; si un
//           AUTRE renfort entre par ce MÊME hex ce MÊME tour, le coût
//           double, triple, etc. — cf. `entryCost`/`spendEntryCost`.
//
// Pourquoi un composable séparé plutôt que de mettre ce code directement
// dans HexMap.vue ? Pour que toute la logique de bascule Libre/Assisté
// reste au même endroit, facile à relire et à faire évoluer, sans polluer
// le composant HexMap (déjà volumineux) avec des `if (assisted.value)`
// éparpillés un peu partout.
//
// Paramètres reçus par le composable :
//   - `assisted` : ref/computed booléen réactif (ex. `toRef(props, 'assisted')`
//     côté HexMap.vue) qui indique si la partie tourne en mode Assisté.
//   - `turnTrackerRef` : ref pointant vers l'INSTANCE du composant enfant
//     TurnTracker.vue. On l'utilise pour appeler ses méthodes/valeurs
//     exposées :
//       • `canControl(counter)` fait autorité sur "quel camp peut jouer ce
//         pion maintenant" (cf. TurnTracker.vue). Si le module de jeu ne
//         définit pas de config de tours, TurnTracker.canControl() autorise
//         tout par défaut — donc même en mode Assisté, l'absence de config
//         de tour ne bloque rien.
//       • `nextTurn()` fait avancer le pas courant (camp suivant, et donc
//         éventuellement tour suivant) — normalement déclenché par un clic
//         dans TurnTracker.vue, mais qu'on doit pouvoir déclencher NOUS
//         MÊMES depuis ce composable (cf. section "Phases" plus bas) quand
//         la dernière phase du camp se termine.
//       • `currentStep` / `isLastSideOfTurn` sont des valeurs exposées en
//         lecture, utilisées respectivement pour détecter un changement de
//         camp/tour (remise à zéro de la phase — et, cf. plus bas, des MP de
//         TOUTES les unités) et pour choisir le libellé du bouton "suivant".
//       • `currentTurn` (numéro de tour) sert à remettre à zéro la
//         congestion des hex d'entrée (cf. section dédiée plus bas) à chaque
//         NOUVEAU TOUR — contrairement à `spentMp`, PAS à chaque changement
//         de camp (`currentStep`) : "le même tour" y couvre les deux camps.
//   - `terrain` : `module.terrain` (JSON du module, ex. coral-sea.json) —
//     `{ edges: { layers, kinds, movementPriority, passages }, <couches> }`.
//     Les couches (`seaBarriers`...) sont des listes d'ARÊTES (paires d'hex
//     adjacents précises) ; `edges` déclare ce que chacune veut dire (cf.
//     lib/edges.js). Peut être absent : aucune arête n'a alors d'effet.
//   - `counters` : ref/computed du tableau des pions actuellement POSÉS sur
//     la carte (cf. HexMap.vue::counters — pas les renforts pas encore
//     posés, ni les pions éliminés). Sert à la ZOC (section dédiée plus bas)
//     pour savoir où se trouvent les pions ennemis, et à l'empilement
//     (section dédiée aussi) pour savoir où se trouvent les pions AMIS.
//   - `sides` : `module.sides` (ex. { ijn: ["ijn"], usn: ["usn"] }) — même
//     regroupement camp/factions que celui donné à TurnTracker.vue. Sert à
//     déterminer si deux pions sont ennemis (camps différents) ou amis (même
//     camp), pour la ZOC ET l'empilement. Peut être absent (repli sur une
//     simple comparaison de faction, cf. `isEnemyOf`).
//   - `hexOnMap` : fonction `(col, row) => bool` (cf. HexMap.vue::hexOnMap)
//     — un hex existe-t-il bien sur la carte à cette position ? Sert à
//     ignorer les voisins hors carte lors de la recherche d'une case de
//     repli (cf. `hasExitWithMp`).
//   - `rules` : règles génériques paramétrées par le module (cf.
//     lib/rules.js::resolveRules — `stackingLimit`, `zoc`, `entryCongestion`).
//     À défaut, les valeurs par défaut du moteur.
//   - `structure` : structure du tour (cf. lib/rules.js::resolveTurnStructure
//     — `phases`), cf. section "Phases" plus bas.
//   - `moduleRules` : règles PARTICULIÈRES au module joué (cf.
//     lib/moduleRules.js), dont ce fichier n'utilise que `movementAllowance`
//     (potentiel de mouvement propre à un pion, ex. l'allure des transports
//     de la mer de Corail). Elle rend `null` quand elle ne se prononce pas :
//     la règle générique s'applique alors telle quelle.
import { computed, ref, watch } from 'vue'
import { hexId } from './calibration.js'
import { neighborsOf } from './hex.js'
import { isUnit } from './units.js'
import { resolveRules, resolveTurnStructure, stackingLimitOf, MOVEMENT_STEP } from './rules.js'
import { resolveEdges } from './edges.js'
import { resolvePassages } from './passages.js'
import { t, mt } from '../i18n/index.js'

// Coût d'entrée de TOUT hex, en MP : les modules ne déclarent pas de types de
// terrain, chaque pas compte pour un.
const HEX_COST = 1

export function useAssisted(assisted, turnTrackerRef, terrain, counters, sides, hexOnMap, rules = resolveRules(null), structure = resolveTurnStructure(null), moduleRules = {}) {
  // --- Arêtes (hexsides) du module -------------------------------------------
  // Interprète des arêtes, construit UNE SEULE FOIS (cf. lib/edges.js) :
  // `terrain` ne change pas en cours de partie. `edges.propsOf(clé)` donne les
  // propriétés (`impassable`, `blocksZoc`) de la nature qui fait foi sur une
  // arête, et c'est tout ce que ce fichier sait des arêtes.
  const edges = resolveEdges(terrain)
  // Hex coupés par une île (cf. lib/passages.js) : dans un tel hex, on ne
  // ressort que par un côté de la couleur du côté d'entrée.
  const passages = resolvePassages(terrain)

  /** Propriétés de l'hexside `from` -> `hex` (hex au format { c, r } de
   *  HexMap.vue), ou `null` (arête ordinaire, ou `from` absent). */
  function edgeProps(from, hex) {
    if (!from) return null
    return edges.propsOf(hexId(from.c + 1, from.r) + '-' + hexId(hex.c + 1, hex.r))
  }

  // --- Affichage de la grille hexagonale -----------------------------------
  // `showGridPref` mémorise la PRÉFÉRENCE de l'utilisateur (case cochée ou
  // non), indépendamment du mode de partie. On la garde séparée de
  // `showGrid` pour ne pas perdre ce choix si jamais le mode passe de
  // Assisté à Libre puis repasse à Assisté (la préférence est conservée,
  // seul son EFFET est neutralisé hors mode Assisté).
  const showGridPref = ref(true)

  // `showGrid` est la valeur réellement utilisée par le template (HexMap.vue
  // l'utilise à la fois pour afficher/masquer la grille et pour piloter la
  // case à cocher correspondante, désactivée hors mode Assisté).
  const showGrid = computed({
    // Lecture : la grille n'est visible que si on est en mode Assisté ET
    // que l'utilisateur a coché la case. En mode Libre, on renvoie
    // toujours `false`, quelle que soit la préférence mémorisée : la
    // grille reste masquée sans exception.
    get: () => assisted.value && showGridPref.value,
    // Écriture : on ignore toute tentative de cocher/décocher la case si
    // on n'est pas en mode Assisté. Concrètement, HexMap.vue désactive déjà
    // la case à cocher (`:disabled="!assisted"`) hors mode Assisté, donc ce
    // garde-fou est une sécurité supplémentaire plutôt qu'un chemin normal.
    set: (visible) => { if (assisted.value) showGridPref.value = visible },
  })

  // --- Sélection des pions au clic ------------------------------------------
  // En mode Assisté, un clic sur un pion le sélectionne (contour vert).
  // En mode Libre, cette interaction est désactivée : seul le
  // glisser-déposer permet de déplacer un pion, pour rester au plus près
  // d'un vrai bac à sable sans "aide" de l'interface.
  const selectable = computed(() => assisted.value)

  // --- Glisser-déposer des UNITÉS (entrée en jeu et déplacement) -------------
  // Miroir exact de `selectable` ci-dessus, pour que les 2 modes restent
  // mutuellement exclusifs sur la façon de jouer un pion — jamais les deux
  // façons de faire disponibles en même temps :
  //   - Mode Libre   : `draggable` vrai, `selectable` faux — seul le
  //     glisser-déposer fonctionne (aucune sélection au clic).
  //   - Mode Assisté : `draggable` faux, `selectable` vrai — un pion (déjà
  //     sur la carte, ou un renfort pas encore posé) ne peut plus être
  //     glissé du tout ; la SEULE façon de le faire entrer en jeu ou de le
  //     déplacer est le clic (sélection au clic, puis clic sur l'hex de
  //     destination — cf. onHex/onCounterSelect/onReinforcementSelect dans
  //     HexMap.vue).
  const draggable = computed(() => !assisted.value)

  // --- Restriction de mouvement par camp actif -------------------------------
  // `canControl(c)` répond à la question : "le camp dont c'est le tour
  // a-t-il le droit de contrôler (sélectionner/déplacer) ce pion `c` ?"
  //
  // Cette fonction est appelée par HexMap.vue à chaque tentative de
  // sélection ou de déplacement (clic, début de glisser-déposer, drop).
  function canControl(counter) {
    // Hors mode Assisté (mode Libre), aucune restriction : tout pion est
    // contrôlable par n'importe qui, à tout moment.
    if (!assisted.value) return true

    // En mode Assisté, on délègue la décision à TurnTracker.vue, qui
    // connaît le camp actif du tour en cours et les factions qui lui sont
    // rattachées. Le `?? true` couvre le cas où `turnTrackerRef.value`
    // n'est pas encore monté (ex. tout premier rendu) : par défaut, on
    // n'empêche rien plutôt que de bloquer l'interface sur une ref pas
    // encore prête.
    return turnTrackerRef.value?.canControl(counter) ?? true
  }

  // --- Phases ---------------------------------------------------------------
  // Les phases qui composent le tour sont DÉCLARÉES par le module
  // (`module.turnStructure.phases`, cf. lib/rules.js::resolveTurnStructure,
  // qui attribue à chacune son pas — 0 pour le Mouvement) : ex. la mer de
  // Corail joue mouvement naval, combat naval, opérations aériennes,
  // reconnaissance, administrative. Un module qui n'en déclare pas joue une
  // seule phase, le Mouvement.
  //
  // Deux façons de les enchaîner, selon la piste de tour (cf.
  // lib/turnTrack.js) :
  //   - piste à phases ENTREMÊLÉES (`turnTrack.interleaved`) : chaque pas de
  //     la piste est un CRÉNEAU `{ turn, phase, side }` — le pas désigne à lui
  //     seul la phase jouée, et le bouton "suivant" passe au créneau suivant ;
  //   - sinon, chaque camp joue toutes ses phases à la suite pendant son pas :
  //     le bouton "suivant" passe à la phase suivante de la liste, puis, après
  //     la dernière, au camp suivant (cf. `endSide`).
  //
  // Le camp actif et le tour sont TOUJOURS gérés par TurnTracker.vue (son
  // `nextTurn()`) ; ce composable ne fait QUE superposer une phase locale par-
  // dessus ce pas.
  const phaseStep = ref(MOVEMENT_STEP)

  // --- Mise en place (avant le tour 1) ---------------------------------------
  // Étape de la piste de tour déclarée par `turnTrack.setup` (cf.
  // lib/turnTrack.js) : un seul camp, une seule phase, où il pose ses pions
  // de tour 0 depuis le panneau, n'importe où sur la carte (`setup` "*").
  // Aucun déplacement (le Mouvement est la phase 0). Le bouton "suivant"
  // ouvre directement le tour 1.
  const PHASE_SETUP = -2

  const phases = structure.phases

  /** Phases jouées CE tour-ci : la liste déclarée, moins celles que la piste
   *  de tour retire de ce tour (`turnInfo.skipPhases`, cf. lib/turnTrack.js —
   *  ex. pas d'opérations aériennes de nuit). La phase de Mouvement n'est
   *  jamais retirée. */
  function activePhases() {
    const skipped = turnTrackerRef.value?.currentTurnInfo?.skipPhases ?? []
    return phases.filter((entry) => entry.kind === 'movement' || !skipped.includes(entry.id))
  }

  /** Pas de la PREMIÈRE phase du tour d'un camp. */
  function firstStep() {
    return activePhases()[0].step
  }

  /** Nom de la phase de pas `step` dans la langue courante (journal, rapport
   *  de bug). */
  function phaseNameOf(step) {
    if (step == null) return '—'
    if (step === PHASE_SETUP) return t('phases.setup')
    const entry = phases.find((candidate) => candidate.step === step)
    return entry ? mt(entry.label) : '—'
  }

  /** Début du tour d'un camp : la phase désignée par le créneau (piste
   *  entremêlée), sinon la première phase du tour. Appelée :
   *   - à chaque changement de camp/tour (watcher de `currentStep` plus bas) ;
   *   - au lancement de la partie (cf. HexMap.vue, `onMounted` -> `initPhase`,
   *     aucun changement de pas n'ayant alors eu lieu) ;
   *   - au début d'un rejeu de journal (cf. `resetTurnState`). */
  function startSidePhase() {
    if (turnTrackerRef.value?.isSetupStep) {
      phaseStep.value = PHASE_SETUP
      return
    }
    // Piste à phases entremêlées (cf. lib/turnTrack.js) : le pas désigne à
    // lui seul la phase jouée.
    const slot = turnTrackerRef.value?.currentSlot
    if (slot) {
      phaseStep.value = phases.find((entry) => entry.id === slot.phase)?.step ?? firstStep()
      return
    }
    phaseStep.value = firstStep()
  }

  /** Le renfort `c` peut-il être posé DANS LA PHASE EN COURS ? Les pions de
   *  tour 0 n'entrent en jeu qu'à la mise en place, et elle n'accepte
   *  qu'eux. Le tour d'arrivée et le camp sont vérifiés à part (cf.
   *  HexMap.vue::canEnterThisTurn/`canControl`). Toujours vrai hors mode
   *  Assisté. */
  function canPlaceReinforcementNow(counter) {
    if (!assisted.value) return true
    if (phaseStep.value === PHASE_SETUP) return (counter?.turn ?? 1) === 0
    return (counter?.turn ?? 1) !== 0
  }

  // MP déjà dépensés ce tour-ci, par unité : Map id -> nombre de MP
  // consommés jusqu'ici. Déclaré ici (avant le watcher juste en dessous) car
  // ce même watcher le remet à zéro en même temps que la phase — cf. section
  // "Points de mouvement" plus bas pour son utilisation complète.
  const spentMp = ref(new Map())

  // `phase` n'existe (au sens de l'UI) qu'en mode Assisté : hors de ce
  // mode, on expose `null` pour que TurnTracker.vue sache qu'il doit
  // revenir à son affichage historique (pas de ligne "phases", bouton
  // "suivant" en bout de piste de tour, cf. TurnTracker.vue::props.phase).
  const phase = computed(() => (assisted.value ? phaseStep.value : null))

  // Libellés des marqueurs de la ligne "phases" (cf. TurnTracker.vue, qui ne
  // fait qu'afficher CETTE liste en surlignant l'entrée d'index `phaseIndex`).
  // La liste est d'abord construite en CLÉS de phase (`phaseKeys`, stables),
  // puis traduite dans la langue de l'interface (`phaseLabels`) : le marqueur
  // allumé se retrouve par sa clé (cf. `phaseIndex`), jamais par son libellé,
  // qui change avec la langue.
  const phaseKeys = computed(() => {
    if (!assisted.value) return []
    if (phaseStep.value === PHASE_SETUP) return ['setup']
    return activePhases().map((entry) => entry.id)
  })
  const phaseLabels = computed(() => phaseKeys.value.map((key) => {
    const entry = phases.find((candidate) => candidate.id === key)
    return entry ? mt(entry.label) : t(`phases.${key}`)
  }))

  // Index du marqueur ALLUMÉ dans `phaseLabels` (cf. TurnTracker.vue, prop
  // `phaseIndex`) : la position de la phase en cours dans cette liste (par
  // sa clé, cf. `phaseKeys`). `null` hors mode Assisté.
  const phaseIndex = computed(() => {
    if (!assisted.value) return null
    if (phaseStep.value === PHASE_SETUP) return 0
    return phaseKeys.value.indexOf(phases.find((entry) => entry.step === phaseStep.value)?.id)
  })

  // Dès que le camp/tour actif change — que ce soit via NOTRE propre appel
  // à `nextTurn()` plus bas, via une synchronisation multijoueur
  // (`applyRemoteTurn`, piloté par le serveur), ou via un rejeu de journal
  // — on repart de la phase de départ du nouveau pas. Le même changement de
  // pas remet aussi à zéro les MP dépensés par TOUTES les unités (cf.
  // `spentMp` plus bas) : les points de mouvement ne se reportent jamais
  // d'un tour/camp sur l'autre, chacun repart avec son plein potentiel de MP.
  //
  // `flush: 'sync'` : le watcher s'exécute IMMÉDIATEMENT au changement de
  // pas, et non plus "un peu plus tard" (au prochain cycle de rendu, le
  // comportement par défaut de Vue). Indispensable pour le REJEU du journal
  // (cf. HexMap.vue::fastForwardReplay) : l'avance rapide applique d'une
  // traite "changement de tour" PUIS "changement de phase" PUIS "MP
  // dépensés"... Avec un watcher différé, cette remise à zéro serait arrivée
  // APRÈS coup et aurait écrasé la phase et les MP que le rejeu venait tout
  // juste de rétablir (cf. `setPhase`/`setSpentMp` plus bas).
  watch(() => turnTrackerRef.value?.currentStep, () => {
    startSidePhase()
    spentMp.value = new Map()
    enteredIds.value = new Set()
  }, { flush: 'sync' })

  // Unités ENTRÉES EN JEU pendant le pas en cours (ids) — cf. `noteEntered`.
  // Avec `spentMp`, elles disent quelles unités sont concernées par la règle
  // d'empilement (cf. `actedThisStep`) ; remises à zéro avec lui, au même
  // watcher (ci-dessus), et au rejeu (cf. `resetTurnState`).
  const enteredIds = ref(new Set())

  /** `counter` vient d'entrer en jeu sur la carte pendant ce pas (cf.
   *  HexMap.vue::onHex et le rejeu des entrées `place`) : il est soumis à la
   *  règle d'empilement comme une unité qui s'est déplacée. */
  function noteEntered(counter) {
    if (!counter) return
    enteredIds.value = new Set(enteredIds.value).add(String(counter.id))
  }

  // Nombre d'unités déjà ENTRÉES EN JEU ce TOUR-CI par hex d'entrée ("col,row"
  // -> compteur) — cf. section "Congestion des hex d'entrée" plus bas. Remis
  // à zéro à chaque nouveau NUMÉRO DE TOUR (pas à chaque changement de camp
  // comme `spentMp` ci-dessus : "le même tour" au sens de cette règle couvre
  // les deux camps qui s'y relaient, cf. TurnTracker.vue::currentTurn).
  const entryCounts = ref(new Map())

  // Pour chaque pion actuellement compté dans `entryCounts` : par quel hex
  // il est entré (id du pion -> clé "col,row") — permet à `unspendEntryCost`
  // de décrémenter le BON compteur si ce pion est "replacé" aux renforts
  // avant la fin du tour (cf. HexMap.vue::returnCounterToReinforcements).
  // Remis à zéro EN MÊME TEMPS que `entryCounts` (même watcher juste
  // en-dessous).
  const entryHexByUnit = ref(new Map())

  // `flush: 'sync'` pour la même raison que le watcher de `currentStep`
  // plus haut : au rejeu rapide du journal, les entrées en jeu rejouées
  // juste après un changement de tour rétablissent la congestion (cf.
  // HexMap.vue::applyReplayEntry) — un watcher différé l'effacerait ensuite.
  watch(() => turnTrackerRef.value?.currentTurn, () => {
    entryCounts.value = new Map()
    entryHexByUnit.value = new Map()
  }, { flush: 'sync' })

  // Libellé affiché SUR le bouton "suivant" de la ligne "phases", pour que
  // l'utilisateur sache toujours à l'avance ce que le prochain clic va
  // déclencher. `null` hors mode Assisté : TurnTracker.vue retombe alors sur
  // son titre par défaut ("Tour suivant"). Libellés traduits dans la langue
  // de l'interface (cf. src/i18n, section `phaseButton`).
  const nextLabel = computed(() => {
    if (!assisted.value) return null
    if (phaseStep.value === PHASE_SETUP) return t('phaseButton.newTurn')
    // Phases entremêlées : même phase pour l'autre camp, phase suivante, ou
    // nouveau tour (cf. lib/turnTrack.js).
    const slot = turnTrackerRef.value?.currentSlot
    if (slot) {
      const next = turnTrackerRef.value?.nextSlot
      if (!next || next.turn !== slot.turn) return t('phaseButton.newTurn')
      return next.phase === slot.phase ? t('phaseButton.otherPlayer') : t('phaseButton.newPhase')
    }
    // "Nouvelle phase" jusqu'à la dernière de la liste.
    const active = activePhases()
    const index = active.findIndex((entry) => entry.step === phaseStep.value)
    if (index >= 0 && index < active.length - 1) return t('phaseButton.newPhase')
    return turnTrackerRef.value?.isLastSideOfTurn ? t('phaseButton.newTurn') : t('phaseButton.otherPlayer')
  })

  // Gestionnaire de clic pour le bouton "suivant" de la ligne "phases"
  // (branché sur l'évènement `phase-next` émis par TurnTracker.vue — cf.
  // ce fichier, qui n'implémente pas lui-même cette décision).
  function advance() {
    // Fin de la mise en place (tour 1), ou piste à phases entremêlées (le
    // créneau suivant : l'autre camp, ou la phase suivante) : c'est
    // TurnTracker.vue qui avance, et le watcher de `currentStep` remet la
    // phase de départ du nouveau pas.
    if (phaseStep.value === PHASE_SETUP || turnTrackerRef.value?.currentSlot) {
      turnTrackerRef.value?.nextTurn()
      return
    }
    // La phase suivante de la liste, ou le camp suivant après la dernière.
    const active = activePhases()
    const index = active.findIndex((entry) => entry.step === phaseStep.value)
    if (index >= 0 && index < active.length - 1) phaseStep.value = active[index + 1].step
    else turnTrackerRef.value?.nextTurn()
  }

  // --- Points de mouvement (MP) et coût d'entrée -----------------------------
  // En mode Assisté, un pion ne peut entrer dans un hex QUE s'il lui reste
  // assez de MP pour en payer le coût (1 MP, cf. `HEX_COST`) — sinon le clic
  // sur cet hex (cf. HexMap.vue::onHex, branche "pion sélectionné + hex
  // adjacent") ne fait rien, comme si l'hex n'était pas une destination
  // valide. Concrètement :
  //   1. avant le déplacement, HexMap.vue appelle `canEnterHex(pion, hex)` —
  //      s'il répond `false`, HexMap.vue n'effectue PAS le déplacement ;
  //   2. si le déplacement a bien lieu, HexMap.vue appelle `spendMp(pion,
  //      hex)` juste après, pour déduire le coût des MP du pion.
  // Un pion peut ainsi enchaîner plusieurs hex (cf. onHex, qui le laisse
  // sélectionné après chaque déplacement) tant qu'il lui reste assez de MP à
  // chaque nouvelle entrée — les MP non dépensés ne servent à rien d'autre
  // et sont remis à leur maximum au tour/camp suivant (cf. watcher plus haut,
  // qui vide `spentMp`).
  //
  // Un pion sans potentiel de mouvement (cf. `movementAllowance` : ni piste,
  // ni règle du module, ni `mov`) n'est jamais bloqué : `remainingMp` répond
  // alors "illimité" plutôt que "zéro MP".

  /** Coût (en MP) pour ENTRER dans un hex : toujours `HEX_COST`. Les
   *  paramètres (`hex`, `from` — format { c, r }) sont ceux qu'attendent les
   *  appelants (lib/useDebug.js, lib/autoMove.js via HexMap.vue) ; ils
   *  permettraient à un coût de dépendre du terrain ou de l'arête empruntée.
   *  Exportée : seule source de vérité pour un coût d'entrée. */
  function terrainCost() {
    return HEX_COST
  }

  /** MP qu'il reste à `c` pour la suite de son mouvement ce tour-ci. `null`
   *  si le pion n'a pas de potentiel de mouvement (cf. `movementAllowance`)
   *  — dans ce cas précis, `canEnterHex` ci-dessous n'impose AUCUNE
   *  restriction de MP. Exportée pour lib/useDebug.js (portée de
   *  déplacement en mode debug) et HexMap.vue (marche automatique). */
  function remainingMp(counter) {
    const mov = movementAllowance(counter)
    if (mov == null) return null
    return mov - (spentMp.value.get(String(counter.id)) ?? 0)
  }

  /** Potentiel de mouvement (MP) de `counter` CE tour-ci : celui que le module
   *  lui donne (cf. `moduleRules.movementAllowance`), sinon celui que la piste
   *  de tour impose à toute unité (`turnInfo.movement`, cf. lib/turnTrack.js
   *  — ex. 2 hex de nuit, 1 de jour à la mer de Corail), sinon son `mov`
   *  propre ; `null` si aucun des trois (mouvement libre). */
  function movementAllowance(counter) {
    const special = moduleRules.movementAllowance?.(counter, turnTrackerRef.value?.currentTurnInfo)
    if (special != null) return special
    const turnMovement = turnTrackerRef.value?.currentTurnInfo?.movement
    if (turnMovement != null && isUnit(counter)) return turnMovement
    return counter?.mov ?? null
  }

  // --- Zone de Contrôle (ZOC) -------------------------------------------------
  // Règle : les 6 hex autour d'une unité constituent sa ZOC — SAUF à travers
  // un hexside déclaré `blocksZoc` (cf. `edgeBlocksZoc` plus bas, ex. une
  // barrière côtière). Une unité qui COMMENCE sa phase de Mouvement dans la
  // ZOC d'une unité ennemie ne peut pas bouger DU TOUT ce tour-ci ; une unité
  // qui ENTRE dans une ZOC ennemie (en partant d'un hex hors ZOC) doit s'y
  // arrêter — aucun déplacement supplémentaire ce tour-ci, même s'il lui
  // reste des MP.
  //
  // Ces deux règles sont déclarées par le module (`rules.zoc`, cf.
  // lib/rules.js) : `lockIfStarting` pour la 1re, `stopOnEntry` pour la 2e —
  // un module peut n'en garder qu'une. Pour les distinguer, on regarde si
  // l'unité a DÉJÀ BOUGÉ ce tour-ci (cf. `hasMovedThisTurn` : des MP ont
  // été dépensés — mouvement ou entrée en jeu) : si non, elle COMMENCE son
  // mouvement là (1re règle) ; si oui, elle vient d'y ENTRER (2e règle). Cf.
  // `isZocFrozen`.
  //
  // Avec les deux règles, elles se ramènent en fait à UNE SEULE, appliquée
  // dans `canEnterHex` plus bas : "si l'hex QUITTÉ (`from`) est sous ZOC
  // ennemie, aucun déplacement n'est autorisé, quel que soit `h`" :
  //   - en tout DÉBUT de tour, `from` = la position actuelle du pion (il n'a
  //     encore rien parcouru) -> s'il y est déjà en ZOC ennemie, ce test
  //     bloque IMMÉDIATEMENT tout déplacement (1re règle) ;
  //   - un pion qui vient de bouger et se retrouve maintenant dans une ZOC
  //     ennemie (le déplacement qui l'y a fait ENTRER reste autorisé : `from`
  //     de CE déplacement-là n'était pas encore en ZOC) verra son `from`
  //     passer à cette case pour tout nouveau déplacement -> bloqué au
  //     prochain clic (2e règle, "doit s'arrêter").
  //
  // Seules les unités projettent une ZOC (pas les marqueurs).

  /** Camp ("side", cf. `sides`) auquel appartient la faction `faction`, ou
   *  `null` si `sides` n'est pas déclaré par le module, ou si cette faction
   *  n'apparaît dans aucun camp déclaré (repli, cf. `isEnemyOf`). */
  function sideOfFaction(faction) {
    if (!sides) return null
    for (const key of Object.keys(sides)) {
      if (sides[key]?.includes(faction)) return key
    }
    return null
  }

  /** `a` et `b` (deux pions) sont-ils ennemis ? Basé sur `sides` (même
   *  regroupement camp/factions que TurnTracker.vue pour la restriction de
   *  tour) : ennemis si leurs camps diffèrent. Repli sur une simple
   *  comparaison de faction si `sides` n'est pas déclaré par le module.
   *  Exportée pour HexMap.vue (marche automatique, entrée en jeu d'un
   *  renfort : un hex d'entrée occupé par un ennemi, ou par un ami figé dans
   *  une ZOC ennemie, est refusé). */
  function isEnemyOf(counterA, counterB) {
    const sa = sideOfFaction(counterA?.faction)
    const sb = sideOfFaction(counterB?.faction)
    if (sa != null && sb != null) return sa !== sb
    return counterA?.faction !== counterB?.faction
  }

  /** Le hexside précis entre `a` et `b` ({ col, row } 0-based/1-based, ex.
   *  un pion et l'un de ses voisins) coupe-t-il la ZOC ? Vrai s'il est
   *  déclaré `blocksZoc` (cf. lib/edges.js). */
  function edgeBlocksZoc(counterA, counterB) {
    return !!edgeProps({ c: counterA.col, r: counterA.row }, { c: counterB.col, r: counterB.row })?.blocksZoc
  }

  /** `c` a-t-il déjà bougé ce tour-ci ? Oui dès qu'il a dépensé des MP
   *  (déplacement, coût d'entrée en jeu — cf. `spentMp`) ; "Annuler le
   *  mouvement" le remet à zéro (cf. `resetMp`). Sert à distinguer, pour la
   *  ZOC, une unité qui COMMENCE son mouvement en ZOC ennemie d'une unité
   *  qui vient d'y ENTRER (cf. `isZocFrozen`). Un pion sans potentiel de
   *  mouvement n'en dépense jamais : il est toujours considéré comme "au
   *  départ". */
  function hasMovedThisTurn(counter) {
    return (spentMp.value.get(String(counter?.id)) ?? 0) > 0
  }

  /** La règle de ZOC du module fige-t-elle `c` dans l'hex `hexKey` ("col,row"),
   *  s'il y est sous ZOC ennemie ? `lockIfStarting` s'il n'a pas encore bougé
   *  ce tour-ci, `stopOnEntry` s'il vient d'y entrer (cf. en-tête de section). */
  function zocLocks(counter) {
    return hasMovedThisTurn(counter) ? rules.zoc.stopOnEntry : rules.zoc.lockIfStarting
  }

  /** `c` (DÉJÀ posé sur la carte) est-il FIGÉ sur place par une ZOC ennemie ?
   *  Il faut qu'il soit dans une ZOC ennemie ET que la règle du module l'y
   *  retienne (cf. `zocLocks`). Exportée pour HexMap.vue (un ami figé bloque
   *  l'hex d'entrée d'un renfort, cf. isEntryHexBlocked) et lib/useDebug.js
   *  (portée de déplacement : rien n'est exploré depuis un pion figé). */
  function isZocFrozen(counter) {
    if (!counter) return false
    return enemyZocSet(counter).has(counter.col + ',' + counter.row) && zocLocks(counter)
  }

  /** Ensemble ("col,row") de tous les hex sous ZOC ennemie de `c` — union
   *  des 6 hex VOISINS (jamais l'hex du pion ennemi lui-même) de chaque
   *  unité actuellement posée sur la carte (`counters`) qui est ennemie de
   *  `c` (cf. `isEnemyOf`) — sauf à travers un hexside qui coupe la ZOC (cf.
   *  `edgeBlocksZoc` ci-dessus). `c` lui-même et ses propres alliés n'y
   *  contribuent jamais. Set VIDE si `c` est `null`/absent.
   *
   *  Exportée pour HexMap.vue (surlignage des hex sous ZOC ennemie, en mode
   *  debug) et lib/useDebug.js (calcul de portée : un hex sous ZOC ennemie
   *  ne laisse plus continuer le chemin au-delà de lui). */
  function enemyZocSet(counter) {
    const set = new Set()
    if (!counter) return set
    for (const other of counters.value) {
      if (!isUnit(other)) continue
      if (!isEnemyOf(counter, other)) continue
      for (const neighbor of neighborsOf(other.col, other.row)) {
        if (edgeBlocksZoc(other, neighbor)) continue
        set.add(neighbor.col + ',' + neighbor.row)
      }
    }
    return set
  }

  // --- Empilement (stacking) au mouvement normal -----------------------------
  // Une unité ne peut jamais TERMINER sa phase de Mouvement sur un hex qui
  // compte déjà `rules.stackingLimit` unités AMIES — la limite de SON camp
  // (cf. `limitOf` : le module peut la déclarer par camp, ex. aucune pour les
  // task forces américaines de la mer de Corail). Comme on ne sait pas À
  // L'AVANCE si tel hex sera la dernière case du déplacement, la règle se
  // vérifie à CHAQUE pas : entrer dans un hex plein n'est autorisé QUE si
  // l'unité peut ENSUITE en repartir ce même tour (cf.
  // `canLeaveAfterEntering`) — sinon, y entrer la "coincerait"
  // définitivement avec ses amies.
  //
  // Exception (règle validée) : un ami qui N'A PAS ENCORE BOUGÉ dans cette
  // phase de Mouvement, et qui peut encore partir, ne compte pas — c'est LUI
  // qui libérera l'hex en jouant son mouvement ensuite (cf. `willMakeRoom`).
  // L'unité qui le rejoint peut donc s'y arrêter. Si l'ami ne bouge
  // finalement pas, le contrôle de fin de phase (cf. `stackedHexes`, qui
  // compte TOUTES les unités de l'hex) refuse de quitter la phase.
  //
  // La règle ne vise que les unités qui ont AGI pendant ce pas — bougé, ou
  // sont entrées en jeu (cf. `actedThisStep`) : c'est leur mouvement qui ne
  // peut pas se terminer sur un hex plein. Une pile formée AVANT, et dont
  // aucune unité n'a bougé depuis, est légale : ex. les task forces que le
  // joueur US empile à la mise en place, qui peuvent le rester.

  /** Nombre d'unités AMIES de `c` (même camp, cf. `isEnemyOf` — `c` lui-même
   *  exclu) déjà présentes dans `h`. Marqueurs ignorés, ni amis ni ennemis
   *  au sens de cette règle — pas plus que les amis qui vont encore partir
   *  (cf. `willMakeRoom`). */
  function friendlyCount(counter, hex) {
    return counters.value.filter(
      (other) => other.col === hex.c && other.row === hex.r && other.id !== counter?.id && isUnit(other) && !isEnemyOf(counter, other)
        && !willMakeRoom(other)
    ).length
  }

  /** `friend`, déjà posé sur la carte, libérera-t-il son hex plus tard dans
   *  la phase ? Il faut, dans l'ordre :
   *   1. être en phase de Mouvement ;
   *   2. appartenir au camp actif (cf. `canControl`) — lui seul joue ;
   *   3. N'AVOIR PAS ENCORE BOUGÉ cette phase (cf. `hasMovedThisTurn` — les
   *      MP sont remis à zéro à chaque changement de camp) ;
   *   4. ne pas être figé par une ZOC ennemie (cf. `isZocFrozen`) ;
   *   5. pouvoir faire au moins un pas avec ses MP (cf. `hasExitWithMp`) —
   *      un pion sans potentiel de mouvement peut toujours partir. */
  function willMakeRoom(friend) {
    if (phaseStep.value !== MOVEMENT_STEP || !canControl(friend)) return false
    if (hasMovedThisTurn(friend) || isZocFrozen(friend)) return false
    const remaining = remainingMp(friend)
    if (remaining == null) return true
    return hasExitWithMp(friend, { c: friend.col, r: friend.row }, remaining)
  }

  /** `c` serait-il EN SURPLUS d'empilement en s'arrêtant dans `h` ? Oui si
   *  `h` contient déjà autant d'unités amies que la limite du module
   *  pour son camp (cf. `limitOf`, 1 par défaut). Exportée pour HexMap.vue
   *  (surlignage vert du premier pas, clic de mouvement, entrée d'un
   *  renfort) et lib/useDebug.js (portée complète en mode debug) — même
   *  définition partout. */
  function wouldOverstack(counter, hex) {
    return friendlyCount(counter, hex) >= limitOf(counter)
  }

  /** Limite d'empilement du camp de `counter` (cf. lib/rules.js::
   *  stackingLimitOf). */
  function limitOf(counter) {
    return stackingLimitOf(rules, sideOfFaction(counter?.faction))
  }

  /** `c` peut-il, après être entré dans `h` en venant de `from` (et avoir
   *  payé le coût d'entrée de `h`, cf. `terrainCost`), faire AU MOINS UN
   *  déplacement de plus ce tour-ci ? Il lui faut, dans l'ordre :
   *   1. encore des MP après avoir payé pour `h` (`remainingMp` ne suit pas
   *      de MP pour `c` -> jamais concerné par cette contrainte, cf. `null`) ;
   *   2. ne pas se retrouver figé en ZOC ennemie SUR `h` (cf. `enemyZocSet`
   *      — sinon, plus aucun mouvement n'est de toute façon possible, quels
   *      que soient ses MP) ;
   *   3. au moins un hex voisin de `h` qui soit à la fois franchissable (cf.
   *      `canEnterTerrain`) et abordable avec les MP qu'il lui resterait —
   *      peu importe si CE voisin est lui-même libre ou pas (on ne vérifie
   *      qu'UN pas en avant, pas tout un chemin jusqu'à la fin du tour).
   *  Exportée, même raison que `wouldOverstack`. */
  function canLeaveAfterEntering(counter, hex, from) {
    const remaining = remainingMp(counter)
    if (remaining == null) return true
    return canLeaveWithMp(counter, hex, remaining - terrainCost(hex, from))
  }

  /** Même question que `canLeaveAfterEntering`, mais pour un RENFORT qui
   *  ENTRE EN JEU sur `h` (cf. HexMap.vue::entryHexSet) plutôt que pour un
   *  pion qui s'y déplace : ce qu'il paie pour arriver est le coût d'ENTRÉE
   *  de `h`, congestion comprise (cf. `entryCost`). Règle validée : un
   *  renfort ne peut PAS entrer sur un hex plein d'amis s'il ne pourrait pas
   *  en repartir ensuite — sinon il y resterait coincé avec eux, ce que la
   *  fin de phase refuserait de toute façon (cf. `stackedHexes`). Toujours
   *  vrai hors mode Assisté. */
  function canLeaveAfterReinforcementEntry(counter, hex) {
    if (!assisted.value) return true
    const remaining = remainingMp(counter)
    if (remaining == null) return true
    return canLeaveWithMp(counter, hex, remaining - entryCost(hex))
  }

  /** Brique commune aux deux fonctions ci-dessus : `c`, posé sur `h` avec
   *  `afterEntry` MP restants, peut-il faire au moins un pas de plus ? Ce
   *  sont les étapes 1 à 3 décrites sur `canLeaveAfterEntering`. */
  function canLeaveWithMp(counter, hex, afterEntry) {
    if (afterEntry <= 0) return false
    // Une fois entré dans `h`, `c` AURA bougé : s'il s'y retrouve en ZOC
    // ennemie, c'est la règle `stopOnEntry` du module qui dit s'il est figé.
    if (rules.zoc.stopOnEntry && enemyZocSet(counter).has(hex.c + ',' + hex.r)) return false
    return hasExitWithMp(counter, hex, afterEntry)
  }

  /** `c`, sur `h` avec `mp` MP, a-t-il au moins un voisin franchissable (cf.
   *  `canEnterTerrain`) et abordable (cf. `terrainCost`) ? Étape 3 de
   *  `canLeaveAfterEntering`, partagée avec `willMakeRoom`. */
  function hasExitWithMp(counter, hex, mp) {
    if (mp <= 0) return false
    return neighborsOf(hex.c, hex.r).some((neighbor) => {
      if (!hexOnMap(neighbor.col, neighbor.row)) return false
      const nh = { c: neighbor.col, r: neighbor.row }
      return canEnterTerrain(counter, nh, hex) && mp >= terrainCost(nh, hex)
    })
  }

  /** `c` (DÉJÀ posé sur la carte) est-il en SURPLUS D'EMPILEMENT là où il se
   *  trouve ? Différence avec `wouldOverstack(c, h)` : celle-ci regarde un
   *  hex `h` où `c` n'est PAS encore (avant un déplacement) ; ici, `c` est
   *  déjà dans l'hex examiné (sa propre position).
   *
   *  Sert à HexMap.vue::setSelectedCounter : on ne peut pas TERMINER le
   *  mouvement d'une unité (la désélectionner, ou passer à une autre unité /
   *  un renfort) tant qu'elle est en overstack — le joueur doit d'abord la
   *  déplacer ailleurs (ou annuler son mouvement). Marqueurs ignorés, pas
   *  plus qu'un ami qui n'a pas encore bougé et libérera l'hex (cf.
   *  `willMakeRoom`). Toujours faux hors mode Assisté. */
  function isOverstacked(counter) {
    if (!assisted.value || !isUnit(counter) || !actedThisStep(counter)) return false
    return friendlyCount(counter, { c: counter.col, r: counter.row }) >= limitOf(counter)
  }

  /** `c` a-t-il agi pendant ce pas — bougé (cf. `hasMovedThisTurn`) ou
   *  y est-il entré en jeu (cf. `noteEntered`) ? Seules ces unités sont
   *  soumises à la règle d'empilement (cf. l'en-tête de section). */
  function actedThisStep(counter) {
    return hasMovedThisTurn(counter) || enteredIds.value.has(String(counter?.id))
  }

  /** EMPILEMENTS EN ATTENTE — filet de sécurité de la même règle, vérifié
   *  cette fois au moment de QUITTER la phase de Mouvement (cf.
   *  HexMap.vue::onPhaseNext, qui refuse alors le changement de phase et
   *  ouvre PhaseBlockedModal.vue).
   *
   *  Pourquoi c'est nécessaire alors que `canLeaveAfterEntering` existe
   *  déjà : ce dernier ne garantit qu'une chose, que l'unité POURRAIT
   *  repartir de l'hex ami — pas qu'elle le fera. Rien n'empêche le joueur
   *  d'entrer sur un hex ami avec des MP de reste, puis de s'arrêter là et de
   *  cliquer "suivant". Idem pour un renfort posé sur l'hex d'un ami. C'est
   *  ICI, en fin de phase, que ces cas sont rattrapés.
   *
   *  Ne comptent que les unités du camp ACTIF (cf. `canControl`) : c'est lui
   *  qui termine sa phase, et lui seul peut encore déplacer ses pions pour
   *  défaire l'empilement. Un hex est listé dès qu'il y a plus d'unités que
   *  la limite d'empilement de leur camp (cf. `limitOf`), AMIES entre elles (cf.
   *  `isEnemyOf`), dont au moins une a agi pendant ce pas (cf.
   *  `actedThisStep` : une pile formée avant, ex. à la mise en place, reste
   *  légale tant qu'aucune de ses unités ne bouge).
   *
   *  Liste vide hors mode Assisté ou hors phase Mouvement. Chaque entrée :
   *  `{ key, hex, units }` — numéro d'hex imprimé et noms des unités
   *  empilées, pour la modale d'avertissement. */
  const stackedHexes = computed(() => {
    if (!assisted.value || phaseStep.value !== MOVEMENT_STEP) return []
    // Regroupement des unités du camp actif par hex ("col,row" -> pions).
    const byHex = new Map()
    for (const counter of counters.value) {
      if (!isUnit(counter) || !canControl(counter)) continue
      const key = counter.col + ',' + counter.row
      if (!byHex.has(key)) byHex.set(key, [])
      byHex.get(key).push(counter)
    }
    const list = []
    for (const [key, units] of byHex) {
      if (units.length <= limitOf(units[0])) continue
      // Pile formée avant ce pas, dont aucune unité n'a agi depuis : légale
      // (cf. l'en-tête de section, `actedThisStep`).
      if (!units.some(actedThisStep)) continue
      // Au moins une paire AMIE dans l'hex (sans `sides` configurés, deux
      // pions "contrôlables" pourraient en théorie être de camps opposés).
      const friendly = units.some((unitA, unitIndex) => units.slice(unitIndex + 1).some((unitB) => !isEnemyOf(unitA, unitB)))
      if (!friendly) continue
      const [col, row] = key.split(',').map(Number)
      list.push({ key, hex: hexId(col + 1, row), units: units.map((unit) => unit.name) })
    }
    return list
  })

  /** `c`, en venant de `from` ({ c, r }, optionnel), peut-il PHYSIQUEMENT
   *  entrer dans `h` ? Indépendant des MP : même avec des MP à revendre,
   *  l'hex reste hors d'atteinte si :
   *   1. l'arête `from` -> `h` est déclarée `impassable` (cf. lib/edges.js —
   *      ex. une barrière côtière) ;
   *   2. `from` est un hex COUPÉ par une île (cf. lib/passages.js) et le côté
   *      par lequel `c` y est entré n'est pas de la couleur du côté par
   *      lequel il en sortirait.
   *  Exportée pour lib/useDebug.js (portée de déplacement en mode debug) et
   *  HexMap.vue (marche automatique, placement des escortes). */
  function canEnterTerrain(counter, hex, from) {
    if (edgeProps(from, hex)?.impassable) return false
    // Hex coupé : le côté par lequel `counter` est entré dans `from`
    // (`counter.enteredFrom`, tenu par HexMap.vue) doit être de la même
    // couleur que celui par lequel il en sort. Seulement quand `from` est
    // bien sa position actuelle : la portée du mode debug explore d'autres
    // départs, dont on ignore le côté d'entrée.
    if (from && passages.active && counter && from.c === counter.col && from.r === counter.row
      && !passages.allowsTransit(counter.enteredFrom, hexId(from.c + 1, from.r), hexId(hex.c + 1, hex.r))) return false
    return true
  }

  /** `c`, actuellement en `from` ({ c, r }, optionnel), peut-il entrer dans
   *  l'hex `h` ? Hors mode Assisté : toujours vrai (mode Libre = bac à
   *  sable, aucune règle de MP, de terrain ni de ZOC). En mode Assisté,
   *  DANS L'ORDRE :
   *   1. si `from` est fourni, sous ZOC ennemie (cf. `enemyZocSet`) ET que la
   *      règle du module l'y retient (cf. `zocLocks` — `lockIfStarting` s'il
   *      commence son tour là, `stopOnEntry` s'il vient d'y entrer), refusé
   *      — QUEL QUE SOIT `h` : ce pion est figé sur place ;
   *   2. faux si `h` est physiquement hors d'atteinte (cf. `canEnterTerrain`) ;
   *   3. sinon vrai si `c` n'a pas de potentiel de mouvement (cf.
   *      `remainingMp`), sinon seulement s'il lui reste au moins le coût
   *      d'entrée de `h`. */
  function canEnterHex(counter, hex, from) {
    if (!assisted.value) return true
    if (from && enemyZocSet(counter).has(from.c + ',' + from.r) && zocLocks(counter)) return false
    if (!canEnterTerrain(counter, hex, from)) return false
    const remaining = remainingMp(counter)
    if (remaining == null) return true
    return remaining >= terrainCost(hex, from)
  }

  /** Déduit de `c` le coût d'entrée de `h` EN VENANT de `from` (mêmes
   *  paramètres que `canEnterHex`) — à appeler UNE FOIS, juste après que `c`
   *  a effectivement été déplacé dans `h` (jamais avant, et jamais si
   *  `canEnterHex` avait répondu `false`). Ne fait rien hors mode Assisté ni
   *  pour un pion sans potentiel de mouvement (cf. `remainingMp`), pour
   *  rester cohérent avec ce que `canEnterHex` a autorisé. */
  function spendMp(counter, hex, from) {
    if (!assisted.value || movementAllowance(counter) == null) return
    const spent = (spentMp.value.get(String(counter.id)) ?? 0) + terrainCost(hex, from)
    spentMp.value = new Map(spentMp.value).set(String(counter.id), spent)
  }

  /** Inverse EXACT de `spendMp` : recrédite `c` du coût de `h` en venant de
   *  `from` — à appeler quand on annule le DERNIER déplacement de `c` (cf.
   *  HexMap.vue, "Retour arrière" de la barre d'outils, disponible en mode
   *  Assisté uniquement). `h`/`from` sont ici l'hex QUITTÉ par l'annulation
   *  et celui d'où `c` venait à l'époque de ce déplacement (`last.to`/
   *  `last.from` côté HexMap.vue) — PAS la position actuelle de `c`. Ne fait
   *  rien hors mode Assisté ni pour un pion sans potentiel de mouvement (en
   *  miroir de `spendMp`). `Math.max(0, …)` par sécurité (ne devrait jamais
   *  aller sous zéro en usage normal). */
  function refundMp(counter, hex, from) {
    if (!assisted.value || movementAllowance(counter) == null) return
    const spent = Math.max(0, (spentMp.value.get(String(counter.id)) ?? 0) - terrainCost(hex, from))
    spentMp.value = new Map(spentMp.value).set(String(counter.id), spent)
  }

  /** Redonne à `c` la TOTALITÉ de ses MP pour ce tour-ci (par opposition à
   *  `refundMp`, qui ne recrédite qu'UN SEUL hex) — à appeler dans 2 cas :
   *   1. "Annuler le mouvement" (menu contextuel, cf. HexMap.vue), qui ramène
   *      directement `c` à sa position de tout début de tour, sans repasser
   *      hex par hex ;
   *   2. "Replacer le pion" (menu contextuel ou depuis "Unités éliminées",
   *      cf. HexMap.vue::returnCounterToReinforcements) — un pion renvoyé
   *      aux renforts doit repartir avec un plein potentiel de MP la
   *      prochaine fois qu'il entrera en jeu, pas avec ce qu'il lui restait
   *      au moment où il a quitté la carte.
   *  Même garde-fous que `spendMp`/`refundMp`. */
  function resetMp(counter) {
    if (!assisted.value || movementAllowance(counter) == null) return
    const next = new Map(spentMp.value)
    next.delete(String(counter.id))
    spentMp.value = next
  }

  // --- Restauration depuis le JOURNAL (rejeu d'une sauvegarde) ---------------
  // Le journal (cf. JournalPanel.vue) enregistre, en plus des positions :
  //   - la PHASE en cours (entrée `phase`, écrite par HexMap.vue::onPhaseNext
  //     à chaque changement de phase sans changement de pas) ;
  //   - les MP DÉPENSÉS par une unité après chacun de ses déplacements
  //     (champ `mp` des entrées `move`/`place`).
  // Sans ça, une partie sauvegardée EN COURS de phase de Mouvement
  // repartirait, une fois rechargée, en phase Mouvement avec toutes les
  // unités à plein potentiel de MP — elles pourraient rejouer un mouvement
  // déjà effectué. Les 3 fonctions ci-dessous servent UNIQUEMENT au rejeu
  // (cf. HexMap.vue::applyReplayEntry/resetBoardForReplay) : elles écrivent
  // directement l'état, sans aucune vérification de règle, parce que l'état
  // rejoué a déjà été validé par les règles au moment où il a été joué.

  /** Rejeu : place la phase en cours (pas de phase, cf. lib/rules.js). Le
   *  changement de TOUR, lui, passe par TurnTracker.vue (entrée `turn`) et
   *  remet de lui-même la phase de départ (cf. watcher de `currentStep`). */
  function setPhase(newPhase) {
    phaseStep.value = newPhase
  }

  /** Rejeu : fixe à `value` le total de MP déjà dépensés par l'unité `id`
   *  pendant ce tour-ci (valeur ABSOLUE lue dans le journal, pas un ajout :
   *  rejouer deux fois la même entrée donne donc toujours le même résultat). */
  function setSpentMp(id, value) {
    if (value == null) return
    spentMp.value = new Map(spentMp.value).set(String(id), value)
  }

  /** Rejeu : repart de zéro (aucun MP dépensé, aucune congestion, phase de
   *  départ du camp actif, cf. `startSidePhase`) — appelé au chargement d'un
   *  journal, avant de rejouer sa première ligne (pions déjà remis au
   *  déploiement initial par HexMap.vue). */
  function resetTurnState() {
    spentMp.value = new Map()
    enteredIds.value = new Set()
    entryCounts.value = new Map()
    entryHexByUnit.value = new Map()
    startSidePhase()
  }

  // --- Congestion des hex d'entrée de renfort ---------------------------------
  // Un renfort qui entre en jeu sur un hex paie un coût d'entrée — et, si un
  // AUTRE renfort entre par ce MÊME hex précis ce MÊME tour, le coût grimpe :
  // 1er = 1× le coût de base, 2e = 2×, 3e = 3×, etc. (cf. `entryCost`/
  // `spendEntryCost`). Cette majoration est une règle du module
  // (`rules.entryCongestion`, cf. lib/rules.js) : 'multiply' ou 'none' —
  // chaque entrée ne paie alors que le coût de base, sans surcoût.
  // `entrySurcharge` expose la valeur à afficher sur l'hex en mode debug
  // (cf. lib/useDebug.js) : le SURCOÛT déjà accumulé, que la PROCHAINE unité
  // entrante devra payer en plus du coût de base.

  /** Coût RÉEL pour que la PROCHAINE unité entre en jeu sur `h` ce tour-ci :
   *  coût de base (`HEX_COST`) × (nombre d'unités déjà entrées par ce hex ce
   *  tour-ci, cf. `entryCounts`, + 1 pour celle-ci). */
  function entryCost(hex) {
    const already = entryCounts.value.get(hex.c + ',' + hex.r) ?? 0
    return HEX_COST * (rules.entryCongestion === 'multiply' ? already + 1 : 1)
  }

  /** Surcoût déjà accumulé sur `h` ce tour-ci (0 si personne n'y est encore
   *  entré) — exactement ce que `entryCost(h)` ajoute au coût de base pour
   *  la prochaine entrée. Exportée pour l'affichage debug ("+X" sur l'hex,
   *  cf. lib/useDebug.js) — ne modifie rien, contrairement à
   *  `spendEntryCost`. */
  function entrySurcharge(hex) {
    if (rules.entryCongestion !== 'multiply') return 0
    const already = entryCounts.value.get(hex.c + ',' + hex.r) ?? 0
    return HEX_COST * already
  }

  /** Déduit `entryCost(h)` des MP de `c` ET incrémente le compteur de
   *  congestion de `h` — à appeler UNE FOIS, juste après qu'un renfort vient
   *  d'ENTRER EN JEU sur `h` (cf. HexMap.vue::onHex, branche renfort ; PAS un
   *  déplacement classique, pour ça cf. `spendMp`). Ne fait rien hors mode
   *  Assisté — en mode Libre, aucun garde-fou de MP n'existe. Peut faire
   *  passer les MP restants de `c` sous zéro si le coût (potentiellement
   *  multiplié par la congestion) dépasse ce qu'il lui reste : ce n'est PAS
   *  un blocage d'entrée, juste un mouvement ultérieur ce tour-ci qui devient
   *  impossible.
   *
   *  Renvoie ce qui vient d'être payé, pour le JOURNAL (cf. HexMap.vue::onHex,
   *  qui signale une entrée MAJORÉE par la congestion, c.-à-d. `cost` >
   *  `baseCost`) : `{ rank, baseCost, cost }` — `rank` = rang de cette entrée
   *  sur `h` ce tour-ci (1 = première), `baseCost` = coût de base, `cost` =
   *  coût réellement payé. `null` hors mode Assisté (rien n'est payé ni
   *  compté). */
  function spendEntryCost(counter, hex) {
    if (!assisted.value) return null
    // Lu AVANT d'incrémenter le compteur : `entryCost` donne le coût de
    // CETTE entrée-ci, pas de la suivante.
    const cost = entryCost(hex)
    if (movementAllowance(counter) != null) {
      const spent = (spentMp.value.get(String(counter.id)) ?? 0) + cost
      spentMp.value = new Map(spentMp.value).set(String(counter.id), spent)
    }
    const key = hex.c + ',' + hex.r
    const count = (entryCounts.value.get(key) ?? 0) + 1
    entryCounts.value = new Map(entryCounts.value).set(key, count)
    entryHexByUnit.value = new Map(entryHexByUnit.value).set(String(counter.id), key)
    return { rank: count, baseCost: HEX_COST, cost }
  }

  /** Annule l'effet de `spendEntryCost` sur la CONGESTION (pas sur les MP de
   *  `c` lui-même : cf. `resetMp`, à appeler séparément, cf. HexMap.vue::
   *  returnCounterToReinforcements) — à appeler quand `c` est "replacé" aux
   *  renforts : décrémente d'UN le compteur de congestion du hex par lequel
   *  il était entré, comme si son entrée n'avait jamais eu lieu, pour que le
   *  PROCHAIN pion à entrer par ce même hex ce même tour ne paie pas pour
   *  une place que `c` n'occupe plus. Ne fait rien si `c` n'est plus suivi
   *  (jamais entré via `spendEntryCost` CE TOUR-CI, cf. `entryHexByUnit`). */
  function unspendEntryCost(counter) {
    const key = entryHexByUnit.value.get(String(counter?.id))
    if (key == null) return
    const nextByUnit = new Map(entryHexByUnit.value)
    nextByUnit.delete(String(counter.id))
    entryHexByUnit.value = nextByUnit
    const count = Math.max(0, (entryCounts.value.get(key) ?? 0) - 1)
    entryCounts.value = new Map(entryCounts.value).set(key, count)
  }

  return { showGrid, selectable, draggable, canControl, phase, phaseLabels, phaseIndex, phaseNameOf, nextLabel, advance, movementAllowance,
    PHASE_SETUP, initPhase: startSidePhase, canPlaceReinforcementNow, canEnterHex, canEnterTerrain, spendMp, refundMp, resetMp, terrainCost, remainingMp, enemyZocSet, isEnemyOf, entrySurcharge, spendEntryCost, unspendEntryCost, wouldOverstack, canLeaveAfterEntering, canLeaveAfterReinforcementEntry, isOverstacked, stackedHexes, noteEntered, isZocFrozen, setPhase, setSpentMp, resetTurnState }
}
