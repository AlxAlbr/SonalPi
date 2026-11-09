<script setup lang="ts">
import { fournirSonal } from './composables/sonal'
import { erreurGlobale, effacerErreurGlobale, infoGlobale, effacerInfoGlobale } from './erreurs'
import Accueil from './components/accueil/Accueil.vue'
import Corpus from './components/traiter/corpus/Corpus.vue'
import Entretien from './components/traiter/entretien/Entretien.vue'
import RepriseCrash from './components/distant/RepriseCrash.vue'
import DivergenceCopie from './components/distant/DivergenceCopie.vue'
import DesignationAudioDistante from './components/distant/DesignationAudioDistante.vue'
import DialogueAjoutRecueil from './components/organiser/recueils/DialogueAjoutRecueil.vue'
import DialogueAjoutCas from './components/organiser/cas/DialogueAjoutCas.vue'
import PreparerSuivre from './components/preparer/PreparerSuivre.vue'
import AnalyserInterpreter from './components/analyser/AnalyserInterpreter.vue'
import OrganiserExporter from './components/organiser/OrganiserExporter.vue'
import ModaleExportEntretien from './components/traiter/entretien/ModaleExportEntretien.vue'
import BarreOutils from './components/app/BarreOutils.vue'
import GuidagePasAPas from './components/app/GuidagePasAPas.vue'
import AiguillagePremiereOuverture from './components/app/AiguillagePremiereOuverture.vue'
import ResumeParcoursPasAPas from './components/app/ResumeParcoursPasAPas.vue'
import DecouverteExemples from './components/accueil/DecouverteExemples.vue'
import { messageOperationGlobale } from './operationGlobaleCorpus'

// App = COQUILLE. `fournirSonal` crée l'orchestration + les 3 scopes (profil,
// corpus, entretien) et les PROVIDE ;
// chaque composant de vue les INJECTE (utiliserSonal).
// App ne garde que l'en-tête, le fil d'Ariane et les bannières.
const {
  vue,
  etatSauvegarde,
  allerAccueil,
  retourCorpus,
  ouvertId,
  membership,
  refusFormat,
  dossierCourantNom,
  revisionCorpus,
  exportCorpusEnCours,
  casOuverts, recueilsOuverts,
  confirmationAjout, ouvrirDestinationAjout, fermerConfirmationAjout,
  libelleRetourContexte, revenirContexte, navigationContexteEnCours,
  repereAnalyse,
  pasAPas,
  premiereOuvertureCorpus,
} = fournirSonal()
</script>


<template>
  <main class="app" :class="{ 'avec-navigation': vue !== 'accueil' }">
    <header :inert="exportCorpusEnCours">
      <div class="tete">
        <h1>
          SonalPi2 —
          <span class="etat" :class="etatSauvegarde.replace('…', '').replace(' ', '-')">
            {{ etatSauvegarde }}
          </span>
        </h1>
        <nav class="fil" v-if="vue !== 'accueil'">
          <button class="lien-nav" @click="allerAccueil">Accueil</button>
          <span class="sep">›</span>
          <button
            class="lien-nav"
            :class="{ courant: vue !== 'entretien' }"
            :disabled="vue !== 'entretien'"
            @click="retourCorpus"
          >
            Corpus{{ dossierCourantNom ? ' (' + dossierCourantNom + ')' : '' }}
          </button>
          <template v-if="vue === 'entretien'">
            <span class="sep">›</span>
            <span class="lien-nav courant">
              Entretien ({{ (ouvertId && membership[ouvertId]?.titre) || 'sans titre' }})
            </span>
          </template>
        </nav>
      </div>
    </header>
    <BarreOutils />
    <div class="contenu-app">

      <div class="contexte-app">
        <ResumeParcoursPasAPas v-if="pasAPas && vue !== 'accueil'" />

        <div v-if="refusFormat" class="banniere refus">{{ refusFormat }}</div>

        <div v-if="messageOperationGlobale" class="banniere attente" role="status">
          <span class="indicateur-attente" aria-hidden="true"></span>
          <span>{{ messageOperationGlobale }}</span>
        </div>

        <!-- Bannière globale : rejets IPC non catchés (verrou refusé,
             hors ligne, divergence détectée). Fermable ; toute nouvelle erreur
             remplace la précédente. -->
        <div v-if="erreurGlobale" class="banniere refus">
          <span>{{ erreurGlobale }}</span>
          <button class="fermer" title="Fermer" @click="effacerErreurGlobale">×</button>
        </div>

        <!-- Bannière jumelle, ton info : événements rattrapés par l'app (ex.
             bascule automatique après suppression du dossier du corpus courant). -->
        <div v-if="infoGlobale" class="banniere info">
          <span>{{ infoGlobale }}</span>
          <button class="fermer" title="Fermer" @click="effacerInfoGlobale">×</button>
        </div>

        <div v-if="libelleRetourContexte" class="retour-contexte" :inert="exportCorpusEnCours">
          <button :disabled="navigationContexteEnCours" @click="revenirContexte">← {{ libelleRetourContexte }}</button>
        </div>
        <div v-if="confirmationAjout && vue === 'entretien'" class="banniere info confirmation-ajout" role="status">
          Passage ajouté. Ouvrir la destination reste facultatif.
          <button v-for="destination in confirmationAjout.destinations" :key="destination.id" @click="ouvrirDestinationAjout(destination.id)">Ouvrir {{ confirmationAjout.type === 'cas' ? 'le cas' : 'le recueil' }} « {{ destination.nom }} »</button>
          <button aria-label="Fermer la confirmation" @click="fermerConfirmationAjout">×</button>
        </div>
        <div v-if="repereAnalyse && vue === 'analyser'" class="banniere info">
          <span>Corpus exemple pour l’analyse. Vous pouvez modifier cette copie. Choisissez un thème puis cliquez sur « Calculer », ou explorez Lexico.</span>
          <button aria-label="Masquer le repère du corpus exemple" @click="repereAnalyse = false">×</button>
        </div>
      </div>
      <Accueil v-show="vue === 'accueil'" />
      <Corpus v-show="vue === 'corpus'" />
      <!-- Les brouillons des espaces sont conservés jusqu'au changement de corpus. -->
      <PreparerSuivre :key="`preparer-${revisionCorpus}`" v-show="vue === 'preparer'" />
      <AnalyserInterpreter :key="`analyser-${revisionCorpus}`" v-show="vue === 'analyser'" />
      <OrganiserExporter v-show="vue === 'organiser'" />
      <!-- Entretien en v-show : l'éditeur TipTap reste MONTÉ d'un écran à l'autre. -->
      <Entretien v-show="vue === 'entretien'" />

      <!-- Une seule instance accompagne le parcours dans les vues qui fournissent ses ancres. -->
      <GuidagePasAPas />
      <DecouverteExemples />

      <!-- Reprise crash : orphelins détectés à l'ouverture d'un corpus distant ;
           téléporté, ne s'affiche QUE si la liste est non vide. -->
      <RepriseCrash />

      <!-- Fusion assistée : copie de divergence proposée à la réouverture de l'entretien concerné. -->
      <DivergenceCopie />

      <!-- Désignation audio distante : navigation Nextcloud + micro-session ;
           ne s'affiche que si demandée. -->
      <DesignationAudioDistante />
      <DialogueAjoutCas v-if="casOuverts" :key="revisionCorpus" />
      <DialogueAjoutRecueil v-if="recueilsOuverts" :key="revisionCorpus" />
      <!-- Aiguillage de première ouverture : par-dessus l'accueil de
           « Préparer et suivre », il ne s'affiche qu'une fois par corpus et par poste. -->
      <AiguillagePremiereOuverture v-if="premiereOuvertureCorpus" />
      <ModaleExportEntretien />
    </div>
  </main>
