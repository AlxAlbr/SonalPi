<script setup lang="ts">
import { computed, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { normaliserNomCas } from '../../../shared/corpus/cas'
import type { ApercuFamilleCas } from '../../composables/corpus/useCasCorpus'

const props = defineProps<{ portee: 'locuteur' | 'entretien'; familleId?: string }>()
const emit = defineEmits<{ cree: []; annuler: [] }>()
const { variablesCas, famillesCas, listeCas, preparerFamilleCas, creerOuCompleterFamilleCas,
  creationFamilleEnAttente, abandonnerCreationFamilleCas, lectureSeule } = utiliserSonal()
const variableId = ref('')
const nom = ref('')
const inclureEnqueteurs = ref(false)
const apercu = ref<ApercuFamilleCas | null>(null)
const occupe = ref(false)
const erreur = ref<string | null>(null)
const variables = computed(() => variablesCas.value.filter((v) => v.portee === props.portee))
const famille = computed(() => props.familleId ? famillesCas.value[props.familleId] : null)
const autresFamilles = computed(() => Object.values(famillesCas.value).filter((f) => f.origine.variableId === variableId.value))
const observations = computed(() => apercu.value?.cas[0]?.projection.observationsModalite)
const invalides = computed(() => {
  if (creationFamilleEnAttente.value) return false
  if (!apercu.value) return true
  const selection = apercu.value.cas.filter((item) => item.selectionne && !item.dejaPresent)
  const noms = new Set(listeCas.value.map((cas) => normaliserNomCas(cas.nom)))
  if (!selection.length || !normaliserNomCas(apercu.value.famille.nom)) return true
  if (!apercu.value.completion && Object.values(famillesCas.value).some((f) => normaliserNomCas(f.nom) === normaliserNomCas(apercu.value!.famille.nom))) return true
  return selection.some(({ cas }) => {
    const cle = normaliserNomCas(cas.nom)
    if (!cle || noms.has(cle)) return true
    noms.add(cle)
    return false
  })
})
async function previsualiser() {
  occupe.value = true
  erreur.value = null
  try {
    apercu.value = await preparerFamilleCas({ variableId: variableId.value, nom: nom.value,
      inclureEnqueteurs: inclureEnqueteurs.value, familleId: props.familleId })
  } catch (e) { erreur.value = e instanceof Error ? e.message : String(e) }
  finally { occupe.value = false }
}
async function creer() {
  if (occupe.value || lectureSeule.value || invalides.value) return
  occupe.value = true
  erreur.value = null
  try {
    await creerOuCompleterFamilleCas(apercu.value ?? undefined)
    emit('cree')
  } catch (e) { erreur.value = e instanceof Error ? e.message : String(e) }
  finally { occupe.value = false }
}
function annuler() {
  abandonnerCreationFamilleCas()
  emit('annuler')
}
</script>

<template>
  <section class="creation-famille-cas">
    <h2>{{ familleId ? 'Compléter la famille' : 'Créer une famille' }} {{ famille?.nom }}</h2>
    <p v-if="portee === 'locuteur'">Interventions des locuteurs portant localement la modalité, même sans lien à une personne. Aucun ajout par voisinage.</p>
    <p v-else>Entretiens entiers portant la modalité : questions, réponses et futurs ajouts.</p>
    <p>La famille organise les cas, sans créer un cas supplémentaire. Les ajouts manuels restent indépendants.</p>
    <fieldset v-if="!apercu && !creationFamilleEnAttente" :disabled="occupe || lectureSeule">
      <legend>{{ familleId ? 'Critères conservés' : 'Variable de regroupement' }}</legend>
      <template v-if="!familleId">
        <label>Variable<select v-model="variableId" aria-label="Variable de regroupement">
          <option value="" disabled>Choisir une variable…</option>
          <option v-for="v in variables" :key="v.id" :value="v.id">{{ v.lib }} [{{ v.id }}]{{ v.priv ? ' — privée' : '' }}</option>
        </select></label>
        <label>Nom de la famille<input v-model="nom" placeholder="Nom de la variable par défaut" /></label>
        <label v-if="portee === 'locuteur'"><input v-model="inclureEnqueteurs" type="checkbox" /> Inclure les enquêteurs (rôle local)</label>
        <p v-if="autresFamilles.length" class="avertissement">Familles existantes : {{ autresFamilles.map((f) => f.nom).join(', ') }}. Cette opération créera une autre famille indépendante ; choisissez un nom distinct.</p>
      </template>
      <button :disabled="!familleId && !variableId" @click="previsualiser">Prévisualiser la famille</button>
    </fieldset>
    <div v-if="apercu">
      <fieldset :disabled="occupe || lectureSeule || Boolean(creationFamilleEnAttente)">
        <legend>Modalités à créer</legend>
        <label>Nom de la famille<input v-model="apercu.famille.nom" :disabled="apercu.completion" /></label>
        <p v-if="observations">{{ observations.valeursAbsentes }} valeur(s) absente(s), hors regroupement ; {{ observations.valeursInvalides }} référence(s) de valeur invalide(s) ; {{ observations.enqueteursExclus }} enquêteur(s) exclu(s).</p>
        <p v-if="observations?.sourcesIllisibles" class="avertissement">{{ observations.sourcesIllisibles }} source(s) illisible(s) : aperçu incomplet. Une modalité sans observation n’est pas certifiée vide.</p>
        <article v-for="(item, index) in apercu.cas" :key="item.cas.id" class="modalite-famille">
          <label><input v-model="item.selectionne" type="checkbox" :disabled="item.dejaPresent" /> {{ variablesCas.find((v) => v.id === apercu!.famille.origine.variableId)?.modalites.find((m) => item.cas.regles.some((r) => r.type === 'modalite' && r.modaliteId === m.id))?.lib }}</label>
          <p v-if="item.dejaPresent">Déjà présente dans cette famille — aucun doublon.</p>
          <template v-else>
            <label>Nom du cas {{ index + 1 }}<input v-model="item.cas.nom" /></label>
            <label>Mémo du cas {{ index + 1 }}<textarea v-model="item.cas.memo" rows="2"></textarea></label>
            <p>{{ item.projection.observationsModalite.membres }} membre(s) observé(s) · {{ item.projection.metriques.passagesDisponibles }} passage(s) · {{ item.projection.metriques.sourcesDistinctes }} source(s).</p>
            <p v-if="!item.projection.observationsModalite.membres">Modalité non observée dans les sources lisibles : cochez explicitement pour créer son cas.</p>
            <p v-if="item.projection.problemes" class="avertissement">{{ item.projection.problemes }} problème(s) : le résultat n’est pas entièrement vérifiable.</p>
          </template>
        </article>
        <p v-if="!apercu.cas.length">Aucune modalité déclarée. Ajoutez des modalités à la variable avant de créer une famille.</p>
      </fieldset>
      <p v-if="invalides" class="erreur">Choisissez au moins une nouvelle modalité et des noms renseignés, uniques parmi les cas et parmi les familles.</p>
      <button v-if="!creationFamilleEnAttente" :disabled="occupe" @click="apercu = null">Modifier les choix</button>
    </div>
    <p v-if="creationFamilleEnAttente" class="avertissement">Réponse non confirmée : réessayer conserve les mêmes identités. Abandonner ne supprime pas les éléments déjà enregistrés.</p>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <p v-if="occupe" role="status">Opération en cours…</p>
    <button :disabled="occupe" @click="annuler">{{ creationFamilleEnAttente ? 'Abandonner la tentative' : 'Annuler' }}</button>
    <button v-if="apercu || creationFamilleEnAttente" :disabled="occupe || lectureSeule || invalides" @click="creer">{{ creationFamilleEnAttente ? 'Réessayer la famille' : familleId ? 'Compléter la famille' : 'Créer la famille' }}</button>
  </section>
</template>

<style scoped>
.creation-famille-cas, fieldset { display: grid; gap: .6rem; }
label { display: block; margin: .3rem 0; }
.modalite-famille { padding: .5rem; border-bottom: 1px solid #ddd; }
.avertissement { padding: .5rem; background: #fff8e1; }
.erreur { color: #b3261e; }
</style>
