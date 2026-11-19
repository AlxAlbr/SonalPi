<script setup lang="ts">
import { utiliserSonal } from '../../composables/sonal'
import SyntheseCote from './synthese/SyntheseCote.vue'
import SynthesePanneau from './synthese/SynthesePanneau.vue'
import LexicoCote from './lexico/LexicoCote.vue'
import LexicoPanneau from './lexico/LexicoPanneau.vue'
import AnalysesCote from './analyses-croisees/AnalysesCote.vue'
import AnalysesPanneau from './analyses-croisees/AnalysesPanneau.vue'
import OngletsEspace from '../app/OngletsEspace.vue'
import icoSynthese from '../../assets/icones/synthese.svg'
import icoLexico from '../../assets/icones/lexico.svg'
import icoAnalysesCroisees from '../../assets/icones/analyses-croisees.svg'

// Les onglets sont en haut ; leurs commandes à gauche, les résultats à droite.
// Les outils restent montés pour conserver leurs critères et leurs résultats.
const {
  sousEspaceAnalyse,
  panneauAnalyseVisible,
  afficherSynthese,
  afficherLexico,
  afficherAnalysesCroisees,
} = utiliserSonal()

type OngletAnalyse = typeof sousEspaceAnalyse.value
const ONGLETS: { id: OngletAnalyse; libelle: string; icone: string; tour: string }[] = [
  { id: 'synthese', libelle: 'Tri et synthèse', icone: icoSynthese, tour: 'ouvrir-synthese' },
  { id: 'lexico', libelle: 'Lexico', icone: icoLexico, tour: 'ouvrir-lexico' },
  { id: 'analyses-croisees', libelle: 'Analyses croisées', icone: icoAnalysesCroisees, tour: 'ouvrir-analyses-croisees' },
]
function choisirOnglet(id: OngletAnalyse) {
  if (id === 'synthese') afficherSynthese()
  else if (id === 'lexico') afficherLexico()
  else afficherAnalysesCroisees()
}
</script>

<template>
  <section
    class="espace-analyse"
    :class="{ 'panneau-masque': !panneauAnalyseVisible }"
    aria-label="Analyser et interpréter"
  >
    <OngletsEspace
      class="onglets-analyse"
      aria-label="Outils d’analyse"
      :onglets="ONGLETS"
      :actif="sousEspaceAnalyse"
      @choisir="choisirOnglet"
    />
    <aside class="cote-analyse">
      <div class="cote-corps">
        <SyntheseCote v-show="sousEspaceAnalyse === 'synthese'" class="panneau" />
        <LexicoCote v-show="sousEspaceAnalyse === 'lexico'" class="panneau" />
        <AnalysesCote v-show="sousEspaceAnalyse === 'analyses-croisees'" class="panneau" />
      </div>
    </aside>

    <section class="principal">
      <div data-tour="ancre-guide-analyse"></div>
      <SynthesePanneau v-show="sousEspaceAnalyse === 'synthese'" />
      <LexicoPanneau v-show="sousEspaceAnalyse === 'lexico'" />
      <AnalysesPanneau v-show="sousEspaceAnalyse === 'analyses-croisees'" />
    </section>
  </section>
</template>

<style scoped>
.espace-analyse {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.75rem 1rem;
  align-items: stretch;
  /* Sous les onglets, chaque colonne défile dans la hauteur disponible. */
  height: calc(100vh - var(--entete-h) - 1.6rem);
  padding-top: 0.7rem;
  box-sizing: border-box;
}
.onglets-analyse {
  grid-column: 1 / -1;
}
/* Critères masqués : les résultats prennent toute la largeur, les onglets restent en haut. */
.espace-analyse.panneau-masque { grid-template-columns: minmax(0, 1fr); }
.panneau-masque .cote-analyse { display: none; }
.cote-analyse {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
.cote-corps {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 0.2rem;
}
.principal {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
@media (max-width: 780px) {
  .espace-analyse, .espace-analyse.panneau-masque { grid-template-columns: minmax(0, 1fr); height: auto; }
  .cote-analyse { overflow: visible; }
  .cote-corps { overflow: visible; }
}
</style>
