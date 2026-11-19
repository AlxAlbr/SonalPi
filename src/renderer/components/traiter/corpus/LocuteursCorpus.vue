<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { selectionnerLocuteurs, type SelectionListeLocuteurs } from '../../../composables/corpus/selectionListeLocuteurs'
import type { EntretienLocuteursCorpus, TourLocuteurCorpus, VueLocuteursCorpus } from '../../../../shared/corpus/repertoireLocuteurs'
import { couleurPourLocuteur } from '../../../../shared/entretien/locuteurs'
import BarreOngletCorpus from './BarreOngletCorpus.vue'
import BandeauRetourCorpus from './BandeauRetourCorpus.vue'
import BarreInterventionsLocuteurs from './BarreInterventionsLocuteurs.vue'
import PersonnesCorpus from './PersonnesCorpus.vue'
import CorrectionsLocuteursCorpus from './CorrectionsLocuteursCorpus.vue'
import type { ReferenceParticipation } from '../../../../shared/locuteurs'
import { cleParticipationCorrection } from '../../../../shared/corpus/apercusCorrectionsLocuteurs'

const props = defineProps<{ actif: boolean }>()
const { lireLocuteursCorpus, ouvrirAuSegment, dossierCourantDir, revisionPersonnesCorpus,
  dernierTirage, vue, idDistantCourant } = utiliserSonal()
const vide = (): VueLocuteursCorpus => ({ locuteurs: [], entretiens: [], indisponibles: [] })
const donnees = ref<VueLocuteursCorpus>(vide())
const selection = ref<SelectionListeLocuteurs>({ cles: [], ancre: null })
const recherche = ref('')
const focus = ref<string | null>(null)
const liste = ref<HTMLElement | null>(null)
const tousEntretiens = ref(false)
const statistiques = ref(false)
const details = ref(false)
const occupe = ref(false)
const charge = ref(false)
const erreur = ref('')
const limiteLocuteurs = ref(200)
const limiteEntretiens = ref(20)
const limiteStatistiques = ref(200)
const indices = ref<Record<string, number>>({})
let generation = 0
const visible = computed(() => props.actif && vue.value === 'corpus' && !details.value && !idDistantCourant.value)
const normaliser = (texte: string) => texte.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
const filtres = computed(() => {
  const texte = normaliser(recherche.value.trim())
  return donnees.value.locuteurs.filter((locuteur) => !texte || normaliser([
    locuteur.nom, ...locuteur.participations.flatMap((p) => [p.nom, p.entretienTitre]),
  ].join(' ')).includes(texte))
})
const ordre = computed(() => filtres.value.map((locuteur) => locuteur.cle))
const affiches = computed(() => filtres.value.slice(0, limiteLocuteurs.value))
const selectionnes = computed(() => {
  const cles = new Set(selection.value.cles)
  return donnees.value.locuteurs.filter((locuteur) => cles.has(locuteur.cle))
})
const clesSelection = computed(() => new Set(selection.value.cles))
const couleurs = computed(() => Object.fromEntries(selectionnes.value.map((locuteur) => {
  let hash = 0
  for (const caractere of locuteur.cle) hash = (hash * 31 + caractere.charCodeAt(0)) >>> 0
  return [locuteur.cle, couleurPourLocuteur(hash)]
})))
const entretiens = computed(() => {
  if (!selectionnes.value.length || tousEntretiens.value) return donnees.value.entretiens
  const ids = new Set(selectionnes.value.flatMap((locuteur) => locuteur.participations.map((p) => p.entretienId)))
  return donnees.value.entretiens.filter((entretien) => ids.has(entretien.id))
})
const entretiensAffiches = computed(() => entretiens.value.slice(0, limiteEntretiens.value))
const totalMots = computed(() => selectionnes.value.reduce((total, locuteur) => total + locuteur.mots, 0))
const totalTours = computed(() => selectionnes.value.reduce((total, locuteur) => total + locuteur.interventions, 0))
const nombreEntretiens = (participations: { entretienId: string }[]) => new Set(participations.map((p) => p.entretienId)).size

