<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { usePanneauxEntretien, type OngletEntretien } from '../../../composables/entretien/usePanneauxEntretien'
import { EditorContent } from '@tiptap/vue-3'
import LecteurAudio from './LecteurAudio.vue'
import FenetreHorodatageTour from './FenetreHorodatageTour.vue'
import BarreTourEntretien from './BarreTourEntretien.vue'
import VideoPanel from './VideoPanel.vue'
import MenuContexte from './MenuContexte.vue'
import EditionCommentaire from './EditionCommentaire.vue'
import PanneauAnonymisationEntretien from './PanneauAnonymisationEntretien.vue'
import PanneauDonneesEntretien from './PanneauDonneesEntretien.vue'
import PanneauCommentairesEntretien from './PanneauCommentairesEntretien.vue'
import PanneauJournalEntretien from './PanneauJournalEntretien.vue'
import PanneauLocuteursEntretien from './PanneauLocuteursEntretien.vue'
import PanneauNotesEntretien from './PanneauNotesEntretien.vue'
import PanneauThemesEntretien from './PanneauThemesEntretien.vue'
import DefilementSuperpose from './DefilementSuperpose.vue'
import { utiliserSonal } from '../../../composables/sonal'
// Icônes des onglets (glyphe noir à plat).
import icoThemes from '../../../assets/icones/themes.png'
import icoCommentaires from '../../../assets/icones/commentaires.svg'
import icoLocuteurs from '../../../assets/icones/locuteurs.png'
import icoDonnees from '../../../assets/icones/tableau.svg'
import icoJournal from '../../../assets/icones/journal.png'
import icoNotes from '../../../assets/icones/notes.png'
import icoAnon from '../../../assets/icones/anon.png'
import icoRecherche from '../../../assets/icones/recherche.png'

const {
  ongletDroite,
  rechercheOuverte,
  rechercheTexte,
  remplacementTexte,
  occurrencesRecherche,
  indexRecherche,
  ouvrirRecherche,
  fermerRecherche,
  naviguerRecherche,
  remplacerOccurrenceCourante,
  remplacerTout,
  menuContextuel,
  fermerMenu,
  basculerException,
  basculerAnonymise,
  basculerPseudoOccurrence,
  editionCommentaire,
  commenterDepuisMenu,
  copierSelectionMenu,
  editerCommentaire,
  fermerEditionCommentaire,
  validerCommentaire,
  supprimerCommentaire,
  retirerCodageMenu,
  editor,
  audio,
  verrouAutrui,
  statutSession,
  publiErreur,
  publierMaintenant,
  afficherCasPourAssociation,
  afficherRecueilsPourAssociation,
  rafraichirCompteursAAAnonymiser,
  tourHorodatage,
} = utiliserSonal()
type OngletLateral = 'notes' | 'donnees' | 'recherche' | 'journal'
const enteteEditeur = ref<HTMLElement | null>(null)
let animationNavigationTexte: number | null = null

// Le défilement natif au clavier ne tient pas compte des barres fixes.
function garderCurseurVisible(event: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return
  if (animationNavigationTexte !== null) cancelAnimationFrame(animationNavigationTexte)
  animationNavigationTexte = requestAnimationFrame(() => {
    animationNavigationTexte = null
    const ed = editor.value
    const entete = enteteEditeur.value
    if (!ed || !entete || !ed.view.hasFocus()) return
    const { head } = ed.state.selection
    if (head === 1) {
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    const hautVisible = entete.getBoundingClientRect().bottom + 8
    const curseur = ed.view.coordsAtPos(head)
    if (curseur.top < hautVisible) {
      window.scrollBy({ top: Math.floor(curseur.top - hautVisible), behavior: 'instant' })
    }
  })
}
const boutonJournal = ref<HTMLButtonElement | null>(null)
const fenetreJournal = ref<HTMLElement | null>(null)

const ongletGauche = ref<OngletEntretien>('locuteurs')
const {
  ongletsHaut, ongletsBas, actifHaut, actifBas, partage, proportionHaut,
  colonne, cibleHaut, cibleBas, ongletGlisse, destination, position,
  visible: outilVisible, cliquer: cliquerOnglet, deplacerAuClavier: deplacerOnglet, regrouper,
  commencerGlissement, glisser, terminerGlissement,
  commencerRedimensionnement, redimensionner, terminerRedimensionnement, redimensionnerAuClavier,
} = usePanneauxEntretien(ongletGauche)
const idPanneaux = `panneaux-${useId()}`
const outilsGauche = {
  // Forme courte quand la colonne est étroite, longue quand elle a la place (voir CSS).
  locuteurs: { libelleLong: 'Locuteurs', libelleCourt: 'Locuteurs', titre: 'Locuteurs', icone: icoLocuteurs, tour: 'onglet-locuteurs' },
  anon: { libelleLong: 'Pseudonymisation', libelleCourt: 'Pseudo.', titre: 'Pseudonymisation du texte', icone: icoAnon, tour: undefined },
  themes: { libelleLong: 'Thématiques', libelleCourt: 'Thèmes', titre: 'Thématiques', icone: icoThemes, tour: 'onglet-themes' },
  commentaires: { libelleLong: 'Commentaires', libelleCourt: 'Comment.', titre: 'Commentaires', icone: icoCommentaires, tour: undefined },
}
const zonesGauche = computed(() => [
  { id: 'haut', onglets: ongletsHaut.value, actif: actifHaut.value },
  ...(partage.value ? [{ id: 'bas', onglets: ongletsBas.value, actif: actifBas.value }] : []),
])
function cibleOutil(id: OngletEntretien) {
  return `#${idPanneaux}-${ongletsBas.value.includes(id) ? 'bas' : 'haut'}`
}
// Volet de droite : un seul contenu à la fois, choisi dans la barre au-dessus du texte.
const ongletLateral = ref<OngletLateral>('notes')
const voletNotesOuvert = ref(false)
const libellesFermeture: Record<OngletLateral, string> = {
  notes: 'Fermer les notes',
  donnees: 'Fermer les données',
  recherche: 'Fermer la recherche',
  journal: 'Fermer le journal',
}
const journalOuvert = computed(() => voletNotesOuvert.value && ongletLateral.value === 'journal')

async function ouvrirJournal() {
  ouvrirVolet('journal')
  await nextTick()
  fenetreJournal.value?.focus()
}

function fermerJournal() {
  fermerVolet()
  boutonJournal.value?.focus()
}

// La recherche (bouton ou Ctrl+F) s'affiche dans le volet ;
// changer de contenu ou fermer le volet la referme, avec ses surlignages.
watch(rechercheOuverte, (ouverte) => {
  if (ouverte) {
    ongletLateral.value = 'recherche'
    voletNotesOuvert.value = true
  } else if (ongletLateral.value === 'recherche') {
    voletNotesOuvert.value = false
  }
})
watch([voletNotesOuvert, ongletLateral], ([ouvert, onglet]) => {
  if (rechercheOuverte.value && !(ouvert && onglet === 'recherche')) fermerRecherche()
})
const statistiquesOuvertes = ref(false)
const interventionStatistique = ref<{ loc: number | null; pos: number } | null>(null)
watch(() => outilVisible('anon'), (visible) => {
  if (visible && ongletDroite.value !== 'anon') rafraichirCompteursAAAnonymiser()
})
const afficherStatistiquesAudio = computed(() => outilVisible('locuteurs') && statistiquesOuvertes.value)
watch(afficherStatistiquesAudio, (afficher) => {
  if (!afficher) interventionStatistique.value = null
})

// Les raccourcis du corpus peuvent aussi ouvrir les outils de droite.
watch(ongletDroite, (onglet) => {
  if (onglet === 'journal') {
    void ouvrirJournal()
  } else if (onglet === 'notes' || onglet === 'donnees') {
    ongletLateral.value = onglet
    voletNotesOuvert.value = true
  } else {
    ongletGauche.value = onglet
  }
}, { immediate: true })
watch(ongletGauche, (onglet) => { ongletDroite.value = onglet })
const largeurNotesPersonnalisee = ref<number | null>(null)
// Largeur du panneau d'outils de gauche : réglable via la poignée à son bord droit,
// mémorisée localement comme la largeur du volet de notes.
const RACCOURCI_LARGEUR_OUTILS = 'sonalpi.entretien.largeurOutils'
const largeurMinimaleOutils = 280
const largeurOutilsPersonnalisee = ref<number | null>(null)
try {
  const memorisee = Number(localStorage.getItem(RACCOURCI_LARGEUR_OUTILS))
  if (Number.isFinite(memorisee) && memorisee > 0) largeurOutilsPersonnalisee.value = memorisee
} catch { /* Stockage facultatif. */ }
const redimensionnementOutils = ref(false)

// Largeur minimale du transcript : celle de sa barre de boutons.
// La grille et les poignées de redimensionnement s'appuient sur cette même mesure.
const largeurMinTranscript = ref(0)

function mesurerMinimumTranscript(): number {
  const outils = document.querySelector<HTMLElement>('.grille-ent .colonne-droite .outils-editeur')
  if (!outils) return 0
  const style = getComputedStyle(outils)
  const boutons = Array.from(outils.children) as HTMLElement[]
  let minimum = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
    + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth)
    + (Number.parseFloat(style.columnGap) || 0) * Math.max(0, boutons.length - 1)
  for (const bouton of boutons) {
    const s = getComputedStyle(bouton)
    minimum += bouton.offsetWidth + Number.parseFloat(s.marginLeft) + Number.parseFloat(s.marginRight)
  }
  // Boutons pas encore affichés : on garde la dernière mesure valable.
  if (boutons.every((bouton) => bouton.offsetWidth === 0)) return largeurMinTranscript.value
  largeurMinTranscript.value = Math.ceil(minimum)
  return largeurMinTranscript.value
}

