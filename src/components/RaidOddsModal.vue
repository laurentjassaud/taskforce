<script setup>
// Fenêtre de debug "Probabilités" d'un raid japonais, ouverte depuis la
// modale du raid (cf. TaskForceComposer.vue, HexMap.vue::openRaidOdds) :
// les meilleurs plans d'attaque des avions du raid, en points de victoire
// espérés — comme la section "Meilleurs plans d'attaque" de l'artefact
// « Frappe aéronavale · Task Force ».
// Cibles possibles : toutes les task forces alliées (`candidates`, cf.
// lib/useCoralSea.js::raidCandidates), à cocher — d'office celles que l'IA
// peut viser (connues ou repérées, à portée). Une task force CONNUE se
// calcule sur ses navires réels ; une REPÉRÉE sur ce que l'IA croit y
// trouver (estimation), ou sur ses navires réels pour comparer ; une
// INCONNUE, que l'IA ne peut pas viser, sur ses navires réels.
// "Une seule task force par frappe" (la règle des raids) : toute la frappe
// sur une task force ; sinon, les avions se répartissent entre toutes.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  title: { type: String, required: true },
  // Avions du raid (cf. useCoralSea.js::raidPlan) : `[{ tf, key, name, code, mission, attack }]`.
  planes: { type: Array, required: true },
  // Task forces possibles (cf. useCoralSea.js::raidCandidates).
  candidates: { type: Array, required: true },
  // `plan(puissances, task forces, options)` (cf. useCoralSea.js::planRaidOptions).
  plan: { type: Function, required: true },
  // Ce que l'IA a joué : task force visée, et ses points espérés.
  chosenId: { type: String, default: null },
  chosenPoints: { type: Number, default: null },
})
const emit = defineEmits(['close'])
const { t, locale } = useI18n()

const KEEP = 30
const SHOWN = 10

// Task forces cochées, et celles repérées calculées sur leurs navires réels.
const included = ref(new Set(props.candidates.filter((tf) => tf.status !== 'unknown' && tf.inRange).map((tf) => tf.id)))
const actualFor = ref(new Set())
const oneFleet = ref(true)
const showAll = ref(false)

