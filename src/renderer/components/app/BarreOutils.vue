<script setup lang="ts">
import { utiliserSonal } from '../../composables/sonal'

// Lanceurs des outils transverses du corpus. Le composable garde la propriété
// fonctionnelle ; ce composant ne fait que déclencher l'ouverture des fenêtres.
const {
  vue,
  afficherCas,
  afficherRecueils,
  afficherTableauBord,
  afficherDocsCadre,
  afficherLexico,
  afficherSynthese,
  afficherAnalysesCroisees,
  gesteDisponible,
} = utiliserSonal()
</script>

<template>
  <div v-if="vue !== 'accueil'" class="barre-outils">
    <div class="ligne">
      <button class="outil btn-tableau" data-tour="ouvrir-tableau-bord" title="Ouvrir le tableau de bord" @click="afficherTableauBord">Tableau de bord</button>
      <button
        v-if="gesteDisponible('docsCadre')"
        class="outil btn-docs-cadre"
        data-tour="ouvrir-docs-cadre"
        title="Ouvrir les documents du projet"
        @click="afficherDocsCadre()"
      >Docs cadre projet</button>
    </div>
    <div class="ligne">
      <button class="outil btn-lexico" title="Ouvrir l’index lexical" @click="afficherLexico">Lexico</button>
      <button class="outil btn-synthese" title="Ouvrir la synthèse" @click="afficherSynthese">Synthèse</button>
      <button class="outil btn-analyses" title="Comparer les thèmes entre les entretiens" @click="afficherAnalysesCroisees">Analyses croisées</button>
    </div>
    <div class="ligne">
      <button class="outil btn-recueils" title="Ouvrir les recueils" @click="afficherRecueils">Recueils</button>
      <button class="outil btn-cas" title="Ouvrir les cas" @click="afficherCas">Cas</button>
    </div>
  </div>
</template>

<style scoped>
.barre-outils {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  margin-left: 1rem;
}
.ligne {
  display: flex;
  gap: 0.35rem;
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
.btn-cas::before { content: '🗂'; }
.btn-lexico::before { content: '🔤'; }
.btn-synthese::before { content: '🧩'; }
.btn-analyses::before { content: '▦'; }
.btn-tableau::before { content: '📊'; }
.btn-recueils::before { content: '📌'; }
/* Même icône que l'en-tête de DocsCadreModale.vue (test e2e : les deux doivent rester identiques). */
.btn-docs-cadre::before { content: '🖼️'; }
.btn-recueils:hover, .btn-cas:hover, .btn-docs-cadre:hover, .btn-tableau:hover, .btn-lexico:hover, .btn-synthese:hover, .btn-analyses:hover { background: #f4f7fd; }
</style>
