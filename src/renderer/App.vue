<script setup lang="ts">
import { fournirSonal } from './composables/sonal'
import { erreurGlobale, effacerErreurGlobale, infoGlobale, effacerInfoGlobale } from './erreurs'
import Accueil from './components/accueil/Accueil.vue'
import Corpus from './components/corpus/Corpus.vue'
import Entretien from './components/entretien/Entretien.vue'
import RepriseCrash from './components/distant/RepriseCrash.vue'
import DivergenceCopie from './components/distant/DivergenceCopie.vue'
import DesignationAudioDistante from './components/distant/DesignationAudioDistante.vue'

// App = COQUILLE. `fournirSonal` crée l'orchestration + les 3 scopes (profil,
// corpus, entretien) et les PROVIDE ;
// chaque composant de vue les INJECTE (utiliserSonal).
// App ne garde que l'en-tête, le fil d'Ariane et les bannières.
const { vue, etatSauvegarde, allerAccueil, retourCorpus, ouvertId, membership, refusFormat, dossierCourantNom } =
  fournirSonal()
</script>


<template>
  <main class="app">
    <header>
      <h1>
        SonalPi2 —
        <span class="etat" :class="etatSauvegarde.replace('…', '').replace(' ', '-')">
          {{ etatSauvegarde }}
        </span>
      </h1>
      <nav class="fil" v-if="vue !== 'accueil'">
        <button class="lien-nav" @click="allerAccueil">Accueil</button>
        <span class="sep">›</span>
        <button class="lien-nav" :class="{ courant: vue === 'corpus' }" :disabled="vue === 'corpus'" @click="retourCorpus">
          Corpus{{ dossierCourantNom ? ' (' + dossierCourantNom + ')' : '' }}
        </button>
        <template v-if="vue === 'entretien'">
          <span class="sep">›</span>
          <span class="lien-nav courant">
            Entretien ({{ (ouvertId && membership[ouvertId]?.titre) || 'sans titre' }})
          </span>
        </template>
      </nav>
    </header>

    <div v-if="refusFormat" class="banniere refus">{{ refusFormat }}</div>

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

    <Accueil v-show="vue === 'accueil'" />
    <Corpus v-show="vue === 'corpus'" />
    <!-- Entretien en v-show : l'éditeur TipTap reste MONTÉ d'un écran à l'autre. -->
    <Entretien v-show="vue === 'entretien'" />

    <!-- Reprise crash : orphelins détectés à l'ouverture d'un corpus distant ;
         téléporté, ne s'affiche QUE si la liste est non vide. -->
    <RepriseCrash />

    <!-- Fusion assistée : copie de divergence proposée à la réouverture de l'entretien concerné. -->
    <DivergenceCopie />

    <!-- Désignation audio distante : navigation Nextcloud + micro-session ;
         ne s'affiche que si demandée. -->
    <DesignationAudioDistante />
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
  /* Hauteur de l'en-tête collant (fil d'Ariane / Accueil) ;
     elle sert à épingler la barre d'actions de la vue Entretien, juste en dessous. */
  --entete-h: 4rem;
}
/* En-tête épinglé en haut de la fenêtre : toujours visible (Accueil,
   fil d'Ariane). Il conserve sa place dans le flux (sticky, pas fixed). */
.app header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: #fff;
  box-sizing: border-box;
  height: var(--entete-h);
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-bottom: 1px solid #e5e5ef;
}
h1 {
  font-size: 1.1rem;
  margin: 0;
  line-height: 1.2;
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
/* --- Fil d'Ariane (navigation 3 écrans) --- */
.fil {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.2rem 0 0;
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
</style>
