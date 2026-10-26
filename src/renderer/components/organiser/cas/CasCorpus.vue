<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { membresPersonnesRegle, type RegleCas, type RattachementCas } from '../../../../shared/corpus/cas'
import type { PassageCasProjete } from '../../../editor/cas'
import type { ApercuPersonneCas } from '../../../composables/corpus/useCasCorpus'
import CreationLotCas from './CreationLotCas.vue'
import CreationFamilleCas from './CreationFamilleCas.vue'
import AttributsCasFiche from './AttributsCasFiche.vue'
import AttributsFamilleFiche from './AttributsFamilleFiche.vue'
import DefinitionsAttributsCas from './DefinitionsAttributsCas.vue'

const {
  famillesCas, variablesCas, creationFamilleEnAttente, dissoudreFamilleCas, enregistrerContextePanneau,
  listeCas,
  casOuvert,
  casOuvertId,
  projectionCas,
  projectionsCas,
  inventairePersonnesCas,
  entretiensCas,
  modeTexteCas,
  modeMateriauxCas,
  vueMateriauxCas,
  chargementCas,
  messageCas,
  etatSauvegardeCas,
  creationCasEnAttente,
  ouvrirCas,
  actualiserCas,
  previsualiserPersonne,
  creerCasVide,
  creerCasDepuisPersonne,
  renommerCas,
  modifierMemoCas,
  supprimerCas,
  retirerRattachementCas,
  changerModeTexteCas,
  voirPassageCas,
  lectureSeule,
} = utiliserSonal()

const recherche = ref('')
const creationOuverte = ref(false)
const registreAttributsOuvert = ref(false)
const familleFicheId = ref<string | null>(null)
const modeCreation = ref<'personne' | 'vide' | 'personnes' | 'entretiens' | 'variable-locuteur' | 'variable-entretien'>('personne')
const familleCompletionId = ref<string | undefined>()
const filtreFamille = ref('')
const creationEnCours = ref(false)
const personneId = ref('')
const nomNouveau = ref('')
const memoNouveau = ref('')
const inclureEnqueteurs = ref(false)
const apercu = ref<ApercuPersonneCas | null>(null)
const chargementApercu = ref(false)
const erreurCreation = ref<string | null>(null)
const nomBrouillon = ref('')
const memoBrouillon = ref('')
let generationApercu = 0
onBeforeUnmount(enregistrerContextePanneau('organiser-cas', () => {
  const etat = { recherche: recherche.value, famille: filtreFamille.value }
  return () => { recherche.value = etat.recherche; filtreFamille.value = etat.famille }
}))

const personnes = computed(() => inventairePersonnesCas.value?.personnes ?? [])
const casFiltres = computed(() => {
  const cle = recherche.value.trim().toLocaleLowerCase('fr')
  const candidats = listeCas.value.filter((cas) => !filtreFamille.value || cas.familleId === filtreFamille.value)
  return cle
    ? candidats.filter((courant) =>
      courant.nom.toLocaleLowerCase('fr').includes(cle)
      || courant.memo.toLocaleLowerCase('fr').includes(cle))
    : candidats
})

const groupesPassages = computed(() => {
  const groupes = new Map<string, PassageCasProjete[]>()
  for (const passage of vueMateriauxCas.value?.passages ?? []) {
    const entretienId = passage.origine.type === 'manuel'
      ? passage.origine.source.entretienId
      : passage.origine.entretienId
    const passages = groupes.get(entretienId) ?? []
    passages.push(passage)
    groupes.set(entretienId, passages)
  }
  return [...groupes].map(([entretienId, passages]) => ({
    entretienId, titre: passages[0].titreEntretien, passages,
  }))
})

function libelleRegle(regle: RegleCas): string {
  if (regle.type === 'modalite') {
    const variable = variablesCas.value.find((v) => v.id === regle.variableId)
    return `${variable?.lib ?? 'Variable absente'} [${regle.variableId}] = ${variable?.modalites.find((m) => m.id === regle.modaliteId)?.lib ?? 'Modalité absente'} [${regle.modaliteId}] — ${regle.portee}${regle.portee === 'locuteur' ? ` ; enquêteurs ${regle.inclureEnqueteurs ? 'inclus' : 'exclus'}` : ' ; sources entières'}`
  }
  if (regle.type === 'entretiens') {
    return `Entretiens entiers : ${regle.entretienIds.map((id) => `${entretiensCas.value.find((source) => source.id === id)?.nom ?? 'Source retirée'} [${id}]`).join(', ')}`
  }
  return membresPersonnesRegle(regle).map((membre) => {
    const nom = personnes.value.find((personne) => personne.id === membre.personneId)?.nom ?? 'Personne absente'
    return `${nom} [${membre.personneId}] — enquêteurs ${membre.inclureEnqueteurs ? 'inclus' : 'exclus'}`
  }).join(' ; ')
}

