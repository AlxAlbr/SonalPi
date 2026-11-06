<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { EditorContent } from '@tiptap/vue-3'
import LecteurAudio from './LecteurAudio.vue'
import VideoPanel from './VideoPanel.vue'
import MenuContexte from './MenuContexte.vue'
import EditionCommentaire from './EditionCommentaire.vue'
import PanneauAccueilEntretien from './PanneauAccueilEntretien.vue'
import PanneauAnonymisationEntretien from './PanneauAnonymisationEntretien.vue'
import PanneauDonneesEntretien from './PanneauDonneesEntretien.vue'
import PanneauJournalEntretien from './PanneauJournalEntretien.vue'
import PanneauLocuteursEntretien from './PanneauLocuteursEntretien.vue'
import PanneauNotesEntretien from './PanneauNotesEntretien.vue'
import PanneauThemesEntretien from './PanneauThemesEntretien.vue'
import { utiliserSonal } from '../../../composables/sonal'
// Icônes des onglets (glyphe noir à plat).
import icoThemes from '../../../assets/icones/themes.png'
import icoLocuteurs from '../../../assets/icones/locuteurs.png'
import icoDonnees from '../../../assets/icones/donnees.png'
import icoJournal from '../../../assets/icones/journal.png'
import icoNotes from '../../../assets/icones/notes.png'
import icoMaison from '../../../assets/icones/maison.png'
import icoAnon from '../../../assets/icones/anon.png'

const {
  ongletDroite,
  rechercheOuverte,
  rechercheTexte,
  remplacementTexte,
  occurrencesRecherche,
  indexRecherche,
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
  editerCommentaire,
  fermerEditionCommentaire,
  validerCommentaire,
  supprimerCommentaire,
  retirerCodageMenu,
  editor,
  retourCorpus,
  audio,
  verrouAutrui,
  statutSession,
  publiErreur,
  publierMaintenant,
  afficherCasPourAssociation,
  afficherRecueilsPourAssociation,
} = utiliserSonal()
const voletNotesOuvert = ref(false)
const largeurNotesPersonnalisee = ref<number | null>(null)
const ignorerClicNotes = ref(false)
const redimensionnementNotesActif = ref(false)
const largeurMinimaleNotes = 240
let xDebutGlissementNotes: number | null = null
let largeurDebutGlissementNotes = 0
let idPointeurNotes: number | null = null
let glissementNotesActif = false
let glissementDepuisReplie = false
let positionsPointeurNotes: Array<{ x: number; temps: number }> = []
let animationInertieNotes: number | null = null

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

onBeforeUnmount(() => {
  if (animationInertieNotes !== null) cancelAnimationFrame(animationInertieNotes)
})

function ouvrirCasDepuisSelection() {
  fermerMenu()
  void afficherCasPourAssociation()
}

function ouvrirRecueilsDepuisSelection() {
  fermerMenu()
  void afficherRecueilsPourAssociation()
}

function ouvrirVoletNotes() {
  voletNotesOuvert.value = true
}

function basculerNotes() {
  voletNotesOuvert.value = !voletNotesOuvert.value
}

function largeurNotesFermee(): number {
  const grille = document.querySelector<HTMLElement>('.grille-ent')
  if (!grille) return 52
  const largeur = getComputedStyle(grille).getPropertyValue('--volet-notes-largeur-fermee')
  const racine = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.parseFloat(largeur) * racine
}

async function commencerGlissementNotes(event: PointerEvent) {
  if (event.button !== 0) return
  if (animationInertieNotes !== null) {
    cancelAnimationFrame(animationInertieNotes)
    animationInertieNotes = null
    redimensionnementNotesActif.value = false
  }
  const volet = document.querySelector<HTMLElement>('.volet-notes')
  const panneau = document.querySelector<HTMLElement>('#panneau-notes-entretien')
  if (!volet || !panneau) return
  xDebutGlissementNotes = event.clientX
  glissementDepuisReplie = !voletNotesOuvert.value
  largeurDebutGlissementNotes = glissementDepuisReplie
    ? volet.getBoundingClientRect().width
    : panneau.getBoundingClientRect().width
  idPointeurNotes = event.pointerId
  glissementNotesActif = false
  positionsPointeurNotes = [{ x: event.clientX, temps: performance.now() }]
  redimensionnementNotesActif.value = true
  const bouton = event.currentTarget as HTMLButtonElement
  bouton.setPointerCapture(event.pointerId)
  await nextTick()
  if (idPointeurNotes !== event.pointerId) return
  largeurDebutGlissementNotes = glissementDepuisReplie
    ? volet.getBoundingClientRect().width
    : panneau.getBoundingClientRect().width
}

