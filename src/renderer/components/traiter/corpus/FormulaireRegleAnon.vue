<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { validerDefinitionAnon, type DefinitionAnon } from '../../../../shared/corpus/definitionsAnon'
import { lirePseudos } from '../../../editionPseudosAnon'
const props = defineProps<{ categories: string[]; enCours: boolean; erreur: string | null }>()
const emit = defineEmits<{ creer: [definition: DefinitionAnon]; fermer: [] }>()
const entite = ref('')
const pseudos = ref('')
const categorie = ref('')
const erreurLocale = ref<string | null>(null)
const champEntite = ref<HTMLInputElement | null>(null)
const formulaire = ref<HTMLFormElement | null>(null)
onMounted(() => champEntite.value?.focus())
watch(() => props.enCours, async (enCours) => {
  await nextTick()
  if (enCours) formulaire.value?.focus()
  else champEntite.value?.focus()
})
function retenirFocus(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const controles = [...(formulaire.value?.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled)') ?? [])]
  const premier = controles[0]
  const dernier = controles.at(-1)
  if (!premier) { e.preventDefault(); return }
  if (e.shiftKey && (document.activeElement === premier || document.activeElement === formulaire.value)) {
    e.preventDefault(); dernier?.focus()
  } else if (!e.shiftKey && (document.activeElement === dernier || document.activeElement === formulaire.value)) {
    e.preventDefault(); premier.focus()
  }
}
function soumettre() {
  if (props.enCours) return
  erreurLocale.value = null
  try { emit('creer', validerDefinitionAnon(entite.value, lirePseudos(pseudos.value), categorie.value)) }
  catch (erreur) { erreurLocale.value = erreur instanceof Error ? erreur.message : 'Définition invalide.' }
}
</script>

<template>
  <div class="regle-fond" role="dialog" aria-modal="true" aria-labelledby="nouvelle-regle-titre" @keydown.esc.stop.prevent="!enCours && emit('fermer')" @keydown="retenirFocus">
    <form ref="formulaire" tabindex="-1" class="regle-formulaire" :aria-busy="enCours" @submit.prevent="soumettre">
      <h3 id="nouvelle-regle-titre">Ajouter une règle au corpus</h3>
      <p>Cette création ne modifie aucun entretien. Les occurrences détectées apparaîtront à traiter.</p>
      <label>Entité originale / alias<input ref="champEntite" v-model="entite" :disabled="enCours" required placeholder="Lyon / Lyons" /></label>
      <label>Pseudonymes<input v-model="pseudos" :disabled="enCours" required placeholder="Claire / Rebecca" /></label>
      <p class="aide">Séparez les alias ou les pseudonymes par /. Plusieurs alias avec un seul pseudo, ou une seule entité avec deux variantes.</p>
      <label v-if="categories.length">Catégorie<select v-model="categorie" :disabled="enCours"><option value="">Sans catégorie</option><option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option></select></label>
      <p v-if="erreurLocale || erreur" class="erreur" role="alert">{{ erreurLocale || erreur }}</p>
      <div class="actions"><button type="button" :disabled="enCours" @click="emit('fermer')">Annuler</button><button type="submit" :disabled="enCours">{{ enCours ? 'Création…' : 'Créer la définition' }}</button></div>
    </form>
  </div>
</template>

<style scoped>
.regle-fond { position: fixed; inset: 0; z-index: 210; background: #0006; display: grid; place-items: center; }
.regle-formulaire { box-sizing: border-box; width: min(520px, 92vw); max-height: 90dvh; overflow: auto; background: white; border-radius: 8px; padding: 1.2rem; }
h3 { margin-top: 0; }
label { display: flex; flex-direction: column; gap: .25rem; margin: .7rem 0; font-weight: 600; }
input, select { font: inherit; padding: .4rem; min-width: 0; }
p { font-size: .85rem; }
.aide { color: #555; }
.erreur { color: #a12020; }
.actions { display: flex; justify-content: flex-end; gap: .6rem; }
button { padding: .4rem .7rem; cursor: pointer; }
button:disabled { cursor: not-allowed; }
</style>
