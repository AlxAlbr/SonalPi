<script setup lang="ts">
import { utiliserSonal } from '../composables/sonal'

const {
  dossierCourantNom,
  recents,
  choisirDossier,
  ouvrirRecent,
  ouvrirCorpusCourant,
  retirerRecent,
} = utiliserSonal()
</script>

<template>
    <section class="ecran accueil">
      <h2>Corpus</h2>
      <div class="cartes">
        <button class="carte ouvrir-corpus" @click="ouvrirCorpusCourant">
          <div class="carte-titre">📁 Corpus courant</div>
          <div class="carte-sous">{{ dossierCourantNom || 'profil' }}</div>
        </button>
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
  border-color: #2e9e3f;
  background: #f3fbf4;
}
.carte-titre {
  font-size: 0.95rem;
  font-weight: 600;
}
.carte-sous {
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
  color: #2e7d32;
  flex: none;
}
.recent:hover {
  border-color: #2e9e3f;
  background: #f3fbf4;
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
