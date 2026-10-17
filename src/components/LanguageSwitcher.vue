<script setup>
import { useI18n } from 'vue-i18n'
import { LOCALES, setLocale } from '../i18n/index.js'

// Sélecteur de langue de l'interface (cf. src/i18n/index.js). `brand` : les
// pastilles orange/grises de la page d'accueil (cf. SoloHome.vue).
defineProps({ brand: { type: Boolean, default: false } })

const { locale, t } = useI18n()
</script>

<template>
  <div class="lang-switcher" :class="{ brand }" role="group" :aria-label="t('language.label')">
    <button v-for="code in LOCALES" :key="code" type="button" :class="{ active: locale === code }"
      :aria-pressed="locale === code" :title="t(`language.${code}`)" @click="setLocale(code)">
      {{ code.toUpperCase() }}
    </button>
  </div>
</template>

<style scoped>
.lang-switcher {
  display: inline-flex;
  border: 1px solid var(--black-a25);
  border-radius: var(--radius-4);
  overflow: hidden;
  flex: none;
}

.lang-switcher button {
  padding: 4px 8px;
  font-size: var(--font-size-080);
  font-weight: 700;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.lang-switcher button + button {
  border-left: 1px solid var(--black-a25);
}

.lang-switcher button.active {
  background: var(--black-a25);
}

.lang-switcher.brand {
  gap: 4px;
  border: none;
  border-radius: 0;
  overflow: visible;
}

.lang-switcher.brand button {
  width: 42px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 2px;
  background: var(--brand-line);
  color: var(--color-white);
  font: inherit;
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
  transition: background-color 150ms ease, transform 160ms var(--ease-out);
}

.lang-switcher.brand button.active {
  background: var(--brand-orange);
}

@media (hover: hover) and (pointer: fine) {
  .lang-switcher.brand button:not(.active):hover {
    background: var(--brand-line-strong);
  }
}

.lang-switcher.brand button:active {
  transform: scale(0.95);
}

.lang-switcher.brand button:focus-visible {
  outline: 2px solid var(--brand-blue);
  outline-offset: 2px;
}
</style>