// Par NOM ('included', 'actualFor') : le template déballe les refs, il ne
// pourrait pas en passer une.
const toggleSets = { included, actualFor }
function toggle(name, id) {
  const set = toggleSets[name]
  const next = new Set(set.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  set.value = next
  showAll.value = false
}

/** Navires d'une task force pour le calcul, et s'ils sont estimés. */
function shipsOf(tf) {
  const estimated = tf.status === 'sighted' && !actualFor.value.has(tf.id) && !!tf.estimate
  return { ships: (estimated ? tf.estimate : tf.actual) ?? [], estimated }
}

const fleets = computed(() => props.candidates.filter((tf) => included.value.has(tf.id)).map((tf) => ({ tf, ...shipsOf(tf) })))
const powers = computed(() => props.planes.map((plane) => plane.attack ?? 0))
const attackers = computed(() => powers.value.filter((power) => power > 0).length)
const result = computed(() => (fleets.value.length && attackers.value
  ? props.plan(powers.value, fleets.value.map(({ ships }) => ({ ships })), { oneFleet: oneFleet.value, keep: KEEP })
  : null))
const plans = computed(() => result.value?.plans ?? [])
const shownPlans = computed(() => (showAll.value ? plans.value : plans.value.slice(0, SHOWN)))

const number = (value, digits = 2) => value.toLocaleString(locale.value, { minimumFractionDigits: digits, maximumFractionDigits: digits })
const percent = (value) => number(value * 100)
const planeLabel = (index) => [props.planes[index]?.name, props.planes[index]?.code].filter(Boolean).join(' ')
const escorts = computed(() => props.planes.filter((plane) => !(plane.attack > 0)))

/** Navire visé par une attaque : son nom réel, ou son rôle s'il est estimé. */
function shipLabel(attack) {
  const { tf, ships, estimated } = fleets.value[attack.fleet]
  const ship = ships[attack.target]
  const rank = ships.slice(0, attack.target).filter((other) => other.role === ship.role).length
  const name = ship.name ? [...new Set([ship.type, ship.name])].join(' ') : t(`log.raidTargets.${ship.role}`, { n: rank + 1 })
  return { tf: tf.name, name, estimated, damage: ship.damage && ship.damage !== 'none' ? t(`damage.${ship.damage}`) : null }
}
/** Le plan `plan` est-il celui que l'IA a joué (même cible, mêmes points) ? */
const isChosen = (plan) => props.chosenId != null && props.chosenPoints != null
  && plan.attacks.every((attack) => fleets.value[attack.fleet].tf.id === props.chosenId)
  && Math.abs(plan.expectedPoints - props.chosenPoints) < 1e-6

const statusLabel = (tf) => (tf.status === 'sighted' ? t('raidOdds.sighted', { sighting: t(`sighting.${tf.sighting}`) }) : t(`raidOdds.${tf.status}`))

function onKey(event) {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="ro-overlay" @click.self="emit('close')">
    <div class="ro-modal" role="dialog" aria-modal="true" aria-labelledby="ro-title">
      <header class="ro-head">
        <h3 id="ro-title">{{ title }}</h3>
        <button type="button" class="ro-close" :aria-label="$t('common.close')" @click="emit('close')">×</button>
      </header>

      <div class="ro-body">
        <section class="ro-section">
          <h4>{{ $t('raidOdds.planes') }}</h4>
          <p class="ro-planes">
            <span v-for="(plane, index) in planes" :key="plane.key" class="ro-chip" :class="{ escort: !(plane.attack > 0) }">
              {{ planeLabel(index) }}<b v-if="plane.attack > 0"> {{ plane.attack }}</b>
            </span>
          </p>
          <p v-if="escorts.length" class="ro-note">{{ $t('raidOdds.escortNote') }}</p>
        </section>

        <section class="ro-section">
          <h4>{{ $t('raidOdds.targets') }}</h4>
          <ul class="ro-tfs">
            <li v-for="tf in candidates" :key="tf.id" class="ro-tf">
              <label>
                <input type="checkbox" :checked="included.has(tf.id)" @change="toggle('included', tf.id)" />
                <b>{{ tf.name }}</b>
                <span class="ro-badge" :class="tf.status">{{ statusLabel(tf) }}</span>
                <span class="ro-note">
                  {{ tf.distance == null ? '' : $t(tf.inRange ? 'raidOdds.inRange' : 'raidOdds.outOfRange', { n: tf.distance }) }}
                  · {{ $t('raidOdds.ships', { n: shipsOf(tf).ships.length }, shipsOf(tf).ships.length) }}
                </span>
              </label>
              <button v-if="tf.status === 'sighted' && tf.actual" type="button" class="ro-link" @click="toggle('actualFor', tf.id)">
                {{ $t(actualFor.has(tf.id) ? 'raidOdds.useEstimate' : 'raidOdds.useActual') }}
              </button>
            </li>
          </ul>
          <label class="ro-option">
            <input v-model="oneFleet" type="checkbox" @change="showAll = false" />
            {{ $t('raidOdds.oneFleet') }}
          </label>
        </section>

        <section class="ro-section">
          <h4>{{ $t('raidOdds.plans') }}</h4>
          <p v-if="!fleets.length" class="ro-note">{{ $t('raidOdds.noTarget') }}</p>
          <p v-else-if="!attackers" class="ro-note">{{ $t('raidOdds.noAttacker') }}</p>
          <template v-else-if="result">
            <p class="ro-note">
              {{ $t('raidOdds.summary', { planes: attackers, fleets: fleets.length, plans: plans.length }) }}
              {{ $t(result.method === 'exact' ? 'raidOdds.exact' : 'raidOdds.approximate') }}
              {{ $t('raidOdds.duration', { ms: Math.max(1, result.duration) }) }}
              <template v-if="chosenPoints != null"> {{ $t('raidOdds.chosen', { points: number(chosenPoints) }) }}</template>
            </p>
            <div class="ro-scroll">
              <table class="ro-plans">
                <thead>
                  <tr><th>#</th><th class="ro-left">{{ $t('raidOdds.attacks') }}</th><th>{{ $t('raidOdds.points') }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(plan, index) in shownPlans" :key="index" :class="{ best: index === 0, chosen: isChosen(plan) }">
                    <td>{{ index + 1 }}<span v-if="isChosen(plan)" class="ro-ai">{{ $t('raidOdds.ai') }}</span></td>
                    <td class="ro-left">
                      <div v-for="(attack, rank) in plan.attacks" :key="rank" class="ro-line">
                        <b><span class="ro-tfname">{{ shipLabel(attack).tf }} ·</span> {{ shipLabel(attack).name }}</b>
                        <em v-if="shipLabel(attack).estimated" class="ro-est"> {{ $t('raidOdds.estimated') }}</em>
                        <em v-if="shipLabel(attack).damage" class="ro-est"> ({{ shipLabel(attack).damage }})</em>
                        ←
                        <span v-for="(group, g) in attack.groups" :key="g" class="ro-group">{{ group.map(planeLabel).join(' + ') }}</span>
                        <span class="ro-odds">
                          {{ $t('raidOdds.odds', { sunk: percent(attack.outcomes[4]), critical: percent(attack.outcomes[3]),
                            significant: percent(attack.outcomes[2]), points: number(attack.expectedPoints) }) }}
                        </span>
                      </div>
                    </td>
                    <td class="ro-total">{{ number(plan.expectedPoints) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button v-if="!showAll && plans.length > SHOWN" type="button" class="ro-link" @click="showAll = true">{{ $t('raidOdds.more') }}</button>
          </template>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ro-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-overlay) + 10);
  background: color-mix(in srgb, var(--c-ink) 40%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.ro-modal {
  display: flex;
  flex-direction: column;
  width: min(980px, 100%);
  max-height: 100%;
  background: var(--c-paper);
  color: var(--c-panel-text);
  border-radius: var(--radius-12);
  border-top: 4px solid var(--c-ijn);
  box-shadow: var(--shadow-modal);
  padding: 12px 16px 14px;
}
.ro-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.ro-head h3 {
  margin: 0;
  font-size: var(--fs-md);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-ijn);
}
.ro-close {
  flex: none;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-6);
  background: color-mix(in srgb, var(--c-ink) 8%, transparent);
  color: inherit;
  font-size: var(--fs-lg);
  line-height: 1;
  cursor: pointer;
}
.ro-body {
  display: grid;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
}
.ro-section h4 {
  margin: 0 0 6px;
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.ro-note {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--c-steel);
}
.ro-planes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0 0 4px;
}
.ro-chip {
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--c-ink) 20%, transparent);
  border-radius: var(--radius-4);
  font-size: var(--fs-sm);
}
.ro-chip.escort {
  opacity: 0.6;
}
.ro-tfs {
  display: grid;
  gap: 4px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}
