<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import PanneauTableauBord from './tableau-bord/PanneauTableauBord.vue'
import TableauBord from './tableau-bord/TableauBord.vue'
import DocsCadreCote from './documents-cadre/DocsCadreCote.vue'
import DocsCadrePanneau from './documents-cadre/DocsCadrePanneau.vue'
import OngletsEspace from '../app/OngletsEspace.vue'
import icoCalendrier from '../../assets/icones/calendrier.png'
import icoDocuments from '../../assets/icones/documents.png'
import icoExemples from '../../assets/icones/exemples.svg'

// Les onglets sont en haut ; leurs commandes à gauche, le contenu de travail à droite.
// Les panneaux restent montés pour conserver les brouillons entre deux onglets.
const {
  sousEspacePreparation,
  afficherTableauBord,
  afficherDocsCadre,
  afficherDocumentsExemples,
  estDistant,
  gesteDisponible,
  deposerFichiers,
  dossiersDocsCadre,
} = utiliserSonal()

/** Un fournisseur peut ne pas proposer les documents du projet (GitLab). */
const docsDisponibles = computed(() => gesteDisponible('docsCadre'))
const surDocsProjet = computed(
  () => sousEspacePreparation.value === 'docs-cadre' && docsDisponibles.value,
)
const surDocumentsExemples = computed(
  () => sousEspacePreparation.value === 'documents-exemples',
)
/* Sans documents du projet, « Tableau de bord » reste l'onglet de repli. */
const surTableau = computed(() => !surDocsProjet.value && !surDocumentsExemples.value)

type OngletPreparation = 'tableau-bord' | 'docs-cadre' | 'documents-exemples'
const onglets = computed(() => {
  const liste: { id: OngletPreparation; libelle: string; icone: string; tour: string }[] = [
    { id: 'tableau-bord', libelle: 'Tableau de bord', icone: icoCalendrier, tour: 'ouvrir-tableau-bord' },
    { id: 'docs-cadre', libelle: 'Documents du projet', icone: icoDocuments, tour: 'ouvrir-docs-cadre' },
    { id: 'documents-exemples', libelle: 'Documents exemples', icone: icoExemples, tour: 'ouvrir-documents-exemples' },
  ]
  return liste.filter((onglet) => onglet.id !== 'docs-cadre' || docsDisponibles.value)
})
const ongletActif = computed<OngletPreparation>(() =>
  surDocsProjet.value ? 'docs-cadre' : surDocumentsExemples.value ? 'documents-exemples' : 'tableau-bord',
)
function choisirOnglet(id: OngletPreparation) {
  if (id === 'tableau-bord') afficherTableauBord()
  else if (id === 'docs-cadre') afficherDocsCadre()
  else afficherDocumentsExemples()
}

/* Le dépôt de documents est réservé à l'onglet actif d'un corpus local. */
const survolDepot = ref(false)
let profondeurDrag = 0

function depotAutorise(): boolean {
  return surDocsProjet.value && !estDistant.value
}

watch(surDocsProjet, (actif) => {
  if (actif) return
  profondeurDrag = 0
  survolDepot.value = false
})

function surDragEnter(event: DragEvent): void {
  if (!depotAutorise()) return
  event.preventDefault()
  profondeurDrag += 1
  survolDepot.value = true
}
function surDragOver(event: DragEvent): void {
  if (!depotAutorise()) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}
function surDragLeave(): void {
  if (!depotAutorise()) return
  profondeurDrag = Math.max(0, profondeurDrag - 1)
  if (profondeurDrag === 0) survolDepot.value = false
}
async function surDepot(event: DragEvent): Promise<void> {
  if (!depotAutorise()) return
  event.preventDefault()
  event.stopPropagation()
  profondeurDrag = 0
  survolDepot.value = false
  const chemins = Array.from(event.dataTransfer?.files ?? [])
    .map((fichier) => {
      try {
        return window.sonal.fichier.cheminDe(fichier)
      } catch {
        return null
      }
    })
    .filter((chemin): chemin is string => chemin !== null && chemin !== '')
  await deposerFichiers(chemins)
}
</script>

<template>
  <section
    class="espace-preparation"
    aria-label="Préparer et suivre"
    @dragenter="surDragEnter"
    @dragover="surDragOver"
    @dragleave="surDragLeave"
    @drop="surDepot"
  >
    <OngletsEspace
      class="onglets-preparation"
      aria-label="Outils de préparation"
      :onglets="onglets"
      :actif="ongletActif"
      @choisir="choisirOnglet"
    />
    <aside class="cote-preparation">
      <div class="cote-corps">
        <PanneauTableauBord v-show="surTableau" />
        <DocsCadreCote
          v-show="surDocsProjet || surDocumentsExemples"
          :source="surDocumentsExemples ? 'exemple' : 'projet'"
        />
      </div>
    </aside>

    <section class="principal">
      <div v-show="surTableau" class="outil-preparation">
        <div class="ancre-guide" data-tour="ancre-guide-tableau"></div>
        <TableauBord />
      </div>
      <div v-show="surDocsProjet || surDocumentsExemples" class="outil-preparation">
        <div v-show="surDocsProjet" class="ancre-guide" data-tour="ancre-guide-docs-cadre"></div>
        <DocsCadrePanneau :source="surDocumentsExemples ? 'exemple' : 'projet'" />
      </div>
    </section>

    <div v-if="survolDepot && depotAutorise()" class="depot-surlignage">
      Ajouter dans « {{ dossiersDocsCadre.projet.split('/').pop() || 'Documents du projet' }} »
    </div>
  </section>
</template>

<style scoped>
.espace-preparation {
  position: relative;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.75rem 1rem;
  align-items: stretch;
  /* Sous les onglets, chaque colonne défile dans la hauteur disponible. */
  height: calc(100vh - var(--entete-h) - 1.6rem);
  padding-top: 0.7rem;
  box-sizing: border-box;
}
.onglets-preparation {
  grid-column: 1 / -1;
}
@media (max-width: 780px) {
  .espace-preparation { grid-template-columns: minmax(0, 1fr); height: auto; }
}
.cote-preparation {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 0.2rem;
}
.cote-corps { flex: 1; min-height: 0; }
.principal {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  overflow-y: auto;
}
.outil-preparation { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; min-height: 0; flex: 1; }
/* Emplacement des consignes du guide pas à pas : vide, il ne décale pas le contenu vers le bas. */
.ancre-guide:empty { display: none; }
.depot-surlignage {
  position: absolute;
  inset: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed #1565c0;
  border-radius: 8px;
  background: rgba(227, 242, 253, .85);
  color: #0d47a1;
  font-size: 1rem;
  font-weight: 600;
  pointer-events: none;
  z-index: 10;
}
</style>
