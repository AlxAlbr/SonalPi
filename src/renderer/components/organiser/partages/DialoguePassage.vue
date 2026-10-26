<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { SelectionAssociationCas } from '../../../composables/corpus/useCasCorpus'

defineProps<{ titre: string; selection: SelectionAssociationCas; occupe: boolean }>()
const emit = defineEmits<{ fermer: [] }>()
const dialogue = ref<HTMLDialogElement | null>(null)
onMounted(() => dialogue.value?.showModal())
onBeforeUnmount(() => dialogue.value?.close())
</script>

<template>
  <dialog ref="dialogue" class="dialogue-passage" :aria-label="titre" @cancel.prevent="!occupe && emit('fermer')">
    <header><h2>{{ titre }}</h2><button autofocus :disabled="occupe" @click="emit('fermer')">Fermer</button></header>
    <p>Entretien : <b>{{ selection.titreEntretien }}</b></p>
    <blockquote>{{ selection.texte }}</blockquote>
    <slot />
  </dialog>
</template>

<style scoped>
.dialogue-passage { width: min(580px, 94vw); max-height: 85vh; box-sizing: border-box; overflow: auto; border: 1px solid #b8c4d0; border-radius: 8px; padding: 1rem; }
.dialogue-passage::backdrop { background: rgb(0 0 0 / 45%); }
header { display: flex; align-items: center; justify-content: space-between; gap: .6rem; }
h2 { margin: 0; font-size: 1.1rem; }
blockquote { margin: .6rem 0; padding: .6rem; max-height: 8rem; overflow: auto; background: #f2f5fa; border-left: 3px solid #6989b5; white-space: pre-wrap; }
.dialogue-passage :deep(button) { cursor: pointer; padding: .35rem .6rem; }
.dialogue-passage :deep(label) { display: block; margin: .5rem 0; }
.dialogue-passage :deep(input:not([type=checkbox])), .dialogue-passage :deep(select), .dialogue-passage :deep(textarea) { box-sizing: border-box; width: 100%; padding: .35rem; }
.dialogue-passage :deep(fieldset) { margin: .6rem 0; border: 1px solid #ccd5e8; }
.dialogue-passage :deep(.actions) { display: flex; justify-content: flex-end; gap: .5rem; margin-top: 1rem; }
.dialogue-passage :deep(.erreur) { color: #a51e22; }
</style>