const messageVide = computed(() => {
  if (vueMateriauxCas.value?.problemes) return 'Les matériaux de cette vue ne peuvent pas être entièrement résolus.'
  if (modeMateriauxCas.value === 'regles') return 'Aucun passage issu des règles dans cette vue.'
  if (modeMateriauxCas.value === 'manuels') return 'Aucun ajout manuel dans ce cas.'
  return 'Ce cas ne contient actuellement aucun passage.'
})

watch(casOuvert, (courant) => {
  nomBrouillon.value = courant?.nom ?? ''
  memoBrouillon.value = courant?.memo ?? ''
}, { immediate: true })

watch(personneId, (id) => {
  const personne = personnes.value.find((candidate) => candidate.id === id)
  nomNouveau.value = personne?.nom ?? ''
})

watch([personneId, inclureEnqueteurs, modeCreation], async ([id, inclure, mode]) => {
  const maGeneration = ++generationApercu
  apercu.value = null
  erreurCreation.value = null
  if (!id || mode !== 'personne') {
    chargementApercu.value = false
    return
  }
  chargementApercu.value = true
  try {
    const resultat = await previsualiserPersonne(id, inclure)
    if (generationApercu === maGeneration) apercu.value = resultat
  } catch (erreur) {
    if (generationApercu === maGeneration) {
      erreurCreation.value = erreur instanceof Error ? erreur.message : String(erreur)
    }
  } finally {
    if (generationApercu === maGeneration) chargementApercu.value = false
  }
})

function commencerCreation() {
  registreAttributsOuvert.value = false
  familleFicheId.value = null
  familleCompletionId.value = undefined
  creationOuverte.value = true
  modeCreation.value = creationCasEnAttente.value
    ? creationCasEnAttente.value.cas[0].regles[0]?.type === 'entretiens' ? 'entretiens' : 'personnes'
    : 'personne'
  if (creationFamilleEnAttente.value) {
    const commande = creationFamilleEnAttente.value
    modeCreation.value = commande.famille.origine.portee === 'locuteur' ? 'variable-locuteur' : 'variable-entretien'
    familleCompletionId.value = commande.type === 'completer-famille' ? commande.famille.id : undefined
  }
  personneId.value = ''
  nomNouveau.value = ''
  memoNouveau.value = ''
  inclureEnqueteurs.value = false
  apercu.value = null
  erreurCreation.value = null
  casOuvertId.value = null
}

function ouvrirRegistreAttributs() {
  creationOuverte.value = false
  familleFicheId.value = null
  casOuvertId.value = null
  registreAttributsOuvert.value = true
}

function ouvrirFicheFamille(id: string) {
  creationOuverte.value = false
  registreAttributsOuvert.value = false
  casOuvertId.value = null
  familleFicheId.value = id
}

function completerFamille(id: string) {
  if (creationFamilleEnAttente.value) { commencerCreation(); return }
  const famille = famillesCas.value[id]
  if (!famille) return
  familleCompletionId.value = id
  modeCreation.value = famille.origine.portee === 'locuteur' ? 'variable-locuteur' : 'variable-entretien'
  creationOuverte.value = true
  casOuvertId.value = null
}

async function dissoudreFamille(id: string) {
  const famille = famillesCas.value[id]
  if (!famille || lectureSeule.value) return
  const membres = listeCas.value.filter((cas) => cas.familleId === id).map((cas) => cas.id)
  if (!confirm(`Dissoudre « ${famille.nom} » ? Les ${membres.length} cas, leurs règles et ajouts manuels seront conservés. Les règles resteront actives et protégeront les variables et modalités utilisées.`)) return
  await tenter(() => dissoudreFamilleCas(famille, membres))
  if (!famillesCas.value[id]) {
    filtreFamille.value = ''
    familleFicheId.value = null
  }
}

