<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { iconeTypeDocument } from '../../../composables/corpus/useDocsCadre'
import type { EntreeDocsCadre, SourceDocumentCadre } from '../../../../shared/docsCadre'

const props = defineProps<{ source: SourceDocumentCadre }>()
const {
  estDistant, entreesProjet, entreesExemples, dossiersDocsCadre, dossierDocsAbsent,
  selection, erreurListe, chargementListe, selectionner, rafraichirDocsCadre,
  naviguerDocsCadre, ajouterFichier, creerDossier, ouvrirAvecApplication,
  ouvrirDossierLocal, ouvrirDansNextcloud,
} = utiliserSonal()
const estProjet = computed(() => props.source === 'projet')
const dossier = computed(() => dossiersDocsCadre.value[props.source])
const entrees = computed(() => estProjet.value ? entreesProjet.value : entreesExemples.value)
const miettes = computed(() => [
  { nom: estProjet.value ? 'Documents' : 'Documents exemples', chemin: '' },
  ...dossier.value.split('/').filter(Boolean).map((nom, i, segments) => ({ nom, chemin: segments.slice(0, i + 1).join('/') })),
])
const saisieDossier = ref(false)
const nomDossier = ref('')
const champDossier = ref<HTMLInputElement | null>(null)
const navigation = ref<HTMLElement | null>(null)
const titre = ref<HTMLElement | null>(null)

function focaliserDossier(): void {
  const cible = navigation.value?.querySelector<HTMLElement>('[aria-current]') ?? titre.value
  cible?.focus()
}
watch([() => props.source, dossier], () => { saisieDossier.value = false; nomDossier.value = '' })

async function nouveauDossier(): Promise<void> {
  saisieDossier.value = true
  await nextTick()
  champDossier.value?.focus()
}
async function confirmerDossier(): Promise<void> {
  if (await creerDossier(nomDossier.value.trim())) {
    saisieDossier.value = false
    nomDossier.value = ''
    await nextTick()
    focaliserDossier()
  }
}
async function naviguer(chemin: string): Promise<void> {
  await naviguerDocsCadre(props.source, chemin)
  await nextTick()
  focaliserDossier()
}
function choisir(entree: EntreeDocsCadre): void {
  if (entree.nature === 'dossier') void naviguer(entree.chemin)
  else selectionner({ source: props.source, chemin: entree.chemin })
}
function ouvrirAuDoubleClic(entree: EntreeDocsCadre): void {
  if (entree.nature === 'document' && estProjet.value && !estDistant.value) void ouvrirAvecApplication(entree.chemin)
}
</script>

