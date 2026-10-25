<script setup lang="ts">
import { computed, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import ApercuDocCadre from './ApercuDocCadre.vue'
import FicheDocCadre from './FicheDocCadre.vue'

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
} = utiliserSonal()

const selectionEstProjet = computed(() => selection.value?.source === 'projet')

/* Bandeau d'aide repliable pendant la session. */
const aideOuverte = ref(true)
</script>

<template>
  <div class="panneau-docs">
    <div class="aide" :class="{ ouvert: aideOuverte }">
      <button class="aide-titre" @click="aideOuverte = !aideOuverte">
        <span>ℹ️ Où sont mes documents&nbsp;?</span>
        <span class="aide-bascule">{{ aideOuverte ? '▾' : '▸' }}</span>
      </button>
      <div v-if="aideOuverte" class="aide-texte">
        <p v-if="!estDistant">
          Cet onglet propose des documents d’exemple : si votre DPO fournit déjà des documents
          cadres, privilégiez les siens. Déposez vos documents dans le sous-dossier
          <strong>DocsCadre</strong> de votre corpus (glisser-déposer ou bouton « Ouvrir le
          dossier »). SonalPi ne modifie jamais leur contenu ; pour éditer, renommer ou supprimer,
          utilisez leur application habituelle. La liste se rafraîchit au retour dans cet onglet,
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
