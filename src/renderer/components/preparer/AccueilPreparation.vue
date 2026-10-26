<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import icoCalendrier from '../../assets/icones/calendrier.png'
import icoDocuments from '../../assets/icones/documents.png'
import icoExemples from '../../assets/icones/exemples.svg'

// Accueil de l'espace : il présente les outils voisins ;
// le tableau de bord reste visible à droite pour garder le contexte du projet.
const { gesteDisponible } = utiliserSonal()

/** Un fournisseur peut ne pas proposer les documents du projet (GitLab). */
const docsDisponibles = computed(() => gesteDisponible('docsCadre'))
</script>

<template>
  <div class="panneau accueil-preparation">
    <div class="corpus-tete">
      <h3>Préparation et suivi</h3>
    </div>
    <p class="accueil-intro">
      Organisez le déroulement de l’étude, rassemblez les documents du projet
      et consultez les modèles proposés avec ces outils.
    </p>
    <ul class="accueil-outils">
      <li>
        <img :src="icoCalendrier" alt="" />
        <span><b>Tableau de bord</b> — suivre l’avancement de la collecte dans une grille
          de colonnes, de lignes et de badges.</span>
      </li>
      <li v-if="docsDisponibles">
        <img :src="icoDocuments" alt="" />
        <span><b>Documents du projet</b> — réunir et consulter les documents de référence
          propres au corpus, sans modifier leur contenu.</span>
      </li>
      <li>
        <img :src="icoExemples" alt="" />
        <span><b>Documents exemples</b> — consulter les modèles fournis avec SonalPi
          et en enregistrer une copie pour votre projet.</span>
      </li>
    </ul>
  </div>
</template>