function glisserNotes(event: PointerEvent) {
  if (event.pointerId !== idPointeurNotes || xDebutGlissementNotes === null) return
  const deplacement = xDebutGlissementNotes - event.clientX
  if (!glissementNotesActif && Math.abs(deplacement) < 4) return
  glissementNotesActif = true
  redimensionnementNotesActif.value = true
  const largeurMax = Math.max(240, window.innerWidth * 0.85)
  largeurNotesPersonnalisee.value = Math.max(
    largeurNotesFermee(),
    Math.min(largeurMax, largeurDebutGlissementNotes + deplacement),
  )
  voletNotesOuvert.value = true
  const temps = performance.now()
  positionsPointeurNotes.push({ x: event.clientX, temps })
  positionsPointeurNotes = positionsPointeurNotes.filter((position) => temps - position.temps <= 120)
}

function terminerGlissementNotesAuRepos() {
  if (largeurNotesPersonnalisee.value !== null && largeurNotesPersonnalisee.value < largeurMinimaleNotes) {
    voletNotesOuvert.value = false
    largeurNotesPersonnalisee.value = null
  }
  redimensionnementNotesActif.value = false
}

function lancerInertieNotes(vitesse: number) {
  const largeurFermee = largeurNotesFermee()
  const limiteLargeur = Math.max(240, window.innerWidth * 0.85)
  let derniereImage = performance.now()
  const dureeFreinage = 140
  const animer = (temps: number) => {
    const ecoule = Math.min(temps - derniereImage, 32)
    derniereImage = temps
    const facteur = Math.exp(-ecoule / dureeFreinage)
    const deplacement = vitesse * dureeFreinage * (1 - facteur)
    const largeur = largeurNotesPersonnalisee.value ?? 0
    const largeurMin = vitesse < 0 ? largeurFermee : 0
    const nouvelleLargeur = Math.max(largeurMin, Math.min(limiteLargeur, largeur + deplacement))
    largeurNotesPersonnalisee.value = nouvelleLargeur
    vitesse *= facteur

    if (Math.abs(vitesse) < 0.04 || nouvelleLargeur === largeur) {
      animationInertieNotes = null
      terminerGlissementNotesAuRepos()
      return
    }
    animationInertieNotes = requestAnimationFrame(animer)
  }
  animationInertieNotes = requestAnimationFrame(animer)
}

function terminerGlissementNotes(event: PointerEvent) {
  if (event.pointerId !== idPointeurNotes) return
  if (glissementNotesActif) {
    ignorerClicNotes.value = true
    window.setTimeout(() => {
      ignorerClicNotes.value = false
    }, 0)
  }
  const temps = performance.now()
  const derniersMouvements = positionsPointeurNotes.filter((position) => temps - position.temps <= 120)
  const premierMouvement = derniersMouvements[0]
  const dernierMouvement = derniersMouvements[derniersMouvements.length - 1]
  const duree = dernierMouvement && premierMouvement
    ? dernierMouvement.temps - premierMouvement.temps
    : 0
  const vitesse = dernierMouvement && premierMouvement && duree > 0
    ? Math.max(-1.8, Math.min(1.8, (premierMouvement.x - dernierMouvement.x) / duree))
    : 0
  xDebutGlissementNotes = null
  idPointeurNotes = null
  positionsPointeurNotes = []
  const vitesseInertie = event.type === 'pointercancel' ? 0 : vitesse
  if (glissementNotesActif && Math.abs(vitesseInertie) >= 0.12) {
    lancerInertieNotes(vitesseInertie)
    glissementNotesActif = false
    glissementDepuisReplie = false
    return
  }
  if (glissementNotesActif) terminerGlissementNotesAuRepos()
  glissementNotesActif = false
  glissementDepuisReplie = false
}

