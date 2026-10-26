<script setup lang="ts">
import { ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import CasCorpus from './cas/CasCorpus.vue'
import RecueilsCorpus from './recueils/RecueilsCorpus.vue'
import icoCas from '../../assets/icones/cas.svg'

const { sousEspaceOrganisation, entrerOrganisation, ouvrirExportCorpus, panneauCasActif, panneauRecueilsActif, revisionCorpus } = utiliserSonal()
const casInitialises = ref(false)
const recueilsInitialises = ref(false)
watch(panneauCasActif, (actif) => { if (actif) casInitialises.value = true }, { immediate: true, flush: 'sync' })
watch(panneauRecueilsActif, (actif) => { if (actif) recueilsInitialises.value = true }, { immediate: true, flush: 'sync' })
watch(revisionCorpus, () => { casInitialises.value = false; recueilsInitialises.value = false }, { flush: 'sync' })
</script>

<template>
  <section class="ecran organisation-ecran" aria-label="Organiser et exporter">
    <nav class="onglets-organisation" aria-label="Organisation et export">
      <button :aria-current="sousEspaceOrganisation === 'cas' ? 'page' : undefined" @click="entrerOrganisation('cas')"><img class="icone-organisation" :src="icoCas" alt="">Cas</button>
      <button :aria-current="sousEspaceOrganisation === 'recueils' ? 'page' : undefined" @click="entrerOrganisation('recueils')"><span class="icone-organisation" aria-hidden="true">📌</span>Recueils</button>
      <button :aria-current="sousEspaceOrganisation === 'export' ? 'page' : undefined" @click="entrerOrganisation('export')">Exporter le corpus</button>
    </nav>
    <section id="contenu-cas-organisation" v-show="sousEspaceOrganisation === 'cas'" aria-label="Cas du corpus"><CasCorpus v-if="casInitialises" :key="revisionCorpus" /></section>
    <section id="contenu-recueils-organisation" v-show="sousEspaceOrganisation === 'recueils'" aria-label="Recueils du corpus"><RecueilsCorpus v-if="recueilsInitialises" :key="revisionCorpus" /></section>
    <section v-show="sousEspaceOrganisation === 'export'" class="export-corpus">
      <h2>Exporter le corpus</h2>
      <p>Choisissez les entretiens à exporter, leur présentation et le format de sortie.</p>
      <p>Vous pouvez aussi préparer un projet pour QualCoder.</p>
      <button @click="ouvrirExportCorpus">Choisir l’export du corpus…</button>
    </section>
  </section>
</template>

<style scoped>
.organisation-ecran { padding-top: .7rem; min-width: 0; }
.onglets-organisation { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: 1rem; }
.onglets-organisation button { display: inline-flex; align-items: center; gap: .4rem; }
.icone-organisation { width: 20px; height: 20px; object-fit: contain; flex: none; font-size: 18px; line-height: 20px; }
button { border: 1px solid #bbb; border-radius: 5px; background: #fff; padding: .4rem .7rem; cursor: pointer; }
button[aria-current="page"] { background: #e3ebf9; border-color: #4a6fa5; font-weight: 600; color: #1a3a6b; }
.export-corpus { padding: 1rem; }
</style>
