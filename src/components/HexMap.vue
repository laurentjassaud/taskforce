<script setup>
// ═══════════════════════════════════════════════════════════════════════════
// HexMap.vue — carte hexagonale complète : toolbar, image + grille SVG
// cliquable, et panneau de calibration. Composant autonome : reçoit un
// `module` (la boîte de jeu — cf. public/modules/*.json) pour l'image et la
// géométrie de grille (cols/rows) et la calibration pixel de la grille
// (`map.calibration` — x0/y0/colStep/a/rowStep, complétée par
// DEFAULT_CALIBRATION de lib/calibration.js), ajustable en direct via
// CalibrationPanel.vue.
//
// SYSTÈME DE COORDONNÉES :
//  - "hex" (col, row) : coordonnées logiques de la grille, col 0-based,
//    row 1-based (cohérent avec le format imprimé sur la carte, ex. "0101").
//  - "pixel SVG" (x, y) : coordonnées dans le viewBox de l'image, calculées
//    via `calibration` (x0/y0 = centre du premier hex, colStep/rowStep = pas
//    entre hex, a = rayon horizontal). Colonnes IMPAIRES décalées de
//    +rowStep/2 vers le bas (grille flat-top, offset odd-q).
//  - Le zoom redimensionne le SVG en CSS ; le viewBox reste fixe en pixels
//    "image" — la mise à l'échelle est faite par le navigateur.
// ═══════════════════════════════════════════════════════════════════════════

import { reactive, ref, computed, toRef, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { t, mt, currentLocale } from '../i18n/index.js'
import { hexId, DEFAULT_CALIBRATION } from '../lib/calibration.js'
import { neighborsOf, hexDistance } from '../lib/hex.js'
import { pathToward } from '../lib/autoMove.js'
import { hexExists, removedHexSet } from '../lib/mapShape.js'
import { useAssisted } from '../lib/useAssisted.js'
import { useDebug } from '../lib/useDebug.js'
import { useModuleRules } from '../lib/moduleRules.js'
import { isUnit } from '../lib/units.js'
import { parseSetup, rangeCells } from '../lib/setup.js'
import { resolveRules, resolveTurnStructure, stackingLimitOf } from '../lib/rules.js'
import { sideOfStep, resolveTrack, sidesOfTurn, turnOfStep } from '../lib/turnTrack.js'
import { connectedGroups } from '../lib/navalCombat.js'
import CalibrationPanel from './CalibrationPanel.vue'
import Counter from './Counter.vue'
import TurnTracker from './TurnTracker.vue'
import JournalPanel from './JournalPanel.vue'
import SidePanel from './SidePanel.vue'
import ReinforcementsPanel from './ReinforcementsPanel.vue'
import EliminatedPanel from './EliminatedPanel.vue'
import SearchBagPanel from './SearchBagPanel.vue'
import ContextMenu from './ContextMenu.vue'
import Toast from './Toast.vue'
import StackPopup from './StackPopup.vue'
import FleetDisplayModal from './FleetDisplayModal.vue'
import TaskForceComposer from './TaskForceComposer.vue'
import RaidOddsModal from './RaidOddsModal.vue'
import NavalCombatModal from './NavalCombatModal.vue'
import RollModal from './RollModal.vue'
import GameEndModal from './GameEndModal.vue'
import PhaseBlockedModal from './PhaseBlockedModal.vue'
import BugReportModal from './BugReportModal.vue'
import InterfaceGuide, { guideSeen, markGuideSeen } from './InterfaceGuide.vue'
import { APP_VERSION, REPORT_ENTRIES } from '../lib/bugReport.js'
import MoveTimer from './MoveTimer.vue'
import LanguageSwitcher from './LanguageSwitcher.vue'

const props = defineProps({
  module: { type: Object, required: true }, // cf. src/modules/*.json — { boardGame, name, map: {...} }
  // Positions déjà déplacées depuis le setup du module (partie multijoueur en
  // cours) — { [counterId]: { col, row } }. Absent en solo/démo.
  initialPositions: { type: Object, default: () => ({}) },
  // Pas courant du suivi de tour déjà en cours (partie multijoueur reprise
  // en route) — cf. `turnTrack` ci-dessous. Absent (0) en solo/démo.
  initialTurnStep: { type: Number, default: 0 },
  // Phase déjà en cours (partie multijoueur reprise en route, cf.
  // server/src/rooms.js::recordPhase), ou `null` : phase de départ du camp
  // actif recalculée localement. Absent en solo/démo.
  initialPhase: { type: Number, default: null },
  // Temps déjà écoulé (ms) dans cette phase/ce pas côté serveur — reprise du
  // compteur du timing "Limité" (cf. MoveTimer.vue). 0 en solo/démo.
  initialPhaseElapsedMs: { type: Number, default: 0 },
  // Timing "Blitz" : temps de Mouvement déjà consommé par camp (ms) —
  // `{ [campKey]: ms }`, cf. server/src/rooms.js::recordPhase. {} en solo/démo.
  initialBlitzUsedMs: { type: Object, default: () => ({}) },
  // Timing "Blitz" : camp ayant déjà perdu au temps (partie en ligne
  // terminée, cf. server/src/rooms.js::recordGameOver), ou `null`.
  initialBlitzLoser: { type: String, default: null },
  // Ce qui a mis fin à la partie côté serveur : 'blitz' ou 'concede' (cf.
  // declareLoss).
  initialGameOverReason: { type: String, default: null },
  // Camp du joueur sur ce navigateur (multijoueur, cf. RoomLobby.vue) :
  // l'alerte "Temps imparti terminé" n'est montrée qu'au joueur actif.
  // Vide en solo/démo (un seul navigateur pour tous les camps).
  localSide: { type: String, default: '' },
  // Partie EN LIGNE (cf. RoomLobby.vue) : le journal est PARTAGÉ entre les
  // joueurs et conservé par le serveur (cf. `log`, applyRemoteEntry). Faux
  // en solo/démo : journal local, sauvegarde auto et reprise inchangés.
  online: { type: Boolean, default: false },
  // En ligne : journal partagé déjà enregistré par le serveur (ordre
  // chronologique), rejoué au montage pour reconstituer la partie.
  initialJournal: { type: Array, default: () => [] },
  // Identifiant court du module (ex. "coral-sea", cf. public/modules/index.json)
  // — sert uniquement à nommer les sauvegardes du journal (cf.
  // JournalPanel.vue::saveLabel). À défaut (non fourni par l'appelant), on
  // retombe sur `module.name`.
  moduleId: { type: String, default: '' },
  // Partie "Assistée" (cf. SoloHome.vue, param `party`) : variante
  // opt-in avec garde-fous (grille, sélection au clic, restriction de tour
  // — cf. lib/useAssisted.js). Comportement PAR DÉFAUT (`false`) : "Libre",
  // bac à sable sans garde-fous.
  assisted: { type: Boolean, default: false },
  // Réglages de la partie (mode, scénario, météo, timing — cf.
  // lib/journalStorage.js), enregistrés avec le journal pour qu'une reprise
  // se rejoue dans les mêmes conditions. `null` si inconnus (multijoueur).
  settings: { type: Object, default: null },
})

// `phase` : `{ phase, step, blitzUsed }` — changement de phase LOCAL sans changement de
// pas (cf. onPhaseNext), à répercuter aux autres joueurs (multijoueur).
// `game-over` : `{ loser, text, t, reason }` — un camp a perdu : au temps
// (Blitz, `reason` 'blitz') ou en concédant ('concede') — cf. declareLoss, à
// répercuter aux autres joueurs (multijoueur).
// En ligne uniquement (journal partagé, cf. `log`) :
//  - `log` : `{ uid, t, kind, text, data }` — entrée ajoutée localement ;
//  - `unlog` : uid d'une entrée retirée (retour arrière) ;
//  - `deploy` : `{ setup, turn }` — entrées `setup` et `turn` de départ
//    proposées au lancement (cf. startSharedJournal).
// `restart-with` : `{ settings, entries, message }` — un journal à reprendre
// a été joué avec d'autres réglages : la page doit relancer la partie avec
// eux (cf. DemoPlay.vue, JournalPanel.vue::startReplay).
const emit = defineEmits(['move', 'turn', 'phase', 'game-over', 'log', 'unlog', 'deploy', 'restart-with'])

const map = computed(() => props.module.map)

// --- Journal de partie : historique de tout ce qui se passe (cf.
// JournalPanel.vue, onglet du panneau latéral — toute la logique y vit).
// HexMap.vue se contente d'appeler `log(kind, text)` à chaque évènement de
// jeu (tour, déplacement, entrée en jeu, élimination...).
const journalRef = ref(null)
function log(kind, text, data) {
  logDeploymentOnce()
  const journal = journalRef.value
  if (!journal) return undefined
  if (!props.online) return journal.log(kind, text, data)
  // En ligne : chaque entrée porte un identifiant unique (`uid`, commun à
  // tous les navigateurs) et part au serveur, qui la conserve et la
  // transmet aux autres joueurs (cf. applyRemoteEntry).
  const id = journal.log(kind, text, data, newUid())
  const { uid, t } = journal.getEntry(id)
  emit('log', { uid, t, kind, text, data })
  return id
}
function newUid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

// --- Déploiement initial dans le journal : le placement de départ tire au
// hasard l'hex des unités à plage d'entrée (cf. `buildInitialCounters`). Sans
// trace de ce tirage, le rejeu en refaisait un autre et les unités jamais
// déplacées depuis changeaient de place. On l'enregistre donc, en PREMIÈRE
// entrée du journal (entrée `setup`, cf. applyReplayEntry) — au moment du
// premier évènement de la partie, et pas dès le chargement : écrire au
// chargement déclencherait l'auto-save et écraserait la sauvegarde qu'on
// propose justement de reprendre.
// En ligne, le déploiement est au contraire partagé DÈS le lancement (cf.
// onMounted, évènement `deploy`) : ce mécanisme-ci est alors désactivé.
let deploymentLogged = props.online
function logDeploymentOnce() {
  if (deploymentLogged || isReplaying.value || !journalRef.value) return
  deploymentLogged = true
  journalRef.value.log('setup', t('log.deployment'), deploymentData())
  // Puis le tour de départ (cf. `initialTurnEntry`) : TurnTracker.vue
  // l'annonce (évènement `change`) pendant son propre montage, AVANT que le
  // journal ne soit monté — onTurnChange ne peut donc pas l'inscrire, on le
  // rattrape ici, juste après le déploiement et avant le premier évènement.
  if (initialTurnEntry) journalRef.value.log(initialTurnEntry.kind, initialTurnEntry.text, initialTurnEntry.data)
}

/** Entrée de journal d'un changement de tour (cf. onTurnChange) — factorisée
 *  pour l'entrée du tour de DÉPART de la partie (cf. `initialTurnEntry`). */
function turnEntryOf(info) {
  // Piste à phases entremêlées (cf. lib/turnTrack.js) : chaque pas est une
  // phase d'un camp — dont le camp n'est pas encore connu si son ordre se
  // tire au dé (cf. `rollPhaseOrder`, qui l'inscrit juste après).
  const slot = turnTrackerRef.value?.currentSlot
  if (slot) {
    const phaseLabel = phaseNameOf(turnStructure.phases?.find((entry) => entry.id === slot.phase)?.step)
    const text = info.activeSideKey
      ? t('log.turnPhase', { turn: info.turn, phase: phaseLabel, side: sideLabel(info.activeSideKey) })
      : t('log.turnPhaseRoll', { turn: info.turn, phase: phaseLabel })
    return { kind: 'turn', text, data: { step: info.step } }
  }
  return { kind: 'turn', text: t('log.turn', { turn: info.turn, side: sideLabel(info.activeSideKey) }), data: { step: info.step } }
}
// Tour en cours au lancement de la partie, figé au montage (cf. onMounted —
// `turnInfo` est alors déjà renseigné par TurnTracker.vue), pour être inscrit
// au journal avec le déploiement (en local, cf. logDeploymentOnce) ou
// partagé avec lui (en ligne, cf. startSharedJournal). `null` sans piste de
// tour.
let initialTurnEntry = null

// --- Retour arrière : annule le dernier déplacement d'un pion déjà posé sur
// la carte (onHex / onCounterDragEnd ci-dessous) et efface son entrée de
// journal correspondante. Ne couvre volontairement que les déplacements —
// pas les entrées en jeu, éliminations, etc., qui ont leurs propres
// mécanismes de retour (menu contextuel "Replacer le pion").
// L'historique ne vaut que pour la phase de Mouvement EN COURS : il est vidé
// à chaque changement de phase (cf. watcher de `phase`) et de tour (cf.
// `clearAllMoved`) — sans quoi, au tour suivant, l'adversaire pouvait
// annuler le dernier mouvement du joueur précédent.
const moveHistory = ref([])
function pushMoveHistory(counterId, from, to, journalId, enteredFrom = null) {
  if (journalId == null) return
  moveHistory.value.push({ counterId, from, to, journalId, enteredFrom })
}

// --- Côté d'entrée dans l'hex : `counter.enteredFrom` = id ("CCRR") de l'hex
// d'où le pion est entré dans son hex actuel, ou `null` (posé là, ou présent
// depuis le début). Gardé d'un tour sur l'autre jusqu'au mouvement suivant :
// dans un hex coupé par une île, il décide des côtés par lesquels le pion
// peut ressortir (cf. lib/passages.js, lib/useAssisted.js::canEnterTerrain).
// Tenu à jour au déplacement (cf. onHex), à son annulation (cf.
// undoLastMove/cancelMovement) et au rejeu (cf. applyRemoteMove).
function entryFromMove(from, to) {
  return from && hexDistance(from, to) === 1 ? hexId(from.col + 1, from.row) : null
}

// --- Liseré orange "a bougé ce tour" : un pion déplacé (clic ou glisser,
// cf. onHex / onCounterDragEnd / applyRemoteMove) rejoint `movedThisTurnIds`
// et sa position de départ (avant son PREMIER mouvement du tour) est gardée
// dans `turnStartPositions`, pour que "Annuler le mouvement" (menu
// contextuel, cf. onCounterContextMenu) puisse le ramener d'un coup à cette
// position quel que soit le nombre de déplacements intermédiaires. Les deux
// sont vidés à chaque changement de tour (cf. onTurnChange) : "à la fin du
// tour du joueur, tous les liserés sont enlevés".
const movedThisTurnIds = ref(new Set())
const turnStartPositions = new Map()
function markMoved(counterId, from, enteredFrom = null) {
  const key = String(counterId)
  noteAutoMoveTrail(counterId, from)
  // Le côté d'entrée d'avant le premier mouvement est gardé avec la position
  // de départ : "Annuler le mouvement" le rétablit (cf. cancelMovement).
  if (!turnStartPositions.has(key)) turnStartPositions.set(key, { ...from, enteredFrom })
  movedThisTurnIds.value.add(key)
  movedThisTurnIds.value = new Set(movedThisTurnIds.value)
}
// --- Traces des pions à hex-objectif (cf. `runAutoMoves`) : id (chaîne) ->
// liste de segments `{ step, points: [{ col, row }] }`, un segment par pas de
// la piste de tour où le pion a bougé. Gardées toute la partie, affichées en
// mode debug (cf. lib/useDebug.js::autoMoveTrailLines). Une position déjà
// présente dans le segment en cours (retour arrière, "Annuler le
// mouvement") le tronque jusqu'à elle.
const autoMoveTrails = ref(new Map())
function noteAutoMoveTrail(counterId, from) {
  const counter = counters.value.find((candidate) => String(candidate.id) === String(counterId))
  if (!counter || !moduleRules.autoMoveTarget(counter)) return
  const key = String(counterId)
  const step = turnTrackerRef.value?.currentStep ?? 0
  const position = { col: counter.col, row: counter.row }
  const same = (a, b) => a.col === b.col && a.row === b.row
  const trail = [...(autoMoveTrails.value.get(key) ?? [])]
  let segment = trail[trail.length - 1]
  if (!segment || segment.step !== step) {
    const start = segment ? segment.points[segment.points.length - 1] : (from ?? position)
    segment = { step, points: [start] }
    trail.push(segment)
  } else {
    segment = { step, points: [...segment.points] }
    trail[trail.length - 1] = segment
  }
  const seen = segment.points.findIndex((point) => same(point, position))
  if (seen >= 0) segment.points.splice(seen + 1)
  else segment.points.push(position)
  if (segment.points.length < 2) trail.pop()
  autoMoveTrails.value = new Map(autoMoveTrails.value).set(key, trail)
}

function clearMoved(counterId) {
  const key = String(counterId)
  turnStartPositions.delete(key)
  if (movedThisTurnIds.value.delete(key)) movedThisTurnIds.value = new Set(movedThisTurnIds.value)
  // Un pion dont le mouvement est entièrement annulé (cf. cancelMovement/
  // undoLastMove, seuls appelants) n'a, de fait, plus bougé ce tour-ci : le
  // verrou de sélection ci-dessous (cf. `lockedFromSelectionIds`, qui ne se
  // justifie QUE par un mouvement réellement effectué) ne tient plus non plus.
  if (lockedFromSelectionIds.value.delete(key)) lockedFromSelectionIds.value = new Set(lockedFromSelectionIds.value)
}
// Liseré AFFICHÉ seulement pendant la phase Mouvement (ou en partie Libre,
// sans phases : `phase` vaut `null`) : dès la phase suivante, il disparaît
// de la carte. `movedThisTurnIds` reste, lui, intact jusqu'au changement de
// tour (verrou de sélection, rejeu).
const showMovedRings = computed(() => phase.value === null || phase.value === 0)
function clearAllMoved() {
  turnStartPositions.clear()
  movedThisTurnIds.value = new Set()
  lockedFromSelectionIds.value = new Set()
  // Nouveau tour/camp : plus rien à annuler du tour écoulé (cf. `moveHistory`).
  moveHistory.value = []
}

// --- Verrouillage d'une unité après désélection (mouvement normal) --------
// Une unité qui a bougé ce tour-ci (cf. `movedThisTurnIds`) et qui est
// ENSUITE désélectionnée — qu'on la reclique pour la désélectionner, ou
// qu'on sélectionne autre chose à sa place — ne peut PLUS être resélectionnée
// ce même tour : son mouvement est alors considéré comme définitivement
// terminé (cf. onCounterSelect). Remis à zéro en même temps que
// `movedThisTurnIds` (cf. `clearAllMoved` ci-dessus) : une unité verrouillée
// un tour redevient sélectionnable normalement au tour suivant.
const lockedFromSelectionIds = ref(new Set())

// Avertissement "mouvement non terminé" (cf. setSelectedCounter ci-dessous) :
// `{ key, hex, units }` de l'hex en overstack, ou `null` (modale fermée).
const unitStackBlock = ref(null)

/** SEUL point d'entrée pour changer `selectedCounterId` — verrouille au
 *  passage l'ANCIEN pion sélectionné (cf. `lockedFromSelectionIds` ci-dessus)
 *  s'il avait bougé ce tour-ci, avant de basculer la sélection sur `id` (ou
 *  `null`, pour une simple désélection sans rien sélectionner à la place).
 *
 *  REFUSE le changement (renvoie `false`, sélection inchangée, modale
 *  d'avertissement ouverte) si l'ancien pion est en OVERSTACK — il partage
 *  son hex avec une unité amie (cf. lib/useAssisted.js::isOverstacked) : on
 *  ne peut pas terminer son mouvement là, ni passer à une autre unité avant
 *  de l'avoir déplacé (ou d'avoir annulé son mouvement). Renvoie `true`
 *  sinon. */
function setSelectedCounter(id) {
  const previous = selectedCounterId.value
  if (previous != null && previous !== id) {
    const prev = counters.value.find((counter) => String(counter.id) === String(previous))
    if (isOverstacked(prev)) {
      const units = counters.value.filter((counter) => counter.col === prev.col && counter.row === prev.row && isUnit(counter))
      unitStackBlock.value = { key: prev.col + ',' + prev.row, hex: hexId(prev.col + 1, prev.row), units: units.map((unit) => unit.name) }
      return false
    }
  }
  if (previous != null && previous !== id && movedThisTurnIds.value.has(String(previous))) {
    lockedFromSelectionIds.value = new Set(lockedFromSelectionIds.value).add(String(previous))
  }
  selectedCounterId.value = id
  return true
}
/** Menu contextuel "Annuler le mouvement" (cf. onCounterContextMenu) : remet
 *  le pion à sa position de début de tour, en une seule fois. */
function cancelMovement(id) {
  const key = String(id)
  const start = turnStartPositions.get(key)
  if (!start) return
  const counter = counters.value.find((counter) => String(counter.id) === String(id))
  if (counter) {
    // cf. lib/useAssisted.js::resetMp — annule d'un coup TOUS les
    // déplacements du tour de `c` (pas hex par hex comme `undoLastMove`
    // ci-dessous), donc on lui redonne la TOTALITÉ de ses MP plutôt que de
    // recréditer un seul hex. Ne fait rien hors mode Assisté.
    resetMp(counter)
    counter.col = start.col; counter.row = start.row
    counter.enteredFrom = start.enteredFrom ?? null
    noteAutoMoveTrail(counter.id)
    emit('move', { counterId: counter.id, col: counter.col, row: counter.row })
    log('move', t('log.moveCancelled', { unit: counter.name, hex: hexId(counter.col + 1, counter.row) }) + mpText(counter),
      { counterId: counter.id, col: counter.col, row: counter.row, mp: spentMpOf(counter), enteredFrom: counter.enteredFrom })
  }
  clearMoved(id)
}

// --- Retour arrière (bouton de la barre d'outils) : disponible UNIQUEMENT
// en mode Assisté (cf. `v-if="assisted"` sur le bouton plus bas) — en mode
// Libre, aucun garde-fou de tour/MP n'existe, "annuler" un glisser-déposer
// libre n'aurait pas vraiment de sens dans un bac à sable — et seulement en
// phase Mouvement (cf. `moveHistory`) : passé cette phase, les déplacements
// sont acquis.
function undoLastMove() {
  if (!props.assisted || inputLocked.value || phase.value !== 0) return
  const last = moveHistory.value.pop()
  if (!last) return
  const counter = counters.value.find((counter) => String(counter.id) === String(last.counterId))
  if (counter) {
    // cf. lib/useAssisted.js::refundMp — recrédite le coût de l'hex QUITTÉ
    // par cette annulation (`last.to`, celui que `c` avait payé pour y
    // entrer EN VENANT de `last.from`), avant même de replacer `c` : l'ordre
    // n'a pas d'importance ici (refundMp ne regarde que les hex passés en
    // paramètre, pas la position courante de `c`). `last.to`/`last.from`
    // sont au format `{ col, row }` (comme tout `moveHistory`/position de
    // pion) — `terrainCost` attend `{ c, r }` (comme les hex de clic, cf.
    // onHex/hexes). Passer `last.from` ici (le MÊME "from" qu'au `spendMp`
    // d'origine, cf. onHex) garantit un remboursement exact, même si `c` a
    // depuis quitté cette position.
    refundMp(counter, { c: last.to.col, r: last.to.row }, { c: last.from.col, r: last.from.row })
    counter.col = last.from.col; counter.row = last.from.row
    counter.enteredFrom = last.enteredFrom ?? null
    noteAutoMoveTrail(counter.id)
    emit('move', { counterId: counter.id, col: counter.col, row: counter.row })
    // Si l'annulation ramène le pion à sa position de tout début de tour,
    // il n'a plus "bougé ce tour" au sens du liseré orange.
    const start = turnStartPositions.get(String(counter.id))
    if (start && start.col === counter.col && start.row === counter.row) clearMoved(counter.id)
  }
  if (props.online) {
    const uid = journalRef.value?.getEntry(last.journalId)?.uid
    if (uid) emit('unlog', uid)
  }
  journalRef.value?.remove(last.journalId)
}

// --- Dé : widget flottant non-bloquant (cf. RollModal.vue), toujours monté
// (v-show, pas v-if, pour conserver sa position glissée et son état pendant
// qu'il est caché) — résultat journalisé à chaque lancer. Mode Libre
// UNIQUEMENT (widget et bouton "Cacher/Afficher le dé" absents en mode
// Assisté, cf. template) : en mode Assisté, les jets sont faits par l'appli
// elle-même là où la règle en demande un (cf. `rollPhaseOrder`).
const showRollModal = ref(true)
function onDiceRoll(value) { log('dice', t('log.dice', { value })) }

// --- Lecteur de rejeu : rejoue sur la carte les actions d'un journal
// chargé (cf. JournalPanel.vue::onFileChosen, évènement `loaded`) — un
// bouton lecture façon lecteur audio avance d'une ligne à chaque clic,
// un bouton avance rapide saute directement à la fin. `isReplaying` coupe
// le ré-enregistrement le temps d'appliquer un pas (cf. onTurnChange plus
// haut) : les entrées rejouées existent déjà dans le fichier chargé, les
// rejouer ne doit faire bouger que la carte, pas dupliquer le journal. Le
// détail de l'application de chaque type d'entrée (`applyReplayEntry`) vit
// plus bas, une fois `applyRemoteMove`/`applyRemoteTurn` déclarées.
const replayEntries = ref([])   // [{ kind, text, data }] — ordre chronologique
const replayIndex = ref(0)      // nombre d'entrées déjà appliquées à la carte
const isReplaying = ref(false)  // vrai le temps d'appliquer un pas

// --- Suivi de tour : piste de `turns` tours, chacun joué par les camps de
// `order` dans cet ordre (ex. ["ijn","usn"] -> Tour 1 Japonais, Tour 1
// Américains, Tour 2 Japonais, ...). Toute la logique (pas courant, camp actif,
// restriction de contrôle) vit dans TurnTracker.vue, autonome — HexMap.vue ne
// garde qu'un miroir léger (`turnInfo`, mis à jour via `change`) pour ses
// propres besoins ailleurs et délègue `canControl`/`applyRemoteTurn` au composant enfant (cf. ref
// `turnTrackerRef`).
const turnTrackerRef = ref(null)
const turnInfo = ref({ step: props.initialTurnStep, turn: 1, activeSideKey: null, activeFactions: null })
// Est-ce au joueur de CE navigateur de jouer ? Toujours vrai en solo/démo
// (`localSide` vide : un seul navigateur pour tous les camps). En ligne, les
// autres joueurs ne peuvent ni changer de phase ni passer au tour suivant
// (bouton de TurnTracker.vue désactivé, cf. template), et seul le joueur
// actif reçoit l'alerte "Temps imparti terminé" (cf. onMoveTimeUp).
const isLocalTurn = computed(() => !props.localSide || props.localSide === turnInfo.value.activeSideKey)
function onTurnChange(info) {
  turnInfo.value = info
  // Fin du tour du joueur précédent : tous les liserés "a bougé ce tour"
  // sont enlevés (cf. `movedThisTurnIds`). Pas pendant un rejeu : c'est
  // alors applyReplayEntry (entrée `turn`) qui s'en charge, de façon
  // SYNCHRONE — cet évènement-ci arrive en différé (watcher de
  // TurnTracker.vue), et, lors d'une avance rapide, il effacerait après coup
  // les mouvements du tour en cours que le rejeu vient de rétablir.
  if (!isReplaying.value) clearAllMoved()
  // Ne pas ré-écrire dans le journal un changement de tour provoqué par le
  // lecteur de rejeu (cf. plus bas) — l'entrée existe déjà dans le fichier
  // chargé, la rejouer ne doit que faire bouger la carte, pas dupliquer le
  // journal.
  if (isReplaying.value) return
  // Le tour de DÉPART n'est jamais inscrit ici mais avec le déploiement (cf.
  // `initialTurnEntry`) : au montage, le journal n'existe pas encore, et
  // l'inscrire plus tard déclencherait l'auto-save qui écraserait la
  // sauvegarde proposée en reprise (cf. logDeploymentOnce).
  if (info.step === props.initialTurnStep) return
  // En ligne, seul le navigateur qui a fait avancer le tour l'inscrit au
  // journal partagé ; les autres le reçoivent (cf. applyRemoteEntry).
  if (props.online && info.step !== localTurnStep) return
  if (info.step === lastLoggedTurnStep) return
  lastLoggedTurnStep = info.step
  const entry = turnEntryOf(info)
  log(entry.kind, entry.text, entry.data)
}
// Dernier pas inscrit au journal par onTurnChange : `change` repart aussi
// quand seul le camp actif change sur le même pas (ordre tiré au dé, cf.
// `rollPhaseOrder`), qui ne doit pas réinscrire le tour.
let lastLoggedTurnStep = null
// Dernier pas atteint par une avance LOCALE (cf. onTurnChange, en ligne).
let localTurnStep = null
function onTurnAdvance(step) {
  localTurnStep = step
  emit('turn', step)
}
function applyRemoteTurn(step) { turnTrackerRef.value?.applyRemoteTurn(step) }
// Un renfort ne peut entrer en jeu qu'à partir de son tour d'arrivée déclaré
// (`c.turn`, cf. module JSON) — jamais en avance. Par défaut (pas de `turn`
// déclaré), l'unité arrive dès le tour 1.
const canEnterThisTurn = (counter) => (counter?.turn ?? 1) <= turnInfo.value.turn

// Calibration déclarée par le module (`map.calibration`), complétée par le
// repli du moteur — et base du bouton "réinitialiser défauts".
const moduleCalibration = { ...DEFAULT_CALIBRATION, ...(map.value.calibration ?? {}) }
const calibration = reactive({ ...moduleCalibration })
const gridStyle = reactive({ stroke: '#d11a1a', width: 1.5, opacity: 0 })
const mapConfig = reactive({ cols: map.value.cols, rows: map.value.rows })

const zoom = ref(0.5)
// `showGrid` vient de useAssisted() plus bas (verrouillé à false hors mode
// assisté).
const showLabels = ref(false)
const showCalib = ref(false)
const showCounters = ref(true)

// Forme réelle de la grille (colonnes décalées amputées d'une ligne, hexs
// ponctuels absents) — cf. lib/mapShape.js — recalculée seulement quand le
// module ou le nombre de cols/rows édité via CalibrationPanel change.
const mapShapeCfg = computed(() => ({
  cols: mapConfig.cols, rows: mapConfig.rows, evenColMinus: map.value.evenColMinus,
}))
const removed = computed(() => removedHexSet(map.value))
const hexOnMap = (col, row) => hexExists(col, row, mapShapeCfg.value, removed.value)

/** Liste des hex de la grille avec leur polygone SVG déjà calculé. */
const hexes = computed(() => {
  const { x0, y0, colStep, a: hexRadius, rowStep } = calibration
  const halfRowStep = rowStep / 2
  const out = []
  for (let col = 0; col < mapConfig.cols; col++) {
    const cx = x0 + col * colStep
    const yoff = col % 2 === 1 ? rowStep / 2 : 0
    for (let row = 1; row <= mapConfig.rows; row++) {
      if (!hexOnMap(col, row)) continue
      const cy = y0 + (row - 1) * rowStep + yoff
      const pts = [
        [cx - hexRadius, cy], [cx - hexRadius / 2, cy - halfRowStep], [cx + hexRadius / 2, cy - halfRowStep],
        [cx + hexRadius, cy], [cx + hexRadius / 2, cy + halfRowStep], [cx - hexRadius / 2, cy + halfRowStep],
      ].map((point) => point[0].toFixed(1) + ',' + point[1].toFixed(1)).join(' ')
      out.push({ id: hexId(col + 1, row), c: col, r: row, cx, cy, pts })
    }
  }
  return out
})

// Tous les pions déclarés par le module, toutes factions confondues (cf.
// public/modules/coral-sea/coral-sea.json -> counters.*) — sert à la fois au
// placement initial ci-dessous et à la liste des renforts pas encore posés
// (cf. `reinforcements`).
const allCounters = computed(() => Object.values(props.module.counters || {}).flat())

// --- Pions en nombre illimité (`multiple: true`, ex. leurres américains de
// la mer de Corail) : le pion du module n'est qu'un MODÈLE, qui reste dans le
// panneau ; chaque pose crée un exemplaire d'id "<id du modèle>#<n>". Le
// journal ne garde que cet id : `counterDefinition` retrouve le modèle pour
// recréer l'exemplaire au rejeu ou en ligne.
const INSTANCE_SEP = '#'
function counterDefinition(id) {
  const key = String(id)
  const declared = allCounters.value.find((counter) => String(counter.id) === key)
  if (declared) return declared
  const cut = key.lastIndexOf(INSTANCE_SEP)
  if (cut === -1) return null
  const template = allCounters.value.find((counter) => String(counter.id) === key.slice(0, cut))
  return template?.multiple ? { ...template, id: key, templateId: template.id } : null
}
/** Le pion à poser pour le renfort `reinforcement` : lui-même, ou un nouvel
 *  exemplaire s'il est en nombre illimité. */
function instanceOf(reinforcement) {
  if (!reinforcement?.multiple) return reinforcement
  const prefix = String(reinforcement.id) + INSTANCE_SEP
  const used = [...counters.value.map((counter) => String(counter.id)), ...eliminatedIds.value]
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)) || 0)
  return { ...reinforcement, id: prefix + (Math.max(0, ...used) + 1), templateId: reinforcement.id }
}

