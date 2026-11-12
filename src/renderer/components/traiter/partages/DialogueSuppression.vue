<script setup lang="ts">
import { onMounted, ref, useId, watch } from 'vue'

/**
 *  Fenêtre de confirmation d'une suppression, ouverte au-dessus des fenêtres d'édition.
 *  Le contenu (slot) décrit ce qui sera perdu ;
 *  le bouton de suppression n'apparaît que lorsque la suppression est possible.
 *  « Annuler » a le focus à l'ouverture : la touche Entrée n'efface jamais rien par mégarde.
 */
const props = defineProps<{
  ouvert: boolean
  titre: string
  peutSupprimer: boolean
  libelleSupprimer?: string
  occupe?: boolean
}>()
const emit = defineEmits<{ confirmer: []; annuler: [] }>()

const dialogue = ref<HTMLDialogElement | null>(null)
const idTitre = useId()

function synchroniser(ouvert: boolean) {
  const element = dialogue.value
  if (!element) return
  if (ouvert && !element.open) element.showModal()
  else if (!ouvert && element.open) element.close()
}
watch(() => props.ouvert, synchroniser, { flush: 'post' })
onMounted(() => synchroniser(props.ouvert))
</script>

<template>
  <dialog ref="dialogue" class="dialogue-suppression" :aria-labelledby="idTitre" @cancel.prevent="emit('annuler')">
    <div v-if="ouvert" class="confirm-suppr">
      <h4 :id="idTitre">{{ titre }}</h4>
      <slot />
      <div class="confirm-actions">
        <button v-if="peutSupprimer" class="danger" :disabled="occupe" @click="emit('confirmer')">
          {{ libelleSupprimer ?? 'Supprimer' }}
        </button>
        <button autofocus @click="emit('annuler')">Annuler</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
/* .confirm-suppr/.confirm-actions : styles GLOBAUX (base.css), ici posés sur le fond blanc de la fenêtre. */
.dialogue-suppression {
  box-sizing: border-box;
  width: min(440px, 92vw);
  padding: 1rem 1.1rem;
  border: 1px solid #d6dce8;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
}
.dialogue-suppression::backdrop {
  background: rgba(0, 0, 0, 0.4);
}
.confirm-suppr {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font-size: 0.85rem;
}
h4 {
  margin: 0;
  font-size: 1rem;
  color: #b3261e;
}
.confirm-actions {
  justify-content: flex-end;
  margin-top: 0.8rem;
}
/* Signale en évidence ce qui sera perdu : fond jaune vif, texte sombre, pour ne pas passer inaperçu. */
:slotted(.alerte-usage) {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  margin: 0.45rem 0 0;
  padding: 0.45rem 0.6rem;
  border: 1px solid #e0a800;
  border-left-width: 4px;
  border-radius: 5px;
  background: #fff3cd;
  color: #5c4400;
  font-size: 0.8rem;
}
:slotted(.usage-nul),
:slotted(.usage-partage) {
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
}
:slotted(.usage-nul) {
  color: #6b4c49;
}
</style>
