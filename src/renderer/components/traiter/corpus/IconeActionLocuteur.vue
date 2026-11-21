<script setup lang="ts">
defineProps<{ action: 'effacer' | 'renommer' | 'reunir' | 'dissocier' | 'statistiques' | 'details' | 'actualiser' }>()
const chemins = {
  effacer: 'M8 8l8 8m0-8-8 8M4 8V4h4m8 0h4v4m0 8v4h-4M8 20H4v-4',
  renommer: 'M4 20l4-1L20 7l-3-3L5 16l-1 4M14 7l3 3',
  reunir: 'M4 5h4l4 7h8M4 19h4l4-7m4-4 4 4-4 4',
  dissocier: 'M4 12h6l6-7h4m-4 14h4l-10-7M17 2l3 3-3 3m0 8 3 3-3 3',
  statistiques: 'M4 3v17h17M8 16v-5m5 5V6m5 10V9',
  details: 'M12 11v6m0-10v1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  actualiser: 'M20 8a8 8 0 1 0 0 8M20 3v5h-5',
}
</script>

<template>
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path :d="chemins[action]" /></svg>
</template>
