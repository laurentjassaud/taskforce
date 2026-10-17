<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import GameSetupSteps from '../components/GameSetupSteps.vue'
import LanguageSwitcher from '../components/LanguageSwitcher.vue'
import { registerModuleTexts } from '../i18n/index.js'
import { defaultSettings, scenarioOptions } from '../lib/gameSettings.js'
import logoUrl from '../assets/home/logo-gbh.svg'
import ambientUrl from '../assets/home/ambient-top.png'
import carrierUrl from '../assets/home/carrier-band.jpg'
import yamatoUrl from '../assets/home/counter-yamato.png'
import westVirginiaUrl from '../assets/home/counter-west-virginia.png'
import zeroUrl from '../assets/home/counter-zero.png'
import kateUrl from '../assets/home/counter-kate.png'
import hiryuUrl from '../assets/home/counter-hiryu.png'
import indianapolisUrl from '../assets/home/counter-indianapolis.png'
import enterpriseUrl from '../assets/home/counter-enterprise.png'

// Page d'accueil de la boîte Task Force, jouée uniquement en solo : une
// présentation (crédits, avertissement), puis la création de la partie en
// deux étapes (scénario, mode Libre/Assisté — cf. GameSetupSteps.vue) avant
// de lancer DemoPlay.vue. Le module joué est le premier module actif de
// public/modules/index.json : il n'est plus proposé au choix.

const router = useRouter()
const { locale } = useI18n()

// 0 : présentation ; 1 : scénario ; 2 : mode de jeu.
const step = ref(0)
const moduleId = ref('')
const moduleData = ref(null)
const loadError = ref(false)
const settings = ref(defaultSettings())
const scenarios = computed(() => scenarioOptions(moduleData.value))

const siteUrl = computed(() => (locale.value === 'en' ? 'https://www.gameboxheroes.com/en/' : 'https://www.gameboxheroes.com/'))
const contactUrl = computed(() => `${siteUrl.value}contact.html`)
const legalUrl = computed(() => `${siteUrl.value}mentions-legales.html`)

// Pions posés sur le porte-avions (maquette Figma) : centre en px dans un
// groupe de 760 × 420 calé sur le haut du bandeau, et rotation.
const COUNTERS = [
  { src: yamatoUrl, x: 126, y: 140, w: 190, h: 117, r: 15 },
  { src: westVirginiaUrl, x: 391, y: 82, w: 190, h: 115, r: -16.39 },
  { src: kateUrl, x: 390, y: 206, w: 119, h: 118, r: 7.28 },
  { src: indianapolisUrl, x: 655, y: 183, w: 190, h: 116, r: -11.75 },
  { src: zeroUrl, x: 302, y: 330, w: 125, h: 125, r: -4.3 },
  { src: hiryuUrl, x: 103, y: 344, w: 190, h: 115, r: 9.53 },
  { src: enterpriseUrl, x: 564, y: 330, w: 190, h: 115, r: 5.38 },
]

onMounted(async () => {
  try {
    const index = await fetch('/modules/index.json', { cache: 'no-store' }).then((res) => res.json())
    const entry = index.find((mod) => mod.active !== false) ?? index[0]
    const data = await fetch(entry.path, { cache: 'no-store' }).then((res) => res.json())
    registerModuleTexts(data)
    moduleId.value = entry.id
    moduleData.value = data
  } catch {
    loadError.value = true
  }
})

const canStart = computed(() => !!moduleData.value)

function back() {
  if (step.value > 0) step.value -= 1
}
function next() {
  if (step.value < 2) step.value += 1
}
function start() {
  router.push({ name: 'demo-play', query: { module: moduleId.value, ...settings.value } })
}
</script>

