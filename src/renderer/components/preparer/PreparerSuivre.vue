<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import AccueilPreparation from './AccueilPreparation.vue'
import PanneauTableauBord from './tableau-bord/PanneauTableauBord.vue'
import TableauBord from './tableau-bord/TableauBord.vue'
import DocsCadreCote from './documents-cadre/DocsCadreCote.vue'
import DocsCadrePanneau from './documents-cadre/DocsCadrePanneau.vue'
import OngletsEspace from '../app/OngletsEspace.vue'
import { URL_KIT_PEDAGOGIQUE } from '../../../shared/ressourcesPedagogiques'
import icoMaison from '../../assets/icones/maison.png'
import icoCalendrier from '../../assets/icones/calendrier.png'
import icoDocuments from '../../assets/icones/documents.png'
import icoExemples from '../../assets/icones/exemples.svg'

// Les onglets sont en haut ; leurs commandes à gauche, le contenu de travail à droite.
// Les panneaux restent montés pour conserver les brouillons entre deux onglets.
const {
  sousEspacePreparation,
  afficherAccueilPreparation,
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
const surAccueil = computed(() => sousEspacePreparation.value === 'accueil')
const surDocsProjet = computed(
  () => sousEspacePreparation.value === 'docs-cadre' && docsDisponibles.value,
)
const surDocumentsExemples = computed(
  () => sousEspacePreparation.value === 'documents-exemples',
)
/* Sans documents du projet, « Tableau de bord » reste l'onglet de repli. */
const surTableau = computed(() => !surAccueil.value && !surDocsProjet.value && !surDocumentsExemples.value)

type OngletPreparation = 'accueil' | 'tableau-bord' | 'docs-cadre' | 'documents-exemples'
const onglets = computed(() => {
  const liste: { id: OngletPreparation; libelle: string; icone: string; tour: string }[] = [
    { id: 'accueil', libelle: 'Accueil', icone: icoMaison, tour: 'ouvrir-accueil-preparation' },
    { id: 'tableau-bord', libelle: 'Tableau de bord', icone: icoCalendrier, tour: 'ouvrir-tableau-bord' },
    { id: 'docs-cadre', libelle: 'Documents du projet', icone: icoDocuments, tour: 'ouvrir-docs-cadre' },
    { id: 'documents-exemples', libelle: 'Documents exemples', icone: icoExemples, tour: 'ouvrir-documents-exemples' },
  ]
  return liste.filter((onglet) => onglet.id !== 'docs-cadre' || docsDisponibles.value)
})
const ongletActif = computed<OngletPreparation>(() =>
  surAccueil.value ? 'accueil' : surDocsProjet.value ? 'docs-cadre' : surDocumentsExemples.value ? 'documents-exemples' : 'tableau-bord',
)
function choisirOnglet(id: OngletPreparation) {
  if (id === 'accueil') afficherAccueilPreparation()
  else if (id === 'tableau-bord') afficherTableauBord()
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
        <AccueilPreparation v-show="surAccueil" />
        <PanneauTableauBord v-show="surTableau" />
        <DocsCadreCote
          v-show="surDocsProjet || surDocumentsExemples"
          :source="surDocumentsExemples ? 'exemple' : 'projet'"
        />
      </div>
    </aside>

    <section class="principal">
      <article v-show="surAccueil" class="presentation-preparation" aria-labelledby="titre-accueil-preparation">
        <h2 id="titre-accueil-preparation">Message un peu long mais pouvant servir ...</h2>
        <p>L’organisation avec un tableau de bord ainsi que l'organisation en espaces de travail
          ("Préparer et suivre", "Importer et traiter", "Analyser et interpréter", "Organiser et exporter")
          peut conduire à une organisation linéaire et séquentielle.<br>
          En grossissant le trait, on attend d'avoir fini de cocher une case avant de commencer la suivante.</p>
        <p>Or, c'est loin d'être la recommandation et le mode de fonctionnement des concepteurs de ce logiciel.<br>
          Nous pensons au contraire que <strong>des réalisations d'actions en parallèle (avec parfois des retours en arrière) ont beaucoup d'intérêt en analyse qualitative</strong>.<br>
          Il arrive qu'après de premiers entretiens exploratoires, on se rende compte qu'il faille changer la problématique.
          Sur un autre plan, il est inutile d'attendre la fin de tous les entretiens pour commencer à faire des premières analyses ...<br>
          Bref, ne vous enfermez pas dans une approche trop séquentielle du fait de l'interface.</p>
          <p><strong>Bonnes explorations et utilisations !</strong></p>
      </article>
      <div v-show="surTableau" class="outil-preparation">
        <div data-tour="ancre-guide-tableau"></div>
        <TableauBord />
      </div>
      <div v-show="surDocsProjet || surDocumentsExemples" class="outil-preparation">
        <div v-show="surDocsProjet" data-tour="ancre-guide-docs-cadre"></div>
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
.presentation-preparation { padding: 1.4rem; border: 1px solid #dce3ed; border-radius: 10px; background: #f8fafe; line-height: 1.6; }
.presentation-preparation h2 { margin: 0 0 1rem; font-size: 1.15rem; color: #294c70; }
.presentation-preparation p { margin: 0 0 1rem; font-size: 0.9rem; }
.presentation-preparation a { color: #175d9e; overflow-wrap: anywhere; }
.presentation-preparation a:focus-visible { outline: 3px solid #a55b00; outline-offset: 3px; }
.presentation-preparation .aide-lien { margin-bottom: 0; color: #607184; font-size: .8rem; }
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
