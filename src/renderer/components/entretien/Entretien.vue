<script setup lang="ts">
import { computed } from 'vue'
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
import { utiliserSonal } from '../../composables/sonal'
// Icônes des onglets (glyphe noir à plat).
import icoThemes from '../../assets/icones/themes.png'
import icoLocuteurs from '../../assets/icones/locuteurs.png'
import icoDonnees from '../../assets/icones/donnees.png'
import icoJournal from '../../assets/icones/journal.png'
import icoNotes from '../../assets/icones/notes.png'
import icoMaison from '../../assets/icones/maison.png'
import icoAnon from '../../assets/icones/anon.png'

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
  sauver,
  retourCorpus,
  exporter,
  audio,
  verrouAutrui,
  statutSession,
  publiErreur,
  publierMaintenant,
} = utiliserSonal()

// Heure locale courte d'un horodatage ISO (« HH:MM »).
const heureDe = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

// Lecture seule du contenu : verrou détenu par autrui ou session dégradée.
const roContenu = computed(
  () => verrouAutrui.value !== null || statutSession.value.etat === 'degrade',
)

// Compteur « i/N » de la boîte recherche/remplacement (vide sans requête).
const compteRecherche = computed(() => {
  if (!rechercheTexte.value.trim()) return ''
  const n = occurrencesRecherche.value.length
  return n === 0 ? '0/0' : `${indexRecherche.value + 1}/${n}`
})
// État partagé du scope média pour l'organisation d'écran (mode vidéo).
const { estVideo, videoVisible, toggleVideo } = audio


</script>