/** Un hex cible tiré au hasard parmi ceux du `setup` du pion (cf.
 *  lib/setup.js::rangeCells — toute la plage pour un "CCRR-CCRR", l'hex de
 *  référence sinon) — utilisé uniquement pour le placement initial
 *  automatique au chargement (cf. `counters` ci-dessous), pas pour l'arrivée
 *  interactive d'un renfort (cf. plus bas : glisser-déposer libre ou choix
 *  explicite d'un hex surligné). Si `occupied` (Set "col,row" des hex déjà
 *  PLEINS, cf. `buildInitialCounters`) est fourni, le tirage se fait d'abord
 *  parmi les autres hex de la plage — sans quoi, avec une limite
 *  d'empilement de 1, plusieurs pions d'une même plage se percutaient et
 *  débordaient hors de la bande via `pickArrivalHex`. */
function resolveEntryTarget(setup, occupied = null) {
  const cells = rangeCells(parseSetup(setup), hexOnMap)
  const free = occupied ? cells.filter((cell) => !occupied.has(cell.col + ',' + cell.row)) : []
  const candidates = free.length ? free : cells
  return candidates[Math.floor(Math.random() * candidates.length)]
}

/** Jamais de stacking : un pion qui arrive prend son hex d'entrée s'il est
 *  libre, sinon un des 6 hex adjacents libres tiré au hasard. `occupied` est
 *  le Set (clés "col,row") des hex déjà réservés dans le lot de placement en
 *  cours — mis à jour par l'appelant après chaque choix. Si les 7 emplacements
 *  sont pleins (cas limite), on stack quand même plutôt que de perdre le pion. */
function pickArrivalHex(col, row, occupied) {
  const key = (keyCol, keyRow) => keyCol + ',' + keyRow
  if (hexOnMap(col, row) && !occupied.has(key(col, row))) return { col, row }
  const free = neighborsOf(col, row).filter((neighbor) => hexOnMap(neighbor.col, neighbor.row) && !occupied.has(key(neighbor.col, neighbor.row)))
  if (free.length) return free[Math.floor(Math.random() * free.length)]
  return { col, row }
}

// Paramètres des règles génériques déclarés par le module (`module.rules`,
// cf. lib/rules.js) : empilement, ZOC, congestion d'entrée.
const rules = resolveRules(props.module.rules)
// Structure du tour : phases déclarées par le module (`module.turnStructure`,
// cf. lib/rules.js et lib/useAssisted.js, "Phases").
const turnStructure = resolveTurnStructure(props.module.turnStructure)

// Règles PARTICULIÈRES au module joué (cf. lib/moduleRules.js, registre par
// module — ex. lib/useCoralSea.js) : tout ce qui ne vaut QUE pour une boîte de
// jeu précise et qu'aucun champ du JSON ne sait exprimer. Pour un module qui
// n'en déclare pas, chaque règle renvoie `null` et le moteur générique
// ci-dessous s'applique tel quel.
const moduleRules = useModuleRules(toRef(props, 'moduleId'), {
  terrain: props.module.terrain,
  // Tous les pions du module (cf. lib/useCoralSea.js, tirage des leurres).
  allCounters: () => allCounters.value,
  // Scénario joué et catalogues de navires (cf. lib/moduleLoader.js) : de
  // quoi composer les task forces (cf. lib/useCoralSea.js, formations).
  scenario: (props.module.scenarios ?? []).find((scenario) => scenario.id === props.settings?.scenario)
    ?? props.module.scenarios?.[0] ?? null,
  fleets: props.module.fleetCatalog ?? {},
  // Catalogues d'avions : groupes aériens des porte-avions (cf. lib/airGroups.js).
  air: props.module.airCatalog ?? {},
  // Tableaux de la frappe aéronavale (cf. lib/airStrike.js).
  airStrike: props.module.airStrike ?? null,
  // Tableau du combat de surface (cf. lib/navalCombat.js).
  navalCombat: props.module.navalCombat ?? null,
  // Piste de tour : ses nuits (cf. lib/useCoralSea.js, task forces connues).
  turnTrack: props.module.turnTrack ?? null,
})

// Étiquette secrète d'un pion (cf. `moduleRules.privateLabel` — ex. vraie
// identité d'un leurre japonais, lib/useCoralSea.js) : en mode debug
// seulement, et au seul camp qui la connaît — en ligne, à ce joueur-là ; en
// local (un seul écran), le temps de son tour seulement.
const privateLabelVisible = computed(() => {
  const side = moduleRules.privateLabelSide
  if (!side || !debug.value) return false
  return props.online ? props.localSide === side : turnInfo.value.activeSideKey === side
})
function privateLabelOf(counter) {
  return privateLabelVisible.value ? moduleRules.privateLabel(counter) : null
}

// Marqueurs / unités : cf. lib/units.js (`isUnit`, importé plus haut) —
// seule définition de ce qu'est une "vraie unité" pour tout le moteur.

// Un pion est posé sur la carte au chargement s'il a un `setup` (hex de
// départ) ET arrive au tour 1 (ou sans `turn` — rétrocompatible avec les
// pions sans ce champ, ex. une garnison fixe). C'est la règle GÉNÉRIQUE,
// valable pour tout module.
// Un module peut la restreindre via ses règles particulières (cf.
// lib/useCoralSea.js::autoPlacesAtLoad — la mer de Corail ne pose au coup
// d'envoi que les 12 leurres japonais). La règle du module
// renvoie `null` quand elle ne se prononce pas — y compris, toujours, sur
// les autres modules — et on retombe alors sur la règle générique.
// Les renforts restants (tous tours/factions confondus) restent hors carte,
// glissables depuis le panneau "Renfort ..." (cf. `reinforcements`).
// Plusieurs pions peuvent partager la même plage d'entrée (ex. les 12
// leurres japonais) : pickArrivalHex les répartit pour éviter le stacking
// (les marqueurs, eux, ignorent complètement cette logique — cf. isUnit).
function autoPlacesAtLoad(counter) {
  const special = moduleRules.autoPlacesAtLoad(counter)
  if (special !== null) return special
  return (counter.turn ?? 1) === 1
}
/** Placement initial du module — extrait en fonction pour être rejouable
 *  (cf. `resetBoardForReplay` plus bas), pas seulement au montage. Utilise
 *  `resolveEntryTarget`/`pickArrivalHex`, qui tirent au hasard un hex parmi
 *  la plage `setup` : rejouer ne reproduit donc pas exactement le tirage
 *  aléatoire d'origine pour les pions jamais déplacés depuis (non
 *  journalisé) — sans conséquence pour ceux qui bougent, puisque chaque
 *  `move`/`place` rejoué fixe une position absolue. */
function buildInitialCounters() {
  // Hex PLEINS au regard de la limite d'empilement du module, camp par camp
  // (cf. lib/rules.js::stackingLimitOf) — seuls ceux-là sont évités.
  const unitsPerHex = new Map()
  const occupiedBySide = new Map()
  const placed = []
  // Un pion à poser "n'importe où" (`setup` "*") ne l'est jamais d'office.
  for (const counter of allCounters.value.filter((counter) => parseSetup(counter.setup) && parseSetup(counter.setup).kind !== 'anywhere' && autoPlacesAtLoad(counter))) {
    const side = sideOfCounter(counter)
    if (!occupiedBySide.has(side)) occupiedBySide.set(side, new Set())
    const occupied = occupiedBySide.get(side)
    const override = props.initialPositions[counter.id]
    const target = resolveEntryTarget(counter.setup, isUnit(counter) ? occupied : null)
    const pos = override ?? (isUnit(counter) ? pickArrivalHex(target.col, target.row, occupied) : target)
    if (isUnit(counter)) {
      const key = side + '|' + pos.col + ',' + pos.row
      const count = (unitsPerHex.get(key) ?? 0) + 1
      unitsPerHex.set(key, count)
      if (count >= stackingLimitOf(rules, side)) occupied.add(pos.col + ',' + pos.row)
    }
    placed.push({ ...counter, ...pos })
  }
  // Groupes du module (escortes collées à leur task force, cf.
  // lib/useCoralSea.js) : sauf positions imposées (partie en ligne).
  if (!Object.keys(props.initialPositions).length) moduleRules.arrangeInitialPositions(placed, setupAdjacentHexes)
  return placed
}

/** Hex adjacents à (`col`, `row`) où poser `counter` au déploiement : sur la
 *  carte, et dans sa plage `setup` s'il y en a. */
function setupAdjacentHexes(counter, col, row) {
  const around = neighborsOf(col, row).filter((hex) => hexOnMap(hex.col, hex.row))
  const zone = counter.setup ? rangeCells(parseSetup(counter.setup), hexOnMap) : []
  const inZone = around.filter((hex) => zone.some((cell) => cell.col === hex.col && cell.row === hex.row))
  return inZone.length ? inZone : around
}

/** Hex adjacents à (`col`, `row`) où `counter` peut aller en cours de
 *  partie : sur la carte et praticables (terrain, cf. `canEnterTerrain`). */
function playAdjacentHexes(counter, col, row) {
  return neighborsOf(col, row).filter((hex) => hexOnMap(hex.col, hex.row)
    && canEnterTerrain({ ...counter, col, row, enteredFrom: null }, { c: hex.col, r: hex.row }, { c: col, r: row }))
}
const counters = ref(buildInitialCounters())
// Positions de départ de CETTE partie (cf. `logDeploymentOnce`), capturées
// avant tout mouvement.
const initialDeployment = counters.value.map((counter) => ({ id: counter.id, col: counter.col, row: counter.row }))
/** Données de l'entrée `setup` du journal : positions de départ et, le cas
 *  échéant, tirage secret du module (cf. lib/useCoralSea.js, identité des
 *  leurres). */
function deploymentData() {
  const secrets = moduleRules.setupSecrets()
  return secrets ? { positions: initialDeployment, secrets } : { positions: initialDeployment }
}

// cf. lib/useAssisted.js — toute la logique propre au mode "Assisté"
// (grille, sélection au clic, restriction de tour, phases, MP/arêtes/ZOC,
// empilement) y vit. Appelé ICI (et pas plus haut dans le fichier) parce
// qu'il a besoin de `counters` (cf. `enemyZocSet`, qui doit savoir où sont
// les pions ennemis) — lequel doit donc déjà être déclaré.
const { showGrid, selectable, draggable, canControl, phase, phaseLabels, phaseIndex, phaseNameOf, nextLabel, advance, nextPhaseOf, movementAllowance,
  PHASE_SETUP, initPhase, canPlaceReinforcementNow, canEnterHex, canEnterTerrain, spendMp, refundMp, resetMp, terrainCost, remainingMp, enemyZocSet, isEnemyOf, entrySurcharge, spendEntryCost, unspendEntryCost, wouldOverstack, canLeaveAfterEntering, canLeaveAfterReinforcementEntry, isOverstacked, stackedHexes, noteEntered, isZocFrozen, setPhase, setSpentMp, resetTurnState } = useAssisted(toRef(props, 'assisted'), turnTrackerRef, props.module.terrain, counters, props.module.sides, hexOnMap, rules, turnStructure, moduleRules)

/** Camp (clé de `module.sides`) de l'unité `counter` — sa faction à défaut
 *  de `sides`. */
function sideOfCounter(counter) {
  const sides = props.module.sides
  if (!counter) return null
  if (!sides) return counter.faction ?? null
  return Object.keys(sides).find((side) => sides[side]?.includes(counter.faction)) ?? null
}

/** Total de MP déjà dépensés par `c` pendant ce tour-ci (cf.
 *  lib/useAssisted.js::remainingMp), ou `null` pour un pion sans potentiel
 *  de mouvement (ou hors mode Assisté). Enregistré dans le journal (champ
 *  `mp` des entrées `move`/`place`) pour qu'une partie sauvegardée en pleine
 *  phase de Mouvement retrouve ses MP au rejeu (cf. applyReplayEntry). */
function spentMpOf(counter) {
  const left = remainingMp(counter)
  return left == null ? null : movementAllowance(counter) - left
}

/** Suffixe "(MP 3/6)" ajouté au texte d'un déplacement dans le journal —
 *  vide pour un pion sans potentiel de mouvement. */
function mpText(counter) {
  const spent = spentMpOf(counter)
  return spent == null ? '' : ` (MP ${spent}/${movementAllowance(counter)})`
}

// Nom d'une phase dans la langue courante (cf. src/i18n, `phases`, ou les
// phases propres au module — useAssisted.js::phaseNameOf).
const phaseName = (step) => phaseNameOf(step)

// --- Signaler un bug (cf. BugReportModal.vue, lib/bugReport.js) : état du
// jeu capturé au clic sur le bouton — `{ snapshot, game, context }` — ou `null`
// (modale fermée). Toujours accessible, même pendant un rejeu ou le tour
// adverse : un bug peut se signaler à tout moment.
const bugReport = ref(null)

/** Export joint au rapport : de quoi comprendre, et si possible rejouer, la
 *  situation — pas, phase, position de chaque pion ("id@CCRR"), unités
 *  éliminées, et les `REPORT_ENTRIES` derniers coups du
 *  journal avec leurs données (cf. applyReplayEntry). */
function bugReportSnapshot() {
  const entries = journalRef.value?.toChronological() ?? []
  return {
    app: APP_VERSION,
    module: props.moduleId || props.module.name,
    settings: props.settings,
    online: props.online,
    localSide: props.localSide || null,
    step: turnInfo.value.step,
    turn: turnInfo.value.turn,
    side: turnInfo.value.activeSideKey,
    phase: phase.value,
    positions: counters.value.map((counter) => `${counter.id}@${hexId(counter.col + 1, counter.row)}`),
    eliminated: [...eliminatedIds.value],
    entries: entries.slice(-REPORT_ENTRIES),
  }
}

/** Bouton "Signaler un bug" : capture l'état du jeu et ouvre la modale. */
function openBugReport() {
  const settings = Object.entries(props.settings ?? {})
    .filter(([, value]) => value !== '' && value != null)
    .map(([key, value]) => `${key} ${value}`).join(' · ')
  const currentPhaseName = phaseName(phase.value)
  const side = turnInfo.value.activeSideKey
  bugReport.value = {
    snapshot: bugReportSnapshot(),
    game: journalRef.value?.gameFile() ?? null,
    context: [
      ['Module', `${props.module.name} (${props.moduleId || '?'})`],
      ['Réglages', settings || 'inconnus'],
      ['Situation', `tour ${turnInfo.value.turn}${side ? ` — ${sideLabel(side)}` : ''}, phase ${currentPhaseName}`],
      ['Partie', props.online ? `en ligne${props.localSide ? `, camp ${sideLabel(props.localSide)}` : ''}` : 'locale'],
      ['Page', `${location.pathname}${location.search}`],
    ],
  }
}
// --- Guide de l'interface (cf. InterfaceGuide.vue) : ouvert d'office la
// première fois qu'on arrive sur une partie sur ce navigateur, puis par le
// bouton "?" de la barre d'outils. Marqué comme vu dès sa fermeture.
const showGuide = ref(!guideSeen())

function closeGuide() {
  showGuide.value = false
  markGuideSeen()
}
// Avertissement "changement de phase refusé" (cf. PhaseBlockedModal.vue) —
// ouvert par onPhaseNext ci-dessous, qui refuse de quitter la phase
// Mouvement avec des unités empilées.
const showPhaseBlocked = ref(false)
// Fin de la mise en place (cf. `moduleRules.setupCount`, onPhaseNext) :
// trop de pions posés, la partie ne peut pas commencer — `{ count, total }`,
// ou `null` (modale fermée).
const setupExcess = ref(null)

// Confirmation demandée à CHAQUE changement de phase ou de tour (bouton
// "suivant", cf. onPhaseNext), contre un clic trop rapide : `{ title,
// message, warnings }` — `warnings`, ce que le joueur laisse derrière lui
// (mise en place incomplète, aucun mouvement, reconnaissances japonaises
// restantes) —, ou `null` (modale fermée).
const phaseConfirm = ref(null)
let phaseConfirmed = false
/** "Confirmer" : la phase (ou le tour) change. */
function confirmPhaseNext() {
  phaseConfirm.value = null
  phaseConfirmed = true
  onPhaseNext()
}

/** Reconnaissances que le moteur peut encore faire dans sa phase en cours
 *  (cf. `continueEngineRecon`) — 0 hors de cette phase. */
function pendingEngineRecons() {
  if (!reconPhaseOf(moduleRules.autoMoveSide) || !searchBagLeft()) return 0
  return openReconChecks(moduleRules.autoMoveSide).length
}

/** Le camp joueur (celui que le moteur ne joue pas, cf.
 *  `moduleRules.autoMoveSide`) termine-t-il sa phase Mouvement sans avoir
 *  rien bougé ? */
function endsMovementUnmoved() {
  const side = turnInfo.value.activeSideKey
  if (phase.value !== 0 || !moduleRules.autoMoveSide || !side || side === moduleRules.autoMoveSide) return false
  return !counters.value.some((counter) => movedThisTurnIds.value.has(String(counter.id)) && sideOfCounter(counter) === side)
}

/** Confirmation du changement de phase en cours (cf. `phaseConfirm`). */
function phaseChangeConfirmation() {
  const warnings = []
  if (phase.value === PHASE_SETUP) {
    const setup = moduleRules.setupCount(counters.value)
    if (setup && setup.count < setup.total) warnings.push(t('phaseConfirm.setupShort', { count: setup.count, total: setup.total }))
  }
  if (endsMovementUnmoved()) warnings.push(t('phaseConfirm.noMove'))
  // Pions que la fin des Mouvements va retirer (cf. `removeAtMovementEnd`),
  // camp par camp — ceux du moteur compris.
  if (endsAllMovements()) {
    const lostBySide = new Map()
    for (const id of moduleRules.movementEndRemovals(counters.value)) {
      const side = sideOfCounter(counterDefinition(id))
      lostBySide.set(side, (lostBySide.get(side) ?? 0) + 1)
    }
    for (const [side, lost] of lostBySide) warnings.push(t('phaseConfirm.movementEndRemovals', { side: sideLabel(side), n: lost }, lost))
  }
  const recons = pendingEngineRecons()
  if (recons > 0) warnings.push(t('phaseConfirm.recons', { n: recons }, recons))
  return { title: nextLabel.value ?? t('turnTracker.nextTurn'), message: nextPhaseMessage(), warnings }
}

/** Question de la confirmation : la phase où mène le bouton "suivant" (cf.
 *  `nextPhaseOf`) et le camp qui la jouera — « Passer à la phase X du joueur
 *  Y ? » —, précédée du nouveau tour s'il change. Camp encore inconnu (ordre
 *  tiré au dé au début du créneau) : la phase seule. Hors mode Assisté (pas
 *  de phases) : le camp seul. */
function nextPhaseMessage() {
  const step = turnTrackerRef.value?.currentStep ?? 0
  const next = phase.value != null ? nextPhaseOf() : { phaseStep: null, nextStep: true }
  const side = next.nextStep ? sideOfStep(trackConfig, step + 1, turnTrackerRef.value?.rollOrders) : turnInfo.value.activeSideKey
  const turn = next.nextStep ? turnOfStep(trackConfig, step + 1) : null
  const params = { phase: phaseName(next.phaseStep), side: side ? sideLabel(side) : '' }
  const question = next.phaseStep == null
    ? t(side ? 'phaseConfirm.nextSide' : 'phaseConfirm.endTurn', params)
    : t(side ? 'phaseConfirm.next' : 'phaseConfirm.nextRolled', params)
  return turn != null && turn !== turnInfo.value.turn ? `${t('phaseConfirm.turn', { turn })} — ${question}` : question
}

/** Clic sur le bouton "suivant" de la ligne des phases (cf. TurnTracker.vue,
 *  évènement `phase-next`). Le changement de phase est refusé, et la modale
 *  d'avertissement ouverte, en phase Mouvement s'il reste des unités amies
 *  en surplus d'empilement sur un même hex (cf. lib/useAssisted.js::
 *  stackedHexes). Sinon, la décision de ce que fait réellement le clic reste
 *  à lib/useAssisted.js::advance. */
function onPhaseNext() {
  // Rejeu, partie terminée ou, en ligne, pas le tour de ce joueur (le
  // bouton est déjà désactivé dans ces cas, cf. `phaseControlsLocked` — et
  // NON `inputLocked`, qu'un temps de Mouvement écoulé ferme alors que c'est
  // précisément ce bouton-là qu'il faut pouvoir cliquer).
  if (phaseControlsLocked.value) return
  // Combat naval du tour pas encore joué (cf. `startNavalCombat`) : il se
  // lance (ou reprend), la phase attend — en ligne, chez l'autre joueur
  // aussi, le temps que ses batailles arrivent (cf. `navalCombatPending`).
  if (startNavalCombat()) { phaseConfirmed = false; return }
  if (navalCombatPending()) {
    phaseConfirmed = false
    reconToast.value = { id: newUid(), text: t('naval.waitingOther') }
    return
  }
  const confirmed = phaseConfirmed
  phaseConfirmed = false
  // Fin de la mise en place : plus de pions que n'en permet le module (cf.
  // `moduleRules.setupCount`), refusé (trop peu : averti à la confirmation).
  if (phase.value === PHASE_SETUP) {
    const setup = moduleRules.setupCount(counters.value)
    if (setup && setup.count > setup.total) {
      setupExcess.value = setup
      return
    }
  }
  if (phase.value === 0 && stackedHexes.value.length > 0) {
    showPhaseBlocked.value = true
    return
  }
  // Tout changement de phase ou de tour se confirme (cf. `phaseConfirm`).
  if (!confirmed) {
    phaseConfirm.value = phaseChangeConfirmation()
    return
  }
  // Fin des Mouvements de tous les camps : la règle du module retire
  // certains pions du jeu (cf. `removeAtMovementEnd`), avant que la piste
  // n'avance.
  if (endsAllMovements()) removeAtMovementEnd()
  const before = phase.value
  const stepBefore = turnTrackerRef.value?.currentStep
  advance()
  // Piste à phases entremêlées (cf. lib/turnTrack.js) : "suivant" change de
  // PAS, et la nouvelle phase vient avec lui — déjà journalisée par
  // l'entrée `turn` (cf. onTurnChange).
  if (turnTrackerRef.value?.currentStep !== stepBefore) return
  // Journal : on enregistre le passage à une nouvelle phase du même pas
  // (entrée `phase`, rejouée par applyReplayEntry -> useAssisted.js::
  // setPhase). Le retour à la première phase après un changement de camp n'a
  // pas besoin d'entrée propre : il accompagne toujours un changement de
  // tour, déjà journalisé (cf. onTurnChange), et la phase de départ y est
  // recalculée d'office (cf. useAssisted.js::startSidePhase, watcher de
  // `currentStep`, synchrone — d'où `phase` déjà à jour ici).
  if (phase.value != null && phase.value !== before) {
    // `blitzUsed` : pendules du timing "Blitz", déjà mises à jour par
    // `advance()` (fin de phase Mouvement, cf. syncMoveTimer, synchrone) —
    // rétablies au rejeu du journal et transmises aux autres joueurs.
    const blitzUsed = isBlitz.value ? { ...blitzUsedMs.value } : undefined
    log('phase', t('log.phase', { name: phaseName(phase.value) }), { phase: phase.value, step: turnInfo.value.step, blitzUsed })
    // Multijoueur : les autres joueurs suivent la phase (cf. applyRemotePhase).
    emit('phase', { phase: phase.value, step: turnInfo.value.step, blitzUsed })
  }
}

/** Le "suivant" en cours clôt-il les Mouvements de TOUS les camps du tour ?
 *  Piste à phases entremêlées : on quitte le dernier créneau de Mouvement
 *  du tour (celui du camp qui bouge en second, selon l'initiative). Sinon,
 *  chaque camp jouant toutes ses phases : la phase de Mouvement du dernier
 *  camp du tour. */
function endsAllMovements() {
  if (phase.value !== 0) return false
  const tracker = turnTrackerRef.value
  const slot = tracker?.currentSlot
  if (!slot) return !!tracker?.isLastSideOfTurn
  const next = tracker.nextSlot
  return !next || next.turn !== slot.turn || next.phase !== slot.phase
}

/** Fin des Mouvements du tour (cf. onPhaseNext, `endsAllMovements`) : les
 *  pions que la règle du module retire alors du jeu (cf.
 *  `moduleRules.movementEndRemovals` — les leurres au contact d'une task
 *  force ennemie, à la mer de Corail), chacun inscrit au journal (entrée
 *  `eliminate`), d'où le rejeu et les autres joueurs le reprennent. */
function removeAtMovementEnd() {
  for (const id of moduleRules.movementEndRemovals(counters.value)) eliminateCounter(id, t('log.dummyContact'))
}

/** Multijoueur : un autre joueur a changé de phase (cf. RoomLobby.vue,
 *  évènement `game:phase`). Ignoré s'il vise un autre pas que le pas
 *  courant (message arrivé en retard). Pas de journalisation ici : l'entrée
 *  `phase` arrive par le journal partagé (cf. applyRemoteEntry). */
function applyRemotePhase(newPhase, step, blitzUsed) {
  if (step !== turnTrackerRef.value?.currentStep || newPhase === phase.value) return
  setPhase(newPhase)
  // Pendules "Blitz" : les valeurs du joueur actif font foi (elles
  // remplacent l'estimation que ce navigateur vient de faire lui-même).
  if (blitzUsed) blitzUsedMs.value = { ...blitzUsed }
}

const selectedCounterId = ref(null)

// Changement de pas de la piste (piste à phases entremêlées : on passe du
// Mouvement d'un camp à celui de l'autre SANS changer de phase) : un pion
// que le nouveau camp actif ne contrôle pas est désélectionné.
watch(() => turnInfo.value.step, () => {
  const selected = counters.value.find((counter) => counter.id === selectedCounterId.value)
  if (selected && !canControl(selected)) selectedCounterId.value = null
})

// Sortie de la phase de Mouvement : un pion resté sélectionné est
// désélectionné — plus aucun pion ne bouge.
watch(phase, (newPhase) => {
  if (newPhase != null && newPhase > 0) selectedCounterId.value = null
  // Les déplacements de la phase qui s'achève sont acquis : plus rien à
  // annuler (cf. `moveHistory`).
  moveHistory.value = []
  // Tout changement de phase désélectionne un renfort choisi dans le
  // panneau : il n'est peut-être plus plaçable dans la nouvelle phase (cf.
  // lib/useAssisted.js::canPlaceReinforcementNow).
  selectedReinforcementId.value = null
})

// Lancement de la partie : phase de départ du camp actif (cf.
// lib/useAssisted.js::startSidePhase). Au montage, et pas plus tôt :
// TurnTracker.vue (camp actif, tour courant) doit déjà être monté.
onMounted(() => {
  initPhase()
  if (props.module.turnTrack) initialTurnEntry = turnEntryOf(turnInfo.value)
  if (props.online) startSharedJournal(props.initialJournal)
  // État de la partie côté serveur — pas, phase, pendules, fin de partie
  // (cf. applyServerState). En solo/démo, les props valent leurs défauts :
  // sans effet, hormis le démarrage des pendules.
  applyServerState({
    turnStep: props.initialTurnStep, phase: props.initialPhase, phaseElapsedMs: props.initialPhaseElapsedMs,
    blitzUsedMs: props.initialBlitzUsedMs, blitzLoser: props.initialBlitzLoser, gameOverReason: props.initialGameOverReason,
  })
  // Partie relancée avec les réglages d'une sauvegarde (cf. DemoPlay.vue) :
  // on rejoue maintenant le journal mis de côté — APRÈS `initPhase`, que le
  // rejeu doit pouvoir corriger. Jamais en ligne (la reprise en attente
  // appartient à une partie locale).
  if (!props.online) journalRef.value?.resumePending()
})