<template>
  <div class="panneau cote-docs">
    <div class="corpus-tete"><h3 ref="titre" tabindex="-1">{{ estProjet ? 'Documents du projet' : 'Documents exemples' }}</h3></div>
    <div class="actions-liste">
      <template v-if="estProjet && !estDistant">
        <div class="actions-dossiers">
          <button @click="nouveauDossier()">Nouveau dossier</button>
          <button title="Ouvrir dans le gestionnaire de fichiers" @click="ouvrirDossierLocal()">Ouvrir ce dossier</button>
        </div>
        <button class="primaire" data-tour="ajouter-document-cadre" @click="ajouterFichier()">＋ Ajouter un fichier</button>
      </template>
      <button v-else-if="estProjet" @click="ouvrirDansNextcloud()">Organiser ce dossier dans Nextcloud</button>
      <button @click="rafraichirDocsCadre()">⟳ Actualiser</button>
    </div>
    <form v-if="saisieDossier && estProjet && !estDistant" class="creation-dossier" @submit.prevent="confirmerDossier()">
      <label for="nom-dossier-docs">Nom du nouveau dossier</label>
      <input id="nom-dossier-docs" ref="champDossier" v-model="nomDossier" maxlength="255" required @keydown.esc="saisieDossier = false" />
      <button type="submit">Créer le dossier</button>
      <button type="button" @click="saisieDossier = false">Annuler</button>
    </form>
    <nav v-if="dossier" ref="navigation" class="fil-ariane" aria-label="Dossier des documents">
      <template v-for="(miette, index) in miettes" :key="miette.chemin">
        <span v-if="index" aria-hidden="true"> › </span>
        <span v-if="index === miettes.length - 1" class="dossier-courant" aria-current="location" tabindex="-1">{{ miette.nom }}</span>
        <button v-else @click="naviguer(miette.chemin)">{{ miette.nom }}</button>
      </template>
    </nav>
    <p class="annonce-dossier" role="status">{{ chargementListe ? 'Chargement…' : `Dossier courant : ${miettes[miettes.length - 1]?.nom}` }}</p>
    <div v-if="erreurListe" class="erreur-reseau" role="alert">{{ erreurListe }}</div>
    <div class="liste" :data-tour="estProjet ? 'documents-projet' : 'documents-exemples'" :aria-busy="chargementListe">
      <p v-if="!entrees.length && !chargementListe" class="vide">
        {{ dossierDocsAbsent && estProjet ? 'Vous n’avez pas encore de dossier de documents.' : 'Ce dossier est vide.' }}
      </p>
      <button
        v-for="entree in entrees" :key="entree.chemin" class="document"
        :class="{ choisi: selection?.source === source && selection?.chemin === entree.chemin, exemple: !estProjet }"
        :title="entree.nom" @click="choisir(entree)" @dblclick="ouvrirAuDoubleClic(entree)"
      >
        <span class="icone" aria-hidden="true">{{ entree.nature === 'dossier' ? '📁' : iconeTypeDocument(entree.type) }}</span>
        <span v-if="entree.nature === 'dossier'" class="annonce-dossier">Dossier : </span>
        <span class="nom">{{ entree.nom }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.cote-docs { display: flex; flex-direction: column; gap: .35rem; }
.cote-docs .corpus-tete { margin-bottom: 0; }
.actions-liste, .actions-dossiers, .fil-ariane { display: flex; gap: .35rem; flex-wrap: wrap; align-items: center; }
.actions-liste { margin-top: .75rem; }
.actions-dossiers { flex-basis: 100%; }
.fil-ariane { font-size: .8rem; }
.fil-ariane button, .dossier-courant { padding: .1rem .2rem; overflow-wrap: anywhere; min-width: 0; }
.fil-ariane button { border: none; background: none; color: #1565c0; cursor: pointer; font: inherit; }
.fil-ariane button:hover { text-decoration: underline; }
.fil-ariane button:focus-visible, .dossier-courant:focus-visible { outline: 2px solid #1565c0; outline-offset: 2px; }
.fil-ariane > span[aria-hidden] { color: #bbb; }
.dossier-courant { color: #1a1a1a; font-weight: 600; }
.creation-dossier { display: flex; flex-wrap: wrap; gap: .35rem; font-size: .82rem; }
.creation-dossier input { width: 100%; min-width: 0; }
.annonce-dossier { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); }
.erreur-reseau { background: #fdecea; color: #b3261e; border: 1px solid #f3b4ad; border-radius: 6px; font-size: .8rem; padding: .5rem .6rem; }
.liste { display: flex; flex-direction: column; gap: .25rem; }
.vide { color: #8a8f9c; font-size: .82rem; margin: .2rem 0; }
.document { display: flex; align-items: center; gap: .45rem; text-align: left; border: 1px solid #dde2ee; border-radius: 6px; background: #fff; padding: .35rem .5rem; cursor: pointer; font-size: .82rem; }
.document:hover { background: #f4f7fd; }
.document.choisi { border-color: #1565c0; box-shadow: inset 0 0 0 1px #1565c0; }
.document.exemple { border-style: dashed; }
.icone { flex: none; }
.nom { overflow-wrap: anywhere; }
.primaire { background: #1565c0; border-color: #1565c0; color: #fff; }
</style>