<template>
  <div class="home">
    <div class="sky">
      <img class="ambient" :src="ambientUrl" alt="" aria-hidden="true" />

      <header class="topbar">
        <a :href="siteUrl" class="brand" :aria-label="$t('home.siteLink')">
          <img :src="logoUrl" width="65" height="73" alt="GameBoxHeroes" />
        </a>
        <LanguageSwitcher brand />
      </header>

      <main class="content">
        <div class="titles">
          <p class="kicker">{{ $t('home.kicker') }}</p>
          <h1 class="title">Task Force</h1>
          <p class="subtitle">Carrier battles in the Pacific</p>
        </div>

        <Transition name="stage" mode="out-in">
          <section v-if="step === 0" key="intro" class="stage">
            <div class="credits">
              <div class="credits-col">
                <p>{{ $t('home.about.intro') }}</p>
                <i18n-t keypath="home.about.origin" tag="p" scope="global">
                  <template #game><a href="https://boardgamegeek.com/boardgame/376966/task-force-carrier-battles-in-the-pacific" target="_blank" rel="noopener">Task Force: Carrier Battles in the Pacific</a></template>
                  <template #publisher><a href="https://vucasims.com/" target="_blank" rel="noopener">{{ $t('home.about.publisher') }}</a></template>
                </i18n-t>
                <p>{{ $t('home.about.required') }}</p>
                <p>{{ $t('home.about.differences') }}</p>
              </div>
              <div class="credits-col">
                <i18n-t keypath="home.credits.art" tag="p" scope="global">
                  <template #designer><a href="https://boardgamegeek.com/boardgamedesigner/4565/ginichiro-suzuki" target="_blank" rel="noopener">Ginichiro Suzuki</a></template>
                  <template #artist><a href="https://boardgamegeek.com/boardgameartist/150639/pablo-bazerque" target="_blank" rel="noopener">Pablo Bazerque</a></template>
                </i18n-t>
                <p>{{ $t('home.credits.free') }}</p>
                <i18n-t keypath="home.credits.shop" tag="p" scope="global">
                  <template #site><a href="https://vucasims.com/" target="_blank" rel="noopener">https://vucasims.com/</a></template>
                </i18n-t>
                <i18n-t keypath="home.credits.takedown" tag="p" scope="global">
                  <template #contact><a :href="contactUrl">{{ $t('home.credits.contact') }}</a></template>
                  <template #legal><a :href="legalUrl">{{ $t('home.credits.legal') }}</a></template>
                </i18n-t>
              </div>
            </div>
            <button type="button" class="cta" @click="next">{{ $t('home.start') }}</button>
          </section>

          <section v-else key="setup" class="stage">
            <GameSetupSteps v-model:settings="settings" :step="step" :scenarios="scenarios" />
            <p v-if="loadError" class="error">{{ $t('setup.moduleLoadError') }}</p>
            <nav class="actions">
              <button type="button" class="ghost" @click="back">{{ $t('common.back') }}</button>
              <button v-if="step < 2" type="button" class="cta small" @click="next">{{ $t('common.next') }}</button>
              <button v-else type="button" class="cta small" :disabled="!canStart" @click="start">{{ $t('home.play') }}</button>
            </nav>
          </section>
        </Transition>
      </main>
    </div>

    <div class="band" aria-hidden="true">
      <img class="band-art" :src="carrierUrl" alt="" />
      <div class="counters">
        <img v-for="(counter, index) in COUNTERS" :key="counter.src" class="counter" :src="counter.src" alt=""
          :width="counter.w" :height="counter.h"
          :style="{ left: `${counter.x}px`, top: `${counter.y}px`, '--r': `${counter.r}deg`, '--i': index }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100svh;
  overflow: hidden;
  background: var(--color-white);
  color: var(--color-ink);
  font-family: Inter, system-ui, sans-serif;
}

/* Ciel : tout ce qui est au-dessus du bandeau, sur le fond d'ambiance (avion
   et îles du visuel de la boîte, très pâles). Sa marge du bas laisse la place
   aux pions qui débordent du bandeau. */
.sky {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-bottom: 82px;
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
  position: absolute;
  z-index: 2;
  top: 20px;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-inline: clamp(16px, 6.5vw, 124px);
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
@media (max-width: 720px) {
  .topbar {
    position: relative;
    top: 0;
    align-items: center;
    padding: 16px;
  }
}

.content {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 16px 0;
}
@media (max-width: 720px) {
  .content {
    padding-top: 0;
  }
}

.titles {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  line-height: normal;
}
.kicker {
  font-size: clamp(16px, 1.1vw, 20px);
  font-weight: 500;
  color: var(--brand-ink);
}
.title {
  margin: -0.15em 0;
  font-size: clamp(40px, 6.25vw, 120px);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  color: var(--brand-blue);
}
.subtitle {
  font-size: clamp(14px, 1.1vw, 20px);
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--brand-ink);
}

