<script setup lang="ts">
import { ref } from 'vue'
import ModaleDemo from './ModaleDemo.vue'
import { utiliserSonal } from '../composables/sonal'
import type { ModeDemo } from '../composables/demo'

const {
  recents,
  choisirDossier,
  ouvrirRecent,
  retirerRecent,
  preparer,
  raccrocherEtatDemo,
  pretUnClic,
  enPreparation,
} = utiliserSonal()

// Modale démo ADAPTATIVE : lancée depuis les cartes démo uniquement si le
// corpus de CE mode n'est pas déjà connu et présent (mémoire démo persistée
// settings.json). Une question déjà répondue est sautée (ex. « où importer les
// sources » si elles sont déjà en place). Une fois le corpus du mode créé,
// « un clic » suffit.
const modaleDemo = ref<ModeDemo | null>(null)

async function lancerPreparer(mode: ModeDemo) {
  await raccrocherEtatDemo()
  if (pretUnClic(mode)) void preparer(mode)
  else modaleDemo.value = mode
}
</script>

<template>
    <section class="ecran accueil">
      <h2>Accueil</h2>

      <!-- Mini Corpus Test : deux modes côte à côte. Chacun choisit ses
           dossiers (sources + corpus de travail) puis construit le corpus de
           démo via le vrai pipeline d'import. -->
      <div class="demo-bloc">
        <h3 class="demo-titre">🎓 Mini Corpus Test</h3>
        <div class="cartes-demo">
          <button
            class="carte-demo pas-a-pas"
            :disabled="enPreparation"
            @click="lancerPreparer('pas-a-pas')"
          >
            <div class="carte-titre">Découverte pas à pas</div>
            <div class="carte-sous">Guidée, étape par étape <br> un entretien à la fois</div>
          </button>
          <button
            class="carte-demo autonomie"
            :disabled="enPreparation"
            @click="lancerPreparer('autonomie')"
          >
            <div class="carte-titre">En autonomie</div>
            <div class="carte-sous">L'ensemble du corpus <br> (4 entretiens + audio)</div>
          </button>
        </div>
        <p class="demo-aide">Un terrain fictif sur l'aide aux devoirs dans les associations.</p>
      </div>

      <div class="cartes">
        <button class="carte choisir-corpus" @click="choisirDossier">
          <div class="carte-titre">➕ Ouvrir un corpus…</div>
          <div class="carte-sous">Choisir un dossier — ou en créer un nouveau (un dossier = un corpus)</div>
        </button>
      </div>
      <h3 class="recents-titre">Récents</h3>
      <p v-if="recents.length === 0" class="vide">Aucun corpus récent.</p>
      <ul class="recents">
        <li v-for="r in recents" :key="r.dir">
          <button class="recent" @click="ouvrirRecent(r.dir)">{{ r.nom }}</button>
          <span class="recent-dir">{{ r.dir }}</span>
          <!-- Retire le RACCOURCI seulement : le dossier sur disque n'est pas touché
               (l'app ne détruit jamais un corpus — ça se fait dans l'explorateur). -->
          <button
            class="x oubli-recent"
            title="Retirer de la liste (ne supprime rien sur disque)"
            @click="retirerRecent(r.dir)"
          >✕</button>
        </li>
      </ul>

      <!-- Modale à deux dossiers (sources + corpus de travail) -->
      <ModaleDemo v-if="modaleDemo" :mode="modaleDemo" @fermer="modaleDemo = null" />
    </section>
</template>

<style scoped>
.ecran.accueil {
  max-width: 640px;
}
.ecran.accueil h2 {
  font-size: 1.05rem;
  margin: 0.5rem 0;
}
/* --- Mini Corpus Test --- */
.demo-bloc {
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 0.7rem 0.8rem 0.6rem;
  margin: 0.3rem 0 1rem;
  background: #f4f8fd;
}
.demo-titre {
  font-size: 0.82rem;
  font-weight: 700;
  color: #1565c0;
  margin: 0 0 0.5rem;
}
.cartes-demo {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
}
.carte-demo {
  flex: 1 1 200px;
  text-align: left;
  border: 1px solid #c9dff5;
  border-radius: 10px;
  padding: 0.8rem 1rem;
  background: #fff;
  cursor: pointer;
}
.carte-demo:hover:not(:disabled) {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.carte-demo:disabled {
  opacity: 0.6;
  cursor: progress;
}
.demo-aide {
  text-align: center;
  margin: 0.5rem 0 0;
  font-size: 0.72rem;
  color: #999;
  font-style: italic;
}
.cartes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem; 
}
.carte {
  text-align: left;
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 0.9rem 1.1rem;
  background: #fafafe;
  cursor: pointer;
  min-width: 240px;
}
.carte:hover {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.carte-titre {
  text-align: center;
  font-size: 0.95rem;
  font-weight: 600;
}
.carte-sous {
  text-align: center;
  font-size: 0.78rem;
  color: #888;
  margin-top: 0.2rem;
}
.recents-titre {
  font-size: 0.9rem;
  margin: 1.4rem 0 0.4rem;
}
.recents {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.recents li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.recent {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  padding: 0.2rem 0.6rem;
  font-size: 0.82rem;
  color: #1565c0;
  flex: none;
}
.recent:hover {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.recent-dir {
  font-size: 0.72rem;
  color: #aaa;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Croix discrète (révélée au survol de la ligne) — même idiome que les listes. */
.oubli-recent {
  opacity: 0.35;
}
.recents li:hover .oubli-recent {
  opacity: 1;
}
</style>
