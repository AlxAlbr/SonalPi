<script setup lang="ts">
import { ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import type { SousEspaceOrganisation } from '../../composables/espaces'
import CasCorpus from './cas/CasCorpus.vue'
import RecueilsCorpus from './recueils/RecueilsCorpus.vue'
import ExportCorpus from './export/ExportCorpus.vue'
import icoMaison from '../../assets/icones/maison.png'
import icoCas from '../../assets/icones/cas.svg'
import icoRecueils from '../../assets/icones/recueils.svg'
import icoExporter from '../../assets/icones/exporter.svg'

const { sousEspaceOrganisation, organisationActive, entrerOrganisation, panneauCasActif, panneauRecueilsActif, revisionCorpus, exportCorpusEnCours } = utiliserSonal()
const outils = [
  { id: 'cas', nom: 'Cas', icone: icoCas, aide: 'Réunir les matériaux d’une personne, d’un groupe ou d’une unité étudiée.' },
  { id: 'recueils', nom: 'Recueils', icone: icoRecueils, aide: 'Composer un document avec des passages, des titres et vos commentaires.' },
  { id: 'export', nom: 'Exporter le corpus', icone: icoExporter, aide: 'Choisir les entretiens et les formats, vérifier puis enregistrer l’export.' },
] satisfies { id: SousEspaceOrganisation; nom: string; icone: string; aide: string }[]
const casInitialises = ref(false)
const recueilsInitialises = ref(false)
const exportInitialise = ref(false)
watch(panneauCasActif, (actif) => { if (actif) casInitialises.value = true }, { immediate: true, flush: 'sync' })
watch(panneauRecueilsActif, (actif) => { if (actif) recueilsInitialises.value = true }, { immediate: true, flush: 'sync' })
watch(sousEspaceOrganisation, (onglet) => { if (onglet === 'export') exportInitialise.value = true }, { immediate: true, flush: 'sync' })
watch(revisionCorpus, () => {
  casInitialises.value = false
  recueilsInitialises.value = false
  exportInitialise.value = false
}, { flush: 'sync' })
</script>

<template>
  <section class="ecran organisation-ecran" aria-label="Organiser et exporter">
    <nav class="onglets-organisation" aria-label="Organisation et export" :inert="exportCorpusEnCours">
      <button
        class="onglet"
        :class="{ actif: sousEspaceOrganisation === 'accueil' }"
        :aria-current="sousEspaceOrganisation === 'accueil' ? 'page' : undefined"
        title="Accueil" aria-label="Accueil"
        @click="entrerOrganisation('accueil')"
      ><img class="ico-onglet" :src="icoMaison" alt="" /></button>
      <button
        v-for="outil in outils" :key="outil.id"
        class="onglet"
        :class="{ actif: sousEspaceOrganisation === outil.id }"
        :aria-current="sousEspaceOrganisation === outil.id ? 'page' : undefined"
        :title="outil.nom" :aria-label="outil.nom"
        @click="entrerOrganisation(outil.id)"
      ><img class="ico-onglet" :src="outil.icone" alt="" /></button>
    </nav>

    <div v-show="sousEspaceOrganisation === 'accueil'" class="accueil-organisation organisation-contenu">
      <aside class="panneau">
        <div class="corpus-tete"><h3>Organisation et export</h3></div>
        <p class="accueil-intro">Organisez vos matériaux et préparez les documents à relire, à partager ou à poursuivre dans un autre logiciel.</p>
        <ul class="accueil-outils">
          <li v-for="outil in outils" :key="outil.id">
            <button @click="entrerOrganisation(outil.id)">
              <img :src="outil.icone" alt="" />
              <span><b>{{ outil.nom }}</b> — {{ outil.aide }}</span>
            </button>
          </li>
        </ul>
      </aside>
      <section class="accueil-principal">
        <h2>Organiser et exporter</h2>
        <p>Choisissez un outil pour réunir vos matériaux, composer un recueil ou exporter les entretiens du corpus.</p>
        <p>Le répertoire ou les réglages restent à gauche ; le document, les vérifications et les résultats s’affichent à droite.</p>
        <p class="repere">Les Cas et les Recueils référencent les passages d’origine : ils ne remplacent pas les entretiens.</p>
      </section>
    </div>
    <section id="contenu-cas-organisation" v-show="sousEspaceOrganisation === 'cas'" class="organisation-contenu" aria-label="Cas du corpus">
      <CasCorpus v-if="casInitialises" :key="revisionCorpus" />
    </section>
    <section id="contenu-recueils-organisation" v-show="sousEspaceOrganisation === 'recueils'" class="organisation-contenu" aria-label="Recueils du corpus">
      <RecueilsCorpus v-if="recueilsInitialises" :key="revisionCorpus" />
    </section>
    <section v-show="sousEspaceOrganisation === 'export'" class="organisation-contenu" aria-label="Export du corpus">
      <ExportCorpus v-if="exportInitialise" :key="revisionCorpus" :actif="organisationActive && sousEspaceOrganisation === 'export'" />
    </section>
  </section>
</template>

<style scoped>
.organisation-ecran {
  --largeur-organisation: 340px;
  display: flex;
  flex-direction: column;
  gap: .6rem;
  height: calc(100vh - var(--entete-h) - 1.6rem);
  padding-top: .7rem;
  box-sizing: border-box;
  min-width: 0;
}
.onglets-organisation { display: flex; gap: .25rem; flex: none; }
.onglet { width: 38px; height: 34px; display: flex; align-items: center; justify-content: center; border: 1px solid #ddd; border-bottom: none; border-radius: 6px 6px 0 0; background: #f0f0f5; padding: .35rem; cursor: pointer; }
.onglet.actif, .onglet:hover { background: #fff; }
.ico-onglet { width: 20px; height: 20px; object-fit: contain; opacity: .6; flex: none; }
.onglet.actif .ico-onglet { opacity: 1; }
.organisation-contenu { flex: 1; min-height: 0; min-width: 0; }
.accueil-organisation { display: grid; grid-template-columns: var(--largeur-organisation) minmax(0, 1fr); gap: 1rem; }
.accueil-organisation > * { overflow-y: auto; min-width: 0; }
.accueil-principal { border: 1px solid #e5e5ef; border-radius: 8px; padding: 1.2rem 1.4rem; background: #fafafe; }
.accueil-principal h2 { margin: 0 0 .6rem; font-size: 1.2rem; }
.accueil-principal p { max-width: 44rem; color: #555; line-height: 1.45; }
.repere { border-left: 4px solid #8e93ad; background: #f0f0f5; padding: .55rem .7rem; font-size: .85rem; }
@media (max-width: 780px) {
  .organisation-ecran { height: auto; }
  .accueil-organisation { grid-template-columns: minmax(0, 1fr); }
}
</style>