.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding-top: 40px;
}

.credits {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 400px));
  gap: 40px;
  padding-block: 20px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--color-ink);
}
@media (max-width: 880px) {
  .credits {
    grid-template-columns: minmax(0, 480px);
    gap: 12px;
  }
}
.credits a {
  color: var(--brand-orange);
  text-decoration: underline;
  text-underline-offset: 2px;
}
@media (hover: hover) and (pointer: fine) {
  .credits a:hover {
    text-decoration-thickness: 2px;
  }
}

.cta {
  margin-top: 40px;
  padding: 20px 40px;
  border: none;
  border-radius: 8px;
  background: var(--brand-orange);
  color: var(--color-white);
  font: inherit;
  font-size: clamp(18px, 1.25vw, 24px);
  font-weight: 300;
  line-height: normal;
  text-transform: uppercase;
  cursor: pointer;
  transition: background-color 150ms ease, transform 160ms var(--ease-out);
}
.cta.small {
  margin-top: 0;
  padding: 14px 32px;
  font-size: 18px;
}
@media (hover: hover) and (pointer: fine) {
  .cta:not(:disabled):hover {
    background: var(--brand-orange-strong);
  }
  .ghost:hover {
    border-color: var(--brand-ink);
  }
}
.cta:not(:disabled):active,
.ghost:active {
  transform: scale(0.97);
}
.cta:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cta:focus-visible,
.ghost:focus-visible {
  outline: 2px solid var(--brand-blue);
  outline-offset: 3px;
}

.ghost {
  padding: 14px 28px;
  border: 1px solid var(--brand-line-strong);
  border-radius: 8px;
  background: var(--color-white);
  color: var(--brand-ink);
  font: inherit;
  font-size: 18px;
  font-weight: 300;
  line-height: normal;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 150ms ease, transform 160ms var(--ease-out);
}

/* Écrans peu hauts (portables) : on resserre la présentation. */
@media (max-height: 900px) {
  .stage {
    padding-top: 20px;
  }
  .credits {
    padding-block: 8px;
  }
  .cta {
    margin-top: 24px;
  }
}

.actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 32px;
}
.error {
  margin-top: 16px;
  color: var(--light-danger);
}

.stage-enter-active {
  transition: opacity 240ms var(--ease-out), transform 240ms var(--ease-out);
}
.stage-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}
.stage-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.stage-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* Bandeau du bas : le porte-avions du visuel de la boîte et quelques pions
   posés dessus, qui débordent au-dessus du bandeau. */
.band {
  position: relative;
  flex: none;
  height: clamp(220px, 38vh, 412px);
}
/* Au moins 1280 px de large : sur un écran étroit, on garde le cadrage du
   porte-avions au lieu de laisser remonter le titre de la boîte. */
.band-art {
  position: absolute;
  top: 0;
  left: 50%;
  width: max(100%, 1280px);
  height: 100%;
  transform: translateX(-50%);
  object-fit: cover;
  object-position: 50% 66.4%;
  pointer-events: none;
  user-select: none;
}
.counters {
  position: absolute;
  top: -82px;
  left: 50%;
  width: 760px;
  height: 420px;
  margin-left: -380px;
  transform-origin: 50% 0;
  pointer-events: none;
}
@media (max-width: 1100px) {
  .counters {
    transform: scale(0.75);
  }
}
@media (max-width: 720px) {
  .band-art {
    object-position: 50% 74%;
  }
  .counters {
    transform: scale(0.5);
  }
}
.counter {
  position: absolute;
  transform: translate(-50%, -50%) rotate(var(--r));
  filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.35));
  user-select: none;
  animation: counter-drop 420ms var(--ease-out) both;
  animation-delay: calc(120ms + var(--i) * 50ms);
}
@keyframes counter-drop {
  from {
    opacity: 0;
    transform: translate(-50%, calc(-50% - 18px)) rotate(calc(var(--r) - 6deg)) scale(1.04);
  }
}
@media (prefers-reduced-motion: reduce) {
  .stage-enter-from,
  .stage-leave-to {
    transform: none;
  }
  .counter {
    animation-name: counter-fade;
  }
}
@keyframes counter-fade {
  from {
    opacity: 0;
  }
}
</style>
