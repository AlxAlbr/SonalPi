<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import type { LigneRepertoireLocuteurs } from '../../../../shared/corpus/repertoireLocuteurs'
import type { Variable, NoteCategory } from '../../../../shared/format'
import type { InventaireIdentitesLocuteurs } from '../../../../shared/corpus/inventaireLocuteurs'
import type { ReferenceParticipation } from '../../../../shared/locuteurs'
import type { CommandeCorrectionLocuteurs } from '../../../../shared/corpus/contratsLocuteurs'
import { examinerLocuteurs, notesSelectionLocuteurs } from '../../../../shared/corpus/detailsLocuteurs'
import { cleParticipationCorrection } from '../../../../shared/corpus/apercusCorrectionsLocuteurs'
import { corpsNoteEnTexte } from '../../../../shared/export/notesTexte'

const props = defineProps<{ actif: boolean; selection: LigneRepertoireLocuteurs[] }>()
const emit = defineEmits<{ fermer: []; selectionner: [references: ReferenceParticipation[]]; termine: [references: ReferenceParticipation[]] }>()
const { lireDetailsLocuteurs, corrigerLocuteurs, dossierCourantDir, revisionLocuteursCorpus, dernierTirage, vue, idDistantCourant,
  lectureSeule, gesteDisponible, suiviLocuteurs, erreurSuiviLocuteurs, suiviLocuteursCharge, allerNotes, allerLocuteurs } = utiliserSonal()
const vide = (): InventaireIdentitesLocuteurs => ({ locuteurs: [], participations: [], notes: [], indisponibles: [] })
const inventaire = ref(vide()), charge = ref(false), lecture = ref(false), preparation = ref(false), enregistrement = ref(false)
const erreur = ref(''), message = ref(''), limite = ref(100)
const variables = ref<Variable[]>([]), categories = ref<NoteCategory[]>([])
const nomCategorieNote = (id: string) => categories.value.find((c) => c.id === id)?.nom ?? 'Catégorie ancienne'
const dialogue = ref<HTMLDialogElement | null>(null), annuler = ref<HTMLButtonElement | null>(null), titre = ref<HTMLHeadingElement | null>(null)
const confirmation = ref<{ titre: string; texte: string; commande: CommandeCorrectionLocuteurs; references: ReferenceParticipation[] } | null>(null)
let contexte = 0, lectures = 0, preparations = 0
let retour: HTMLElement | null = null
const retourPanneau = document.activeElement as HTMLElement | null
const visible = computed(() => props.actif && vue.value === 'corpus')
const bloque = computed(() => lectureSeule.value || !gesteDisponible('correctionsLocuteurs')
  || !!suiviLocuteurs.value || !!erreurSuiviLocuteurs.value || (!!idDistantCourant.value && !suiviLocuteursCharge.value) || lecture.value || preparation.value || enregistrement.value || !charge.value || !!erreur.value || !!inventaire.value.indisponibles.length)
const references = computed(() => props.selection.flatMap((l) => l.participations))
const cles = computed(() => new Set(references.value.map(cleParticipationCorrection)))
const participations = computed(() => inventaire.value.participations.filter((p) => cles.value.has(cleParticipationCorrection(p))))
const notes = computed(() => notesSelectionLocuteurs(inventaire.value, references.value))
const examen = computed(() => examinerLocuteurs(inventaire.value, limite.value))
const reprise = computed(() => confirmation.value?.commande.type === 'reprendreInformations' ? confirmation.value.commande : null)
const sourcesReprise = computed(() => {
  const r = reprise.value
  const cible = r && inventaire.value.participations.find((p) => cleParticipationCorrection(p) === cleParticipationCorrection(r.reference))
  return cible?.locuteurRef ? inventaire.value.participations.filter((p) => p.locuteurRef === cible.locuteurRef && p.entretienId !== cible.entretienId) : []
})
const sourceReprise = computed(() => reprise.value && sourcesReprise.value.find((p) => cleParticipationCorrection(p) === cleParticipationCorrection(reprise.value!.source)))
const validation = computed(() => !bloque.value && (!reprise.value || (!!sourceReprise.value && !!(reprise.value.choix.pseudo || reprise.value.choix.interviewer || reprise.value.choix.variables.length))))
function choisirSource(event: Event) {
  const source = sourcesReprise.value.find((p) => cleParticipationCorrection(p) === (event.target as HTMLSelectElement).value)
  if (reprise.value && source) reprise.value.source = { entretienId: source.entretienId, participationId: source.participationId }
}
const variable = (id: string) => variables.value.find((v) => v.id === id)
const valeur = (id: string, modalite: string) => variable(id)?.modalites.find((m) => m.id === modalite)?.lib ?? 'Valeur ancienne non décrite'

