<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import icoCalendrier from '../../assets/icones/calendrier.png'
import icoDocuments from '../../assets/icones/documents.png'

// Accueil de l'espace : il présente les outils voisins ;
// le tableau de bord reste visible à droite pour garder le contexte du projet.
const { gesteDisponible } = utiliserSonal()

/** Un fournisseur peut ne pas proposer les documents cadre (GitLab). */
const docsDisponibles = computed(() => gesteDisponible('docsCadre'))
</script>

<template>
  <div class="panneau accueil-preparation">
    <div class="corpus-tete">
      <h3>Préparation</h3>
    </div>
    <p class="accueil-intro">
      Organisez le déroulement de l’étude et rassemblez les documents de référence
      du projet avec ces outils.
    </p>
    <ul class="accueil-outils">
      <li>
        <img :src="icoCalendrier" alt="" />
        <span><b>Tableau de bord</b> — suivre l’avancement de la collecte dans une grille
          de colonnes, de lignes et de badges.</span>
      </li>
      <li v-if="docsDisponibles">
        <img :src="icoDocuments" alt="" />
        <span><b>Documents cadre</b> — consulter les documents de référence du projet
          et les exemples fournis, sans jamais modifier leur contenu.</span>
      </li>
    </ul>
  </div>
</template>
