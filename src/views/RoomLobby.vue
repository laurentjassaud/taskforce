<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getGame } from '../lib/api.js'
import { getSocket } from '../lib/socket.js'
import HexMap from '../components/HexMap.vue'
import LanguageSwitcher from '../components/LanguageSwitcher.vue'
import { fetchModule } from '../lib/moduleLoader.js'
import { resolveSettings, describeSettings, scenarioOptions } from '../lib/gameSettings.js'
import { t, mt, errorMessage, registerModuleTexts } from '../i18n/index.js'
import { APP_RELEASE, APP_VERSION } from '../lib/bugReport.js'
import logoUrl from '../assets/home/logo-gbh.svg'
import ambientUrl from '../assets/home/ambient-top.png'

// Partie EN LIGNE (cf. SoloHome.vue, case « Jouer en ligne » à deux joueurs),
// créée sur le serveur (cf. server/src/rooms.js). D'abord le salon : chaque
// joueur y choisit son pseudo et son camp, et le créateur y trouve le lien
// d'invitation à envoyer à son adversaire (code d'accès compris, `?code=`).
// Une fois les deux camps pris, le plateau (HexMap.vue, `online`) : coups,
// tours, phases et journal passent par le WebSocket (cf. lib/socket.js), et
// le serveur ne laisse jouer que le camp qui a la main. Les identifiants du
// joueur restent dans ce navigateur : une page rechargée ou une connexion
// coupée le remet à sa place, la partie reconstituée par le journal partagé.

const props = defineProps({ id: { type: String, required: true } })
const route = useRoute()
const router = useRouter()

const storageKey = `wargame:room:${props.id}`
const NICKNAME_KEY = 'wargame:nickname'

function readStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}
function writeStored(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Stockage indisponible (navigation privée...) : identifiants non retenus,
    // le joueur devra rouvrir le lien d'invitation après un rechargement.
  }
}

const loadingGame = ref(true)
const gameSummary = ref(null) // GET /api/games/:id (moduleId, settings, players...)
const moduleData = ref(null) // module JSON complet, pour le plateau
const loadError = ref('')
const hexMapRef = ref(null)

const joined = ref(false)
const room = ref(null) // état de la room poussé par le serveur (room:update / room:started)
const joinError = ref('')
const joining = ref(false)
const connected = ref(getSocket().connected)

// Code d'accès : celui du lien d'invitation, à défaut celui déjà retenu ;
// inconnu, le formulaire le demande.
const passcode = ref(String(route.query.code ?? '').trim().toUpperCase() || readStored(storageKey)?.passcode || '')
const form = ref({ name: readStored(NICKNAME_KEY) ?? '', side: '', passcode: '' })
// Camp du joueur sur CE navigateur : le seul qu'il voit et qu'il joue.
const mySide = ref('')
// Journal partagé reçu en (re)joignant la partie (cf. HexMap.vue, prop
// `initialJournal`) — à deux joueurs, ce que son camp en voit —, et pions
// adverses qu'il voit encore (prop `initialRevealed`).
const sharedJournal = ref([])
const revealed = ref({})

// Réglages choisis à la création (cf. SoloHome.vue) : les mêmes pour les
// deux joueurs.
const scenarios = computed(() => (moduleData.value ? scenarioOptions(moduleData.value) : null))
const settings = computed(() => resolveSettings(gameSummary.value?.settings, scenarios.value))
const settingsInfo = computed(() => describeSettings(settings.value, scenarios.value))
const isDuelParty = computed(() => settings.value.party === 'duel')
const isAssistedParty = computed(() => ['assiste', 'duel'].includes(settings.value.party))

// Un journal joué avec d'autres réglages ne peut pas être repris ici : les
// réglages d'une partie en ligne sont fixés pour tous les joueurs.
const replayWarning = ref('')
function onRestartWith() {
  replayWarning.value = t('lobby.replayWarning')
}

const sideLabel = (side) => mt(moduleData.value?.turnTrack?.sides?.[side]?.label) ?? side
const sideColor = (side) => moduleData.value?.turnTrack?.sides?.[side]?.color ?? 'var(--c-brand)'
const sides = computed(() => Object.keys(moduleData.value?.sides ?? {}))
const players = computed(() => room.value?.players ?? gameSummary.value?.players ?? [])
const takenSides = computed(() => new Set(players.value.map((player) => player.side)))
const opponent = computed(() => (joined.value ? players.value.find((player) => player.side !== mySide.value) ?? null : null))
const started = computed(() => joined.value && room.value?.status === 'started' && !!moduleData.value)