async function actualiser() {
  const jeton = ++generation
  occupe.value = true
  try {
    const resultat = await lireLocuteursCorpus()
    if (jeton !== generation) return
    donnees.value = resultat
    charge.value = true
    erreur.value = ''
    return true
  } catch (e) {
    if (jeton === generation) erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (jeton === generation) occupe.value = false
  }
}
async function apresCorrection(participations: ReferenceParticipation[]) {
  const dossier = dossierCourantDir.value
  recherche.value = ''
  if (!await actualiser() || dossier !== dossierCourantDir.value || !visible.value) return
  const references = new Set(participations.map(cleParticipationCorrection))
  const cles = donnees.value.locuteurs.filter((l) => l.participations.some((p) => references.has(cleParticipationCorrection(p))))
    .map((l) => l.cle)
  selection.value = { cles, ancre: cles[0] ?? null }
  if (cles[0]) await focaliser(cles[0])
}
async function ouvrirConflit(entretienId: string) {
  const tour = donnees.value.entretiens.find((e) => e.id === entretienId)?.tours[0]
  try { await ouvrirAuSegment(entretienId, tour?.pos ?? 1) }
  catch (e) { erreur.value = e instanceof Error ? e.message : String(e) }
}
function choisir(cle: string, event: Pick<MouseEvent | KeyboardEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>) {
  selection.value = selectionnerLocuteurs(selection.value, ordre.value, cle, {
    etendre: event.shiftKey, basculer: event.ctrlKey || event.metaKey,
  })
  focus.value = cle
}
async function focaliser(cle: string) {
  focus.value = cle
  await nextTick()
  const bouton = [...(liste.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])]
    .find((element) => element.dataset.cle === cle)
  bouton?.focus()
}
function clavier(event: KeyboardEvent, cle: string) {
  const touches = ['ArrowUp', 'ArrowDown', 'Home', 'End', ' ', 'Escape']
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    selection.value = { cles: [...ordre.value], ancre: cle }
    return
  }
  if (!touches.includes(event.key)) return
  event.preventDefault()
  if (event.key === 'Escape') {
    selection.value = { cles: [], ancre: null }
    return
  }
  if (event.key === ' ') { choisir(cle, event); return }
  const visibles = affiches.value.map((locuteur) => locuteur.cle)
  const index = visibles.indexOf(cle)
  const suivant = event.key === 'Home' ? 0 : event.key === 'End' ? visibles.length - 1
    : Math.max(0, Math.min(visibles.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
  const cible = visibles[suivant]
  if (!cible) return
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey) choisir(cible, event)
  void focaliser(cible)
}
function toursSelectionnes(entretien: EntretienLocuteursCorpus) {
  return entretien.tours.filter((tour) => tour.cle && clesSelection.value.has(tour.cle))
}
async function ouvrir(entretienId: string, tour: TourLocuteurCorpus) {
  try { await ouvrirAuSegment(entretienId, tour.pos) }
  catch (e) { erreur.value = e instanceof Error ? e.message : String(e) }
}
function naviguer(entretien: EntretienLocuteursCorpus, sens: -1 | 1) {
  const tours = toursSelectionnes(entretien)
  if (!tours.length) return
  const courant = indices.value[entretien.id] ?? (sens === 1 ? -1 : 0)
  const index = (courant + sens + tours.length) % tours.length
  indices.value[entretien.id] = index
  void ouvrir(entretien.id, tours[index])
}
watch(ordre, (cles) => {
  const presentes = new Set(cles)
  selection.value = {
    cles: selection.value.cles.filter((cle) => presentes.has(cle)),
    ancre: selection.value.ancre && presentes.has(selection.value.ancre) ? selection.value.ancre : null,
  }
  if (focus.value && !presentes.has(focus.value)) focus.value = null
})
watch(recherche, () => { limiteLocuteurs.value = 200 })
watch(() => selection.value.cles.join('\n'), () => {
  indices.value = {}; limiteEntretiens.value = 20; limiteStatistiques.value = 200
})
watch(tousEntretiens, () => { limiteEntretiens.value = 20 })
watch(dossierCourantDir, () => {
  generation++
  donnees.value = vide()
  selection.value = { cles: [], ancre: null }
  recherche.value = ''; focus.value = null; details.value = false
  tousEntretiens.value = false; statistiques.value = false; charge.value = false; erreur.value = ''
  limiteLocuteurs.value = 200; limiteEntretiens.value = 20; indices.value = {}
})
watch([visible, dossierCourantDir, revisionPersonnesCorpus, dernierTirage], () => {
  if (visible.value) void actualiser()
  else { generation++; occupe.value = false }
}, { immediate: true })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <section class="locuteurs-corpus" aria-label="Locuteurs du corpus" :aria-busy="occupe">
    <template v-if="details || idDistantCourant">
      <button v-if="!idDistantCourant" type="button" class="retour-interventions" @click="details = false">← Revenir aux interventions</button>
      <PersonnesCorpus :actif="actif" />
    </template>
    <template v-else>
      <BarreOngletCorpus titre="Locuteurs" aide="Sélectionnez un ou plusieurs locuteurs pour retrouver leurs interventions dans les entretiens.">
        <button type="button" :disabled="occupe" @click="actualiser">Actualiser</button>
        <button type="button" @click="details = true">Détails et associations…</button>
      </BarreOngletCorpus>
      <BandeauRetourCorpus v-if="erreur" type="erreur" @fermer="erreur = ''">
        {{ erreur }}<template v-if="charge"> La liste affichée est le dernier état lisible.</template>
        <template #actions><button type="button" :disabled="occupe" @click="actualiser">Réessayer</button></template>
      </BandeauRetourCorpus>
      <p v-if="occupe && !charge" role="status">Chargement des locuteurs…</p>
      <details v-if="donnees.indisponibles.length" class="sources-indisponibles">
        <summary>{{ donnees.indisponibles.length }} entretien{{ donnees.indisponibles.length > 1 ? 's' : '' }} indisponible{{ donnees.indisponibles.length > 1 ? 's' : '' }} — vue incomplète</summary>
        <ul><li v-for="source in donnees.indisponibles" :key="source.id">{{ source.titre }} : {{ source.raison }}</li></ul>
      </details>
      <div v-if="charge" class="vue-locuteurs">
        <aside class="repertoire-locuteurs" aria-label="Liste des locuteurs">
          <label class="recherche-locuteurs">Rechercher un nom ou un entretien<input v-model="recherche" type="search" /></label>
          <p class="aide-selection">Ctrl ou ⌘ pour plusieurs ; Maj pour une plage.</p>
          <div ref="liste" class="liste-locuteurs" role="listbox" aria-label="Locuteurs" aria-multiselectable="true">
            <button v-for="(locuteur, index) in affiches" :key="locuteur.cle" type="button" role="option"
              :data-cle="locuteur.cle" :aria-selected="clesSelection.has(locuteur.cle)"
              :tabindex="focus === locuteur.cle || (!focus && index === 0) ? 0 : -1"
              :title="locuteur.participations.map((p) => p.entretienTitre).join(', ')" @click="choisir(locuteur.cle, $event)" @keydown="clavier($event, locuteur.cle)" @focus="focus = locuteur.cle">
              <strong>{{ locuteur.nom }}</strong>
              <small>{{ nombreEntretiens(locuteur.participations) }} entretien{{ nombreEntretiens(locuteur.participations) > 1 ? 's' : '' }} · {{ locuteur.participations[0]?.entretienTitre }}</small>
            </button>
          </div>
          <p v-if="!affiches.length">{{ recherche ? 'Aucun locuteur ne correspond à la recherche.' : donnees.indisponibles.length ? 'Aucun locuteur disponible dans les entretiens lisibles.' : 'Aucun locuteur dans les entretiens du corpus.' }}</p>
          <button v-if="affiches.length < filtres.length" type="button" @click="limiteLocuteurs += 200">Afficher les locuteurs suivants ({{ filtres.length - affiches.length }})</button>
        </aside>
        <section class="interventions-locuteurs" aria-label="Interventions dans les entretiens">
          <header class="selection-locuteurs">
            <p role="status">{{ selectionnes.length ? `${selectionnes.length} locuteur${selectionnes.length > 1 ? 's' : ''} sélectionné${selectionnes.length > 1 ? 's' : ''}` : 'Tous les entretiens — sélectionnez un locuteur pour mettre ses interventions en évidence.' }}</p>
            <div class="actions-selection">
              <button v-if="selectionnes.length" type="button" :aria-expanded="statistiques" @click="statistiques = !statistiques">Statistiques</button>
              <button v-if="selectionnes.length" type="button" @click="selection = { cles: [], ancre: null }">Effacer la sélection</button>
              <label><input v-model="tousEntretiens" type="checkbox" /> Tous les entretiens</label>
            </div>
            <CorrectionsLocuteursCorpus v-if="visible" :key="dossierCourantDir ?? ''" :selection="selectionnes" :indisponible="occupe || !!erreur || !!donnees.indisponibles.length"
              @termine="apresCorrection" @details="details = true" @ouvrir="ouvrirConflit" />
            <ul v-if="selectionnes.length" class="legende-locuteurs">
              <li v-for="locuteur in selectionnes.slice(0, 20)" :key="locuteur.cle"><span class="pastille" :style="{ background: couleurs[locuteur.cle] }"></span>{{ locuteur.nom }}</li>
              <li v-if="selectionnes.length > 20">Et {{ selectionnes.length - 20 }} autres locuteurs.</li>
            </ul>
          </header>
          <section v-if="statistiques && selectionnes.length" class="statistiques-selection" aria-label="Statistiques de la sélection">
            <p><strong>{{ totalMots }} mots · {{ totalTours }} interventions</strong> dans les entretiens associés à la sélection.</p>
            <p v-if="donnees.indisponibles.length">Bilan incomplet : certains entretiens sont indisponibles.</p>
            <ul><li v-for="locuteur in selectionnes.slice(0, limiteStatistiques)" :key="locuteur.cle">{{ locuteur.nom }} : {{ locuteur.mots }} mots · {{ locuteur.interventions }} interventions</li></ul>
            <button v-if="selectionnes.length > limiteStatistiques" type="button" @click="limiteStatistiques += 200">Afficher les statistiques suivantes ({{ selectionnes.length - limiteStatistiques }})</button>
          </section>
          <p class="axe-texte">Les barres représentent le déroulement du texte, pas la durée audio.</p>
          <article v-for="entretien in entretiensAffiches" :key="entretien.id" class="entretien-interventions" :data-entretien-id="entretien.id">
            <h3>{{ entretien.titre }}</h3>
            <BarreInterventionsLocuteurs :titre="entretien.titre" :tours="entretien.tours" :couleurs="couleurs" @ouvrir="ouvrir(entretien.id, $event)" />
            <p v-if="!entretien.tours.length">Aucune prise de parole à afficher.</p>
            <div v-else-if="selectionnes.length" class="navigation-interventions">
              <span>{{ toursSelectionnes(entretien).length }} intervention{{ toursSelectionnes(entretien).length > 1 ? 's' : '' }} de la sélection</span>
              <button type="button" :disabled="!toursSelectionnes(entretien).length" :aria-label="`Intervention précédente dans ${entretien.titre}`" @click="naviguer(entretien, -1)">◄ Précédente</button>
              <button type="button" :disabled="!toursSelectionnes(entretien).length" :aria-label="`Intervention suivante dans ${entretien.titre}`" @click="naviguer(entretien, 1)">Suivante ►</button>
            </div>
          </article>
          <p v-if="!entretiens.length">{{ donnees.indisponibles.length ? 'Aucun entretien lisible à afficher.' : 'Aucun entretien à afficher.' }}</p>
          <button v-if="entretiensAffiches.length < entretiens.length" type="button" @click="limiteEntretiens += 20">Afficher les entretiens suivants ({{ entretiens.length - entretiensAffiches.length }})</button>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.locuteurs-corpus { min-width: 0; }
