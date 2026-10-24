<script setup>
// Modale "support de task force" : les navires d'une task force ennemie
// repérée, posés sur son support — "Carrier TF" (porte-avions au centre,
// escortes autour, ses avions en Ready et en Reserve) ou "Fleet TF" (cases
// numérotées). Ouverte par le menu "Attaque aérienne" du clic droit (cf.
// HexMap.vue::onCounterContextMenu) pendant la phase d'Opérations aériennes
// du joueur (cf. lib/useCoralSea.js::fleetDisplay, qui tire la disposition).
// Ce composant AFFICHE `layout` sur l'image du support, chaque navire selon
// ses dommages (face réduite, pion "Minor Damage" ou "Crit. Dmg" posé
// dessus) ; au clic droit sur un navire, le joueur change ses dommages
// (évènement `damage`, cf. HexMap.vue::setShipDamage) — coulé, le navire
// quitte le support (un porte-avions, avec ses avions) et rejoint la liste
// des navires coulés.
// Au clic droit sur un avion du porte-avions, ses pertes : intact, réduit,
// éliminé (évènement `planeState`, cf. HexMap.vue::setPlaneState) — `layout`
// suit (cf. useCoralSea.js::carrierAir) : face réduite, éliminé retiré du
// pont et listé sous le support.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ContextMenu from './ContextMenu.vue'

const props = defineProps({
  // Disposition (cf. useCoralSea.js::fleetDisplay).
  layout: { type: Object, required: true },
  // Supports : `{ carrier, fleet }` (cf. useCoralSea.js::FLEET_DISPLAYS).
  displays: { type: Object, required: true },
  title: { type: String, required: true },
  // Dommages possibles : état -> `{ reduced, marker }` (cf.
  // useCoralSea.js::SHIP_DAMAGE), et ceux d'un navire (`damageOf(clé)`).
  damages: { type: Object, default: null },
  damageOf: { type: Function, default: () => 'none' },
  // Le joueur peut-il changer les dommages ?
  editable: { type: Boolean, default: false },
  // Pertes possibles d'un avion (cf. useCoralSea.js::PLANE_STATES), et
  // celles d'un avion (`planeStateOf(clé)`).
  planeStates: { type: Array, default: null },
  planeStateOf: { type: Function, default: () => 'none' },
})

const emit = defineEmits(['close', 'damage', 'planeState'])
const { t } = useI18n()

// Proportions d'un pion navire (190 × 115 px), et part de la hauteur d'une
// case qu'il occupe.
const SHIP_RATIO = 190 / 115
const SHIP_FILL = 0.88
// Support "Fleet TF" : marge gauche du pion dans sa case, qui laisse lisible
// le numéro de la case (en bas à gauche).
const FLEET_INSET = 44

const display = computed(() => props.displays[props.layout.kind])

// Pion de dommages (scan carré 125 × 125 px, ombre comprise) posé sur un
// navire : sa taille, en part de la hauteur de l'image du navire, et son
// centre, en part de sa largeur (un peu à droite : le type du navire reste
// lisible).
const MARKER_FILL = 0.9
const MARKER_CENTER = 0.6