async function actualiser() {
  const jeton = ++lectures, courant = contexte
  lecture.value = true
  try {
    const resultat = await lireDetailsLocuteurs()
    if (jeton !== lectures || courant !== contexte || !visible.value) return
    inventaire.value = resultat.inventaire; variables.value = resultat.variables; categories.value = resultat.categories
    charge.value = true; erreur.value = ''
  } catch (e) {
    if (jeton === lectures && courant === contexte) erreur.value = e instanceof Error ? e.message : String(e)
  } finally { if (jeton === lectures && courant === contexte) lecture.value = false }
}
function fermerConfirmation() {
  if (enregistrement.value) return
  preparations++; preparation.value = false
  dialogue.value?.close(); confirmation.value = null
  if (retour?.isConnected) retour.focus()
}
async function preparer(titre: string, texte: string, commande: CommandeCorrectionLocuteurs, resultat: ReferenceParticipation[] = []) {
  if (bloque.value) return
  const courant = contexte, jeton = ++preparations, attendu = JSON.stringify(inventaire.value)
  const catalogue = JSON.stringify([variables.value, categories.value])
  retour = document.activeElement as HTMLElement | null
  preparation.value = true; message.value = ''; erreur.value = ''
  try {
    const details = await lireDetailsLocuteurs(true), frais = details.inventaire
    if (courant !== contexte || jeton !== preparations || !visible.value) return
    if (frais.indisponibles.length || JSON.stringify(frais) !== attendu || JSON.stringify([details.variables, details.categories]) !== catalogue) throw new Error('La liste a changé. Actualisez les détails puis vérifiez à nouveau votre choix.')
    confirmation.value = { titre, texte, commande: JSON.parse(JSON.stringify({ ...commande, attendu })), references: (resultat.length ? resultat : references.value).map((r) => ({ entretienId: r.entretienId, participationId: r.participationId })) }
    await nextTick()
    if (courant !== contexte || jeton !== preparations) return
    dialogue.value?.showModal(); annuler.value?.focus()
  } catch (e) {
    if (courant === contexte && jeton === preparations) erreur.value = e instanceof Error ? e.message : String(e)
  } finally { if (courant === contexte && jeton === preparations) preparation.value = false }
}
async function confirmer() {
  const demande = confirmation.value, courant = contexte
  if (!demande || !validation.value) return
  enregistrement.value = true
  try {
    const commande: CommandeCorrectionLocuteurs = JSON.parse(JSON.stringify(demande.commande))
    await corrigerLocuteurs(commande)
    if (courant !== contexte || !visible.value) return
    dialogue.value?.close(); confirmation.value = null
    message.value = 'Modification enregistrée. Les associations et données non concernées sont conservées.'
    emit('termine', demande.references)
    await actualiser()
    if (courant === contexte) { await nextTick(); if (courant === contexte && visible.value) titre.value?.focus() }
  } catch (e) {
    if (courant === contexte) erreur.value = e instanceof Error ? e.message : String(e)
  } finally { if (courant === contexte) enregistrement.value = false }
}
async function ouvrir(action: () => Promise<unknown>) {
  try { await action() } catch (e) { erreur.value = e instanceof Error ? e.message : String(e) }
}
watch([visible, dossierCourantDir, idDistantCourant], () => {
  contexte++; lectures++; preparations++
  dialogue.value?.close(); confirmation.value = null
  inventaire.value = vide(); variables.value = []; categories.value = []; charge.value = false; lecture.value = false; preparation.value = false; enregistrement.value = false
  erreur.value = ''; message.value = ''; limite.value = 100
  if (visible.value) void actualiser()
}, { immediate: true })
watch([revisionLocuteursCorpus, dernierTirage], () => { if (visible.value && !enregistrement.value) void actualiser() })
watch([suiviLocuteurs, erreurSuiviLocuteurs, enregistrement], () => {
  if ((suiviLocuteurs.value || erreurSuiviLocuteurs.value) && !enregistrement.value) fermerConfirmation()
})
onBeforeUnmount(() => { contexte++; lectures++; preparations++; dialogue.value?.close(); if (retourPanneau?.isConnected) retourPanneau.focus() })
</script>