/** En ligne : rejoue d'un coup le journal partagé `list` déjà enregistré par
 *  le serveur (rechargement de la page, reconnexion) pour reconstituer la
 *  partie — positions, éliminations, phase, MP, pendules... Le plateau est
 *  d'abord remis au déploiement (cf. onJournalLoaded), donc tout ce que ce
 *  navigateur aurait de plus que le serveur est abandonné. Partie qui
 *  démarre (journal vide) : propose son déploiement au serveur ; seul le
 *  PREMIER proposé est retenu et appliqué chez tous les joueurs (cf.
 *  RoomLobby.vue::onDeploy), pour que les unités tirées au hasard dans leur
 *  zone de départ soient au même endroit pour tout le monde. */
function startSharedJournal(list) {
  if (list.length) {
    journalRef.value?.loadShared(list)
    fastForwardReplay()
  } else {
    // Déploiement ET tour de départ (cf. `initialTurnEntry`), retenus ou
    // rejetés ensemble par le serveur (premier arrivé).
    const time = new Date().toLocaleTimeString('fr-FR')
    emit('deploy', {
      setup: { uid: newUid(), t: time, kind: 'setup', text: t('log.deployment'), data: deploymentData() },
      turn: initialTurnEntry ? { uid: newUid(), t: time, ...initialTurnEntry } : null,
    })
  }
}

// Pions retirés de la carte via "Éliminé" (menu contextuel, cf.
// onCounterContextMenu plus bas) — id -> true. Un pion éliminé n'est ni sur
// la carte (counters) ni dans les renforts tant qu'il n'est pas explicitement
// "replacé" depuis le panneau "Unités éliminées" (EliminatedPanel.vue).
const eliminatedIds = ref(new Set())
const eliminatedCounters = computed(() =>
  [...eliminatedIds.value].map(counterDefinition).filter(Boolean)
)
// Pions retirés du jeu, un par retrait, dans l'ordre : `{ key, id, turn,
// time, hex, reason }` — tour (et heure de la piste), hex qu'il occupait,
// raison (ex. leurre démasqué). Montrés sous les unités éliminées (cf.
// EliminatedPanel.vue), en mode debug comme en mode normal ; refaits au
// rejeu par les entrées `eliminate`.
const removals = ref([])
const removalList = computed(() => removals.value.map((removal) => ({ ...removal, counter: counterDefinition(removal.id) }))
  .filter((removal) => removal.counter))

// --- Renforts : pions du module avec un hex d'entrée mais pas encore posés
// ni éliminés (typiquement arrivée tour 2+) — cf. ReinforcementsPanel.vue.
// Entrée en jeu SELON LE MODE (cf. lib/useAssisted.js::draggable) : en mode
// Libre, glissés sur la carte comme le déplacement d'un pion existant
// (onCounterDragStart / onMapDrop plus bas) ; en mode Assisté, uniquement
// par clic (onReinforcementSelect puis onHex, cf. plus bas — le glisser est
// désactivé pour laisser le clic comme seul chemin). Toujours possible, dans
// les deux modes, via le menu contextuel "Replacer le pion" (ils y
// retournent alors).
const placedIds = computed(() => new Set(counters.value.map((counter) => String(counter.id))))

/** Retire `id` de la carte et le range dans les "Unités éliminées". Commun
 *  au jeu (cf. `eliminateCounter`) et au rejeu du journal. `info` (`{
 *  turn, time, hex, reason }`, cf. `removalInfo`) : ce que le journal en a
 *  gardé — à défaut (journal plus ancien), le tour et l'hex du moment. */
function noteElimination(id, info = {}) {
  const key = String(id)
  const here = removalInfo(id)
  const counterIndex = counters.value.findIndex((counter) => String(counter.id) === key)
  if (counterIndex !== -1) counters.value.splice(counterIndex, 1)
  eliminatedIds.value = new Set(eliminatedIds.value).add(key)
  removals.value = [...removals.value, { key: newUid(), id: key, turn: info.turn ?? here.turn, time: info.time ?? here.time,
    hex: info.hex ?? here.hex, reason: info.reason ?? null }]
}
/** Tour (et heure de la piste) en cours, et hex qu'occupe le pion `id`
 *  (`null` hors carte). Le tour se lit sur la piste elle-même : à jour même
 *  au rejeu. */
function removalInfo(id) {
  const counter = counters.value.find((other) => String(other.id) === String(id))
  return {
    turn: turnTrackerRef.value?.currentTurn ?? turnInfo.value.turn,
    time: turnTrackerRef.value?.currentTurnInfo?.time ?? null,
    hex: counter && counter.col != null ? hexId(counter.col + 1, counter.row) : null,
  }
}

const reinforcements = computed(() =>
  allCounters.value
    .filter((counter) => counter.setup && !placedIds.value.has(String(counter.id)) && !eliminatedIds.value.has(String(counter.id)))
)

// Un onglet de renforts par camp déclaré dans module.sides (ex. {"ijn":
// ["ijn"], "usn": ["usn"]}) — chacun ne liste que les renforts des factions
// de son camp. Repli sur un onglet unique si le module n'a pas encore ce
// champ. Plus un onglet fixe "Unités éliminées", commun à tous les camps
// (regroupé par nationalité à l'intérieur).
// Libellé de l'onglet d'un camp : "Renfort " + le nom du camp tel que la
// piste de tour l'affiche (`turnTrack.sides[side].label`, ex. "Renfort
// américains") — la clé brute du camp à défaut.
// Le module peut traduire l'intitulé complet (cf. son dictionnaire `i18n`) ;
// sinon, il est composé à partir du nom du camp traduit.
const sideTabLabel = (side) => {
  const frLabel = props.module.turnTrack?.sides?.[side]?.label
  const frTab = frLabel ? `Renfort ${frLabel.toLowerCase()}` : null
  const translated = mt(frTab)
  if (frTab && translated !== frTab) return translated
  const label = mt(frLabel) ?? side
  return t('tabs.sideReinforcements', { side: label.toLowerCase(), Side: label })
}
const sidePanelTabs = computed(() => {
  const sides = props.module.sides
  // Camp joué par le moteur (partie Assistée, cf. `runAutoMoves`) : personne
  // ne pose ses pions à la main, pas d'onglet de renforts pour lui.
  const engineSide = props.assisted ? moduleRules.autoMoveSide : null
  const base = !sides
    ? [{ key: 'reinforcements', label: t('tabs.reinforcements') }]
    // Onglet d'un camp : à sa couleur (cf. `turnTrack.sides`, SidePanel.vue).
    : Object.keys(sides).filter((side) => side !== engineSide)
      .map((side) => ({ key: side, label: sideTabLabel(side), tone: props.module.turnTrack?.sides?.[side]?.color ?? null }))
  // Tasse de recherche du module (cf. SearchBagPanel.vue), s'il en a une :
  // son contenu est caché aux joueurs, l'onglet n'apparaît qu'en mode debug.
  const searchBag = moduleRules.searchBag && debug.value ? [{ key: 'searchBag', label: t('tabs.searchBag') }] : []
  return [...base, ...searchBag,
    // Unités éliminées : #e3e0db, tiré du papier et de l'encre du thème.
    { key: 'eliminated', label: t('tabs.eliminated'), tone: 'color-mix(in srgb, var(--c-paper) 92%, var(--c-ink))', lightTone: true },
    { key: 'journal', label: t('tabs.journal'), tone: 'var(--c-gold)', lightTone: true }]
})
function reinforcementsForTab(key) {
  const sides = props.module.sides
  // Partie Assistée d'un module qui pose lui-même ses résultats de recherche
  // (`moduleRules.searchResults`, cf. `searchMarker`) : les marqueurs du
  // panneau (Detected!, Contact Lost...) ne servent qu'en partie Libre.
  const shown = props.assisted && moduleRules.searchResults
    ? reinforcements.value.filter((counter) => counter.type !== 'marker')
    : reinforcements.value
  if (!sides) return shown
  const factions = sides[key] ?? []
  return shown.filter((counter) => factions.includes(counter.faction))
}
const openTab = ref(null)
const draggedCounterId = ref(null)

// --- Menu contextuel (clic droit) : "Replacer le pion" / "Éliminé" sur un
// pion posé sur la carte ; seulement "Replacer le pion" sur un pion déjà
// éliminé (panneau "Unités éliminées") ; aucun menu depuis le panneau de
// renforts (pas encore sur la carte, rien à replacer ou éliminer). Ni l'un
// ni l'autre, ni "Annuler le mouvement", sur un pion du camp que joue le
// moteur (cf. `isEngineCounter`).
const contextMenu = ref(null) // { x, y, items: [{label, action}] } | null

function openContextMenu(ev, items) {
  ev.preventDefault()
  hoveredCounter.value = null
  contextMenu.value = { x: ev.clientX, y: ev.clientY, items }
}
function closeContextMenu() {
  contextMenu.value = null
}
/** Retire un pion de la carte et le renvoie dans les renforts (sans l'éliminer). */
function returnCounterToReinforcements(id) {
  const counterIndex = counters.value.findIndex((counter) => String(counter.id) === String(id))
  if (counterIndex !== -1) counters.value.splice(counterIndex, 1)
  forgetRemoval(id)
  eliminatedIds.value.delete(String(id))
  eliminatedIds.value = new Set(eliminatedIds.value)
  const counter = counterDefinition(id)
  // cf. lib/useAssisted.js::resetMp — un pion replacé aux renforts doit
  // repartir avec un plein potentiel de MP la prochaine fois qu'il entrera
  // en jeu, pas avec ce qu'il lui restait au moment où il a quitté la carte.
  // cf. lib/useAssisted.js::unspendEntryCost — et s'il avait fait grimper la
  // congestion du hex par lequel il était entré ce tour-ci, cette place est
  // maintenant libre : le prochain à entrer par ce même hex ne doit pas
  // payer pour une entrée qui n'a plus lieu.
  if (counter) {
    resetMp(counter)
    unspendEntryCost(counter)
  }
  log('return', t('log.returned', { unit: counter?.name ?? id }), { counterId: id })
}
/** Élimine un pion (menu contextuel, ou leurre démasqué par une recherche —
 *  cf. `performSearch`, qui précise alors pourquoi dans `reason`). */
function eliminateCounter(id, reason) {
  const info = { ...removalInfo(id), reason: reason ?? null }
  noteElimination(id, info)
  const counter = counterDefinition(id)
  log('eliminate', t('log.eliminated', { unit: counter?.name ?? id }) + (reason ? ` (${reason})` : ''), { counterId: id, ...info })
}
/** Un pion éliminé "replacé" dans les renforts (correction du joueur) : son
 *  dernier retrait sort de la liste. */
function forgetRemoval(id) {
  if (!eliminatedIds.value.has(String(id))) return
  const index = removals.value.findLastIndex((removal) => removal.id === String(id))
  if (index >= 0) removals.value = removals.value.filter((_, at) => at !== index)
}
/** Pion du camp que joue le moteur (`moduleRules.autoMoveSide`, le Japonais
 *  en mer de Corail) : le joueur ne le replace ni ne l'élimine à la main. */
const isEngineCounter = (id) => !!moduleRules.autoMoveSide && sideOfCounter(counterDefinition(id)) === moduleRules.autoMoveSide

function onCounterContextMenu(id, ev) {
  if (inputLocked.value) return
  const items = isEngineCounter(id) ? [] : [
    { label: t('menu.putBack'), action: () => returnCounterToReinforcements(id) },
    { label: t('menu.eliminate'), action: () => eliminateCounter(id) },
  ]
  // Reconnaissance du moteur (cf. `reportRecon`) : sur une unité de l'hex
  // qu'il a désigné, en tête du menu.
  const clicked = counters.value.find((counter) => String(counter.id) === String(id))
  if (clicked && isReconTargetHex({ c: clicked.col, r: clicked.row })) {
    items.unshift({ label: t('menu.reconReport'), action: () => reportRecon(id) })
  }
  // Opérations aériennes du joueur (cf. `openFleetDisplay`) : sur une task
  // force ennemie repérée, en tête du menu — inerte hors de portée de ses
  // porte-avions, l'infobulle dit pourquoi.
  if (clicked && isFleetDisplayCandidate(clicked) && moduleRules.fleetDisplay(clicked)) {
    const inRange = moduleRules.airStrikeReach(clicked, counters.value)
    items.unshift({ label: t('menu.airStrike'), action: () => openFleetDisplay(clicked), disabled: !inRange,
      title: inRange ? null : t('fleetDisplay.outOfRange', { radius: moduleRules.airStrikeRadius }) })
  }
  // Phase Mouvement uniquement (ou partie Libre, sans phases : `phase` vaut
  // `null`) — même raison que "Retour arrière" (cf. `moveHistory`).
  // Jamais sur un pion du moteur : c'est lui qui le déplace.
  if (!isEngineCounter(id) && movedThisTurnIds.value.has(String(id)) && (phase.value === null || phase.value === 0)) {
    items.push({ label: t('menu.cancelMove'), action: () => cancelMovement(id) })
  }
  // Pile d'unités (2 ou plus sur l'hex) : faire passer une autre unité
  // au-dessus, pour pouvoir la sélectionner (cf. `cycleStack`).
  if (clicked && stackUnitsAt(clicked).length > 1) {
    items.push({ label: t('menu.restack'), action: () => cycleStack(clicked) })
  }
  // Task force du joueur : sa composition, modifiable ou non selon le moment.
  if (clicked && canSeeAlliedFleet(clicked)) {
    const editable = alliedFleetEditable.value
    const label = editable ? 'menu.alliedFleetEdit' : alliedAirEditable.value ? 'menu.alliedAirEdit'
      : debugCompositionVisible.value ? 'menu.viewComposition' : 'menu.alliedFleetView'
    items.push({ label: t(label), action: () => openAlliedFleet(clicked, editable) })
  } else if (clicked?.type === 'task force' && debugCompositionVisible.value) {
    // Mode debug : la vraie composition d'une task force du moteur (cf.
    // `openComposition`) — inerte pour un leurre, qui n'en a pas.
    const layout = moduleRules.fleetDisplay(clicked)
    items.push({ label: t('menu.viewComposition'), action: () => openComposition(clicked), disabled: !layout,
      title: layout ? null : t('menu.noComposition') })
  }
  // Rien à proposer (pion du moteur) : pas de menu, ni celui du navigateur.
  if (!items.length) { ev.preventDefault(); return }
  openContextMenu(ev, items)
}
/** Unités (pas les marqueurs, cf. `isUnit`) de l'hex de `counter`, dans
 *  l'ordre de `counters` — du bas de la pile vers le haut (cf.
 *  `stackOffsets` et l'ordre de peinture du template). */
function stackUnitsAt(counter) {
  return counters.value.filter((other) => isUnit(other) && other.col === counter.col && other.row === counter.row)
}
/** Menu contextuel "Changer l'ordre de l'empilement" : l'unité du BAS de la
 *  pile passe tout en HAUT — c'est elle qui se sélectionne désormais au
 *  clic. Répété, le menu fait tourner toute la pile. Simple affichage local :
 *  `counters` n'est pas synchronisé entre clients, et aucune règle ne dépend
 *  de cet ordre. */
function cycleStack(counter) {
  const [bottom] = stackUnitsAt(counter)
  if (!bottom) return
  counters.value = [...counters.value.filter((other) => other !== bottom), bottom]
}
function onEliminatedContextMenu(id, ev) {
  if (inputLocked.value) return
  if (isEngineCounter(id)) { ev.preventDefault(); return }
  openContextMenu(ev, [
    { label: t('menu.putBack'), action: () => returnCounterToReinforcements(id) },
  ])
}
function chooseContextMenuItem(action) {
  action()
  closeContextMenu()
}

/** Le pion actuellement sélectionné (objet complet, pas que son id) — `null`
 *  si aucun. Factorisé ici car réutilisé par `adjacentSet`, `reachableSet`
 *  ci-dessous ET par lib/useDebug.js (portée de déplacement en mode debug). */
const selectedCounter = computed(() => counters.value.find((counter) => counter.id === selectedCounterId.value) ?? null)

/** Hex voisins (0-based col / 1-based row) du pion actuellement sélectionné,
 *  sous forme de clés "col,row" pour un lookup O(1) depuis isAdjacent(). */
const adjacentSet = computed(() => {
  const counter = selectedCounter.value
  if (!counter) return new Set()
  return new Set(
    neighborsOf(counter.col, counter.row).filter((neighbor) => hexOnMap(neighbor.col, neighbor.row)).map((neighbor) => neighbor.col + ',' + neighbor.row)
  )
})
const isAdjacent = (hex) => adjacentSet.value.has(hex.c + ',' + hex.r)

// Sous-ensemble de `adjacentSet` : uniquement les hex adjacents que le pion
// sélectionné peut RÉELLEMENT rejoindre, MP suffisants pour en payer le coût
// de terrain (cf. lib/useAssisted.js::canEnterHex) — sert au surlignage vert
// (mode Assisté), pour ne pas laisser croire qu'un hex adjacent trop coûteux
// est une destination valide. Vide dès qu'aucun pion n'est sélectionné, donc
// aussi hors mode Assisté (où `selectedCounterId` ne prend jamais de valeur,
// cf. lib/useAssisted.js::selectable) — pas besoin d'un garde-fou de mode ici.
// Hors mode debug uniquement (cf. template) : le mode debug affiche à la
// place la portée COMPLÈTE de déplacement (cf. lib/useDebug.js::isInRange),
// pas que le premier pas.
const reachableSet = computed(() => {
  const counter = selectedCounter.value
  if (!counter) return new Set()
  const from = { c: counter.col, r: counter.row }
  const set = new Set()
  for (const key of adjacentSet.value) {
    const [col, row] = key.split(',').map(Number)
    const hexCell = { c: col, r: row }
    if (!canEnterHex(counter, hexCell, from)) continue
    // Règle d'empilement (mouvement normal, cf. lib/useAssisted.js) : un hex
    // déjà occupé par un pion AMI n'est atteignable que si le pion sélectionné
    // pourrait ensuite continuer sa route (MP restants après y être entré) —
    // sinon il resterait "coincé" dessus, ce qui est interdit. On l'exclut
    // donc du surlignage vert pour ne pas laisser croire que ce clic ferait
    // quelque chose.
    if (wouldOverstack(counter, hexCell) && !canLeaveAfterEntering(counter, hexCell, from)) continue
    set.add(key)
  }
  return set
})
const isReachable = (hex) => reachableSet.value.has(hex.c + ',' + hex.r)

// --- Entrée en jeu d'un renfort : deux systèmes cf. demande utilisateur —
// 1) glisser-déposer libre (n'importe quel hex, cf. onMapDrop) ;
// 2) clic sur le pion dans le panneau (bordure orange, cf.
//    ReinforcementsPanel.vue) puis clic sur un des hex d'entrée valides,
//    surlignés en orange sur la carte — cf. `entryHexSet` ci-dessous pour le
//    détail des formes de `setup` (cf. lib/setup.js) et de leurs hex
//    valides respectifs. Déclaré ICI (avant le `useDebug()` plus bas, pas
//    juste avant `onHex` comme le reste de la logique de renfort) parce que
//    `entryHexSet` lui est transmis, pour l'affichage debug du surcoût
//    d'entrée (cf. lib/useAssisted.js::entrySurcharge).
const selectedReinforcement = computed(() =>
  reinforcements.value.find((counter) => String(counter.id) === String(selectedReinforcementId.value))
)

// `hex` empêche-t-il `r` (le renfort qu'on cherche à poser) d'y entrer ?
// Vrai si `hex` est occupé par au moins une unité qui est :
//  - ennemie de `r` (cf. lib/useAssisted.js::isEnemyOf) — on ne débarque
//    évidemment pas sur une case tenue par l'adversaire ;
//  - OU amie de `r`, mais elle-même actuellement figée dans une ZOC ennemie
//    (cf. lib/useAssisted.js::isZocFrozen) ;
//  - OU amie de `r`, alors que `r` ne pourrait pas en repartir ensuite (cf.
//    `entryWouldStack` ci-dessous) — il y resterait coincé avec elle.
//    Une amie "normale" (pas figée), avec un renfort qui garde de quoi
//    repartir, ne bloque PAS l'entrée : le renfort peut traverser son hex.
// Les marqueurs ne comptent jamais comme occupants ici.
function isEntryHexBlocked(reinforcement, hex) {
  return counters.value.some((counter) => counter.col === hex.col && counter.row === hex.row && isUnit(counter)
    && (isEnemyOf(reinforcement, counter) || isZocFrozen(counter)))
    || entryWouldStack(reinforcement, hex)
}

// Règle d'empilement appliquée à l'ENTRÉE EN JEU (cf.
// lib/useAssisted.js::canLeaveAfterReinforcementEntry) : `hex` est plein
// d'amis de `r`, et `r`, une fois entré (coût d'entrée payé), n'aurait plus
// de quoi en repartir. Toujours faux hors mode Assisté.
function entryWouldStack(reinforcement, hex) {
  const entryCell = { c: hex.col, r: hex.row }
  return wouldOverstack(reinforcement, entryCell) && !canLeaveAfterReinforcementEntry(reinforcement, entryCell)
}

// Hex d'entrée valides pour le renfort actuellement sélectionné, selon la
// forme de son `setup` (cf. lib/setup.js) :
//  1. "*" : tout hex de la carte (mise en place libre) ;
//  2. "CCRR" seule, ou "CCRR-CCRR" (plage de bord de carte, ex. les task
//     forces japonaises) : CHAQUE hex prévu qui n'est pas bloqué (cf.
//     `isEntryHexBlocked`).
// Un leurre du renfort de leurres du joueur ne se pose que sur ses task
// forces (cf. `playerDummyHexes`).
const entryHexSet = computed(() => {
  const reinforcement = selectedReinforcement.value
  const parsed = parseSetup(reinforcement?.setup)
  if (!parsed) return new Set()
  const dummyHexes = playerDummyHexes(reinforcement)
  if (dummyHexes) return dummyHexes
  const keys = (cells) => new Set(cells.map((hex) => hex.col + ',' + hex.row))
  if (parsed.kind === 'anywhere') return keys(hexes.value.map((hex) => ({ col: hex.c, row: hex.r })))
  return keys(rangeCells(parsed, hexOnMap).filter((hex) => !isEntryHexBlocked(reinforcement, hex)))
})
const isEntryHex = (hex) => entryHexSet.value.has(hex.c + ',' + hex.r)

// cf. lib/useAssisted.js::enemyZocSet — hex sous ZOC ennemie relativement au
// pion sélectionné (vide si aucun pion sélectionné, ou si l'appli n'est pas
// en mode Assisté puisqu'aucun pion n'y est alors jamais "sélectionné" — cf.
// lib/useAssisted.js::selectable). La RÈGLE elle-même (cf.
// lib/useAssisted.js::canEnterHex) s'applique TOUJOURS en mode Assisté,
// avec ou sans debug — seul cet AFFICHAGE (surlignage rouge, classe CSS
// `hex-zoc`, cf. template) est réservé au mode debug (cf. `v-if="debug"`),
// pour ne pas surcharger l'écran par défaut. `zocSet` est aussi transmis à
// useDebug() ci-dessous pour que le calcul de portée en tienne compte.
const zocSet = computed(() => enemyZocSet(selectedCounter.value))
const isZocHex = (hex) => zocSet.value.has(hex.c + ',' + hex.r)

// cf. lib/useDebug.js — case à cocher "debug" (ci-dessous dans le template)
// et tous les affichages qu'elle déclenche : le coût de terrain (COT) des
// hex adjacents au pion sélectionné (`adjacentCotLabels`), la portée
// COMPLÈTE de déplacement de ce pion, au-delà du simple premier pas adjacent
// (`isInRange`, cf. surlignage vert dans le template, en mode debug
// seulement — le clic, lui, reste toujours limité aux hex adjacents), et le
// surcoût de congestion déjà accumulé sur les hex d'entrée de renfort
// actuellement surlignés (`entrySurchargeLabels`, cf.
// lib/useAssisted.js::entrySurcharge). Le calcul de portée reçoit `zocSet`
// ci-dessus pour respecter la ZOC : un pion ne peut pas continuer son
// chemin au-delà d'un hex sous ZOC ennemie.
// Pions à hex-objectif sur la carte (cf. `runAutoMoves`), pour leurs traces
// en mode debug.
const autoMovers = computed(() => counters.value
  .map((counter) => ({ id: counter.id, target: moduleRules.autoMoveTarget(counter) }))
  .filter((mover) => mover.target))
// La portée tient compte aussi des hex que la règle du module interdit au
// pion (cf. `moduleRules.barredHexes`), comme le clic (cf. canEnterHex) —
// calculés une fois par pion choisi, pas à chaque hex du parcours.
const selectedBarred = computed(() => (selectedCounter.value ? moduleRules.barredHexes(selectedCounter.value, counters.value) : null))
const canEnterInRange = (unit, hex, from) => canEnterTerrain(unit, hex, from)
  && !(unit === selectedCounter.value ? selectedBarred.value : moduleRules.barredHexes(unit, counters.value))?.has(hex.c + ',' + hex.r)
const { debug, adjacentCotLabels, isInRange, entrySurchargeLabels, autoMoveTrailLines } = useDebug(
  hexes, isAdjacent, terrainCost, selectedCounter, remainingMp, neighborsOf, hexOnMap, canEnterInRange, zocSet,
  entryHexSet, entrySurcharge, wouldOverstack, isZocFrozen, rules.zoc.stopOnEntry, autoMoveTrails, autoMovers,
)

// Onglet ouvert qui disparaît (tasse de recherche, mode debug décoché) : le
// panneau se referme.
watch(sidePanelTabs, (tabs) => { if (openTab.value && !tabs.some((tab) => tab.key === openTab.value)) openTab.value = null })

// Décalage visuel des pions empilés sur un même hex — même principe
// qu'ambush-tactique (HexMap.vue, `placedPositions`) : chaque pion suivant
// sur une case glisse en diagonale de 10% de sa taille par rapport au
// précédent, cumulatif. Les marqueurs posés seuls restent toujours au
// centre, sans décalage — les unités qui partagent leur hex commencent leur
// pile à l'indice 1 (comme les "eventMarkers" d'ambush-tactique), le
// marqueur servant de socle visuel sous la pile (cf. z-order dans le
// template : ces marqueurs sont rendus avant les unités, donc toujours
// dessous).
const STACK_STEP = 0.1
const stackOffsets = computed(() => {
  // Hex AFFICHÉ (cf. `shownHex`) : un pion qui attend son animation s'empile
  // encore à son hex de départ.
  const hexKey = (counter) => { const at = shownHex(counter); return at.col + ',' + at.row }
  const stackAt = (idx) => ({ dx: -STACK_STEP * idx, dy: -STACK_STEP * idx })
  const markerHexes = new Set(counters.value.filter((counter) => !isUnit(counter) && !counter.attachedTo).map(hexKey))
  const unitCounts = new Map()
  const offsets = new Map()
  for (const counter of counters.value) {
    if (!isUnit(counter)) { offsets.set(counter.id, ZERO_OFFSET); continue }
    const key = hexKey(counter)
    const stackBase = markerHexes.has(key) ? 1 : 0
    const stackIndex = unitCounts.get(key) ?? 0
    unitCounts.set(key, stackIndex + 1)
    offsets.set(counter.id, stackAt(stackBase + stackIndex))
  }
  // Une fois toutes les unités comptées, quel que soit l'ordre de `counters`.
  // Les pions rattachés à une unité (résultat de recherche, "Sighted" — cf.
  // `syncSearchMarkers`) montent chacun d'un cran de plus.
  const attachedCounts = new Map()
  for (const counter of counters.value) {
    if (!counter.attachedTo) continue
    // Pion "Sighted" qui remplace l'image de son unité : pas rendu à part.
    if (counter.sighted && replacesUnitImage(counter)) { offsets.set(counter.id, ZERO_OFFSET); continue }
    const key = hexKey(counter)
    const attachedIndex = attachedCounts.get(key) ?? 0
    attachedCounts.set(key, attachedIndex + 1)
    offsets.set(counter.id, stackAt((markerHexes.has(key) ? 1 : 0) + (unitCounts.get(key) ?? 0) + attachedIndex))
  }
  return offsets
})
const ZERO_OFFSET = { dx: 0, dy: 0 }

// --- Fenêtre de survol d'une pile (cf. StackPopup.vue) : survoler un pion
// d'un hex qui en porte PLUSIEURS — unités, marqueurs, toute sorte de pion —
// montre toute la pile en grand, l'empilement sur la
// carte masquant en partie les pions du dessous. Rien pour un pion seul.
// Coupée pendant un glisser et à l'ouverture d'un menu contextuel.
const hoveredCounter = ref(null) // { id, col, row, anchor: rect écran } | null
function onCounterHover(id, ev) {
  if (draggedCounterId.value != null || autoMoveAnimating.value) return
  const counter = counters.value.find((counter) => String(counter.id) === String(id))
  if (!counter) return
  const { left, top, right, bottom } = ev.target.getBoundingClientRect()
  hoveredCounter.value = { id, col: counter.col, row: counter.row, anchor: { left, top, right, bottom } }
}
function onCounterUnhover(id) {
  if (String(hoveredCounter.value?.id) === String(id)) hoveredCounter.value = null
}
/** Pions de l'hex survolé, du dessus vers le dessous de la pile (ordre de
 *  peinture du template inversé : pions de repérage, unités, marqueurs) —
 *  vide s'il n'y en a qu'un. */
