<script setup>
// Modale "composition d'une task force alliée" : le joueur pose les pions
// navires de son ordre de bataille sur le support de sa task force —
// "Carrier TF" (porte-avions au centre, escortes autour) ou "Fleet TF"
// (cases numérotées). Ouverte par HexMap.vue::openAlliedFleet (clic sur la
// task force à la mise en place et à la phase Administrative, ou menu du
// pion) ; en dehors de ces moments, elle ne fait que montrer la
// composition (`editable` faux).
// Poser : cliquer un pion de la réserve puis une case, ou le glisser ; un
// pion posé se déplace de même (échange avec l'occupant de la case), et
// revient à la réserve par "Retirer" ou en le glissant sur elle. Rien n'est
// enregistré avant "Valider" (évènement `save`, cf. lib/useCoralSea.js::
// setAlliedFleet).
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  title: { type: String, required: true },
  // Support : 'carrier' ou 'fleet' (cf. useCoralSea.js::alliedFleet).
  kind: { type: String, required: true },
  // Supports : `{ carrier, fleet }` (cf. useCoralSea.js::FLEET_DISPLAYS).
  displays: { type: Object, required: true },
  // Cases du support, dans l'ordre (cf. useCoralSea.js::displayCells).
  cellIds: { type: Array, required: true },
  // Composition actuelle : case -> clé de pion navire.
  cells: { type: Object, required: true },
  // Pions de l'ordre de bataille, par groupe (cf. useCoralSea.js::alliedGroups).
  groups: { type: Array, required: true },
  // Pions posés sur une AUTRE task force : clé -> nom de cette task force.
  elsewhere: { type: Map, default: () => new Map() },
  // `fits(type, case)` : ce navire peut-il aller dans cette case ?
  fits: { type: Function, required: true },
  editable: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'close'])
const { t } = useI18n()

// Part de la hauteur d'une case qu'occupe un pion, et, sur "Fleet TF", sa
// marge gauche (px de l'image) qui laisse lisible le numéro de la case —
// comme FleetDisplayModal.vue.
const SHIP_FILL = 0.88
const FLEET_INSET = 44

const display = computed(() => props.displays[props.kind])
const ships = computed(() => new Map(props.groups.flatMap((group) => group.ships).map((ship) => [ship.key, ship])))

const draft = ref({ ...props.cells })
const selected = ref(null) // clé du pion choisi, ou null
const warning = ref('')

const placedKeys = computed(() => new Set(Object.values(draft.value)))
const cellOf = (key) => Object.keys(draft.value).find((cell) => draft.value[cell] === key) ?? null
const shipIn = (cell) => ships.value.get(draft.value[cell]) ?? null
const selectedShip = computed(() => ships.value.get(selected.value) ?? null)
const selectedCell = computed(() => (selected.value ? cellOf(selected.value) : null))
const reserveOf = (group) => group.ships.filter((ship) => !placedKeys.value.has(ship.key))
const dirty = computed(() => {
  const before = Object.entries(props.cells).sort().join()
  return Object.entries(draft.value).sort().join() !== before
})
const count = computed(() => placedKeys.value.size)

/** Case `cell` (px de l'image) en % du support. */
function cellRect(cell) {
  const { width, height } = display.value
  const box = props.kind === 'carrier'
    ? (cell === 'carrier' ? display.value.carrier : display.value.escorts[Number(cell.slice(6))])
    : display.value.slots[Number(cell.slice(4))]
  return {
    left: `${(box.x / width) * 100}%`, top: `${(box.y / height) * 100}%`,
    width: `${(box.w / width) * 100}%`, height: `${(box.h / height) * 100}%`,
    '--ship-h': `${SHIP_FILL * 100}%`,
    // Marge en % de la largeur du SUPPORT (référence des % de `padding`).
    '--inset': props.kind === 'fleet' ? `${(FLEET_INSET / width) * 100}%` : '0',
  }
}

const label = (ship) => `${ship.type} ${ship.name}`
const isTarget = (cell) => !!selectedShip.value && props.fits(selectedShip.value.type, cell) && draft.value[cell] !== selected.value

/** Pourquoi la case refuse ce navire : réservée au porte-avions, ou
 *  porte-avions hors de la case centrale. */
function wrongCell(cell) {
  warning.value = t(cell === 'carrier' ? 'alliedFleet.centerCell' : 'alliedFleet.carrierCell')
}

/** Pose le pion `key` dans la case `cell` : l'occupant prend sa place s'il
 *  venait d'une case où il va, sinon il revient à la réserve. */
function place(key, cell) {
  const ship = ships.value.get(key)
  if (!ship) return
  if (!props.fits(ship.type, cell)) { wrongCell(cell); return }
  const next = { ...draft.value }
  const from = cellOf(key)
  const occupant = next[cell]
  next[cell] = key
  if (from && from !== cell) {
    if (occupant && props.fits(ships.value.get(occupant)?.type, from)) next[from] = occupant
    else delete next[from]
  }
  draft.value = next
  selected.value = null
  warning.value = ''
}