<template>
  <section class="details-locuteurs" aria-label="Détails des locuteurs" :aria-busy="lecture || enregistrement">
    <header><h2 ref="titre" tabindex="-1">Détails et vérifications</h2><button type="button" :disabled="enregistrement" @click="emit('fermer')">Fermer les détails</button><button type="button" :disabled="lecture || enregistrement" @click="actualiser">Actualiser les détails</button></header>
    <p v-if="lecture && !charge" role="status">Chargement des détails…</p>
    <p v-if="erreur" role="alert">{{ erreur }} <button v-if="!confirmation" type="button" @click="actualiser">Réessayer</button></p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="inventaire.indisponibles.length" role="status">Certains entretiens sont indisponibles. Les détails sont incomplets et aucune correction ne peut être confirmée.</p>
    <p v-if="idDistantCourant && !gesteDisponible('correctionsLocuteurs')">Vous pouvez consulter et comparer ces informations. Les corrections depuis le corpus ne sont pas encore disponibles pour ce corpus en ligne.</p>
    <p v-else-if="lectureSeule">Consultation seule : les corrections ne sont pas disponibles.</p>
    <section v-if="charge" aria-label="Informations de la sélection">
      <h3>Informations dans les entretiens</h3>
      <p v-if="!participations.length">Sélectionnez un ou plusieurs locuteurs dans la liste pour consulter leurs informations et notes.</p>
      <article v-for="p in participations.slice(0, limite)" :key="cleParticipationCorrection(p)">
        <h4>{{ p.nom || 'Locuteur sans nom' }} · {{ p.entretienTitre }}</h4>
        <p>{{ p.interviewer ? 'Pose les questions' : 'Répond aux questions' }} · Pseudonyme : {{ p.pseudo || (p.pseudoEtat === 'refuse' ? 'non souhaité' : 'non renseigné') }}</p>
        <p v-if="p.associationRetiree">Un lien a été retiré volontairement. Il ne sera pas restauré par un nouveau nom.</p>
        <p v-if="p.locuteurRef && !inventaire.locuteurs.some((l) => l.id === p.locuteurRef)">L’ancien locuteur associé n’existe plus. Vous pouvez conserver cette voix séparément depuis les actions de la sélection.</p>
        <dl v-if="Object.keys(p.valeursLoc).length"><template v-for="(mod, id) in p.valeursLoc" :key="id"><dt>{{ variable(String(id))?.lib ?? 'Ancienne donnée' }}</dt><dd>{{ valeur(String(id), mod) }}</dd></template></dl>
        <button v-if="p.locuteurRef && inventaire.locuteurs.some((l) => l.id === p.locuteurRef) && inventaire.participations.some((a) => a.locuteurRef === p.locuteurRef && a.entretienId !== p.entretienId)" type="button" :disabled="bloque" @click="preparer('Reprendre des informations locales', `Choisissez les informations à reprendre pour « ${p.nom} » dans « ${p.entretienTitre} ». Les noms, notes et associations resteront inchangés. Les changements futurs ne seront pas recopiés.`, { type: 'reprendreInformations', reference: { entretienId: p.entretienId, participationId: p.participationId }, source: { entretienId: '', participationId: '' }, choix: { pseudo: true, interviewer: true, variables: [], remplacer: false }, attendu: '' })">Reprendre des informations…</button>
        <button type="button" :disabled="enregistrement" @click="ouvrir(() => allerLocuteurs(p.entretienId))">Ouvrir les locuteurs de {{ p.entretienTitre }}</button>
      </article>
      <section aria-label="Notes liées à la sélection"><h3>Notes liées</h3>
        <p v-if="!notes.length">Aucune note liée à ces voix.</p>
        <article v-for="n in notes.slice(0, limite)" :key="JSON.stringify([n.entretienId, n.id])">
          <h4>{{ n.titre || 'Note sans titre' }} · {{ n.entretienTitre }}</h4>
          <p>{{ nomCategorieNote(n.categorieId) }} · {{ n.statut === 'prive' ? 'Note privée' : 'Note publique' }}<template v-if="n.date"> · {{ n.date }}</template></p>
          <p class="corps-note">{{ corpsNoteEnTexte(n.corps) }}</p>
          <button type="button" :disabled="enregistrement" @click="ouvrir(() => allerNotes(n.entretienId))">Ouvrir les notes de {{ n.entretienTitre }}</button>
        </article>
      </section>
    </section>
    <details v-if="charge"><summary>Propositions présentées ({{ examen.propositions.length }})</summary>
      <section aria-label="Suggestions à vérifier"><p v-if="inventaire.participations.length > limite || examen.propositions.length >= limite">La recherche et les propositions affichées sont limitées. « Afficher les détails suivants » élargit la recherche.</p><p>Un nom proche n’est pas une preuve d’identité. Comparer sélectionne les locuteurs ; seule la confirmation de « C’est le même locuteur… » peut les réunir.</p>
        <p v-if="!examen.propositions.length">Aucun rapprochement proposé.</p>
        <article v-for="p in examen.propositions.slice(0, limite)" :key="p.cle"><p>{{ p.titre }}</p>
          <button type="button" :disabled="enregistrement" @click="emit('selectionner', p.selection)">Comparer ces locuteurs</button>
          <button type="button" :disabled="bloque" @click="preparer('Garder ces locuteurs distincts', `${p.titre}. Les noms, associations et données restent inchangés. Cette proposition sera écartée pour ces locuteurs.`, { type: 'ecarterRapprochement', reference: p.a, cible: p.b, attendu: '' })">Garder distincts…</button>
        </article>
      </section>
    </details>
    <details v-if="charge"><summary>Distinctions enregistrées ({{ examen.distinctions.length }})</summary>
      <section aria-label="Distinctions enregistrées"><p v-if="!examen.distinctions.length">Aucune distinction enregistrée.</p>
        <article v-for="d in examen.distinctions.slice(0, limite)" :key="d.cle"><p>{{ d.titre }}</p>
          <button type="button" :disabled="bloque" @click="preparer('Réexaminer cette distinction', `${d.titre}. La distinction sera retirée dans les deux sens. Les associations actuelles restent inchangées : aucun regroupement ne sera appliqué.`, { type: 'retablirRapprochement', reference: d.reference, cible: d.cible, attendu: '' })">Réexaminer cette distinction…</button>
        </article>
      </section>
    </details>
    <details v-if="charge"><summary>Locuteurs sans entretien ({{ examen.sansEntretien.length }})</summary>
      <section aria-label="Locuteurs sans entretien"><p>Ces locuteurs ne sont reliés à aucune voix lisible. Une suppression exige que tous les entretiens soient accessibles et qu’aucun cas ni distinction ne les utilise.</p>
        <p v-if="!examen.sansEntretien.length">Aucun locuteur sans entretien.</p>
        <article v-for="l in examen.sansEntretien.slice(0, limite)" :key="l.id"><p>{{ l.nom }}</p>
          <button type="button" :disabled="bloque" @click="preparer('Supprimer ce locuteur sans entretien', `Supprimer « ${l.nom} » ? Aucun texte ni aucune note ne sera supprimé. Ses utilisations seront vérifiées avant l’enregistrement. Cette suppression n’est pas annulable depuis cet écran.`, { type: 'supprimerVide', locuteurId: l.id, attendu: '' })">Supprimer ce locuteur…</button>
        </article>
      </section>
    </details>
    <button v-if="inventaire.participations.length > limite || participations.length > limite || notes.length > limite || examen.propositions.length >= limite || examen.distinctions.length > limite || examen.sansEntretien.length > limite" type="button" @click="limite += 100">Afficher les détails suivants</button>
    <p v-if="preparation" role="status">Vérification du choix… <button type="button" @click="fermerConfirmation">Annuler la préparation</button></p>
    <dialog v-if="confirmation" ref="dialogue" aria-labelledby="titre-details-correction" :aria-busy="enregistrement" @cancel.prevent="fermerConfirmation">
      <h2 id="titre-details-correction">{{ confirmation.titre }}</h2><p>{{ confirmation.texte }}</p>
      <fieldset v-if="reprise" :disabled="enregistrement">
        <legend>Informations à reprendre</legend>
        <label>Entretien source<select aria-label="Entretien source" :value="sourceReprise ? cleParticipationCorrection(reprise.source) : ''" @change="choisirSource"><option value="">Choisir un entretien</option><option v-for="p in sourcesReprise" :key="cleParticipationCorrection(p)" :value="cleParticipationCorrection(p)">{{ p.entretienTitre }} · {{ p.nom }} · {{ p.pseudo || 'sans pseudonyme' }} · {{ p.interviewer ? 'pose les questions' : 'répond aux questions' }}</option></select></label>
        <label><input v-model="reprise.choix.pseudo" type="checkbox" /> Pseudonyme</label>
        <label><input v-model="reprise.choix.interviewer" type="checkbox" /> Rôle dans l’entretien</label>
        <label v-for="v in variables.filter((v) => v.portee === 'participation')" :key="v.id"><input v-model="reprise.choix.variables" type="checkbox" :value="v.id" /> {{ v.lib }}</label>
        <label><input v-model="reprise.choix.remplacer" type="checkbox" /> Remplacer aussi les informations déjà renseignées</label>
        <p>Sinon, seules les informations manquantes seront complétées.</p>
        <p v-if="sourceReprise">Source choisie : {{ sourceReprise.entretienTitre }} · pseudonyme {{ sourceReprise.pseudo || 'non renseigné' }} · {{ sourceReprise.interviewer ? 'pose les questions' : 'répond aux questions' }}.</p>
        <ul v-if="sourceReprise"><li v-for="id in reprise.choix.variables" :key="id">{{ variable(id)?.lib }} : {{ sourceReprise.valeursLoc[id] ? valeur(id, sourceReprise.valeursLoc[id]) : 'non renseignée' }}</li></ul>
      </fieldset>
      <p v-if="erreur" role="alert">{{ erreur }} Fermez cet aperçu puis actualisez les détails avant de réessayer.</p>
      <div class="actions"><button ref="annuler" type="button" :disabled="enregistrement" @click="fermerConfirmation">Annuler</button><button type="button" :disabled="!validation" @click="confirmer">{{ enregistrement ? 'Enregistrement…' : reprise ? 'Reprendre les informations' : confirmation.commande.type === 'supprimerVide' ? 'Supprimer ce locuteur' : confirmation.commande.type === 'ecarterRapprochement' ? 'Garder distincts' : 'Réexaminer la distinction' }}</button></div>
    </dialog>
  </section>