</template>

<style scoped>
/* COQUILLE uniquement : en-tête, fil d'Ariane, bannières.
 * La typographie de base et le vocabulaire partagé sont dans styles/base.css ;
 * l'éditeur dans styles/editeur.css ;
 * le reste vit dans le <style scoped> de chaque vue. */
.app {
  max-width: 1250px;
  margin: 1.2rem auto 0;
  padding: 0 1rem;
  --entete-h: 3.6rem;
}
.app.avec-navigation {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  column-gap: 0;
  row-gap: 0;
  align-items: start;
}
.app.avec-navigation > header {
  grid-column: 1 / -1;
  width: 100%;
}
.contenu-app {
  min-width: 0;
  max-width: 1250px;
  padding-left: 0.75rem;
}
/* En-tête épinglé en haut de la fenêtre : toujours visible (Accueil,
   fil d'Ariane). Il conserve sa place dans le flux (sticky, pas fixed). */
.app header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: #fff;
  box-sizing: border-box;
  min-height: var(--entete-h);
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-bottom: 1px solid #e5e5ef;
}
h1 {
  display: flex;
  align-items: center;
  font-size: 1.1rem;
  margin: 0;
  line-height: 1.2;
}
.tete {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  max-width: 1250px;
  /* Le filet de l'en-tête compte dans la hauteur sur laquelle s'alignent les éléments épinglés. */
  min-height: calc(var(--entete-h) - 1px);
  margin: 0 auto;
  padding: 0 1rem;
}
.contexte-app {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 950px;
  margin: 0 auto;
}
.retour-contexte {
  display: flex;
  justify-content: center;
  width: 100%;
}
h1 small {
  color: #999;
  font-weight: 400;
}
.etat {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.5rem;
  border-radius: 10px;
  margin-left: 0.5rem;
  vertical-align: middle;
}
.etat.à-jour {
  background: #e3f2fd;
  color: #1565c0;
}
.etat.modifié {
  background: #fff3e0;
  color: #b06e0f;
}
.etat.sauvegarde {
  background: #e3f2fd;
  color: #1565c0;
}
.banniere {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  margin-bottom: 0.8rem;
}
.banniere.refus {
  background: #fdecea;
  color: #b3261e;
  border: 1px solid #f3b4ad;
}
.banniere.info {
  background: #e3f2fd;
  color: #0d47a1;
  border: 1px solid #c3dbf5;
}
.banniere.attente {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  background: #f3f0ff;
  color: #4527a0;
  border: 1px solid #d8cff5;
}
.indicateur-attente {
  width: 0.8rem;
  height: 0.8rem;
  flex: none;
  border: 2px solid #b7a9e8;
  border-top-color: #4527a0;
  border-radius: 50%;
  animation: tourner-attente 0.8s linear infinite;
}
@keyframes tourner-attente {
  to { transform: rotate(360deg); }
}
.banniere .fermer {
  float: right;
  border: none;
  background: none;
  color: inherit;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.2rem;
}
.retour-contexte { margin: .5rem 0; }
.retour-contexte button { cursor: pointer; padding: .4rem .7rem; }
.confirmation-ajout { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }

/* --- Fil d'Ariane (navigation 3 écrans) --- */
.fil {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: 1rem;
  min-width: 0;
  font-size: 0.85rem;
}
.lien-nav {
  border: none;
  background: none;
  color: #1565c0;
  cursor: pointer;
  padding: 0.1rem 0.2rem;
  font-size: 0.85rem;
}
.lien-nav.courant {
  color: #1a1a1a;
  font-weight: 600;
  cursor: default;
}
.fil .sep {
  color: #bbb;
}
@media (max-width: 1080px) {
  .fil { margin-left: 0.7rem; }
}
</style>
