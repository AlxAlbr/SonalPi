<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { VueLocuteurPersonne } from '../../../shared/corpus/personnes'
import type { Locuteur, Variable } from '../../../shared/format'
import { type ChoixRepriseLocuteur, natureNomPersonne, reprendreDonneesLocuteur } from '../../../shared/corpus/rapprochementsPersonnes'

const props = defineProps<{ nom: string; lienActuel: string; cible: Locuteur; sources: VueLocuteurPersonne[]; variables: Variable[]; candidats: VueLocuteurPersonne[]; occupe: boolean; message: string }>()
const emit = defineEmits<{
  reporter: []
  decider: [locuteurId: string, entretienId: string, decision: 'lier' | 'refuser' | 'refuserTous', reprise?: ChoixRepriseLocuteur]
}>()
const dialogue = ref<HTMLDialogElement | null>(null)
const plusTard = ref<HTMLButtonElement | null>(null)
const selection = ref('')
const cle = (l: VueLocuteurPersonne) => JSON.stringify([l.entretienId, l.locuteurId])
const sourceCle = ref('')
const aucune = ref(false)
const choix = ref<ChoixRepriseLocuteur>({ variables: [] })
const candidat = computed(() => props.candidats.find(l => cle(l) === selection.value))
const sourcesDisponibles = computed(() => candidat.value ? props.sources.filter(l => l.entretienId !== props.sources.find(s => s.locuteurId === props.cible.id)?.entretienId && (candidat.value?.personneRef ? l.personneRef === candidat.value.personneRef : cle(l) === selection.value)) : [])
const source = computed(() => sourcesDisponibles.value.find(l => cle(l) === sourceCle.value))
watch(selection, () => {
  aucune.value = false
  sourceCle.value = sourcesDisponibles.value.length === 1 ? cle(sourcesDisponibles.value[0]) : ''
})
watch(source, () => {
  choix.value = { variables: props.variables.filter(v => source.value?.valeursLoc[v.id] && !props.cible.valeursLoc[v.id]).map(v => v.id), pseudo: !!source.value?.pseudo?.trim() && !props.cible.pseudo?.trim(), interviewer: false, remplacer: false }
})
const valeur = (l: Pick<Locuteur, 'valeursLoc'>, v: Variable) => v.modalites.find(m => m.id === l.valeursLoc[v.id])?.lib ?? l.valeursLoc[v.id] ?? 'Vide'
const donnees = computed(() => {
  if (aucune.value || !source.value) return []
  const apres = { ...props.cible, valeursLoc: { ...props.cible.valeursLoc } }
  reprendreDonneesLocuteur(apres, { ...source.value, id: source.value.locuteurId }, choix.value)
  const lignes: string[] = []
  if (apres.pseudo !== props.cible.pseudo) lignes.push(`Pseudonyme : ${apres.pseudo}`)
  for (const v of props.variables) if (apres.valeursLoc[v.id] !== props.cible.valeursLoc[v.id]) lignes.push(`${v.lib} : ${valeur(apres, v)}`)
  if (apres.interviewer !== props.cible.interviewer) lignes.push(`Interviewer : ${apres.interviewer ? 'Oui' : 'Non'}`)
  return lignes
})
function confirmer() {
  const l = source.value ?? candidat.value
  if (!l || (!aucune.value && !source.value)) return
  emit('decider', l.locuteurId, l.entretienId, 'lier', !aucune.value && donnees.value.length ? { ...choix.value, variables: [...choix.value.variables] } : undefined)
}
function refuserToutes() {
  const l = props.candidats[0]
  if (l) emit('decider', l.locuteurId, l.entretienId, 'refuserTous')
}
const retour = document.activeElement as HTMLElement | null
onMounted(async () => {
  dialogue.value?.showModal()
  await nextTick()
  plusTard.value?.focus()
})
onBeforeUnmount(() => { dialogue.value?.close(); retour?.focus() })
</script>

