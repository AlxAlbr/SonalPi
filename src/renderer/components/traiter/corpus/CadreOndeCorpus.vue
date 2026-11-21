<script setup lang="ts">
defineProps<{ source: string | null }>()
</script>

<template>
  <div class="spectro-cadre">
    <img v-if="source" class="spectro" :src="source" alt="" draggable="false" loading="lazy" />
    <div v-else class="spectro-vide">pas d’audio</div>
    <slot />
  </div>
</template>

<style scoped>
.spectro-cadre { position: relative; flex: none; min-width: 0; height: 25px; border-radius: 3px; border: 1px solid #cbcbcb; background: linear-gradient(#00000040 0%, #fbf5f560 50%, #00000040 100%); overflow: visible; }
.spectro { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 3px; }
.spectro-vide { height: 100%; display: flex; align-items: center; justify-content: center; font-size: .66rem; color: #666675; font-style: italic; }
</style>
