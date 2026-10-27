<script setup>
// Modale "combat naval" : une bataille de surface (cf. HexMap.vue::
// openNavalBattle, lib/useCoralSea.js, en-tête "Combat naval"). Tous les
// navires des deux camps sont visibles, chaque camp comptant comme une
// seule flotte. Trois temps :
//   1. PORTÉE (de jour seulement, s'il y a le choix) : la plus longue
//      présente par défaut ; le camp qui a l'initiative, puis l'autre,
//      peut proposer une portée plus courte, que l'autre accepte ou
//      refuse. Le moteur propose et répond tout seul (`proposeRange`,
//      `acceptsRange`) ;
//   2. ATTAQUES : l'initiative choisit les siennes, puis l'autre camp, qui
//      les voit. Le joueur clique 1 ou 2 de ses navires qui tirent, puis
//      leur cible ; le moteur prend son meilleur plan (`plan`) ;
//   3. RÉSOLUTION : dés tirés par `resolve`, résultat de chaque attaque, et
//      les navires dans leur nouvel état. "Terminer" rend le tout
//      (évènement `done`) : HexMap.vue pose les dommages et l'inscrit au
//      journal.
// La modale ne se ferme pas avant la fin de la bataille.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  title: { type: String, required: true },
  // Bataille (cf. useCoralSea.js::navalBattle) : `{ night, ships: { camp:
  // navires }, ranges }`.
  battle: { type: Object, required: true },
  // Camp qui a l'initiative, et camp que joue le moteur (ou `null`).
  initiative: { type: String, required: true },
  engineSide: { type: String, default: null },
  // Nom de chaque camp, et de ses task forces dans la bataille.
  sideLabels: { type: Object, required: true },
  fleetNames: { type: Object, required: true },
  // Dommages possibles : état -> `{ reduced, marker }` (cf.
  // useCoralSea.js::SHIP_DAMAGE).
  damages: { type: Object, default: null },
  // (camp, portée) -> navires qui tirent ; (camp, portée) -> plan du
  // moteur ; () -> portée qu'il propose ou `null` ; (portée) -> l'accepte-
  // t-il ? ; (attaques) -> résultats, dés compris.
  firing: { type: Function, required: true },
  plan: { type: Function, required: true },
  proposeRange: { type: Function, required: true },
  acceptsRange: { type: Function, required: true },
  resolve: { type: Function, required: true },
})

const emit = defineEmits(['done'])
const { t } = useI18n()

const sides = computed(() => {
  const other = Object.keys(props.battle.ships).find((side) => side !== props.initiative)
  return [props.initiative, other]
})
const enemyOf = (side) => sides.value.find((other) => other !== side)
const isEngine = (side) => side === props.engineSide
const label = (side) => props.sideLabels[side] ?? side

const ships = computed(() => [...props.battle.ships[sides.value[0]], ...props.battle.ships[sides.value[1]]])
const shipByKey = computed(() => new Map(ships.value.map((ship) => [ship.key, ship])))
const shipName = (key) => {
  const ship = shipByKey.value.get(key)
  return ship ? `${ship.type} ${ship.name}` : key
}

// --- 1. Portée ---------------------------------------------------------------
const step = ref('range')
// Portée du combat : `null` de nuit (tous tirent).
const range = ref(props.battle.night ? null : props.battle.ranges[0] ?? null)
// Ce qui s'est dit sur la portée, dans l'ordre.
const rangeLog = ref([])
// Rang dans `sides` du camp qui peut proposer (2 : plus personne).
const rangeTurn = ref(0)
// Proposition du moteur en attente de la réponse du joueur : `{ side, range }`.
const pendingProposal = ref(null)
const shorterRanges = computed(() => props.battle.ranges.slice(1))
const rangeProposer = computed(() => sides.value[rangeTurn.value] ?? null)