</template>

<style scoped>
.details-locuteurs { border: 1px solid #dce2ec; border-radius: 8px; padding: 1rem; margin: .8rem 0; min-width: 0; }
header, .actions { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
h2 { margin: 0; font-size: 1.1rem; }
h3 { font-size: 1rem; }
h4 { margin: .3rem 0; }
article { border-top: 1px solid #e2e6ef; padding: .6rem 0; overflow-wrap: anywhere; }
article p { margin: .4rem 0; }
details { margin: .8rem 0; }
summary { cursor: pointer; font-weight: 600; }
label { display: block; margin: .6rem 0; }
select { max-width: 100%; display: block; }
fieldset { min-width: 0; border: 1px solid #dce2ec; margin: .8rem 0; }
.corps-note { white-space: pre-wrap; }
dl { display: grid; grid-template-columns: auto 1fr; gap: .3rem .7rem; }
dd { margin: 0; }
button { padding: .4rem .6rem; cursor: pointer; }
button:disabled { opacity: .6; cursor: default; }
[role=alert] { color: #9b2626; }
dialog { width: min(580px, calc(100vw - 4rem)); max-height: 85vh; overflow: auto; border: 1px solid #aebbd0; border-radius: 8px; padding: 1.2rem; }
dialog::backdrop { background: #0006; }
button:focus-visible, summary:focus-visible { outline: 2px solid #356ac3; outline-offset: 2px; }
</style>
