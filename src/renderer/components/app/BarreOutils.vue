<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../composables/sonal'

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
  <div v-if="vue !== 'accueil'" class="barre-outils">
    <div class="ligne espaces">
      <button
        class="outil espace"
        data-tour="ouvrir-preparer"
        :class="{ actif: preparationActive }"
        title="Accueil, tableau de bord et documents du projet"
        :aria-current="preparationActive ? 'page' : undefined"
        @click="entrerPreparation()"
      >Préparer et suivre</button>
      <button
        class="outil espace"
        :class="{ actif: traitementActif }"
        title="Corpus et entretiens"
        :aria-current="traitementActif ? 'page' : undefined"
        @click="revenirTraitement()"
      >Importer et traiter</button>
      <button
        class="outil espace"
        data-tour="ouvrir-analyser"
        :class="{ actif: analyseActive }"
        title="Tri et synthèse, Lexico et analyses croisées"
        :aria-current="analyseActive ? 'page' : undefined"
        @click="entrerAnalyse()"
      >Analyser et interpréter</button>
      <button
        class="outil espace"
        :class="{ actif: organisationActive }"
        title="Cas, recueils et export du corpus"
        :aria-current="organisationActive ? 'page' : undefined"
        @click="entrerOrganisation()"
      >Organiser et exporter</button>
    </div>
  </div>
</template>

<style scoped>
.barre-outils {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.7rem;
  min-width: 0;
}
.ligne {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}
/* Sur une fenêtre étroite, les espaces se répartissent sur plusieurs lignes. */
@media (max-width: 1080px) {
  .barre-outils { flex-direction: column; align-items: flex-start; gap: 0.18rem; margin-top: 0.2rem; }
  .outil { padding-left: 1.25rem; padding-right: 0.35rem; font-size: 0.72rem; }
  .outil.espace { padding-left: 0.5rem; padding-right: 0.5rem; font-size: 0.78rem; }
  .ligne { gap: 0.2rem; }
}
/* Sur une fenêtre très étroite, les boutons occupent moins de place. */
@media (max-width: 720px) {
  .outil { padding-left: 1.1rem; padding-right: 0.3rem; font-size: 0.7rem; }
  .outil.espace { padding-left: 0.4rem; padding-right: 0.4rem; font-size: 0.72rem; }
  .ligne { gap: 0.15rem; }
}
.outil {
  border: 1px solid #bbb;
  border-radius: 5px;
  background: #fff;
  padding: 0.08rem 0.55rem 0.08rem 1.5rem;
  font-size: 0.74rem;
  cursor: pointer;
  position: relative;
  white-space: nowrap;
}
.outil::before {
  position: absolute;
  left: 0.4rem;
  font-size: 0.68rem;
}
/* Entrées principales : plus larges et lisibles, avec leur état actif. */
.outil.espace {
  font-size: 0.8rem;
  padding: 0.22rem 0.7rem;
  font-weight: 600;
  color: #2c3a5e;
}
.outil.espace.actif {
  background: #e3ebf9;
  border-color: #4a6fa5;
  color: #1a3a6b;
  box-shadow: inset 0 -2px 0 #2f5aa8;
}
.outil.espace:hover { background: #f4f7fd; }
</style>