// Lien d'invitation : la room et son code d'accès.
const inviteUrl = computed(() => new URL(router.resolve({ name: 'room-lobby', params: { id: props.id }, query: { code: passcode.value } }).href,
  window.location.origin).href)
const inviteInput = ref(null)
const copied = ref(false)
let copiedTimer = null
async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteUrl.value)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // Presse-papiers refusé : le lien est sélectionné, à copier à la main.
    inviteInput.value?.select()
  }
}

async function loadGame() {
  loadingGame.value = true
  loadError.value = ''
  try {
    gameSummary.value = await getGame(props.id)
    const index = await fetch('/modules/index.json', { cache: 'no-store' }).then((response) => response.json())
    const entry = index.find((moduleEntry) => moduleEntry.id === gameSummary.value.moduleId)
    if (!entry) throw new Error('module-missing')
    const data = await fetchModule(entry.path)
    registerModuleTexts(data)
    moduleData.value = data
    document.title = data.name
    form.value.side = sides.value.find((side) => !takenSides.value.has(side)) ?? ''
  } catch (error) {
    loadError.value = errorMessage(error.message)
  } finally {
    loadingGame.value = false
  }
}

// Évènements du serveur (cf. server/src/socket.js), relayés au plateau.
const handlers = {
  'room:update': (state) => { if (state.id === props.id) room.value = state },
  'room:started': (state) => { if (state.id === props.id) room.value = state },
  'game:move': ({ counterId, col, row }) => hexMapRef.value?.applyRemoteMove(counterId, col, row),
  'game:turn': ({ turnStep }) => hexMapRef.value?.applyRemoteTurn(turnStep),
  'game:phase': ({ phase, step, blitzUsed }) => hexMapRef.value?.applyRemotePhase(phase, step, blitzUsed),
  'game:over': ({ loser, reason }) => hexMapRef.value?.applyRemoteGameOver(loser, reason),
  'game:log': ({ entry }) => hexMapRef.value?.applyRemoteEntry(entry),
  'game:unlog': ({ uid }) => hexMapRef.value?.removeRemoteEntry(uid),
  connect: () => {
    connected.value = true
    // Reconnexion (automatique après une coupure réseau) : on rejoint avec
    // les mêmes identifiants, pour que le serveur rende son siège au joueur
    // au lieu de lui en chercher un autre.
    const saved = readStored(storageKey)
    if (saved && joined.value) doJoin(saved, { silent: true })
  },
  disconnect: () => { connected.value = false },
}

/** Rejoint la room — `playerId` connu : reprend son siège. `silent` : un
 *  refus ne s'affiche pas (identifiants retenus devenus caducs). */
function doJoin({ passcode: code, name, side, playerId }, { silent = false } = {}) {
  joining.value = true
  if (!silent) joinError.value = ''
  return new Promise((resolve) => {
    getSocket().emit('game:join', { gameId: props.id, passcode: code, playerId, name, side }, (ack) => {
      joining.value = false
      if (ack?.ok) {
        room.value = ack.room
        // Le serveur fait foi sur le siège repris : pseudo et camp d'origine.
        const me = ack.room.players.find((player) => player.id === ack.playerId)
        mySide.value = me?.side ?? side
        passcode.value = code
        // Plateau déjà affiché (reconnexion) : il se réaligne entièrement sur
        // le serveur (cf. HexMap.vue::resyncFromServer). Sinon, le journal
        // sera rejoué au montage du plateau.
        if (hexMapRef.value) hexMapRef.value.resyncFromServer(ack.journal, ack.room, ack.revealed)
        else {
          sharedJournal.value = ack.journal ?? []
          revealed.value = ack.revealed ?? {}
        }
        joined.value = true
        writeStored(storageKey, { passcode: code, name: me?.name ?? name, side: mySide.value, playerId: ack.playerId })
      } else if (!silent) {
        joinError.value = errorMessage(ack?.error ?? 'unknown-error')
      }
      resolve(ack ?? { ok: false })
    })
  })
}

function submitJoin() {
  writeStored(NICKNAME_KEY, form.value.name)
  doJoin({ name: form.value.name, side: form.value.side, passcode: (passcode.value || form.value.passcode).toUpperCase() })
}