function cliquerNotes() {
  if (ignorerClicNotes.value) {
    ignorerClicNotes.value = false
    return
  }
  basculerNotes()
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
        }"
        :style="largeurNotesPersonnalisee !== null
          ? { '--volet-notes-largeur-personnalisee': `${largeurNotesPersonnalisee}px` }
          : undefined"
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
            <LecteurAudio />
          </div>
          <button class="retour" @click="retourCorpus">Retour au niveau Corpus</button>
        </div>

        <!-- Colonne GAUCHE : onglets + panneau de l'onglet actif ;
             collante, à défilement interne au-delà d'un écran,
             pour rester visible pendant la lecture. -->
        <div class="colonne-gauche">
          <nav class="onglets">
              <!-- Onglets réduits à l'ICONE : le titre apparaît au survol (title),
                et sur le panneau d'accueil (vue d'ensemble).
                L'ACCUEIL vient en PREMIER et par DÉFAUT : accueil de l'utilisateur,
                conseils et liste des autres onglets (icone + titre). -->
            <button data-onglet="maison" :class="{ actif: ongletDroite === 'maison' }" title="Accueil" @click="ongletDroite = 'maison'">
              <img class="ico-onglet" :src="icoMaison" alt="Accueil" />
            </button>
            <button data-onglet="locuteurs" data-tour="onglet-locuteurs" :class="{ actif: ongletDroite === 'locuteurs' }" title="Locuteurs" @click="ongletDroite = 'locuteurs'">
              <img class="ico-onglet" :src="icoLocuteurs" alt="Locuteurs" />
            </button>
            <button data-onglet="anon" :class="{ actif: ongletDroite === 'anon' }" title="Pseudonymisation du texte" @click="ongletDroite = 'anon'">
              <img class="ico-onglet" :src="icoAnon" alt="Pseudonymisation du texte" />
            </button>
            <button data-onglet="themes" data-tour="onglet-themes" :class="{ actif: ongletDroite === 'themes' }" title="Thématiques" @click="ongletDroite = 'themes'">
              <img class="ico-onglet" :src="icoThemes" alt="Thématiques" />
            </button>
            <button data-onglet="donnees" data-tour="onglet-donnees" :class="{ actif: ongletDroite === 'donnees' }" title="Données" @click="ongletDroite = 'donnees'">
              <img class="ico-onglet" :src="icoDonnees" alt="Données" />
            </button>
            <button data-onglet="journal" :class="{ actif: ongletDroite === 'journal' }" title="Journal" @click="ongletDroite = 'journal'">
              <img class="ico-onglet" :src="icoJournal" alt="Journal" />
            </button>
          </nav>

          <!-- La consigne reste au même endroit quand l'utilisateur change d'outil. -->
          <div data-tour="ancre-guide-pp"></div>

          <PanneauAccueilEntretien
            v-show="ongletDroite === 'maison'"
            @ouvrir-notes="ouvrirVoletNotes"
          />

          <PanneauThemesEntretien
            v-show="ongletDroite === 'themes'"
            :lecture-seule-contenu="roContenu"
          />

          <PanneauLocuteursEntretien
            v-show="ongletDroite === 'locuteurs'"
            :actif="ongletDroite === 'locuteurs'"
            :lecture-seule="roContenu"
          />

          <PanneauDonneesEntretien
            v-show="ongletDroite === 'donnees'"
            :lecture-seule="roContenu"
          />

          <PanneauJournalEntretien
            v-show="ongletDroite === 'journal'"
            :lecture-seule="roContenu"
          />

          <PanneauAnonymisationEntretien
            v-show="ongletDroite === 'anon'"
            :actif="ongletDroite === 'anon'"
            :lecture-seule-contenu="roContenu"
          />
        </div>

        <!-- Colonne DROITE : éditeur en audio ; en vidéo, zone média épinglée
             (lecteur + waveform EMPILÉS à gauche ‖ panneau vidéo à droite)
             puis éditeur pleine largeur dessous. -->
        <div class="colonne-droite">
          <div v-if="estVideo" class="zone-media">
            <div class="tele">
              <LecteurAudio :empile="true" />
              <!-- Ouvrir ou fermer la vidéo laisse toute la place disponible au lecteur. -->
              <button class="video-toggle" :title="videoVisible ? 'Masquer la vidéo' : 'Afficher la vidéo'" @click="toggleVideo">
                {{ videoVisible ? '▾ Masquer la vidéo' : '▸ Afficher la vidéo' }}
              </button>
            </div>
            <VideoPanel v-show="videoVisible" />
          </div>
          <EditorContent :editor="editor" class="cadre" />
        </div>

        <aside class="volet-notes" :class="{ ouvert: voletNotesOuvert }">
          <div class="cadre-notes">
            <PanneauNotesEntretien
              id="panneau-notes-entretien"
              :class="{ replie: !voletNotesOuvert }"
              :lecture-seule="roContenu"
            />
          </div>
          <div class="onglets notes-languette">
            <button
              data-onglet="notes"
              data-tour="onglet-notes"
              :class="{ actif: voletNotesOuvert }"
              :aria-expanded="voletNotesOuvert"
              aria-controls="panneau-notes-entretien"
              title="Notes — faites glisser pour redimensionner"
              @pointerdown="commencerGlissementNotes"
              @pointermove="glisserNotes"
              @pointerup="terminerGlissementNotes"
              @pointercancel="terminerGlissementNotes"
              @click="cliquerNotes"
            >
              <img class="ico-onglet" :src="icoNotes" alt="" draggable="false" />
              <span>Notes</span>
            </button>
          </div>
        </aside>
      </div>

      <!-- Boîte recherche/remplacement (ouverte par Ctrl+F) : flottante en bas à droite,
           visible quel que soit le défilement du texte. Entrée = occurrence suivante,
           Échap ferme ; le remplacement est masqué si le verrou d'autrui fige
           l'entretien (roContenu). -->
      <div v-if="rechercheOuverte" class="barre-recherche">
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
          <button class="fermer" title="Fermer (Échap)" @click="fermerRecherche">✕</button>
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

    </section>
