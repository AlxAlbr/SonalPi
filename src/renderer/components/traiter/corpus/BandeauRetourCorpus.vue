<script setup lang="ts">
/**
 *  Bandeau de retour d'une action : pleine largeur, coloré selon le résultat, fermable.
 *  Une réussite est annoncée poliment, une erreur est annoncée tout de suite.
 *  Une suggestion propose des actions de suivi, placées à droite du message.
 */
defineProps<{ type: 'succes' | 'erreur' | 'suggestion'; etiquette?: string }>()
defineEmits<{ fermer: [] }>()
</script>

<template>
  <div
    class="bandeau-retour"
    :class="type"
    :role="type === 'erreur' ? 'alert' : type === 'succes' ? 'status' : 'region'"
    :aria-label="etiquette"
  >
    <span class="icone-retour" aria-hidden="true">{{ type === 'erreur' ? '⚠' : type === 'succes' ? '✓' : 'ℹ' }}</span>
    <div class="texte-retour"><slot /></div>
    <div v-if="$slots.actions" class="actions-retour"><slot name="actions" /></div>
    <button type="button" class="fermer-retour" title="Fermer ce message" aria-label="Fermer ce message" @click="$emit('fermer')">✕</button>
  </div>
</template>

<style scoped>
.bandeau-retour {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 0.7rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid;
  border-radius: 6px;
  font-size: 0.85rem;
  line-height: 1.4;
}
.bandeau-retour.succes {
  background: #e9f6ee;
  border-color: #a9d8b8;
  color: #1b5e3a;
}
.bandeau-retour.erreur {
  background: #fdecea;
  border-color: #f3b4ad;
  color: #a82020;
}
.bandeau-retour.suggestion {
  align-items: center;
  background: #eef4fc;
  border-color: #b9d0f0;
  color: #1f4f8f;
}
.icone-retour {
  flex: none;
  font-weight: 700;
}
.texte-retour {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.actions-retour {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.actions-retour :deep(button) {
  padding: 0.25rem 0.6rem;
  border: 1px solid currentColor;
  border-radius: 5px;
  background: #fff;
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.actions-retour :deep(button:hover:not(:disabled)) {
  background: rgb(255 255 255 / 60%);
  filter: brightness(0.97);
}
.actions-retour :deep(button.danger) {
  border-color: #d9a3a3;
  color: #a82020;
}
.actions-retour :deep(button:disabled) {
  opacity: 0.5;
  cursor: default;
}
.fermer-retour {
  flex: none;
  align-self: center;
  margin: 0 -0.2rem 0 0;
  padding: 0.1rem 0.35rem;
  border: none;
  border-radius: 4px;
  background: none;
  color: inherit;
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}
.fermer-retour:hover {
  background: rgb(0 0 0 / 8%);
}
.fermer-retour:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}
</style>