function annulerCreation() {
  creationOuverte.value = false
  erreurCreation.value = null
}

async function tenter(action: () => Promise<unknown>) {
  try {
    await action()
  } catch {
    // Le composable conserve le message affichable et les brouillons restent visibles.
  }
}

async function creer() {
  if (creationEnCours.value || lectureSeule.value) return
  erreurCreation.value = null
  creationEnCours.value = true
  try {
    if (modeCreation.value === 'vide') {
      await creerCasVide({ nom: nomNouveau.value, memo: memoNouveau.value })
    } else {
      await creerCasDepuisPersonne({
        personneId: personneId.value,
        nom: nomNouveau.value,
        memo: memoNouveau.value,
        inclureEnqueteurs: inclureEnqueteurs.value,
      })
    }
    creationOuverte.value = false
  } catch (erreur) {
    erreurCreation.value = erreur instanceof Error ? erreur.message : String(erreur)
  } finally {
    creationEnCours.value = false
  }
}

async function enregistrerNom() {
  if (!casOuvert.value || nomBrouillon.value === casOuvert.value.nom) return
  await tenter(() => renommerCas(nomBrouillon.value))
}

async function enregistrerMemo() {
  if (!casOuvert.value || memoBrouillon.value === casOuvert.value.memo) return
  await tenter(() => modifierMemoCas(memoBrouillon.value))
}

async function confirmerSuppression() {
  if (!casOuvert.value || !window.confirm(`Supprimer le cas « ${casOuvert.value.nom} » ? Ses sources resteront intactes.`)) return
  await tenter(supprimerCas)
}

function rattachementDe(passage: PassageCasProjete): RattachementCas | null {
  if (passage.origine.type !== 'manuel') return null
  const rattachementId = passage.origine.rattachementId
  return casOuvert.value?.rattachements.find((rattachement) =>
    rattachement.id === rattachementId) ?? null
}

async function retirer(passage: PassageCasProjete) {
  const rattachement = rattachementDe(passage)
  if (rattachement) await tenter(() => retirerRattachementCas(rattachement))
}

function clePassage(passage: PassageCasProjete, index: number): string {
  const origine = passage.origine
  if (origine.type === 'manuel') return origine.rattachementId
  if (origine.type === 'regle-modalite') return `modalite-${origine.entretienId}-${origine.modaliteId}-${index}`
  if (origine.type === 'regle-entretien') return `entretien-${origine.entretienId}-${index}`
  return `${origine.personneId}-${origine.entretienId}-${origine.locuteurIndex}-${index}`
}
</script>

