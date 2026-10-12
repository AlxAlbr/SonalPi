<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { RegleAnon } from '../../../shared/format'
import type { ResultatAjoutVarianteAnon } from '../../../shared/corpus/variantesAnon'
import { preparerEditionPseudos } from '../../editionPseudosAnon'
import { nettoyerMessage } from '../../erreurs'
import { suspendreTirageAutomatique } from '../../tirageAutomatique'

const props = defineProps<{ regle: RegleAnon; ajoutDisponible: boolean; renommageDisponible: boolean; retraitDisponible: boolean; contexte: number }>()
const emit = defineEmits<{ fermer: []; activite: [active: boolean]; termine: [resultat: ResultatAjoutVarianteAnon]; renommer: [ancien: string, nouveau: string]; retirer: [retire: string, conserve: string] }>()
const regleAvant = JSON.parse(JSON.stringify(props.regle)) as RegleAnon
const saisie = ref(regleAvant.pseudos.join(' / ')), erreur = ref<string | null>(null), enCours = ref(false), tentee = ref(false), perime = ref(false)
const champ = ref<HTMLInputElement | null>(null), formulaire = ref<HTMLFormElement | null>(null)
let generation = 0, vivant = true
let focusAvant: HTMLElement | null = null
const autorise = computed(() => (props.ajoutDisponible || props.renommageDisponible || props.retraitDisponible) && !perime.value && !tentee.value && !enCours.value)
watch(() => [props.contexte, props.ajoutDisponible, props.renommageDisponible, props.retraitDisponible, JSON.stringify(props.regle)], () => {
  generation++; perime.value = true
}, { flush: 'sync' })
onMounted(() => { focusAvant = document.activeElement as HTMLElement; champ.value?.focus() })
onUnmounted(() => { vivant = false; generation++; emit('activite', false); if (focusAvant?.isConnected) focusAvant.focus() })
function fermer() { if (!enCours.value) emit('fermer') }
function retenirFocus(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const controles = [...(formulaire.value?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), summary') ?? [])]
    .filter((c) => !c.closest('details:not([open])') || c.tagName === 'SUMMARY')
  const premier = controles[0], dernier = controles.at(-1)
  if (!premier) { e.preventDefault(); formulaire.value?.focus(); return }
  if (e.shiftKey && (document.activeElement === premier || document.activeElement === formulaire.value)) { e.preventDefault(); dernier?.focus() }
  else if (!e.shiftKey && (document.activeElement === dernier || document.activeElement === formulaire.value)) { e.preventDefault(); premier.focus() }
}
async function enregistrer() {
  if (!autorise.value) return
  erreur.value = null
  let intention: ReturnType<typeof preparerEditionPseudos>
  try {
    intention = preparerEditionPseudos(regleAvant, saisie.value)
    if (intention.type === 'inchange') throw new Error('Aucune modification : les pseudonymes sont inchangés.')
    if (intention.type === 'retrait') {
      if (!props.retraitDisponible) throw new Error('Le retrait d’une variante n’est pas encore disponible pour ce corpus distant.')
      tentee.value = true
      emit('retirer', intention.pseudoRetire, intention.pseudoConserve)
      return
    }
    if (intention.type === 'renommage') {
      if (!props.renommageDisponible) throw new Error('Le renommage n’est pas disponible pour ce corpus.')
      tentee.value = true
      emit('renommer', intention.ancienPseudo, intention.nouveauPseudo)
      return
    }
    if (!props.ajoutDisponible) throw new Error('L’ajout d’une variante n’est pas encore disponible pour ce corpus distant.')
  } catch (e) { erreur.value = e instanceof Error ? e.message : 'Saisie invalide.'; return }
  const g = generation, reprendreTirage = suspendreTirageAutomatique()
  tentee.value = true; enCours.value = true; emit('activite', true)
  try {
    await nextTick(); formulaire.value?.focus()
    if (!vivant || g !== generation || !props.ajoutDisponible) return
    const resultat = await window.sonal.corpus.regleAnonAjouterVariante({ regleAvant: JSON.parse(JSON.stringify(regleAvant)), pseudo: intention.pseudo })
    if (vivant && g === generation && props.ajoutDisponible) emit('termine', resultat)
  } catch (e) {
    if (vivant && g === generation) erreur.value = nettoyerMessage(e instanceof Error ? e.message : String(e))
  } finally { enCours.value = false; reprendreTirage(); if (vivant) emit('activite', false) }
}
</script>

<template>
  <div class="pseudos-fond" role="dialog" aria-modal="true" aria-labelledby="edition-pseudos-titre" @keydown.esc.stop.prevent="fermer" @keydown="retenirFocus">
    <form ref="formulaire" tabindex="-1" class="pseudos-formulaire" :aria-busy="enCours" @submit.prevent="enregistrer">
      <header><h3 id="edition-pseudos-titre">Modifier les pseudonymes</h3><button type="button" :disabled="enCours" @click="fermer">{{ tentee && !enCours ? 'Fermer' : 'Annuler' }}</button></header>
      <p><strong>{{ regleAvant.entite.join(' / ') }}</strong></p>
      <label>Pseudonymes<input ref="champ" v-model="saisie" :disabled="!autorise" required aria-describedby="aide-pseudos" /></label>
      <p id="aide-pseudos">Pour ajouter un choix, conservez le pseudonyme actuel puis ajoutez <strong>/</strong> et le second, par exemple <strong>Claire / Rebecca</strong>. Les passages déjà traités, les exceptions et les locuteurs restent inchangés.</p>
      <p>Modifier un pseudonyme ouvre le bilan du renommage avant confirmation. Retirer une valeur ouvre le bilan de son remplacement par la variante restante.</p>
      <p v-if="!ajoutDisponible">L’ajout d’une seconde variante n’est pas disponible pour ce corpus.</p>
      <p v-if="!retraitDisponible">Le retrait d’une variante n’est pas encore disponible pour ce corpus.</p>
      <p v-if="perime" role="alert">La règle ou le corpus a changé. Fermez cette fenêtre, actualisez puis rouvrez-la.</p>
      <template v-if="erreur">
        <p v-if="tentee" role="alert">L’ajout n’a pas pu être confirmé. Fermez cette fenêtre puis actualisez le corpus pour vérifier sa définition avant de recommencer.</p>
        <p v-else class="erreur" role="alert">{{ erreur }}</p>
        <details v-if="tentee"><summary>Informations pour l’assistance</summary><p>{{ erreur }}</p></details>
      </template>
      <button type="submit" :disabled="!autorise">{{ enCours ? 'Enregistrement…' : 'Enregistrer' }}</button>
    </form>
  </div>
</template>

<style scoped>
.pseudos-fond { position: fixed; inset: 0; z-index: 210; background: #0006; display: grid; place-items: center; }
.pseudos-formulaire { box-sizing: border-box; width: min(560px, 92vw); max-height: 90dvh; overflow: auto; background: white; border-radius: 8px; padding: 1.2rem; }
header { display: flex; align-items: center; justify-content: space-between; gap: .8rem; }
h3 { margin: 0; }
label { display: flex; flex-direction: column; gap: .3rem; margin: 1rem 0; font-weight: 600; }
input { font: inherit; padding: .4rem; min-width: 0; }
p, details { font-size: .9rem; }
.erreur { color: #a12020; }
button { padding: .4rem .7rem; cursor: pointer; }
button:disabled { cursor: not-allowed; }
</style>
