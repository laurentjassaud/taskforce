<script setup>
// ═══════════════════════════════════════════════════════════════════════════
// GameEndModal.vue — FIN DE PARTIE : bravo au vainqueur.
//
// Ouverte par HexMap.vue dans deux cas :
//   - un camp CONCÈDE la partie (bouton de la barre d'outils) ;
//   - Blitz : la pendule d'un camp est tombée à 0.
// Le composant ne décide de rien : HexMap.vue lui passe le vainqueur et la
// raison, il ne fait que les AFFICHER.
//
// Mode `confirm` : même fenêtre, mais pour DEMANDER la concession avant de
// l'appliquer (boutons Annuler / Concéder, évènement `confirm`).
//
// BLOQUANTE (overlay).
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  // 'concede' | 'blitz' — ce qui a mis fin à la partie.
  reason: { type: String, default: 'concede' },
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

/** Phrase sous le titre : comment la partie s'est terminée. */
const reasonKey = computed(() => (props.reason === 'blitz' ? 'gameEnd.byTime' : 'gameEnd.byConcession'))

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
        <p class="ge-reason">{{ $t(reasonKey, { side: loser ?? '' }) }}</p>
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
  background: var(--black-a50);
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
  background: var(--panel-bg);
  color: var(--panel-text);
  border-radius: var(--radius-12);
  border-top: 4px solid var(--color-gold);
  box-shadow: var(--shadow-modal);
  padding: 14px 18px 16px;
}

.ge-modal h3 {
  margin: 0 0 8px;
  font-size: var(--font-size-095);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-gold);
}

.ge-modal p {
  margin: 0 0 8px;
  font-size: var(--font-size-085);
}

.ge-bravo {
  font-size: var(--font-size-095) !important;
  font-weight: 700;
}

.ge-reason {
  color: var(--panel-text-muted);
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
  font-size: var(--font-size-082);
  padding: 8px 20px;
  border-radius: var(--radius-8);
  cursor: pointer;
}

.ge-ok {
  background: var(--color-gold);
  color: var(--panel-bg);
}

.ge-cancel {
  background: var(--white-a06);
  color: var(--panel-text);
}

.ge-ok:hover,
.ge-cancel:hover {
  filter: brightness(1.08);
}
</style>
