<script setup lang="ts">
import { utiliserSonal } from '../../composables/sonal'
import SyntheseCote from '../synthese/SyntheseCote.vue'
import SynthesePanneau from '../synthese/SynthesePanneau.vue'
import LexicoCote from '../lexico/LexicoCote.vue'
import LexicoPanneau from '../lexico/LexicoPanneau.vue'
import AnalysesCote from '../analyses/AnalysesCote.vue'
import AnalysesPanneau from '../analyses/AnalysesPanneau.vue'

// Espace « Analyser et interpréter » : onglets des trois outils en haut.
// Les filtres de l'outil actif suivent dessous, les résultats restent à droite.
// Masquer les filtres réduit la colonne à ses seuls onglets.
const {
  sousEspaceAnalyse,
  panneauAnalyseVisible,
  afficherSynthese,
  afficherLexico,
  afficherAnalysesCroisees,
} = utiliserSonal()
</script>

<template>
  <section
    class="espace-analyse"
    :class="{ 'panneau-masque': !panneauAnalyseVisible }"
    aria-label="Analyser et interpréter"
  >
    <aside class="cote-analyse">
      <nav class="onglets-analyse" aria-label="Outils d’analyse">
        <button
          class="onglet"
          data-tour="ouvrir-synthese"
          :class="{ actif: sousEspaceAnalyse === 'synthese' }"
          :aria-current="sousEspaceAnalyse === 'synthese' ? 'page' : undefined"
          title="Synthèse"
          aria-label="Synthèse"
          @click="afficherSynthese()"
        >
          <span class="icone" aria-hidden="true">🧩</span>
          <span class="libelle">Synthèse</span>
        </button>
        <button
          class="onglet"
          data-tour="ouvrir-lexico"
          :class="{ actif: sousEspaceAnalyse === 'lexico' }"
          :aria-current="sousEspaceAnalyse === 'lexico' ? 'page' : undefined"
          title="Lexico"
          aria-label="Lexico"
          @click="afficherLexico()"
        >
          <span class="icone" aria-hidden="true">🔤</span>
          <span class="libelle">Lexico</span>
        </button>
        <button
          class="onglet"
          data-tour="ouvrir-analyses-croisees"
          :class="{ actif: sousEspaceAnalyse === 'analyses-croisees' }"
          :aria-current="sousEspaceAnalyse === 'analyses-croisees' ? 'page' : undefined"
          title="Analyses croisées"
          aria-label="Analyses croisées"
          @click="afficherAnalysesCroisees()"
        >
          <span class="icone" aria-hidden="true">▦</span>
          <span class="libelle">Analyses croisées</span>
        </button>
      </nav>
      <div class="cote-corps">
        <SyntheseCote v-show="sousEspaceAnalyse === 'synthese'" />
        <LexicoCote v-show="sousEspaceAnalyse === 'lexico'" />
        <AnalysesCote v-show="sousEspaceAnalyse === 'analyses-croisees'" />
      </div>
    </aside>

    <section class="principal">
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
  /* Hauteur laissée par l'en-tête collant : chaque colonne défile pour elle-même. */
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
  flex-wrap: wrap;
  gap: 0.25rem;
  flex: none;
  min-width: 0;
}
.onglet {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  border: 1px solid #ddd;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #f0f0f5;
  padding: 0.4rem 0.35rem;
  font-size: 0.78rem;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.onglet.actif {
  background: #fff;
  font-weight: 600;
  color: #1565c0;
}
.onglet:hover { background: #f7f9fd; }
.icone { font-size: 0.85rem; line-height: 1; }
/* Les onglets restent accessibles dans un rail lorsque les filtres sont masqués. */
.panneau-masque .onglets-analyse { flex-direction: column; }
.panneau-masque .onglet {
  border-bottom: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.4rem 0.2rem;
}
.panneau-masque .libelle { display: none; }
/* Panneau masqué : la colonne ne garde que ses onglets. */
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
@media (max-width: 780px) {
  .espace-analyse, .espace-analyse.panneau-masque { grid-template-columns: minmax(0, 1fr); height: auto; }
  .cote-analyse { overflow: visible; }
  .cote-corps { overflow: visible; }
  /* Les panneaux s'empilent : les onglets restent une rangée lisible. */
  .panneau-masque .onglets-analyse { flex-direction: row; }
  .panneau-masque .onglet { border-bottom: none; border-radius: 6px 6px 0 0; }
  .panneau-masque .libelle { display: inline; }
}
</style>
