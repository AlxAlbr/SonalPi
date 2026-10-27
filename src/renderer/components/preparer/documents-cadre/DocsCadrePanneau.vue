<script setup lang="ts">
import { computed, ref } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import ApercuDocCadre from './ApercuDocCadre.vue'
import FicheDocCadre from './FicheDocCadre.vue'
import type { SourceDocumentCadre } from '../../../../shared/docsCadre'

const props = defineProps<{ source: SourceDocumentCadre }>()

// Fiche et aperçu du document choisi, toujours en lecture seule.
const {
  estDistant,
  selection,
  resumeSelection,
  apercu,
  chargementApercu,
  messageAction,
  enregistrerCopie,
  ouvrirAvecApplication,
  afficherDansDossier,
} = utiliserSonal()

const selectionEstProjet = computed(() => selection.value?.source === 'projet')
const estProjet = computed(() => props.source === 'projet')

/* Chaque onglet conserve l'état de son aide pendant la session. */
const aidesOuvertes = ref<Record<SourceDocumentCadre, boolean>>({ projet: true, exemple: true })
const aideOuverte = computed({
  get: () => aidesOuvertes.value[props.source],
  set: (ouverte: boolean) => { aidesOuvertes.value[props.source] = ouverte },
})
</script>

<template>
  <div class="panneau-docs">
    <div class="aide" :class="{ ouvert: aideOuverte }">
      <button class="aide-titre" @click="aideOuverte = !aideOuverte">
        <span>ℹ️ {{ estProjet ? 'Où sont mes documents ?' : 'À quoi servent ces exemples ?' }}</span>
        <span class="aide-bascule">{{ aideOuverte ? '▾' : '▸' }}</span>
      </button>
      <div v-if="aideOuverte" class="aide-texte">
        <template v-if="estProjet">
          <p v-if="!estDistant">
            Vos documents sont rangés dans le sous-dossier <strong>DocsPrepaProjet</strong> du corpus. 
            « Ouvrir ce dossier » vous y conduit. « Ajouter un fichier » et le glisser-déposer copient dans le dossier affiché.
            Créez un sous-dossier avec « Nouveau dossier ». SonalPi ne modifie jamais le contenu des documents.
            Pour déplacer, renommer ou supprimer, utilisez « Ouvrir ce dossier ».
            La liste se rafraîchit au retour dans cet onglet, ou avec « Actualiser ».
          </p>
          <p v-else>
            Documents lus en lecture seule sur le serveur. Pour en déposer, en renommer ou en
            supprimer, ouvrez le dossier dans Nextcloud.
          </p>
        </template>
        <p v-else>
          Ces modèles sont livrés avec SonalPi et restent inchangés. Votre DPO ou les règles de
          votre organisme restent prioritaires. Vous pouvez enregistrer une copie pour l’adapter.
        </p>
      </div>
    </div>
    <div v-if="messageAction" class="message-action">{{ messageAction }}</div>
    <div v-if="!selection" class="vide-panneau">
      <p>{{ estProjet ? 'Choisissez un document du projet dans la liste.' : 'Choisissez un document d’exemple dans la liste.' }}</p>
    </div>
    <template v-else>
      <div class="fiche-zone">
        <FicheDocCadre v-if="resumeSelection" :resume="resumeSelection" />
        <div class="actions">
          <button
            v-if="selectionEstProjet && !estDistant"
            class="primaire"
            title="Ouvrir avec l’application habituelle"
            @click="ouvrirAvecApplication(selection.chemin)"
          >Ouvrir</button>
          <button v-if="selectionEstProjet && !estDistant" @click="afficherDansDossier(selection.chemin)">Afficher dans le dossier</button>
          <button @click="enregistrerCopie(selection.source, selection.chemin)">Enregistrer une copie</button>
        </div>

        <ApercuDocCadre :apercu="apercu" :chargement="chargementApercu" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.panneau-docs { display: flex; flex-direction: column; gap: .6rem; min-width: 0; }
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
</style>