</template>

<style scoped>
.grille-ent {
  display: grid;
  --volet-notes-largeur: min(360px, 34vw);
  --volet-notes-largeur-fermee: 3.25rem;
  --volet-notes-largeur-ajustee: min(var(--volet-notes-largeur-personnalisee, var(--volet-notes-largeur)), 85vw);
  --volet-notes-colonne: min(var(--volet-notes-largeur-ajustee), var(--volet-notes-largeur));
  --panneaux-decalage: 1rem;
  grid-template-columns: 400px minmax(0, 1fr) var(--volet-notes-largeur-fermee);
  gap: 1rem;
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
  --volet-notes-decalage: calc(var(--volet-notes-colonne) - var(--volet-notes-largeur-ajustee));
  grid-template-columns: 400px minmax(0, 1fr) var(--volet-notes-colonne);
}
.grille-ent.redimensionnement-notes {
  transition: none;
}
.grille-ent.redimensionnement-notes .cadre-notes,
.grille-ent.redimensionnement-notes .notes-languette {
  transition: none;
}
.retour {
  margin-left: auto;
  padding: 0.3rem 0.8rem;
  border: 1px solid #bbb;
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
}
.barre {
  grid-area: barre;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  /* Le retour au corpus reste à droite des statuts. */
  /* Barre d'actions épinglée juste sous l'en-tête de l'appli (--entete-h est défini dans App.vue).
     Fond opaque pour masquer le contenu qui glisse. */
  position: sticky;
  top: var(--entete-h);
  z-index: 30;
  background: #fff;
  height: var(--barre-h);
  box-sizing: border-box;
}
.mode-audio .retour {
  align-self: stretch;
  box-sizing: border-box;
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
  border-radius: 8px;
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
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: sticky;
  top: calc(var(--entete-h) + var(--barre-h) + var(--panneaux-decalage));
  /* Le panneau reste entièrement visible entre la barre fixe et le bas de la fenêtre,
     avec une marge inférieure d'un rem. */
  max-height: calc(100vh - var(--entete-h) - var(--barre-h) - var(--panneaux-decalage) - 1rem);
  overflow-y: auto;
}
/* Colonne de droite : l'éditeur de transcription et, en vidéo, la zone média. */
.colonne-droite {
  grid-area: droite;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.volet-notes {
  grid-area: volet;
  display: flex;
  align-items: stretch;
  align-self: start;
  min-width: 0;
  position: sticky;
  transform: translateX(calc(var(--panneaux-decalage) - 2px));
  z-index: 22;
  top: calc(var(--entete-h) + var(--barre-h) + var(--panneaux-decalage));
  height: calc(100vh - var(--entete-h) - var(--barre-h) - var(--panneaux-decalage) - 1rem);
  max-height: calc(100vh - var(--entete-h) - var(--barre-h) - var(--panneaux-decalage) - 1rem);
  box-sizing: border-box;
}
.cadre-notes {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--volet-notes-largeur-ajustee);
  min-width: 0;
  height: 100%;
  overflow: clip;
  transition: transform 220ms ease;
}
.cadre-notes > .panneau {
  position: absolute;
  top: 0;
  left: 0;
  width: max(240px, var(--volet-notes-largeur-ajustee));
  height: 100%;
  box-sizing: border-box;
  border-right: 0;
  border-radius: 8px 0 0 8px;
  padding-right: 1rem;
  overflow-y: auto;
}
.volet-notes:not(.ouvert) > .cadre-notes {
  top: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  overflow: clip;
  pointer-events: none;
}
.volet-notes:not(.ouvert) .cadre-notes > .panneau {
  left: 0;
  right: auto;
  width: var(--volet-notes-largeur-ajustee);
  padding: 0;
  overflow: hidden;
  pointer-events: none;
}
.volet-notes:not(.ouvert) .cadre-notes > .panneau > * {
  visibility: hidden;
}
.notes-languette {
  position: absolute;
  z-index: 25;
  top: 50%;
  left: -1.375rem;
  width: 2.75rem;
  transform: translateY(-50%);
  transition: translate 220ms ease;
}
.volet-notes:not(.ouvert) .notes-languette {
  left: -1.375rem;
}
.volet-notes.ouvert > .cadre-notes > .panneau {
  order: 1;
  padding-left: 2.25rem;
}
.volet-notes.ouvert > .cadre-notes {
  transform: translateX(var(--volet-notes-decalage));
}
.volet-notes.ouvert .notes-languette {
  left: -1.375rem;
  translate: var(--volet-notes-decalage) 0;
}
.notes-languette button {
  border: 1px solid #ddd;
  flex-direction: column;
  gap: 0.45rem;
  width: 100%;
  min-height: 6rem;
  box-sizing: border-box;
  padding: 0.4rem 0.2rem;
  border-radius: 6px;
}
.volet-notes .notes-languette button {
  border-bottom: 1px solid #ddd;
  border-radius: 6px;
}
.notes-languette button span {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 0.75rem;
  font-weight: 600;
}
.notes-languette .ico-onglet {
  width: 20px;
  height: 20px;
}
.notes-languette button:focus-visible {
  outline: 2px solid #1565c0;
  outline-offset: 2px;
  z-index: 1;
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
}
/* Zone média du MODE VIDÉO : lecteur+waveform empilés à gauche ‖ panneau vidéo à droite.
   Collante comme le lecteur audio. Les deux colonnes SE PARTAGENT la largeur :
   le lecteur (flex 1 1) prend ce que la vidéo ne prend pas, et quand on réduit la vidéo,
   la place libérée revient à la barre de son (jamais tronquée). */