function onCell(cell) {
  if (!props.editable) return
  if (selected.value) {
    if (draft.value[cell] === selected.value) { selected.value = null; return }
    place(selected.value, cell)
  } else if (draft.value[cell]) {
    selected.value = draft.value[cell]
    warning.value = ''
  }
}

function toggle(key) {
  selected.value = selected.value === key ? null : key
  warning.value = ''
}

/** Le pion `key` (posé) revient à la réserve. */
function unplace(key) {
  const cell = cellOf(key)
  if (!cell) return
  const next = { ...draft.value }
  delete next[cell]
  draft.value = next
  selected.value = null
}

// Glisser-déposer : même chose qu'au clic.
function onDragStart(event, key) {
  if (!props.editable) return
  selected.value = key
  warning.value = ''
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', key)
}
function onDragOver(event, cell) {
  if (selectedShip.value && props.fits(selectedShip.value.type, cell)) event.preventDefault()
}
function onDrop(event, cell) {
  const key = event.dataTransfer.getData('text/plain') || selected.value
  if (key) place(key, cell)
}
function onReserveDrop(event) {
  const key = event.dataTransfer.getData('text/plain') || selected.value
  if (key) unplace(key)
}

function save() {
  emit('save', { ...draft.value })
}

const dialog = ref(null)
function onKey(event) {
  if (event.key !== 'Escape') return
  if (selected.value) selected.value = null
  else emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  dialog.value?.focus()
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="tc-overlay" @click.self="emit('close')">
    <div ref="dialog" class="tc-modal" :class="kind" role="dialog" aria-modal="true" aria-labelledby="tc-title" tabindex="-1">
      <header class="tc-head">
        <h3 id="tc-title">{{ title }}</h3>
        <button type="button" class="tc-close" :aria-label="$t('common.close')" @click="emit('close')">×</button>
      </header>

      <div class="tc-body">
        <div class="tc-board" :style="{ aspectRatio: `${display.width} / ${display.height}` }">
          <img class="tc-support" :src="display.src" alt="" />
          <button v-for="cell in cellIds" :key="cell" type="button" class="tc-cell"
            :class="{ filled: !!draft[cell], target: isTarget(cell), chosen: !!draft[cell] && draft[cell] === selected }"
            :style="cellRect(cell)" :disabled="!editable"
            :aria-label="shipIn(cell) ? label(shipIn(cell)) : $t('alliedFleet.emptyCell')"
            @click="onCell(cell)" @dragover="onDragOver($event, cell)" @drop.prevent="onDrop($event, cell)">
            <img v-if="shipIn(cell)" class="tc-ship" :src="shipIn(cell).src" :alt="label(shipIn(cell))"
              :title="label(shipIn(cell))" :draggable="editable" @dragstart="onDragStart($event, draft[cell])" />
          </button>
        </div>

        <section v-if="editable" class="tc-reserve" :aria-label="$t('alliedFleet.reserve')"
          @dragover.prevent @drop.prevent="onReserveDrop">
          <p class="tc-hint" :class="{ warn: !!warning }" aria-live="polite">{{ warning || $t('alliedFleet.hint') }}</p>
          <div v-for="group in groups" :key="group.id" class="tc-group">
            <h4>{{ group.name }}</h4>
            <div v-if="reserveOf(group).length" class="tc-ships">
              <button v-for="ship in reserveOf(group)" :key="ship.key" type="button" class="tc-pick"
                :class="{ chosen: selected === ship.key, elsewhere: elsewhere.has(ship.key) }"
                :title="elsewhere.has(ship.key) ? $t('alliedFleet.inTaskForce', { ship: label(ship), unit: elsewhere.get(ship.key) }) : label(ship)"
                draggable="true" @click="toggle(ship.key)" @dragstart="onDragStart($event, ship.key)">
                <img :src="ship.src" :alt="label(ship)" draggable="false" />
                <span v-if="elsewhere.has(ship.key)" class="tc-badge">{{ elsewhere.get(ship.key) }}</span>
              </button>
            </div>
            <p v-else class="tc-empty">{{ $t('alliedFleet.groupPlaced') }}</p>
          </div>
        </section>
        <p v-else class="tc-hint">{{ $t('alliedFleet.readOnly') }}</p>
      </div>

      <footer class="tc-foot">
        <span class="tc-count">{{ $t('alliedFleet.count', { n: count }, count) }}</span>
        <template v-if="editable">
          <button v-if="selectedCell" type="button" class="tc-cancel" @click="unplace(selected)">{{ $t('alliedFleet.remove') }}</button>
          <button type="button" class="tc-cancel" @click="emit('close')">{{ $t('common.cancel') }}</button>
          <button type="button" class="tc-ok" :disabled="!dirty" @click="save">{{ $t('alliedFleet.save') }}</button>
        </template>
        <button v-else type="button" class="tc-ok" @click="emit('close')">{{ $t('common.close') }}</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.tc-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  background: color-mix(in srgb, var(--c-ink) 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.tc-modal {
  display: flex;
  flex-direction: column;
  width: min(1180px, 100%);
  max-height: 100%;
  background: var(--c-panel);
  color: var(--c-panel-text);
  border-radius: var(--radius-12);
  border-top: 4px solid var(--c-usn);
  box-shadow: var(--shadow-modal);
  padding: 12px 16px 14px;
  outline: none;
  animation: tc-in 200ms var(--ease-out);
}

.tc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.tc-head h3 {
  margin: 0;
  font-size: var(--fs-md);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-usn);
}
.tc-close {
  flex: none;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-6);
  background: color-mix(in srgb, var(--c-white) 10%, transparent);
  color: inherit;
  font-size: var(--fs-lg);
  line-height: 1;
  cursor: pointer;
  transition: background-color 150ms ease, transform 120ms ease-out;
}
.tc-close:active {
  transform: scale(0.94);
}

