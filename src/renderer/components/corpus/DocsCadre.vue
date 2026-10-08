<script setup lang="ts">
import { computed, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import {
  categoriserDocument,
  type SourceDocumentCadre,
  type TypeDocumentCadre,
} from '../../../shared/docsCadre'
import ApercuDocCadre from './ApercuDocCadre.vue'
import FicheDocCadre from './FicheDocCadre.vue'

// Fenêtre « Docs cadre projet » : barre latérale (actions, aide, Vos Documents
// puis Documents exemples) et panneau droit de consultation. SonalPi n'édite
// JAMAIS le contenu : aperçu en lecture seule, ouverture externe, copie exacte
// et dépôt par glisser-déposer (jamais d'écrasement). La gestion (renommer,
// supprimer) se fait hors de l'application, dans le gestionnaire de fichiers
// ou Nextcloud : l'interface indique où vivent les documents.
const {
  estDistant,
  documentsProjet,
  documentsExemples,
  selection,
  resumeSelection,
  apercu,
  chargementApercu,
  messageAction,
  erreurListe,
  selectionner,
  rafraichirDocsCadre,
  ajouterFichier,
  deposerFichiers,
  ouvrirAvecApplication,
  ouvrirDossierLocal,
  enregistrerCopie,
  ouvrirDansNextcloud,
} = utiliserSonal()

const selectionEstProjet = computed(() => selection.value?.source === 'projet')

/** Icône minimale par type ; le format générique a la sienne. */
function icone(type: TypeDocumentCadre): string {
  switch (type) {
    case 'pdf': return '📕'
    case 'texte': return '📝'
    case 'image': return '🖼️'
    case 'bureautique': return '📄'
    case 'html': return '🌐'
    case 'autre': return '📦'
  }
}

function choisir(source: SourceDocumentCadre, nom: string): void {
  selectionner({ source, nom })
}

/** Double-clic = ouvrir avec l'application (même action que le bouton du
 *  panneau) ; réservé aux documents du corpus local. */
function ouvrirAuDoubleClic(source: SourceDocumentCadre, nom: string): void {
  if (source !== 'projet' || estDistant.value) return
  void ouvrirAvecApplication(nom)
}

/* ── Glisser-déposer (corpus local uniquement) ────────────────────────── */

const survolDepot = ref(false)
let profondeurDrag = 0

function depotAutorise(): boolean {
  return !estDistant.value
}

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

/* ── Bandeau d'aide (repliable pendant la session) ────────────────────── */

const aideOuverte = ref(true)
</script>

<template>
  <div
    class="docs-cadre"
    @dragenter="surDragEnter"
    @dragover="surDragOver"
    @dragleave="surDragLeave"
    @drop="surDepot"
  >
    <aside class="cote">
      <div class="actions-liste">
        <template v-if="!estDistant">
          <button class="primaire" data-tour="ajouter-document-cadre" @click="ajouterFichier()">＋ Ajouter un fichier</button>
          <button title="Ouvrir DocsCadre/ dans le gestionnaire de fichiers" @click="ouvrirDossierLocal()">Ouvrir le dossier</button>
        </template>
        <button v-else title="Ouvrir le corpus dans l'application Fichiers de Nextcloud" @click="ouvrirDansNextcloud()">Ouvrir dans Nextcloud</button>
        <button title="Recharger la liste depuis le corpus" @click="rafraichirDocsCadre()">⟳ Actualiser</button>
      </div>

      <div v-if="erreurListe" class="erreur-reseau">{{ erreurListe }}</div>

      <h3>Vos Documents</h3>
      <div class="liste" data-tour="documents-projet">
        <p v-if="documentsProjet.length === 0" class="vide">Vous n’avez pas encore de document.</p>
        <button
          v-for="doc in documentsProjet"
          :key="doc.nom"
          class="document"
          :class="{ choisi: selection?.source === 'projet' && selection?.nom === doc.nom }"
          :title="`${doc.nom} (double-clic : ouvrir avec l’application)`"
          @click="choisir('projet', doc.nom)"
          @dblclick="ouvrirAuDoubleClic('projet', doc.nom)"
        >
          <span class="icone">{{ icone(doc.type) }}</span>
          <span class="nom">{{ doc.nom }}</span>
        </button>
      </div>

      <h3>Documents exemples</h3>
      <div class="liste">
        <p v-if="documentsExemples.length === 0" class="vide">Aucun exemple embarqué.</p>
        <button
          v-for="doc in documentsExemples"
          :key="doc.nom"
          class="document exemple"
          :class="{ choisi: selection?.source === 'exemple' && selection?.nom === doc.nom }"
          :title="doc.nom"
          @click="choisir('exemple', doc.nom)"
        >
          <span class="icone">{{ icone(doc.type) }}</span>
          <span class="nom">{{ doc.nom }}</span>
        </button>
      </div>
    </aside>

    <section class="panneau">
      <div class="aide" :class="{ ouvert: aideOuverte }">
        <button class="aide-titre" @click="aideOuverte = !aideOuverte">
          <span>ℹ️ Où sont mes documents&nbsp;?</span>
          <span class="aide-bascule">{{ aideOuverte ? '▾' : '▸' }}</span>
        </button>
        <div v-if="aideOuverte" class="aide-texte">
          <p v-if="!estDistant">
            Cette fenêtre propose des documents d’exemple : si votre DPO fournit déjà des documents
            cadres, privilégiez les siens. Déposez vos documents dans le sous-dossier
            <strong>DocsCadre</strong> de votre corpus (glisser-déposer ou bouton « Ouvrir le
            dossier »). SonalPi ne modifie jamais leur contenu ; pour éditer, renommer ou supprimer,
            utilisez leur application habituelle. La liste se rafraîchit au retour dans la fenêtre,
            ou avec « Actualiser ».
          </p>
          <p v-else>
            Documents lus en lecture seule sur le serveur. Pour en déposer, en renommer ou en
            supprimer, ouvrez le dossier dans Nextcloud.
          </p>
        </div>
      </div>
      <div v-if="messageAction" class="message-action">{{ messageAction }}</div>
      <div v-if="!selection" class="vide-panneau">
        <p>Choisissez un document dans la liste.</p>
      </div>
      <template v-else>
        <div class="fiche-zone">
          <FicheDocCadre v-if="resumeSelection" :resume="resumeSelection" />
          <div class="actions">
            <button
              v-if="selectionEstProjet && !estDistant"
              class="primaire"
              @click="ouvrirAvecApplication(selection.nom)"
            >Ouvrir avec l’application</button>
            <button @click="enregistrerCopie(selection.source, selection.nom)">Enregistrer une copie</button>
          </div>

          <ApercuDocCadre :apercu="apercu" :chargement="chargementApercu" />
        </div>
      </template>
    </section>

    <div v-if="survolDepot && depotAutorise()" class="depot-surlignage">
      Déposez vos fichiers ici
    </div>
  </div>
</template>

<style scoped>
.docs-cadre {
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
}
.cote {
  width: 260px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: .35rem;
  padding: .8rem;
  border-right: 1px solid #dde2ee;
  overflow-y: auto;
  box-sizing: border-box;
}
.actions-liste { display: flex; gap: .35rem; flex-wrap: wrap; }
.section { margin-bottom: .2rem; }
.erreur-reseau {
  background: #fdecea;
  color: #b3261e;
  border: 1px solid #f3b4ad;
  border-radius: 6px;
  font-size: .8rem;
  padding: .5rem .6rem;
}

/* Bandeau d'aide repliable */
.aide { border: 1px solid #d5dced; border-radius: 6px; background: #f2f5fb; }
.aide-titre {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: .4rem;
  text-align: left;
  background: none;
  border: none;
  padding: .45rem .6rem;
  cursor: pointer;
  font-size: .8rem;
  color: #2c3a5e;
  font-weight: 600;
}
.aide-bascule { color: #7a8299; }
.aide-texte { padding: 0 .6rem .55rem; font-size: .78rem; line-height: 1.35; color: #44506a; }
.aide-texte p { margin: 0; }

h3 { margin: .6rem 0 .2rem; font-size: .85rem; color: #44506a; }
.liste { display: flex; flex-direction: column; gap: .25rem; }
.vide { color: #8a8f9c; font-size: .82rem; margin: .2rem 0; }
.document {
  display: flex;
  align-items: center;
  gap: .45rem;
  text-align: left;
  border: 1px solid #dde2ee;
  border-radius: 6px;
  background: #fff;
  padding: .35rem .5rem;
  cursor: pointer;
  font-size: .82rem;
}
.document:hover { background: #f4f7fd; }
.document.choisi { border-color: #1565c0; box-shadow: inset 0 0 0 1px #1565c0; }
.document.exemple { border-style: dashed; }
.icone { flex: none; }
.nom { overflow-wrap: anywhere; }

.panneau {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: .6rem;
  padding: .8rem 1rem;
  overflow-y: auto;
  box-sizing: border-box;
}
.vide-panneau {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8a8f9c;
}
.message-action {
  background: #edf7ed;
  border: 1px solid #c6e6c6;
  color: #1e5e20;
  border-radius: 6px;
  padding: .4rem .6rem;
  font-size: .82rem;
}
.fiche-zone { display: flex; flex-direction: column; gap: .55rem; }
.actions { display: flex; gap: .4rem; flex-wrap: wrap; }
.actions button { font-size: .78rem; padding: .3rem .6rem; }
.primaire { background: #1565c0; border-color: #1565c0; color: #fff; }

/* Surlignage du survol de dépôt */
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