.zone-media {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  position: sticky;
  top: calc(var(--entete-h) + var(--barre-h));
  z-index: 20;
  background: #fff;
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
.onglets button.actif {
  background: #fff;
  font-weight: 600;
  color: #1565c0;
}
/* Icônes des onglets (glyphes noirs), adoucies sur l'onglet inactif.
   Plus grandes dans la barre gauche (20px) ; la liste d'accueil garde sa taille propre (20px, cf. .liste-tours).
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

/* --- Boîte recherche/remplacement (Ctrl+F) --------------------------------
 * Flottante en bas à droite de la fenêtre : visible quel que soit le
 * défilement du texte, sans recouvrir le lecteur audio ni les onglets. */
.barre-recherche {
  position: fixed;
  bottom: 0.8rem;
  right: 0.8rem;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  padding: 0.5rem;
}
.ligne-recherche,
.ligne-remplacement {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.barre-recherche input {
  width: 13rem;
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
.barre-recherche .fermer {
  color: #888;
}
@media (max-width: 1000px) {
  .grille-ent {
    grid-template-columns: minmax(180px, 32vw) minmax(0, 1fr) var(--volet-notes-largeur-fermee);
  }
  .grille-ent.notes-ouvert {
    --volet-notes-largeur: min(320px, 34vw);
    grid-template-columns: minmax(180px, 32vw) minmax(0, 1fr) var(--volet-notes-colonne);
  }
  .grille-ent:not(.notes-ouvert) {
    --volet-notes-largeur: min(320px, 34vw);
  }
}
@media (prefers-reduced-motion: reduce) {
  .grille-ent {
    transition: none;
  }
  .cadre-notes,
  .notes-languette {
    transition: none;
  }
}
</style>