function nextRangeTurn() {
  rangeTurn.value += 1
  enterRangeTurn()
}
function enterRangeTurn() {
  const side = rangeProposer.value
  if (!side) { startAttacks(); return }
  if (!isEngine(side)) return
  const proposal = props.proposeRange()
  if (proposal) pendingProposal.value = { side, range: proposal }
  else {
    rangeLog.value.push(t('naval.rangeNoProposal', { side: label(side), range: range.value }))
    nextRangeTurn()
  }
}
/** Le joueur propose la portée `proposed` : le moteur répond aussitôt. */
function propose(proposed) {
  const side = rangeProposer.value
  const responder = enemyOf(side)
  rangeLog.value.push(t('naval.rangeProposal', { side: label(side), range: proposed }))
  const accepted = isEngine(responder) ? props.acceptsRange(proposed) : true
  rangeLog.value.push(t(accepted ? 'naval.rangeAccepted' : 'naval.rangeRefused', { side: label(responder), range: proposed }))
  if (accepted) { range.value = proposed; startAttacks() } else nextRangeTurn()
}
function keepRange() {
  rangeLog.value.push(t('naval.rangeNoProposal', { side: label(rangeProposer.value), range: range.value }))
  nextRangeTurn()
}
/** Réponse du joueur à la proposition du moteur. */
function answerProposal(accepted) {
  const { side, range: proposed } = pendingProposal.value
  pendingProposal.value = null
  rangeLog.value.push(t('naval.rangeProposal', { side: label(side), range: proposed }))
  rangeLog.value.push(t(accepted ? 'naval.rangeAccepted' : 'naval.rangeRefused', { side: label(enemyOf(side)), range: proposed }))
  if (accepted) { range.value = proposed; startAttacks() } else nextRangeTurn()
}

// --- 2. Attaques -----------------------------------------------------------
// Attaques de chaque camp, dans leur ordre : `{ side, shooters: [clés], target }`.
const attacks = ref([])
// Rang dans `sides` du camp qui choisit (2 : tout est choisi).
const attackTurn = ref(0)
const chooser = computed(() => (step.value === 'attacks' ? sides.value[attackTurn.value] ?? null : null))
// Navires du joueur choisis pour la prochaine attaque (1 ou 2).
const selection = ref([])

const firingKeys = computed(() => new Set(sides.value.flatMap((side) => props.firing(side, range.value).map((ship) => ship.key))))
const usedKeys = computed(() => new Set(attacks.value.flatMap((attack) => attack.shooters)))
const attacksOf = (side) => attacks.value.filter((attack) => attack.side === side)
const unusedOf = (side) => props.firing(side, range.value).filter((ship) => !usedKeys.value.has(ship.key))
/** Numéro de l'attaque `attack` dans son camp (1, 2...). */
const attackNumber = (attack) => attacksOf(attack.side).indexOf(attack) + 1
const attackPower = (attack) => attack.shooters.reduce((sum, key) => sum + (shipByKey.value.get(key)?.firepower ?? 0), 0)

function startAttacks() {
  step.value = 'attacks'
  attackTurn.value = 0
  playEngineAttacks()
}
/** Le moteur choisit ses attaques quand vient son tour. */
function playEngineAttacks() {
  while (chooser.value && isEngine(chooser.value)) {
    attacks.value.push(...(props.plan(chooser.value, range.value)?.attacks ?? []))
    attackTurn.value += 1
  }
}
function validateAttacks() {
  selection.value = []
  attackTurn.value += 1
  playEngineAttacks()
}
/** Clic sur un navire : un des siens qui tire (choisi/retiré), ou une cible
 *  ennemie pour les navires choisis. */
function onShip(ship) {
  const side = chooser.value
  if (!side || isEngine(side)) return
  if (ship.side === side) {
    if (!firingKeys.value.has(ship.key) || usedKeys.value.has(ship.key)) return
    const at = selection.value.indexOf(ship.key)
    if (at >= 0) selection.value.splice(at, 1)
    else if (selection.value.length < 2) selection.value.push(ship.key)
    else selection.value = [selection.value[1], ship.key]
  } else if (selection.value.length) {
    attacks.value.push({ side, shooters: selection.value.slice(), target: ship.key })
    selection.value = []
  }
}
function removeAttack(attack) {
  attacks.value = attacks.value.filter((other) => other !== attack)
}
const shipClickable = (ship) => {
  const side = chooser.value
  if (!side || isEngine(side)) return false
  return ship.side === side ? firingKeys.value.has(ship.key) && !usedKeys.value.has(ship.key) : selection.value.length > 0
}

