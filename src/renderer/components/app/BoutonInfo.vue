<script setup lang="ts">
/**
 *  Petit bouton « i » qui ouvre ou referme un texte d'aide.
 *  Le texte lui-même est affiché par le parent, sous la condition `v-model`.
 */
defineProps<{ libelle: string }>()
const ouvert = defineModel<boolean>({ default: false })
</script>

<template>
  <button
    type="button"
    class="bouton-info"
    :aria-expanded="ouvert"
    :aria-label="libelle"
    :title="libelle"
    @click="ouvert = !ouvert"
  ><span class="ico-info" aria-hidden="true"></span></button>
</template>

<style scoped>
.bouton-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid #c9d0da;
  border-radius: 6px;
  background: #fff;
  color: #2b3d55;
  font-size: 0.95rem;
  cursor: pointer;
}
.bouton-info:hover,
.bouton-info[aria-expanded='true'] {
  border-color: #2e73d8;
  background: #f0f6ff;
  color: #1565c0;
}
</style>
