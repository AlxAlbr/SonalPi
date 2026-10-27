<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import AccueilAnalyse from './AccueilAnalyse.vue'
import SyntheseCote from './synthese/SyntheseCote.vue'
import SynthesePanneau from './synthese/SynthesePanneau.vue'
import LexicoCote from './lexico/LexicoCote.vue'
import LexicoPanneau from './lexico/LexicoPanneau.vue'
import AnalysesCote from './analyses-croisees/AnalysesCote.vue'
import AnalysesPanneau from './analyses-croisees/AnalysesPanneau.vue'
import icoMaison from '../../assets/icones/maison.png'
import icoSynthese from '../../assets/icones/synthese.svg'
import icoLexico from '../../assets/icones/lexico.svg'
import icoAnalysesCroisees from '../../assets/icones/analyses-croisees.svg'

// Les onglets et leurs commandes sont à gauche, les résultats à droite.
// Les outils restent montés pour conserver leurs critères et leurs résultats.
const {
  sousEspaceAnalyse,
  panneauAnalyseVisible,
  afficherAccueilAnalyse,
  afficherSynthese,
  afficherLexico,
  afficherAnalysesCroisees,
} = utiliserSonal()

const surAccueil = computed(() => sousEspaceAnalyse.value === 'accueil')
</script>

<template>
  <section
    class="espace-analyse"
    :class="{ 'panneau-masque': !surAccueil && !panneauAnalyseVisible }"
    aria-label="Analyser et interpréter"
  >
    <aside class="cote-analyse">
      <nav class="onglets-analyse" aria-label="Outils d’analyse">
        <button
          class="onglet"
          data-tour="ouvrir-accueil-analyse"
          :class="{ actif: surAccueil }"
          :aria-current="surAccueil ? 'page' : undefined"
          title="Accueil"
          aria-label="Accueil"
          @click="afficherAccueilAnalyse()"
        ><img class="ico-onglet" :src="icoMaison" alt="" /></button>
        <button
          class="onglet"
          data-tour="ouvrir-synthese"
          :class="{ actif: sousEspaceAnalyse === 'synthese' }"
          :aria-current="sousEspaceAnalyse === 'synthese' ? 'page' : undefined"
          title="Tri et synthèse"
          aria-label="Tri et synthèse"
          @click="afficherSynthese()"
        ><img class="ico-onglet" :src="icoSynthese" alt="" /></button>
        <button
          class="onglet"
          data-tour="ouvrir-lexico"
          :class="{ actif: sousEspaceAnalyse === 'lexico' }"
          :aria-current="sousEspaceAnalyse === 'lexico' ? 'page' : undefined"
          title="Lexico"
          aria-label="Lexico"
          @click="afficherLexico()"
        ><img class="ico-onglet" :src="icoLexico" alt="" /></button>
        <button
          class="onglet"
          data-tour="ouvrir-analyses-croisees"
          :class="{ actif: sousEspaceAnalyse === 'analyses-croisees' }"
          :aria-current="sousEspaceAnalyse === 'analyses-croisees' ? 'page' : undefined"
          title="Analyses croisées"
          aria-label="Analyses croisées"
          @click="afficherAnalysesCroisees()"
        ><img class="ico-onglet" :src="icoAnalysesCroisees" alt="" /></button>
      </nav>
      <div class="cote-corps">
        <AccueilAnalyse v-show="surAccueil" />
        <SyntheseCote v-show="sousEspaceAnalyse === 'synthese'" class="panneau" />
        <LexicoCote v-show="sousEspaceAnalyse === 'lexico'" class="panneau" />
        <AnalysesCote v-show="sousEspaceAnalyse === 'analyses-croisees'" class="panneau" />
      </div>
    </aside>

    <section class="principal">
      <div data-tour="ancre-guide-analyse"></div>
      <div v-show="surAccueil" class="accueil-principal">
        <h2>Analyser et interpréter</h2>
        <p>Choisissez un outil dans la barre d’icônes pour définir vos critères et consulter les résultats.</p>
        <p class="repere">Les critères restent à gauche et les résultats s’affichent ici.</p>
      </div>
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
  gap: 1rem;
  align-items: stretch;
  /* Chaque colonne défile dans la hauteur disponible sous l'en-tête. */
  height: calc(100vh - var(--entete-h) - 1.6rem);
  padding-top: 0.7rem;
  box-sizing: border-box;
  transition: grid-template-columns 0.15s ease;
}
.espace-analyse.panneau-masque { grid-template-columns: 2.9rem minmax(0, 1fr); }
.cote-analyse {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  overflow: hidden;
  min-width: 0;
}
.onglets-analyse {
  display: flex;
  gap: 0.25rem;
  flex: none;
  min-width: 0;
}
/* Onglets à icône, comme dans les espaces de préparation et de traitement. */
.onglet {
  width: 38px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ddd;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #f0f0f5;
  padding: 0.35rem;
  cursor: pointer;
}
.onglet.actif { background: #fff; }
.onglet:hover { background: #fff; }
.ico-onglet {
  width: 20px;
  height: 20px;
  object-fit: contain;
  opacity: 0.6;
  flex: none;
}
.onglet.actif .ico-onglet { opacity: 1; }
/* Les onglets restent accessibles dans un rail lorsque les critères sont masqués. */
.panneau-masque .onglets-analyse { flex-direction: column; }
.panneau-masque .onglet {
  border-bottom: 1px solid #ddd;
  border-radius: 6px;
}
.panneau-masque .cote-corps { display: none; }
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
.accueil-principal {
  flex: 1;
  box-sizing: border-box;
  border: 1px solid #e5e5ef;
  border-radius: 8px;
  background: #fafafe;
  padding: 1.2rem 1.4rem;
}
.accueil-principal h2 { margin: 0 0 0.6rem; font-size: 1.2rem; }
.accueil-principal p { max-width: 44rem; color: #555; line-height: 1.45; }
.accueil-principal .repere {
  width: fit-content;
  margin-top: 1rem;
  border-left: 4px solid #8e93ad;
  background: #f0f0f5;
  padding: 0.55rem 0.7rem;
  font-size: 0.85rem;
}
@media (max-width: 780px) {
  .espace-analyse, .espace-analyse.panneau-masque { grid-template-columns: minmax(0, 1fr); height: auto; }
  .cote-analyse { overflow: visible; }
  .cote-corps { overflow: visible; }
  /* Les panneaux s'empilent : les onglets restent une rangée lisible. */
  .panneau-masque .onglets-analyse { flex-direction: row; }
  .panneau-masque .onglet { border-bottom: none; border-radius: 6px 6px 0 0; }
}
</style>