const hoveredStackCounters = computed(() => {
  const hover = hoveredCounter.value
  if (!hover) return []
  const here = counters.value.filter((counter) => counter.col === hover.col && counter.row === hover.row && !replacesUnitImage(counter))
  if (here.length < 2) return []
  // Les pions de repérage disent le tour où ils ont été posés.
  return [
    ...here.filter((counter) => !isUnit(counter) && !counter.attachedTo),
    // Unité dont un "Sighted" remplace l'image : "partiellement détectée",
    // en toutes lettres.
    ...here.filter(isUnit).map((counter) => replacingSighted.value.has(String(counter.id))
      ? { ...counter, src: unitSrc(counter), name: t('stack.partiallyDetected'), fullName: true }
      : counter),
    ...here.filter((counter) => counter.attachedTo),
  ].reverse().map((counter) => counter.placedTurn == null ? counter
    : { ...counter, detail: t(counter.placedTime ? 'stack.placedAt' : 'stack.placed', { turn: counter.placedTurn, time: counter.placedTime }) })
})

/** Clic sur un pion déjà sur la carte — deux interprétations possibles,
 *  cf. le nouveau comportement demandé pour le mouvement normal :
 *   1. un AUTRE pion est déjà sélectionné et celui-ci lui est adjacent -> le
 *      clic est traité comme un déplacement vers son hex (cf. onHex), PAS
 *      comme un changement de sélection. Sans ça, cliquer sur un pion qui
 *      occupe la case visée reviendrait TOUJOURS à sélectionner ce pion (son
 *      image recouvre le polygone de l'hex en dessous, cf.
 *      Counter.vue::onClick, `@click.stop`), rendant impossible tout
 *      déplacement au clic vers une case occupée (ex. empilement avec un
 *      ami, cf. la règle qui précède) ;
 *   2. sinon, comportement de sélection normal — SAUF si ce pion est
 *      verrouillé (cf. `lockedFromSelectionIds` : il a bougé ce tour-ci puis
 *      a déjà été désélectionné une fois), auquel cas le clic ne fait rien. */
function onCounterSelect(id) {
  if (inputLocked.value) return
  const counter = counters.value.find((counter) => String(counter.id) === String(id))
  if (!counter) return
  // Organisation des combats navals (cf. `onNavalOrgClick`) : le clic ne
  // fait rien d'autre.
  if (navalOrg.value) { onNavalOrgClick(counter); return }
  // Reconnaissance du joueur (cf. `onManualRecon`) : le clic choisit une
  // source ou explore une cible, rien d'autre.
  if (onManualRecon({ c: counter.col, r: counter.row }, counter)) return
  // Mise en place et phase de composition (partie Assistée) : une task force
  // du joueur ouvre sa composition, sauf renfort à empiler dessus (cf.
  // `openAlliedFleet`) ; à sa phase d'Opérations aériennes, ses avions.
  if (props.assisted && phase.value !== 0 && selectedReinforcementId.value == null
    && (alliedFleetEditable.value || alliedAirEditable.value) && openAlliedFleet(counter, alliedFleetEditable.value)) return
  // Mise en place : rien ne bouge. Un clic sur un pion déjà posé vaut clic
  // sur son hex, pour y empiler le renfort choisi.
  if (phase.value === PHASE_SETUP) {
    if (selectedReinforcementId.value != null) onHex({ c: counter.col, r: counter.row })
    return
  }
  // Un pion adjacent au pion sélectionné : le clic vaut d'abord clic sur son
  // hex (y déplacer le pion sélectionné, cf. onHex). Si ce déplacement n'a
  // pas lieu (MP, terrain, empilement...), il sélectionne le pion cliqué —
  // sans quoi il faudrait désélectionner d'abord.
  if (selectedCounterId.value != null && selectedCounterId.value !== id && isAdjacent({ c: counter.col, r: counter.row })) {
    const mover = selectedCounter.value
    const before = mover && `${mover.col},${mover.row}`
    onHex({ c: counter.col, r: counter.row })
    if (!mover || `${mover.col},${mover.row}` !== before) return
  }
  if (lockedFromSelectionIds.value.has(String(id))) return
  if (!canControl(counter)) return
  // Hors phase de Mouvement (Combat naval, Administrative... d'une piste à
  // phases du module), aucun pion ne se sélectionne pour bouger.
  if (phase.value != null && phase.value !== 0) return
  setSelectedCounter(selectedCounterId.value === id ? null : id)
  selectedReinforcementId.value = null
}

const selectedReinforcementId = ref(null)

// --- Renfort de leurres du JOUEUR (cf. `moduleRules.playerDummyReinforcement`
// — les leurres US de la mer de Corail, tours 11 et 23) : dans sa phase
// Mouvement, AVANT d'avoir bougé quoi que ce soit, le camp pose ses leurres
// sur l'hex d'une de ses task forces, jusqu'au total permis ; puis il fait
// son mouvement (le leurre empilé ne doit s'en écarter que si la limite
// d'empilement de son camp l'impose, cf. `stackedHexes`).
/** Hex ("col,row") où `counter` peut être posé maintenant à ce titre —
 *  vide une fois le total atteint ou le mouvement commencé —, ou `null`
 *  hors de ce renfort (la pose ordinaire s'applique alors). */
function playerDummyHexes(counter) {
  const rule = moduleRules.playerDummyReinforcement(counter, turnTrackerRef.value?.currentTurnInfo)
  if (!rule || phase.value !== 0) return null
  const side = sideOfCounter(counter)
  if (side !== turnInfo.value.activeSideKey) return null
  const anchors = counters.value.filter(rule.anchors)
  const moved = counters.value.some((other) => movedThisTurnIds.value.has(String(other.id)) && sideOfCounter(other) === side)
  if (moved || anchors.length >= rule.total) return new Set()
  return new Set(anchors.map((anchor) => anchor.col + ',' + anchor.row))
}
/** Le renfort `counter` peut-il être posé dans la phase en cours ? */
function canPlaceNow(counter) {
  const dummyHexes = playerDummyHexes(counter)
  return dummyHexes ? dummyHexes.size > 0 : canPlaceReinforcementNow(counter)
}

function onReinforcementSelect(id) {
  if (inputLocked.value) return
  const counter = reinforcements.value.find((counter) => String(counter.id) === String(id))
  if (!canControl(counter) || !canEnterThisTurn(counter) || !canPlaceNow(counter)) return
  // Désélection du pion en cours AVANT de choisir le renfort : refusée si ce
  // pion est en overstack (cf. setSelectedCounter), et le renfort n'est
  // alors pas sélectionné non plus.
  if (!setSelectedCounter(null)) return
  selectedReinforcementId.value = selectedReinforcementId.value === id ? null : id
}

// --- Empilement (stacking) au mouvement normal -----------------------------
// Une unité ne peut jamais TERMINER sa phase de Mouvement sur un hex qui
// compte déjà autant d'unités AMIES que la limite de son camp (cf.
// lib/rules.js::stackingLimitOf) — cf. lib/useAssisted.js::wouldOverstack/
// canLeaveAfterEntering (déplacées là-bas pour être réutilisées telles
// quelles par lib/useDebug.js, cf. plus bas : le surlignage vert de la
// portée complète en mode debug doit lui aussi exclure ces hex). Ne concerne
// QUE le mouvement normal d'un pion déjà sur la carte (cf. onHex ci-dessous)
// — pas l'entrée en jeu d'un renfort, qui a ses propres règles de blocage
// (cf. `isEntryHexBlocked` plus haut : ennemi, ou ami figé en ZOC).

/** Clic sur un MARQUEUR : jamais sélectionnable, il ne fait que recouvrir
 *  son hex — le clic vaut donc clic sur cet hex (cf. `onHex` : y poser un
 *  renfort, y déplacer l'unité sélectionnée...). */
function onMarkerClick(id) {
  const marker = counters.value.find((counter) => String(counter.id) === String(id))
  if (!marker) return
  const hex = hexes.value.find((candidate) => candidate.c === marker.col && candidate.r === marker.row)
  if (hex) onHex(hex)
}

/** Clic sur un hex, par ordre de priorité :
 *  1. un renfort est sélectionné (système 2) et l'hex cliqué fait partie de
 *     ses hex d'entrée valides -> il s'y pose, fin de sélection, et paie le
 *     coût d'entrée de cet hex, congestion comprise (cf.
 *     lib/useAssisted.js::spendEntryCost) ;
 *  2. un pion déjà sur la carte est sélectionné, l'hex cliqué lui est
 *     adjacent, il lui reste assez de MP pour en payer le coût de terrain
 *     (cf. lib/useAssisted.js::canEnterHex/spendMp) ET l'hex n'est pas
 *     occupé par un ami avec lequel il finirait "coincé" (cf.
 *     `wouldOverstack`/`canLeaveAfterEntering` ci-dessus) -> il s'y
 *     déplace (et reste sélectionné, pour enchaîner sur d'autres hex tant
 *     qu'il lui reste des MP) ;
 *  3. sinon, le clic ne fait rien (pas de pion/renfort concerné par cet hex).
 *  Aucune action pendant un rejeu en cours (cf. `replayLocked`) — seul le
 *  lecteur (stepReplay/fastForwardReplay) fait bouger la carte tant que le
 *  journal chargé n'est pas entièrement joué. */
const onHex = (hex) => {
  if (inputLocked.value) return
  if (onManualRecon(hex)) return
  if (selectedReinforcementId.value != null) {
    if (isEntryHex(hex)) {
      const reinforcement = selectedReinforcement.value
      // Leurre posé AVANT le mouvement (cf. `playerDummyHexes`) : ni coût
      // d'entrée, ni sélection — le joueur enchaîne d'abord ses autres
      // poses.
      const dummyDrop = !!playerDummyHexes(reinforcement)
      if (reinforcement && canEnterThisTurn(reinforcement) && (!dummyDrop || canPlaceNow(reinforcement))) {
        const placed = { ...instanceOf(reinforcement), col: hex.c, row: hex.r }
        counters.value.push(placed)
        // Entré pendant ce pas : soumis à la règle d'empilement (cf.
        // lib/useAssisted.js::actedThisStep).
        noteEntered(placed)
        // cf. lib/useAssisted.js::spendEntryCost, qui ne fait rien hors mode
        // Assisté.
        const paysEntry = !dummyDrop
        const paid = paysEntry ? spendEntryCost(placed, hex) : null
        emit('move', { counterId: placed.id, col: hex.c, row: hex.r })
        // Hex d'entrée CONGESTIONNÉ (au moins une autre entrée par ce même hex
        // ce tour-ci, cf. lib/useAssisted.js::entryCost) : le journal le
        // signale, avec le coût majoré réellement payé.
        const congestion = paid && paid.cost > paid.baseCost
          ? ` — ${t('log.congestion', { rank: paid.rank, cost: paid.cost, base: paid.baseCost })}`
          : ''
        // `entry` : il a payé un coût d'entrée — au rejeu, on le repaie pour
        // rétablir aussi la CONGESTION de cet hex (cf. applyReplayEntry, qui
        // recalcule le coût lui-même : `entryRank`/`entryCost` ne sont là que
        // pour information).
        log('place', t('log.enters', { unit: reinforcement.name, hex: hexId(hex.c + 1, hex.r) }) + mpText(placed) + congestion,
          { counterId: placed.id, col: hex.c, row: hex.r, mp: spentMpOf(placed), entry: paysEntry,
            entryRank: paid?.rank ?? null, entryCost: paid?.cost ?? null })
        // Sélectionné automatiquement après son entrée en jeu, pour pouvoir
        // enchaîner tout de suite sur son mouvement (cf. onHex, branche
        // mouvement normal) sans avoir à recliquer dessus — comme un pion
        // déjà sur la carte qui vient de se déplacer (cf. `setSelectedCounter`,
        // qui gère aussi le verrouillage d'un éventuel pion PRÉCÉDEMMENT
        // sélectionné ayant déjà bougé, cf. section "Verrouillage" plus haut).
        // SAUF à la mise en place, où rien ne bouge.
        if (phase.value !== PHASE_SETUP && !dummyDrop) setSelectedCounter(placed.id)
      }
      // Un pion en nombre illimité reste choisi : chaque clic en pose un autre
      // — tant qu'il en reste à poser (cf. `canPlaceNow`).
      if (!reinforcement?.multiple || !canPlaceNow(reinforcement)) selectedReinforcementId.value = null
    }
    return
  }
  if (selectedCounterId.value != null && isAdjacent(hex) && (phase.value == null || phase.value === 0)) {
    const found = counters.value.find((counter) => counter.id === selectedCounterId.value)
    // Seul le camp actif bouge ses pions : un pion de l'autre camp resté
    // sélectionné (piste à phases entremêlées, cf. le watcher de
    // `turnInfo.step`) ne se déplace pas.
    const counter = found && canControl(found) ? found : null
    // Position de départ capturée AVANT tout déplacement — sert à la fois à
    // l'historique (from ci-dessous) et de paramètre "from" pour
    // canEnterHex/spendMp (cf. useAssisted.js — l'arête franchie dépend de
    // d'où on VIENT, pas seulement de l'hex d'arrivée).
    const from = counter ? { col: counter.col, row: counter.row } : null
    const fromHex = counter ? { c: from.col, r: from.row } : null
    // Empilement : `h` est occupé par un ami ET `c` ne pourrait plus repartir
    // ensuite -> comme si l'hex n'était pas une destination valide (cf.
    // `wouldOverstack`/`canLeaveAfterEntering` plus haut) — une unité ne
    // peut jamais TERMINER sa phase de Mouvement sur un hex ami.
    const stackingBlocked = counter && wouldOverstack(counter, hex) && !canLeaveAfterEntering(counter, hex, fromHex)
    // Pas assez de MP pour entrer dans cet hex (cf. useAssisted.js) : le
    // pion reste sélectionné et sur place, comme si l'hex n'était pas une
    // destination valide — libre à l'utilisateur d'essayer un autre hex
    // adjacent moins coûteux.
    if (counter && !stackingBlocked && canEnterHex(counter, hex, fromHex)) stepCounter(counter, hex)
    return
  }
}

/** Avance `counter` d'un pas vers l'hex adjacent `hex` (`{ c, r }`), déjà
 *  jugé permis : MP, réseau, journal, retour arrière, liseré (cf. onHex,
 *  `runAutoMoves`). */
function stepCounter(counter, hex) {
  const from = { col: counter.col, row: counter.row }
  const fromHex = { c: from.col, r: from.row }
  const previousEntry = counter.enteredFrom ?? null
  counter.col = hex.c; counter.row = hex.r
  counter.enteredFrom = entryFromMove(from, { col: hex.c, row: hex.r })
  spendMp(counter, hex, fromHex)
  emit('move', { counterId: counter.id, col: counter.col, row: counter.row })
  const journalId = log('move', t('log.moves', { unit: counter.name, hex: hexId(hex.c + 1, hex.r) }) + mpText(counter),
    { counterId: counter.id, col: counter.col, row: counter.row, mp: spentMpOf(counter), enteredFrom: counter.enteredFrom })
  pushMoveHistory(counter.id, from, { col: counter.col, row: counter.row }, journalId, previousEntry)
  markMoved(counter.id, from, previousEntry)
  autoMoveRecorder?.(counter, from)
}

// --- Pions à HEX-OBJECTIF (cf. lib/moduleRules.js::autoMoveTarget — ex.
// leurres et task forces japonaises de la mer de Corail) : au début de
// chaque phase de Mouvement de leur camp (`moduleRules.autoMoveSide`),
// l'appli les avance elle-même vers leur objectif, pas à pas le long du plus
// court chemin (cf. lib/autoMove.js), tant que les règles du mode Assisté le
// permettent (MP du tour, terrain, ZOC, empilement — mêmes contrôles qu'un
// clic, cf. onHex). Chaque pas est un déplacement ordinaire : journalisé,
// partagé en ligne, annulable. Une seule fois par pas de la piste ; en
// ligne, seul le navigateur de ce camp les joue (les autres reçoivent les
// mouvements). Jamais pendant un rejeu, ni en mode Libre (pas de MP).
let autoMovedStep = null
function runAutoMoves() {
  const side = moduleRules.autoMoveSide
  if (!side || !props.assisted || isReplaying.value || replayLocked.value) return
  if (phase.value !== 0 || turnInfo.value.activeSideKey !== side) return
  if (props.online && props.localSide !== side) return
  const step = turnInfo.value.step
  if (autoMovedStep === step) return
  autoMovedStep = step
  // Pas joués, par pion dans l'ordre où ils bougent : montrés ensuite un
  // pion après l'autre (cf. `animateAutoMoves`).
  const moves = new Map()
  autoMoveRecorder = (counter, from) => {
    const key = String(counter.id)
    if (!moves.has(key)) moves.set(key, [from])
    moves.get(key).push({ col: counter.col, row: counter.row })
  }
  try {
    planAutoMoves()
  } finally {
    autoMoveRecorder = null
  }
  animateAutoMoves(moves)
}

/** Déplacements automatiques du moteur (cf. `runAutoMoves`), joués d'un
 *  coup : positions, MP et journal sont aussitôt à jour. */
function planAutoMoves() {
  // Suiveurs (cf. `moduleRules.followTarget`) : meneur de chacun, résolu
  // AVANT tout mouvement — un suiveur dont le meneur a disparu reprend
  // alors son objectif et marche comme un meneur.
  const leaderOf = new Map()
  for (const counter of counters.value) {
    const leader = moduleRules.followTarget(counter, counters.value)
    if (leader) leaderOf.set(counter, leader)
  }
  for (const counter of counters.value) {
    if (leaderOf.has(counter)) continue
    // Mouvement particulier du module (cf. `moduleRules.movementPlan`) : il
    // remplace la marche vers l'hex-objectif. La décision de l'IA va au
    // journal (cf. `logAiDecision`).
    const objective = moduleRules.autoMoveTarget(counter)
    const plan = moduleRules.movementPlan(counter, counters.value, turnInfo.value.turn, movementAllowance,
      (decision) => logAiDecision(counter, decision, objective))
    if (plan?.kind === 'attack') {
      walkToward(counter, plan.target,
        (next) => plan.hold && hexDistance(next, plan.target) <= plan.radius,
        (pos) => hexDistance(pos, plan.target) <= plan.radius)
    } else if (plan?.kind === 'avoid') {
      // Vers l'objectif sans entrer à `range` hex ou moins des unités à
      // éviter — ou, si l'on y est déjà, en s'en éloignant à chaque pas.
      const gap = (hex) => Math.min(...plan.avoid.map((avoided) => hexDistance(avoided, hex)))
      const away = (from, to) => gap(to) > plan.range || gap(to) > gap(from)
      if (gap(counter) > plan.range && objective) walkToward(counter, objective, () => false, () => false, away)
      else walkToward(counter, farthestFrom(counter, plan.avoid), () => false, (pos) => gap(pos) > plan.range, away)
    } else if (objective) {
      walkToward(counter, objective, () => false)
    }
  }
  // Puis les suiveurs, chacun une fois son meneur déplacé (chaînes
  // d'escortes comprises) — cf. `moveFollower`.
  const pending = new Set(leaderOf.keys())
  while (pending.size) {
    const ready = [...pending].filter((counter) => !pending.has(leaderOf.get(counter)))
    for (const counter of ready.length ? ready : [...pending]) {
      pending.delete(counter)
      moveFollower(counter, leaderOf.get(counter))
    }
  }
}

/** Un suiveur bouge TOUJOURS, s'il a des MP : rester immobile à côté d'un
 *  voisin qui avance trahirait qui mène (souvent un porte-avions). Il finit
 *  sur un hex voisin de son meneur, autre que le sien et, si possible, pas
 *  sur celui du meneur — un libre d'abord, au hasard parmi ceux à sa portée.
 *  Trop loin pour en atteindre un, il se rapproche du meneur. Un suiveur
 *  posé sur l'hex de son meneur (leurre d'un renfort, cf.
 *  `reinforceDummies`) s'en écarte de même. Jamais vers un hex que la
 *  règle du module lui interdit (cf. `moduleRules.barredHexes`). */
function moveFollower(counter, leader) {
  const mp = remainingMp(counter) ?? Infinity
  if (mp <= 0) return
  const hexKey = (hex) => hex.col + ',' + hex.row
  const occupied = new Set(counters.value.filter((other) => isUnit(other) && other !== counter).map(hexKey))
  const barred = moduleRules.barredHexes(counter, counters.value)
  const around = shuffled(playAdjacentHexes(counter, leader.col, leader.row)
    .filter((hex) => hexKey(hex) !== hexKey(counter) && hexDistance(counter, hex) <= mp && !barred?.has(hexKey(hex))))
  const from = hexKey(counter)
  // Le chemin contourne l'hex du meneur : à court de MP, le suiveur ne doit
  // pas s'y arrêter en route.
  const avoidLeader = (_, to) => hexKey(to) !== hexKey(leader)
  for (const hex of [...around.filter((hex) => !occupied.has(hexKey(hex))), ...around.filter((hex) => occupied.has(hexKey(hex)))]) {
    walkToward(counter, hex, () => false, (pos) => hexKey(pos) === hexKey(hex), avoidLeader)
    if (hexKey(counter) !== from) return
  }
  if (hexDistance(counter, leader) > 1) {
    walkToward(counter, { col: leader.col, row: leader.row },
      (next) => next.col === leader.col && next.row === leader.row, (pos) => hexDistance(pos, leader) <= 1)
  }
}
/** Copie de `list` dans un ordre tiré au hasard. */
function shuffled(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// --- Décisions de l'IA (cf. lib/ai/decisionTree.js) : chaque task force que
// le moteur déplace inscrit au journal le chemin suivi dans l'arbre de
// décision et ce qu'elle a décidé (entrée `ai`), juste avant ses pas ; de
// même chaque hex qu'il choisit d'explorer (cf. `logAiRecon`). L'entrée est
// toujours écrite — l'export et le rapport de bug la gardent — mais n'est
// AFFICHÉE qu'en mode debug (cf. JournalPanel.vue, prop `debug`, sur fond
// aux couleurs du camp de l'IA) : elle dévoile l'identité secrète des
// leurres. Le rejeu l'ignore (cf. applyReplayEntry).
const aiHex = (hex) => hexId(hex.col + 1, hex.row)
/** Chemin suivi dans un arbre (`trace` de decisionTree.js::decide), en clair. */
const aiPathText = (trace) => trace.map(({ question, answer }) => (typeof answer === 'boolean'
  ? t('ai.step', { question: t(`ai.questions.${question}`), answer: t(answer ? 'ai.yes' : 'ai.no') })
  : t(`ai.answers.${question}.${answer}`))).join(' › ')
/** Nom d'une unité du moteur, avec son identité secrète (cf.
 *  `moduleRules.privateLabel`). */
function aiUnitName(counter) {
  const label = moduleRules.privateLabel(counter)
  return label && label !== counter.name ? `${counter.name} (${label})` : counter.name
}

/** Mouvement que le moteur a décidé pour `counter` (cf.
 *  `moduleRules.movementPlan`, `planAutoMoves`), au journal de l'IA. */
function logAiDecision(counter, { side, action, trace, plan }, objective) {
  const actionText = {
    objective: () => (objective ? t('ai.actions.objective', { hex: aiHex(objective) }) : t('ai.actions.noObjective')),
    avoid: () => t('ai.actions.avoid', { range: plan.range, count: plan.avoid.length }, plan.avoid.length),
    attack: () => t('ai.actions.attack', { radius: plan.radius, hex: aiHex(plan.target) }),
    // Arrêt à `radius` + 1 hex, cf. planAutoMoves.
    hold: () => t('ai.actions.hold', { radius: plan.radius + 1, hex: aiHex(plan.target) }),
  }[action]?.() ?? action
  log('ai', t('ai.entry', { side: sideLabel(side), unit: aiUnitName(counter), path: aiPathText(trace), action: actionText }),
    { side, counterId: counter.id, action, trace, plan })
}

/** Hex que le moteur a choisi d'explorer (cf. `moduleRules.reconChoice`,
 *  `continueEngineRecon`), au journal de l'IA. */
function logAiRecon({ source, target, side, action, priority, trace, options }) {
  const sourceUnit = source.unitId && counters.value.find((counter) => String(counter.id) === source.unitId)
  const from = source.base ?? (sourceUnit ? aiUnitName(sourceUnit) : source.name)
  log('ai', t('ai.reconEntry', { side: sideLabel(side), from, hex: aiHex(target), path: aiPathText(trace),
    action: t(`ai.actions.${action}`, { priority }), options: t('ai.reconOptions', { count: options }, options) }),
    { side, recon: true, source: source.key, target: { col: target.col, row: target.row }, action, priority, trace, options })
}

// --- Animation des déplacements automatiques : le moteur joue tous ses pas
// d'un coup (cf. `runAutoMoves`), puis la carte les MONTRE un pion après
// l'autre, chacun glissant d'hex en hex (`AUTO_MOVE_HEX_MS` par hex). Les
// pions qui attendent leur tour restent affichés à leur hex de départ
// (`autoMoveHeld`), celui qui bouge à sa position en cours (`autoMovePx`) ;
// leurs pions de repérage les suivent. Tant que dure l'animation, la saisie
// et la piste de tour sont fermées (cf. `phaseControlsLocked`). Rien n'est
// animé au rejeu (cf. `runAutoMoves`).
const AUTO_MOVE_HEX_MS = 800
// Pause entre deux pions.
const AUTO_MOVE_GAP_MS = 150
let autoMoveRecorder = null // (pion, hex de départ du pas) => void, pendant `runAutoMoves`
const autoMoveHeld = ref(new Map()) // id -> { col, row } affiché, tant que le pion n'a pas fini
const autoMovePx = ref(null) // { id, x, y } : pion en train de glisser
const autoMoveAnimating = computed(() => autoMoveHeld.value.size > 0)
let autoMoveFrame = null

/** Centre en pixels de l'hex (même formule que Counter.vue). */
function hexCenterPx({ col, row }) {
  const { x0, y0, colStep, rowStep } = calibration
  return { x: x0 + col * colStep, y: y0 + (row - 1) * rowStep + (col % 2 === 1 ? rowStep / 2 : 0) }
}
// Accélère puis freine sur chaque hex : on compte les hex parcourus.
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2)

/** Montre les pas `moves` (id -> [départ, hex 1, hex 2...]), pion par pion. */
function animateAutoMoves(moves) {
  stopAutoMoveAnimation()
  const queue = [...moves].map(([id, path]) => ({ id, path })).filter((move) => move.path.length > 1)
  if (!queue.length) return
  autoMoveHeld.value = new Map(queue.map((move) => [move.id, move.path[0]]))
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  let index = 0
  let startedAt = null
  const frame = (now) => {
    const move = queue[index]
    startedAt ??= now
    const elapsed = now - startedAt
    const steps = move.path.length - 1
    if (elapsed >= steps * AUTO_MOVE_HEX_MS) {
      // Arrivé : le pion reprend sa vraie position ; au suivant, après une pause.
      const held = new Map(autoMoveHeld.value)
      held.delete(move.id)
      autoMoveHeld.value = held
      autoMovePx.value = null
      index += 1
      startedAt = now + AUTO_MOVE_GAP_MS
      if (index >= queue.length) { autoMoveFrame = null; return }
    } else if (elapsed >= 0) {
      const step = Math.floor(elapsed / AUTO_MOVE_HEX_MS)
      const from = hexCenterPx(move.path[step])
      const to = hexCenterPx(move.path[step + 1])
      // Mouvement réduit : le pion saute d'hex en hex, au même rythme.
      const k = reduced ? 0 : easeInOut((elapsed - step * AUTO_MOVE_HEX_MS) / AUTO_MOVE_HEX_MS)
      autoMovePx.value = { id: move.id, x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }
    }
    autoMoveFrame = requestAnimationFrame(frame)
  }
  autoMoveFrame = requestAnimationFrame(frame)
}

function stopAutoMoveAnimation() {
  if (autoMoveFrame != null) cancelAnimationFrame(autoMoveFrame)
  autoMoveFrame = null
  autoMoveHeld.value = new Map()
  autoMovePx.value = null
}

/** Hex où AFFICHER `counter` : son hex de départ s'il attend d'être animé
 *  (ou celui de l'unité qu'il suit, pour un pion de repérage). */
function shownHex(counter) {
  return autoMoveHeld.value.get(String(counter.attachedTo ?? counter.id)) ?? counter
}
/** Position en pixels de `counter` s'il est en train de glisser, ou `null`. */
function shownPx(counter) {
  const px = autoMovePx.value
  return px && px.id === String(counter.attachedTo ?? counter.id) ? px : null
}

/** Hex de la carte le plus éloigné des hex `avoided` (au plus près de
 *  `counter` à éloignement égal) — but d'une fuite (cf. `runAutoMoves`). */
function farthestFrom(counter, avoided) {
  let best = null
  for (const hex of hexes.value) {
    const cell = { col: hex.c, row: hex.r }
    const gap = Math.min(...avoided.map((other) => hexDistance(other, cell)))
    const near = hexDistance(counter, cell)
    if (!best || gap > best.gap || (gap === best.gap && near < best.near)) best = { cell, gap, near }
  }
  return best?.cell ?? { col: counter.col, row: counter.row }
}

/** Avance `counter` pas à pas vers `target` le long du plus court chemin,
 *  tant que les règles du mode Assisté le permettent (cf. `runAutoMoves`).
 *  S'arrête avant un pas `refuse(next)`, ou après un pas qui l'amène en
 *  `pos` tel que `done(pos)`. `allowStep(from, to)` (hex `{ col, row }`)
 *  écarte des pas du chemin lui-même, qui contourne alors ce qu'il refuse.
 *  Empilement : il traverse un hex occupé par des unités AMIES, mais ne
 *  s'y arrête pas si elles y sont déjà autant que la limite d'empilement
 *  de son camp (cf. lib/rules.js::stackingLimitOf — il s'arrête alors
 *  avant ; sans limite, il s'y arrête librement) ; un hex occupé par
 *  l'ennemi, il ne s'y aventure pas, ni dans un hex que la règle du module
 *  lui interdit (cf. `moduleRules.barredHexes` — ex. un leurre à côté
 *  d'une task force ennemie). */
