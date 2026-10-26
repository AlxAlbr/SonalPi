<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import AccueilPreparation from './AccueilPreparation.vue'
import PanneauTableauBord from './tableau-bord/PanneauTableauBord.vue'
import TableauBord from './tableau-bord/TableauBord.vue'
import DocsCadreCote from './documents-cadre/DocsCadreCote.vue'
import DocsCadrePanneau from './documents-cadre/DocsCadrePanneau.vue'
import icoMaison from '../../assets/icones/maison.png'
import icoCalendrier from '../../assets/icones/calendrier.png'
import icoDocuments from '../../assets/icones/documents.png'
import icoExemples from '../../assets/icones/exemples.svg'

// Les onglets et leurs commandes sont à gauche, le contenu de travail à droite.
// Les panneaux restent montés pour conserver les brouillons entre deux onglets.
const {
  sousEspacePreparation,
  docsCadreOuverts,
  afficherAccueilPreparation,
  afficherTableauBord,
  afficherDocsCadre,
  afficherDocumentsExemples,
  estDistant,
  gesteDisponible,
  deposerFichiers,
} = utiliserSonal()

/** Un fournisseur peut ne pas proposer les documents du projet (GitLab). */
const docsDisponibles = computed(() => gesteDisponible('docsCadre'))
const surAccueil = computed(() => sousEspacePreparation.value === 'accueil')
const surDocsProjet = computed(
  () => sousEspacePreparation.value === 'docs-cadre' && docsDisponibles.value,
)
const surDocumentsExemples = computed(
  () => sousEspacePreparation.value === 'documents-exemples',
)
/* Sans documents du projet, « Tableau de bord » reste l'onglet de repli. */
const surTableau = computed(() => !surAccueil.value && !surDocsProjet.value && !surDocumentsExemples.value)

/* Le dépôt de documents est réservé à l'onglet actif d'un corpus local. */
const survolDepot = ref(false)
let profondeurDrag = 0

function depotAutorise(): boolean {
  return docsCadreOuverts.value && !estDistant.value
}

watch(docsCadreOuverts, (actif) => {
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
    <aside class="cote-preparation">
      <nav class="onglets-preparation" aria-label="Outils de préparation">
        <button
          class="onglet"
          data-tour="ouvrir-accueil-preparation"
          :class="{ actif: surAccueil }"
          :aria-current="surAccueil ? 'page' : undefined"
          title="Accueil"
          aria-label="Accueil"
          @click="afficherAccueilPreparation()"
        ><img class="ico-onglet" :src="icoMaison" alt="" /></button>
        <button
          class="onglet"
          data-tour="ouvrir-tableau-bord"
          :class="{ actif: surTableau }"
          :aria-current="surTableau ? 'page' : undefined"
          title="Tableau de bord"
          aria-label="Tableau de bord"
          @click="afficherTableauBord()"
        ><img class="ico-onglet" :src="icoCalendrier" alt="" /></button>
        <button
          v-if="docsDisponibles"
          class="onglet"
          data-tour="ouvrir-docs-cadre"
          :class="{ actif: surDocsProjet }"
          :aria-current="surDocsProjet ? 'page' : undefined"
          title="Documents du projet"
          aria-label="Documents du projet"
          @click="afficherDocsCadre()"
        ><img class="ico-onglet" :src="icoDocuments" alt="" /></button>
        <button
          class="onglet"
          data-tour="ouvrir-documents-exemples"
          :class="{ actif: surDocumentsExemples }"
          :aria-current="surDocumentsExemples ? 'page' : undefined"
          title="Documents exemples"
          aria-label="Documents exemples"
          @click="afficherDocumentsExemples()"
        ><img class="ico-onglet" :src="icoExemples" alt="" /></button>
      </nav>
      <div class="cote-corps">
        <AccueilPreparation v-show="surAccueil" />
        <PanneauTableauBord v-show="surTableau" />
        <DocsCadreCote
          v-show="surDocsProjet || surDocumentsExemples"
          :source="surDocumentsExemples ? 'exemple' : 'projet'"
        />
      </div>
    </aside>

    <section class="principal">
      <!-- L'Accueil garde le tableau sous les yeux : la grille reste commune
           aux deux onglets, seules les commandes de gauche changent. -->
      <div v-show="surAccueil || surTableau" class="outil-preparation">
        <div data-tour="ancre-guide-tableau"></div>
        <TableauBord />
      </div>
      <div v-show="surDocsProjet || surDocumentsExemples" class="outil-preparation">
        <div v-show="surDocsProjet" data-tour="ancre-guide-docs-cadre"></div>
        <DocsCadrePanneau :source="surDocumentsExemples ? 'exemple' : 'projet'" />
      </div>
    </section>

    <div v-if="survolDepot && depotAutorise()" class="depot-surlignage">
      Déposez vos fichiers ici
    </div>
  </section>
</template>

<style scoped>
.espace-preparation {
  position: relative;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 1rem;
  align-items: stretch;
  /* Chaque colonne défile dans la hauteur disponible sous l'en-tête. */
  height: calc(100vh - var(--entete-h) - 1.6rem);
  padding-top: 0.7rem;
  box-sizing: border-box;
}
@media (max-width: 780px) {
  .espace-preparation { grid-template-columns: minmax(0, 1fr); height: auto; }
}
.cote-preparation {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 0.2rem;
}
.onglets-preparation {
  display: flex;
  gap: 0.25rem;
  flex: none;
  min-width: 0;
}
/* Onglets à icône, comme la barre du corpus : le libellé reste dans l'infobulle. */
.onglet {
  width: 38px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ddd;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #f0f0f5;
  padding: 0.35rem;
  cursor: pointer;
}
.onglet.actif {
  background: #fff;
}
.onglet:hover { background: #fff; }
.ico-onglet {
  width: 20px;
  height: 20px;
  object-fit: contain;
  opacity: 0.6;
  flex: none;
}
.onglet.actif .ico-onglet { opacity: 1; }
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