/** Rectangle `x`, `y`, `w`, `h` (px de l'image) en % du support. */
function percentStyle(x, y, w, h) {
  const { width, height } = display.value
  return { left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%`, width: `${(w / width) * 100}%`, height: `${(h / height) * 100}%` }
}

/** Navire `ship` dans la case `cell` (px de l'image) : son image (face selon
 *  ses dommages) et sa place, et le pion de dommages posé dessus. */
function placeShip(ship, cell, inset = null) {
  const h = cell.h * SHIP_FILL
  const w = h * SHIP_RATIO
  const x = inset == null ? cell.x + (cell.w - w) / 2 : cell.x + inset
  const y = cell.y + (cell.h - h) / 2
  const damage = props.damages?.[props.damageOf(ship.key)] ?? null
  const size = h * MARKER_FILL
  return {
    ship,
    src: (damage?.reduced && ship.reducedSrc) || ship.src,
    style: percentStyle(x, y, w, h),
    marker: damage?.marker && { ...damage.marker, style: percentStyle(x + w * MARKER_CENTER - size / 2, y + (h - size) / 2, size, size) },
  }
}

/** Le navire est-il coulé (retiré du support) ? */
const isSunk = (ship) => !!props.damages?.[props.damageOf(ship.key)]?.sunk
const carrierAfloat = computed(() => !!props.layout.carrier && !isSunk(props.layout.carrier))

const placed = computed(() => {
  const { layout } = props
  if (layout.kind === 'carrier') {
    return [
      ...(carrierAfloat.value ? [placeShip(layout.carrier, display.value.carrier)] : []),
      ...layout.escorts.filter(({ ship }) => !isSunk(ship)).map(({ ship, cell }) => placeShip(ship, display.value.escorts[cell])),
    ]
  }
  return layout.slots.filter(({ ship }) => !isSunk(ship)).map(({ ship, slot }) => placeShip(ship, display.value.slots[slot], FLEET_INSET))
})
/** Navires coulés : ceux d'avant l'ouverture, et ceux coulés depuis. */
const sunk = computed(() => {
  const { layout } = props
  const ships = [layout.carrier, ...(layout.escorts ?? []).map((entry) => entry.ship), ...(layout.slots ?? []).map((entry) => entry.ship), ...layout.extra]
  return [...(layout.sunk ?? []), ...ships.filter((ship) => ship && isSunk(ship))]
})
const extra = computed(() => props.layout.extra.filter((ship) => !isSunk(ship)))

// Menu des dommages d'un navire (clic droit) : `{ x, y, items }` ou `null`.
const damageMenu = ref(null)
function openDamageMenu(event, ship) {
  if (!props.editable || !props.damages) return
  event.preventDefault()
  const current = props.damageOf(ship.key)
  damageMenu.value = {
    x: event.clientX,
    y: event.clientY,
    items: Object.keys(props.damages).map((state) => ({
      label: t(`damage.${state}`), disabled: state === current, title: state === current ? t('damage.current') : null,
      action: () => emit('damage', { ship, state }),
    })),
  }
}
function chooseDamage(action) {
  action()
  damageMenu.value = null
}

/** Même menu, pour les pertes d'un avion : intact, réduit, éliminé. */
function openPlaneMenu(event, plane) {
  if (!props.editable || !props.planeStates) return
  event.preventDefault()
  const current = props.planeStateOf(plane.key)
  damageMenu.value = {
    x: event.clientX,
    y: event.clientY,
    items: props.planeStates.map((state) => ({
      label: t(`planeState.${state}`), disabled: state === current, title: state === current ? t('planeState.current') : null,
      action: () => emit('planeState', { plane, state }),
    })),
  }
}

// Pion avion (carré) : part de la hauteur d'une case qu'il occupe — toute,
// ses scans ayant déjà leur marge et leur ombre — et écart entre deux pions
// de la Reserve.
const PLANE_FILL = 1
const RESERVE_GAP = 0

/** Carré de côté `size` en (`x`, `y`) (px de l'image), en % du support. */
function planeStyle(x, y, size) {
  const { width, height } = display.value
  return { left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%`, width: `${(size / width) * 100}%`, height: `${(size / height) * 100}%` }
}

// Deux pions réduits (0,5 point chacun) partagent une case Ready : chacun à
// cette part de la case, l'un en haut à gauche, l'autre en bas à droite.
const HALF_FILL = 0.66

/** Avions `planes` côte à côte sur la bande `band`, centrés, resserrés s'ils
 *  n'y tiennent pas. */
function inBand(planes, band) {
  const size = band.h * PLANE_FILL
  const margin = (band.h - size) / 2
  const step = planes.length > 1 ? Math.min(size + RESERVE_GAP, (band.w - 2 * margin - size) / (planes.length - 1)) : 0
  const start = band.x + (band.w - (size + step * (planes.length - 1))) / 2
  return planes.map((plane, index) => ({ plane, style: planeStyle(start + index * step, band.y + margin, size) }))
}
/** Avions `planes` en grille dans la case `box` (deux colonnes dès deux). */
function inBox(planes, box) {
  if (!box || !planes.length) return []
  const columns = planes.length > 1 ? 2 : 1
  const rows = Math.ceil(planes.length / columns)
  const side = Math.min(box.w / columns, box.h / rows) * PLANE_FILL
  return planes.map((plane, index) => ({ plane, style: planeStyle(
    box.x + (box.w - columns * side) / 2 + (index % columns) * side,
    box.y + (box.h - rows * side) / 2 + Math.floor(index / columns) * side, side) }))
}
/** Avions des cases Ready : un pion plein par case ; deux réduits par case
 *  (cf. lib/airGroups.js::planePoints — 4 points en tout). */
