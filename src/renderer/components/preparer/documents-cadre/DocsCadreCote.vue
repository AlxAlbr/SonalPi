<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { iconeTypeDocument } from '../../../composables/corpus/useDocsCadre'
import type { SourceDocumentCadre } from '../../../../shared/docsCadre'

const props = defineProps<{ source: SourceDocumentCadre }>()

// La liste accompagne l'aperçu ; le contenu des documents n'est jamais modifié.
const {
  estDistant,
  documentsProjet,
  documentsExemples,
  selection,
  erreurListe,
  selectionner,
  rafraichirDocsCadre,
  ajouterFichier,
  ouvrirAvecApplication,
  ouvrirDossierLocal,
  ouvrirDansNextcloud,
} = utiliserSonal()

const estProjet = computed(() => props.source === 'projet')

function choisir(source: SourceDocumentCadre, nom: string): void {
  selectionner({ source, nom })
}

/** Double-clic = ouvrir avec l'application (même action que le panneau) ;
 *  réservé aux documents du corpus local. */
function ouvrirAuDoubleClic(source: SourceDocumentCadre, nom: string): void {
  if (source !== 'projet' || estDistant.value) return
  void ouvrirAvecApplication(nom)
}
</script>

<template>
  <div class="panneau cote-docs">
    <div class="corpus-tete">
      <h3>{{ estProjet ? 'Documents du projet' : 'Documents exemples' }}</h3>
    </div>

    <template v-if="estProjet">
      <div class="actions-liste">
        <template v-if="!estDistant">
          <button class="primaire" data-tour="ajouter-document-cadre" @click="ajouterFichier()">＋ Ajouter un fichier</button>
          <button title="Ouvrir DocsCadre/ dans le gestionnaire de fichiers" @click="ouvrirDossierLocal()">Ouvrir le dossier</button>
        </template>
        <button v-else title="Ouvrir le corpus dans l'application Fichiers de Nextcloud" @click="ouvrirDansNextcloud()">Ouvrir dans Nextcloud</button>
        <button title="Recharger la liste depuis le corpus" @click="rafraichirDocsCadre()">⟳ Actualiser</button>
      </div>

      <div v-if="erreurListe" class="erreur-reseau">{{ erreurListe }}</div>

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
          <span class="icone">{{ iconeTypeDocument(doc.type) }}</span>
          <span class="nom">{{ doc.nom }}</span>
        </button>
      </div>
    </template>

    <template v-else>
      <p class="introduction-exemples">
        Ces modèles sont fournis avec SonalPi. Consultez-les ou enregistrez-en une copie pour l’adapter à votre projet.
      </p>
      <div class="liste" data-tour="documents-exemples">
        <p v-if="documentsExemples.length === 0" class="vide">Aucun exemple embarqué.</p>
        <button
          v-for="doc in documentsExemples"
          :key="doc.nom"
          class="document exemple"
          :class="{ choisi: selection?.source === 'exemple' && selection?.nom === doc.nom }"
          :title="doc.nom"
          @click="choisir('exemple', doc.nom)"
        >
          <span class="icone">{{ iconeTypeDocument(doc.type) }}</span>
          <span class="nom">{{ doc.nom }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cote-docs { display: flex; flex-direction: column; gap: .35rem; }
.cote-docs .corpus-tete { margin-bottom: 0; }
.actions-liste { display: flex; gap: .35rem; flex-wrap: wrap; }
.erreur-reseau {
  background: #fdecea;
  color: #b3261e;
  border: 1px solid #f3b4ad;
  border-radius: 6px;
  font-size: .8rem;
  padding: .5rem .6rem;
}
.introduction-exemples { margin: .2rem 0 .45rem; color: #44506a; font-size: .82rem; line-height: 1.35; }
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
.primaire { background: #1565c0; border-color: #1565c0; color: #fff; }
</style>