function walkToward(counter, target, refuse, done = () => false, allowStep = () => true) {
  const hexKey = (hex) => hex.col + ',' + hex.row
  const others = counters.value.filter((other) => isUnit(other) && other.id !== counter.id)
  const hostile = new Set(others.filter((other) => isEnemyOf(counter, other)).map(hexKey))
  const barred = moduleRules.barredHexes(counter, counters.value)
  const path = pathToward({ col: counter.col, row: counter.row, enteredFrom: counter.enteredFrom ?? null }, target, {
    hexOnMap,
    // Le pion tel qu'il serait en `from`, entré par `enteredFrom` : les
    // règles du terrain (passages d'île compris) jugent alors chaque pas
    // du chemin, pas seulement le premier.
    canStep: (from, to, enteredFrom) => !hostile.has(to.c + ',' + to.r) && !barred?.has(to.c + ',' + to.r)
      && allowStep({ col: from.c, row: from.r }, { col: to.c, row: to.r })
      && canEnterTerrain({ ...counter, col: from.c, row: from.r, enteredFrom }, to, from),
    cost: (from, to) => terrainCost(to, from),
  })
  // Pas de ce tour-ci, d'après les MP qui restent — puis, s'il finirait sur
  // un hex ami déjà plein, on raccourcit jusqu'au dernier hex où il peut
  // s'arrêter.
  let left = remainingMp(counter) ?? Infinity
  let at = { col: counter.col, row: counter.row }
  const steps = []
  for (const next of path) {
    if (refuse(next)) break
    const cost = terrainCost({ c: next.col, r: next.row }, { c: at.col, r: at.row })
    if (left < cost) break
    left -= cost
    steps.push(next)
    at = next
    if (done(next)) break
  }
  const limit = stackingLimitOf(rules, sideOfCounter(counter))
  const friendsAt = (hex) => others.filter((other) => !isEnemyOf(counter, other) && hexKey(other) === hexKey(hex)).length
  while (steps.length && friendsAt(steps.at(-1)) >= limit) steps.pop()
  for (const next of steps) {
    const hex = { c: next.col, r: next.row }
    if (!canEnterHex(counter, hex, { c: counter.col, r: counter.row })) break
    stepCounter(counter, hex)
  }
}
// --- Camp joué par le MOTEUR (`moduleRules.autoMoveSide` — les Japonais à
// la mer de Corail, le joueur ayant les Alliés) : à chacun de ses pas, il
// fait ses déplacements automatiques (phase de Mouvement, cf.
// `runAutoMoves`) et désigne ses reconnaissances (cf.
// `continueEngineRecon`). Il ne passe JAMAIS la phase lui-même : c'est le
// joueur qui clique "suivant" (cf. onPhaseNext), une fois qu'il a vu ce
// que le moteur a fait. Une seule fois par pas ; jamais pendant un rejeu ;
// en ligne, seulement chez le joueur de ce camp, s'il y en a un.
let engineStepPlayed = null
function playEngineStep() {
  const side = moduleRules.autoMoveSide
  if (!side || !props.assisted || isReplaying.value || replayLocked.value) return
  const step = turnInfo.value.step
  if (turnInfo.value.activeSideKey !== side || step !== turnTrackerRef.value?.currentStep) return
  if (props.online && props.localSide !== side) return
  if (engineStepPlayed === step) return
  engineStepPlayed = step
  if (phase.value === 0) runAutoMoves()
  runEngineRaid()
  continueEngineRecon()
}

// --- Raids aériens du moteur (`moduleRules.raidPhase` — "Opérations
// aériennes" de la mer de Corail, cf. lib/useCoralSea.js::raidPlan) : à son
// créneau de cette phase, le moteur frappe une cible et pose sur elle le
// pion du raid ("IJN Raid", un par raid, cf. `raid.marker`). Il suit sa
// cible (`attachedTo`) et quitte la carte dès la fin du raid (cf.
// `endRaid`) — au plus tard au tour suivant. Inscrit au journal (entrée
// `raid`), d'où le rejeu et les autres joueurs le reprennent.
function runEngineRaid() {
  if (!moduleRules.raidPhase || turnTrackerRef.value?.currentSlot?.phase !== moduleRules.raidPhase) return
  if (turnInfo.value.activeSideKey !== moduleRules.raidSide) return
  // Une entrée par cible (cf. `moduleRules.raidPlan`, qui les concentre).
  for (const raid of moduleRules.raidPlan(counters.value)) {
    const target = counters.value.find((counter) => String(counter.id) === raid.targetId)
    if (!target) continue
    const raiders = raid.raiders.map((raider) => raider.name).join(', ')
    const markers = [{ id: `raid-${newUid()}`, name: raid.marker.name, code: raid.marker.name, type: 'marker', faction: 'markers',
      src: raid.marker.src, col: target.col, row: target.row, raid: raid.raiders.map((raider) => raider.tf).join(','), attachedTo: raid.targetId, ...placedWhen() }]
    placeRaidMarkers(markers)
    moduleRules.launchRaid((raid.planes ?? []).map((plane) => plane.key))
    const strike = raid.attacks
      ? { planes: raid.planes, attacks: raid.attacks, estimatedPoints: raid.estimatedPoints, expectedPoints: raid.expectedPoints }
      : null
    log('raid', t('log.raid', { unit: target.name, hex: hexId(target.col + 1, target.row), raiders })
      + (strike ? ` ${raidStrikeText(strike)}` : ''), { markers, raiders, ...(strike && { strike }) })
    // Personne ici pour le dérouler (cible dont ce joueur ne voit pas la
    // composition) : hors ligne, le raid est fini tout de suite ; en ligne,
    // le joueur visé le termine chez lui.
    if (!showRaid({ markers, raiders, strike }) && !props.online) {
      endRaid({ markerIds: markers.map((marker) => marker.id), unit: target.name, planeKeys: (raid.planes ?? []).map((plane) => plane.key) })
    }
  }
}

// Raids montrés au joueur visé, l'un après l'autre : la composition de sa
// task force frappée (TaskForceComposer.vue, lecture seule) avec les avions
// japonais et le navire que vise chaque attaque.
// Le bouton "Terminer le raid" clôt le raid (cf. `endRaid`).
const raidViews = ref([]) // [{ id, fleet, raid, title, markerIds, unit, planeKeys }]
let raidViewCount = 0
/** Montre le raid `{ markers, raiders, strike }` (données de l'entrée
 *  `raid`) au joueur qui voit la composition de sa cible — en jeu, ou reçu
 *  en ligne (cf. `applyRemoteEntry`) ; jamais au rejeu. Vrai s'il est
 *  montré. */
function showRaid({ markers, raiders, strike } = {}) {
  const target = counters.value.find((counter) => String(counter.id) === markers?.[0]?.attachedTo)
  if (!strike?.attacks || !target || !canSeeAlliedFleet(target)) return false
  raidViews.value = [...raidViews.value, { id: ++raidViewCount, fleet: moduleRules.alliedFleet(target),
    // Journal antérieur au pion unique : un pion par task force, à son nom.
    raid: { ...strike, raiders: raiders ?? markers.map((marker) => marker.name).join(', ') },
    title: t('raidView.title', { unit: target.name }), markerIds: markers.map((marker) => marker.id), unit: target.name, targetId: String(target.id),
    planeKeys: strike.planes.map((plane) => plane.key) }]
  return true
}

/** Fin du raid `{ markerIds, unit, planeKeys }` (bouton "Terminer le
 *  raid", cf. TaskForceComposer.vue) : son pion quitte la carte, et ses
 *  avions vont dans la case "Landing from Map" de leur support (cf.
 *  `moduleRules.landFromRaid`). Inscrit au journal (entrée `raidEnd`),
 *  d'où le rejeu et les autres joueurs le reprennent. */
function endRaid({ markerIds, unit, planeKeys }) {
  removeRaidMarkers(markerIds)
  moduleRules.landFromRaid(planeKeys)
  log('raidEnd', t('log.raidEnd', { unit }), { markerIds, planeKeys })
}
// Debug : "Probabilités" du raid montré (cf. RaidOddsModal.vue) — `{ title,
// planes, candidates, chosenId, chosenPoints }`, ou `null`.
const raidOdds = ref(null)
function openRaidOdds() {
  const view = raidViews.value[0]
  if (!view) return
  const planes = view.raid.planes ?? []
  raidOdds.value = { title: t('raidOdds.title', { unit: view.unit }), planes, candidates: moduleRules.raidCandidates(counters.value, planes),
    chosenId: view.targetId, chosenPoints: view.raid.expectedPoints ?? null }
}
function closeRaidView() {
  raidOdds.value = null
  const [view, ...rest] = raidViews.value
  raidViews.value = rest
  if (view) endRaid(view)
}
/** Retire de la carte les pions de raid `ids` — en jeu comme au rejeu. */
function removeRaidMarkers(ids) {
  const gone = new Set((ids ?? []).map(String))
  if (counters.value.some((counter) => gone.has(String(counter.id)))) counters.value = counters.value.filter((counter) => !gone.has(String(counter.id)))
}

/** Plan d'une frappe (cf. `moduleRules.raidPlan`), lisible : navires visés
 *  (par leur nom une fois la cible dévoilée) et groupes d'avions, chasseurs
 *  d'escorte, points de victoire espérés. */
function raidStrikeText({ planes, attacks, expectedPoints }) {
  const points = (value) => value.toLocaleString(currentLocale(), { maximumFractionDigits: 1 })
  const plane = (index) => [planes[index].name, planes[index].code].filter(Boolean).join(' ')
  const attackText = attacks.map((attack) => t('log.raidAttack', {
    target: attack.target.name
      ? [...new Set([attack.target.type, attack.target.name])].join(' ')
      : t(`log.raidTargets.${attack.target.role}`, { n: attack.target.index + 1 }),
    groups: attack.groups.map((group) => group.map(plane).join(' + ')).join(' | '),
    points: points(attack.expectedPoints),
  })).join(' ; ')
  const used = new Set(attacks.flatMap((attack) => attack.groups.flat()))
  const escorts = planes.flatMap((_, index) => (used.has(index) ? [] : [plane(index)]))
  return t('log.raidStrike', { attacks: attackText, points: points(expectedPoints) })
    + (escorts.length ? ` ${t('log.raidEscort', { planes: escorts.join(', ') })}` : '')
}

/** Cycle des avions sur leur support (cf. `moduleRules.airCycle`) pour le
 *  pas courant de la piste et son camp, lus à la source (TurnTracker.vue) :
 *  au rejeu en avance rapide, les entrées `turn` et `rollOrder` l'appellent
 *  pas à pas, les watchers ne voyant que le dernier. Sans effet s'il a déjà
 *  joué pour ce pas. */
function runAirCycle() {
  const step = turnTrackerRef.value?.currentStep
  if (step == null) return
  moduleRules.airCycle(step, turnTrackerRef.value?.currentSlot?.phase ?? null, sideOfStep(trackConfig, step, turnTrackerRef.value?.rollOrders))
}
watch([() => turnInfo.value.step, () => turnInfo.value.activeSideKey], runAirCycle)

/** Pose les pions d'un raid — en jeu comme au rejeu. Sa cible est désormais
 *  CONNUE du camp qui l'a frappée (cf. `moduleRules.noteRaided`, bordure
 *  verte) : ses pions de reconnaissance (résultats de recherche, "Sighted")
 *  quittent la carte sans retourner dans la tasse, et elle n'a plus d'état
 *  de repérage. */
function placeRaidMarkers(markers) {
  for (const marker of markers ?? []) moduleRules.noteRaided(marker.attachedTo, marker.placedTurn ?? turnInfo.value.turn)
  const targets = new Set((markers ?? []).map((marker) => String(marker.attachedTo)))
  const recon = (counter) => (counter.searchResult || counter.sighted) && targets.has(String(counter.attachedTo))
  if (counters.value.some(recon)) counters.value = counters.value.filter((counter) => !recon(counter))
  if ([...targets].some((id) => sightings.value.has(id))) {
    sightings.value = new Map([...sightings.value].filter(([id]) => !targets.has(id)))
  }
  const fresh = (markers ?? []).filter((marker) => !counters.value.some((counter) => counter.id === marker.id))
  if (fresh.length) counters.value = [...counters.value, ...fresh.map((marker) => ({ ...marker }))]
}
// Tour en cours, pour le statut des task forces connues (cf.
// `moduleRules.isKnownTarget`).
watch(() => turnInfo.value.turn, (turn) => moduleRules.noteTurn(turn), { immediate: true })
watch([phase, () => turnInfo.value.step, () => turnInfo.value.activeSideKey, isReplaying], () => nextTick(playEngineStep))

// --- Reconnaissance (`moduleRules.reconPhase` — cf. lib/useCoralSea.js) :
// pendant cette phase, chaque SOURCE de reconnaissance du camp actif
// (`moduleRules.reconChecks` — base aérienne, porte-avions) explore jusqu'à
// `checks` hex différents de sa portée. Un chit est tiré de la tasse de
// recherche, son pion posé sur l'unité explorée et son résultat appliqué
// (cf. `performSearch`, entrée `search` du journal).
//   - Camp du MOTEUR (`moduleRules.autoMoveSide`) : parmi les sources qui
//     ont encore un check et une cible, il choisit une source et l'une de
//     ses cibles (surlignée sur la carte) par l'IA de repérage du module
//     (`moduleRules.reconChoice` — à la mer de Corail, celle du scénario ;
//     décision inscrite au journal, cf. `logAiRecon` — au hasard sans IA),
//     et attend : le joueur ouvre le
//     "Rapport de reconnaissance" d'un clic droit sur une unité de cet hex
//     (cf. `reportRecon`). Puis la source suivante ; quand il n'en reste
//     plus, le joueur passe la phase ("suivant").
//   - Camp du JOUEUR (`moduleRules.manualReconSide`) : il clique une source
//     (surlignée), puis une cible à sa portée (cf. `onManualRecon`). Le chit
//     tiré lui reste caché — un pion "Search" générique le remplace sur la
//     carte — et un toast lui dit ce que ses avions ont vu.
const reconTarget = ref(null) // { col, row, source: { key, base, checks } } | null
// Checks déjà faits par chaque source, sous la clé "pas:source" — le pas de
// la piste, lu sur TurnTracker.vue (à jour tout de suite, même au rejeu),
// suffit à les oublier à la phase suivante. Rétabli par les entrées `search`.
const reconUses = ref(new Map())
const reconUseKey = (key) => `${turnTrackerRef.value?.currentStep}:${key}`
const reconUsesOf = (key) => reconUses.value.get(reconUseKey(key)) ?? 0
function noteReconUse(key) {
  reconUses.value = new Map(reconUses.value).set(reconUseKey(key), reconUsesOf(key) + 1)
}
const isReconTargetHex = (hex) => reconTarget.value?.col === hex.c && reconTarget.value?.row === hex.r
const searchBagLeft = () => Object.values(moduleRules.searchBag?.value ?? {}).some((count) => count > 0)

/** Le camp `side` est-il dans sa phase de reconnaissance ? */
function reconPhaseOf(side) {
  return !!moduleRules.reconPhase && !!side && turnInfo.value.activeSideKey === side
    && turnTrackerRef.value?.currentSlot?.phase === moduleRules.reconPhase
}

/** Checks que le camp `side` peut encore faire : sources qui ont un check
 *  et au moins une cible. */
function openReconChecks(side) {
  return (moduleRules.reconChecks(counters.value, side, turnTrackerRef.value?.currentStep) ?? [])
    .filter((check) => check.targets.length && reconUsesOf(check.source.key) < check.source.checks)
}

/** Désigne le prochain hex à explorer — aucun s'il n'y en a plus (ou si
 *  la tasse de recherche est vide) : le joueur passe alors la phase. */
function continueEngineRecon() {
  reconTarget.value = null
  if (reconPhaseOf(moduleRules.autoMoveSide) && searchBagLeft()) {
    const checks = openReconChecks(moduleRules.autoMoveSide)
    const choice = checks.length ? moduleRules.reconChoice(checks, counters.value) : null
    if (choice) {
      reconTarget.value = { ...choice.target, source: choice.source }
      logAiRecon(choice)
    } else if (checks.length) {
      const check = checks[Math.floor(Math.random() * checks.length)]
      reconTarget.value = { ...check.targets[Math.floor(Math.random() * check.targets.length)], source: check.source }
    }
  }
}

// --- Reconnaissance du joueur : source choisie (clé), en attente de cible.
const manualReconSource = ref(null)
watch(() => turnInfo.value.step, () => { reconTarget.value = null; manualReconSource.value = null })

/** Phase de reconnaissance du camp joué à la main (mode Assisté). */
const manualReconActive = computed(() => props.assisted && reconPhaseOf(moduleRules.manualReconSide))
/** Checks encore possibles pour le joueur (cf. `openReconChecks`). */
const manualReconChecks = computed(() => (manualReconActive.value && searchBagLeft()
  ? openReconChecks(moduleRules.manualReconSide) : []))
const manualReconCheck = computed(() => manualReconChecks.value.find((check) => check.source.key === manualReconSource.value) ?? null)
const isManualReconSourceHex = (hex) => manualReconChecks.value.some((check) => check.source.col === hex.c && check.source.row === hex.r)
const isManualReconChosenHex = (hex) => manualReconCheck.value?.source.col === hex.c && manualReconCheck.value?.source.row === hex.r
const isManualReconTargetHex = (hex) => !!manualReconCheck.value?.targets.some((target) => target.col === hex.c && target.row === hex.r)

/** Clic pendant la reconnaissance du joueur (sur un pion ou un hex) : une
 *  source la choisit, une cible de la source choisie est explorée. Vrai si
 *  le clic a été consommé. */
function onManualRecon(hex, clicked = null) {
  if (!manualReconActive.value) return false
  const source = manualReconChecks.value.find((check) =>
    (clicked && check.source.unitId === String(clicked.id)) || (!clicked && check.source.col === hex.c && check.source.row === hex.r))
  if (source) {
    manualReconSource.value = manualReconSource.value === source.source.key ? null : source.source.key
    return true
  }
  const check = manualReconCheck.value
  if (check && isManualReconTargetHex(hex)) {
    const enemies = counters.value.filter((counter) => counter.col === hex.c && counter.row === hex.r
      && moduleRules.reconTargetOf(counter, moduleRules.manualReconSide))
    const unit = clicked && enemies.includes(clicked) ? clicked : enemies.at(-1)
    if (unit) performSearch(unit, check.source, { hidden: true })
    // Plus rien à faire pour cette source : elle se désélectionne.
    if (!manualReconCheck.value) manualReconSource.value = null
  }
  return true
}

// --- Support de task force (cf. `moduleRules.fleetDisplay`,
// FleetDisplayModal.vue) : pendant SA phase d'Opérations aériennes (mode
// Assisté), le menu du clic droit d'une task force ennemie repérée
// ("Sighted Carrier" ou "Sighted Fleet") propose "Attaque aérienne", qui
// montre ses navires sur leur support — À PORTÉE de ses porte-avions (cf.
// `moduleRules.airStrikeReach`) ; hors de portée, l'entrée est inerte et
// son infobulle dit pourquoi.
const fleetDisplay = ref(null) // { counter, title } | null
// Support montré, à jour (dommages, pertes des avions — cf.
// `moduleRules.fleetDisplay`).
const fleetDisplayLayout = computed(() => fleetDisplay.value && moduleRules.fleetDisplay(fleetDisplay.value.counter))
watch(() => turnInfo.value.step, () => { fleetDisplay.value = null })

const fleetDisplayActive = computed(() => props.assisted && !!moduleRules.fleetDisplayPhase
  && turnInfo.value.activeSideKey === moduleRules.fleetDisplaySide
  && turnTrackerRef.value?.currentSlot?.phase === moduleRules.fleetDisplayPhase)
const isSightedTaskForce = (counter) => ['carrierTF', 'fleetTF'].includes(sightings.value.get(String(counter.id)))

/** Task force ennemie repérée, pendant la phase : ses navires se montrent
 *  si elle est à portée. */
const isFleetDisplayCandidate = (counter) => fleetDisplayActive.value
  && sideOfCounter(counter) !== moduleRules.fleetDisplaySide && isSightedTaskForce(counter)
/** Support de `counter` à montrer maintenant, ou `null`. */
function fleetDisplayOf(counter) {
  if (!isFleetDisplayCandidate(counter) || !moduleRules.airStrikeReach(counter, counters.value)) return null
  return moduleRules.fleetDisplay(counter)
}
/** Hex des task forces dont le support peut s'ouvrir (surlignés). */
const fleetDisplayHexes = computed(() => (fleetDisplayActive.value
  ? new Set(counters.value.filter((counter) => isUnit(counter) && fleetDisplayOf(counter)).map((counter) => counter.col + ',' + counter.row))
  : new Set()))

/** Mode debug : la composition secrète des task forces du moteur se
 *  consulte au clic droit (cf. `openComposition`) — en ligne, par le seul
 *  joueur de ce camp, comme les étiquettes secrètes (cf.
 *  `privateLabelVisible`). */
const debugCompositionVisible = computed(() => debug.value
  && (!props.online || !moduleRules.privateLabelSide || props.localSide === moduleRules.privateLabelSide))
/** Mode debug : montre le support de la task force `counter` (cf.
 *  `moduleRules.fleetDisplay`), à tout moment, repérée ou non. */
function openComposition(counter) {
  if (!moduleRules.fleetDisplay(counter)) return
  fleetDisplay.value = { counter, title: t('fleetDisplay.composition', { unit: privateLabelOf(counter) ?? counter.name, hex: hexId(counter.col + 1, counter.row) }) }
}

/** Ouvre le support de `counter` s'il en a un maintenant (menu "Attaque
 *  aérienne" du clic droit, cf. `onCounterContextMenu`). Vrai s'il s'est
 *  ouvert. */
function openFleetDisplay(counter) {
  const layout = fleetDisplayOf(counter)
  if (!layout) return false
  const sighting = t(`sighting.${sightings.value.get(String(counter.id))}`)
  fleetDisplay.value = { counter, title: t('fleetDisplay.title', { sighting, hex: hexId(counter.col + 1, counter.row) }) }
  return true
}

// --- Dommages des navires (cf. `moduleRules.damageOf`) : le joueur les
// pose au clic droit sur un navire d'un support — japonais (cf.
// FleetDisplayModal.vue) comme le sien (cf. TaskForceComposer.vue), à tout
// moment sauf pendant un rejeu. Inscrits au journal (entrée `shipDamage`).
const shipDamageEditable = computed(() => !!moduleRules.shipDamages && !replayLocked.value)
function setShipDamage({ ship, state }) {
  moduleRules.setShipDamage(ship.key, state)
  log('shipDamage', t('log.shipDamage', { ship: `${ship.type} ${ship.name}`, state: t(`damage.${state}`) }), { key: ship.key, state })
}
/** Pertes d'un avion (cf. `moduleRules.planeStateOf`), posées comme les
 *  dommages d'un navire, sur tout avion d'un support. Entrée `planeState`. */
function setPlaneState({ plane, state }) {
  moduleRules.setPlaneState(plane.key, state)
  log('planeState', t('log.planeState', { plane: [plane.name, plane.code].filter(Boolean).join(' '), state: t(`planeState.${state}`) }), { key: plane.key, state })
}

// --- Combat naval (cf. lib/useCoralSea.js, en-tête "Combat naval", et
// lib/navalCombat.js) : à la phase `moduleRules.navalCombatPhase`, les task
// forces ennemies au contact se battent, un round par tour.
//   1. CONTACT : elles se connaissent désormais (entrée `navalContact`) ;
//   2. ORGANISATION par le camp qui a l'initiative : le moteur la décide
//      (cf. `moduleRules.planNavalBattles`) ; le joueur clique une de ses
//      task forces en contact, puis les task forces ennemies qu'elle attaque
//      — une flèche par attaque —, et valide quand chacune est dans une
//      bataille (rien à choisir : chaque groupe en contact n'en compte que
//      deux). Toutes les task forces reliées forment une bataille ;
//   3. chaque BATAILLE, l'une après l'autre (cf. NavalCombatModal.vue) :
//      portée, attaques, dés ; ses dommages sont posés (entrées
//      `shipDamage`) et elle est inscrite au journal (entrée
//      `navalCombat`), d'où le rejeu sait quelles task forces se sont déjà
//      battues ce tour.
// Le "suivant" reste bloqué tant que des task forces en contact ne se sont
// pas battues (cf. onPhaseNext) ; une partie rechargée en pleine phase
// reprend là. Jamais pendant un rejeu ; en ligne, chez le joueur qui
// affronte le moteur.
const navalOrg = ref(null) // { contacts, side, arrows: [{ from, to }], selected } : organisation par le joueur
const navalArrows = ref([]) // flèches des batailles en cours : [{ from, to }]
const navalQueue = ref(null) // { turn, initiative, battles: [[ids]], index }
const navalView = ref(null) // bataille ouverte : { battle, initiative, title, fleetNames }
const foughtFleets = ref(new Map()) // task force id -> tour de son dernier combat

/** Créneau de la piste en cours s'il est de la phase de combat naval. */
function navalCombatSlot() {
  const slot = turnTrackerRef.value?.currentSlot
  return moduleRules.navalCombatPhase && slot?.phase === moduleRules.navalCombatPhase ? slot : null
}
/** Ce navigateur mène-t-il les combats navals ? */
const navalDriver = () => props.assisted && !isReplaying.value && !replayLocked.value
  && (!props.online || props.localSide !== moduleRules.autoMoveSide)
/** Task forces qui se sont déjà battues ce tour. */
function foughtThisTurn() {
  const turn = turnInfo.value.turn
  return new Set([...foughtFleets.value].filter(([, when]) => when === turn).map(([id]) => id))
}
/** En ligne, chez le joueur qui ne mène pas les combats (cf. `navalDriver`) :
 *  des task forces en contact ne se sont pas encore battues ce tour — l'autre
 *  joueur les joue, ses batailles arrivent par le journal partagé. */
function navalCombatPending() {
  return props.assisted && !!navalCombatSlot() && !navalDriver()
    && moduleRules.navalContacts(counters.value, foughtThisTurn()).length > 0
}
/** Abandonne ici le combat naval en cours (organisation, batailles,
 *  flèches) — rejeu, ou sortie de la phase autrement que par la fin des
 *  batailles (ex. changement de pas venu d'un autre navigateur). */
function clearNavalCombat() {
  navalOrg.value = null
  navalQueue.value = null
  navalView.value = null
  navalArrows.value = []
}
const counterById = (id) => counters.value.find((counter) => String(counter.id) === String(id)) ?? null
/** Nom d'une task force en combat : celui de son vrai pion s'il est connu. */
function navalName(id) {
  const counter = counterById(id)
  return counter ? moduleRules.revealedLook(counter)?.name ?? counter.name : id
}
/** Task forces `ids`, camp par camp : "Japonais : TF 9, TF 7 ; Américains : TF 7". */
function namesBySide(ids) {
  const bySide = new Map()
  for (const id of ids) {
    const side = sideOfCounter(counterDefinition(id))
    bySide.set(side, [...(bySide.get(side) ?? []), navalName(id)])
  }
  return [...bySide].map(([side, names]) => `${sideLabel(side)} : ${names.join(', ')}`).join(' ; ')
}
/** Flèche d'un contact, de la task force du camp `side` vers l'autre. */
const arrowOf = (side) => (contact) => {
  const other = Object.keys(contact).find((key) => key !== side)
  return { from: contact[side], to: contact[other] }
}

/** Lance (ou reprend) le combat naval du tour s'il en reste un à jouer.
 *  Vrai tant qu'il bloque le passage à la suite. */
function startNavalCombat() {
  if (!navalCombatSlot() || !navalDriver()) return false
  if (navalOrg.value || navalQueue.value) return true
  const contacts = moduleRules.navalContacts(counters.value, foughtThisTurn())
  if (!contacts.length) return false
  const turn = turnInfo.value.turn
  const ids = [...new Set(contacts.flatMap((contact) => Object.values(contact)))]
  applyNavalContact(ids, turn)
  log('navalContact', t('log.navalContact', { units: namesBySide(ids) }), { ids, turn })
  const initiative = turnTrackerRef.value?.currentTurnInfo?.initiative ?? turnInfo.value.activeSideKey
  if (initiative === moduleRules.autoMoveSide) {
    const plan = moduleRules.planNavalBattles(contacts, counters.value, turn)
    beginNavalBattles(plan.battles, plan.arrows, initiative)
    return true
  }
  const groups = connectedGroups(contacts.map((contact) => Object.values(contact)))
  if (groups.every((group) => group.length === 2)) beginNavalBattles(groups, contacts.map(arrowOf(initiative)), initiative)
  else navalOrg.value = { contacts, side: initiative, arrows: [], selected: null }
  return true
}

/** Le contact fait se connaître les task forces `ids` (en jeu comme au
 *  rejeu) : celles du moteur, du joueur ; les autres, du moteur. */
function applyNavalContact(ids, turn) {
  for (const id of ids) {
    if (sideOfCounter(counterDefinition(id)) === moduleRules.autoMoveSide) moduleRules.noteRevealed(id, turn)
    else moduleRules.noteRaided(id, turn)
  }
}

/** Organisation par le joueur : clic sur une task force en contact — une
 *  des siennes la choisit, une ennemie au contact de celle choisie reçoit
 *  (ou perd) une flèche. */
function onNavalOrgClick(counter) {
  const org = navalOrg.value
  const id = String(counter.id)
  if (!org.contacts.some((contact) => Object.values(contact).includes(id))) return
  if (sideOfCounter(counter) === org.side) {
    org.selected = org.selected === id ? null : id
    return
  }
  if (!org.selected || !org.contacts.some((contact) => contact[org.side] === org.selected && Object.values(contact).includes(id))) return
  const index = org.arrows.findIndex((arrow) => arrow.from === org.selected && arrow.to === id)
  if (index >= 0) org.arrows.splice(index, 1)
  else org.arrows.push({ from: org.selected, to: id })
}
/** Task forces en contact encore sans bataille (organisation du joueur). */
const navalOrgMissing = computed(() => {
  const org = navalOrg.value
  if (!org) return []
  const linked = new Set(org.arrows.flatMap((arrow) => [arrow.from, arrow.to]))
  return [...new Set(org.contacts.flatMap((contact) => Object.values(contact)))].filter((id) => !linked.has(id))
})
function confirmNavalOrg() {
  const org = navalOrg.value
  if (!org || navalOrgMissing.value.length) return
  beginNavalBattles(connectedGroups(org.arrows.map((arrow) => [arrow.from, arrow.to])), org.arrows.slice(), org.side)
}

