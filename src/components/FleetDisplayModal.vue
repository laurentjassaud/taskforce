<script setup>
// Modale "support de task force" : les navires d'une task force ennemie
// repérée, posés sur son support — "Carrier TF" (porte-avions au centre,
// escortes autour) ou "Fleet TF" (cases numérotées). Ouverte par
// HexMap.vue::onCounterSelect pendant la phase d'Opérations aériennes du
// joueur (cf. lib/useCoralSea.js::fleetDisplay, qui tire la disposition).
// Ce composant ne fait qu'AFFICHER `layout` sur l'image du support.
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  // Disposition (cf. useCoralSea.js::fleetDisplay).
  layout: { type: Object, required: true },
  // Supports : `{ carrier, fleet }` (cf. useCoralSea.js::FLEET_DISPLAYS).
  displays: { type: Object, required: true },
  title: { type: String, required: true },
})

const emit = defineEmits(['close'])

// Proportions d'un pion navire (190 × 115 px), et part de la hauteur d'une
// case qu'il occupe.
const SHIP_RATIO = 190 / 115
const SHIP_FILL = 0.88
// Support "Fleet TF" : marge gauche du pion dans sa case, qui laisse lisible
// le numéro de la case (en bas à gauche).
const FLEET_INSET = 44

const display = computed(() => props.displays[props.layout.kind])

/** Place d'un navire dans la case `cell` (px de l'image), en % du support. */
function shipStyle(cell, inset = null) {
  const { width, height } = display.value
  const h = cell.h * SHIP_FILL
  const w = h * SHIP_RATIO
  const x = inset == null ? cell.x + (cell.w - w) / 2 : cell.x + inset
  const y = cell.y + (cell.h - h) / 2
  return { left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%`, width: `${(w / width) * 100}%`, height: `${(h / height) * 100}%` }
}

const placed = computed(() => {
  const { layout } = props
  if (layout.kind === 'carrier') {
    return [
      { ship: layout.carrier, style: shipStyle(display.value.carrier) },
      ...layout.escorts.map(({ ship, cell }) => ({ ship, style: shipStyle(display.value.escorts[cell]) })),
    ]
  }
  return layout.slots.map(({ ship, slot }) => ({ ship, style: shipStyle(display.value.slots[slot], FLEET_INSET) }))
})

const dialog = ref(null)
function onKey(event) {
  if (event.key === 'Escape') emit('close')
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
        <img v-for="({ ship, style }, index) in placed" :key="ship.key" class="fd-ship" :src="ship.src"
          :alt="`${ship.type} ${ship.name}`" :title="`${ship.type} ${ship.name}`" :style="{ ...style, '--i': index }" />
      </div>

      <p v-if="layout.extra.length" class="fd-extra">
        {{ $t('fleetDisplay.extra', { ships: layout.extra.map((ship) => `${ship.type} ${ship.name}`).join(', ') }) }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.fd-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  background: var(--black-a50);
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
  background: var(--panel-bg);
  color: var(--panel-text);
  border-radius: var(--radius-12);
  border-top: 4px solid var(--color-orange);
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
  font-size: var(--font-size-095);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-orange);
}
.fd-close {
  flex: none;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-6);
  background: var(--white-a10);
  color: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 150ms ease, transform 120ms ease-out;
}
@media (hover: hover) and (pointer: fine) {
  .fd-close:hover {
    background: var(--white-a20);
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
  filter: drop-shadow(0 2px 3px var(--black-a40));
  user-select: none;
  animation: fd-ship-in 260ms cubic-bezier(0.23, 1, 0.32, 1) both;
  animation-delay: calc(80ms + var(--i) * 40ms);
}

.fd-extra {
  margin: 10px 0 0;
  font-size: var(--font-size-085);
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
