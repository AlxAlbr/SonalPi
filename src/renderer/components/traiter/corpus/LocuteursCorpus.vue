<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { selectionnerLocuteurs, type SelectionListeLocuteurs } from '../../../composables/corpus/selectionListeLocuteurs'
import type { EntretienLocuteursCorpus, TourLocuteurCorpus, VueLocuteursCorpus } from '../../../../shared/corpus/repertoireLocuteurs'
import { couleurPourLocuteur } from '../../../../shared/entretien/locuteurs'
import BarreOngletCorpus from './BarreOngletCorpus.vue'
import BandeauRetourCorpus from './BandeauRetourCorpus.vue'
import BarreInterventionsLocuteurs from './BarreInterventionsLocuteurs.vue'
import DetailsLocuteursCorpus from './DetailsLocuteursCorpus.vue'
import SuiviCorrectionsLocuteursCorpus from './SuiviCorrectionsLocuteursCorpus.vue'
import CorrectionsLocuteursCorpus from './CorrectionsLocuteursCorpus.vue'
import IconeActionLocuteur from './IconeActionLocuteur.vue'
import StatistiquesSelectionLocuteurs from './StatistiquesSelectionLocuteurs.vue'
import type { ReferenceParticipation } from '../../../../shared/locuteurs'
import { cleParticipationCorrection } from '../../../../shared/corpus/apercusCorrectionsLocuteurs'

const props = defineProps<{ actif: boolean }>()
const { lireLocuteursCorpus, ouvrirAuSegment, dossierCourantDir, revisionLocuteursCorpus,
  dernierTirage, vue, idDistantCourant, gesteDisponible, actualiserDistant, urlWaveform, allerLocuteurs } = utiliserSonal()
const vide = (): VueLocuteursCorpus => ({ locuteurs: [], entretiens: [], aVerifier: [], indisponibles: [] })
const donnees = ref<VueLocuteursCorpus>(vide())
const selection = ref<SelectionListeLocuteurs>({ cles: [], ancre: null })
const recherche = ref('')
const tags = ref<string[]>([])
const champRecherche = ref<HTMLInputElement | null>(null)
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
const indices = ref<Record<string, number>>({})
let generation = 0
const visible = computed(() => props.actif && vue.value === 'corpus')
const normaliser = (texte: string) => texte.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
const filtres = computed(() => {
  const textes = [...tags.value, recherche.value].map((t) => normaliser(t.trim())).filter(Boolean)
  return donnees.value.locuteurs.filter((locuteur) => {
    if (!textes.length) return true
    const libelles = normaliser([locuteur.nom, ...locuteur.participations.flatMap((p) => [p.nom, p.entretienTitre])].join(' '))
    return textes.some((texte) => libelles.includes(texte))
  })
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
const nombreMasques = computed(() => {
  const visibles = new Set(ordre.value)
  return selectionnes.value.filter((l) => !visibles.has(l.cle)).length
})
const entretiensAVerifier = computed(() => [...new Map(donnees.value.aVerifier.map((p) => [p.entretienId, p])).values()])
const panneau = ref<HTMLElement | null>(null)
const cleLargeur = 'sonalpi.locuteursCorpus.largeurGauche'
const largeur = ref(300)
try { const memorisee = Number(localStorage.getItem(cleLargeur)); if (memorisee >= 240) largeur.value = Math.min(600, memorisee) } catch { /* Stockage facultatif. */ }
let observateur: ResizeObserver | undefined
function borner(valeur: number) { return Math.max(240, Math.min(valeur, 600, (panneau.value?.clientWidth ?? 800) - 380)) }
function memoriser() { try { localStorage.setItem(cleLargeur, String(largeur.value)) } catch { /* Stockage facultatif. */ } }
function redimensionner(event: PointerEvent) {
  if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId) && panneau.value) {
    largeur.value = borner(event.clientX - panneau.value.getBoundingClientRect().left)
  }
}
function terminer(event: PointerEvent) {
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  memoriser()
}
function ajuster(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  largeur.value = borner(event.key === 'Home' ? 240 : event.key === 'End' ? 600 : largeur.value + (event.key === 'ArrowLeft' ? -20 : 20))
  memoriser()
}
function ajouterTag(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  const texte = recherche.value.trim()
  if (texte && !tags.value.some((tag) => normaliser(tag) === normaliser(texte))) tags.value.push(texte)
  recherche.value = ''
}
function effacerRecherche() { recherche.value = ''; tags.value = [] }
async function retirerTag(tag: string) {
  tags.value = tags.value.filter((t) => t !== tag)
  await nextTick()
  champRecherche.value?.focus()
}
async function ouvrirVerification(id: string) {
  try { await allerLocuteurs(id) } catch (e) { erreur.value = e instanceof Error ? e.message : String(e) }
}
function ouvrirCarte(entretien: EntretienLocuteursCorpus) {
  void ouvrir(entretien.id, toursSelectionnes(entretien)[0] ?? entretien.tours[0] ?? { pos: 1 })
}
const nombreEntretiens = (participations: { entretienId: string }[]) => new Set(participations.map((p) => p.entretienId)).size