// Les boutons peuvent n'avoir leur taille définitive qu'après l'affichage
// (écran encore masqué, polices chargées plus tard) : on remesure à chaque changement.
let observateurBoutons: ResizeObserver | null = null
onMounted(() => {
  void nextTick(() => {
    const outils = document.querySelector<HTMLElement>('.grille-ent .colonne-droite .outils-editeur')
    if (!outils) return
    observateurBoutons = new ResizeObserver(() => { mesurerMinimumTranscript() })
    for (const bouton of Array.from(outils.children)) observateurBoutons.observe(bouton)
  })
})
onBeforeUnmount(() => observateurBoutons?.disconnect())

/** Place que le transcript peut encore céder avant d'atteindre sa largeur minimale. */
function margeTranscript(): number {
  const colonne = document.querySelector<HTMLElement>('.grille-ent .colonne-droite')
  if (!colonne) return Infinity
  const minimum = mesurerMinimumTranscript()
  return colonne.getBoundingClientRect().width - minimum
}

/** Largeur bornée : au moins le minimum, au plus la moitié de la fenêtre,
 *  sans écraser le transcript sous la largeur de sa barre de boutons. */
function bornerLargeurOutils(valeur: number): number {
  const actuelle = document.querySelector<HTMLElement>('.grille-ent .colonne-gauche')?.getBoundingClientRect().width ?? 0
  const max = Math.min(Math.max(largeurMinimaleOutils, window.innerWidth * 0.5), actuelle + margeTranscript())
  return Math.max(largeurMinimaleOutils, Math.min(valeur, max))
}

function memoriserLargeurOutils(): void {
  if (largeurOutilsPersonnalisee.value === null) return
  try { localStorage.setItem(RACCOURCI_LARGEUR_OUTILS, String(largeurOutilsPersonnalisee.value)) } catch { /* Stockage facultatif. */ }
}

