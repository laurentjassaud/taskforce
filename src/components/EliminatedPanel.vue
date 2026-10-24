<script setup>
// Contenu de l'onglet "Unités éliminées" — pions retirés de la carte via le
// menu contextuel "Éliminé" (cf. HexMap.vue), regroupés par nationalité
// (faction). Pas de drag & drop ici : seul le clic droit propose de
// "Replacer le pion" (retour dans les renforts, cf. onEliminatedContextMenu
// dans HexMap.vue).
// En dessous : les pions retirés du jeu, un par retrait, dans l'ordre, avec
// le tour (et l'heure de la piste) et l'hex où ils l'ont été (`removals`,
// cf. HexMap.vue::removals) — en mode debug comme en mode normal.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  units: { type: Array, required: true }, // pions éliminés (toutes factions)
  // Retraits : `[{ key, counter, turn, time, hex, reason }]`, du premier au dernier.
  removals: { type: Array, default: () => [] },
})

const emit = defineEmits(['contextmenu'])

const { t, te } = useI18n()
const factionLabel = (faction) => (te(`factions.${faction}`) ? t(`factions.${faction}`) : faction)

/** Groupes { faction, items }, triés par nom de faction affiché. */
const groups = computed(() => {
  const byFaction = new Map()
  for (const counter of props.units) {
    const faction = counter.faction ?? '?'
    if (!byFaction.has(faction)) byFaction.set(faction, [])
    byFaction.get(faction).push(counter)
  }
  return [...byFaction.entries()]
    .map(([faction, items]) => ({ faction, label: factionLabel(faction), items }))
    .sort((counterA, counterB) => counterA.label.localeCompare(counterB.label))
})
</script>

<template>
  <div class="el-list">
    <p v-if="!units.length" class="el-empty">{{ t('eliminated.empty') }}</p>
    <section v-for="group in groups" :key="group.faction" class="el-group">
      <h3 class="el-group-title">{{ group.label }}</h3>
      <div class="el-grid">
        <figure v-for="counter in group.items" :key="counter.id" class="el-piece">
          <img :src="counter.src" :alt="counter.name" width="48" height="48" draggable="false"
            @contextmenu.prevent="emit('contextmenu', counter.id, $event)" />
        </figure>
      </div>
    </section>
    <p class="el-hint">{{ t('eliminated.hint') }}</p>
    <section v-if="removals.length" class="el-group">
      <h3 class="el-group-title">{{ t('eliminated.history') }}</h3>
      <ol class="el-history">
        <li v-for="removal in removals" :key="removal.key" class="el-row">
          <img :src="removal.counter.src" :alt="removal.counter.name" width="32" height="32" draggable="false" />
          <div class="el-row-text">
            <span class="el-row-name">{{ removal.counter.name }}</span>
            <span class="el-row-when">
              {{ t(removal.time ? 'eliminated.whenAt' : 'eliminated.when', { turn: removal.turn, time: removal.time }) }}<template
                v-if="removal.hex"> · {{ t('eliminated.hex', { hex: removal.hex }) }}</template>
            </span>
            <span v-if="removal.reason" class="el-row-reason">{{ removal.reason }}</span>
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.el-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
  font-size: var(--fs-sm);
}
.el-empty {
  opacity: 0.75;
}
.el-group-title {
  margin: 0 0 8px;
  font-size: var(--fs-md);
  font-weight: 600;
}
.el-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 10px;
}
.el-piece {
  margin: 0;
}
.el-piece img {
  border-radius: var(--radius-4);
  background: color-mix(in srgb, currentColor 15%, transparent);
  filter: grayscale(0.6);
  cursor: context-menu;
}
.el-history {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.el-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.el-row img {
  flex: none;
  border-radius: var(--radius-4);
  filter: grayscale(0.6);
}
.el-row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}
.el-row-name {
  font-weight: 600;
}
.el-row-when,
.el-row-reason {
  font-size: var(--fs-xs);
  opacity: 0.75;
}
.el-row-reason {
  font-style: italic;
}
.el-hint {
  font-size: var(--fs-xs);
  opacity: 0.75;
  line-height: 1.4;
  margin: 0;
}
</style>