function inReady(planes, cells) {
  const groups = []
  for (const plane of planes) {
    const half = plane.face === 'reduced' || plane.state === 'reduced'
    const last = groups[groups.length - 1]
    if (half && last?.length === 1 && last.half) last.push(plane)
    else groups.push(Object.assign([plane], { half }))
  }
  return groups.flatMap((group, index) => {
    const cell = cells[index]
    if (!cell) return []
    if (group.length === 1) {
      const size = cell.h * PLANE_FILL
      return [{ plane: group[0], style: planeStyle(cell.x + (cell.w - size) / 2, cell.y + (cell.h - size) / 2, size) }]
    }
    const size = cell.h * HALF_FILL
    return group.map((plane, rank) => ({ plane, style: planeStyle(
      cell.x + (rank ? cell.w - size : 0), cell.y + (rank ? cell.h - size : 0), size) }))
  })
}

/** Avions du porte-avions (cf. useCoralSea.js::carrierAir, `air`), dans
 *  leur zone : cases Ready, bandes Reserve et C.A.P., cases "Landing from
 *  Map" et "Landing from C.A.P.". */
const planes = computed(() => {
  const { air } = props.layout
  if (props.layout.kind !== 'carrier' || !air || !carrierAfloat.value) return []
  const box = display.value
  return [
    ...inReady(air.ready, box.ready),
    ...inBand(air.reserve, box.reserve),
    ...(box.cap ? inBand(air.cap ?? [], box.cap) : []),
    ...inBox(air.landing ?? [], box.landing),
    ...inBox(air.landingCap ?? [], box.landingCap),
  ]
})

const planeLabel = (plane) => [plane.mission, plane.name, plane.code].filter(Boolean).join(' ')
/** Libellé d'un avion, et ses pertes s'il en a. */
function planeTitle(plane) {
  const state = props.planeStateOf(plane.key)
  return planeLabel(plane) + (state === 'none' ? '' : ` — ${t(`planeState.${state}`)}`)
}
/** Avions éliminés du porte-avions (cf. useCoralSea.js::carrierAir). */
const lost = computed(() => (carrierAfloat.value && props.layout.air?.lost) || [])
/** Nom d'un navire, et ses dommages s'il en a. */
function shipLabel(ship) {
  const state = props.damageOf(ship.key)
  return `${ship.type} ${ship.name}` + (state === 'none' ? '' : ` — ${t(`damage.${state}`)}`)
}

