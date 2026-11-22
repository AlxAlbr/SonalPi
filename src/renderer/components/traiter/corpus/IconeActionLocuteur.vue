<script setup lang="ts">
defineProps<{ action: 'effacer' | 'renommer' | 'reunir' | 'dissocier' | 'statistiques' | 'actualiser' | 'clavier' }>()
const chemins = {
  effacer: 'M8 8l8 8m0-8-8 8M4 8V4h4m8 0h4v4m0 8v4h-4M8 20H4v-4',
  renommer: 'M4 20l4-1L20 7l-3-3L5 16l-1 4M14 7l3 3',
  reunir: 'M4 5h4l4 7h8M4 19h4l4-7m4-4 4 4-4 4',
  dissocier: 'M4 12h6l6-7h4m-4 14h4l-10-7M17 2l3 3-3 3m0 8 3 3-3 3',
  statistiques: 'M4 3v17h17M8 16v-5m5 5V6m5 10V9',
  actualiser: 'M20 8a8 8 0 1 0 0 8M20 3v5h-5',
  clavier: 'M4.5 6h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2M6 9.5h.01M9 9.5h.01M12 9.5h.01M15 9.5h.01M18 9.5h.01M6 12h.01M9 12h.01M12 12h.01M15 12h.01M18 12h.01M8 15h8',
}
</script>

<template>
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path :d="chemins[action]" /></svg>
</template>