// --- 3. Résolution -----------------------------------------------------------
const results = ref(null)
function resolveCombat() {
  results.value = props.resolve(attacks.value)
  step.value = 'results'
}
// État de chaque navire : après la résolution, le dernier résultat qui le
// vise ; avant, le sien.
const stateOf = (ship) => {
  const hits = (results.value ?? []).filter((result) => result.target === ship.key)
  return hits.length ? hits[hits.length - 1].after : ship.damage
}
const srcOf = (ship) => (props.damages?.[stateOf(ship)]?.reduced && ship.reducedSrc) || ship.intactSrc || ship.src
const markerOf = (ship) => props.damages?.[stateOf(ship)]?.marker ?? null
/** Attaques qui visent `ship` : "IJN 1", "USN 2"... */
const incoming = (ship) => attacks.value.filter((attack) => attack.target === ship.key)
  .map((attack) => `${attack.side.toUpperCase()} ${attackNumber(attack)}`)

function finish() {
  emit('done', { range: range.value, attacks: attacks.value, results: results.value ?? [], rangeLog: rangeLog.value })
}

const dialog = ref(null)
onMounted(() => {
  dialog.value?.focus()
  if (props.battle.night || props.battle.ranges.length < 2) startAttacks()
  else enterRangeTurn()
})
</script>

