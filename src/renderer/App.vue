<script setup lang="ts">
import { fournirSonal } from './composables/sonal'
import Accueil from './components/Accueil.vue'
import Corpus from './components/Corpus.vue'
import TableDonnees from './components/TableDonnees.vue'
import Entretien from './components/Entretien.vue'

// D-S12 : App = COQUILLE. `fournirSonal` crée l'orchestration + les 3 scopes et les
// PROVIDE ; chaque composant de vue les INJECTE (utiliserSonal). App ne garde que
// l'en-tête, le fil d'Ariane et les bannières.
const { vue, etatSauvegarde, allerAccueil, retourCorpus, ouvertId, membership, refusFormat, perime } =
  fournirSonal()
</script>


<template>
  <main class="app">
    <header>
      <h1>
        SonalAsynchro — 
        <span class="etat" :class="etatSauvegarde.replace('…', '').replace(' ', '-')">
          {{ etatSauvegarde }}
        </span>
      </h1>
      <nav class="fil" v-if="vue !== 'accueil'">
        <button class="lien-nav" @click="allerAccueil">Accueil</button>
        <span class="sep">›</span>
        <button class="lien-nav" :class="{ courant: vue === 'corpus' }" :disabled="vue === 'corpus'" @click="retourCorpus">
          Corpus
        </button>
        <template v-if="vue === 'entretien'">
          <span class="sep">›</span>
          <span class="lien-nav courant">{{ (ouvertId && membership[ouvertId]?.titre) || 'Entretien' }}</span>
        </template>
        <template v-if="vue === 'donnees'">
          <span class="sep">›</span>
          <span class="lien-nav courant">Table de données</span>
        </template>
      </nav>
    </header>

    <div v-if="refusFormat" class="banniere refus">{{ refusFormat }}</div>
    <div v-if="perime && vue === 'entretien'" class="banniere perime">
      ⚠ Cet entretien semble plus ancien que ce que le corpus a enregistré
      (fichier restauré ?). Vérifie avant d'écraser.
    </div>

    <Accueil v-show="vue === 'accueil'" />
    <Corpus v-show="vue === 'corpus'" />
    <!-- Entretien en v-show : l'éditeur TipTap reste MONTÉ d'un écran à l'autre. -->
    <Entretien v-show="vue === 'entretien'" />
    <TableDonnees v-show="vue === 'donnees'" />
  </main>
</template>

<style scoped>
/* COQUILLE uniquement : en-tête, fil d'Ariane, bannières. La typographie de base
 * et le vocabulaire partagé sont dans styles/base.css ; l'éditeur dans
 * styles/editeur.css ; le reste vit dans le <style scoped> de chaque vue. */
.app {
  max-width: 1250px;
  margin: 1.2rem auto;
  padding: 0 1rem;
}
h1 {
  font-size: 1.2rem;
  margin: 0 0 0.3rem;
}
h1 small {
  color: #999;
  font-weight: 400;
}
.etat {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.5rem;
  border-radius: 10px;
  margin-left: 0.5rem;
  vertical-align: middle;
}
.etat.à-jour {
  background: #e6f4ea;
  color: #2e7d32;
}
.etat.modifié {
  background: #fff3e0;
  color: #b06e0f;
}
.etat.sauvegarde {
  background: #e3f2fd;
  color: #1565c0;
}
.banniere {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  margin-bottom: 0.8rem;
}
.banniere.refus {
  background: #fdecea;
  color: #b3261e;
  border: 1px solid #f3b4ad;
}
.banniere.perime {
  background: #fff8ec;
  color: #b06e0f;
  border: 1px solid #e0a03a;
}
/* --- Fil d'Ariane (navigation 3 écrans) --- */
.fil {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 1rem;
  font-size: 0.85rem;
}
.lien-nav {
  border: none;
  background: none;
  color: #2e7d32;
  cursor: pointer;
  padding: 0.1rem 0.2rem;
  font-size: 0.85rem;
}
.lien-nav.courant {
  color: #1a1a1a;
  font-weight: 600;
  cursor: default;
}
.fil .sep {
  color: #bbb;
}
</style>