// Ce que le plateau joue ici part au serveur, qui le rediffuse à l'adversaire.
const emitGame = (event, payload = {}) => getSocket().emit(event, { gameId: props.id, ...payload })
const onLocalMove = (move) => emitGame('game:move', move)
// Le nouveau pas est déjà appliqué localement (cf. HexMap.vue::onTurnAdvance) ;
// le serveur incrémente le sien et rediffuse la valeur qui fait foi.
const onLocalTurn = () => emitGame('game:turn')
const onLocalPhase = (change) => emitGame('game:phase', change)
const onLocalGameOver = (over) => emitGame('game:over', over)
const onLocalLog = (entry) => emitGame('game:log', { entry })
const onLocalUnlog = (uid) => emitGame('game:unlog', { uid })
// Reconnaissance à deux joueurs : le serveur l'arbitre (cf. server/src/duel.js)
// et envoie à chaque camp sa propre entrée du journal (`game:log`) ; refusée,
// le joueur peut la relancer.
function onRecon({ step, centers }) {
  getSocket().emit('game:recon', { gameId: props.id, step, centers }, (ack) => {
    if (!ack?.ok) hexMapRef.value?.reconRefused()
  })
}
// Déploiement initial (et tour de départ) proposés par le plateau : ceux que
// le serveur retient (les premiers proposés par l'un des joueurs) sont
// appliqués ici.
function onDeploy({ setup, turn }) {
  getSocket().emit('game:deploy', { gameId: props.id, entry: setup, turnEntry: turn }, (ack) => {
    for (const entry of ack?.entries ?? []) hexMapRef.value?.applyRemoteEntry(entry)
  })
}

onMounted(async () => {
  const socket = getSocket()
  for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler)
  await loadGame()
  if (loadError.value) return
  const saved = readStored(storageKey)
  if (!saved?.playerId) return
  const ack = await doJoin(saved, { silent: true })
  // Identifiants qui ne fonctionnent plus (partie recréée...) : oubliés, le
  // formulaire prend le relais.
  if (!ack.ok) writeStored(storageKey, { passcode: passcode.value })
})

onUnmounted(() => {
  const socket = getSocket()
  for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler)
  clearTimeout(copiedTimer)
})
</script>