<template>
  <div class="nc-overlay">
    <div ref="dialog" class="nc-modal" role="dialog" aria-modal="true" aria-labelledby="nc-title" tabindex="-1">
      <header class="nc-head">
        <h3 id="nc-title">{{ title }}</h3>
        <p class="nc-when">
          {{ battle.night ? $t('naval.nightRule') : range ? $t('naval.dayRule', { range }) : $t('naval.noRange') }}
        </p>
      </header>

      <div class="nc-sides">
        <section v-for="side in sides" :key="side" class="nc-side" :class="side">
          <h4>
            {{ label(side) }} — {{ fleetNames[side] }}
            <span v-if="side === initiative" class="nc-initiative">{{ $t('naval.initiative') }}</span>
          </h4>
          <div class="nc-ships">
            <button v-for="ship in battle.ships[side]" :key="ship.key" type="button" class="nc-ship"
              :class="{ firing: step !== 'range' && firingKeys.has(ship.key), silent: step !== 'range' && !firingKeys.has(ship.key),
                selected: selection.includes(ship.key), used: usedKeys.has(ship.key) && chooser === side, clickable: shipClickable(ship),
                sunk: stateOf(ship) === 'sunk' }"
              :disabled="!shipClickable(ship)" :title="`${ship.type} ${ship.name}`" @click="onShip(ship)">
              <span class="nc-ship-img">
                <img :src="srcOf(ship)" :alt="`${ship.type} ${ship.name}`" />
                <img v-if="markerOf(ship)" class="nc-marker" :src="markerOf(ship).src" :alt="markerOf(ship).name" />
              </span>
              <span class="nc-ship-name">{{ ship.type }} {{ ship.name }}</span>
              <span class="nc-ship-meta">
                {{ $t('naval.firepower', { n: ship.firepower }) }} · {{ $t(`naval.state.${stateOf(ship)}`) }}
              </span>
              <span v-if="incoming(ship).length" class="nc-incoming">← {{ incoming(ship).join(', ') }}</span>
            </button>
          </div>
        </section>
      </div>

      <section v-if="step === 'range'" class="nc-step">
        <h4>{{ $t('naval.rangeTitle') }}</h4>
        <p v-for="(line, index) in rangeLog" :key="index" class="nc-line">{{ line }}</p>
        <template v-if="pendingProposal">
          <p class="nc-line nc-ask">{{ $t('naval.rangeProposal', { side: label(pendingProposal.side), range: pendingProposal.range }) }}</p>
          <div class="nc-actions">
            <button type="button" class="nc-btn primary" @click="answerProposal(true)">{{ $t('naval.accept') }}</button>
            <button type="button" class="nc-btn" @click="answerProposal(false)">{{ $t('naval.refuse') }}</button>
          </div>
        </template>
        <template v-else-if="rangeProposer && !isEngine(rangeProposer)">
          <p class="nc-line nc-ask">{{ $t('naval.rangeYourTurn', { side: label(rangeProposer), range }) }}</p>
          <div class="nc-actions">
            <button v-for="option in shorterRanges" :key="option" type="button" class="nc-btn" @click="propose(option)">
              {{ $t('naval.rangePropose', { range: option }) }}
            </button>
            <button type="button" class="nc-btn primary" @click="keepRange">{{ $t('naval.rangeKeep', { range }) }}</button>
          </div>
        </template>
      </section>

      <section v-else class="nc-step">
        <p v-for="(line, index) in rangeLog" :key="index" class="nc-line nc-muted">{{ line }}</p>
        <div class="nc-attack-lists">
          <div v-for="side in sides" :key="side" class="nc-attack-list">
            <h4>{{ $t('naval.attacksOf', { side: label(side) }) }}</h4>
            <p v-if="!firing(side, range).length" class="nc-line nc-muted">{{ $t('naval.cannotFire') }}</p>
            <p v-else-if="!attacksOf(side).length" class="nc-line nc-muted">
              {{ chooser === side ? $t('naval.noAttackYet') : sides.indexOf(side) > attackTurn ? $t('naval.waiting') : $t('naval.noAttack') }}
            </p>
            <ol v-else class="nc-attacks">
              <li v-for="attack in attacksOf(side)" :key="attack.shooters.join('+')">
                {{ attack.shooters.map(shipName).join(' + ') }}
                <span class="nc-muted">({{ $t('naval.firepower', { n: attackPower(attack) }) }})</span>
                → {{ shipName(attack.target) }}
                <button v-if="chooser === side && !isEngine(side)" type="button" class="nc-remove"
                  :aria-label="$t('naval.removeAttack')" :title="$t('naval.removeAttack')" @click="removeAttack(attack)">×</button>
              </li>
            </ol>
          </div>
        </div>

        <template v-if="step === 'attacks'">
          <template v-if="chooser && !isEngine(chooser)">
            <p class="nc-line nc-ask">{{ $t('naval.yourTurn', { side: label(chooser) }) }}</p>
            <p v-if="unusedOf(chooser).length && attacksOf(chooser).length" class="nc-line nc-muted">
              {{ $t('naval.unused', { n: unusedOf(chooser).length }, unusedOf(chooser).length) }}
            </p>
            <div class="nc-actions">
              <button type="button" class="nc-btn primary" @click="validateAttacks">{{ $t('naval.validate') }}</button>
            </div>
          </template>
          <div v-else class="nc-actions">
            <button type="button" class="nc-btn primary" @click="resolveCombat">{{ $t('naval.resolve') }}</button>
          </div>
        </template>

        <template v-else>
          <h4>{{ $t('naval.results') }}</h4>
          <p v-if="!results.length" class="nc-line nc-muted">{{ $t('naval.noShot') }}</p>
          <ul class="nc-results">
            <li v-for="(result, index) in results" :key="index" :class="result.side">
              <strong>{{ result.side.toUpperCase() }} {{ attackNumber(attacks[index]) }}</strong> —
              {{ $t('naval.resultLine', {
                shooters: result.shooters.map(shipName).join(' + '), firepower: result.firepower, target: shipName(result.target),
                die: result.die, bonus: result.bonus ? ` + ${result.bonus}` : '', damage: result.damage,
                outcome: $t(`naval.state.${result.after}`) }) }}
            </li>
          </ul>
          <div class="nc-actions">
            <button type="button" class="nc-btn primary" @click="finish">{{ $t('naval.finish') }}</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.nc-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  background: color-mix(in srgb, var(--c-ink) 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.nc-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(1180px, 100%);
  max-height: 100%;
  overflow: auto;
  background: var(--c-panel);
  color: var(--c-panel-text);
  border-radius: var(--radius-12);
  border-top: 4px solid var(--c-red);
  box-shadow: var(--shadow-modal);
  padding: 12px 16px 16px;
  outline: none;
  animation: nc-in 200ms var(--ease-out);
}

.nc-head h3 {
  margin: 0;
  font-size: var(--fs-md);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-gold);
}
.nc-when {
  margin: 4px 0 0;
  font-size: var(--fs-sm);
  color: var(--c-steel);
}

