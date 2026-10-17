<script setup>
import { ref, computed, watch } from 'vue'
import { PARTY_OPTIONS } from '../lib/gameSettings.js'

// Étapes de la création d'une partie solo (cf. SoloHome.vue) : 1. scénario,
// 2. mode de jeu (Libre ou Assisté). Le parent gère la navigation (`step`),
// fournit les scénarios du module (cf. gameSettings.js::scenarioOptions) et
// reçoit les réglages (format lib/gameSettings.js) via v-model. La météo
// (pas encore appliquée par le moteur) et le chronomètre ne sont plus
// proposés : ils gardent leur valeur par défaut.

const props = defineProps({
  step: { type: Number, required: true },
  scenarios: { type: Array, default: () => [] },
})

const settings = defineModel('settings', { type: Object, required: true })

const scenario = ref(settings.value.scenario)
const party = ref(settings.value.party)

// Un scénario qui n'existe pas (ou n'est pas disponible) dans le module est
// remplacé par son premier scénario disponible.
watch(() => props.scenarios, (list) => {
  if (!list.some((option) => option.id === scenario.value && option.available)) {
    scenario.value = list.find((option) => option.available)?.id ?? scenario.value
  }
}, { immediate: true })

// Un scénario peut rendre la météo obligatoire (`weather: 'required'`).
const weatherRequired = computed(() => props.scenarios.find((option) => option.id === scenario.value)?.weather === 'required')

watch([scenario, party], () => {
  settings.value = {
    ...settings.value,
    scenario: scenario.value,
    weather: weatherRequired.value ? '1' : '0',
    party: party.value,
    timing: 'libre',
    timingValue: '',
  }
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
      <div class="choices two" role="radiogroup" :aria-label="$t('setup.gameMode')">
        <label v-for="opt in PARTY_OPTIONS" :key="opt.id" class="choice" :class="{ selected: party === opt.id }">
          <input v-model="party" type="radio" name="party" :value="opt.id" />
          <span class="choice-mark" aria-hidden="true" />
          <span class="choice-body">
            <span class="choice-title">{{ opt.label }}</span>
            <span class="choice-text">{{ $t(`setup.partyHint.${opt.id}`) }}</span>
          </span>
        </label>
      </div>
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
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--brand-blue);
}
h2 {
  margin-top: 4px;
  font-size: clamp(22px, 2.2vw, 28px);
  font-weight: 600;
  color: var(--brand-ink);
  text-align: center;
}
.choices {
  display: grid;
  gap: 16px;
  width: min(100%, 560px);
  margin-top: 24px;
}
.choices.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: min(100%, 760px);
}
@media (max-width: 640px) {
  .choices.two {
    grid-template-columns: 1fr;
  }
}
.choice {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 20px 22px;
  background: var(--color-white);
  border: 1px solid var(--brand-line);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 160ms var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .choice:not(.disabled):not(.selected):hover {
    border-color: var(--brand-blue);
  }
}
.choice:not(.disabled):active {
  transform: scale(0.98);
}
.choice.selected {
  border-color: var(--brand-orange);
  box-shadow: inset 0 0 0 1px var(--brand-orange), 0 8px 24px -12px rgba(246, 81, 43, 0.45);
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
  outline: 2px solid var(--brand-blue);
  outline-offset: 3px;
}
.choice-mark {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border: 1.5px solid var(--brand-line-strong);
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
  background: var(--brand-orange);
  transform: scale(0.5);
  opacity: 0;
  transition: transform 180ms var(--ease-out), opacity 180ms var(--ease-out);
}
.choice.selected .choice-mark {
  border-color: var(--brand-orange);
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
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--brand-ink);
}
.choice-text {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--light-text-medium);
}
.badge {
  align-self: flex-start;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--light-text-muted);
  background: var(--light-bg-muted);
  border-radius: 999px;
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
  .step-leave-to {
    transform: none;
  }
}
</style>
