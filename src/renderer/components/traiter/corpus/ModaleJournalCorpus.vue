<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import PanneauJournalCorpus from './PanneauJournalCorpus.vue'

const props = defineProps<{ personnes?: boolean }>()
const emit = defineEmits<{ fermer: [] }>()
const dialogue = ref<HTMLDialogElement | null>(null)
onMounted(() => dialogue.value?.showModal())
onBeforeUnmount(() => dialogue.value?.close())
</script>

<template>
  <dialog ref="dialogue" class="modale-journal-corpus" :aria-label="props.personnes ? 'Annuler une modification de personnes' : 'Historique des actions'" @cancel.prevent="emit('fermer')">
    <header>
      <h2>{{ props.personnes ? 'Annuler une modification de personnes' : 'Historique des actions' }}</h2>
      <button autofocus @click="emit('fermer')">Fermer</button>
    </header>
    <PanneauJournalCorpus :actif="true" :origine="props.personnes ? 'personnes' : undefined" />
  </dialog>
</template>

<style scoped>
.modale-journal-corpus { width: min(680px, 90vw); max-height: 85vh; box-sizing: border-box; overflow: auto; border: 1px solid #b8c4d0; border-radius: 8px; padding: 1rem; }
.modale-journal-corpus::backdrop { background: rgb(0 0 0 / 45%); }
header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
h2 { margin: 0; font-size: 1.1rem; }
button { padding: .4rem .8rem; cursor: pointer; }
</style>
