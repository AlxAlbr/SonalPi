<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import icoCalendrier from '../../assets/icones/calendrier.png'
import icoDocuments from '../../assets/icones/documents.png'
import icoExemples from '../../assets/icones/exemples.svg'

// L’accueil présente les outils voisins, accessibles par leurs onglets.
const {
  gesteDisponible,
  afficherTableauBord,
  afficherDocsCadre,
  afficherDocumentsExemples,
} = utiliserSonal()

/** Un fournisseur peut ne pas proposer les documents du projet (GitLab). */
const docsDisponibles = computed(() => gesteDisponible('docsCadre'))
</script>

<template>
  <div class="panneau accueil-preparation">
    <div class="corpus-tete">
      <h3>Préparation et suivi</h3>
    </div>
    <ul class="accueil-outils">
      <li>
        <button type="button" @click="afficherTableauBord()">
          <img :src="icoCalendrier" alt="" />
          <span><b>Tableau de bord</b> — suivre l’avancement du projet.</span>
        </button>
      </li>
      <li v-if="docsDisponibles">
        <button type="button" @click="afficherDocsCadre()">
          <img :src="icoDocuments" alt="" />
          <span><b>Documents du projet</b> — réunir au même endroit les documents de préparation du projet.</span>
        </button>
      </li>
      <li>
        <button type="button" @click="afficherDocumentsExemples()">
          <img :src="icoExemples" alt="" />
          <span><b>Documents exemples</b> — consulter des modèles de documents fournis avec SonalPi.</span>
        </button>
      </li>
    </ul>
  </div>
</template>