.ro-tf {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
}
.ro-tf label,
.ro-option {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  cursor: pointer;
}
.ro-badge {
  padding: 0 6px;
  border-radius: var(--radius-4);
  font-size: var(--fs-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: color-mix(in srgb, var(--c-ink) 10%, transparent);
}
.ro-badge.known {
  background: var(--c-green);
  color: var(--c-white);
}
.ro-badge.sighted {
  background: var(--c-gold);
  color: var(--c-ink);
}
.ro-link {
  border: none;
  background: none;
  padding: 0;
  color: var(--c-steel);
  font-size: var(--fs-xs);
  text-decoration: underline;
  cursor: pointer;
}
.ro-scroll {
  overflow-x: auto;
  margin: 6px 0;
}
.ro-plans {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
}
.ro-plans th,
.ro-plans td {
  border: 1px solid color-mix(in srgb, var(--c-ink) 15%, transparent);
  padding: 6px;
  text-align: right;
  vertical-align: top;
}
.ro-plans thead th {
  background: color-mix(in srgb, var(--c-ink) 6%, transparent);
}
.ro-plans .ro-left {
  text-align: left;
}
.ro-plans tr.best td {
  background: color-mix(in srgb, var(--c-ijn) 12%, transparent);
}
.ro-plans tr.chosen td:first-child {
  box-shadow: inset 3px 0 0 var(--c-ijn);
}
.ro-ai {
  display: block;
  font-size: var(--fs-2xs);
  font-weight: 700;
  color: var(--c-ijn);
}
.ro-line + .ro-line {
  margin-top: 4px;
}
.ro-tfname {
  font-weight: 400;
  color: var(--c-steel);
}
.ro-est {
  color: var(--c-steel);
  font-size: var(--fs-xs);
}
.ro-group {
  display: inline-block;
  margin: 1px 4px 1px 0;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--c-ink) 20%, transparent);
  border-radius: var(--radius-4);
}
.ro-odds {
  display: block;
  font-size: var(--fs-xs);
  color: var(--c-steel);
}
.ro-total {
  font-weight: 700;
  color: var(--c-red);
}
</style>