/** Les batailles `battles` (ids de task forces) sont décidées par `side` :
 *  au journal, puis la première s'ouvre. */
function beginNavalBattles(battles, arrows, side) {
  navalOrg.value = null
  navalArrows.value = arrows
  const names = (ids) => t('naval.versus', { a: namesBySide(ids.filter((id) => sideOfCounter(counterDefinition(id)) === side)),
    b: namesBySide(ids.filter((id) => sideOfCounter(counterDefinition(id)) !== side)) })
  log('navalBattles', t('log.navalBattles', { side: sideLabel(side), n: battles.length, battles: battles.map(names).join(' ; ') }, battles.length),
    { side, battles, arrows })
  navalQueue.value = { turn: turnInfo.value.turn, initiative: side, battles, index: 0 }
  openNavalBattle()
}

/** Ouvre la bataille suivante de la file, ou clôt le combat naval. */
function openNavalBattle() {
  const queue = navalQueue.value
  if (!queue) return
  if (queue.index >= queue.battles.length) {
    navalQueue.value = null
    navalArrows.value = []
    return
  }
  const ids = queue.battles[queue.index]
  const battle = moduleRules.navalBattle(ids, counters.value, queue.turn)
  const fleetNames = Object.fromEntries(Object.keys(battle.ships).map((side) => [side,
    ids.filter((id) => sideOfCounter(counterDefinition(id)) === side).map(navalName).join(', ')]))
  const when = t(battle.night ? 'naval.night' : 'naval.day')
  navalView.value = { battle, initiative: queue.initiative, fleetNames,
    title: t('naval.title', { n: queue.index + 1, total: queue.battles.length, when, turn: queue.turn }) }
}

/** Fin d'une bataille (cf. NavalCombatModal.vue) : au journal, puis ses
 *  dommages — le dernier état de chaque navire touché —, et la suivante. */
function onNavalBattleDone({ range, results }) {
  const queue = navalQueue.value
  const { battle, fleetNames } = navalView.value
  const ships = new Map(Object.values(battle.ships).flat().map((ship) => [ship.key, ship]))
  const shipName = (key) => `${ships.get(key)?.type ?? ''} ${ships.get(key)?.name ?? key}`.trim()
  const lines = results.map((result) => t('naval.logAttack', { side: result.side.toUpperCase(),
    shooters: result.shooters.map(shipName).join(' + '), firepower: result.firepower, target: shipName(result.target),
    die: result.die, bonus: result.bonus ? `+${result.bonus}` : '', damage: result.damage, outcome: t(`naval.state.${result.after}`) }))
  const where = Object.entries(fleetNames).map(([side, names]) => `${sideLabel(side)} (${names})`).join(` ${t('naval.against')} `)
  const when = battle.night ? t('naval.night') : t('naval.dayRange', { range: range ?? '—' })
  log('navalCombat', t('log.navalCombat', { fleets: where, when, attacks: lines.join(' ; ') || t('naval.noShot') }),
    { turn: queue.turn, fleetIds: battle.fleetIds, night: battle.night, range, results })
  noteFought(battle.fleetIds, queue.turn)
  const finals = new Map(results.map((result) => [result.target, result.after]))
  for (const [key, state] of finals) {
    const ship = ships.get(key)
    if (ship && state !== ship.damage) setShipDamage({ ship, state })
  }
  navalView.value = null
  queue.index += 1
  openNavalBattle()
}
function noteFought(ids, turn) {
  const next = new Map(foughtFleets.value)
  for (const id of ids) next.set(String(id), turn)
  foughtFleets.value = next
}

// Flèches des combats sur la carte : de la task force qui attaque vers sa
// cible, par-dessus les pions.
const navalArrowLines = computed(() => (navalOrg.value?.arrows ?? navalArrows.value).flatMap((arrow) => {
  const from = counterById(arrow.from)
  const to = counterById(arrow.to)
  if (!from || !to) return []
  const a = hexCenterPx(shownHex(from))
  const b = hexCenterPx(shownHex(to))
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const ux = (b.x - a.x) / length
  const uy = (b.y - a.y) / length
  const start = calibration.rowStep * 0.12
  const end = calibration.rowStep * 0.3
  return [{ key: `${arrow.from}>${arrow.to}`, x1: a.x + ux * start, y1: a.y + uy * start, x2: b.x - ux * end, y2: b.y - uy * end }]
}))
// Hex des task forces en contact (organisation du joueur), et celui de la
// task force choisie.
const navalOrgHexes = computed(() => {
  const org = navalOrg.value
  if (!org) return new Map()
  const out = new Map()
  for (const id of new Set(org.contacts.flatMap((contact) => Object.values(contact)))) {
    const counter = counterById(id)
    if (counter) out.set(counter.col + ',' + counter.row, out.get(counter.col + ',' + counter.row) || id === org.selected)
  }
  return out
})

// Nom de chaque camp, pour la modale de bataille.
const navalSideLabels = computed(() => Object.fromEntries(Object.keys(props.module.sides ?? {}).map((side) => [side, sideLabel(side)])))

// Entrée dans la phase de combat naval : il se lance tout seul. Sortie de
// la phase avant la fin des batailles : il est abandonné ici (cf.
// `clearNavalCombat`).
watch(() => turnInfo.value.step, () => nextTick(() => {
  if (!navalCombatSlot()) clearNavalCombat()
  startNavalCombat()
}))

// --- Composition des task forces du joueur (cf. `moduleRules.alliedFleet`,
// TaskForceComposer.vue) : il pose ses pions navires sur le support de
// chacune — à sa mise en place et à sa phase `alliedFleetPhase` en partie
// Assistée, quand il veut en partie Libre. Hors de ces moments, il peut la
// consulter (menu du pion). En ligne, seul ce camp-là la voit. Inscrite au
// journal (entrée `alliedFleet`, toutes les compositions).
const alliedComposer = ref(null) // { counter, fleet, elsewhere, editable, airEditable, title } | null
watch(() => turnInfo.value.step, () => { alliedComposer.value = null })

const alliedFleetEditable = computed(() => {
  const side = moduleRules.alliedFleetSide
  if (!side || replayLocked.value || (props.online && props.localSide !== side)) return false
  if (!props.assisted) return true
  return turnInfo.value.activeSideKey === side
    && (phase.value === PHASE_SETUP || turnTrackerRef.value?.currentSlot?.phase === moduleRules.alliedFleetPhase)
})
/** À sa phase d'Opérations aériennes (`moduleRules.alliedAirPhase`, partie
 *  Assistée), le joueur place librement les avions de ses task forces — pas
 *  leurs navires. */
const alliedAirEditable = computed(() => {
  const side = moduleRules.alliedFleetSide
  if (!side || !props.assisted || !moduleRules.alliedAirPhase || replayLocked.value || (props.online && props.localSide !== side)) return false
  return turnInfo.value.activeSideKey === side && turnTrackerRef.value?.currentSlot?.phase === moduleRules.alliedAirPhase
})
/** Ce joueur peut-il voir la composition de `counter` ? */
function canSeeAlliedFleet(counter) {
  const side = moduleRules.alliedFleetSide
  return !!side && (!props.online || props.localSide === side) && !!moduleRules.alliedFleet(counter)
}

/** Ouvre la composition de `counter`. Vrai si le clic a été consommé. */
function openAlliedFleet(counter, editable) {
  if (!canSeeAlliedFleet(counter)) return false
  const fleet = moduleRules.alliedFleet(counter)
  const elsewhere = new Map([...moduleRules.alliedAssignments()].filter(([, tf]) => tf !== fleet.tf)
    .map(([key, tf]) => [key, counterDefinition(tf)?.name ?? tf]))
  const display = t(`sighting.${fleet.kind}TF`)
  alliedComposer.value = { counter, fleet, elsewhere, editable, airEditable: !editable && alliedAirEditable.value,
    title: t('alliedFleet.title', { unit: counter.name, display }) }
  return true
}

function saveAlliedFleet(cells) {
  const { counter, fleet } = alliedComposer.value
  alliedComposer.value = null
  const fleets = moduleRules.setAlliedFleet(fleet.tf, cells)
  // Les navires seuls : les autres cases rangent les avions.
  const n = Object.keys(cells).filter((cell) => !moduleRules.isAirCell(cell)).length
  log('alliedFleet', t('log.alliedFleet', { unit: counter.name, n }, n), { fleets })
}

/** Pion de résultat de recherche (cf. `moduleRules.searchResults`), posé
 *  sur l'unité `unit`, qu'il suivra (`attachedTo`, cf. `syncSearchMarkers`).
 *  `hidden` : pion "Search" générique, le vrai chit restant caché. `step` :
 *  pas de la piste où il a été tiré (cf. `moduleRules.reconChecks`). */
function searchMarker(result, unit, hidden) {
  const look = moduleRules.searchResults?.[hidden ? 'hidden' : result]
  return { id: `search-${newUid()}`, name: look?.name ?? result, code: look?.name ?? result, type: 'marker',
    faction: 'markers', src: look?.src, col: unit.col, row: unit.row, searchResult: result, attachedTo: String(unit.id),
    step: turnTrackerRef.value?.currentStep ?? null, ...placedWhen() }
}

/** Tour (et heure de la piste) où un pion de repérage est posé — montré
 *  au survol de la pile (cf. `hoveredStackCounters`). */
function placedWhen() {
  return { placedTurn: turnInfo.value.turn, placedTime: turnTrackerRef.value?.currentTurnInfo?.time ?? null }
}

/** Les vraies task forces du camp du joueur (`manualReconSide`) gardent
 *  leur pion une fois repérées, et empilent TOUS les pions de repérage
 *  posés sur elles (résultats de recherche et "Sighted") jusqu'à leur
 *  retour dans la tasse. Les autres unités n'en portent qu'un de chaque, et
 *  leur "Sighted" remplace leur image (cf. `unitSrc`). */
function keepsOwnLook(unit) {
  return !!unit && unit.faction === moduleRules.manualReconSide && unit.code !== 'Dummy'
}

/** Pose le résultat de recherche `marker` sur son unité, à la place de
 *  celui d'une phase précédente (sauf sur une unité qui les empile, cf.
 *  `keepsOwnLook`) — en jeu comme au rejeu. */
function placeSearchMarker(marker) {
  const stacks = keepsOwnLook(counters.value.find((counter) => String(counter.id) === marker.attachedTo))
  counters.value = [...counters.value.filter((counter) => stacks || !(counter.searchResult && counter.attachedTo === marker.attachedTo)), { ...marker }]
}

/** Pion "Sighted" de l'état de repérage `sighting`, posé sur l'unité `unit`
 *  (cf. `moduleRules.sightings`, image selon le camp de l'unité), ou `null`
 *  si cet état n'en pose pas. */
function sightedMarker(sighting, unit) {
  const look = moduleRules.sightings?.[sighting]
  const src = look?.src?.[unit.faction] ?? Object.values(look?.src ?? {})[0]
  if (!src) return null
  return { id: `sighted-${newUid()}`, name: look.name, code: look.name, type: 'marker', faction: 'markers',
    src, col: unit.col, row: unit.row, sighted: sighting, attachedTo: String(unit.id), ...placedWhen() }
}

// État de repérage de chaque unité explorée (cf. `moduleRules.searchOutcome`)
// : id -> clé de `moduleRules.sightings` ("noContact", "carrierTF"...).
// Rétabli au rejeu par les entrées `search`.
const sightings = ref(new Map())

/** Enregistre l'état de repérage d'une unité et remplace son pion
 *  "Sighted" (ou l'empile, cf. `keepsOwnLook`) — en jeu comme au rejeu. */
function applySighting(unitId, sighting, sighted) {
  const key = String(unitId)
  sightings.value = new Map(sightings.value).set(key, sighting)
  moduleRules.noteSighting(key, sighting)
  const stacks = keepsOwnLook(counters.value.find((counter) => String(counter.id) === key))
  if (!stacks) counters.value = counters.value.filter((counter) => !(counter.sighted && counter.attachedTo === key))
  if (sighted) counters.value.push({ ...sighted })
}

/** Pions "Sighted" qui REMPLACENT à l'affichage l'image de leur unité
 *  (drapeau du leurre, ou pion de la task force), sans changer l'unité
 *  elle-même : unité id -> pion. Pas ceux des unités qui gardent leur pion
 *  (cf. `keepsOwnLook`), rendus, eux, sur la pile. */
const replacingSighted = computed(() => {
  const byId = new Map(counters.value.map((counter) => [String(counter.id), counter]))
  return new Map(counters.value.filter((counter) => counter.sighted && counter.attachedTo && !keepsOwnLook(byId.get(counter.attachedTo)))
    .map((counter) => [counter.attachedTo, counter]))
})
const replacesUnitImage = (marker) => replacingSighted.value.get(marker.attachedTo)?.id === marker.id

/** Image affichée d'une unité : son vrai pion si l'adversaire la connaît
 *  (cf. `moduleRules.revealedLook`), sinon celle de son pion "Sighted" s'il
 *  la remplace, sinon la sienne. */
function unitSrc(counter) {
  return moduleRules.revealedLook(counter)?.src ?? replacingSighted.value.get(String(counter.id))?.src ?? counter.src
}

// Toast (cf. Toast.vue) : résultat d'une reconnaissance du joueur, ou
// combat naval en cours chez l'autre joueur (cf. onPhaseNext).
const reconToast = ref(null)

/** Explore l'hex de l'unité `unit` depuis la source `source` : tire UN chit,
 *  pose son pion sur chaque unité explorable de l'hex pour le camp `side`
 *  (`unit` d'abord, cf. `moduleRules.reconTargetOf`), applique à chacune le
 *  résultat (état de repérage, pion "Sighted", leurre retiré du jeu) et
 *  inscrit le tout au journal — une entrée `search`, une seule utilisation
 *  de la source. `hidden` : le chit reste caché au joueur (pion "Search",
 *  journal sans le chit ni le contenu de la tasse), qui reçoit à la place
 *  un toast du résultat. Faux si la tasse est vide. */
function performSearch(unit, source, { hidden = false, side = turnInfo.value.activeSideKey } = {}) {
  const draw = moduleRules.drawSearch()
  if (!draw) return false
  noteReconUse(source.key)
  // Le chit tiré vaut pour TOUTES les unités explorables de l'hex (cf.
  // `moduleRules.reconTargetOf`), celle désignée d'abord : chacune reçoit
  // le résultat selon ce qu'elle est (cf. `moduleRules.searchOutcome`).
  const here = counters.value.filter((counter) => counter !== unit && counter.col === unit.col && counter.row === unit.row
    && !eliminatedIds.value.has(String(counter.id)) && moduleRules.reconTargetOf(counter, side))
  const results = [unit, ...here].map((target) => {
    const marker = searchMarker(draw.result, target, hidden)
    placeSearchMarker(marker)
    const outcome = moduleRules.searchOutcome(draw.result, target) ?? { sighting: null, removed: false }
    const sighted = outcome.sighting ? sightedMarker(outcome.sighting, target) : null
    if (outcome.sighting) applySighting(target.id, outcome.sighting, sighted)
    return { target, marker, outcome, sighted }
  })
  const sightingLabel = results.map(({ outcome }) => (outcome.sighting ? t(`sighting.${outcome.sighting}`) : '—')).join(', ')
  const unitNames = results.map(({ target }) => target.name).join(', ')
  // Un porte-avions du moteur reste anonyme : le nommer trahirait quel
  // leurre le porte. Ceux du joueur sont à découvert.
  const from = source.base ?? (hidden ? source.name : t('log.reconCarrier'))
  const hex = hexId(unit.col + 1, unit.row)
  const sideName = sideLabel(turnInfo.value.activeSideKey)
  const { detected = 0, misdirect = 0, contactLost = 0 } = draw.bag
  const text = hidden
    ? t('log.searchHidden', { side: sideName, from, hex, unit: unitNames, sighting: sightingLabel })
    : t('log.search', { side: sideName, from, hex, unit: unitNames, result: results[0].marker.name, sighting: sightingLabel, detected, misdirect, contactLost })
  // `counter`, `unitId`, `sighting`, `sighted` : la première unité (forme
  // des journaux d'avant `units`).
  const units = results.map(({ target, marker, outcome, sighted }) => ({ counter: marker, unitId: String(target.id), sighting: outcome.sighting, sighted }))
  log('search', text, { ...units[0], units, bag: draw.bag, source: source.key })
  const removed = results.filter(({ outcome }) => outcome.removed)
  for (const { target } of removed) eliminateCounter(target.id, t('log.dummyUnmasked'))
  if (hidden) {
    reconToast.value = { id: results[0].marker.id, text: t(removed.length ? 'recon.toastRemoved' : 'recon.toast', { hex, sighting: sightingLabel }) }
  }
  return true
}

/** "Rapport de reconnaissance" du moteur sur l'unité `unitId` (clic droit) :
 *  explore l'unité depuis la source désignée, puis passe à la suivante. */
function reportRecon(unitId) {
  const target = reconTarget.value
  const unit = counters.value.find((counter) => String(counter.id) === String(unitId))
  if (!target || !unit) return
  performSearch(unit, target.source)
  nextTick(continueEngineRecon)
}

// Un résultat de recherche SUIT son unité (`attachedTo`) : il en reprend
// l'hex à chacun de ses déplacements — en jeu, en ligne comme au rejeu — et
// quitte la carte avec elle (éliminée, replacée, sortie). Il ne reçoit
// aucun clic (cf. `.search-marker`) : on sélectionne et déplace l'unité à
// travers lui, comme s'il n'était pas là.
function syncSearchMarkers() {
  const byId = new Map(counters.value.map((counter) => [String(counter.id), counter]))
  const orphaned = counters.value.some((counter) => counter.attachedTo && !byId.has(counter.attachedTo))
  if (orphaned) counters.value = counters.value.filter((counter) => !counter.attachedTo || byId.has(counter.attachedTo))
  for (const marker of counters.value) {
    const unit = marker.attachedTo && byId.get(marker.attachedTo)
    if (unit && (marker.col !== unit.col || marker.row !== unit.row)) { marker.col = unit.col; marker.row = unit.row }
  }
}
watch(() => counters.value.filter((counter) => counter.attachedTo).map((marker) => {
  const unit = counters.value.find((counter) => String(counter.id) === marker.attachedTo)
  return unit ? `${unit.col},${unit.row}` : '-'
}).join('|'), syncSearchMarkers)

// Tours où les chits de recherche reviennent tous dans la tasse (piste de
// tour, cf. `moduleRules.searchChitsReturn`) : leurs pions quittent la
// carte, et le journal dit combien de chits de chaque sorte sont rentrés
// (entrée `searchRefill`). Les repérages tombent avec eux : pions "Sighted"
// retirés, les unités repérées retrouvent leur image (drapeau pour un
// leurre). Le retour lui-même se déduit du seul tour : il vaut aussi au
// rejeu, où l'entrée n'est pas réinscrite. En ligne, seul le navigateur qui
// a fait avancer le tour l'inscrit (cf. onTurnChange).
function returnSearchChits() {
  moduleRules.refillSearchBag()
  if (counters.value.some((counter) => counter.searchResult || counter.sighted)) {
    counters.value = counters.value.filter((counter) => !counter.searchResult && !counter.sighted)
  }
  if (sightings.value.size) sightings.value = new Map()
}
watch(() => turnInfo.value.turn, () => {
  // Pions de raid restés du tour précédent (cf. `runEngineRaid`) : retirés.
  if (counters.value.some((counter) => counter.raid)) counters.value = counters.value.filter((counter) => !counter.raid)
  // Avant le retour des chits : le renfort se pose d'après les repérages
  // du jour, qui tombent avec eux.
  reinforceDummies()
  if (!moduleRules.searchChitsReturn(turnTrackerRef.value?.currentTurnInfo)) return
  const full = moduleRules.searchBagFull ?? {}
  const bag = moduleRules.searchBag?.value ?? {}
  const returned = Object.fromEntries(Object.entries(full).map(([key, count]) => [key, count - (bag[key] ?? 0)]))
  const total = Object.values(returned).reduce((sum, count) => sum + count, 0)
  returnSearchChits()
  if (!total || isReplaying.value || (props.online && turnInfo.value.step !== localTurnStep)) return
  const { detected = 0, misdirect = 0, contactLost = 0 } = returned
  log('searchRefill', t('log.searchRefill', { total, detected, misdirect, contactLost }, total), { returned })
})

// --- Renfort de leurres (premier tour de chaque nuit à la mer de Corail,
// cf. `moduleRules.planDummyReinforcement`) : les leurres éliminés
// reviennent sur la carte, SUR les hex des task forces repérées, qu'ils
// suivront désormais (ils s'en écartent à leur mouvement, cf.
// `runAutoMoves`). Tiré au hasard, donc tiré UNE fois — par le
// navigateur qui a fait avancer le tour — et inscrit au journal (entrée
// `dummyReinforce`), d'où le rejeu et les autres joueurs le reprennent.
function reinforceDummies() {
  if (!moduleRules.dummyReinforcementTurn(turnTrackerRef.value?.currentTurnInfo)) return
  if (isReplaying.value || (props.online && turnInfo.value.step !== localTurnStep)) return
  const freeIds = [...eliminatedIds.value].filter((id) => moduleRules.isReusableDummy(counterDefinition(id)))
  const plan = moduleRules.planDummyReinforcement(counters.value, sightings.value, freeIds)
  if (!plan) return
  applyDummyReinforcement(plan)
  const hexes = [...new Set(plan.placements.map((placement) => hexId(placement.col + 1, placement.row)))].join(', ')
  log('dummyReinforce', t('log.dummyReinforce', { n: plan.placements.length, hexes }, plan.placements.length), plan)
}

/** Pose les leurres d'un renfort — en jeu comme au rejeu. */
function applyDummyReinforcement(plan) {
  moduleRules.applyDummyReinforcement(plan)
  const back = new Set(eliminatedIds.value)
  for (const { id, col, row } of plan.placements ?? []) {
    back.delete(String(id))
    const definition = counterDefinition(id)
    if (definition && !counters.value.some((counter) => String(counter.id) === String(id))) {
      counters.value.push({ ...definition, col, row })
    }
  }
  eliminatedIds.value = back
}

// --- Ordre tiré au dé (piste à phases entremêlées, phase `"order": "roll"`
// — cf. lib/turnTrack.js ; les Opérations aériennes de la mer de Corail) : en
// arrivant sur le premier créneau de cette phase, chaque camp lance un dé,
// le plus FAIBLE joue en premier, on relance en cas d'égalité. Le résultat
// part au journal (entrée `rollOrder`), d'où le rejeu et les autres joueurs
// le reprennent (cf. applyReplayEntry). En ligne, seul le camp qui a
// l'initiative du tour lance, pour qu'il n'y ait qu'un tirage ; un
// rechargement qui tombe sur un tirage manquant le refait.
function rollPhaseOrder() {
  const tracker = turnTrackerRef.value
  const slot = tracker?.currentSlot
  if (!slot || slot.side || isReplaying.value || replayLocked.value) return
  if (tracker.rollOrders?.[slot.turn]) return
  const sides = sidesOfTurn(trackConfig, slot.turn)
  if (props.online && props.localSide !== sides[0]) return
  const throws = []
  let rolls
  do {
    rolls = sides.map(() => 1 + Math.floor(Math.random() * 6))
    throws.push(rolls)
  } while (new Set(rolls).size < rolls.length)
  const order = sides.map((side, index) => ({ side, roll: rolls[index] }))
    .sort((sideA, sideB) => sideA.roll - sideB.roll).map((entry) => entry.side)
  tracker.setRollOrder(slot.turn, order)
  const phaseLabel = phaseNameOf(turnStructure.phases?.find((entry) => entry.id === slot.phase)?.step)
  const detail = throws.map((throwRolls) => sides.map((side, index) => `${sideLabel(side)} ${throwRolls[index]}`).join(' / ')).join(t('log.reroll'))
  log('rollOrder', t('log.rollOrder', { phase: phaseLabel, rolls: detail, side: sideLabel(order[0]) }),
    { turn: slot.turn, order, throws })
}
watch([() => turnInfo.value.step, isReplaying], () => nextTick(rollPhaseOrder))

// --- Drag & drop d'un pion : dépose au centre de l'hex le plus proche du curseur ---
const svgRef = ref(null)

// Position courante (coordonnées SVG) du pion suivi par un glisser "souris"
// (cf. onCounterDragStart plus bas) — permet un retour visuel live pendant
// le déplacement, avant que le relâchement ne fixe la case définitive.
const dragCurrentPx = ref(null)

function svgPointFromEvent(ev) {
  const svg = svgRef.value
  if (!svg) return null
  const pt = svg.createSVGPoint()
  pt.x = ev.clientX; pt.y = ev.clientY
  return pt.matrixTransform(svg.getScreenCTM().inverse())
}

function onCounterDragStart(id, ev) {
  // Pendant un rejeu (cf. `replayLocked`), preventDefault() sur `dragstart`
  // annule aussi le glisser natif HTML5 (panneau de renforts) — un seul
  // guard couvre donc les deux mécanismes de glisser.
  if (inputLocked.value) { ev?.preventDefault(); return }
  const onMap = counters.value.find((counter) => String(counter.id) === String(id))
  const counter = onMap ?? allCounters.value.find((counter) => String(counter.id) === String(id))
  if (!canControl(counter)) { ev?.preventDefault(); return }
  // cf. lib/useAssisted.js::draggable — en mode Assisté, aucun pion ne se
  // glisse : une unité (déjà sur la carte ou en renfort) ne s'y joue qu'au
  // clic (sélection, puis clic sur l'hex de destination — cf. onHex/
  // onCounterSelect/onReinforcementSelect plus haut).
  // Exception : à la mise en place, les pions du panneau se glissent sur la
  // carte (pose libre, cf. lib/useAssisted.js, phase "setup").
  const setupDrag = phase.value === PHASE_SETUP && !onMap
  if (!draggable.value && !setupDrag) { ev?.preventDefault(); return }
  if (setupDrag && !canPlaceReinforcementNow(counter)) { ev?.preventDefault(); return }
  // Un renfort pas encore posé sur la carte ne peut être glissé qu'à partir
  // de son tour d'arrivée (cf. `canEnterThisTurn`) — un pion déjà sur la
  // carte (mouvement) n'est pas concerné.
  if (!onMap && !canEnterThisTurn(counter)) { ev?.preventDefault(); return }
  draggedCounterId.value = id
  // Le pion glissé quitte sa pile : au dépôt, il se retrouverait sous la
  // souris sans nouveau `mouseenter`, avec la pile de son ANCIEN hex.
  hoveredCounter.value = null
  if (ev?.dataTransfer) {
    // Glisser natif HTML5 (pion pas encore sur la carte : <img> du panneau
    // "Renfort ...", hors du <svg>) — le natif gère lui-même survol/dépôt,
    // cf. onMapDrop.
    ev.dataTransfer.effectAllowed = 'move'
    ev.dataTransfer.setData('text/plain', String(id))
    return
  }
  // Glisser "souris" (pion Counter.vue déjà posé sur la carte, <image> SVG) :
  // le DnD natif HTML5 ne se déclenche jamais de façon fiable sur une <image>
  // SVG (confirmé en test réel ET automatisé — `dragstart` ne part pas malgré
  // draggable="true"), donc on suit nous-mêmes la souris jusqu'au relâchement.
  const loc = svgPointFromEvent(ev)
  if (loc) dragCurrentPx.value = { x: loc.x, y: loc.y }
  window.addEventListener('mousemove', onCounterDragMove)
  window.addEventListener('mouseup', onCounterDragEnd)
}

function onCounterDragMove(ev) {
  const loc = svgPointFromEvent(ev)
  if (loc) dragCurrentPx.value = loc
}

function onCounterDragEnd(ev) {
  window.removeEventListener('mousemove', onCounterDragMove)
  window.removeEventListener('mouseup', onCounterDragEnd)
  const loc = svgPointFromEvent(ev) ?? dragCurrentPx.value
  dragCurrentPx.value = null
  const id = draggedCounterId.value
  draggedCounterId.value = null
  if (!loc || id == null) return
  const hex = pixelToHex(loc.x, loc.y)
  if (!hex) return
  const counter = counters.value.find((counter) => String(counter.id) === String(id))
  // Un simple clic (mousedown puis mouseup sans déplacement réel, cf.
  // Counter.vue::onClick pour la sélection) retombe ici aussi — on n'émet
  // `move` que si la case a réellement changé, pour ne pas spammer le réseau
  // à chaque clic de sélection en partie multijoueur.
  if (counter && (counter.col !== hex.col || counter.row !== hex.row)) {
    const fromLabel = hexId(counter.col + 1, counter.row)
    const from = { col: counter.col, row: counter.row }
    counter.col = hex.col; counter.row = hex.row
    emit('move', { counterId: counter.id, col: counter.col, row: counter.row })
    const journalId = log('move', t('log.moved', { unit: counter.name, from: fromLabel, to: hexId(counter.col + 1, counter.row) }), { counterId: counter.id, col: counter.col, row: counter.row })
    pushMoveHistory(counter.id, from, { col: counter.col, row: counter.row }, journalId)
    markMoved(counter.id, from)
  }
}

onUnmounted(() => {
  window.removeEventListener('mousemove', onCounterDragMove)
  window.removeEventListener('mouseup', onCounterDragEnd)
  stopAutoMoveAnimation()
})

/** Convertit un point en coordonnées SVG vers l'hex logique le plus proche —
 *  cherche dans une fenêtre de 3×3 hex autour de l'estimation initiale (la
 *  grille hexagonale n'a pas de correspondance x/y → col/row directe). */
function pixelToHex(svgX, svgY) {
  const { x0, y0, colStep, rowStep } = calibration
  const c0 = Math.round((svgX - x0) / colStep)
  let best = null, dmin = Infinity
  for (let col = c0 - 1; col <= c0 + 1; col++) {
    if (col < 0 || col >= mapConfig.cols) continue
    const yoff = col % 2 === 1 ? rowStep / 2 : 0
    const r0 = Math.round((svgY - y0 - yoff) / rowStep) + 1
    for (let row = r0 - 1; row <= r0 + 1; row++) {
      if (!hexOnMap(col, row)) continue
      const cx = x0 + col * colStep
      const cy = y0 + (row - 1) * rowStep + yoff
      const distance = Math.hypot(cx - svgX, cy - svgY)
      if (distance < dmin) { dmin = distance; best = { col: col, row: row } }
    }
  }
  return best
}

