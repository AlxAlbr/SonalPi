<script setup lang="ts">
import { computed, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { normaliserNomCas } from '../../../shared/corpus/cas'
import type { ApercuLotCas } from '../../composables/corpus/useCasCorpus'

const props = defineProps<{ type: 'personnes' | 'entretiens' }>()
const emit = defineEmits<{ cree: []; annuler: [] }>()
const {
  inventairePersonnesCas, entretiensCas, listeCas, lectureSeule,
  preparerLotCas, creerLotCas, creationCasEnAttente, abandonnerCreationCas,
} = utiliserSonal()
const ids = ref<string[]>([])
const recherche = ref('')
const regroupement = ref<'collectif' | 'individuel'>('individuel')
const inclureEnqueteurs = ref(false)
const apercu = ref<ApercuLotCas[] | null>(null)
const occupe = ref(false)
const erreur = ref<string | null>(null)

const candidats = computed(() => props.type === 'personnes'
  ? inventairePersonnesCas.value?.personnes ?? []
  : entretiensCas.value)
const visibles = computed(() => candidats.value.filter((candidat) =>
  candidat.nom.toLocaleLowerCase('fr').includes(recherche.value.trim().toLocaleLowerCase('fr'))))
const nomsInvalides = computed(() => {
  if (creationCasEnAttente.value) return false
  const noms = new Set(listeCas.value.map((cas) => normaliserNomCas(cas.nom)))
  return (apercu.value ?? []).some(({ cas }) => {
    const nom = normaliserNomCas(cas.nom)
    if (!nom || noms.has(nom)) return true
    noms.add(nom)
    return false
  })
})

async function previsualiser() {
  if (occupe.value || lectureSeule.value) return
  erreur.value = null
  occupe.value = true
  try {
    apercu.value = await preparerLotCas(props.type === 'personnes'
      ? { type: 'personnes', ids: [...ids.value], inclureEnqueteurs: inclureEnqueteurs.value }
      : { type: 'entretiens', ids: [...ids.value] }, regroupement.value)
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    occupe.value = false
  }
}

async function creer() {
  if (occupe.value || lectureSeule.value || nomsInvalides.value) return
  erreur.value = null
  occupe.value = true
  try {
    await creerLotCas(apercu.value?.map((item) => item.cas))
    emit('cree')
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    occupe.value = false
  }
}

function annuler() {
  if (occupe.value) return
  abandonnerCreationCas()
  emit('annuler')
}
</script>

<template>
  <section class="creation-lot-cas">
    <h2>{{ type === 'personnes' ? 'Créer depuis des personnes' : 'Créer depuis des entretiens' }}</h2>
    <p v-if="type === 'personnes'">Les règles réuniront les interventions des personnes choisies, sans fusionner leurs identités.</p>
    <p v-else>Les règles incluront les entretiens entiers : questions, réponses et futurs ajouts au texte.</p>
    <p>Chaque cas pourra aussi recevoir des passages ajoutés manuellement.</p>

    <fieldset v-if="!apercu && !creationCasEnAttente" :disabled="occupe || lectureSeule">
      <legend>{{ type === 'personnes' ? 'Personnes à inclure' : 'Entretiens à inclure' }}</legend>
      <input v-model="recherche" type="search" aria-label="Rechercher une source de cas" placeholder="Rechercher…" />
      <div class="actions-selection">
        <button type="button" @click="ids = candidats.map((candidat) => candidat.id)">Tout sélectionner</button>
        <button type="button" @click="ids = []">Tout désélectionner</button>
        <span>{{ ids.length }} sélectionné(s) sur {{ candidats.length }}</span>
      </div>
      <div class="sources-lot">
        <label v-for="candidat in visibles" :key="candidat.id" class="source-lot">
          <input v-model="ids" type="checkbox" :value="candidat.id" />
          <span>{{ candidat.nom }} <small>{{ candidat.id }}</small></span>
        </label>
        <p v-if="!visibles.length">Aucune source correspondante.</p>
      </div>
      <label><input v-model="regroupement" type="radio" value="individuel" /> {{ type === 'personnes' ? 'Un cas par personne' : 'Un cas par entretien' }}</label>
      <label><input v-model="regroupement" type="radio" value="collectif" /> Un cas collectif</label>
      <label v-if="type === 'personnes'">
        <input v-model="inclureEnqueteurs" type="checkbox" /> Inclure les interventions où le locuteur est enquêteur
      </label>
      <button class="primaire" :disabled="!ids.length" @click="previsualiser">Prévisualiser les cas</button>
    </fieldset>

    <div v-if="apercu" class="apercu-lot">
      <h3>{{ apercu.length }} cas à créer</h3>
      <p>Vérifiez les noms et les matériaux avant de confirmer. Les noms homonymes sont distingués, pas fusionnés.</p>
      <fieldset :disabled="occupe || lectureSeule || Boolean(creationCasEnAttente)">
        <article v-for="(item, index) in apercu" :key="item.cas.id" class="apercu-cas">
          <label>Nom du cas {{ index + 1 }}<input v-model="item.cas.nom" required /></label>
          <label>Mémo du cas {{ index + 1 }}<textarea v-model="item.cas.memo" rows="2"></textarea></label>
          <p>{{ item.membres }} {{ type === 'personnes' ? 'personne(s)' : 'entretien(s)' }} sélectionné(s) · {{ item.sources }} source(s) · {{ item.passages }} passage(s) de texte</p>
          <p v-if="type === 'personnes'">
            Enquêteurs {{ inclureEnqueteurs ? 'inclus' : 'exclus' }} ; {{ item.enqueteursExclus }} participation(s) locale(s) exclue(s).
          </p>
          <p v-if="!item.passages && !item.problemes">La règle ne produit actuellement aucun texte ; le cas sera néanmoins créé.</p>
          <p v-if="item.casExistants.length" class="avertissement">Cas utilisant déjà ces critères : {{ item.casExistants.join(', ') }}. La création ajoutera un dossier distinct.</p>
          <div v-if="item.problemes" class="avertissement">
            <p>⚠ {{ item.problemes }} problème(s) : aperçu incomplet. Créer conserve la règle, pas une garantie de sources disponibles.</p>
            <ul><li v-for="(diagnostic, numero) in item.diagnostics" :key="numero">{{ diagnostic }}</li></ul>
          </div>
        </article>
      </fieldset>
      <p v-if="nomsInvalides" class="erreur">Chaque nom doit être renseigné et unique dans le lot et dans le corpus.</p>
      <button v-if="!creationCasEnAttente" :disabled="occupe" @click="apercu = null; erreur = null">Modifier la sélection</button>
    </div>

    <p v-if="creationCasEnAttente" class="avertissement">
      La création reste à confirmer. Réessayer conserve les mêmes identifiants pour éviter les doublons.
      Abandonner la tentative ne supprime pas les cas éventuellement déjà enregistrés.
    </p>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
    <p v-if="occupe" role="status">Opération en cours…</p>
    <div class="actions-lot">
      <button :disabled="occupe" @click="annuler">{{ creationCasEnAttente ? 'Abandonner la tentative' : 'Annuler' }}</button>
      <button v-if="apercu || creationCasEnAttente" class="primaire" :disabled="occupe || lectureSeule || nomsInvalides" @click="creer">
        {{ creationCasEnAttente ? 'Réessayer la création' : 'Créer les cas' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.creation-lot-cas { display: grid; gap: .7rem; }
h2, h3, p { margin: .3rem 0; }
fieldset { display: grid; gap: .6rem; border: 1px solid #ddd; border-radius: 6px; min-width: 0; }
.sources-lot { max-height: 15rem; overflow: auto; }
.source-lot { display: flex; align-items: baseline; gap: .4rem; padding: .3rem; }
small { display: block; color: #777; font-size: .7rem; }
.apercu-cas { padding: .5rem; border-bottom: 1px solid #ddd; }
.apercu-cas label { display: grid; gap: .25rem; margin: .4rem 0; }
input:not([type=checkbox]):not([type=radio]), textarea { width: 100%; box-sizing: border-box; }
.actions-selection, .actions-lot { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
.actions-lot { justify-content: flex-end; }
.avertissement { padding: .5rem; background: #fff8e1; border-left: 4px solid #e0a03a; font-size: .85rem; }
.erreur { color: #b3261e; }
button, input, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.primaire { background: #2e73d8; color: white; border: 1px solid #1565c0; }
</style>