<template>
  <dialog ref="dialogue" aria-labelledby="titre-rapprochement-nommage" :aria-busy="occupe" @cancel.prevent="!occupe && emit('reporter')">
    <h2 id="titre-rapprochement-nommage">Une personne déjà rencontrée ?</h2>
    <p>Vous avez nommé ce locuteur <strong>« {{ nom }} »</strong>.</p>
    <p v-if="natureNomPersonne(nom) === 'role'">{{ candidats.length === 1 ? 'Un locuteur a le même rôle dans un autre entretien.' : 'Des locuteurs ont le même rôle dans d’autres entretiens.' }} Ce n’est pas nécessairement la même personne.</p>
    <p v-else>{{ candidats.length === 1 ? 'Une personne porte déjà ce nom.' : 'Des personnes portent déjà ce nom.' }}</p>
    <fieldset :disabled="occupe">
      <legend>{{ candidats.length === 1 ? 'S’il s’agit de la même personne, sélectionnez la proposition ci-dessous.' : 'S’il s’agit de l’une d’elles, sélectionnez-la ci-dessous.' }}</legend>
      <label v-for="l in candidats" :key="cle(l)">
        <input v-model="selection" type="radio" name="candidat-personne" :value="cle(l)" />
        {{ l.nom }} · {{ l.entretienTitre }}
      </label>
    </fieldset>
    <section v-if="candidat" aria-label="Données proposées pour ce locuteur">
      <p v-if="lienActuel">Ce locuteur sera rattaché à la personne sélectionnée, à la place de « {{ lienActuel }} ». Les autres entretiens ne changeront pas.</p>
      <h3>Données proposées pour ce locuteur</h3>
      <label v-if="sourcesDisponibles.length > 1">Choisir l’entretien source
        <select v-model="sourceCle" :disabled="occupe || aucune">
          <option value="">Choisir un entretien…</option>
          <option v-for="l in sourcesDisponibles" :key="cle(l)" :value="cle(l)">{{ l.entretienTitre }} · {{ l.nom }}</option>
        </select>
      </label>
      <p v-if="source && !aucune">Depuis « {{ source.entretienTitre }} ».</p>
      <ul v-if="donnees.length"><li v-for="ligne in donnees" :key="ligne">{{ ligne }}</li></ul>
      <p v-else-if="source || aucune">Aucune donnée ne sera reprise.</p>
      <p v-else>Cette personne apparaît dans plusieurs entretiens. Choisissez la source des informations à reprendre.</p>
      <template v-if="donnees.length">
        <p>Ces informations seront reprises à la confirmation. Vous pourrez les modifier ensuite.</p>
        <p v-if="!choix.remplacer">Seules les informations manquantes seront complétées. Vos données actuelles seront conservées.</p>
        <p v-else>Les données sélectionnées remplaceront les valeurs actuelles.</p>
      </template>
      <details :key="selection">
        <summary>Choisir les données à reprendre, ou ne rien reprendre…</summary>
        <fieldset :disabled="occupe">
          <legend>Données à reprendre</legend>
          <label><input v-model="aucune" type="checkbox" />Ne reprendre aucune donnée</label>
          <fieldset v-if="source" :disabled="aucune">
            <legend>Depuis {{ source.entretienTitre }}</legend>
            <label v-for="v in variables.filter(v => source?.valeursLoc[v.id])" :key="v.id">
              <input v-model="choix.variables" type="checkbox" :value="v.id" />{{ v.lib }} : {{ valeur(cible, v) }} → {{ valeur(source, v) }}
            </label>
            <label><input v-model="choix.pseudo" type="checkbox" :disabled="!source.pseudo?.trim()" />Pseudonyme : {{ cible.pseudo || 'Vide' }} → {{ source.pseudo || 'Vide' }}</label>
            <label><input v-model="choix.interviewer" type="checkbox" />Interviewer : {{ cible.interviewer ? 'Oui' : 'Non' }} → {{ source.interviewer ? 'Oui' : 'Non' }}</label>
            <label><input v-model="choix.remplacer" type="checkbox" />Remplacer les valeurs déjà renseignées pour les données sélectionnées</label>
          </fieldset>
          <p>Le statut interviewer reste inchangé sauf si vous le sélectionnez. Pour changer un statut déjà renseigné, autorisez son remplacement.</p>
          <p>Le pseudonyme repris sera confirmé pour l’affichage, sans modifier les règles d’anonymisation du texte.</p>
        </fieldset>
      </details>
    </section>
    <p v-if="message.startsWith('Rapprochement non terminé')" role="alert">{{ message }}</p>
    <div class="actions">
      <button ref="plusTard" :disabled="occupe" @click="emit('reporter')">Plus tard</button>
      <button v-if="candidat" :disabled="occupe || (!aucune && !source)" @click="confirmer">Confirmer</button>
    </div>
    <button class="secondaire" :disabled="occupe" @click="refuserToutes">{{ candidats.length === 1 ? 'Ce n’est pas cette personne' : 'Aucune de ces personnes' }}</button>
  </dialog>
</template>

<style scoped>
dialog { max-width: 620px; max-height: 85vh; overflow: auto; border: 1px solid #888; border-radius: 8px; padding: 24px; }
dialog::backdrop { background: #0006; }
label { display: block; margin: 10px 0; }
button { margin: 6px; }
.actions { display: flex; justify-content: flex-end; }
.secondaire { background: transparent; border: 0; text-decoration: underline; }
summary { cursor: pointer; }
</style>
