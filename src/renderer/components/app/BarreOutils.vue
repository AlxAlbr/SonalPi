<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import icoDocuments from '../../assets/icones/documents.png'
import icoThemes from '../../assets/icones/themes.png'
import icoAnalyses from '../../assets/icones/analyses-croisees.svg'
import icoExporter from '../../assets/icones/exporter.svg'

// La barre déclenche les mêmes ouvertures que les onglets et le guidage.
const {
  vue,
  preparationActive,
  analyseActive,
  entrerPreparation,
  entrerAnalyse,
  revenirTraitement,
  organisationActive,
  entrerOrganisation,
} = utiliserSonal()

/** L'espace « Importer et traiter » est actif dans le traitement. */
const traitementActif = computed(() => vue.value === 'corpus' || vue.value === 'entretien')
</script>

<template>
  <nav v-if="vue !== 'accueil'" class="barre-outils" aria-label="Espaces de travail">
    <div class="ligne espaces">
      <button
        class="outil espace"
        data-tour="ouvrir-preparer"
        :class="{ actif: preparationActive }"
        title="Préparer et suivre"
        aria-label="Préparer et suivre"
        :aria-current="preparationActive ? 'page' : undefined"
        @click="entrerPreparation()"
      ><img :src="icoDocuments" alt="" /></button>
      <button
        class="outil espace"
        data-tour="ouvrir-traiter"
        :class="{ actif: traitementActif }"
        title="Importer et traiter"
        aria-label="Importer et traiter"
        :aria-current="traitementActif ? 'page' : undefined"
        @click="revenirTraitement()"
      ><img :src="icoThemes" alt="" /></button>
      <button
        class="outil espace"
        data-tour="ouvrir-analyser"
        :class="{ actif: analyseActive }"
        title="Analyser et interpréter"
        aria-label="Analyser et interpréter"
        :aria-current="analyseActive ? 'page' : undefined"
        @click="entrerAnalyse()"
      ><img :src="icoAnalyses" alt="" /></button>
      <button
        class="outil espace"
        data-tour="ouvrir-organiser"
        :class="{ actif: organisationActive }"
        title="Organiser et exporter"
        aria-label="Organiser et exporter"
        :aria-current="organisationActive ? 'page' : undefined"
        @click="entrerOrganisation()"
      ><img :src="icoExporter" alt="" /></button>
    </div>
  </nav>
</template>

<style scoped>
.barre-outils {
  position: sticky;
  top: calc(var(--entete-h) + 1.2rem);
  align-self: start;
  box-sizing: border-box;
  height: calc(100vh - var(--entete-h) - 2.4rem);
  min-height: min(24rem, calc(100vh - var(--entete-h) - 2.4rem));
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0.75rem;
  border: 1px solid #dfe3eb;
  border-radius: 10px;
  background: #fafafe;
}
.ligne {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  width: 100%;
}
.outil {
  border: 1px solid #bbb;
  border-radius: 5px;
  background: #fff;
  padding: 0.55rem 0.4rem;
  font-size: 0.74rem;
  cursor: pointer;
  text-align: center;
  line-height: 1.3;
}
/* Entrées principales : plus larges et lisibles, avec leur état actif. */
.outil.espace {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  align-self: center;
  padding: 0.45rem;
  font-weight: 600;
  color: #2c3a5e;
}
.outil.espace img {
  width: 1.65rem;
  height: 1.65rem;
  object-fit: contain;
  opacity: 0.7;
}
.outil.espace.actif img { opacity: 1; }
.outil.espace.actif {
  background: #e3ebf9;
  border-color: #4a6fa5;
  color: #1a3a6b;
  box-shadow: inset 3px 0 0 #2f5aa8;
}
.outil.espace:hover { background: #f4f7fd; }
@media (max-width: 780px) {
  .barre-outils { padding: 0.5rem; }
}
</style>