async function actualiser(depuisServeur = false) {
  const jeton = ++generation
  occupe.value = true
  try {
    if (depuisServeur && idDistantCourant.value) {
      await actualiserDistant()
      if (jeton !== generation) return
    }
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
  if (!await actualiser() || dossier !== dossierCourantDir.value || !visible.value) return
  const references = new Set(participations.map(cleParticipationCorrection))
  const cles = donnees.value.locuteurs.filter((l) => l.participations.some((p) => references.has(cleParticipationCorrection(p))))
    .map((l) => l.cle)
  selection.value = { cles, ancre: cles[0] ?? null }
  if (cles[0]) await focaliser(cles[0])
}
async function choisirReferences(participations: ReferenceParticipation[]) {
  const references = new Set(participations.map(cleParticipationCorrection))
  const cles = donnees.value.locuteurs.filter((l) => l.participations.some((p) => references.has(cleParticipationCorrection(p)))).map((l) => l.cle)
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
  const index = ordre.value.indexOf(cle)
  if (index < 0) { focus.value = null; return }
  limiteLocuteurs.value = Math.max(limiteLocuteurs.value, index + 1)
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
async function ouvrir(entretienId: string, tour: Pick<TourLocuteurCorpus, 'pos'>) {
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
watch(() => donnees.value.locuteurs, (locuteurs) => {
  const presentes = new Set(locuteurs.map((l) => l.cle))
  selection.value = {
    cles: selection.value.cles.filter((cle) => presentes.has(cle)),
    ancre: selection.value.ancre && presentes.has(selection.value.ancre) ? selection.value.ancre : null,
  }
  if (focus.value && !presentes.has(focus.value)) focus.value = null
})
watch(ordre, (cles) => { if (focus.value && !cles.includes(focus.value)) focus.value = null })
watch([recherche, () => tags.value.join('\n')], () => { limiteLocuteurs.value = 200 })
watch(panneau, (element) => {
  observateur?.disconnect()
  if (!element) return
  observateur = new ResizeObserver(() => { if (element.clientWidth > 720) largeur.value = borner(largeur.value) })
  observateur.observe(element)
})
watch(() => selection.value.cles.join('\n'), () => {
  indices.value = {}; limiteEntretiens.value = 20
})
watch(tousEntretiens, () => { limiteEntretiens.value = 20 })
watch([dossierCourantDir, idDistantCourant], () => {
  generation++
  donnees.value = vide()
  selection.value = { cles: [], ancre: null }
  effacerRecherche(); focus.value = null; details.value = false
  tousEntretiens.value = false; statistiques.value = false; charge.value = false; erreur.value = ''
  limiteLocuteurs.value = 200; limiteEntretiens.value = 20; indices.value = {}
})
watch([visible, dossierCourantDir, idDistantCourant, revisionLocuteursCorpus, dernierTirage], () => {
  if (visible.value) void actualiser()
  else { generation++; occupe.value = false }
}, { immediate: true })
onBeforeUnmount(() => { generation++; observateur?.disconnect() })
</script>

<template>
  <section class="locuteurs-corpus" aria-label="Locuteurs du corpus" :aria-busy="occupe">
      <BarreOngletCorpus titre="Locuteurs" aide="Sélectionnez un ou plusieurs locuteurs pour retrouver leurs tours de parole dans les entretiens." />
      <BandeauRetourCorpus v-if="erreur" type="erreur" @fermer="erreur = ''">
        {{ erreur }}<template v-if="charge"> La liste affichée est le dernier état lisible.</template>
        <template #actions><button type="button" :disabled="occupe" @click="actualiser(true)">Réessayer</button></template>
      </BandeauRetourCorpus>
      <p v-if="idDistantCourant" role="status" class="consultation-distante">Les informations affichées proviennent de la copie présente sur cet ordinateur.<template v-if="!gesteDisponible('correctionsLocuteurs')"> Les corrections depuis le corpus ne sont pas disponibles dans son état actuel.</template><template v-if="dernierTirage"> Dernière synchronisation : <time :datetime="dernierTirage">{{ new Date(dernierTirage).toLocaleString('fr-FR') }}</time>.</template><template v-else> La date de synchronisation n’est pas connue.</template></p>
      <SuiviCorrectionsLocuteursCorpus v-if="idDistantCourant" :actif="visible" @actualiser="actualiser($event)" />
      <p v-if="occupe && !charge" role="status">Chargement des locuteurs…</p>
      <details v-if="donnees.indisponibles.length" class="sources-indisponibles">
        <summary>{{ donnees.indisponibles.length }} entretien{{ donnees.indisponibles.length > 1 ? 's' : '' }} indisponible{{ donnees.indisponibles.length > 1 ? 's' : '' }} — vue incomplète</summary>
        <ul><li v-for="source in donnees.indisponibles" :key="source.id">{{ source.titre }} : {{ source.raison }}</li></ul>
      </details>
      <div v-if="charge" ref="panneau" class="vue-locuteurs" :style="{ '--largeur-locuteurs': largeur + 'px' }">
        <aside class="repertoire-locuteurs" aria-label="Liste des locuteurs">
          <div class="actions-selection" role="group" aria-label="Actions des locuteurs">
            <button v-if="selectionnes.length" type="button" title="Effacer la sélection" @click="selection = { cles: [], ancre: null }"><IconeActionLocuteur action="effacer" /><span class="sr-only">Effacer la sélection</span></button>
            <CorrectionsLocuteursCorpus v-if="visible" :key="dossierCourantDir ?? ''" :selection="selectionnes" :indisponible="occupe || !!erreur || !!donnees.indisponibles.length"
              @termine="apresCorrection" @ouvrir="ouvrirConflit" />
            <button v-if="selectionnes.length" type="button" title="Statistiques" :aria-expanded="statistiques" @click="statistiques = !statistiques"><IconeActionLocuteur action="statistiques" /><span class="sr-only">Statistiques</span></button>
            <button type="button" title="Détails et vérifications…" :aria-expanded="details" @click="details = !details"><IconeActionLocuteur action="details" /><span class="sr-only">Détails et vérifications…</span></button>
            <button type="button" title="Actualiser" :disabled="occupe" @click="actualiser(true)"><IconeActionLocuteur action="actualiser" /><span class="sr-only">Actualiser</span></button>
          </div>
          <label class="recherche-locuteurs">Rechercher un nom ou un entretien<input ref="champRecherche" v-model="recherche" type="search" placeholder="Entrée pour ajouter un tag" @keydown.enter="ajouterTag" /></label>
          <ul v-if="tags.length" class="tags-recherche" aria-label="Recherches combinées avec OU"><li v-for="tag in tags" :key="tag">{{ tag }}<button type="button" :aria-label="`Retirer le tag ${tag}`" @click="retirerTag(tag)">×</button></li></ul>
          <p v-if="tags.length > 1" class="aide-selection">Résultats correspondant à au moins un tag.</p>
          <button v-if="tags.length || recherche" class="effacer-recherche" type="button" @click="effacerRecherche">Effacer la recherche</button>
          <p class="compteur-selection" role="status">{{ filtres.length }} résultat{{ filtres.length > 1 ? 's' : '' }} · {{ selectionnes.length }} sélectionné{{ selectionnes.length > 1 ? 's' : '' }}<template v-if="nombreMasques">, dont {{ nombreMasques }} masqué{{ nombreMasques > 1 ? 's' : '' }} par la recherche</template></p>
          <p class="aide-selection">Ctrl ou ⌘ pour plusieurs ; Maj pour une plage.</p>
          <fieldset class="perimetre-entretiens"><legend>Afficher les entretiens</legend>
            <label><input v-model="tousEntretiens" type="radio" :value="false" /> Avec la sélection</label>
            <label><input v-model="tousEntretiens" type="radio" :value="true" /> Tous les entretiens</label>
          </fieldset>
          <details v-if="entretiensAVerifier.length" class="verification-locuteurs">
            <summary>Certains locuteurs nécessitent une vérification dans leur entretien.</summary>
            <p>Voir les entretiens concernés :</p>
            <ul><li v-for="p in entretiensAVerifier" :key="p.entretienId"><button type="button" @click="ouvrirVerification(p.entretienId)">Ouvrir les locuteurs de {{ p.entretienTitre }}</button></li></ul>
          </details>
          <div ref="liste" class="liste-locuteurs" role="listbox" aria-label="Locuteurs" aria-multiselectable="true">
            <button v-for="(locuteur, index) in affiches" :key="locuteur.cle" type="button" role="option"
              :data-cle="locuteur.cle" :aria-selected="clesSelection.has(locuteur.cle)"
              :tabindex="focus === locuteur.cle || (!focus && index === 0) ? 0 : -1"
              :title="locuteur.participations.map((p) => p.entretienTitre).join(', ')" @click="choisir(locuteur.cle, $event)" @keydown="clavier($event, locuteur.cle)" @focus="focus = locuteur.cle">
              <strong><span v-if="clesSelection.has(locuteur.cle)" class="pastille" :style="{ background: couleurs[locuteur.cle] }"></span>{{ locuteur.nom }}</strong>
              <small>{{ nombreEntretiens(locuteur.participations) }} entretien{{ nombreEntretiens(locuteur.participations) > 1 ? 's' : '' }} · {{ locuteur.participations[0]?.entretienTitre }}</small>
            </button>
          </div>
          <p v-if="!affiches.length">{{ recherche || tags.length ? 'Aucun locuteur ne correspond à la recherche.' : donnees.indisponibles.length ? 'Aucun locuteur disponible dans les entretiens lisibles.' : 'Aucun locuteur dans les entretiens du corpus.' }}</p>
          <button v-if="affiches.length < filtres.length" type="button" @click="limiteLocuteurs += 200">Afficher les locuteurs suivants ({{ filtres.length - affiches.length }})</button>
        </aside>
        <div class="separateur-locuteurs" role="separator" tabindex="0" aria-label="Largeur de la liste des locuteurs" aria-orientation="vertical" :aria-valuenow="Math.round(largeur)" :aria-valuemin="240" :aria-valuemax="600"
          @pointerdown="($event.currentTarget as HTMLElement).setPointerCapture($event.pointerId)" @pointermove="redimensionner" @pointerup="terminer" @pointercancel="terminer" @keydown="ajuster"></div>
        <section class="interventions-locuteurs" aria-label="Interventions dans les entretiens">
          <p v-if="!selectionnes.length" class="aide-selection">Sélectionnez un locuteur pour mettre ses tours de parole en évidence.</p>
          <ul v-else class="legende-locuteurs">
            <li v-for="locuteur in selectionnes.slice(0, 20)" :key="locuteur.cle"><span class="pastille" :style="{ background: couleurs[locuteur.cle] }"></span>{{ locuteur.nom }}</li>
            <li v-if="selectionnes.length > 20">Et {{ selectionnes.length - 20 }} autres locuteurs.</li>
          </ul>
          <DetailsLocuteursCorpus v-if="details" :actif="visible" :selection="selectionnes" @fermer="details = false" @selectionner="choisirReferences" @termine="apresCorrection" />
          <StatistiquesSelectionLocuteurs v-if="statistiques && selectionnes.length" :selection="selectionnes" :entretiens="donnees.entretiens" :couleurs="couleurs" :incomplet="!!donnees.indisponibles.length" @ouvrir="ouvrirConflit" />
          <p class="axe-texte">Les couleurs suivent le déroulement du texte, pas le temps audio exact.</p>
          <article v-for="entretien in entretiensAffiches" :key="entretien.id" class="entretien-interventions" :data-entretien-id="entretien.id">
            <div class="carte-entete"><h3>{{ entretien.titre }}</h3><button type="button" :aria-label="`Ouvrir ${entretien.titre}`" @click="ouvrirCarte(entretien)">Ouvrir</button></div>
            <BarreInterventionsLocuteurs :titre="entretien.titre" :tours="entretien.tours" :couleurs="couleurs" :source="urlWaveform(entretien.id)" @ouvrir="ouvrir(entretien.id, $event)" />
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
  </section>
</template>

<style scoped>
.locuteurs-corpus { min-width: 0; }
.vue-locuteurs { display: grid; grid-template-columns: var(--largeur-locuteurs) 6px minmax(0, 1fr); gap: 12px; margin-top: 1rem; height: calc(100vh - 270px); min-height: 360px; }
.repertoire-locuteurs { display: flex; flex-direction: column; min-height: 0; overflow: auto; border: 1px solid #dce2ec; border-radius: 8px; padding: .8rem; }
.repertoire-locuteurs > :not(.liste-locuteurs) { flex-shrink: 0; }
.separateur-locuteurs { background: #e8edf5; cursor: col-resize; touch-action: none; border-radius: 5px; }
.separateur-locuteurs:focus-visible { outline: 2px solid #356ac3; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.tags-recherche { display: flex; gap: .3rem; flex-wrap: wrap; padding: 0; margin: .5rem 0; list-style: none; }
.tags-recherche li { display: flex; align-items: center; gap: .2rem; border-radius: 12px; background: #e8effb; padding: .1rem .4rem; font-size: .8rem; overflow-wrap: anywhere; }
.tags-recherche button { border: 0; background: transparent; }
.compteur-selection { font-size: .8rem; font-weight: 600; }
.perimetre-entretiens { margin: 0 0 .7rem; border: 1px solid #dce2ec; border-radius: 5px; font-size: .8rem; }
.perimetre-entretiens label { display: block; margin: .3rem 0; }
.verification-locuteurs { font-size: .8rem; margin-bottom: .7rem; }
.verification-locuteurs ul { padding-left: 1rem; }
.effacer-recherche { align-self: flex-start; font-size: .75rem; }
.recherche-locuteurs { display: flex; flex-direction: column; gap: .35rem; font-size: .85rem; }
.recherche-locuteurs input { width: 100%; box-sizing: border-box; padding: .5rem; border: 1px solid #aebbd0; border-radius: 5px; }
.aide-selection, .axe-texte { color: #5d6878; font-size: .8rem; }
.liste-locuteurs { min-height: 100px; overflow-y: auto; display: flex; flex-direction: column; gap: .25rem; flex: 1; }
.liste-locuteurs button { flex-shrink: 0; }
.liste-locuteurs .pastille { margin-right: .3rem; }
.liste-locuteurs button { text-align: left; display: flex; flex-direction: column; gap: .2rem; width: 100%; border: 1px solid transparent; background: transparent; padding: .6rem; border-radius: 5px; cursor: pointer; }
.liste-locuteurs button[aria-selected=true] { background: #e8effb; border-color: #7197cf; }
.liste-locuteurs button:hover { background: #f1f5fb; }
.liste-locuteurs strong { overflow-wrap: anywhere; }
.liste-locuteurs small { color: #5d6878; font-size: .75rem; }
.interventions-locuteurs { min-width: 0; overflow-y: auto; padding: 3px; }
.actions-selection { margin-bottom: .7rem; min-height: 36px; }
.actions-selection :deep(.bandeau-retour) { flex-basis: 100%; flex-shrink: 0; margin-bottom: 0; }
.actions-selection > button[type=button], .actions-selection :deep(.actions-correction > button) { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: .3rem; border: 1px solid #bfcbdc; border-radius: 5px; background: #fff; }
.actions-selection > button:hover, .actions-selection :deep(.actions-correction > button:hover) { background: #f0f5fc; }
.actions-selection button[aria-expanded=true] { background: #e8effb; border-color: #7197cf; }
.actions-selection, .navigation-interventions { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; font-size: .8rem; }
.actions-selection { gap: .3rem; }
.legende-locuteurs { padding: 0; margin: .7rem 0 0; list-style: none; display: flex; flex-wrap: wrap; gap: .7rem; font-size: .85rem; }
.legende-locuteurs li { display: flex; align-items: center; gap: .3rem; }
.pastille { display: inline-block; width: .75rem; height: .75rem; border-radius: 50%; }
.entretien-interventions { margin-top: .5rem; padding: .3rem .5rem; border: 1px solid #e0e0ea; border-radius: 6px; background: #fff; }
.carte-entete { display: flex; align-items: center; gap: .5rem; margin-bottom: .3rem; }
.entretien-interventions h3 { margin: 0; font-size: .85rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.carte-entete button { font-size: .75rem; }
.navigation-interventions { margin-top: .6rem; }
.sources-indisponibles { margin-top: .7rem; }
button:not([role=option]) { padding: .4rem .6rem; cursor: pointer; }
button:focus-visible, input:focus-visible { outline: 2px solid #356ac3; outline-offset: 2px; }
button:disabled { cursor: default; opacity: .6; }
@media (max-width: 720px) { .vue-locuteurs { grid-template-columns: minmax(0, 1fr); height: auto; } .separateur-locuteurs { display: none; } .liste-locuteurs { max-height: 35vh; } .interventions-locuteurs { overflow: visible; } }
</style>
