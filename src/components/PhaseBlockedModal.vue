<script setup>
// Modale d'avertissement : changement de phase refusé (mode Assisté).
//
// Ouverte par HexMap.vue::onPhaseNext quand le joueur veut quitter la phase
// Mouvement alors que des unités amies sont encore en surplus d'empilement
// sur un même hex (cf. lib/useAssisted.js::stackedHexes). Ce composant ne
// fait qu'AFFICHER cette liste et renvoyer l'intention "ferme".
//
// Réutilisée aussi par HexMap.vue::setSelectedCounter (props `title` et
// `stackMessage`) quand on veut quitter une unité en overstack pour en
// sélectionner une autre.
//
// Et par HexMap.vue pour un message libre passé dans le slot par défaut,
// avec `title` et sans liste (ex. contact à deux joueurs).
//
// Mode CONFIRMATION (prop `confirmLabel`) : le changement de phase n'est pas
// refusé mais demandé à nouveau (ex. reconnaissances japonaises restantes,
// cf. HexMap.vue::onPhaseNext) — "Annuler" ferme, le second bouton renvoie
// "confirm". Entrée et Échap annulent : passer outre demande un vrai clic.
//
// Elle est BLOQUANTE (overlay) : c'est un simple message à acquitter, il n'y
// a rien à cliquer sur la carte pendant qu'elle est ouverte.
import { onMounted, onUnmounted } from 'vue'

defineProps({
  // `[{ key, hex, units }]` — cf. useAssisted.js::stackedHexes.
  stacks: { type: Array, default: () => [] },
  title: { type: String, default: null },
  // Phrase affichée au-dessus de la liste `stacks`.
  stackMessage: { type: String, default: null },
  // Libellé du bouton qui confirme (mode confirmation), ou `null`.
  confirmLabel: { type: String, default: null },
})

const emit = defineEmits(['close', 'confirm'])

function onKey(event) {
  if (event.key === 'Escape' || event.key === 'Enter') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="pb-overlay" @click.self="emit('close')">
    <div class="pb-modal" role="alertdialog" aria-labelledby="pb-title">
      <h3 id="pb-title">{{ title ?? $t('phaseBlocked.title') }}</h3>
      <p v-if="$slots.default"><slot /></p>
      <template v-if="stacks.length">
        <p>{{ stackMessage ?? $t('phaseBlocked.stacks') }}</p>
        <ul class="pb-list">
          <li v-for="stack in stacks" :key="stack.key">
            <span class="pb-hex">{{ stack.hex }}</span>
            <span class="pb-vs">—</span>
            <b>{{ stack.units.join(', ') }}</b>
          </li>
        </ul>
      </template>
      <footer class="pb-foot">
        <template v-if="confirmLabel">
          <button type="button" class="pb-cancel" @click="emit('close')">{{ $t('common.cancel') }}</button>
          <button type="button" class="pb-ok" @click="emit('confirm')">{{ confirmLabel }}</button>
        </template>
        <button v-else type="button" class="pb-ok" @click="emit('close')">{{ $t('common.gotIt') }}</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.pb-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  background: color-mix(in srgb, var(--c-ink) 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.pb-modal {
  width: min(460px, 100%);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--c-paper);
  color: var(--c-brand-ink);
  border-radius: var(--radius-12);
  border-top: 4px solid var(--c-mustard);
  box-shadow: var(--shadow-modal);
  padding: 14px 18px 16px;
}

.pb-modal h3 {
  margin: 0 0 8px;
  font-size: var(--fs-md);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 800;
  color: var(--c-mustard);
}

.pb-modal p {
  margin: 0 0 10px;
  font-size: var(--fs-sm);
  line-height: 1.4;
}

.pb-list {
  margin: 0;
  padding: 8px 10px 8px 26px;
  overflow-y: auto;
  background: color-mix(in srgb, var(--c-white) 6%, transparent);
  border-radius: var(--radius-8);
  font-size: var(--fs-sm);
}

/* Les deux listes (empilements, combats) ne coexistent jamais en pratique
   (phases différentes), mais on les sépare proprement si ça arrivait. */
.pb-list + p {
  margin-top: 12px;
}

.pb-list li + li {
  margin-top: 4px;
}

.pb-hex {
  color: var(--c-gold);
  font-variant-numeric: tabular-nums;
}

.pb-vs {
  color: var(--c-steel);
  margin: 0 6px;
}

.pb-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.pb-cancel {
  border: 1px solid color-mix(in srgb, var(--c-white) 25%, transparent);
  background: transparent;
  color: var(--c-mustard);
  font-size: var(--fs-sm);
  padding: 8px 16px;
  border-radius: var(--radius-8);
  cursor: pointer;
}

.pb-cancel:hover {
  background: color-mix(in srgb, var(--c-white) 10%, transparent);
}

.pb-ok {
  border: none;
  background: var(--c-mustard);
  color: var(--c-paper);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: var(--fs-sm);
  padding: 8px 20px;
  border-radius: var(--radius-8);
  cursor: pointer;
}

.pb-ok:hover {
  filter: brightness(1.08);
}
</style>
