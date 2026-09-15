<script setup lang="ts">
import { utiliserSonal } from '../../composables/sonal'

// Lanceurs des outils transverses du corpus. Le composable garde la propriété
// fonctionnelle ; ce composant ne fait que déclencher l'ouverture des fenêtres.
const { vue, afficherCas, afficherRecueils } = utiliserSonal()
</script>

<template>
  <div v-if="vue !== 'accueil'" class="barre-outils">
    <div class="ligne">
      <button class="outil avenir" disabled title="À venir">Tableau de bord</button>
      <button class="outil avenir" disabled title="À venir">Ressources du projet</button>
    </div>
    <div class="ligne">
      <button class="outil avenir" disabled title="À venir">Lexico</button>
      <button class="outil avenir" disabled title="À venir">Synthèse</button>
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
.outil.avenir {
  color: #8a8f9c;
  border-style: dashed;
  cursor: default;
  padding-left: 0.55rem;
}
.outil::before {
  position: absolute;
  left: 0.4rem;
  font-size: 0.68rem;
}
.btn-cas::before { content: '🗂'; }
.btn-recueils::before { content: '📌'; }
.btn-recueils:hover, .btn-cas:hover { background: #f4f7fd; }
</style>
