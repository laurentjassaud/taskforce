<script setup>
// Contenu de l'onglet "Tasse de recherche", toujours là (cf. HexMap.vue::
// sidePanelTabs) :
//   - en mode debug seulement, les chits qui restent dans la tasse (cf.
//     lib/useCoralSea.js::drawSearch), par résultat, sur le contenu d'une
//     tasse pleine ;
//   - les chits RETIRÉS DU JEU (cf. HexMap.vue::removedSearchChits) : tirés,
//     mais plus sur la carte — task force devenue connue (raid, combat
//     naval), pion remplacé, unité éliminée. Comptés par résultat réel, en
//     mode debug comme en mode normal : un chit resté caché sous un pion
//     "Search" s'y montre.
// Simple affichage : les chits tirés n'y reviennent qu'aux tours "Tous
// rendus" de la piste (cf. HexMap.vue, entrée `searchRefill` du journal).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  // Chits restants : `{ résultat: nombre }`.
  bag: { type: Object, required: true },
  // Tasse pleine, même forme.
  full: { type: Object, required: true },
  // Pion de chaque résultat : `{ résultat: { name, src } }`.
  looks: { type: Object, default: () => ({}) },
  // Chits retirés du jeu : `[{ chit, result }]`.
  removed: { type: Array, default: () => [] },
  // Mode debug : contenu de la tasse en plus.
  debug: { type: Boolean, default: false },
})

const { t } = useI18n()

const rows = computed(() => Object.entries(props.full).map(([key, total]) => ({
  key, total, left: props.bag[key] ?? 0, name: props.looks[key]?.name ?? key, src: props.looks[key]?.src,
})))
const left = computed(() => rows.value.reduce((sum, row) => sum + row.left, 0))
const total = computed(() => rows.value.reduce((sum, row) => sum + row.total, 0))

// Chits retirés du jeu, regroupés par résultat, dans l'ordre de `looks`.
const removedRows = computed(() => {
  const counts = new Map()
  for (const { result } of props.removed) counts.set(result, (counts.get(result) ?? 0) + 1)
  const order = Object.keys(props.looks)
  return [...counts].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([key, count]) => ({ key, count, name: props.looks[key]?.name ?? key, src: props.looks[key]?.src }))
})
</script>

<template>
  <div class="sb-panel">
    <section v-if="debug" class="sb-section">
      <h3 class="sb-title">{{ t('searchBag.cupTitle') }}</h3>
      <p class="sb-total">{{ t('searchBag.total', { left, total }) }}</p>
      <ul class="sb-list">
        <li v-for="row in rows" :key="row.key" class="sb-row" :class="{ 'sb-empty': !row.left }">
          <img v-if="row.src" :src="row.src" :alt="row.name" width="48" height="48" draggable="false" />
          <span class="sb-name">{{ row.name }}</span>
          <span class="sb-count"><b>{{ row.left }}</b> / {{ row.total }}</span>
        </li>
      </ul>
      <p class="sb-hint">{{ t('searchBag.hint') }}</p>
    </section>
    <section class="sb-section">
      <h3 class="sb-title">{{ t('searchBag.removedTitle') }}</h3>
      <p v-if="!removedRows.length" class="sb-none">{{ t('searchBag.removedEmpty') }}</p>
      <ul v-else class="sb-list">
        <li v-for="row in removedRows" :key="row.key" class="sb-row">
          <img v-if="row.src" :src="row.src" :alt="row.name" width="48" height="48" draggable="false" />
          <span class="sb-name">{{ row.name }}</span>
          <span class="sb-count"><b>{{ row.count }}</b></span>
        </li>
      </ul>
      <p class="sb-hint">{{ t('searchBag.removedHint') }}</p>
    </section>
  </div>
</template>

<style scoped>
.sb-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  font-size: var(--fs-sm);
}
.sb-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sb-title {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 600;
}
.sb-total {
  margin: 0;
  font-weight: 600;
}
.sb-none {
  margin: 0;
  opacity: 0.75;
}
.sb-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sb-row {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  align-items: center;
  gap: 12px;
}
.sb-row img {
  border-radius: var(--radius-4);
  background: color-mix(in srgb, currentColor 15%, transparent);
}
.sb-empty {
  opacity: 0.45;
}
.sb-count {
  font-variant-numeric: tabular-nums;
}
.sb-hint {
  font-size: var(--fs-xs);
  opacity: 0.75;
  line-height: 1.4;
  margin: 0;
}
</style>