<template>
  <section class="cas-corpus">
    <aside class="repertoire-cas">
      <div class="tete-repertoire">
        <h2>Cas</h2>
        <span class="actions-repertoire">
          <button :disabled="lectureSeule" @click="ouvrirRegistreAttributs">Attributs</button>
          <button :disabled="lectureSeule" @click="commencerCreation">Nouveau cas</button>
        </span>
      </div>
      <input v-model="recherche" class="recherche" type="search" placeholder="Rechercher un cas" aria-label="Rechercher un cas" />
      <label>Famille<select v-model="filtreFamille" aria-label="Filtrer les familles"><option value="">Toutes les familles et cas</option><option v-for="f in famillesCas" :key="f.id" :value="f.id">{{ f.nom }}</option></select></label>
      <div v-if="filtreFamille && famillesCas[filtreFamille]" class="fiche-famille">
        <b>{{ famillesCas[filtreFamille].nom }}</b>
        <p>{{ variablesCas.find((v) => v.id === famillesCas[filtreFamille].origine.variableId)?.lib ?? 'Variable absente' }} — {{ famillesCas[filtreFamille].origine.portee }}</p>
        <p>{{ listeCas.filter((cas) => cas.familleId === filtreFamille).length }} cas ; nouvelles modalités ajoutées uniquement sur demande.</p>
        <button :disabled="lectureSeule" @click="completerFamille(filtreFamille)">Compléter la famille</button>
        <button :disabled="lectureSeule" @click="dissoudreFamille(filtreFamille)">Dissoudre la famille</button>
        <button @click="ouvrirFicheFamille(filtreFamille)">Attributs de la famille</button>
      </div>
      <p v-if="!listeCas.length" class="vide">Aucun cas. Créez un cas manuel vide ou un cas depuis une personne.</p>
      <p v-else-if="!casFiltres.length" class="vide">Aucun cas ne correspond à cette recherche.</p>
      <button
        v-for="courant in casFiltres"
        :key="courant.id"
        class="carte-cas"
        :class="{ actif: casOuvertId === courant.id }"
        @click="creationOuverte = false; registreAttributsOuvert = false; familleFicheId = null; ouvrirCas(courant.id)"
      >
        <span class="nom-carte"><b>{{ courant.nom }}</b><em v-if="projectionsCas[courant.id]?.problemes">⚠ {{ projectionsCas[courant.id].problemes }}</em></span>
        <span>{{ projectionsCas[courant.id]?.metriques.passagesDisponibles ?? '…' }} passage(s)</span>
        <small v-if="courant.familleId">Famille : {{ famillesCas[courant.familleId]?.nom ?? 'Famille absente' }}</small>
        <small>{{ courant.regles.length ? 'Avec règle' : 'Manuel' }} · {{ courant.rattachements.length }} ajout(s) manuel(s)</small>
      </button>
    </aside>

    <main class="fiche-cas">
      <p v-if="messageCas" class="erreur">{{ messageCas }}</p>

      <section v-if="creationOuverte" class="creation-cas">
        <fieldset class="choix-creation" :disabled="creationEnCours || lectureSeule || Boolean(creationCasEnAttente) || Boolean(creationFamilleEnAttente) || Boolean(familleCompletionId)">
          <legend>Créer un cas</legend>
          <label class="case-cocher"><input v-model="modeCreation" type="radio" value="vide" /> Cas manuel vide</label>
          <label class="case-cocher"><input v-model="modeCreation" type="radio" value="personne" /> Depuis une personne</label>
          <label class="case-cocher"><input v-model="modeCreation" type="radio" value="personnes" /> Plusieurs personnes</label>
          <label class="case-cocher"><input v-model="modeCreation" type="radio" value="entretiens" /> Depuis des entretiens</label>
          <label class="case-cocher"><input v-model="modeCreation" type="radio" value="variable-locuteur" /> Variable de locuteur</label>
          <label class="case-cocher"><input v-model="modeCreation" type="radio" value="variable-entretien" /> Variable d’entretien</label>
        </fieldset>
        <CreationFamilleCas
          v-if="modeCreation === 'variable-locuteur' || modeCreation === 'variable-entretien'"
          :key="`${modeCreation}-${familleCompletionId ?? ''}`" :portee="modeCreation === 'variable-locuteur' ? 'locuteur' : 'entretien'" :famille-id="familleCompletionId"
          @cree="creationOuverte = false" @annuler="annulerCreation"
        />
        <CreationLotCas
          v-else-if="modeCreation === 'personnes' || modeCreation === 'entretiens'"
          :key="modeCreation" :type="modeCreation"
          @cree="creationOuverte = false" @annuler="annulerCreation"
        />
        <template v-else>
          <header>
            <div>
              <h2>{{ modeCreation === 'vide' ? 'Créer un cas manuel vide' : 'Créer depuis une personne' }}</h2>
              <p v-if="modeCreation === 'vide'">Vous pourrez ajouter des passages depuis les entretiens après la création.</p>
              <p v-else>Le cas réunira dynamiquement les interventions de cette personne. Vous pourrez aussi ajouter des passages manuellement.</p>
            </div>
            <button :disabled="creationEnCours" @click="annulerCreation">Annuler</button>
          </header>
          <p v-if="modeCreation === 'personne' && !personnes.length" class="vide">Aucune personne n’est disponible. Créez d’abord une personne dans le répertoire Personnes, ou choisissez un cas manuel vide.</p>
          <form v-else @submit.prevent="creer">
            <fieldset class="champs-creation" :disabled="creationEnCours || lectureSeule">
              <label v-if="modeCreation === 'personne'">
                Personne *
                <select v-model="personneId" required>
                  <option value="" disabled>Choisir une personne…</option>
                  <option v-for="personne in personnes" :key="personne.id" :value="personne.id">{{ personne.nom }}</option>
                </select>
              </label>
              <label>
                Nom du cas *
                <input v-model="nomNouveau" required placeholder="Nom du cas" />
              </label>
              <label v-if="modeCreation === 'personne'" class="case-cocher">
                <input v-model="inclureEnqueteurs" type="checkbox" />
                Inclure les interventions où le locuteur est enquêteur.
              </label>
              <div v-if="modeCreation === 'personne'" class="apercu">
                <span v-if="chargementApercu">Calcul de l’aperçu…</span>
                <template v-else-if="apercu">
                  <b>Aperçu :</b> {{ apercu.entretiens }} entretien(s) · {{ apercu.passages }} intervention(s)
                  <span v-if="apercu.sourcesIndisponibles"> · ⚠ {{ apercu.sourcesIndisponibles }} source(s) indisponible(s)</span>
              </template>
              <span v-else>Choisissez une personne pour afficher ses matériaux.</span>
            </div>
            <label>
              Mémo — facultatif
              <textarea v-model="memoNouveau" rows="5" placeholder="Mémo du cas"></textarea>
            </label>
            <p v-if="erreurCreation" class="erreur">{{ erreurCreation }}</p>
            <div class="actions-creation">
              <button type="button" @click="annulerCreation">Annuler</button>
              <button class="primaire" :disabled="!nomNouveau.trim() || (modeCreation === 'personne' && (!personneId || chargementApercu))">{{ creationEnCours ? 'Création…' : 'Créer le cas' }}</button>
            </div>
          </fieldset>
        </form>
        </template>
      </section>

      <DefinitionsAttributsCas
        v-else-if="registreAttributsOuvert"
        @fermer="registreAttributsOuvert = false"
      />
      <AttributsFamilleFiche
        v-else-if="familleFicheId"
        :famille-id="familleFicheId"
        @fermer="familleFicheId = null"
      />

      <p v-else-if="!casOuvert" class="vide grande">Créez ou ouvrez un cas.</p>

      <template v-else>
        <p v-if="casOuvert.familleId">Famille : {{ famillesCas[casOuvert.familleId]?.nom ?? 'Famille absente' }}</p>
        <p v-if="casOuvert.regles.some((r) => r.type === 'modalite') && projectionCas">
          {{ projectionCas.observationsModalite.membres }} membre(s) observé(s) ; {{ projectionCas.observationsModalite.valeursAbsentes }} valeur(s) absente(s), hors regroupement ; {{ projectionCas.observationsModalite.enqueteursExclus }} enquêteur(s) exclu(s).
        </p>
        <header class="barre-cas">
          <span class="etat-enregistrement" :class="etatSauvegardeCas">{{ etatSauvegardeCas }}</span>
          <input
            v-model="nomBrouillon"
            class="nom-cas"
            :disabled="lectureSeule"
            aria-label="Nom du cas"
            @change="enregistrerNom"
          />
          <select
            :value="modeTexteCas"
            aria-label="Mode du texte des cas"
            @change="changerModeTexteCas(($event.target as HTMLSelectElement).value as 'pseudonymise' | 'original')"
          >
            <option value="pseudonymise">Pseudonymisé</option>
            <option value="original">Original</option>
          </select>
          <button :disabled="chargementCas" @click="actualiserCas">{{ chargementCas ? '…' : '⟳ Actualiser' }}</button>
          <button class="danger" :disabled="lectureSeule" @click="confirmerSuppression">Supprimer</button>
        </header>

        <p v-if="modeTexteCas === 'original'" class="avertissement">
          Les transcriptions et les noms de locuteurs originaux sont affichés. Le nom et le mémo du cas peuvent aussi être identifiants.
        </p>
        <p v-else class="avertissement">
          Les extraits et locuteurs sont pseudonymisés. Le nom et le mémo du cas ne le sont pas automatiquement.
        </p>

        <p class="mode-cas"><b>{{ casOuvert.regles.length ? 'Avec règle' : 'Manuel' }}</b> · {{ casOuvert.rattachements.length }} ajout(s) manuel(s)</p>
        <p v-if="casOuvert.regles.length" class="aide-regle">Retirer un ajout manuel ne retire pas les passages toujours issus des règles.</p>

        <label class="memo-cas">
          Mémo
          <textarea
            v-model="memoBrouillon"
            :disabled="lectureSeule"
            rows="4"
            placeholder="Mémo du cas"
            @change="enregistrerMemo"
          ></textarea>
        </label>

        <AttributsCasFiche />

        <label class="filtre-materiaux">
          Matériaux affichés
          <select v-model="modeMateriauxCas">
            <option value="tous">Tous les matériaux</option>
            <option value="regles">Passages issus des règles</option>
            <option value="manuels">Ajouts manuels</option>
          </select>
        </label>
        <details v-if="casOuvert.regles.length" class="criteres-cas">
          <summary>Critères automatiques</summary>
          <ul><li v-for="(regle, index) in casOuvert.regles" :key="index">{{ libelleRegle(regle) }}</li></ul>
        </details>
        <div v-if="vueMateriauxCas" class="metriques" aria-label="Métriques des matériaux affichés">
          <span><b>{{ vueMateriauxCas.metriques.rattachementsManuels }}</b> rattachement(s)</span>
          <span><b>{{ vueMateriauxCas.metriques.passagesDisponibles }}</b> passage(s)</span>
          <span><b>{{ vueMateriauxCas.metriques.sourcesDistinctes }}</b> source(s)</span>
          <span><b>{{ vueMateriauxCas.metriques.motsSansDoubleCompte }}</b> mot(s) sans double compte</span>
          <span v-if="vueMateriauxCas.problemes" class="probleme"><b>⚠ {{ vueMateriauxCas.problemes }}</b> problème(s) dans cette vue</span>
        </div>
        <p v-if="projectionCas && vueMateriauxCas && projectionCas.problemes > vueMateriauxCas.problemes" class="avertissement problemes-hors-vue">
          {{ projectionCas.problemes - vueMateriauxCas.problemes }} problème(s) dans les autres matériaux du cas.
          <button @click="modeMateriauxCas = 'tous'">Voir tous les matériaux</button>
        </p>
        <p v-if="vueMateriauxCas?.metriques.chevauchements" class="avertissement chevauchements">
          {{ vueMateriauxCas.metriques.chevauchements }} chevauchement(s) détecté(s). Le volume textuel ne compte chaque zone qu’une fois.
        </p>

        <section v-if="vueMateriauxCas?.diagnosticsRegles.length" class="diagnostics-regles">
          <h3>Diagnostics des règles</h3>
          <p v-for="(diagnostic, index) in vueMateriauxCas.diagnosticsRegles" :key="`${diagnostic.personneId}-${diagnostic.entretienId}-${index}`">
            ⚠ {{ diagnostic.diagnostic }}<span v-if="diagnostic.entretienId"> — {{ diagnostic.entretienId }}</span>
          </p>
        </section>

        <p v-if="chargementCas" class="vide">Résolution des matériaux…</p>
        <p v-else-if="!groupesPassages.length" class="vide grande">{{ messageVide }}</p>
        <template v-else>
          <section v-for="groupe in groupesPassages" :key="groupe.entretienId" class="groupe-entretien">
            <h3>{{ groupe.titre }}</h3>
            <article
              v-for="(passage, index) in groupe.passages"
              :key="clePassage(passage, index)"
              class="passage-cas"
              :class="{ casse: passage.etat !== 'disponible' }"
            >
              <div class="provenance">
                <span v-if="passage.origine.type === 'manuel'">Ajout manuel</span>
                <span v-else-if="passage.origine.type === 'regle-modalite'">Règle de modalité</span>
                <span v-else-if="passage.origine.type === 'regle-entretien'">Règle d’entretien entier</span>
                <span v-else>Règle de personne</span>
                <span v-if="passage.locuteurs.length"> — {{ passage.locuteurs.join(', ') }}</span>
                <span class="actions-passage">
                  <button v-if="passage.etat === 'disponible'" @click="voirPassageCas(passage)">Voir dans l’entretien</button>
                  <button v-if="passage.origine.type === 'manuel'" class="danger" :disabled="lectureSeule" @click="retirer(passage)">Retirer du cas</button>
                </span>
              </div>
              <blockquote v-if="passage.etat === 'disponible'">{{ passage.texte || 'Cet entretien ne contient pas encore de texte.' }}</blockquote>
              <p v-else class="erreur">⚠ {{ passage.diagnostic }}</p>
            </article>
          </section>
        </template>
      </template>
    </main>
  </section>