.nc-sides {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
}
.nc-side {
  border-radius: var(--radius-8);
  padding: 8px 10px 10px;
  background: color-mix(in srgb, var(--c-white) 5%, transparent);
  border-left: 4px solid var(--c-steel);
}
.nc-side.ijn {
  border-left-color: var(--c-ijn);
}
.nc-side.usn {
  border-left-color: var(--c-usn);
}
.nc-side h4,
.nc-step h4 {
  margin: 0 0 8px;
  font-size: var(--fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.nc-initiative {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: var(--radius-4);
  background: color-mix(in srgb, var(--c-gold) 25%, transparent);
  color: var(--c-gold);
  font-size: var(--fs-xs);
  text-transform: none;
  letter-spacing: 0;
}

.nc-ships {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 8px;
}
.nc-ship {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  padding: 4px;
  border: 2px solid transparent;
  border-radius: var(--radius-6);
  background: color-mix(in srgb, var(--c-ink) 25%, transparent);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: default;
  transition: border-color 150ms ease, opacity 150ms ease, transform 120ms ease-out;
}
.nc-ship:disabled {
  opacity: 1;
}
.nc-ship.silent {
  opacity: 0.55;
}
.nc-ship.firing {
  border-color: color-mix(in srgb, var(--c-gold) 45%, transparent);
}
.nc-ship.used {
  opacity: 0.45;
}
.nc-ship.clickable {
  cursor: pointer;
}
@media (hover: hover) and (pointer: fine) {
  .nc-ship.clickable:hover {
    border-color: var(--c-gold);
  }
}
.nc-ship.clickable:active {
  transform: scale(0.97);
}
.nc-ship.selected {
  border-color: var(--c-green);
}
.nc-ship.sunk .nc-ship-img {
  filter: grayscale(1);
  opacity: 0.5;
}
.nc-ship-img {
  position: relative;
  display: block;
  aspect-ratio: 190 / 115;
}
.nc-ship-img img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
}
.nc-ship-img .nc-marker {
  inset: 18% 30%;
  width: 40%;
  height: 64%;
}
.nc-ship-name {
  font-size: var(--fs-xs);
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nc-ship-meta,
.nc-incoming {
  font-size: var(--fs-xs);
  color: var(--c-steel);
}
.nc-incoming {
  color: var(--c-gold);
}

.nc-step {
  border-top: 1px solid color-mix(in srgb, var(--c-white) 12%, transparent);
  padding-top: 10px;
}
.nc-line {
  margin: 0 0 6px;
  font-size: var(--fs-sm);
}
.nc-ask {
  color: var(--c-gold);
}
.nc-muted {
  color: var(--c-steel);
}
.nc-attack-lists {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 8px;
}
.nc-attacks {
  margin: 0;
  padding-left: 20px;
  font-size: var(--fs-sm);
}
.nc-attacks li {
  margin-bottom: 4px;
}
.nc-remove {
  margin-left: 6px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-4);
  background: color-mix(in srgb, var(--c-white) 10%, transparent);
  color: inherit;
  line-height: 1;
  cursor: pointer;
}
.nc-results {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
  font-size: var(--fs-sm);
}
.nc-results li {
  padding: 4px 8px;
  margin-bottom: 4px;
  border-left: 3px solid var(--c-steel);
  background: color-mix(in srgb, var(--c-white) 4%, transparent);
}
.nc-results li.ijn {
  border-left-color: var(--c-ijn);
}
.nc-results li.usn {
  border-left-color: var(--c-usn);
}

.nc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.nc-btn {
  padding: 6px 14px;
  border: 1px solid color-mix(in srgb, var(--c-white) 25%, transparent);
  border-radius: var(--radius-6);
  background: color-mix(in srgb, var(--c-white) 8%, transparent);
  color: inherit;
  font: inherit;
  font-size: var(--fs-sm);
  cursor: pointer;
  transition: background-color 150ms ease, transform 120ms ease-out;
}
.nc-btn.primary {
  border-color: var(--c-gold);
  background: color-mix(in srgb, var(--c-gold) 22%, transparent);
}
@media (hover: hover) and (pointer: fine) {
  .nc-btn:hover {
    background: color-mix(in srgb, var(--c-white) 16%, transparent);
  }
  .nc-btn.primary:hover {
    background: color-mix(in srgb, var(--c-gold) 34%, transparent);
  }
}
.nc-btn:active {
  transform: scale(0.97);
}

@keyframes nc-in {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
}
@media (prefers-reduced-motion: reduce) {
  .nc-modal {
    animation-name: nc-fade;
  }
}
@keyframes nc-fade {
  from {
    opacity: 0;
  }
}
</style>
