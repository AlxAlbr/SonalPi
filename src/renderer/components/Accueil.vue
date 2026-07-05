<script setup lang="ts">
import { utiliserSonal } from '../composables/sonal'

const {
  dossierCourantNom,
  recents,
  choisirDossier,
  ouvrirRecent,
  ouvrirCorpusCourant,
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
          <div class="carte-sous">Choisir un dossier</div>
        </button>
      </div>
      <h3 class="recents-titre">Récents</h3>
      <p v-if="recents.length === 0" class="vide">Aucun corpus récent.</p>
      <ul class="recents">
        <li v-for="r in recents" :key="r.dir">
          <button class="recent" @click="ouvrirRecent(r.dir)">{{ r.nom }}</button>
          <span class="recent-dir">{{ r.dir }}</span>
        </li>
      </ul>
    </section>
</template>