function onMapDrop(ev) {
  if (inputLocked.value) return
  const svg = svgRef.value
  if (!svg || draggedCounterId.value == null) return
  const pt = svg.createSVGPoint()
  pt.x = ev.clientX; pt.y = ev.clientY
  const loc = pt.matrixTransform(svg.getScreenCTM().inverse())
  const hex = pixelToHex(loc.x, loc.y)
  if (hex) {
    // Un pion déjà posé sur la carte emprunte désormais le glisser "souris"
    // (cf. onCounterDragEnd), qui ne passe pas par l'événement natif `drop` —
    // on n'arrive ici que pour un renfort pas encore sur la carte, glissé
    // depuis le panneau "Renfort ..." (glisser-déposer libre, système 1, cf.
    // entrée en jeu dans le commentaire de `entryHexSet`).
    const reinforcement = allCounters.value.find((counter) => String(counter.id) === String(draggedCounterId.value))
    // Mode Assisté (mise en place) : camp actif, et phase qui l'autorise.
    const allowed = reinforcement && canEnterThisTurn(reinforcement)
      && (!props.assisted || (canControl(reinforcement) && canPlaceNow(reinforcement)))
    if (allowed) {
      const placed = { ...instanceOf(reinforcement), ...hex }
      counters.value.push(placed)
      emit('move', { counterId: placed.id, col: placed.col, row: placed.row })
      log('place', t('log.enters', { unit: placed.name, hex: hexId(placed.col + 1, placed.row) }),
        { counterId: placed.id, col: placed.col, row: placed.row })
    }
  }
  draggedCounterId.value = null
}

/** Applique un déplacement reçu d'un autre joueur (WebSocket) — ne réémet
 *  pas `move` pour éviter une boucle avec le serveur. */
function applyRemoteMove(counterId, col, row, enteredFrom) {
  const counter = counters.value.find((counter) => String(counter.id) === String(counterId))
  if (counter) {
    const from = { col: counter.col, row: counter.row }
    const previousEntry = counter.enteredFrom ?? null
    counter.col = col; counter.row = row
    // Côté d'entrée : celui du journal quand il le porte (une annulation de
    // mouvement le rétablit tel qu'il était), sinon déduit du pas effectué.
    // En ligne, le même pas arrive deux fois (évènement `move`, puis l'entrée
    // du journal partagé) : celle du journal fait foi même sans changement
    // de position.
    if (enteredFrom !== undefined) counter.enteredFrom = enteredFrom
    else if (from.col !== col || from.row !== row) counter.enteredFrom = entryFromMove(from, { col, row })
    if (from.col !== col || from.row !== row) markMoved(counter.id, from, previousEntry)
    return
  }
  // Un autre joueur a posé un renfort pas encore présent localement (glissé
  // depuis son propre panneau de renforts) : on l'ajoute.
  const reinforcement = counterDefinition(counterId)
  if (!reinforcement) return
  counters.value.push({ ...reinforcement, col, row })
}

/** Multijoueur : un camp a perdu, au temps ou en concédant (cf.
 *  RoomLobby.vue, `game:over`). */
function applyRemoteGameOver(loser, reason) {
  declareLoss(loser, { remote: true, reason })
}

/** En ligne : entrée du journal partagé reçue d'un autre joueur (ou du
 *  serveur). Ajoutée au journal (sauf doublon, cf. `uid`) PUIS appliquée à
 *  la carte comme au rejeu — c'est ce qui synchronise ce que les seuls
 *  évènements `move`/`turn`/`phase` ne transmettent pas (éliminations,
 *  retours aux renforts, MP dépensés, déploiement). */
function applyRemoteEntry(entry) {
  if (!entry || !journalRef.value?.appendRemote(entry)) return
  applyReplayEntry(entry)
  if (entry.kind === 'raid' && entry.data) showRaid(entry.data)
}

/** En ligne : entrée retirée par un autre joueur (retour arrière). */
function removeRemoteEntry(uid) {
  journalRef.value?.removeByUid(uid)
}

/** Aligne pas courant, phase, pendules et fin de partie sur l'état du
 *  serveur (`toPublic`, cf. server/src/rooms.js) — au montage (props) comme
 *  après une reconnexion (cf. resyncFromServer). */
function applyServerState({ turnStep, phase: serverPhase, phaseElapsedMs, blitzUsedMs: serverBlitz, blitzLoser: serverLoser, gameOverReason: serverReason }) {
  if (turnTrackerRef.value && turnStep != null && turnTrackerRef.value.currentStep !== turnStep) applyRemoteTurn(turnStep)
  // Phase déjà atteinte par le joueur actif (cf. server/src/rooms.js::
  // recordPhase) — `null` : phase de départ du camp, déjà recalculée.
  if (serverPhase != null) setPhase(serverPhase)
  // Compteurs des timings "Limité"/"Blitz" repris là où ils en étaient (le
  // temps écoulé depuis le chargement n'est pas décompté deux fois).
  moveTimerStartedAt.value = null
  syncMoveTimer(phaseElapsedMs ?? 0)
  blitzUsedMs.value = { ...(serverBlitz ?? {}) }
  if (serverLoser) declareLoss(serverLoser, { remote: true, reason: serverReason })
}

/** En ligne, après une RECONNEXION : le serveur fait foi. Le journal partagé
 *  complet est rejoué depuis le déploiement (cf. startSharedJournal), ce qui
 *  rattrape à la fois les entrées manquées pendant la coupure ET celles que
 *  l'adversaire a retirées entre-temps (retour arrière) — un simple ajout des
 *  entrées manquantes laissait ces dernières dans le journal local. Ce que ce
 *  navigateur a pu jouer HORS LIGNE n'a jamais atteint le serveur : c'est
 *  abandonné, pour rester aligné sur les autres joueurs. `room` : l'état
 *  courant renvoyé par le serveur (pas, phase, pendules, fin de partie). */
function resyncFromServer(list, room) {
  startSharedJournal(list ?? [])
  applyServerState(room ?? {})
}

defineExpose({ applyRemoteMove, applyRemoteTurn, applyRemotePhase, applyRemoteGameOver, applyRemoteEntry, removeRemoteEntry, resyncFromServer })

/** Reçoit le journal chargé (cf. JournalPanel.vue, évènement `loaded`) en
 *  ordre chronologique et remet la carte au déploiement initial pour
 *  rejouer depuis la première ligne. */
function onJournalLoaded(list) {
  // Le journal chargé porte son propre déploiement (ou n'en a pas, s'il est
  // antérieur à cet ajout) : celui de la partie ouverte ne doit plus être
  // ajouté par-dessus.
  deploymentLogged = true
  replayEntries.value = list
  replayIndex.value = 0
  resetBoardForReplay()
}

function resetBoardForReplay() {
  isReplaying.value = true
  // Pendules "Blitz" à zéro et partie en cours : rétablies par les entrées
  // `phase` et `gameover` rejouées.
  blitzUsedMs.value = {}
  blitzLoser.value = null
  gameOverReason.value = null
  showGameEnd.value = false
  counters.value = buildInitialCounters()
  // Tasse de recherche pleine, aucun repérage : rétablis par les entrées
  // `search` rejouées.
  moduleRules.refillSearchBag()
  moduleRules.restoreAlliedFleets(null)
  moduleRules.restoreShipDamage(null)
  moduleRules.restorePlaneDamage(null)
  moduleRules.restoreAirZones()
  sightings.value = new Map()
  reconUses.value = new Map()
  autoMoveTrails.value = new Map()
  // Combats navals : rétablis par les entrées `navalCombat` rejouées.
  foughtFleets.value = new Map()
  clearNavalCombat()
  eliminatedIds.value = new Set()
  removals.value = []
  selectedCounterId.value = null
  selectedReinforcementId.value = null
  moveHistory.value = []
  clearAllMoved()
  turnTrackerRef.value?.applyRemoteTurn(0)
  // Ordres tirés au dé (cf. `rollPhaseOrder`) : rétablis par les entrées
  // `rollOrder` rejouées.
  turnTrackerRef.value?.clearRollOrders?.()
  // Phase de départ, aucun MP dépensé, aucune congestion d'entrée.
  // Nécessaire même si le pas 0 était déjà le pas courant (le watcher de
  // tour ne se déclenche alors pas).
  resetTurnState()
  nextTick(() => { isReplaying.value = false })
}

/** Applique une entrée de journal à la carte — même logique que la synchro
 *  multijoueur (`applyRemoteMove`/`applyRemoteTurn`), qui ne réémet ni ne
 *  journalise rien : rejouer une ligne ne fait bouger que la carte. En plus
 *  des positions, le rejeu rétablit l'état de la phase en cours (utile pour
 *  une sauvegarde faite en plein tour) :
 *   - `move`/`place` : MP déjà dépensés par l'unité (`d.mp`, total absolu,
 *     cf. lib/useAssisted.js::setSpentMp) et, pour une entrée en jeu qui a
 *     payé un coût d'entrée (`d.entry`), la congestion de l'hex. Une unité
 *     qui a bougé (`move`) est de plus VERROUILLÉE : elle ne peut plus être
 *     sélectionnée une fois le journal rechargé (cf. `lockedFromSelectionIds`) ;
 *   - `phase` : phase en cours (cf. lib/useAssisted.js::setPhase).
 *  Les champs absents (journaux enregistrés avant cet ajout) sont ignorés. */
function applyReplayEntry(entry) {
  const entryData = entry.data
  if (!entryData) return
  if (entry.kind === 'setup') {
    // Déploiement initial (cf. `logDeploymentOnce`) : on remet chaque pion
    // de départ exactement où il était, à la place du nouveau tirage fait
    // par resetBoardForReplay.
    for (const position of entryData.positions ?? []) {
      const counter = counters.value.find((counter) => String(counter.id) === String(position.id))
      if (counter) { counter.col = position.col; counter.row = position.row }
    }
    moduleRules.restoreSetupSecrets(entryData.secrets)
  } else if (entry.kind === 'move' || entry.kind === 'place') {
    applyRemoteMove(entryData.counterId, entryData.col, entryData.row, entryData.enteredFrom)
    if (entry.kind === 'move') {
      const key = String(entryData.counterId)
      const start = turnStartPositions.get(key)
      if (start && start.col === entryData.col && start.row === entryData.row) {
        // Revenu à sa position de début de tour ("Annuler le mouvement", cf.
        // cancelMovement) : comme en jeu, il n'a de fait plus bougé.
        clearMoved(key)
      } else if (movedThisTurnIds.value.has(key)) {
        // Unité qui a bougé ce tour-ci : son mouvement est considéré comme
        // TERMINÉ au rechargement, elle ne peut plus être sélectionnée (cf.
        // `lockedFromSelectionIds`) — en jeu, ce verrou n'est posé qu'à sa
        // désélection, que le journal n'enregistre pas.
        lockedFromSelectionIds.value = new Set(lockedFromSelectionIds.value).add(key)
      }
    }
    if (entry.kind === 'place') noteEntered(counters.value.find((counter) => String(counter.id) === String(entryData.counterId)))
    if (entry.kind === 'place' && entryData.entry) {
      const placed = counters.value.find((counter) => String(counter.id) === String(entryData.counterId))
      if (placed) spendEntryCost(placed, { c: entryData.col, r: entryData.row })
    }
    // Après `spendEntryCost` : la valeur du journal fait foi (elle inclut
    // déjà le coût d'entrée payé à l'époque).
    setSpentMp(entryData.counterId, entryData.mp)
  } else if (entry.kind === 'phase') {
    setPhase(entryData.phase)
    if (entryData.blitzUsed) blitzUsedMs.value = { ...entryData.blitzUsed }
  } else if (entry.kind === 'gameover') {
    blitzLoser.value = entryData.loser ?? null
    // Journaux antérieurs à la concession : seule la pendule mettait fin à
    // la partie.
    gameOverReason.value = entryData.reason === 'concede' ? 'concede' : 'blitz'
  } else if (entry.kind === 'navalContact') {
    applyNavalContact(entryData.ids ?? [], entryData.turn)
  } else if (entry.kind === 'navalCombat') {
    noteFought(entryData.fleetIds ?? [], entryData.turn)
  } else if (entry.kind === 'eliminate') {
    noteElimination(entryData.counterId, entryData)
  } else if (entry.kind === 'return') {
    const counterIndex = counters.value.findIndex((counter) => String(counter.id) === String(entryData.counterId))
    if (counterIndex !== -1) counters.value.splice(counterIndex, 1)
    forgetRemoval(entryData.counterId)
    eliminatedIds.value.delete(String(entryData.counterId))
    eliminatedIds.value = new Set(eliminatedIds.value)
  } else if (entry.kind === 'search') {
    // Résultat de recherche (cf. `reportRecon`) : le pion tiré, et ce qui
    // reste dans la tasse — le journal fait foi, jamais un nouveau tirage.
    // Une unité par unité explorable de l'hex (`units`) ; un journal
    // d'avant n'en a qu'une, à plat dans l'entrée.
    for (const { counter: marker, unitId, sighting, sighted } of entryData.units ?? [entryData]) {
      if (marker && !counters.value.some((counter) => String(counter.id) === String(marker.id))) placeSearchMarker(marker)
      // État de repérage et pion "Sighted" (le leurre démasqué, lui, part
      // avec l'entrée `eliminate` qui suit).
      if (unitId && sighting) applySighting(unitId, sighting, sighted)
    }
    moduleRules.restoreSearchBag(entryData.bag)
    if (entryData.source) noteReconUse(entryData.source)
  } else if (entry.kind === 'searchRefill') {
    // Retour des chits de recherche dans la tasse (cf. `returnSearchChits`).
    returnSearchChits()
  } else if (entry.kind === 'raid') {
    // Raid aérien du moteur (cf. `runEngineRaid`).
    placeRaidMarkers(entryData.markers)
    moduleRules.launchRaid((entryData.strike?.planes ?? []).map((plane) => plane.key))
  } else if (entry.kind === 'raidEnd') {
    // Fin d'un raid (cf. `endRaid`).
    removeRaidMarkers(entryData.markerIds)
    moduleRules.landFromRaid(entryData.planeKeys)
  } else if (entry.kind === 'alliedFleet') {
    // Compositions des task forces du joueur (cf. `saveAlliedFleet`).
    moduleRules.restoreAlliedFleets(entryData.fleets)
  } else if (entry.kind === 'shipDamage') {
    // Dommages d'un navire (cf. `setShipDamage`).
    moduleRules.setShipDamage(entryData.key, entryData.state)
  } else if (entry.kind === 'planeState') {
    // Pertes d'un avion (cf. `setPlaneState`).
    moduleRules.setPlaneState(entryData.key, entryData.state)
  } else if (entry.kind === 'dummyReinforce') {
    // Renfort de leurres (cf. `reinforceDummies`) : le journal fait foi.
    applyDummyReinforcement(entryData)
  } else if (entry.kind === 'rollOrder') {
    // Ordre de jeu d'une phase tirée au dé (cf. `rollPhaseOrder`).
    turnTrackerRef.value?.setRollOrder(entryData.turn, entryData.order)
    runAirCycle()
  } else if (entry.kind === 'turn') {
    turnTrackerRef.value?.applyRemoteTurn(entryData.step)
    runAirCycle()
    // Nouveau tour/camp : plus aucune unité "a bougé" ni verrouillée — fait
    // ICI, tout de suite, et non dans onTurnChange (différé, cf. son
    // commentaire), pour que les `move` rejoués juste après restent marqués.
    clearAllMoved()
  }
}

/** Bouton lecture (▶) : avance d'une ligne — l'entrée réapparaît dans le
 *  journal (cf. JournalPanel.vue::revealEntry) en même temps qu'elle bouge
 *  la carte. */
function stepReplay() {
  if (replayIndex.value >= replayEntries.value.length) return
  isReplaying.value = true
  const entry = replayEntries.value[replayIndex.value]
  applyReplayEntry(entry)
  journalRef.value?.revealEntry(entry)
  replayIndex.value += 1
  nextTick(() => { isReplaying.value = false })
}

/** Bouton avance rapide (⏭) : applique toutes les lignes restantes d'un coup. */
function fastForwardReplay() {
  if (replayIndex.value >= replayEntries.value.length) return
  isReplaying.value = true
  while (replayIndex.value < replayEntries.value.length) {
    const entry = replayEntries.value[replayIndex.value]
    applyReplayEntry(entry)
    journalRef.value?.revealEntry(entry)
    replayIndex.value += 1
  }
  nextTick(() => { isReplaying.value = false })
}

// Vrai tant qu'un journal chargé n'a pas été entièrement rejoué (cf.
// stepReplay/fastForwardReplay) — bloque alors toute action de jeu (cf.
// guards dans onHex/onCounterDragStart/onMapDrop/sélections/menu contextuel
// plus haut, et props `disabled` sur TurnTracker/RollModal ci-dessous) :
// la carte ne doit bouger qu'au rythme du lecteur pendant un rejeu.
const replayLocked = computed(() => replayEntries.value.length > 0 && replayIndex.value < replayEntries.value.length)
// Camp qui a PERDU la partie — pendule tombée à 0 en Blitz, ou concession
// (cf. declareLoss, `gameOverReason`) —, `null` tant que la partie continue.
// Le nom vient du Blitz, premier cas de fin de partie (le serveur le garde).
const blitzLoser = ref(null)
// Ce qui a mis fin à la partie quand `blitzLoser` est renseigné : 'blitz' ou
// 'concede'.
const gameOverReason = ref(null)
// La PARTIE est figée pendant un rejeu et une fois terminée : plus aucune
// action de jeu, et les pendules du timing s'arrêtent (cf. moveTimerRunning).
const actionsLocked = computed(() => replayLocked.value || blitzLoser.value != null)
// La SAISIE de ce navigateur est bloquée dans ces mêmes cas, PLUS, en ligne,
// tant que ce n'est pas à son joueur de jouer (cf. `isLocalTurn`) : il ne
// peut alors ni sélectionner, ni déplacer, ni éliminer, ni replacer un pion,
// quel qu'en soit le camp — ni faire avancer tour ou phase. C'est la garde
// de TOUTES les entrées utilisateur (clics, glisser-déposer, menus, boutons,
// dé). Distincte de `actionsLocked` : chez le joueur qui attend, la partie
// continue (pendule de l'adversaire, synchro), seule sa saisie est fermée.
// Le serveur applique la même règle de son côté (cf. server/src/rooms.js::
// isPlayersTurn) : ce verrou-ci n'est que le confort de l'interface.
// Temps de la phase de Mouvement écoulé (timing "Limité" seulement, cf.
// `onMoveTimeUp`) : posé à l'expiration du compte à rebours, levé au
// changement de phase ou de pas.
const moveTimeExpired = ref(false)

/** Le mouvement est-il fermé parce que le temps est écoulé ? Seulement
 *  pendant la phase de Mouvement, bien sûr — et seulement une fois les
 *  empilements résolus : `onPhaseNext` refuse de quitter la phase tant que
 *  deux unités amies partagent un hex, si bien qu'un joueur pris par le temps
 *  au milieu d'une pile ne pourrait NI la défaire NI changer de phase. Cette
 *  soupape lui laisse de quoi se dégager ; le verrou retombe dès que c'est
 *  fait. */
const moveTimeLocked = computed(() => moveTimeExpired.value && phase.value === 0
  && stackedHexes.value.length === 0)

// Deux verrous, et non un seul, depuis que le timing "Limité" arrête le
// mouvement (cf. `moveTimeLocked` juste au-dessus) : celui-là interdit de
// BOUGER mais doit laisser passer à la phase suivante — c'est même tout ce
// qu'il reste à faire. `phaseControlsLocked` est donc ce qui ferme AUSSI la
// piste de tour, et `inputLocked`, qui lui ajoute le temps écoulé, reste la
// garde de toutes les autres entrées.
const phaseControlsLocked = computed(() => actionsLocked.value || (props.online && !isLocalTurn.value) || autoMoveAnimating.value)
const inputLocked = computed(() => phaseControlsLocked.value || moveTimeLocked.value)

// --- Timings "Limité" et "Blitz" (cf. lib/gameSettings.js, MoveTimer.vue).
// Toutes les phases sont conservées : SEULE la phase Mouvement (phase 0) est
// chronométrée. Sans phases (mode
// Libre, `phase === null`), il n'y a pas de phase Mouvement : pas de
// compteur. Jamais pendant un rejeu de journal.
//  - Limité : la durée saisie (minutes) vaut pour CHAQUE phase de Mouvement,
//    le compteur repart à plein à chaque fois.
//  - Blitz (pendule d'échecs) : la durée saisie est le temps TOTAL de chaque
//    camp pour toutes ses phases de Mouvement. Le temps passé dans chacune
//    s'additionne dans `blitzUsedMs` ; la pendule d'un camp démarre au début
//    de sa phase de Mouvement et s'arrête dès le changement de phase.
const timingMode = computed(() => props.settings?.timing)
const moveTimerSeconds = computed(() =>
  timingMode.value === 'limite' || timingMode.value === 'blitz' ? (Number(props.settings.timingValue) || 0) * 60 : 0)
const isBlitz = computed(() => timingMode.value === 'blitz' && moveTimerSeconds.value > 0)
const moveTimerRunning = computed(() =>
  moveTimerSeconds.value > 0 && !actionsLocked.value && phase.value === 0)
const turnOrder = props.module.turnTrack?.order ?? []
// Piste de tour complétée de ses créneaux si elle entremêle les phases (cf.
// lib/turnTrack.js::resolveTrack) — celle que reçoit TurnTracker.vue.
const trackConfig = resolveTrack(props.module)
// Camp actif lu directement sur TurnTracker.vue : `turnInfo` n'est mis à
// jour qu'en différé (évènement `change`), trop tard pour syncMoveTimer.
// L'initiative peut changer d'un tour à l'autre (cf. lib/turnTrack.js).
function currentSideKey() {
  const step = turnTrackerRef.value?.currentStep ?? props.initialTurnStep
  return sideOfStep(trackConfig, step, turnTrackerRef.value?.rollOrders)
}
// Heure de début de la phase de Mouvement en cours (ms) et camp dont la
// pendule tourne ; `null` hors de cette phase.
const moveTimerStartedAt = ref(null)
const moveTimerSide = ref(null)
// Blitz : temps de Mouvement déjà consommé par camp, `{ [campKey]: ms }`.
const blitzUsedMs = ref({})
/** Arrête le compteur en cours (en ajoutant, en Blitz, le temps passé à la
 *  pendule de son camp) puis le relance si une phase de Mouvement est en
 *  cours. `elapsedMs` : temps déjà écoulé dans cette phase (reprise en
 *  ligne, cf. onMounted). */
function syncMoveTimer(elapsedMs = 0) {
  const now = Date.now()
  const side = moveTimerSide.value
  if (moveTimerStartedAt.value != null && side != null) {
    blitzUsedMs.value = { ...blitzUsedMs.value, [side]: (blitzUsedMs.value[side] ?? 0) + (now - moveTimerStartedAt.value) }
  }
  moveTimerStartedAt.value = moveTimerRunning.value ? now - elapsedMs : null
  moveTimerSide.value = moveTimerRunning.value ? currentSideKey() : null
}
// Synchrone : la pendule doit être à jour dès le retour de `advance()` (cf.
// onPhaseNext, qui l'envoie aussitôt aux autres joueurs).
watch([moveTimerRunning, () => turnTrackerRef.value?.currentStep], () => syncMoveTimer(), { flush: 'sync' })
const showTimeUp = ref(false)
// Modale de fin de partie (cf. GameEndModal.vue, `gameEnd`) et demande de
// confirmation d'une concession (cf. `askConcede`).
const showGameEnd = ref(false)
const concedeConfirm = ref(false)
const sideLabel = (side) => mt(props.module.turnTrack?.sides?.[side]?.label) ?? side
/** Compteur à zéro (cf. MoveTimer.vue, `expired`). Blitz : le camp `side`
 *  PERD la partie. Limité : le MOUVEMENT S'ARRÊTE (cf. `moveTimeLocked`) —
 *  plus de déplacement, d'entrée de renfort ni de retour arrière, il ne reste
 *  qu'à passer à la phase suivante. L'alerte, elle, n'est montrée qu'au
 *  joueur actif : en ligne, chaque navigateur a son compteur, mais seul celui
 *  dont c'est le tour a quelque chose à en faire. */
function onMoveTimeUp(side) {
  if (isBlitz.value) { declareLoss(side); return }
  moveTimeExpired.value = true
  if (isLocalTurn.value) showTimeUp.value = true
}
/** Fin de partie : `loser` a perdu — au temps (Blitz, `reason` 'blitz') ou
 *  en concédant ('concede', cf. `concede`). La modale de fin (cf.
 *  GameEndModal.vue) s'affiche chez TOUS les joueurs.
 *  - En local : inscrite au journal.
 *  - En ligne : annoncée au serveur ; seule la PREMIÈRE annonce compte, le
 *    serveur l'inscrit lui-même au journal partagé et la renvoie à tous
 *    (`remote` : annonce du serveur, qui fait foi et peut corriger une
 *    détection locale de la pendule). */
function declareLoss(loser, { remote = false, reason = 'blitz' } = {}) {
  if (!loser || blitzLoser.value === loser) return
  if (blitzLoser.value != null && !remote) return
  blitzLoser.value = loser
  gameOverReason.value = reason === 'concede' ? 'concede' : 'blitz'
  const text = t(gameOverReason.value === 'concede' ? 'log.conceded' : 'log.timeUp', { side: sideLabel(loser) })
  if (!remote) {
    if (props.online) emit('game-over', { loser, text, t: new Date().toLocaleTimeString('fr-FR'), reason: gameOverReason.value })
    else log('gameover', text, { loser, reason: gameOverReason.value })
  }
  showGameEnd.value = true
}

// --- Concession et fin de partie (cf. GameEndModal.vue) ----------------------
// Un camp peut CONCÉDER à tout moment : la partie s'arrête, son adversaire
// l'emporte. Concède : en ligne, le camp de CE joueur (même quand ce n'est
// pas son tour) ; en local, un seul navigateur pour tous les camps, le camp
// qui a la main.

/** Camp qui concéderait depuis ce navigateur (cf. l'en-tête de section). */
const concedingSide = computed(() => (props.online ? props.localSide : turnInfo.value.activeSideKey) || null)

/** La partie est-elle terminée par une défaite (Blitz, concession) ?
 *  `{ reason, winner, loser }` (libellés de camp), ou `null` si elle
 *  continue. */
const gameEnd = computed(() => {
  if (!blitzLoser.value) return null
  const winner = turnOrder.find((side) => side !== blitzLoser.value)
  return { reason: gameOverReason.value ?? 'blitz', winner: winner ? sideLabel(winner) : null, loser: sideLabel(blitzLoser.value) }
})

/** Bouton "Concéder la partie" : demande d'abord confirmation. */
function askConcede() {
  if (actionsLocked.value || !concedingSide.value) return
  concedeConfirm.value = true
}

/** Confirmation de la concession (cf. GameEndModal.vue, mode `confirm`). */
function concede() {
  concedeConfirm.value = false
  if (actionsLocked.value || !concedingSide.value) return
  declareLoss(concedingSide.value, { reason: 'concede' })
}
// Nouvelle phase ou nouveau camp : le compteur repart à plein (cf.
// `syncMoveTimer`), donc le mouvement se rouvre et la modale du joueur
// précédent disparaît.
watch([() => turnInfo.value.step, phase], () => {
  showTimeUp.value = false
  moveTimeExpired.value = false
})

function zoomIn() {
  zoom.value = Math.min(2, +(zoom.value + 0.05).toFixed(2))
}
function zoomOut() {
  zoom.value = Math.max(0.1, +(zoom.value - 0.05).toFixed(2))
}

/** Zoom à la molette (Ctrl/pas de modificateur — sur toute la zone carte). */
function onMapWheel(event) {
  // Le zoom déplace le pion survolé sous la souris : fenêtre de pile périmée.
  hoveredCounter.value = null
  const step = 0.05
  const delta = event.deltaY < 0 ? step : -step
  zoom.value = Math.min(2, Math.max(0.1, +(zoom.value + delta).toFixed(2)))
}

// --- Drag-to-scroll (pan) au clic droit maintenu ---
const mapWrapRef = ref(null)
const mapDrag = ref(null) // { startX, startY, scrollLeft, scrollTop }

