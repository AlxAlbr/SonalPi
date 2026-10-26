<script setup lang="ts">
import { computed, ref } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import DialoguePassage from '../partages/DialoguePassage.vue'

const { associationRecueil, listeRecueils, recueilOuvertId, ajoutPassageEnAttente, creationRecueilAssociation,
  lectureSeule, entretienEditable, confirmerAjoutRecueil, fermerAjoutRecueil } = utiliserSonal()
const recueilId = ref(ajoutPassageEnAttente.value?.recueilId ?? recueilOuvertId.value ?? '')
const avantId = ref(ajoutPassageEnAttente.value?.avantId ?? '')
const nouveau = ref(Boolean(creationRecueilAssociation.value) || !listeRecueils.value.length)
const nom = ref(creationRecueilAssociation.value?.nom ?? '')
const occupe = ref(false)
const erreur = ref('')
const reprise = computed(() => Boolean(ajoutPassageEnAttente.value || creationRecueilAssociation.value))
const destination = computed(() => listeRecueils.value.find((recueil) => recueil.id === recueilId.value))
async function confirmer() {
  if (occupe.value || lectureSeule.value || !entretienEditable.value) return
  occupe.value = true
  erreur.value = ''
  try { await confirmerAjoutRecueil(recueilId.value, avantId.value || null, nouveau.value ? nom.value : undefined) }
  catch (e) { erreur.value = e instanceof Error ? e.message : String(e) }
  finally { occupe.value = false }
}
</script>

<template>
  <DialoguePassage v-if="associationRecueil" titre="Ajouter à un recueil" :selection="associationRecueil" :occupe="occupe" @fermer="fermerAjoutRecueil()">
    <fieldset :disabled="occupe || reprise || lectureSeule || !entretienEditable">
      <legend>Destination</legend>
      <label><input v-model="nouveau" type="checkbox"> Créer un nouveau recueil</label>
      <label v-if="nouveau">Nom du nouveau recueil<input v-model="nom"></label>
      <template v-else>
        <label>Recueil<select v-model="recueilId" @change="avantId = ''"><option disabled value="">Choisir un recueil…</option><option v-for="recueil in listeRecueils" :key="recueil.id" :value="recueil.id">{{ recueil.nom }}</option></select></label>
        <label>Emplacement du passage<select v-model="avantId"><option value="">Fin du recueil</option><option v-for="item in destination?.items ?? []" :key="item.id" :value="item.id">Avant {{ item.type === 'titre' ? item.libelle : item.type === 'texte' ? item.texte.slice(0, 40) : 'un passage' }}</option></select></label>
      </template>
    </fieldset>
    <div v-if="erreur" class="erreur" role="alert">
      <p>L’ajout n’a pas pu être terminé. Vous pouvez réessayer ou fermer ce dialogue.</p>
      <details><summary>Détails de l’erreur</summary>{{ erreur }}</details>
    </div>
    <p v-if="reprise">La tentative est conservée pour réessayer sans doublon. Un recueil déjà créé restera disponible si vous abandonnez l’ajout.</p>
    <div class="actions">
      <button :disabled="occupe" @click="fermerAjoutRecueil(true)">{{ reprise ? 'Abandonner la tentative' : 'Annuler' }}</button>
      <button :disabled="occupe || lectureSeule || !entretienEditable || (!reprise && (nouveau ? !nom.trim() : !recueilId))" @click="confirmer">{{ occupe ? 'Ajout en cours…' : reprise ? 'Réessayer l’ajout' : 'Ajouter le passage' }}</button>
    </div>
  </DialoguePassage>
</template>
