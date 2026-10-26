<script setup lang="ts">
import { utiliserSonal } from '../../composables/sonal'
import icoSynthese from '../../assets/icones/synthese.svg'
import icoLexico from '../../assets/icones/lexico.svg'
import icoAnalysesCroisees from '../../assets/icones/analyses-croisees.svg'

const { afficherSynthese, afficherLexico, afficherAnalysesCroisees } = utiliserSonal()
</script>

<template>
  <div class="panneau accueil-analyse">
    <div class="corpus-tete">
      <h3>Analyse et interprétation</h3>
    </div>
    <p class="accueil-intro">
      Explorez le corpus, repérez les passages utiles et comparez les matériaux
      avec ces outils complémentaires.
    </p>
    <ul class="accueil-outils">
      <li>
        <button type="button" @click="afficherSynthese()">
          <img :src="icoSynthese" alt="" />
          <span><b>Tri et synthèse</b> — réunir les extraits qui répondent à plusieurs critères
            et les parcourir dans leur contexte.</span>
        </button>
      </li>
      <li>
        <button type="button" @click="afficherLexico()">
          <img :src="icoLexico" alt="" />
          <span><b>Lexico</b> — construire un index des mots du corpus, consulter leurs
            occurrences et préparer des regroupements.</span>
        </button>
      </li>
      <li>
        <button type="button" @click="afficherAnalysesCroisees()">
          <img :src="icoAnalysesCroisees" alt="" />
          <span><b>Analyses croisées</b> — comparer la présence des thèmes entre les
            entretiens dans une matrice.</span>
        </button>
      </li>
    </ul>
  </div>
</template>
