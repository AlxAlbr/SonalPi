<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 *  Curseur continu du zoom de la liste des entretiens.
 *  Il garde sa position pour lui : un glissement ne redessine pas tout l'écran Corpus.
 */
const props = defineProps<{ valeur: number; max: number }>()
const emit = defineEmits<{ glisser: [valeur: number]; relacher: [] }>()
const position = ref(props.valeur)
watch(() => props.valeur, (valeur) => { position.value = valeur })

function glisser(event: Event): void {
  position.value = Number((event.target as HTMLInputElement).value)
  emit('glisser', position.value)
}
</script>

<template>
  <input :value="position" type="range" min="0" :max="max" step="0.01" @input="glisser" @change="emit('relacher')" />
</template>
