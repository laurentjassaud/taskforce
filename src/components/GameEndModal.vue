<script setup>
// ═══════════════════════════════════════════════════════════════════════════
// GameEndModal.vue — FIN DE PARTIE : bravo au vainqueur.
//
// Ouverte par HexMap.vue quand un camp CONCÈDE la partie (bouton de la
// barre d'outils). Le composant ne décide de rien : HexMap.vue lui passe le
// vainqueur et le perdant, il ne fait que les AFFICHER.
//
// Mode `confirm` : même fenêtre, mais pour DEMANDER la concession avant de
// l'appliquer (boutons Annuler / Concéder, évènement `confirm`).
//
// BLOQUANTE (overlay).
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  // Libellés des camps (cf. HexMap.vue::sideLabel) : vainqueur (`null` s'il
  // n'y en a pas) et perdant.
  winner: { type: String, default: null },
  loser: { type: String, default: null },
  // Demande de confirmation d'une concession (cf. l'en-tête) : libellé du
  // camp qui concéderait.
  confirmSide: { type: String, default: null },
})

const emit = defineEmits(['close', 'confirm'])

const { t } = useI18n()

function onKey(event) {
  if (event.key === 'Escape') emit('close')
  else if (event.key === 'Enter' && !props.confirmSide) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

/** Phrase de félicitations (match nul faute de vainqueur). */
const bravo = computed(() => (props.winner ? t('gameEnd.bravo', { side: props.winner }) : t('gameEnd.draw')))
</script>

<template>
  <div class="ge-overlay" @click.self="emit('close')">
    <div class="ge-modal" role="alertdialog" aria-labelledby="ge-title">
      <template v-if="confirmSide">
        <h3 id="ge-title">{{ $t('gameEnd.confirmTitle') }}</h3>
        <p>{{ $t('gameEnd.confirmMessage', { side: confirmSide }) }}</p>
        <footer class="ge-foot">
          <button type="button" class="ge-cancel" @click="emit('close')">{{ $t('common.cancel') }}</button>
          <button type="button" class="ge-ok" @click="emit('confirm')">{{ $t('gameEnd.concede') }}</button>
        </footer>
      </template>
      <template v-else>
        <h3 id="ge-title">{{ $t('gameEnd.title') }}</h3>
        <p class="ge-bravo">{{ bravo }}</p>
        <p class="ge-reason">{{ $t('gameEnd.byConcession', { side: loser ?? '' }) }}</p>
        <footer class="ge-foot">
          <button type="button" class="ge-ok" @click="emit('close')">{{ $t('common.gotIt') }}</button>
        </footer>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ge-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  background: color-mix(in srgb, var(--c-ink) 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.ge-modal {
  width: min(460px, 100%);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--c-panel);
  color: var(--c-panel-text);
  border-radius: var(--radius-12);
  border-top: 4px solid var(--c-gold);
  box-shadow: var(--shadow-modal);
  padding: 14px 18px 16px;
}

.ge-modal h3 {
  margin: 0 0 8px;
  font-size: var(--fs-md);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-gold);
}

.ge-modal p {
  margin: 0 0 8px;
  font-size: var(--fs-sm);
}

.ge-bravo {
  font-size: var(--fs-md) !important;
  font-weight: 700;
}

.ge-reason {
  color: var(--c-brand-ink);
}

.ge-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.ge-ok,
.ge-cancel {
  border: none;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: var(--fs-sm);
  padding: 8px 20px;
  border-radius: var(--radius-8);
  cursor: pointer;
}

.ge-ok {
  background: var(--c-gold);
  color: var(--c-panel);
}

.ge-cancel {
  background: color-mix(in srgb, var(--c-white) 6%, transparent);
  color: var(--c-panel-text);
}

.ge-ok:hover,
.ge-cancel:hover {
  filter: brightness(1.08);
}
</style>
