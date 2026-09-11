<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { VueLocuteurPersonne } from '../../../shared/corpus/personnes'
import type { Locuteur } from '../../../shared/format'
import { analyserRapprochementPersonne, type ChoixRepriseLocuteur, natureNomPersonne } from '../../../shared/corpus/rapprochementsPersonnes'

const props = defineProps<{ nom: string; lienActuel: string; cible: Locuteur; sources: VueLocuteurPersonne[]; candidats: VueLocuteurPersonne[]; occupe: boolean; message: string }>()
const emit = defineEmits<{
  reporter: []
  decider: [locuteurId: string, entretienId: string, decision: 'lier' | 'refuser' | 'refuserTous', reprise?: ChoixRepriseLocuteur]
}>()
const dialogue = ref<HTMLDialogElement | null>(null)
const plusTard = ref<HTMLButtonElement | null>(null)
const selection = ref('')
const cle = (l: VueLocuteurPersonne) => JSON.stringify([l.entretienId, l.locuteurId])
const sourceCle = ref('')
const reprendreInformations = ref(true)
const candidat = computed(() => props.candidats.find(l => cle(l) === selection.value))
const membresCandidat = (l: VueLocuteurPersonne) => l.personneRef
  ? props.sources.filter((source) => source.personneRef === l.personneRef)
  : [l]
const entretiensCandidat = (l: VueLocuteurPersonne) => [...new Set(membresCandidat(l).map((membre) => membre.entretienTitre))]
const contientNomProche = computed(() => props.candidats.some((l) => {
  const raison = analyserRapprochementPersonne(props.nom, l.nom)?.raison
  return raison === 'une-lettre' || raison === 'memes-mots'
}))
const sourcesDisponibles = computed(() => candidat.value ? props.sources.filter(l => l.entretienId !== props.sources.find(s => s.locuteurId === props.cible.id)?.entretienId && (candidat.value?.personneRef ? l.personneRef === candidat.value.personneRef : cle(l) === selection.value)) : [])
const signatureInformations = (l: VueLocuteurPersonne) => JSON.stringify([l.pseudo?.trim() ?? '', l.interviewer])
const informationsSourcesDifferentes = computed(() => new Set(sourcesDisponibles.value.map(signatureInformations)).size > 1)
const source = computed(() => sourcesDisponibles.value.find(l => cle(l) === sourceCle.value))
const pseudoAffiche = (l: VueLocuteurPersonne) => l.pseudo?.trim() || 'non renseigné'
const statutAffiche = (l: VueLocuteurPersonne) => l.interviewer ? 'interviewer' : 'interviewé·e'
watch(selection, () => {
  reprendreInformations.value = true
  sourceCle.value = sourcesDisponibles.value.length && !informationsSourcesDifferentes.value
    ? cle(sourcesDisponibles.value[0])
    : ''
})
function confirmer() {
  const l = source.value ?? candidat.value
  if (!l || (reprendreInformations.value && !source.value)) return
  const reprise: ChoixRepriseLocuteur | undefined = reprendreInformations.value
    ? { pseudo: true, interviewer: true, variables: [], remplacer: false }
    : undefined
  emit('decider', l.locuteurId, l.entretienId, 'lier', reprise)
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
    <p v-else-if="contientNomProche">Une ou plusieurs graphies proches ont été trouvées. Vérifiez les noms et les entretiens avant de décider.</p>
    <p v-else>{{ candidats.length === 1 ? 'Une personne porte déjà ce nom.' : 'Des personnes portent déjà ce nom.' }}</p>
    <fieldset :disabled="occupe">
      <legend>{{ candidats.length === 1 ? 'S’il s’agit de la même personne, sélectionnez la proposition ci-dessous.' : 'S’il s’agit de l’une d’elles, sélectionnez-la ci-dessous.' }}</legend>
      <label v-for="l in candidats" :key="cle(l)" class="proposition-personne">
        <input v-model="selection" type="radio" name="candidat-personne" :value="cle(l)" />
        <span class="details-proposition">
          <span><strong>{{ l.nom }}</strong> · {{ analyserRapprochementPersonne(nom, l.nom)?.libelle }}</span>
          <small v-if="membresCandidat(l).length > 1">
            Identité déjà reliée à {{ entretiensCandidat(l).length }} entretien{{ entretiensCandidat(l).length > 1 ? 's' : '' }} : {{ entretiensCandidat(l).join(', ') }}.
          </small>
          <small v-else>Entretien : {{ l.entretienTitre }}.</small>
        </span>
      </label>
    </fieldset>
    <section v-if="candidat" aria-label="Informations à reprendre">
      <p v-if="lienActuel">Ce locuteur sera rattaché à la personne sélectionnée, à la place de « {{ lienActuel }} ». Les autres entretiens ne changeront pas.</p>
      <label>
        <input v-model="reprendreInformations" type="checkbox" :disabled="occupe" />
        Reprendre les informations disponibles de ce locuteur : pseudonyme et statut (interviewer/interviewé·e).
      </label>
      <p v-if="reprendreInformations && sourcesDisponibles.length > 1 && !informationsSourcesDifferentes">
        Les informations disponibles sont identiques dans ces entretiens : pseudonyme « {{ pseudoAffiche(sourcesDisponibles[0]) }} » et statut {{ statutAffiche(sourcesDisponibles[0]) }}.
      </p>
      <fieldset v-if="reprendreInformations && sourcesDisponibles.length > 1 && informationsSourcesDifferentes" class="choix-source" :disabled="occupe">
        <legend>Les informations diffèrent selon l’entretien. Choisissez celles à reprendre.</legend>
        <label v-for="l in sourcesDisponibles" :key="cle(l)">
          <input v-model="sourceCle" type="radio" name="source-informations" :value="cle(l)" />
          <span><strong>{{ l.entretienTitre }}</strong> · pseudonyme « {{ pseudoAffiche(l) }} » · statut {{ statutAffiche(l) }}</span>
        </label>
      </fieldset>
      <p v-if="reprendreInformations && informationsSourcesDifferentes && !source">Choisissez une source pour continuer.</p>
    </section>
    <p v-if="message.startsWith('Rapprochement non terminé')" role="alert">{{ message }}</p>
    <div class="actions">
      <button ref="plusTard" :disabled="occupe" @click="emit('reporter')">Plus tard</button>
      <button v-if="candidat" :disabled="occupe || (reprendreInformations && !source)" @click="confirmer">Confirmer</button>
    </div>
    <button class="secondaire" :disabled="occupe" @click="refuserToutes">{{ candidats.length === 1 ? 'Ce n’est pas cette personne' : 'Aucune de ces personnes' }}</button>
  </dialog>
</template>

<style scoped>
dialog { max-width: 620px; max-height: 85vh; overflow: auto; border: 1px solid #888; border-radius: 8px; padding: 24px; }
dialog::backdrop { background: #0006; }
label { display: block; margin: 10px 0; }
.proposition-personne { display: flex; align-items: flex-start; gap: 8px; }
.proposition-personne input { margin-top: 3px; }
.details-proposition { display: grid; gap: 3px; }
.details-proposition small { color: #52606d; }
.choix-source { margin-top: 12px; }
.choix-source label { display: flex; align-items: flex-start; gap: 8px; }
.choix-source input { margin-top: 3px; }
button { margin: 6px; }
.actions { display: flex; justify-content: flex-end; }
.secondaire { background: transparent; border: 0; text-decoration: underline; }
</style>