const dialog = ref(null)
function onKey(event) {
  if (event.key !== 'Escape') return
  if (damageMenu.value) damageMenu.value = null
  else emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  dialog.value?.focus()
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="fd-overlay" @click.self="emit('close')">
    <div ref="dialog" class="fd-modal" :class="layout.kind" role="dialog" aria-modal="true" aria-labelledby="fd-title" tabindex="-1">
      <header class="fd-head">
        <h3 id="fd-title">{{ title }}</h3>
        <button type="button" class="fd-close" :aria-label="$t('common.close')" @click="emit('close')">×</button>
      </header>

      <div class="fd-board" :style="{ aspectRatio: `${display.width} / ${display.height}` }">
        <img class="fd-support" :src="display.src" alt="" />
        <template v-for="({ ship, src, style, marker }, index) in placed" :key="ship.key">
          <img class="fd-ship" :class="{ editable: editable && damages }" :src="src"
            :alt="shipLabel(ship)" :title="shipLabel(ship)" :style="{ ...style, '--i': index }"
            @contextmenu="openDamageMenu($event, ship)" />
          <img v-if="marker" class="fd-ship fd-marker" :src="marker.src" :alt="marker.name" :title="shipLabel(ship)"
            :style="{ ...marker.style, '--i': index }" @contextmenu="openDamageMenu($event, ship)" />
        </template>
        <img v-for="({ plane, style }, index) in planes" :key="plane.key" class="fd-ship fd-plane"
          :class="{ editable: editable && planeStates }" :src="plane.src"
          :alt="planeTitle(plane)" :title="planeTitle(plane)" :style="{ ...style, '--i': placed.length + index }"
          @contextmenu="openPlaneMenu($event, plane)" />
      </div>

      <p v-if="extra.length" class="fd-extra">
        {{ $t('fleetDisplay.extra', { ships: extra.map((ship) => `${ship.type} ${ship.name}`).join(', ') }) }}
      </p>
      <p v-if="sunk.length" class="fd-extra">
        {{ $t('damage.sunkList', { ships: sunk.map((ship) => `${ship.type} ${ship.name}`).join(', ') }) }}
      </p>
      <div v-if="lost.length" class="fd-extra fd-lost">
        <span>{{ $t('planeState.lostList') }}</span>
        <img v-for="plane in lost" :key="plane.key" class="fd-lost-plane" :src="plane.src" :alt="planeTitle(plane)"
          :title="planeTitle(plane)" @contextmenu="openPlaneMenu($event, plane)" />
      </div>
      <p v-if="editable && damages" class="fd-extra fd-hint">{{ $t('damage.hint') }}</p>
    </div>
    <ContextMenu v-if="damageMenu" :left-px="damageMenu.x" :top-px="damageMenu.y" :items="damageMenu.items"
      @choose="chooseDamage" @close="damageMenu = null" />
  </div>
</template>

<style scoped>
.fd-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  background: color-mix(in srgb, var(--c-ink) 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.fd-modal {
  display: flex;
  flex-direction: column;
  max-width: 100%;
  max-height: 100%;
  background: var(--c-panel);
  color: var(--c-panel-text);
  border-radius: var(--radius-12);
  border-top: 4px solid var(--c-orange);
  box-shadow: var(--shadow-modal);
  padding: 12px 16px 16px;
  outline: none;
  transform-origin: center;
  animation: fd-in 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
/* Support porte-avions : aussi grand que la hauteur d'écran le permet. */
.fd-modal.carrier {
  width: min(640px, calc((100vh - 120px) * 667 / 699));
}
.fd-modal.fleet {
  width: min(1400px, 100%);
}

.fd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.fd-head h3 {
  margin: 0;
  font-size: var(--fs-md);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-orange);
}
.fd-close {
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
@media (hover: hover) and (pointer: fine) {
  .fd-close:hover {
    background: color-mix(in srgb, var(--c-white) 20%, transparent);
  }
}
.fd-close:active {
  transform: scale(0.94);
}

.fd-board {
  position: relative;
  width: 100%;
  border-radius: var(--radius-6);
  overflow: hidden;
}
.fd-support {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
}
.fd-ship {
  position: absolute;
  object-fit: contain;
  /* L'ombre des scans, en bas à droite, décentre le pion dans son image :
     on le recentre (navire 190 × 115 px : le pion est 5 px plus haut et plus
     à gauche). */
  translate: 2.6% 4.3%;
  filter: drop-shadow(0 2px 3px color-mix(in srgb, var(--c-ink) 40%, transparent));
  user-select: none;
  animation: fd-ship-in 260ms cubic-bezier(0.23, 1, 0.32, 1) both;
  animation-delay: calc(80ms + var(--i) * 40ms);
}
/* Avion et pion de dommages 125 × 125 px : le pion est 5 px plus haut et
   plus à gauche. */
.fd-plane,
.fd-marker {
  translate: 4% 4%;
}
.fd-ship.editable,
.fd-ship.editable + .fd-marker {
  cursor: context-menu;
}
.fd-hint {
  opacity: 0.75;
}
/* Avions éliminés : grisés, un clic droit les rétablit. */
.fd-lost {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.fd-lost-plane {
  width: 44px;
  aspect-ratio: 1;
  opacity: 0.4;
  filter: grayscale(1);
  cursor: context-menu;
  user-select: none;
}

.fd-extra {
  margin: 10px 0 0;
  font-size: var(--fs-sm);
}

@keyframes fd-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}
@keyframes fd-ship-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .fd-modal,
  .fd-ship {
    animation-name: fd-fade;
  }
}
@keyframes fd-fade {
  from {
    opacity: 0;
  }
}
</style>
