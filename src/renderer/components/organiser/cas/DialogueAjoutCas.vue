<script setup lang="ts">
import { computed, ref } from 'vue'
import { normaliserNomCas } from '../../../../shared/corpus/cas'
import { utiliserSonal } from '../../../composables/sonal'
import DialoguePassage from '../partages/DialoguePassage.vue'

const { associationCas, ajoutCasEnAttente, listeCas, lectureSeule, entretienEditable,
  confirmerAjoutCas, fermerAjoutCas } = utiliserSonal()
const recherche = ref('')
const ids = ref<string[]>([...(ajoutCasEnAttente.value?.casIds ?? [])])
const nouveau = ref(Boolean(ajoutCasEnAttente.value?.nouveauCas))
const nom = ref(ajoutCasEnAttente.value?.nouveauCas?.nom ?? '')
const memo = ref(ajoutCasEnAttente.value?.nouveauCas?.memo ?? '')
const occupe = ref(false)
const erreur = ref('')
const liste = computed(() => listeCas.value.filter((cas) => `${cas.nom} ${cas.memo}`.toLocaleLowerCase('fr').includes(recherche.value.toLocaleLowerCase('fr'))))
const memeNom = computed(() => nom.value.trim() ? listeCas.value.find((cas) => normaliserNomCas(cas.nom) === normaliserNomCas(nom.value)) : null)
const valide = computed(() => Boolean(ajoutCasEnAttente.value || ids.value.length || (nouveau.value && nom.value.trim() && !memeNom.value)))
function utiliserExistant() {
  if (memeNom.value && !ids.value.includes(memeNom.value.id)) ids.value.push(memeNom.value.id)
  nouveau.value = false
}
async function confirmer() {
  if (occupe.value || lectureSeule.value || !entretienEditable.value) return
  occupe.value = true
  erreur.value = ''
  try { await confirmerAjoutCas(ids.value, nouveau.value ? { nom: nom.value, memo: memo.value } : undefined) }
  catch (e) { erreur.value = e instanceof Error ? e.message : String(e) }
  finally { occupe.value = false }
}
</script>

<template>
  <DialoguePassage v-if="associationCas" titre="Ajouter à un cas" :selection="associationCas" :occupe="occupe" @fermer="fermerAjoutCas">
    <label>Rechercher un cas<input v-model="recherche" type="search"></label>
    <fieldset :disabled="occupe || Boolean(ajoutCasEnAttente) || lectureSeule || !entretienEditable">
      <legend>Cas destinataires</legend>
      <p v-if="!listeCas.length">Aucun cas existant. Vous pouvez en créer un ci-dessous.</p>
      <p v-else-if="!liste.length">Aucun résultat pour cette recherche.</p>
      <label v-for="cas in liste" :key="cas.id"><input v-model="ids" type="checkbox" :value="cas.id"> {{ cas.nom }}</label>
      <button v-if="!nouveau" @click="nouveau = true">Créer un nouveau cas</button>
      <div v-else>
        <label>Nom du nouveau cas *<input v-model="nom"></label>
        <label>Mémo — facultatif<textarea v-model="memo" rows="2"></textarea></label>
        <p v-if="memeNom" class="erreur">Le cas « {{ memeNom.nom }} » existe déjà. <button @click="utiliserExistant">L’associer à la sélection</button></p>
        <button @click="nouveau = false">Ne pas créer de nouveau cas</button>
      </div>
    </fieldset>
    <div v-if="erreur" class="erreur" role="alert">
      <p>L’ajout n’a pas pu être terminé. Vous pouvez réessayer ou fermer ce dialogue.</p>
      <details><summary>Détails de l’erreur</summary>{{ erreur }}</details>
    </div>
    <p v-if="ajoutCasEnAttente">L’ajout reste à terminer. Réessayez sans créer de doublon, ou abandonnez cette tentative.</p>
    <div class="actions">
      <button :disabled="occupe" @click="fermerAjoutCas(true)">{{ ajoutCasEnAttente ? 'Abandonner la tentative' : 'Annuler' }}</button>
      <button :disabled="occupe || !valide || lectureSeule || !entretienEditable" @click="confirmer">{{ occupe ? 'Ajout en cours…' : ajoutCasEnAttente ? 'Réessayer l’association' : nouveau ? 'Créer et associer' : 'Associer la sélection' }}</button>
    </div>
  </DialoguePassage>
</template>