.vue-locuteurs { display: grid; grid-template-columns: minmax(240px, 300px) minmax(0, 1fr); gap: 1rem; margin-top: 1rem; align-items: start; }
.repertoire-locuteurs { border: 1px solid #dce2ec; border-radius: 8px; padding: .8rem; }
.recherche-locuteurs { display: flex; flex-direction: column; gap: .35rem; font-size: .85rem; }
.recherche-locuteurs input { width: 100%; box-sizing: border-box; padding: .5rem; border: 1px solid #aebbd0; border-radius: 5px; }
.aide-selection, .axe-texte { color: #5d6878; font-size: .8rem; }
.liste-locuteurs { max-height: 65vh; overflow-y: auto; display: grid; gap: .25rem; }
.liste-locuteurs button { text-align: left; display: flex; flex-direction: column; gap: .2rem; width: 100%; border: 1px solid transparent; background: transparent; padding: .6rem; border-radius: 5px; cursor: pointer; }
.liste-locuteurs button[aria-selected=true] { background: #e8effb; border-color: #7197cf; }
.liste-locuteurs button:hover { background: #f1f5fb; }
.liste-locuteurs strong { overflow-wrap: anywhere; }
.liste-locuteurs small { color: #5d6878; font-size: .75rem; }
.interventions-locuteurs { min-width: 0; }
.selection-locuteurs { padding: .7rem; background: #f6f8fc; border: 1px solid #dce2ec; border-radius: 8px; }
.selection-locuteurs p { margin-top: 0; }
.actions-selection, .navigation-interventions { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; font-size: .8rem; }
.legende-locuteurs { padding: 0; margin: .7rem 0 0; list-style: none; display: flex; flex-wrap: wrap; gap: .7rem; font-size: .85rem; }
.legende-locuteurs li { display: flex; align-items: center; gap: .3rem; }
.pastille { display: inline-block; width: .75rem; height: .75rem; border-radius: 50%; }
.statistiques-selection { margin-top: .7rem; padding: .7rem; border: 1px solid #dce2ec; border-radius: 6px; font-size: .85rem; }
.entretien-interventions { margin-top: .7rem; padding: .8rem; border: 1px solid #dce2ec; border-radius: 8px; }
.entretien-interventions h3 { margin: 0 0 .6rem; font-size: .95rem; }
.navigation-interventions { margin-top: .6rem; }
.sources-indisponibles { margin-top: .7rem; }
button:not([role=option]) { padding: .4rem .6rem; cursor: pointer; }
button:focus-visible, input:focus-visible { outline: 2px solid #356ac3; outline-offset: 2px; }
button:disabled { cursor: default; opacity: .6; }
.retour-interventions { margin: .5rem 0; }
@media (max-width: 720px) { .vue-locuteurs { grid-template-columns: 1fr; } .liste-locuteurs { max-height: 35vh; } }
</style>