<template>
  <div v-if="started" class="app">
    <p class="game-banner">
      <span class="version" :title="APP_VERSION">v. {{ APP_RELEASE }}</span>
      {{ $t('summary.scenario', { name: settingsInfo.scenario }) }} · {{ $t('summary.party', { name: settingsInfo.party }) }} · {{ $t('lobby.onlineTag') }}
      <span class="banner-players">
        <span v-for="player in room.players" :key="player.id" class="banner-player" :style="{ '--side': sideColor(player.side) }">
          <span class="presence-dot" :class="{ off: !player.connected }"
            :title="player.connected ? $t('lobby.online') : $t('lobby.offline')" />
          {{ player.name }} ({{ sideLabel(player.side) }}<template v-if="player.side === mySide">, {{ $t('lobby.you') }}</template>)
        </span>
      </span>
      <span v-if="!connected" class="banner-alert" role="alert">{{ $t('lobby.disconnected') }}</span>
      <span v-else-if="opponent && !opponent.connected" class="banner-alert">{{ $t('lobby.opponentOffline', { name: opponent.name }) }}</span>
      <span v-if="replayWarning" class="banner-alert">{{ replayWarning }}</span>
    </p>
    <HexMap
      ref="hexMapRef"
      :module="moduleData"
      :module-id="gameSummary.moduleId"
      :initial-positions="room.boardState"
      :initial-turn-step="room.turnStep ?? 0"
      :initial-phase="room.phase ?? null"
      :initial-phase-elapsed-ms="room.phaseElapsedMs ?? 0"
      :initial-blitz-used-ms="room.blitzUsedMs ?? {}"
      :initial-blitz-loser="room.blitzLoser ?? null"
      :initial-game-over-reason="room.gameOverReason ?? null"
      :local-side="mySide"
      online
      :initial-journal="sharedJournal"
      :initial-revealed="revealed"
      :assisted="isAssistedParty"
      :duel="isDuelParty"
      :settings="settings"
      @move="onLocalMove"
      @turn="onLocalTurn"
      @phase="onLocalPhase"
      @game-over="onLocalGameOver"
      @log="onLocalLog"
      @unlog="onLocalUnlog"
      @deploy="onDeploy"
      @recon="onRecon"
      @restart-with="onRestartWith"
    />
  </div>

  <div v-else class="lobby">
    <img class="ambient" :src="ambientUrl" alt="" aria-hidden="true" />
    <header class="topbar">
      <router-link to="/" class="brand" :aria-label="$t('lobby.back')">
        <img :src="logoUrl" width="65" height="73" alt="GameBoxHeroes" />
      </router-link>
      <LanguageSwitcher brand />
    </header>

    <main class="content">
      <div class="titles">
        <p class="kicker">{{ $t('lobby.kicker') }}</p>
        <h1 class="title">Task Force</h1>
      </div>

      <section class="card">
        <p v-if="loadingGame" class="muted">{{ $t('lobby.loading') }}</p>

        <template v-else-if="loadError">
          <p class="error" role="alert">{{ loadError }}</p>
          <router-link to="/" class="ghost">{{ $t('lobby.back') }}</router-link>
        </template>

        <template v-else>
          <p class="summary">{{ settingsInfo.scenario }} · {{ settingsInfo.party }}</p>

          <form v-if="!joined" class="join-form" @submit.prevent="submitJoin">
            <h2>{{ $t('lobby.joinTitle') }}</h2>
            <label class="field">
              <span class="field-label">{{ $t('lobby.nickname') }}</span>
              <input v-model.trim="form.name" required maxlength="40" autocomplete="nickname" />
            </label>
            <fieldset class="field">
              <legend class="field-label">{{ $t('lobby.side') }}</legend>
              <div class="sides">
                <label v-for="side in sides" :key="side" class="side-choice"
                  :class="{ selected: form.side === side, disabled: takenSides.has(side) }" :style="{ '--side': sideColor(side) }">
                  <input v-model="form.side" type="radio" name="side" :value="side" :disabled="takenSides.has(side)" required />
                  <span class="side-name">{{ sideLabel(side) }}</span>
                  <span v-if="takenSides.has(side)" class="side-taken">{{ $t('lobby.taken') }}</span>
                </label>
              </div>
            </fieldset>
            <label v-if="!passcode" class="field">
              <span class="field-label">{{ $t('lobby.passcode') }}</span>
              <input v-model.trim="form.passcode" required maxlength="6" class="code-input" autocomplete="off" />
            </label>
            <p v-if="joinError" class="error" role="alert">{{ joinError }}</p>
            <button type="submit" class="cta small" :disabled="joining || !form.side">
              {{ joining ? $t('lobby.joining') : $t('lobby.join') }}
            </button>
          </form>

          <div v-else class="waiting">
            <h2><span class="pulse" aria-hidden="true" />{{ $t('lobby.waiting') }}</h2>
            <p class="muted">{{ $t('lobby.inviteText') }}</p>
            <div class="invite">
              <input ref="inviteInput" :value="inviteUrl" readonly :aria-label="$t('lobby.inviteLabel')" @focus="$event.target.select()" />
              <button type="button" class="cta small" @click="copyInvite">{{ copied ? $t('lobby.copied') : $t('lobby.copy') }}</button>
            </div>
            <ul class="players">
              <li v-for="player in room.players" :key="player.id" :style="{ '--side': sideColor(player.side) }">
                <strong>{{ player.name }}</strong>
                <span class="side-tag">{{ sideLabel(player.side) }}</span>
                <span v-if="player.side === mySide" class="you">({{ $t('lobby.you') }})</span>
                <span class="presence" :class="{ off: !player.connected }">
                  <span class="presence-dot" :class="{ off: !player.connected }" />
                  {{ player.connected ? $t('lobby.online') : $t('lobby.offline') }}
                </span>
              </li>
            </ul>
          </div>

          <p v-if="!connected" class="muted">{{ $t('lobby.connecting') }}</p>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* Plateau : comme DemoPlay.vue, avec les joueurs dans le bandeau. */
.app {
  max-width: none;
  display: block;
}
.game-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin: 0;
  padding: 6px 12px;
  font-size: var(--fs-sm);
  color: var(--c-ink);
  background: var(--c-paper);
  border-bottom: 1px solid var(--c-line);
}
.banner-players {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-left: auto;
}
.banner-player {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-left: 8px;
  border-left: 3px solid var(--side);
}
.banner-alert {
  flex-basis: 100%;
  color: var(--c-red);
  font-weight: 600;
}

/* Salon : même fond et mêmes titres que l'accueil (SoloHome.vue). */
.lobby {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100svh;
  overflow: hidden;
  background: var(--c-white);
  color: var(--c-ink);
  font-family: Inter, system-ui, sans-serif;
}
.ambient {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: bottom;
  pointer-events: none;
  user-select: none;
}
.topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px clamp(16px, 6.5vw, 124px) 0;
}
.brand {
  display: block;
  line-height: 0;
  transition: transform 160ms var(--ease-out);
}
.brand:active {
  transform: scale(0.96);
}
.brand img {
  width: clamp(44px, 3.4vw, 65px);
  height: auto;
}
.content {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 16px 48px;
}
.titles {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  line-height: normal;
}
.kicker {
  font-size: var(--fs-xl);
  font-weight: 500;
  color: var(--c-brand-ink);
}
.title {
  margin: -0.15em 0;
  font-size: var(--fs-hero);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  color: var(--c-brand-blue);
}

