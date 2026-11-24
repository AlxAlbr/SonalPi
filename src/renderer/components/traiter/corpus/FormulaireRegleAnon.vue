<script setup lang="ts">
/**
 *  Formulaire de création d'une règle de pseudonymisation au corpus.
 *  Chaque alias et chaque variante de pseudonyme a son propre champ.
 *  Une règle compte soit plusieurs alias avec un seul pseudonyme,
 *  soit une seule entité avec au plus deux variantes.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { validerDefinitionAnon, type DefinitionAnon } from '../../../../shared/corpus/definitionsAnon'
const props = defineProps<{ categories: string[]; enCours: boolean; erreur: string | null }>()
const emit = defineEmits<{ creer: [definition: DefinitionAnon]; fermer: [] }>()
const VARIANTES_MAX = 2
const aliases = ref<string[]>([''])
const pseudos = ref<string[]>([''])
const categorie = ref('')
const erreurLocale = ref<string | null>(null)
const formulaire = ref<HTMLFormElement | null>(null)
const ajoutAliasPossible = computed(() => pseudos.value.length < 2)
const ajoutVariantePossible = computed(() => aliases.value.length < 2 && pseudos.value.length < VARIANTES_MAX)

function champs(groupe: 'alias' | 'pseudo') {
  return [...(formulaire.value?.querySelectorAll<HTMLInputElement>(`.champs-${groupe} input`) ?? [])]
}
function focaliserPremierChamp() { champs('alias')[0]?.focus() }
onMounted(focaliserPremierChamp)
watch(() => props.enCours, async (enCours) => {
  await nextTick()
  if (enCours) formulaire.value?.focus()
  else focaliserPremierChamp()
})
async function ajouter(groupe: 'alias' | 'pseudo') {
  ;(groupe === 'alias' ? aliases : pseudos).value.push('')
  await nextTick()
  champs(groupe).at(-1)?.focus()
}
async function retirer(groupe: 'alias' | 'pseudo', index: number) {
  ;(groupe === 'alias' ? aliases : pseudos).value.splice(index, 1)
  await nextTick()
  champs(groupe)[index - 1]?.focus()
}
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
/** Valeurs saisies, sans les champs laissés vides ; le « / » reste réservé à l'affichage des groupes. */
function lireChamps(valeurs: string[], nature: string): string[] {
  const saisies = valeurs.map((v) => v.trim().normalize('NFC')).filter(Boolean)
  if (saisies.some((v) => v.includes('/'))) throw new Error(`Un ${nature} ne peut pas contenir « / ». Utilisez un champ par valeur.`)
  return saisies
}
function soumettre() {
  if (props.enCours) return
  erreurLocale.value = null
  try {
    const entite = lireChamps(aliases.value, 'alias')
    const variantes = lireChamps(pseudos.value, 'pseudonyme')
    if (new Set(variantes.map((p) => p.toLocaleLowerCase('fr'))).size !== variantes.length) {
      throw new Error('Saisissez deux pseudonymes différents.')
    }
    emit('creer', validerDefinitionAnon(entite, variantes, categorie.value))
  } catch (erreur) { erreurLocale.value = erreur instanceof Error ? erreur.message : 'Définition invalide.' }
}
</script>

<template>
  <div class="regle-fond" role="dialog" aria-modal="true" aria-labelledby="nouvelle-regle-titre" @keydown.esc.stop.prevent="!enCours && emit('fermer')" @keydown="retenirFocus">
    <form ref="formulaire" tabindex="-1" class="regle-formulaire" :aria-busy="enCours" @submit.prevent="soumettre">
      <h3 id="nouvelle-regle-titre">Ajouter une règle au corpus</h3>
      <p>Cette création ne modifie aucun entretien. Les occurrences détectées apparaîtront à traiter.</p>

      <fieldset class="champs-alias">
        <legend>Entité originale</legend>
        <div v-for="(_, i) in aliases" :key="i" class="champ-ligne">
          <input
            v-model="aliases[i]"
            :aria-label="i === 0 ? 'Entité originale' : `Alias ${i + 1}`"
            :placeholder="i === 0 ? 'Lyon' : 'Autre graphie, ex. Lyons'"
            :required="i === 0"
            :disabled="enCours"
          />
          <button v-if="i > 0" type="button" class="retirer" :disabled="enCours" :aria-label="`Retirer l’alias ${i + 1}`" title="Retirer ce champ" @click="retirer('alias', i)">✕</button>
        </div>
        <button
          type="button"
          class="ajouter"
          :disabled="enCours || !ajoutAliasPossible"
          :title="ajoutAliasPossible ? 'Ajouter une autre graphie de la même entité' : 'Une entité avec deux variantes ne peut pas avoir d’alias'"
          @click="ajouter('alias')"
        >+ Ajouter un alias</button>
      </fieldset>

      <fieldset class="champs-pseudo">
        <legend>Pseudonyme</legend>
        <div v-for="(_, i) in pseudos" :key="i" class="champ-ligne">
          <input
            v-model="pseudos[i]"
            :aria-label="i === 0 ? 'Pseudonyme' : `Variante ${i + 1}`"
            :placeholder="i === 0 ? 'Ville' : 'Seconde variante, ex. Cité'"
            :required="i === 0"
            :disabled="enCours"
          />
          <button v-if="i > 0" type="button" class="retirer" :disabled="enCours" :aria-label="`Retirer la variante ${i + 1}`" title="Retirer ce champ" @click="retirer('pseudo', i)">✕</button>
        </div>
        <button
          v-if="pseudos.length < VARIANTES_MAX"
          type="button"
          class="ajouter"
          :disabled="enCours || !ajoutVariantePossible"
          :title="ajoutVariantePossible ? 'Proposer une seconde variante, à choisir dans chaque entretien' : 'Une entité avec plusieurs alias n’a qu’un pseudonyme'"
          @click="ajouter('pseudo')"
        >+ Ajouter une variante</button>
      </fieldset>

      <p class="aide">Plusieurs alias avec un seul pseudonyme, ou une seule entité avec deux variantes de pseudonyme.</p>
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
fieldset { display: flex; flex-direction: column; align-items: flex-start; gap: .35rem; margin: .7rem 0; padding: 0; border: 0; }
legend { margin-bottom: .3rem; padding: 0; font-weight: 600; }
.champ-ligne { display: flex; align-items: center; gap: .35rem; align-self: stretch; }
.champ-ligne input { flex: 1; }
label { display: flex; flex-direction: column; gap: .25rem; margin: .7rem 0; font-weight: 600; }
input, select { font: inherit; padding: .4rem; min-width: 0; }
p { font-size: .85rem; }
.aide { color: #555; }
.erreur { color: #a12020; }
.actions { display: flex; justify-content: flex-end; gap: .6rem; }
button { padding: .4rem .7rem; cursor: pointer; }
button:disabled { cursor: not-allowed; }
.ajouter { padding: .2rem .5rem; border: 1px dashed #9fb0c6; border-radius: 5px; background: #fff; color: #1f4f8f; font-size: .82rem; }
.ajouter:disabled { color: #8a93a0; border-color: #ccd3dc; }
.retirer { flex: none; width: 2rem; height: 2rem; padding: 0; border: 1px solid #ccd3dc; border-radius: 5px; background: #fff; color: #6b7480; }
.retirer:hover:not(:disabled) { color: #b00020; border-color: #b00020; }
</style>
