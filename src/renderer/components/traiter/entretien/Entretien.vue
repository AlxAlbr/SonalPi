<script setup lang="ts">
import { computed } from 'vue'
import { EditorContent } from '@tiptap/vue-3'
import LecteurAudio from './LecteurAudio.vue'
import VideoPanel from './VideoPanel.vue'
import MenuContexte from './MenuContexte.vue'
import EditionCommentaire from './EditionCommentaire.vue'
import ResumeAssociationsPassage from './ResumeAssociationsPassage.vue'
import PanneauAnonymisationEntretien from './PanneauAnonymisationEntretien.vue'
import PanneauDonneesEntretien from './PanneauDonneesEntretien.vue'
import PanneauLocuteursEntretien from './PanneauLocuteursEntretien.vue'
import PanneauNotesEntretien from './PanneauNotesEntretien.vue'
import PanneauThemesEntretien from './PanneauThemesEntretien.vue'
import { utiliserSonal } from '../../../composables/sonal'

const {
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
  audio,
  verrouAutrui,
  statutSession,
  publiErreur,
  publierMaintenant,
  afficherCasPourAssociation,
  afficherRecueilsPourAssociation,
} = utiliserSonal()

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

function ouvrirCasDepuisSelection() {
  fermerMenu()
  void afficherCasPourAssociation()
}

function ouvrirRecueilsDepuisSelection() {
  fermerMenu()
  void afficherRecueilsPourAssociation()
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
      <div class="grille-ent" :class="{ 'avec-barre': statutSession.etat !== 'aucune' }">
        <div v-if="statutSession.etat !== 'aucune'" class="barre">
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
        </div>

        <section class="rangee-panneaux rangee-superieure" aria-label="Locuteurs et thématiques">
          <div class="panneau-outil panneau-locuteurs">
            <div data-tour="ancre-guide-pp-locuteurs"></div>
            <PanneauLocuteursEntretien
              :actif="true"
              :lecture-seule="roContenu"
            />
          </div>
          <div class="panneau-outil panneau-themes">
            <div data-tour="ancre-guide-pp"></div>
            <PanneauThemesEntretien
              :lecture-seule-contenu="roContenu"
            />
          </div>
        </section>

        <div class="colonne-droite">
          <div v-if="!estVideo" class="lecteur-ancre">
            <LecteurAudio />
          </div>
          <div v-else class="zone-media">
            <div class="tele">
              <LecteurAudio :empile="true" />
              <!-- Ouvrir ou fermer la vidéo laisse toute la place disponible au lecteur. -->
              <button class="video-toggle" :title="videoVisible ? 'Masquer la vidéo' : 'Afficher la vidéo'" @click="toggleVideo">
                {{ videoVisible ? '▾ Masquer la vidéo' : '▸ Afficher la vidéo' }}
              </button>
            </div>
            <VideoPanel v-show="videoVisible" />
          </div>
          <ResumeAssociationsPassage />
          <EditorContent :editor="editor" class="cadre" />
        </div>

        <section class="rangee-panneaux rangee-inferieure" aria-label="Notes, pseudonymisation et données">
          <div class="panneau-outil panneau-notes">
            <div data-tour="ancre-guide-pp-notes"></div>
            <PanneauNotesEntretien :lecture-seule="roContenu" />
          </div>
          <div class="panneau-outil panneau-anon">
            <PanneauAnonymisationEntretien
              :actif="true"
              :lecture-seule-contenu="roContenu"
            />
          </div>
          <div class="panneau-outil panneau-donnees">
            <div data-tour="ancre-guide-pp-donnees"></div>
            <PanneauDonneesEntretien :lecture-seule="roContenu" />
          </div>
        </section>
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
  grid-template-columns: minmax(0, 1fr);
  gap: 0.65rem;
  align-items: start;
  grid-template-areas:
    'superieur'
    'droite'
    'inferieur';
  /* Hauteur de la barre d'actions (ci-dessous), pour caler les colonnes. */
  --barre-h: 2.4rem;
}
.grille-ent.avec-barre {
  grid-template-areas:
    'barre'
    'superieur'
    'droite'
    'inferieur';
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
.rangee-panneaux {
  display: grid;
  gap: 0.65rem;
  min-width: 0;
  align-items: stretch;
}
.rangee-superieure {
  grid-area: superieur;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  position: sticky;
  top: calc(var(--entete-h) + var(--barre-h) + 0.4rem);
  z-index: 25;
}
.rangee-inferieure {
  grid-area: inferieur;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  position: sticky;
  bottom: 0.4rem;
  z-index: 25;
}
.panneau-outil {
  box-sizing: border-box;
  height: 9rem;
  min-height: 9rem;
  min-width: 0;
  align-self: start;
}
.panneau-outil :deep(.panneau) {
  box-sizing: border-box;
  height: 100%;
  min-width: 0;
  overflow: auto;
  scrollbar-width: thin;
}
.panneau-outil :deep(.corpus-tete) {
  position: sticky;
  top: -0.75rem;
  z-index: 1;
  padding: 0.35rem 0 0.25rem;
  background: #fafafe;
}
.panneau-outil :deep(.corpus-tete h3) {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.panneau-outil :deep(.icone-entete-panneau) {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex: none;
}
/* Entretien : lecteur audio puis éditeur.
   Le lecteur est collant en haut (fond opaque), pour rester visible pendant la lecture ;
   l'éditeur défile dessous. */
.colonne-droite {
  grid-area: droite;
  display: flex;
  flex-direction: column;
  min-width: 0;
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
 * défilement du texte, sans recouvrir les panneaux de l'entretien. */
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