</template>

<style scoped>
.choix-creation { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; }
.champs-creation { display: grid; gap: .8rem; border: 0; padding: 0; margin: 0; min-width: 0; }
.mode-cas, .aide-regle { font-size: .9rem; color: #555; }
.filtre-materiaux { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin: 1rem 0; }
.cas-corpus { display: grid; grid-template-columns: 280px 1fr; gap: 1rem; min-height: 65vh; }
.repertoire-cas, .fiche-cas { border: 1px solid #ddd; border-radius: 8px; background: #fff; padding: .8rem; }
.tete-repertoire, .creation-cas > header, .barre-cas { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
.actions-repertoire { display: flex; gap: .3rem; }
h2, h3 { margin: 0; }
.tete-repertoire h2 { font-size: 1.1rem; }
.recherche { width: 100%; box-sizing: border-box; margin: .7rem 0; padding: .4rem; }
.carte-cas { width: 100%; display: flex; flex-direction: column; align-items: flex-start; margin: .3rem 0; padding: .55rem; border: 1px solid #ddd; border-radius: 6px; background: #fff; cursor: pointer; }
.carte-cas.actif { border-color: #2e73d8; background: #f0f6ff; }
.carte-cas span, .carte-cas small { color: #777; }
.nom-carte { width: 100%; display: flex; justify-content: space-between; gap: .4rem; }
.nom-carte b { color: #222; overflow: hidden; text-overflow: ellipsis; }
.nom-carte em { color: #b3261e; font-style: normal; }
.barre-cas { flex-wrap: wrap; }
.nom-cas { flex: 1; min-width: 14rem; font-size: 1.15rem; font-weight: 700; }
.etat-enregistrement { font-size: .72rem; color: #2e7d32; }
.etat-enregistrement.conflit { color: #b3261e; }
.creation-cas { max-width: 42rem; margin: 0 auto; }
.creation-cas header { border-bottom: 1px solid #eee; padding-bottom: .7rem; }
.creation-cas header p { margin: .25rem 0 0; color: #666; }
.creation-cas form { display: grid; gap: .8rem; }
.creation-cas form { margin-top: 1rem; }
.creation-cas label, .memo-cas { display: grid; gap: .25rem; color: #555; font-size: .85rem; }
.creation-cas .case-cocher { display: flex; align-items: center; }
.creation-cas select, .creation-cas input, .creation-cas textarea, .memo-cas textarea { width: 100%; box-sizing: border-box; }
.creation-cas .case-cocher input { width: auto; flex: none; }
.apercu { padding: .65rem; border-left: 4px solid #2e73d8; background: #f0f6ff; color: #555; }
.doublon-cas { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.actions-creation { display: flex; justify-content: flex-end; gap: .5rem; }
.primaire { border-color: #1565c0; background: #2e73d8; color: #fff; }
.memo-cas { margin-top: .8rem; }
.metriques { display: flex; flex-wrap: wrap; gap: .5rem; margin: .8rem 0; }
.metriques span { padding: .35rem .55rem; border-radius: 999px; background: #eef3f8; font-size: .8rem; }
.metriques .probleme { background: #fdecea; color: #b3261e; }
.avertissement { padding: .5rem; background: #fff8e1; border-left: 4px solid #e0a03a; font-size: .82rem; }
.chevauchements { margin-top: -.3rem; }
.diagnostics-regles { border: 1px solid #f3b4ad; border-radius: 6px; background: #fff5f5; padding: .6rem; color: #b3261e; }
.diagnostics-regles h3 { font-size: .9rem; }
.diagnostics-regles p { margin: .3rem 0 0; font-size: .82rem; }
.groupe-entretien { margin-top: 1rem; }
.groupe-entretien > h3 { border-bottom: 1px solid #ddd; padding-bottom: .35rem; font-size: 1rem; }
.passage-cas { margin-top: .55rem; border-left: 4px solid #2e73d8; background: #fafdff; padding: .6rem; }
.passage-cas.casse { border-color: #c62828; background: #fff5f5; }
.provenance { color: #555; font-size: .82rem; min-height: 1.7rem; }
.actions-passage { float: right; display: flex; gap: .3rem; }
blockquote { margin: .5rem 0 0; white-space: pre-wrap; }
.erreur, .danger { color: #b3261e; }
.vide { color: #888; }
.grande { text-align: center; margin-top: 5rem; }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: .5; }
</style>
