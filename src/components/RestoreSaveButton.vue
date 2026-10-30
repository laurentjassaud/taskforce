<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { restoreGame } from '../lib/api.js'
import { errorMessage } from '../i18n/index.js'

// Reprise d'une partie en ligne depuis une sauvegarde téléchargée en cours de
// partie (cf. RoomLobby.vue::downloadSave) : le fichier part tel quel au
// serveur, qui recrée la partie s'il l'a perdue (cf. server/src/
// persistence.js::restoreFromSave), puis on rejoint son salon à la place du
// joueur qui l'a sauvegardée (`seat`, cf. RoomLobby.vue).

const router = useRouter()
const fileInput = ref(null)
const restoring = ref(false)
const error = ref('')

async function onFileChosen(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  restoring.value = true
  error.value = ''
  try {
    const { id, passcode, playerId } = await restoreGame(await file.text())
    const target = router.resolve({ name: 'room-lobby', params: { id }, query: { code: passcode, seat: playerId } })
    // Déjà dans un salon (partie introuvable) : RoomLobby.vue ne se recharge
    // pas sur un simple changement d'adresse — on recharge la page.
    if (router.currentRoute.value.name === 'room-lobby') window.location.assign(target.href)
    else router.push(target)
  } catch (err) {
    error.value = errorMessage(err.message)
  } finally {
    restoring.value = false
  }
}
</script>

<template>
  <div class="restore">
    <p>
      {{ $t('online.restoreQuestion') }}
      <button type="button" class="restore-button" :disabled="restoring" @click="fileInput.click()">
        {{ restoring ? $t('online.restoring') : $t('online.restore') }}
      </button>
    </p>
    <input ref="fileInput" type="file" accept=".tfsave" hidden @change="onFileChosen" />
    <p v-if="error" class="restore-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.restore {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  line-height: 1.5;
  text-align: center;
  color: var(--c-ink-soft);
}
.restore-button {
  padding: 0;
  border: none;
  background: none;
  color: var(--c-brand-blue);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.restore-button:disabled {
  opacity: 0.6;
  cursor: progress;
}
.restore-button:focus-visible {
  outline: 2px solid var(--c-brand-blue);
  outline-offset: 3px;
  border-radius: 2px;
}
.restore-error {
  color: var(--c-red);
}
</style>
