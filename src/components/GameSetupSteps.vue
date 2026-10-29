<script setup>
import { ref, watch } from 'vue'
import { PARTY_OPTIONS } from '../lib/gameSettings.js'

// Étapes de la création d'une partie solo (cf. SoloHome.vue) : 1. scénario,
// 2. mode de jeu (cf. gameSettings.js::PARTY_OPTIONS — ceux pas encore
// développés proposés grisés). Le parent gère la navigation (`step`),
// fournit les scénarios du module (cf. gameSettings.js::scenarioOptions) et
// reçoit les réglages (format lib/gameSettings.js) via v-model.
// À deux joueurs, une case à cocher propose de jouer EN LIGNE (`online`, en
// v-model) : chacun sur son écran, par le serveur des parties (cf.
// RoomLobby.vue) — ce n'est pas un réglage de la partie mais la façon de la
// lancer (cf. SoloHome.vue::start).

const props = defineProps({
  step: { type: Number, required: true },
  scenarios: { type: Array, default: () => [] },
})

const settings = defineModel('settings', { type: Object, required: true })
const online = defineModel('online', { type: Boolean, default: false })

const scenario = ref(settings.value.scenario)
// Un mode pas encore disponible (ou qui n'existe plus, ex. l'ancien
// "Libre") est remplacé par le premier mode disponible.
const isAvailableParty = (id) => PARTY_OPTIONS.some((option) => option.id === id && option.available !== false)
const party = ref(isAvailableParty(settings.value.party) ? settings.value.party : PARTY_OPTIONS.find((option) => isAvailableParty(option.id)).id)

// Un scénario qui n'existe pas (ou n'est pas disponible) dans le module est
// remplacé par son premier scénario disponible.
watch(() => props.scenarios, (list) => {
  if (!list.some((option) => option.id === scenario.value && option.available)) {
    scenario.value = list.find((option) => option.available)?.id ?? scenario.value
  }
}, { immediate: true })

watch([scenario, party], () => {
  settings.value = { ...settings.value, scenario: scenario.value, party: party.value }
}, { immediate: true })
</script>

<template>
  <Transition name="step" mode="out-in">
    <section v-if="step === 1" key="scenario" class="step">
      <p class="step-index">{{ $t('setup.stepOf', { step, total: 2 }) }}</p>
      <h2>{{ $t('setup.chooseScenario') }}</h2>
      <div class="choices" role="radiogroup" :aria-label="$t('setup.chooseScenario')">
        <label v-for="opt in scenarios" :key="opt.id" class="choice"
          :class="{ selected: scenario === opt.id, disabled: opt.available === false }">
          <input v-model="scenario" type="radio" name="scenario" :value="opt.id" :disabled="opt.available === false" />
          <span class="choice-mark" aria-hidden="true" />
          <span class="choice-body">
            <span class="choice-title">{{ opt.label }}</span>
            <span v-if="opt.available === false" class="badge">{{ $t('common.comingSoon') }}</span>
          </span>
        </label>
      </div>
    </section>

    <section v-else-if="step === 2" key="mode" class="step">
      <p class="step-index">{{ $t('setup.stepOf', { step, total: 2 }) }}</p>
      <h2>{{ $t('setup.gameMode') }}</h2>
      <div class="choices" role="radiogroup" :aria-label="$t('setup.gameMode')">
        <label v-for="opt in PARTY_OPTIONS" :key="opt.id" class="choice"
          :class="{ selected: party === opt.id, disabled: opt.available === false }">
          <input v-model="party" type="radio" name="party" :value="opt.id" :disabled="opt.available === false" />
          <span class="choice-mark" aria-hidden="true" />
          <span class="choice-body">
            <span class="choice-title">{{ opt.label }}</span>
            <span class="choice-text">{{ $t(`setup.partyHint.${opt.id}`) }}</span>
            <span v-if="opt.available === false" class="badge">{{ $t('common.comingSoon') }}</span>
          </span>
        </label>
      </div>
      <Transition name="online">
        <label v-if="party === 'duel'" class="online-option" :class="{ checked: online }">
          <input v-model="online" type="checkbox" />
          <span class="online-box" aria-hidden="true" />
          <span class="choice-body">
            <span class="online-title">{{ $t('online.checkbox') }}</span>
            <span class="choice-text">{{ $t('online.hint') }}</span>
          </span>
        </label>
      </Transition>
    </section>
  </Transition>