.card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
  width: min(100%, 560px);
  margin-top: 32px;
  padding: 28px;
  background: var(--c-white);
  border: 1px solid var(--c-line);
  border-radius: 8px;
  box-shadow: 0 12px 32px -20px color-mix(in srgb, var(--c-ink) 40%, transparent);
}
.card h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--fs-2xl);
  font-weight: 600;
  color: var(--c-brand-ink);
}
.summary {
  font-size: var(--fs-sm);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-brand-blue);
}
.muted {
  font-size: var(--fs-sm);
  line-height: 1.5;
  color: var(--c-ink-soft);
}
.error {
  color: var(--c-red);
}

.join-form,
.waiting {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: none;
}
.field-label {
  padding: 0;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-brand-ink);
}
.field input,
.invite input {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--c-line);
  border-radius: 6px;
  background: var(--c-white);
  color: var(--c-ink);
  font: inherit;
  font-size: var(--fs-base);
}
.field input:focus-visible,
.invite input:focus-visible {
  outline: 2px solid var(--c-brand-blue);
  outline-offset: 1px;
}
.code-input {
  font-family: var(--font-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.sides {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.side-choice {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--c-line);
  border-left: 4px solid var(--side);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 160ms var(--ease-out);
}
.side-choice input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.side-choice:has(input:focus-visible) {
  outline: 2px solid var(--c-brand-blue);
  outline-offset: 3px;
}
.side-choice.selected {
  border-color: var(--side);
  box-shadow: inset 0 0 0 1px var(--side);
}
.side-choice:not(.disabled):active {
  transform: scale(0.98);
}
.side-choice.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.side-name {
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--c-brand-ink);
}
.side-taken {
  font-size: var(--fs-xs);
  font-weight: 600;
  text-transform: uppercase;
  color: var(--c-ink-soft);
}

.invite {
  display: flex;
  gap: 8px;
}
.invite input {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
}
@media (max-width: 520px) {
  .invite {
    flex-direction: column;
  }
}

.players {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.players li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--c-line);
  border-left: 4px solid var(--side);
  border-radius: 6px;
}
.side-tag {
  color: var(--c-ink-soft);
}
.you {
  font-size: var(--fs-sm);
  color: var(--c-brand-blue);
}
.presence {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  font-size: var(--fs-sm);
  white-space: nowrap;
  color: color-mix(in srgb, var(--c-green) 70%, var(--c-ink));
}
.presence.off {
  color: var(--c-ink-soft);
}
.presence-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-green);
}
.presence-dot.off {
  background: color-mix(in srgb, var(--c-steel) 55%, var(--c-white));
}
.pulse {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--c-brand);
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}

.cta {
  align-self: center;
  padding: 14px 32px;
  border: none;
  border-radius: 8px;
  background: var(--c-brand);
  color: var(--c-white);
  font: inherit;
  font-size: var(--fs-lg);
  font-weight: 300;
  line-height: normal;
  text-transform: uppercase;
  cursor: pointer;
  transition: background-color 150ms ease, transform 160ms var(--ease-out);
}
.invite .cta {
  align-self: stretch;
  padding: 10px 20px;
  font-size: var(--fs-md);
  white-space: nowrap;
}
.ghost {
  align-self: center;
  padding: 12px 24px;
  border: 1px solid color-mix(in srgb, var(--c-steel) 55%, var(--c-white));
  border-radius: 8px;
  background: var(--c-white);
  color: var(--c-brand-ink);
  font-size: var(--fs-md);
  font-weight: 300;
  text-decoration: none;
  text-transform: uppercase;
}
@media (hover: hover) and (pointer: fine) {
  .cta:not(:disabled):hover {
    background: color-mix(in srgb, var(--c-brand) 88%, var(--c-ink));
  }
  .ghost:hover {
    border-color: var(--c-brand-ink);
  }
  .side-choice:not(.disabled):not(.selected):hover {
    border-color: var(--side);
  }
}
.cta:not(:disabled):active {
  transform: scale(0.97);
}
.cta:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cta:focus-visible,
.ghost:focus-visible {
  outline: 2px solid var(--c-brand-blue);
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  .pulse {
    animation: none;
  }
}
</style>