function commencerRedimensionnementOutils(event: PointerEvent): void {
  redimensionnementOutils.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function redimensionnerOutils(event: PointerEvent): void {
  if (!redimensionnementOutils.value) return
  const colonne = document.querySelector<HTMLElement>('.grille-ent .colonne-gauche')
  if (!colonne) return
  largeurOutilsPersonnalisee.value = bornerLargeurOutils(event.clientX - colonne.getBoundingClientRect().left)
}

function finirRedimensionnementOutils(event: PointerEvent): void {
  if (!redimensionnementOutils.value) return
  redimensionnementOutils.value = false
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  memoriserLargeurOutils()
}

function ajusterLargeurOutilsAuClavier(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  largeurOutilsPersonnalisee.value = bornerLargeurOutils(event.key === 'Home'
    ? largeurMinimaleOutils
    : event.key === 'End'
      ? Infinity
      : (largeurOutilsPersonnalisee.value ?? largeurMinimaleOutils) + (event.key === 'ArrowLeft' ? -20 : 20))
  memoriserLargeurOutils()
}

/** Variables CSS des largeurs personnalisées (notes à droite, outils à gauche). */
const styleGrille = computed(() => {
  const style: Record<string, string> = {}
  if (largeurNotesPersonnalisee.value !== null) style['--volet-notes-largeur-personnalisee'] = `${largeurNotesPersonnalisee.value}px`
  if (largeurOutilsPersonnalisee.value !== null) style['--largeur-outils-personnalisee'] = `${largeurOutilsPersonnalisee.value}px`
  if (largeurMinTranscript.value > 0) style['--largeur-min-transcript'] = `${largeurMinTranscript.value}px`
  return Object.keys(style).length ? style : undefined
})

// Le texte s'affiche pseudonymisé (pseudo seul, comme dans l'export).
// Pendant le travail dans l'onglet Pseudos, il passe en comparaison :
// nom réel barré et pseudo côte à côte.
function fermerHorodatage() {
  tourHorodatage.value = null
}

const affichageNoms = computed(() => (outilVisible('anon') ? 'comparer' : 'pseudonymise'))

/** Classes de la colonne de l'éditeur : sélection anon en cours + vue des noms
 *  (les règles CSS globales de editeur.css s'y accrochent). */
const classesColonneDroite = computed(() => ({
  'selection-pseudo-active': outilVisible('anon') && ajoutSelectionActif.value,
  'noms-pseudonymise': affichageNoms.value === 'pseudonymise',
  // Hors de l'onglet Locuteurs, les libellés passent en gris pour ne pas distraire.
  'locuteurs-discrets': !outilVisible('locuteurs'),
  // Même idée pour le soulignage des thèmes, atténué hors de l'onglet Thèmes.
  'themes-discrets': !outilVisible('themes'),
}))
const redimensionnementNotesActif = ref(false)
const largeurMinimaleNotes = 240

// Heure locale courte d'un horodatage ISO (« HH:MM »).
const heureDe = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

// Lecture seule du contenu : verrou détenu par autrui ou session dégradée.
const roContenu = computed(
  () => verrouAutrui.value !== null || statutSession.value.etat === 'degrade',
)

const messageSessionSuspendue = computed(() => {
  if (statutSession.value.etat !== 'degrade') return ''
  const messages: Record<string, string> = {
    conflit: 'Le serveur a changé — le travail local est conservé.',
    'droit-perdu': 'Droit d’édition perdu — le travail local est conservé.',
    droits: 'Droits GitLab retirés — le travail local est conservé.',
    limite: 'Limite GitLab atteinte — le travail local est conservé.',
    indetermine: 'Résultat de publication à vérifier — le travail local est conservé.',
    reseau: 'Perte réseau — le travail local est conservé.',
  }
  return messages[statutSession.value.raison ?? ''] ??
    'La session est suspendue — le travail local est conservé.'
})

// Compteur « i/N » de la boîte recherche/remplacement (vide sans requête).
const compteRecherche = computed(() => {
  if (!rechercheTexte.value.trim()) return ''
  const n = occurrencesRecherche.value.length
  return n === 0 ? '0/0' : `${indexRecherche.value + 1}/${n}`
})
// État partagé du scope média pour l'organisation d'écran (mode vidéo).
const { estVideo, videoVisible, toggleVideo } = audio
const CLE_AJOUT_SELECTION = 'sonal:pseudonymisation:ajout-selection'
const ajoutSelectionActif = ref(localStorage.getItem(CLE_AJOUT_SELECTION) !== 'false')
watch(ajoutSelectionActif, (actif) => {
  localStorage.setItem(CLE_AJOUT_SELECTION, String(actif))
}, { flush: 'sync' })

onBeforeUnmount(() => {
  if (animationNavigationTexte !== null) cancelAnimationFrame(animationNavigationTexte)
})

function ouvrirCasDepuisSelection() {
  fermerMenu()
  void afficherCasPourAssociation()
}

function ouvrirRecueilsDepuisSelection() {
  fermerMenu()
  void afficherRecueilsPourAssociation()
}

function ouvrirVolet(onglet: OngletLateral) {
  ongletLateral.value = onglet
  voletNotesOuvert.value = true
  if (onglet !== 'recherche') ongletDroite.value = onglet
}

function fermerVolet() {
  voletNotesOuvert.value = false
  ongletDroite.value = ongletGauche.value
}

/** Bouton de la barre : ouvre ce contenu dans le volet, ou referme le volet s'il l'affiche déjà. */
function cliquerVolet(onglet: OngletLateral) {
  if (voletNotesOuvert.value && ongletLateral.value === onglet) {
    if (onglet === 'journal') fermerJournal()
    else fermerVolet()
  } else if (onglet === 'recherche') {
    void ouvrirRecherche()
  } else if (onglet === 'journal') {
    void ouvrirJournal()
  } else {
    ouvrirVolet(onglet)
  }
}

/** Largeur du volet bornée : au moins le minimum, au plus 85 % de la fenêtre,
 *  sans écraser le transcript sous la largeur de sa barre de boutons. */
function bornerLargeurNotes(valeur: number): number {
  const actuelle = document.querySelector<HTMLElement>('.grille-ent .volet-notes')?.getBoundingClientRect().width ?? 0
  const max = Math.min(Math.max(largeurMinimaleNotes, window.innerWidth * 0.85), actuelle + margeTranscript())
  return Math.max(largeurMinimaleNotes, Math.min(valeur, max))
}

// Poignée au bord gauche du volet : elle règle sa largeur à la souris ou au clavier.
function commencerRedimensionnementNotes(event: PointerEvent): void {
  if (event.button !== 0) return
  redimensionnementNotesActif.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function redimensionnerNotes(event: PointerEvent): void {
  if (!redimensionnementNotesActif.value) return
  const volet = document.querySelector<HTMLElement>('.grille-ent .volet-notes')
  if (!volet) return
  largeurNotesPersonnalisee.value = bornerLargeurNotes(volet.getBoundingClientRect().right - event.clientX)
}

function finirRedimensionnementNotes(event: PointerEvent): void {
  if (!redimensionnementNotesActif.value) return
  redimensionnementNotesActif.value = false
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
}

function ajusterLargeurNotesAuClavier(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const actuelle = largeurNotesPersonnalisee.value
    ?? document.querySelector<HTMLElement>('.grille-ent .volet-notes')?.getBoundingClientRect().width
    ?? largeurMinimaleNotes
  largeurNotesPersonnalisee.value = bornerLargeurNotes(event.key === 'Home'
    ? largeurMinimaleNotes
    : event.key === 'End'
      ? Infinity
      : actuelle + (event.key === 'ArrowLeft' ? 20 : -20))
}

</script>

<template>
    <section class="ecran entretien-ecran">
      <!-- Corpus distant : bandeau quand le verrou de CET entretien est tenu par autrui ;
           le bandeau dit qui, et l'heure seulement quand le serveur la connaît. -->
      <div v-if="verrouAutrui" class="banniere-ro">
        🔒 Ouvert en lecture seule — verrou tenu par <b>{{ verrouAutrui.userId }}</b><template v-if="verrouAutrui.acquiredAt">
        depuis {{ new Date(verrouAutrui.acquiredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</template>.
      </div>
      <div
        class="grille-ent"
        :class="{
          'notes-ouvert': voletNotesOuvert,
          'mode-audio': !estVideo,
          'redimensionnement-notes': redimensionnementNotesActif,
          'redimensionnement-outils': redimensionnementOutils,
        }"
        :style="styleGrille"
      >
        <!-- Le retour au corpus reste accessible au-dessus des panneaux de travail. -->
        <div class="barre">
          <!-- Corpus distant, session à nous : statut de publication + « Publier maintenant ».
               En lecture seule (verrou autrui) : rien à publier,
               le bandeau 🔒 au-dessus parle déjà. -->
          <span v-if="statutSession.etat === 'degrade'" class="statut-session divergence">
            ⚠️ {{ messageSessionSuspendue }}
          </span>
          <template v-else-if="statutSession.etat === 'a-nous'">
            <span v-if="publiErreur" class="statut-session divergence">⚠️ {{ publiErreur }}</span>
            <span v-else-if="statutSession.sale" class="statut-session sale" title="Publication périodique toutes les 5 min ; le bouton force à la demande.">
              ● modifications non publiées<template v-if="statutSession.dernierPubli"> depuis {{ heureDe(statutSession.dernierPubli) }}</template>
            </span>
            <span v-else class="statut-session publie">☁ publié<template v-if="statutSession.dernierPubli"> à {{ heureDe(statutSession.dernierPubli) }}</template></span>
            <button v-if="!roContenu" class="publier-maintenant" @click="publierMaintenant">Publier maintenant</button>
          </template>
          <div v-if="!estVideo" class="lecteur-barre">
            <LecteurAudio :afficher-locuteurs="afficherStatistiquesAudio" :intervention-active="interventionStatistique" />
          </div>
        </div>

        <!-- Chaque zone garde ses onglets visibles et son propre défilement. -->
        <div
          ref="colonne"
          class="colonne-gauche"
          :class="{ partagee: partage, 'glissement-onglet': ongletGlisse }"
        >
          <!-- Tour de parole courant : suit le curseur, flèches pour passer d'un tour à l'autre. -->
          <BarreTourEntretien />
          <template v-for="zone in zonesGauche" :key="zone.id">
            <div
              v-if="zone.id === 'bas'"
              class="separation-outils"
              role="separator"
              tabindex="0"
              aria-label="Hauteur des panneaux de gauche"
              aria-orientation="horizontal"
              :aria-controls="`${idPanneaux}-haut ${idPanneaux}-bas`"
              :aria-valuenow="proportionHaut"
              :aria-valuemin="20"
              :aria-valuemax="80"
              @pointerdown="commencerRedimensionnement"
              @pointermove="redimensionner"
              @pointerup="terminerRedimensionnement"
              @pointercancel="terminerRedimensionnement"
              @lostpointercapture="terminerRedimensionnement"
              @keydown="redimensionnerAuClavier"
            ></div>
            <div
              :ref="(el) => { if (zone.id === 'haut') cibleHaut = el as HTMLElement; else cibleBas = el as HTMLElement }"
              class="groupe-outils"
              :class="{ 'depot-actif': destination === zone.id }"
              :data-zone="zone.id"
              :style="partage ? { flex: `${zone.id === 'haut' ? proportionHaut : 100 - proportionHaut} 1 0` } : undefined"
            >
              <nav class="onglets" :aria-label="zone.id === 'haut' ? 'Outils du haut' : 'Outils du bas'">
                <button
                  v-for="id in zone.onglets"
                  :key="id"
                  type="button"
                  :data-onglet="id"
                  :data-tour="outilsGauche[id].tour"
                  :class="{ actif: zone.actif === id }"
                  :aria-pressed="zone.actif === id"
                  :title="`${outilsGauche[id].titre} — glisser vers le ${zone.id === 'haut' ? 'bas' : 'haut'} (Alt + ${zone.id === 'haut' ? '↓' : '↑'})`"
                  @mousedown.prevent
                  @click="cliquerOnglet(id); ongletDroite = ongletGauche"
                  @pointerdown="commencerGlissement($event, id)"
                  @pointermove="glisser"
                  @pointerup="terminerGlissement"
                  @pointercancel="terminerGlissement"
                  @lostpointercapture="terminerGlissement"
                  @keydown.alt.down.prevent="deplacerOnglet(id, 'bas')"
                  @keydown.alt.up.prevent="deplacerOnglet(id, 'haut')"
                >
                  <img class="ico-onglet" :src="outilsGauche[id].icone" alt="" draggable="false" />
                  <span class="libelle-long">{{ outilsGauche[id].libelleLong }}</span>
                  <span class="libelle-court">{{ outilsGauche[id].libelleCourt }}</span>
                </button>
              </nav>
              <DefilementSuperpose>
                <div v-if="zone.id === 'haut'" data-tour="ancre-guide-pp"></div>
                <div :id="`${idPanneaux}-${zone.id}`" class="contenus-outils"></div>
              </DefilementSuperpose>
              <button v-if="zone.id === 'bas'" class="regrouper-outils" type="button" @click="regrouper">
                Regrouper les onglets en haut
              </button>
            </div>
          </template>
          <div v-if="ongletGlisse && !partage" ref="cibleBas" class="zone-depot-bas" :class="{ 'depot-actif': destination === 'bas' }">
            Déposer ici pour afficher en dessous
          </div>
          <div
            v-if="ongletGlisse"
            class="apercu-onglet"
            aria-hidden="true"
            :style="{ left: `${position.x + 12}px`, top: `${position.y + 12}px` }"
          >{{ outilsGauche[ongletGlisse].libelleLong }}</div>

          <!-- Déplacer le contenu existant conserve les saisies et les outils ouverts. -->
          <Teleport defer :to="cibleOutil('themes')">
            <PanneauThemesEntretien v-show="outilVisible('themes')" :lecture-seule-contenu="roContenu" />
          </Teleport>
          <Teleport defer :to="cibleOutil('locuteurs')">
            <PanneauLocuteursEntretien
              v-show="outilVisible('locuteurs')"
              :actif="outilVisible('locuteurs')"
              :lecture-seule="roContenu"
              v-model:statistiques-ouvertes="statistiquesOuvertes"
              @naviguer-statistique="interventionStatistique = $event"
            />
          </Teleport>
          <Teleport defer :to="cibleOutil('commentaires')">
            <PanneauCommentairesEntretien v-show="outilVisible('commentaires')" :lecture-seule="roContenu" />
          </Teleport>
          <Teleport defer :to="cibleOutil('anon')">
            <PanneauAnonymisationEntretien
              v-show="outilVisible('anon')"
              :actif="outilVisible('anon')"
              :lecture-seule-contenu="roContenu"
              v-model:ajout-selection-actif="ajoutSelectionActif"
            />
          </Teleport>

          <!-- Réglage de la largeur du panneau, comme le séparateur de l'onglet Pseudonymisation. -->
          <div
            class="poignee-largeur"
            role="separator"
            aria-label="Largeur des panneaux de gauche"
            aria-orientation="vertical"
            tabindex="0"
            :aria-valuenow="largeurOutilsPersonnalisee ?? undefined"
            :aria-valuemin="largeurMinimaleOutils"
            @pointerdown="commencerRedimensionnementOutils"
            @pointermove="redimensionnerOutils"
            @pointerup="finirRedimensionnementOutils"
            @pointercancel="finirRedimensionnementOutils"
            @lostpointercapture="finirRedimensionnementOutils"
            @keydown="ajusterLargeurOutilsAuClavier"
          ></div>
        </div>

        <!-- Colonne DROITE : éditeur en audio ; en vidéo, zone média épinglée
             (lecteur + waveform EMPILÉS à gauche ‖ panneau vidéo à droite)
             puis éditeur pleine largeur dessous. -->
        <div class="colonne-droite" :class="classesColonneDroite">
          <div ref="enteteEditeur" class="entete-editeur">
            <div v-if="estVideo" class="zone-media">
              <div class="tele">
                <LecteurAudio :empile="true" :afficher-locuteurs="afficherStatistiquesAudio" :intervention-active="interventionStatistique" />
                <!-- Ouvrir ou fermer la vidéo laisse toute la place disponible au lecteur. -->
                <button class="video-toggle" :title="videoVisible ? 'Masquer la vidéo' : 'Afficher la vidéo'" @click="toggleVideo">
                  {{ videoVisible ? '▾ Masquer la vidéo' : '▸ Afficher la vidéo' }}
                </button>
              </div>
              <VideoPanel v-show="videoVisible" />
            </div>
            <!-- Chaque bouton ouvre son contenu dans le volet de droite ;
                 un second clic sur le bouton actif referme le volet. -->
            <div class="outils-editeur" role="group" aria-label="Outils de l’entretien">
              <button
                class="ouvrir-recherche"
                data-onglet="recherche"
                :class="{ actif: voletNotesOuvert && ongletLateral === 'recherche' }"
                :aria-expanded="voletNotesOuvert && ongletLateral === 'recherche'"
                aria-controls="panneau-recherche-entretien"
                :title="roContenu ? 'Rechercher dans le texte (Ctrl+F)' : 'Rechercher et remplacer dans le texte (Ctrl+F)'"
                :aria-label="roContenu ? 'Rechercher dans le texte' : 'Rechercher et remplacer dans le texte'"
                @mousedown.prevent
                @click="cliquerVolet('recherche')"
              >
                <img :src="icoRecherche" alt="" draggable="false" />
              </button>
              <button
                ref="boutonJournal"
                class="bouton-volet"
                data-onglet="journal"
                :class="{ actif: journalOuvert }"
                :aria-expanded="journalOuvert"
                aria-controls="panneau-journal-entretien"
                title="Journal des actions"
                @click="cliquerVolet('journal')"
              >
                <img :src="icoJournal" alt="" draggable="false" />
                <span>Journal</span>
              </button>
              <button
                class="bouton-volet"
                data-onglet="notes"
                data-tour="onglet-notes"
                :class="{ actif: voletNotesOuvert && ongletLateral === 'notes' }"
                :aria-expanded="voletNotesOuvert && ongletLateral === 'notes'"
                aria-controls="panneau-notes-entretien"
                title="Notes"
                @click="cliquerVolet('notes')"
              >
                <img :src="icoNotes" alt="" draggable="false" />
                <span>Notes</span>
              </button>
              <button
                class="bouton-volet"
                data-onglet="donnees"
                data-tour="onglet-donnees"
                :class="{ actif: voletNotesOuvert && ongletLateral === 'donnees' }"
                :aria-expanded="voletNotesOuvert && ongletLateral === 'donnees'"
                aria-controls="panneau-donnees-entretien"
                title="Données"
                @click="cliquerVolet('donnees')"
              >
                <img :src="icoDonnees" alt="" draggable="false" />
                <span>Données</span>
              </button>
            </div>
          </div>
          <EditorContent :editor="editor" class="cadre" @keydown.capture="garderCurseurVisible" />
        </div>

        <aside class="volet-notes" :class="{ ouvert: voletNotesOuvert }" :inert="!voletNotesOuvert">
          <div
            class="poignee-volet"
            role="separator"
            aria-orientation="vertical"
            aria-label="Largeur du volet de droite"
            tabindex="0"
            title="Faites glisser pour régler la largeur"
            @pointerdown="commencerRedimensionnementNotes"
            @pointermove="redimensionnerNotes"
            @pointerup="finirRedimensionnementNotes"
            @pointercancel="finirRedimensionnementNotes"
            @keydown="ajusterLargeurNotesAuClavier"
          ></div>
          <div class="cadre-notes">
            <PanneauDonneesEntretien
              id="panneau-donnees-entretien"
              v-show="ongletLateral === 'donnees'"
              :lecture-seule="roContenu"
            />
            <PanneauNotesEntretien
              id="panneau-notes-entretien"
              v-show="ongletLateral === 'notes'"
              :lecture-seule="roContenu"
            />
            <!-- Recherche et remplacement : Entrée passe à l'occurrence suivante, Échap ferme.
                 Le remplacement est masqué quand l'entretien est en lecture seule. -->
            <section
              v-if="rechercheOuverte"
              id="panneau-recherche-entretien"
              class="panneau barre-recherche"
              aria-label="Recherche dans le texte"
            >
              <div class="corpus-tete">
                <h3>{{ roContenu ? 'Rechercher' : 'Rechercher et remplacer' }}</h3>
              </div>
              <div class="ligne-recherche">
                <input
                  id="champ-recherche"
                  v-model="rechercheTexte"
                  placeholder="Rechercher…"
                  @keydown.enter.prevent="naviguerRecherche(1)"
                  @keydown.escape="fermerRecherche"
                />
                <span class="compte">{{ compteRecherche }}</span>
                <button title="Occurrence précédente" :disabled="!occurrencesRecherche.length" @click="naviguerRecherche(-1)">‹</button>
                <button title="Occurrence suivante (Entrée)" :disabled="!occurrencesRecherche.length" @click="naviguerRecherche(1)">›</button>
              </div>
              <div v-if="!roContenu" class="ligne-remplacement">
                <input
                  v-model="remplacementTexte"
                  placeholder="Remplacer par…"
                  @keydown.enter.prevent="remplacerOccurrenceCourante"
                  @keydown.escape="fermerRecherche"
                />
                <button :disabled="!occurrencesRecherche.length || indexRecherche < 0" title="Remplacer l'occurrence courante" @click="remplacerOccurrenceCourante">Remplacer</button>
                <button :disabled="!occurrencesRecherche.length" title="Remplacer toutes les occurrences (une seule annulation Ctrl+Z)" @click="remplacerTout">Tout</button>
              </div>
            </section>
            <section
              v-if="journalOuvert"
              id="panneau-journal-entretien"
              ref="fenetreJournal"
              class="fenetre-journal"
              aria-label="Journal des actions de l’entretien"
              tabindex="-1"
              @keydown.escape.stop.prevent="fermerJournal"
            >
              <PanneauJournalEntretien :lecture-seule="roContenu" />
            </section>
            <!-- Croix commune : referme le volet, quel que soit son contenu. -->
            <button
              v-if="voletNotesOuvert"
              type="button"
              class="fermer-volet"
              :aria-label="libellesFermeture[ongletLateral]"
              :title="ongletLateral === 'recherche' || ongletLateral === 'journal' ? 'Fermer (Échap)' : 'Fermer'"
              @click="cliquerVolet(ongletLateral)"
            >✕</button>
          </div>
        </aside>
      </div>

      <!-- Menu contextuel de l'éditeur (clic droit) : sections anon,
           codages couvrants (retrait sans resélectionner) et commentaires
           (créer / éditer). -->
      <MenuContexte
        v-if="menuContextuel"
        :x="menuContextuel.x"
        :y="menuContextuel.y"
        :anon="menuContextuel.anon"
        :codages="menuContextuel.codages"
        :commentaires="menuContextuel.commentaires"
        :peut-commenter="menuContextuel.peutCommenter"
        :peut-ajouter-cas="menuContextuel.peutAjouterCas"
        :peut-ajouter-recueil="menuContextuel.peutAjouterRecueil"
        :peut-copier="menuContextuel.peutCopier"
        @copier="copierSelectionMenu"
        @basculer-exception="basculerException(menuContextuel.anon!.id)"
        @basculer-anonymise="basculerAnonymise(menuContextuel.anon!.id)"
        @basculer-pseudo="basculerPseudoOccurrence(menuContextuel.anon!.id, $event)"
        @retirer-codage="retirerCodageMenu"
        @commenter="commenterDepuisMenu"
        @ajouter-cas="ouvrirCasDepuisSelection"
        @ajouter-recueil="ouvrirRecueilsDepuisSelection"
        @editer-commentaire="editerCommentaire"
        @fermer="fermerMenu"
      />

      <!-- Modale d'un commentaire (création/édition/suppression). -->
      <EditionCommentaire
        v-if="editionCommentaire"
        :id="editionCommentaire.id"
        :auteur-initial="editionCommentaire.auteur"
        :texte-initial="editionCommentaire.texte"
        @valider="validerCommentaire"
        @supprimer="supprimerCommentaire(editionCommentaire!.id!)"
        @fermer="fermerEditionCommentaire"
      />

      <!-- Temps d'un tour de parole (bouton ✎ du libellé du tour). -->
      <FenetreHorodatageTour
        v-if="tourHorodatage != null"
        :key="tourHorodatage"
        :pos-bloc="tourHorodatage"
        @fermer="fermerHorodatage"
      />

    </section>
</template>

<style scoped>
.grille-ent {
  display: grid;
  /* Largeur du volet de droite une fois ouvert ; fermé, sa colonne est nulle. */
  --volet-notes-largeur: min(360px, 34vw);
  --volet-notes-largeur-ajustee: min(var(--volet-notes-largeur-personnalisee, var(--volet-notes-largeur)), 85vw);
  --panneaux-decalage: 1rem;
  /* Écart entre le lecteur et le haut des trois panneaux : les boutons posés sur le bord du transcript y respirent. */
  --ecart-haut-panneaux: 1.75rem;
  /* Largeur commune aux onglets et aux commandes du lecteur, qui restent ainsi alignés.
     Réglable via la poignée à droite du panneau (valeur personnalisée en pixels).
     Elle ne suit pas la largeur de la fenêtre et ne descend jamais sous 280px. */
  --largeur-outils: max(280px, var(--largeur-outils-personnalisee, 23.25rem));
  grid-template-columns: var(--largeur-outils) minmax(auto, 1fr) 0px;
  gap: var(--ecart-haut-panneaux) 1rem;
  align-items: start;
  grid-template-areas:
    'barre barre barre'
    'gauche droite volet';
  transition: grid-template-columns 220ms ease;
  /* Hauteur de la barre d'actions (ci-dessous), pour caler les colonnes. */
  --barre-h: 2.4rem;
}
.grille-ent.mode-audio {
  --barre-h: calc(3rem + var(--panneaux-decalage));
}
.grille-ent.notes-ouvert {
  grid-template-columns: var(--largeur-outils) minmax(auto, 1fr) var(--volet-notes-largeur-ajustee);
}
.grille-ent.redimensionnement-notes {
  transition: none;
}
.grille-ent.redimensionnement-outils {
  transition: none;
}
.grille-ent.redimensionnement-notes .colonne-droite {
  transition: none;
}
/* Sans lecteur ni statut, aucune barre supplémentaire n'est nécessaire. */
.grille-ent:not(:has(.barre .lecteur-audio, .barre .statut-session)) {
  --barre-h: 0px;
}
.grille-ent:not(:has(.barre .lecteur-audio, .barre .statut-session)) .barre {
  display: none;
}
.barre {
  grid-area: barre;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  /* Barre d'actions épinglée juste sous l'en-tête de l'appli (--entete-h est défini dans App.vue).
     Fond opaque pour masquer le contenu qui glisse. */
  position: sticky;
  top: var(--entete-h);
  z-index: 30;
  background: #fff;
  height: var(--barre-h);
  box-sizing: border-box;
}
/* L'en-tête s'épingle à la même hauteur que les panneaux voisins :
 *  le haut du transcript ne bouge donc pas pendant le défilement.
 *  Un cache blanc couvre l'écart au-dessus, pour que le texte n'y réapparaisse pas. */
.entete-editeur {
  position: sticky;
  top: calc(var(--entete-h) + var(--barre-h) + var(--ecart-haut-panneaux));
  z-index: 20;
  background: #fff;
}
.entete-editeur::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: var(--ecart-haut-panneaux);
  background: #fff;
}
/* Les boutons sont à cheval sur le bord haut du transcript :
 *  la bande n'a que la hauteur de leur moitié basse, la moitié haute dépasse au-dessus du bord. */
.outils-editeur {
  --hauteur-bouton-outils: 2rem;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 0.4rem;
  height: calc(var(--hauteur-bouton-outils) / 2);
  padding: 0 0.6rem;
  background: #fff;
  border: 1px solid #ddd;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
}
.outils-editeur button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.45rem;
  border: 1px solid #ddd;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  font-size: 0.8rem;
}
.outils-editeur button:hover,
.outils-editeur button.actif {
  background: #e8f0fb;
}
.outils-editeur .ouvrir-recherche,
.outils-editeur .bouton-volet {
  box-sizing: border-box;
  height: var(--hauteur-bouton-outils);
  margin-top: calc(var(--hauteur-bouton-outils) / -2);
  /* Au-dessus du cache blanc qui couvre l'écart sous le lecteur. */
  position: relative;
  z-index: 1;
  font-size: 14px;
  padding: 0 0.6rem;
}
.outils-editeur img {
  display: block;
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.mode-audio .barre {
  padding-top: var(--panneaux-decalage);
}
/* Statut de session (publication) dans la barre d'actions */
.statut-session {
  font-size: 0.8rem;
  white-space: nowrap;
  color: #555;
}
.statut-session.sale {
  color: #a05a00;
}
.statut-session.publie {
  color: #2e7d32;
}
.statut-session.divergence {
  color: #b3261e;
  max-width: 34rem;
  white-space: normal;
  line-height: 1.25;
}
.publier-maintenant {
  padding: 0.3rem 0.8rem;
  border: 1px solid #2e7d32;
  color: #2e7d32;
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
}
.publier-maintenant:hover {
  background: #edf7ee;
}
/* Hôte <EditorContent> (le contenteditable ProseMirror est stylé dans editeur.css). */
.cadre {
  border: 1px solid #ddd;
  border-top: none;
  border-radius: 0 0 8px 8px;
  padding: 0.8rem 1rem;
  background: #fff;
}
/* Colonne de gauche collante : onglets + panneau, reste visible ; au-delà d'un écran, elle défile en interne.
   Ses points d'épinglage tiennent compte des deux barres épinglées du dessus (en-tête app + barre d'actions).
   La hauteur max est RÉDUITE du même décalage que `top` :
   sinon une liste longue (beaucoup de thèmes) déborderait sous le bord bas de la fenêtre,
   et les derniers thèmes resteraient inaccessibles tant que le texte n'a pas défilé (la colonne collante repart vers le haut). */
.colonne-gauche {
  grid-area: gauche;
  /* Les libellés d'onglets s'adaptent à la largeur de cette colonne (voir plus bas). */
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: sticky;
  top: calc(var(--entete-h) + var(--barre-h) + var(--ecart-haut-panneaux));
  /* Le panneau reste entièrement visible entre la barre fixe et le bas de la fenêtre,
     avec une marge inférieure d'un rem. */
  max-height: calc(100vh - var(--entete-h) - var(--barre-h) - var(--ecart-haut-panneaux) - 1rem);
}
.colonne-gauche.partagee {
  height: calc(100vh - var(--entete-h) - var(--barre-h) - var(--ecart-haut-panneaux) - 1rem);
}
.groupe-outils {
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;
  gap: 0.5rem;
  min-height: 0;
  border-radius: 6px;
}
.contenus-outils {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.partagee .groupe-outils > .defilement-superpose {
  flex: 1;
}
.partagee .groupe-outils :deep(.zone-defilement) {
  flex: 1;
}
.colonne-gauche .onglets button {
  touch-action: none;
  user-select: none;
}
.glissement-onglet {
  user-select: none;
}
.separation-outils {
  flex: 0 0 8px;
  border-radius: 4px;
  background: #dddde7;
  cursor: ns-resize;
  touch-action: none;
}
.separation-outils:hover,
.separation-outils:focus-visible {
  background: #7aa4df;
  outline: 2px solid #1565c0;
}
.zone-depot-bas {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 6;
  min-height: 80px;
  height: 35%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  border: 2px dashed #7aa4df;
  border-radius: 6px;
  background: #edf4ffed;
  color: #15559e;
  font-size: 0.8rem;
  text-align: center;
}
.depot-actif {
  outline: 2px solid #1565c0;
  background-color: #edf4ff;
}
.apercu-onglet {
  position: fixed;
  z-index: 100;
  pointer-events: none;
  padding: 0.4rem 0.7rem;
  border: 1px solid #7aa4df;
  border-radius: 6px;
  background: white;
  box-shadow: 0 3px 12px #0002;
  color: #1565c0;
  font-size: 0.8rem;
}
.regrouper-outils {
  flex: none;
  align-self: flex-end;
  border: none;
  background: none;
  padding: 0.2rem;
  color: #666;
  font: inherit;
  font-size: 0.7rem;
  cursor: pointer;
}
.regrouper-outils:hover {
  color: #1565c0;
  text-decoration: underline;
}
/* Sans consigne de parcours, son emplacement n'ajoute pas d'espace au-dessus du panneau. */
[data-tour="ancre-guide-pp"]:empty {
  display: none;
}
/* Colonne de droite : l'éditeur de transcription et, en vidéo, la zone média. */
/* Poignée de réglage de la largeur du panneau de gauche, posée dans la gouttière
   entre les colonnes ; invisible au repos, visible au survol et au clavier. */
.poignee-largeur {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -0.55rem;
  width: 0.7rem;
  cursor: col-resize;
  touch-action: none;
  border-radius: 5px;
  z-index: 40;
}
.poignee-largeur:hover,
.poignee-largeur:focus-visible {
  background: #e8edf5;
}
.poignee-largeur:focus {
  outline: 2px solid #1565c0;
  outline-offset: -2px;
}
.colonne-droite {
  grid-area: droite;
  display: flex;
  flex-direction: column;
  /* Jamais plus étroit que sa barre de boutons (mesurée au montage). */
  min-width: var(--largeur-min-transcript, 0px);
  /* Le transcript s'étend dans les gouttières de la grille,
     pour ne laisser que cet écart avec les panneaux voisins.
     Volet de droite fermé, il occupe toute la largeur restante. */
  --ecart-panneaux: 0.5rem;
  margin-left: calc(var(--ecart-panneaux) - var(--panneaux-decalage));
  margin-right: calc(-1 * var(--panneaux-decalage));
  transition: margin-right 220ms ease;
  /* En fin de défilement, le bas du transcript laisse la même marge que les panneaux voisins. */
  margin-bottom: 1rem;
}
.notes-ouvert .colonne-droite {
  margin-right: calc(var(--ecart-panneaux) - var(--panneaux-decalage));
}
.volet-notes {
  grid-area: volet;
  display: flex;
  align-items: stretch;
  align-self: start;
  min-width: 0;
  position: sticky;
  z-index: 22;
  top: calc(var(--entete-h) + var(--barre-h) + var(--ecart-haut-panneaux));
  height: calc(100vh - var(--entete-h) - var(--barre-h) - var(--ecart-haut-panneaux) - 1rem);
  max-height: calc(100vh - var(--entete-h) - var(--barre-h) - var(--ecart-haut-panneaux) - 1rem);
  box-sizing: border-box;
}
.volet-notes:not(.ouvert) {
  visibility: hidden;
}
/* Le contenu garde sa largeur pendant l'ouverture : le volet le dévoile sans le recomposer. */
.cadre-notes {
  position: absolute;
  inset: 0;
  overflow: clip;
}
.cadre-notes > .panneau,
.cadre-notes > .fenetre-journal {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: max(240px, var(--volet-notes-largeur-ajustee));
  box-sizing: border-box;
  border-radius: 8px;
  overflow-y: auto;
}
/* Poignée de réglage de la largeur, posée dans l'écart entre le texte et le volet. */
.poignee-volet {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -0.5rem;
  width: 0.5rem;
  cursor: col-resize;
  touch-action: none;
  border-radius: 5px;
  z-index: 25;
}
.poignee-volet:hover,
.poignee-volet:focus-visible {
  background: #e8edf5;
}
.poignee-volet:focus {
  outline: 2px solid #1565c0;
  outline-offset: -2px;
}
.lecteur-barre {
  flex: 1 1 0;
  height: 100%;
  min-width: min-content;
}
.lecteur-barre :deep(.lecteur-audio) {
  height: 100%;
  box-sizing: border-box;
  margin-bottom: 0;
  gap: 0.5rem;
}
/* Le filet des commandes tombe sur le bord droit des onglets (bordure et marge du lecteur déduites). */
.lecteur-barre :deep(.commandes) {
  box-sizing: border-box;
  min-width: calc(var(--largeur-outils) - 0.6rem - 1px);
}
/* Zone média du MODE VIDÉO : lecteur+waveform empilés à gauche ‖ panneau vidéo à droite.
   Collante comme le lecteur audio. Les deux colonnes SE PARTAGENT la largeur :
   le lecteur (flex 1 1) prend ce que la vidéo ne prend pas, et quand on réduit la vidéo,
   la place libérée revient à la barre de son (jamais tronquée). */
.zone-media {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  /* Respire au-dessus de l'éditeur (le bouton vidéo n'est pas collé au cadre). */
  padding-bottom: 0.75rem;
}
.tele {
  flex: 1 1 auto;
  min-width: 260px; /* garde au lecteur une largeur confortable, la vidéo se réduit */
}
/* Bouton ouvrir/fermer la vue vidéo, sous la waveform — aligné à gauche, sobre. */
.video-toggle {
  align-self: flex-start;
  border: 1px solid #dce4ef;
  border-radius: 5px;
  background: #fafdff;
  color: #555;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: ew-resize;
  touch-action: none;
  user-select: none;
  padding: 0.2rem 0.6rem;
  margin-top: 0.1rem;
}
.video-toggle:hover {
  border-color: #2e73d8;
  color: #1565c0;
}
.onglets {
  display: flex;
  flex: none;
  gap: 0.25rem;
}
.onglets button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  border: 1px solid #ddd;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #f0f0f5;
  padding: 0.3rem 0.1rem;
  font-size: 0.78rem;
  cursor: pointer;
}
.colonne-gauche .onglets button {
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.5rem 0.1rem;
}
.onglets button span {
  font-size: 0.75rem;
  font-weight: 600;
}
/* Libellé court par défaut ; le libellé complet s'affiche quand chaque onglet a la place.
   Seuls les onglets de la colonne gauche sont concernés (le panneau de droite garde ses libellés). */
.colonne-gauche .onglets .libelle-long {
  display: none;
}
@container (min-width: 480px) {
  .colonne-gauche .onglets .libelle-long {
    display: inline;
  }
  .colonne-gauche .onglets .libelle-court {
    display: none;
  }
}
.onglets button.actif {
  background: #fff;
  font-weight: 600;
  color: #1565c0;
}
/* Icônes des onglets (glyphes noirs), adoucies sur l'onglet inactif.
   Plus grandes dans la barre gauche (20px).
   L'onglet Anonymisation est un cran plus grand (23px). */
.ico-onglet {
  object-fit: contain;
  opacity: 0.55;
  flex: none;
}
.onglets .ico-onglet {
  width: 20px;
  height: 20px;
}
.onglets button[data-onglet="anon"] .ico-onglet {
  width: 23px;
  height: 23px;
}
.onglets button.actif .ico-onglet {
  opacity: 1;
}
/* --- Onglet Thématique : clic = coder --- */
.barre-aide {
  flex: 1;
  font-size: 0.72rem;
  color: #999;
  align-self: center;
}

/* Corpus distant — bandeau de lecture seule au-dessus de la grille. */
.banniere-ro {
  background: #fff8e6;
  color: #8a6d1a;
  border: 1px solid #ecd9a0;
  border-radius: 8px;
  padding: 0.45rem 0.7rem;
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}

/* --- Recherche/remplacement (Ctrl+F) et journal, affichés dans le volet de droite. */
.barre-recherche {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.fenetre-journal {
  border: 1px solid #ddd;
  background: #fafafe;
}
.fenetre-journal > .panneau {
  border: none;
}
/* Les titres laissent la place à la croix de fermeture du volet. */
.cadre-notes :deep(.corpus-tete) {
  padding-right: 2rem;
}
.fermer-volet {
  position: absolute;
  z-index: 1;
  top: 0.5rem;
  right: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  padding: 0.15rem 0.45rem;
}
.ligne-recherche,
.ligne-remplacement {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.barre-recherche input {
  flex: 1;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.2rem 0.4rem;
  font-size: 0.85rem;
}
.barre-recherche .compte {
  min-width: 2.6rem;
  text-align: center;
  font-size: 0.75rem;
  color: #666;
  white-space: nowrap;
}
.barre-recherche button {
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  padding: 0.15rem 0.45rem;
  font-size: 0.8rem;
}
.barre-recherche button:hover:not(:disabled) {
  background: #eef4ff;
}
.barre-recherche button:disabled {
  opacity: 0.4;
  cursor: default;
}
@media (max-width: 1000px) {
  .grille-ent {
    --volet-notes-largeur: min(320px, 34vw);
  }
}
@media (prefers-reduced-motion: reduce) {
  .grille-ent {
    transition: none;
  }
  .colonne-droite {
    transition: none;
  }
}
</style>