/* Support porte-avions à gauche, réserve à droite ; "Fleet TF", très large,
   au-dessus de la réserve. */
.tc-body {
  display: grid;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
}
.tc-modal.carrier .tc-body {
  grid-template-columns: minmax(0, min(500px, calc((100vh - 160px) * 667 / 699))) minmax(0, 1fr);
  align-items: start;
}
@media (max-width: 760px) {
  .tc-modal.carrier .tc-body {
    grid-template-columns: minmax(0, 1fr);
  }
}

.tc-board {
  position: relative;
  width: 100%;
  border-radius: var(--radius-6);
  overflow: hidden;
}
.tc-support {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
}

.tc-cell {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-4);
  background: none;
  cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.tc-modal.fleet .tc-cell {
  justify-content: flex-start;
  padding-left: var(--inset);
}
.tc-cell:disabled {
  cursor: default;
}
.tc-cell.target {
  border-style: dashed;
  border-color: var(--c-green);
  background: color-mix(in srgb, var(--c-green) 18%, transparent);
}
.tc-cell.chosen {
  border-color: var(--c-gold);
}
.tc-ship {
  height: var(--ship-h);
  aspect-ratio: 190 / 115;
  object-fit: contain;
  filter: drop-shadow(0 2px 3px color-mix(in srgb, var(--c-ink) 40%, transparent));
  user-select: none;
  animation: tc-ship-in 220ms var(--ease-out);
}

.tc-reserve {
  min-width: 0;
}
.tc-hint {
  margin: 0 0 8px;
  font-size: var(--fs-sm);
  color: var(--c-steel);
}
.tc-hint.warn {
  color: var(--c-gold);
}
.tc-group + .tc-group {
  margin-top: 10px;
}
.tc-group h4 {
  margin: 0 0 6px;
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--c-panel-text);
}
.tc-ships {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tc-pick {
  position: relative;
  width: 96px;
  padding: 2px;
  border: 2px solid transparent;
  border-radius: var(--radius-6);
  background: color-mix(in srgb, var(--c-white) 6%, transparent);
  cursor: grab;
  transition: border-color 150ms ease, background-color 150ms ease, transform 120ms ease-out;
}
.tc-pick img {
  display: block;
  width: 100%;
  aspect-ratio: 190 / 115;
  object-fit: contain;
  user-select: none;
}
.tc-pick:active {
  transform: scale(0.97);
}
.tc-pick.chosen {
  border-color: var(--c-gold);
  background: color-mix(in srgb, var(--c-gold) 16%, transparent);
}
.tc-pick.elsewhere img {
  opacity: 0.5;
}
.tc-badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 1px 5px;
  border-radius: var(--radius-4);
  background: var(--c-panel);
  color: var(--c-usn);
  font-size: var(--fs-2xs);
  font-weight: 700;
}
@media (hover: hover) and (pointer: fine) {
  .tc-close:hover {
    background: color-mix(in srgb, var(--c-white) 20%, transparent);
  }
  .tc-cell:not(:disabled):hover {
    border-color: color-mix(in srgb, var(--c-white) 40%, transparent);
  }
  .tc-pick:hover {
    background: color-mix(in srgb, var(--c-white) 14%, transparent);
  }
}
.tc-empty {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--c-steel);
}

.tc-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.tc-count {
  margin-right: auto;
  font-size: var(--fs-sm);
  color: var(--c-steel);
}
.tc-cancel {
  border: 1px solid color-mix(in srgb, var(--c-white) 25%, transparent);
  background: transparent;
  color: var(--c-panel-text);
  font-size: var(--fs-sm);
  padding: 8px 16px;
  border-radius: var(--radius-8);
  cursor: pointer;
}
.tc-ok {
  border: none;
  background: var(--c-orange);
  color: var(--c-panel);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: var(--fs-sm);
  padding: 8px 20px;
  border-radius: var(--radius-8);
  cursor: pointer;
}
.tc-ok:disabled {
  opacity: 0.4;
  cursor: default;
}

@keyframes tc-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}
@keyframes tc-ship-in {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tc-modal,
  .tc-ship {
    animation-name: tc-fade;
  }
}
@keyframes tc-fade {
  from {
    opacity: 0;
  }
}
</style>
