<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import icoPlanning from '../../assets/icones/espace-planning.svg'
import icoEdition from '../../assets/icones/espace-edition.svg'
import icoAnalyse from '../../assets/icones/espace-analyse.svg'
import icoExport from '../../assets/icones/espace-export.svg'

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
        aria-label="Préparer & Suivre"
        :aria-current="preparationActive ? 'page' : undefined"
        @click="entrerPreparation()"
      >
        <img :src="icoPlanning" alt="" />
        <span class="libelle-espace">Préparer &amp; Suivre</span>
      </button>
      <button
        class="outil espace"
        data-tour="ouvrir-traiter"
        :class="{ actif: traitementActif }"
        aria-label="Importer &amp; Traiter"
        :aria-current="traitementActif ? 'page' : undefined"
        @click="revenirTraitement()"
      >
        <img :src="icoEdition" alt="" />
        <span class="libelle-espace">Importer &amp; Traiter</span>
      </button>
      <button
        class="outil espace"
        data-tour="ouvrir-analyser"
        :class="{ actif: analyseActive }"
        aria-label="Analyser &amp; Interpréter"
        :aria-current="analyseActive ? 'page' : undefined"
        @click="entrerAnalyse()"
      >
        <img :src="icoAnalyse" alt="" />
        <span class="libelle-espace">Analyser &amp; Interpréter</span>
      </button>
      <button
        class="outil espace"
        data-tour="ouvrir-organiser"
        :class="{ actif: organisationActive }"
        aria-label="Organiser &amp; Exporter"
        :aria-current="organisationActive ? 'page' : undefined"
        @click="entrerOrganisation()"
      >
        <img :src="icoExport" alt="" />
        <span class="libelle-espace">Organiser &amp; Exporter</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.barre-outils {
  position: sticky;
  top: var(--entete-h);
  align-self: start;
  box-sizing: border-box;
  height: calc(100vh - var(--entete-h));
  min-height: min(24rem, calc(100vh - var(--entete-h)));
  min-width: 0;
  overflow: hidden;
  background: #19204d;
}
.ligne {
  display: flex;
  flex-direction: column;
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  width: 100%;
  min-height: 4.5rem;
  padding: 0.55rem 0.2rem;
  border: 0;
  border-bottom: 1px solid rgb(255 255 255 / 12%);
  border-radius: 0;
  background: transparent;
  font-weight: 600;
  color: #fff;
}
.outil.espace:hover {
  background: rgb(255 255 255 / 10%);
}
.outil.espace img {
  width: 1.5rem;
  height: 1.5rem;
  object-fit: contain;
  filter: brightness(0) invert(1);
}
.libelle-espace {
  font-size: 0.68rem;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.outil.espace.actif,
.outil.espace.actif:hover {
  background: #e3ebf9;
  color: #1a3a6b;
}
.outil.espace.actif img { filter: none; }
@media (max-width: 780px) {
  .libelle-espace { font-size: 0.62rem; }
}
</style>