function onMapDragStart(event) {
  const el = mapWrapRef.value
  if (!el) return
  // Un clic droit sur un pion ouvre son menu contextuel (cf. Counter.vue) —
  // ne pas démarrer un pan ici, sinon le preventDefault() ci-dessous
  // supprime l'événement contextmenu natif avant qu'il puisse se déclencher.
  if (event.target.closest('.counter')) return
  event.preventDefault()
  mapDrag.value = { startX: event.clientX, startY: event.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
}
function onMapDragMove(event) {
  if (!mapDrag.value) return
  const el = mapWrapRef.value
  if (!el) return
  el.scrollLeft = mapDrag.value.scrollLeft - (event.clientX - mapDrag.value.startX)
  el.scrollTop = mapDrag.value.scrollTop - (event.clientY - mapDrag.value.startY)
}
function onMapDragEnd() {
  mapDrag.value = null
}
</script>

<template>
  <div class="hexmap">
    <header class="toolbar">
      <h1>{{ module.name }}</h1>

      <div v-if="module.turnTrack" class="turn-tracker-block">
        <TurnTracker ref="turnTrackerRef" :config="trackConfig" :sides="module.sides"
          :initial-step="initialTurnStep" :disabled="phaseControlsLocked" :phase="phase" :phase-index="phaseIndex" :phase-labels="phaseLabels" :next-label="nextLabel"
          @turn="onTurnAdvance" @change="onTurnChange" @phase-next="onPhaseNext" />

        <!-- cf. MoveTimer.vue — Blitz : une pendule par camp, toujours
             visible ; Limité : un seul compteur, en phase Mouvement. -->
        <div v-if="moveTimerSeconds > 0" class="move-timers">
          <template v-if="isBlitz">
            <MoveTimer v-for="side in turnOrder" :key="side" :duration-seconds="moveTimerSeconds"
              :started-at="moveTimerSide === side ? moveTimerStartedAt : null" :used-ms="blitzUsedMs[side] ?? 0"
              :label="sideLabel(side)" always-visible @expired="onMoveTimeUp(side)" />
            <span v-if="blitzLoser" class="game-over-tag">{{ $t('toolbar.gameOverTag', { side: sideLabel(blitzLoser) }) }}</span>
          </template>
          <MoveTimer v-else :duration-seconds="moveTimerSeconds" :started-at="moveTimerStartedAt"
            @expired="onMoveTimeUp" />
        </div>
      </div>

      <div class="controls">
        <label :title="!assisted ? $t('toolbar.gridDisabled') : ''">
          <input type="checkbox" v-model="showGrid" :disabled="!assisted"> {{ $t('toolbar.grid') }}
        </label>
        <label><input type="checkbox" v-model="showLabels"> {{ $t('toolbar.coordinates') }}</label>
        <label><input type="checkbox" v-model="showCalib"> {{ $t('toolbar.calibration') }}</label>
        <label><input type="checkbox" v-model="debug"> {{ $t('toolbar.debug') }}</label>
        <button type="button" class="toggle-btn" :class="{ active: !showCounters }"
          @click="showCounters = !showCounters">
          {{ showCounters ? $t('toolbar.hideCounters') : $t('toolbar.showCounters') }}
        </button>
        <button v-if="assisted" type="button" class="toggle-btn" :disabled="!moveHistory.length || inputLocked || phase !== 0"
          @click="undoLastMove">
          {{ $t('toolbar.undo') }}
        </button>
        <button v-if="!assisted" type="button" class="toggle-btn" :class="{ active: !showRollModal }"
          @click="showRollModal = !showRollModal">
          {{ showRollModal ? $t('toolbar.hideDie') : $t('toolbar.showDie') }}
        </button>
        <!-- cf. `askConcede` / `gameEnd` : concéder tant que la partie
             continue, revoir le bilan une fois qu'elle est finie. -->
        <button v-if="gameEnd" type="button" class="toggle-btn" :title="$t('toolbar.gameSummaryTitle')"
          @click="showGameEnd = true">
          {{ $t('toolbar.gameSummary') }}
        </button>
        <button v-else-if="concedingSide && !replayLocked" type="button" class="toggle-btn" :title="$t('toolbar.concedeTitle')"
          @click="askConcede">
          {{ $t('toolbar.concede') }}
        </button>
        <button type="button" class="toggle-btn"
          :title="$t('toolbar.bugReportTitle')"
          @click="openBugReport">
          {{ $t('toolbar.bugReport') }}
        </button>
        <button type="button" class="toggle-btn" :class="{ active: showGuide }" :title="$t('toolbar.helpTitle')"
          :aria-label="$t('toolbar.help')" @click="showGuide = true">?</button>
        <div v-if="replayEntries.length" class="replay-ctl">
          <span class="replay-pos">{{ replayIndex }} / {{ replayEntries.length }}</span>
          <button type="button" class="toggle-btn replay-btn" :title="$t('toolbar.replayStep')"
            :disabled="replayIndex >= replayEntries.length" @click="stepReplay">▶</button>
          <button type="button" class="toggle-btn replay-btn" :title="$t('toolbar.replayEnd')"
            :disabled="replayIndex >= replayEntries.length" @click="fastForwardReplay">⏭</button>
        </div>
        <div class="zoom-ctl">
          <button @click="zoomOut">−</button>
          <span>{{ Math.round(zoom * 100) }}%</span>
          <button @click="zoomIn">+</button>
        </div>
        <LanguageSwitcher />
      </div>
    </header>

    <main class="map-wrap" ref="mapWrapRef" :class="{ dragging: !!mapDrag }" @mousedown.right.prevent="onMapDragStart"
      @mousemove="onMapDragMove" @mouseup="onMapDragEnd" @mouseleave="onMapDragEnd" @contextmenu.prevent
      @wheel.prevent="onMapWheel" @scroll="hoveredCounter = null">
      <svg ref="svgRef" class="map-svg"
        :style="{ width: map.imageWidth * zoom + 'px', height: map.imageHeight * zoom + 'px' }"
        :viewBox="`0 0 ${map.imageWidth} ${map.imageHeight}`" preserveAspectRatio="none" @dragover.prevent
        @drop.prevent="onMapDrop">

        <image :href="map.url" x="0" y="0" :width="map.imageWidth" :height="map.imageHeight" preserveAspectRatio="none" />

        <g v-if="showGrid">
          <polygon v-for="hex in hexes" :key="hex.id" class="hex"
            :class="{ adjacent: debug ? isInRange(hex) : isReachable(hex), entry: isEntryHex(hex) }"
            :points="hex.pts" :stroke="gridStyle.stroke" :stroke-width="gridStyle.width"
            :stroke-opacity="gridStyle.opacity" vector-effect="non-scaling-stroke" @click="onHex(hex)" />
        </g>

        <!-- cf. lib/useAssisted.js::enemyZocSet — hex sous Zone de Contrôle
             (ZOC) ennemie du pion sélectionné : y entrer force l'arrêt du
             mouvement ce tour-ci (cf. canEnterHex, même règle, qui
             s'applique quel que soit cet affichage). Affiché UNIQUEMENT en
             mode debug (cf. HexMap.vue::zocSet) — la règle reste active en
             mode Assisté normal, seul ce surlignage est réservé au debug. -->
        <g v-if="debug">
          <polygon v-for="hex in hexes.filter((hex) => isZocHex(hex))" :key="'zoc' + hex.id" class="hex-zoc"
            :points="hex.pts" vector-effect="non-scaling-stroke" />
        </g>

        <!-- cf. la section "Reconnaissance du moteur" — hex que le moteur
             vient de désigner : clic droit sur une de ses unités pour le
             rapport. Purement informatif : les clics le traversent. -->
        <g v-if="reconTarget">
          <polygon v-for="hex in hexes.filter(isReconTargetHex)" :key="'recon' + hex.id" class="hex-recon-target"
            :points="hex.pts" vector-effect="non-scaling-stroke" />
        </g>
        <!-- Reconnaissance du joueur : sources possibles (contour), source
             choisie (plein) et ses cibles (jaune clignotant). Les clics
             traversent jusqu'aux pions et aux hex (cf. `onManualRecon`). -->
        <g v-if="manualReconChecks.length">
          <polygon v-for="hex in hexes.filter(isManualReconSourceHex)" :key="'rsrc' + hex.id"
            :class="isManualReconChosenHex(hex) ? 'hex-recon-source-chosen' : 'hex-recon-source'"
            :points="hex.pts" vector-effect="non-scaling-stroke" />
          <polygon v-for="hex in hexes.filter(isManualReconTargetHex)" :key="'rtgt' + hex.id" class="hex-recon-target"
            :points="hex.pts" vector-effect="non-scaling-stroke" />
        </g>

        <!-- Opérations aériennes du joueur : task forces ennemies repérées
             dont le support s'ouvre au clic (cf. `openFleetDisplay`). -->
        <g v-if="fleetDisplayHexes.size">
          <polygon v-for="hex in hexes.filter((hex) => fleetDisplayHexes.has(hex.c + ',' + hex.r))" :key="'fd' + hex.id"
            class="hex-fleet-display" :points="hex.pts" vector-effect="non-scaling-stroke" />
        </g>
        <!-- Organisation des combats navals : task forces en contact
             (contour), et celle choisie (plein). Les clics traversent
             jusqu'aux pions (cf. `onNavalOrgClick`). -->
        <g v-if="navalOrgHexes.size">
          <polygon v-for="hex in hexes.filter((hex) => navalOrgHexes.has(hex.c + ',' + hex.r))" :key="'naval' + hex.id"
            :class="navalOrgHexes.get(hex.c + ',' + hex.r) ? 'hex-naval-chosen' : 'hex-naval-contact'"
            :points="hex.pts" vector-effect="non-scaling-stroke" />
        </g>

        <g v-if="showLabels">
          <text v-for="hex in hexes" :key="'t' + hex.id" class="coordtxt" :x="hex.cx" :y="hex.cy + calibration.a * 0.18"
            text-anchor="middle" :font-size="calibration.a * 0.42">{{ hex.id }}</text>
        </g>

        <!-- cf. lib/useDebug.js — coût de terrain (COT) des hex adjacents au
             pion sélectionné, uniquement quand la case "debug" est cochée. -->
        <g v-if="debug">
          <text v-for="label in adjacentCotLabels" :key="'cot' + label.id" class="debug-cot" :x="label.cx" :y="label.cy"
            text-anchor="middle" :font-size="calibration.a * 0.55">{{ label.cot }}</text>
        </g>

        <!-- cf. lib/useDebug.js::autoMoveTrailLines — trajet de chaque pion à
             hex-objectif depuis le début de la partie (rond = début/fin d'un
             tour, croix = objectif), uniquement en mode debug. -->
        <g v-if="debug" class="debug-trails">
          <g v-for="trail in autoMoveTrailLines" :key="'trail' + trail.id" :style="{ color: trail.color }">
            <polyline v-if="trail.points" :points="trail.points" class="debug-trail" :stroke-width="calibration.a * 0.07" />
            <circle v-for="(dot, index) in trail.dots" :key="index" :cx="dot.x" :cy="dot.y" :r="calibration.a * 0.11" class="debug-trail-dot" />
            <path v-if="trail.objective" class="debug-trail" :stroke-width="calibration.a * 0.07"
              :d="`M${trail.objective.x - calibration.a * 0.25},${trail.objective.y - calibration.a * 0.25} l${calibration.a * 0.5},${calibration.a * 0.5} m0,${-calibration.a * 0.5} l${-calibration.a * 0.5},${calibration.a * 0.5}`" />
          </g>
        </g>

        <!-- cf. lib/useAssisted.js::entrySurcharge — surcoût de congestion
             déjà accumulé sur les hex d'entrée de renfort surlignés, visible
             uniquement en mode debug. -->
        <g v-if="debug">
          <text v-for="label in entrySurchargeLabels" :key="'entrysur' + label.id" class="debug-entry-surcharge"
            :x="label.cx" :y="label.cy - calibration.a * 0.4" text-anchor="middle" :font-size="calibration.a * 0.4">+{{ label.surcharge }}</text>
        </g>

        <g v-if="showCounters" class="counters">
          <!-- Marqueurs posés seuls rendus en premier : toujours sous les
               unités dans l'ordre de peinture SVG, quel que soit le hex. -->
          <Counter v-for="counter in counters.filter((counter) => !isUnit(counter) && !counter.attachedTo)" :key="counter.id" :id="counter.id" :src="counter.src" :col="counter.col"
            :row="counter.row" :calibration="calibration" :selected="selectedCounterId === counter.id" :selectable="false"
            :offset="stackOffsets.get(counter.id) ?? ZERO_OFFSET" :drag-px="draggedCounterId === counter.id ? dragCurrentPx : null"
            @dragstart="onCounterDragStart" @hex-click="onMarkerClick" @hover="onCounterHover" @unhover="onCounterUnhover" />
          <Counter v-for="counter in counters.filter(isUnit)" :key="counter.id" :id="counter.id" :src="unitSrc(counter)" :col="shownHex(counter).col"
            :row="shownHex(counter).row" :calibration="calibration" :selected="selectedCounterId === counter.id" :selectable="selectable"
            :moved="showMovedRings && movedThisTurnIds.has(String(counter.id)) && !autoMoveHeld.has(String(counter.id))" :label="privateLabelOf(counter)"
            :known="moduleRules.isKnownTarget(counter)"
            :offset="stackOffsets.get(counter.id) ?? ZERO_OFFSET" :drag-px="draggedCounterId === counter.id ? dragCurrentPx : shownPx(counter)"
            @select="onCounterSelect" @dragstart="onCounterDragStart" @contextmenu="onCounterContextMenu"
            @hover="onCounterHover" @unhover="onCounterUnhover" />
          <!-- Résultats de recherche (cf. `reportRecon`) : posés SUR la pile
               qu'ils renseignent, transparents aux clics (cf.
               `syncSearchMarkers`). Les pions "Sighted" qui remplacent
               l'image de leur unité n'y sont pas (cf. `unitSrc`). -->
          <Counter v-for="counter in counters.filter((counter) => counter.attachedTo && !replacesUnitImage(counter))" :key="counter.id" :id="counter.id" :src="counter.src" :col="shownHex(counter).col"
            :row="shownHex(counter).row" :calibration="calibration" :selected="false" :selectable="false"
            :offset="stackOffsets.get(counter.id) ?? ZERO_OFFSET" :drag-px="shownPx(counter)" class="search-marker" />
        </g>

        <!-- Combat naval (cf. `navalArrowLines`) : une flèche par attaque, de
             la task force qui attaque vers sa cible, par-dessus les pions.
             Les clics la traversent. -->
        <g v-if="navalArrowLines.length" class="naval-arrows">
          <defs>
            <marker id="naval-arrowhead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" class="naval-arrowhead" />
            </marker>
          </defs>
          <line v-for="line in navalArrowLines" :key="line.key" class="naval-arrow" :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2"
            :stroke-width="calibration.rowStep * 0.09" marker-end="url(#naval-arrowhead)" />
        </g>
      </svg>
    </main>

    <CalibrationPanel v-if="showCalib" :calibration="calibration" :grid-style="gridStyle" :map-config="mapConfig"
      :default-calibration="moduleCalibration" :image-width="map.imageWidth" :image-height="map.imageHeight" />

    <SidePanel :tabs="sidePanelTabs" v-model:open-tab="openTab">
      <template v-for="tab in sidePanelTabs" :key="tab.key" v-slot:[tab.key]>
        <EliminatedPanel v-if="tab.key === 'eliminated'" :units="eliminatedCounters" :removals="removalList"
          @contextmenu="onEliminatedContextMenu" />
        <SearchBagPanel v-else-if="tab.key === 'searchBag'" :bag="moduleRules.searchBag.value"
          :full="moduleRules.searchBagFull ?? {}" :looks="moduleRules.searchResults ?? {}" />
        <JournalPanel v-else-if="tab.key === 'journal'" ref="journalRef" :module-id="moduleId || module.name"
          :turn="turnInfo.turn" :settings="settings" :shared="online" :debug="debug" @loaded="onJournalLoaded"
          @settings-mismatch="(settings) => emit('restart-with', settings)" />
        <ReinforcementsPanel v-else :reinforcements="reinforcementsForTab(tab.key)"
          :selected-id="selectedReinforcementId" :current-turn="turnInfo.turn" :draggable="draggable || phase === PHASE_SETUP"
          :can-place="canPlaceNow"
          @dragstart="onCounterDragStart" @select="onReinforcementSelect" />
      </template>
    </SidePanel>

    <Toast :message="reconToast" @close="reconToast = null" />
    <!-- Organisation des combats navals par le joueur (cf. `onNavalOrgClick`). -->
    <div v-if="navalOrg" class="naval-org" role="region" :aria-label="$t('naval.orgTitle', { side: sideLabel(navalOrg.side) })">
      <strong>{{ $t('naval.orgTitle', { side: sideLabel(navalOrg.side) }) }}</strong>
      <p>{{ $t('naval.orgHint') }}</p>
      <p v-if="navalOrgMissing.length" class="naval-org-missing">{{ $t('naval.orgMissing', { units: navalOrgMissing.map(navalName).join(', ') }) }}</p>
      <button type="button" class="naval-org-btn" :disabled="navalOrgMissing.length > 0" @click="confirmNavalOrg">{{ $t('naval.orgValidate') }}</button>
    </div>
    <NavalCombatModal v-if="navalView" :key="navalView.battle.key" :title="navalView.title" :battle="navalView.battle"
      :initiative="navalView.initiative" :engine-side="moduleRules.autoMoveSide" :side-labels="navalSideLabels"
      :fleet-names="navalView.fleetNames" :damages="moduleRules.shipDamages"
      :firing="(side, range) => moduleRules.navalFiring(navalView.battle, side, range)"
      :plan="(side, range) => moduleRules.navalPlan(navalView.battle, side, range)"
      :propose-range="() => moduleRules.navalRangeProposal(navalView.battle)"
      :accepts-range="(range) => moduleRules.navalAcceptsRange(navalView.battle, range)"
      :resolve="(attacks) => moduleRules.resolveNavalAttacks(navalView.battle, attacks)" @done="onNavalBattleDone" />
    <ContextMenu v-if="contextMenu" :left-px="contextMenu.x" :top-px="contextMenu.y" :items="contextMenu.items"
      @choose="chooseContextMenuItem" @close="closeContextMenu" />
    <FleetDisplayModal v-if="fleetDisplayLayout" :layout="fleetDisplayLayout" :displays="moduleRules.fleetDisplays"
      :title="fleetDisplay.title" :damages="moduleRules.shipDamages" :damage-of="moduleRules.damageOf"
      :plane-states="moduleRules.planeStates" :plane-state-of="moduleRules.planeStateOf"
      :editable="shipDamageEditable" @damage="setShipDamage" @plane-state="setPlaneState" @close="fleetDisplay = null" />
    <TaskForceComposer v-if="alliedComposer" :title="alliedComposer.title" :kind="alliedComposer.fleet.kind"
      :displays="moduleRules.alliedFleetDisplays" :cell-ids="alliedComposer.fleet.cellIds" :cells="alliedComposer.fleet.cells"
      :groups="moduleRules.alliedGroups" :elsewhere="alliedComposer.elsewhere" :fits="moduleRules.alliedShipFits"
      :air-cell-ids="alliedComposer.fleet.airCellIds ?? []" :deck-of="moduleRules.alliedDeck"
      :damages="moduleRules.shipDamages" :damage-of="moduleRules.damageOf" :damage-editable="shipDamageEditable"
      @damage="setShipDamage"
      :plane-states="moduleRules.planeStates" :plane-state-of="moduleRules.planeStateOf" @plane-state="setPlaneState"
      :editable="alliedComposer.editable" :air-editable="alliedComposer.airEditable" @save="saveAlliedFleet" @close="alliedComposer = null" />
    <TaskForceComposer v-else-if="raidViews.length" :key="raidViews[0].id" :title="raidViews[0].title" :kind="raidViews[0].fleet.kind"
      :displays="moduleRules.alliedFleetDisplays" :cell-ids="raidViews[0].fleet.cellIds" :cells="raidViews[0].fleet.cells"
      :groups="moduleRules.alliedGroups" :fits="moduleRules.alliedShipFits"
      :air-cell-ids="raidViews[0].fleet.airCellIds ?? []" :deck-of="moduleRules.alliedDeck"
      :damages="moduleRules.shipDamages" :damage-of="moduleRules.damageOf" :damage-editable="shipDamageEditable"
      @damage="setShipDamage"
      :plane-states="moduleRules.planeStates" :plane-state-of="moduleRules.planeStateOf" @plane-state="setPlaneState" :raid="raidViews[0].raid" :debug="debug" @odds="openRaidOdds" @close="closeRaidView" />
    <RaidOddsModal v-if="raidOdds" :title="raidOdds.title" :planes="raidOdds.planes" :candidates="raidOdds.candidates"
      :plan="moduleRules.planRaidOptions" :chosen-id="raidOdds.chosenId" :chosen-points="raidOdds.chosenPoints" @close="raidOdds = null" />
    <StackPopup v-if="hoveredStackCounters.length" :counters="hoveredStackCounters" :anchor="hoveredCounter.anchor"
      :title="$t('stack.title', { hex: hexId(hoveredCounter.col + 1, hoveredCounter.row), n: hoveredStackCounters.length })" />

    <!-- Signaler un bug : cf. `openBugReport`. -->
    <!-- Guide de l'interface : cf. `showGuide`. -->
    <InterfaceGuide v-if="showGuide" :assisted="assisted" @close="closeGuide" />

    <BugReportModal v-if="bugReport" :snapshot="bugReport.snapshot" :game="bugReport.game" :context="bugReport.context" @close="bugReport = null" />

    <!-- cf. onPhaseNext — changement de phase refusé : unités empilées en fin
         de Mouvement (cf. lib/useAssisted.js::stackedHexes). -->
    <PhaseBlockedModal v-if="showPhaseBlocked" :stacks="stackedHexes" @close="showPhaseBlocked = false" />
    <!-- cf. onPhaseNext — fin de la mise en place : trop de pions posés (refus). -->
    <PhaseBlockedModal v-if="setupExcess" :title="$t('setupCheck.excessTitle')" @close="setupExcess = null">
      {{ $t('setupCheck.excess', { count: setupExcess.count, total: setupExcess.total, extra: setupExcess.count - setupExcess.total }) }}
    </PhaseBlockedModal>
    <!-- cf. onPhaseNext — confirmation de chaque changement de phase ou de tour. -->
    <PhaseBlockedModal v-if="phaseConfirm" :title="phaseConfirm.title" :confirm-label="$t('phaseConfirm.confirm')"
      @close="phaseConfirm = null" @confirm="confirmPhaseNext">
      {{ phaseConfirm.message }}
      <template v-for="warning in phaseConfirm.warnings" :key="warning"><br />⚠ {{ warning }}</template>
    </PhaseBlockedModal>

    <!-- cf. MoveTimer.vue — timing "Limité" : temps de la phase de Mouvement écoulé. -->
    <PhaseBlockedModal v-if="showTimeUp" :title="$t('timeUp.title')" @close="showTimeUp = false">
      {{ $t('timeUp.limited') }}
    </PhaseBlockedModal>

    <!-- cf. `gameEnd` — fin de partie : concession ou pendule Blitz à 0. Et
         la confirmation d'une concession (cf. `askConcede`). -->
    <GameEndModal v-if="concedeConfirm" :confirm-side="sideLabel(concedingSide)"
      @confirm="concede" @close="concedeConfirm = false" />
    <GameEndModal v-else-if="showGameEnd && gameEnd" :reason="gameEnd.reason" :winner="gameEnd.winner" :loser="gameEnd.loser"
      @close="showGameEnd = false" />

    <!-- cf. setSelectedCounter — changement de sélection refusé : l'unité
         en cours de mouvement est en overstack avec une unité amie. -->
    <PhaseBlockedModal v-if="unitStackBlock" :title="$t('unitStack.title')" :stacks="[unitStackBlock]"
      :stack-message="$t('unitStack.message')"
      @close="unitStackBlock = null" />

    <!-- Dé libre : mode Libre uniquement (cf. `showRollModal`). -->
    <RollModal v-if="!assisted" v-show="showRollModal" :disabled="inputLocked" @roll="onDiceRoll" />
  </div>
</template>

<style scoped>
.hexmap {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 36px 0;
  background: var(--c-paper);
  flex: none;
  position: relative;
  z-index: var(--z-raised);
}

.toolbar h1 {
  font-size: var(--fs-3xl);
  font-weight: 700;
  margin: 0;
  color: var(--c-brand-ink);
}

.turn-tracker-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.move-timers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
}

.game-over-tag {
  padding: 3px 10px;
  border-radius: var(--radius-6);
  background: var(--c-brand);
  color: var(--c-panel);
  font-size: var(--fs-sm);
  font-weight: 700;
}

.controls {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: var(--fs-sm);
}

.controls label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--c-ink);
}

.toggle-btn {
  padding: 5px 10px;
  font-size: var(--fs-sm);
  border: 1px solid color-mix(in srgb, var(--c-ink) 25%, transparent);
  border-radius: var(--radius-4);
  background: transparent;
  color: var(--c-ink);
  cursor: pointer;
}

.toggle-btn.active {
  background: color-mix(in srgb, var(--c-ink) 25%, transparent);
}

.toggle-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.replay-ctl {
  display: flex;
  align-items: center;
  gap: 6px;
}

.replay-pos {
  font-variant-numeric: tabular-nums;
  font-size: var(--fs-sm);
  opacity: 0.85;
}

.replay-btn {
  font-size: var(--fs-md);
  line-height: 1;
  padding: 5px 9px;
}

.zoom-ctl {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-ctl button {
  width: 26px;
  height: 26px;
  cursor: pointer;
}

.map-wrap {
  overflow: hidden;
  flex: 1;
  min-height: 0;
  background: var(--c-paper);
}

.map-wrap.dragging {
  cursor: grabbing;
  user-select: none;
}

.map-wrap.dragging * {
  cursor: grabbing !important;
}

.map-svg {
  display: block;
}

polygon.hex {
  fill: transparent;
  transition: fill 0.05s;
}

polygon.hex.adjacent {
  fill: color-mix(in srgb, color-mix(in srgb, var(--c-green) 60%, var(--c-ink)) 35%, transparent);
}

polygon.hex.adjacent:hover {
  fill: color-mix(in srgb, color-mix(in srgb, var(--c-green) 60%, var(--c-ink)) 55%, transparent);
}

polygon.hex.entry {
  fill: color-mix(in srgb, var(--c-orange) 40%, transparent);
}

polygon.hex.entry:hover {
  fill: color-mix(in srgb, var(--c-orange) 60%, transparent);
}

.coordtxt {
  font-family: var(--font-mono);
  font-weight: 700;
  fill: var(--c-ink);
  pointer-events: none;
}

/* cf. lib/useDebug.js — coût de terrain (COT) affiché sur les hex adjacents
   au pion sélectionné quand le mode debug est actif. Contour blanc (double
   trait, cf. paint-order) pour rester lisible sur n'importe quel fond de
   carte, y compris par-dessus la teinte verte de `.hex.adjacent`. */
.debug-trail {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.85;
  pointer-events: none;
}

.debug-trail-dot {
  fill: currentColor;
  stroke: var(--c-white);
  stroke-width: 1.5px;
  pointer-events: none;
}

.debug-cot {
  font-family: var(--font-mono);
  font-weight: 700;
  fill: var(--c-red);
  stroke: var(--c-white);
  stroke-width: 3px;
  paint-order: stroke fill;
  pointer-events: none;
}

/* cf. lib/useAssisted.js::entrySurcharge — surcoût de congestion accumulé
   sur un hex d'entrée de renfort (ex. "+0.5"). Couleur distincte de
   .debug-cot pour ne pas confondre les deux nombres s'ils apparaissent sur
   le même hex (le COT normal ET le surcoût d'entrée n'ont pas le même sens). */
.debug-entry-surcharge {
  font-family: var(--font-mono);
  font-weight: 700;
  fill: color-mix(in srgb, var(--c-green) 45%, var(--c-ink));
  stroke: var(--c-white);
  stroke-width: 3px;
  paint-order: stroke fill;
  pointer-events: none;
}

/* cf. lib/useAssisted.js::enemyZocSet — hex sous ZOC ennemie du pion
   sélectionné. Contour rouge en tirets (distinct des teintes pleines
   .hex.adjacent/.entry, avec lesquelles il peut se superposer — un hex peut
   être À LA FOIS accessible ET sous ZOC, cf. règle "doit s'y arrêter") pour
   rester lisible quel que soit ce qu'il y a dessous. */
.hex-zoc {
  fill: color-mix(in srgb, var(--c-red) 22%, transparent);
  stroke: var(--c-red);
  stroke-width: 2.5;
  stroke-dasharray: 5 3;
  pointer-events: none;
}

/* cf. la section "Reconnaissance du moteur" — résultat de recherche posé sur
   une unité, transparent aux clics ; hex que le moteur vient de désigner. */
.search-marker {
  pointer-events: none;
}
.hex-recon-target {
  fill: color-mix(in srgb, var(--c-gold) 28%, transparent);
  stroke: var(--c-gold);
  stroke-width: 3;
  pointer-events: none;
  animation: recon-pulse 1.2s ease-in-out infinite alternate;
}
.hex-recon-source {
  fill: none;
  stroke: color-mix(in srgb, var(--c-usn) 55%, var(--c-white));
  stroke-width: 3;
  pointer-events: none;
}
.hex-recon-source-chosen {
  fill: color-mix(in srgb, color-mix(in srgb, var(--c-usn) 55%, var(--c-white)) 30%, transparent);
  stroke: color-mix(in srgb, var(--c-usn) 55%, var(--c-white));
  stroke-width: 4;
  pointer-events: none;
}
.hex-fleet-display {
  fill: color-mix(in srgb, var(--c-orange) 18%, transparent);
  stroke: var(--c-orange);
  stroke-width: 3;
  pointer-events: none;
}
/* Combat naval : task forces en contact, celle choisie, flèches. */
.hex-naval-contact {
  fill: none;
  stroke: var(--c-red);
  stroke-width: 3;
  pointer-events: none;
}
.hex-naval-chosen {
  fill: color-mix(in srgb, var(--c-red) 25%, transparent);
  stroke: var(--c-red);
  stroke-width: 4;
  pointer-events: none;
}
.naval-arrows {
  pointer-events: none;
  filter: drop-shadow(0 0 2px var(--c-white));
}
.naval-arrow {
  stroke: var(--c-red);
  stroke-linecap: round;
}
.naval-arrowhead {
  fill: var(--c-red);
}
.naval-org {
  position: fixed;
  top: 84px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-floating);
  width: min(560px, calc(100vw - 32px));
  padding: 10px 14px 12px;
  border-radius: var(--radius-8);
  border-top: 3px solid var(--c-red);
  background: var(--c-panel);
  color: var(--c-panel-text);
  box-shadow: var(--shadow-widget);
  font-size: var(--fs-sm);
}
.naval-org strong {
  color: var(--c-gold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.naval-org p {
  margin: 6px 0;
}
.naval-org-missing {
  color: var(--c-steel);
}
.naval-org-btn {
  display: block;
  margin-left: auto;
  padding: 6px 14px;
  border: 1px solid var(--c-gold);
  border-radius: var(--radius-6);
  background: color-mix(in srgb, var(--c-gold) 22%, transparent);
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: background-color 150ms ease, transform 120ms ease-out;
}
.naval-org-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
@media (hover: hover) and (pointer: fine) {
  .naval-org-btn:not(:disabled):hover {
    background: color-mix(in srgb, var(--c-gold) 34%, transparent);
  }
}
.naval-org-btn:not(:disabled):active {
  transform: scale(0.97);
}
@keyframes recon-pulse {
  from { fill-opacity: 0.35; }
  to { fill-opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .hex-recon-target { animation: none; }
}
</style>