<template>
    <section class="ecran entretien-ecran">
      <!-- Corpus distant : bandeau quand le verrou de CET entretien est tenu par autrui ;
           le bandeau dit qui, et depuis quand. -->
      <div v-if="verrouAutrui" class="banniere-ro">
        🔒 Ouvert en lecture seule — verrou tenu par <b>{{ verrouAutrui.userId }}</b><template v-if="verrouAutrui.acquiredAt">
        depuis {{ new Date(verrouAutrui.acquiredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</template>.
      </div>
      <div class="grille-ent">
        <!-- Ligne d'actions pleine largeur, en HAUT de l'écran : retour corpus,
             Enregistrer, Exporter. Toute la vue ci-dessous (les deux colonnes)
             vient sous cette barre. -->
        <div class="barre">
          <button class="retour" @click="retourCorpus">← Corpus</button>
          <span class="barre-aide">Sélectionne du texte, puis clique un thème (onglet Thématique) pour le coder.</span>
          <!-- Corpus distant, session à nous : statut de publication + « Publier maintenant ».
               En lecture seule (verrou autrui) : rien à publier,
               le bandeau 🔒 au-dessus parle déjà. -->
          <span v-if="statutSession.etat === 'degrade'" class="statut-session divergence">
            ⚠️ Verrou perdu — contenu conservé localement.
          </span>
          <template v-else-if="statutSession.etat === 'a-nous'">
            <span v-if="publiErreur" class="statut-session divergence">⚠️ {{ publiErreur }}</span>
            <span v-else-if="statutSession.sale" class="statut-session sale" title="Publication périodique toutes les 5 min ; le bouton force à la demande.">
              ● modifications non publiées<template v-if="statutSession.dernierPubli"> depuis {{ heureDe(statutSession.dernierPubli) }}</template>
            </span>
            <span v-else class="statut-session publie">☁ publié<template v-if="statutSession.dernierPubli"> à {{ heureDe(statutSession.dernierPubli) }}</template></span>
            <button v-if="!roContenu" class="publier-maintenant" @click="publierMaintenant">Publier maintenant</button>
          </template>
          <button v-if="!roContenu" class="sauver" @click="sauver">Enregistrer</button>
          <button class="exporter" @click="exporter">Exporter .sonal</button>
        </div>

        <!-- Colonne GAUCHE : onglets + panneau de l'onglet actif ;
             collante, à défilement interne au-delà d'un écran,
             pour rester visible pendant la lecture. -->
        <div class="colonne-gauche">
          <nav class="onglets">
            <!-- Onglets réduits à l'ICONE : le titre apparaît au survol (title),
                 et sur le panneau d'accueil (vue d'ensemble).
                 L'ACCUEIL vient en PREMIER et par DÉFAUT : accueil de l'utilisateur,
                 conseils et liste des autres onglets (icone + titre).
                 Les NOTES suivent en DEUXIÈME. -->
            <button data-onglet="maison" :class="{ actif: ongletDroite === 'maison' }" title="Accueil" @click="ongletDroite = 'maison'">
              <img class="ico-onglet" :src="icoMaison" alt="Accueil" />
            </button>
            <button data-onglet="notes" data-tour="onglet-notes" :class="{ actif: ongletDroite === 'notes' }" title="Notes" @click="ongletDroite = 'notes'">
              <img class="ico-onglet" :src="icoNotes" alt="Notes" />
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

          <PanneauAccueilEntretien v-show="ongletDroite === 'maison'" />

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

          <PanneauNotesEntretien
            v-show="ongletDroite === 'notes'"
            :lecture-seule="roContenu"
          />

          <PanneauAnonymisationEntretien
            v-show="ongletDroite === 'anon'"
            :actif="ongletDroite === 'anon'"
            :lecture-seule-contenu="roContenu"
          />

          <!-- Ancre de la consigne « panneau » du pas-à-pas : le guide de l'étape (ex. « Prendre des notes à chaud »)
               s'affiche EN BAS de la colonne de gauche, sous le panneau de l'onglet actif.
               Pas en haut, ni en bulle flottante sur le texte. -->
          <div data-tour="ancre-guide-pp"></div>
        </div>

        <!-- Colonne DROITE : en audio, lecteur (barre d'écoute + waveform)
             collant puis éditeur ; en vidéo, zone média épinglée (lecteur +
             waveform EMPILÉS à gauche ‖ panneau vidéo à droite) puis éditeur
             pleine largeur dessous. -->
        <div class="colonne-droite">
          <template v-if="!estVideo">
            <div class="lecteur-ancre">
              <LecteurAudio />
            </div>
            <EditorContent :editor="editor" class="cadre" />
          </template>
          <template v-else>
            <div class="zone-media">
              <div class="tele">
                <LecteurAudio :empile="true" />
                <!-- Ouvrir/fermer la vue vidéo : quand elle est fermée, la barre de son prend toute la largeur (pas de trou), l'audio continue. -->
                <button class="video-toggle" :title="videoVisible ? 'Masquer la vidéo' : 'Afficher la vidéo'" @click="toggleVideo">
                  {{ videoVisible ? '▾ Masquer la vidéo' : '▸ Afficher la vidéo' }}
                </button>
              </div>
              <VideoPanel v-show="videoVisible" />
            </div>
            <EditorContent :editor="editor" class="cadre" />
          </template>
        </div>
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
        @basculer-exception="basculerException(menuContextuel.anon!.id)"
        @basculer-anonymise="basculerAnonymise(menuContextuel.anon!.id)"
        @basculer-pseudo="basculerPseudoOccurrence(menuContextuel.anon!.id, $event)"
        @retirer-codage="retirerCodageMenu"
        @commenter="commenterDepuisMenu"
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
  grid-template-columns: 400px 1fr;
  gap: 1rem;
  align-items: start;
  grid-template-areas:
    'barre barre'
    'gauche droite';
  /* Hauteur de la barre d'actions (ci-dessous), pour caler les colonnes. */
  --barre-h: 2.4rem;
}
.retour {
  padding: 0.3rem 0.7rem;
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
  /* Barre d'actions épinglée juste sous l'en-tête de l'appli (--entete-h est défini dans App.vue).
     Fond opaque pour masquer le contenu qui glisse. */
  position: sticky;
  top: var(--entete-h);
  z-index: 30;
  background: #fff;
  height: var(--barre-h);
  box-sizing: border-box;
}
.sauver,
.exporter {
  padding: 0.3rem 0.8rem;
  border: 1px solid #bbb;
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
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
  top: calc(var(--entete-h) + var(--barre-h));
  /* `top` ci-dessus vs hauteur d'écran : le panneau doit tenir entre la barre d'actions et le bord bas de la fenêtre,
     sinon son défilement interne garde les derniers éléments visibles SANS toucher au texte.
     Le −1rem compense l'écart de la grille ; à la position naturelle (page en haut),
     le panneau s'appuie sur la ligne « barre » + son gap, soit `top` + gap. */
  max-height: calc(100vh - var(--entete-h) - var(--barre-h) - 1rem);
  overflow-y: auto;
}
/* Colonne de droite : lecteur audio puis éditeur.
   Le lecteur est collant en haut (fond opaque), pour rester visible pendant la lecture ;
   l'éditeur défile dessous. */
.colonne-droite {
  grid-area: droite;
  display: flex;
  flex-direction: column;
}
.lecteur-ancre {
  position: sticky;
  top: calc(var(--entete-h) + var(--barre-h));
  z-index: 20;
  background: #fff;
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
  cursor: pointer;
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
</style>
