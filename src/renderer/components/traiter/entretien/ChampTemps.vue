<script setup lang="ts">
/**
 *  Champ de temps (0:12.4) : au clic, propose le temps courant de l'audio sous le champ.
 *  La valeur saisie est remontée à chaque frappe ; « valider » part à Entrée, au départ
 *  du champ, ou après le choix de la suggestion.
 */
import { computed, nextTick, ref } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { formaterTemps } from '../../../../shared/entretien/horodatage'

defineOptions({ inheritAttrs: false })

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{
  'update:modelValue': [valeur: string]
  valider: [valeur: string]
  annuler: []
}>()

const { audio } = utiliserSonal()
const suggestionOuverte = ref(false)
const champ = ref<HTMLInputElement | null>(null)

/** Valide, puis remet le texte affiché sur la valeur du modèle (corrigée ou non). */
function valider() {
  emit('valider', props.modelValue)
  nextTick(() => {
    if (champ.value) champ.value.value = props.modelValue
  })
}
const tempsCourant = computed(() => formaterTemps(audio.position.value))

function choisirTempsCourant() {
  emit('update:modelValue', tempsCourant.value)
  emit('valider', tempsCourant.value)
  suggestionOuverte.value = false
}
</script>

<template>
  <span class="champ-temps">
    <input
      ref="champ"
      v-bind="$attrs"
      :value="modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @focus="suggestionOuverte = !!audio.url.value"
      @blur="suggestionOuverte = false"
      @change="valider"
      @keydown.enter.prevent="valider"
      @keydown.esc="emit('annuler')"
    />
    <button
      v-if="suggestionOuverte"
      type="button"
      class="suggestion-temps"
      @mousedown.prevent
      @click="choisirTempsCourant"
    >Temps courant : {{ tempsCourant }}</button>
  </span>
</template>

<style scoped>
.champ-temps {
  position: relative;
  display: inline-flex;
}
input {
  width: var(--largeur-champ-temps, 6.5rem);
  box-sizing: border-box;
  padding: 0.25rem 0.45rem;
  border: 1px solid #c9d0da;
  border-radius: 5px;
  background: #fff;
  color: #2a5596;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 0.8rem;
}
input:focus {
  border-color: #2e73d8;
  outline: none;
}
input:disabled {
  background: #f3f4f6;
  color: #8a8f98;
}
input.invalide {
  border-color: #c62828;
}
.suggestion-temps {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  padding: 0.25rem 0.55rem;
  border: 1px solid #2e73d8;
  border-radius: 5px;
  background: #fff;
  color: #1565c0;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 0.78rem;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 4px 12px #0002;
}
.suggestion-temps:hover {
  background: #f0f6ff;
}
</style>