</template>

<style scoped>
.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
.step-index {
  font-size: var(--fs-sm);
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--c-brand-blue);
}
h2 {
  margin-top: 4px;
  font-size: var(--fs-2xl);
  font-weight: 600;
  color: var(--c-brand-ink);
  text-align: center;
}
.choices {
  display: grid;
  gap: 16px;
  width: min(100%, 560px);
  margin-top: 24px;
}
.choice {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 20px 22px;
  background: var(--c-white);
  border: 1px solid var(--c-line);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 160ms var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .choice:not(.disabled):not(.selected):hover {
    border-color: var(--c-brand-blue);
  }
}
.choice:not(.disabled):active {
  transform: scale(0.98);
}
.choice.selected {
  border-color: var(--c-brand);
  box-shadow: inset 0 0 0 1px var(--c-brand), 0 8px 24px -12px color-mix(in srgb, var(--c-brand) 45%, transparent);
}
.choice.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.choice input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.choice:has(input:focus-visible) {
  outline: 2px solid var(--c-brand-blue);
  outline-offset: 3px;
}
.choice-mark {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border: 1.5px solid color-mix(in srgb, var(--c-steel) 55%, var(--c-white));
  border-radius: 50%;
  display: grid;
  place-items: center;
  transition: border-color 150ms ease;
}
.choice-mark::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-brand);
  transform: scale(0.5);
  opacity: 0;
  transition: transform 180ms var(--ease-out), opacity 180ms var(--ease-out);
}
.choice.selected .choice-mark {
  border-color: var(--c-brand);
}
.choice.selected .choice-mark::after {
  transform: scale(1);
  opacity: 1;
}
.choice-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.choice-title {
  font-size: var(--fs-lg);
  font-weight: 600;
  line-height: 1.3;
  color: var(--c-brand-ink);
}
.choice-text {
  font-size: var(--fs-sm);
  font-weight: 500;
  line-height: 1.5;
  color: var(--c-ink-soft);
}
.badge {
  align-self: flex-start;
  padding: 2px 8px;
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--c-ink-soft);
  background: var(--c-paper);
  border-radius: 999px;
}

/* Jouer en ligne (deux joueurs seulement) : sous les modes de jeu. */
.online-option {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: min(100%, 560px);
  margin-top: 16px;
  padding: 14px 22px;
  border: 1px dashed color-mix(in srgb, var(--c-steel) 55%, var(--c-white));
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.online-option.checked {
  border-style: solid;
  border-color: var(--c-brand-blue);
  background: color-mix(in srgb, var(--c-brand-blue) 8%, var(--c-white));
}
@media (hover: hover) and (pointer: fine) {
  .online-option:not(.checked):hover {
    border-color: var(--c-brand-blue);
  }
}
.online-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.online-option:has(input:focus-visible) {
  outline: 2px solid var(--c-brand-blue);
  outline-offset: 3px;
}
.online-box {
  flex: none;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border: 1.5px solid color-mix(in srgb, var(--c-steel) 55%, var(--c-white));
  border-radius: 4px;
  background: var(--c-white);
  transition: border-color 150ms ease, background-color 150ms ease;
}
.online-box::after {
  content: '';
  width: 9px;
  height: 5px;
  margin-top: -2px;
  border-left: 2px solid var(--c-white);
  border-bottom: 2px solid var(--c-white);
  transform: rotate(-45deg) scale(0.5);
  opacity: 0;
  transition: transform 180ms var(--ease-out), opacity 180ms var(--ease-out);
}
.online-option.checked .online-box {
  border-color: var(--c-brand-blue);
  background: var(--c-brand-blue);
}
.online-option.checked .online-box::after {
  transform: rotate(-45deg) scale(1);
  opacity: 1;
}
.online-title {
  font-size: var(--fs-md);
  font-weight: 600;
  line-height: 1.3;
  color: var(--c-brand-ink);
}
.online-enter-active {
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
}
.online-leave-active {
  transition: opacity 120ms ease;
}
.online-enter-from,
.online-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.step-enter-active {
  transition: opacity 220ms var(--ease-out), transform 220ms var(--ease-out);
}
.step-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}
.step-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.step-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .step-enter-from,
  .step-leave-to,
  .online-enter-from,
  .online-leave-to {
    transform: none;
  }
}
</style>
