<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { nettoyerMessage } from '../../erreurs'
import { EXEMPLES } from '../../../shared/exemples'
const { demandeInstallation, installerExemple, operationExemple, etatExemples, catalogueParcours } = utiliserSonal()
const demande = demandeInstallation.value!
const dialogue = ref<HTMLDialogElement | null>(null)
const emplacement = ref(demande.emplacement)
const erreur = ref<string | null>(null)
const titreParcours = catalogueParcours.find((parcours) => parcours.id === demande.lancement?.parcoursId)?.titre
const titre = demande.lancement ? `Préparer la démo « ${titreParcours} »`
  : `Préparer « ${EXEMPLES.find((e) => e.id === demande.exemple)!.titre} »`
onMounted(() => dialogue.value?.showModal())
function fermer() { if (!operationExemple.value) demandeInstallation.value = null }
async function choisir() {
  const dir = await window.sonal.dialog.choisirDossier('corpus', emplacement.value)
  if (dir) emplacement.value = dir
}
async function valider() {
  erreur.value = null
  try { await installerExemple(emplacement.value) } catch (e) { erreur.value = nettoyerMessage(e) }
}
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialogue" class="installation-exemple" aria-labelledby="titre-installation-exemple" @cancel.prevent="fermer">
      <form @submit.prevent="valider">
        <h2 id="titre-installation-exemple">{{ titre }}</h2>
        <p v-if="demande.lancement?.parcoursId === 'preparation'">Un corpus vierge sera créé à l’emplacement choisi. Vous commencerez ensuite par organiser le suivi du projet.</p>
        <p v-else-if="demande.lancement?.parcoursId === 'analyse'">Une copie du corpus annoté sera créée à l’emplacement choisi : quatre entretiens, leurs thèmes et leurs variables, prêts à explorer. Vous apprendrez à rassembler les passages, explorer le vocabulaire et comparer les entretiens.</p>
        <p v-else-if="demande.lancement?.parcoursId === 'organisation'">Une copie indépendante du corpus annoté sera créée à l’emplacement choisi, avec quatre entretiens prêts à utiliser. Vous apprendrez à créer un cas, composer un recueil et exporter des copies de lecture. Aucun import préalable n’est nécessaire.</p>
        <p v-else-if="demande.usage === 'apprentissage'">Vous réaliserez vous-même les imports proposés. Le corpus vide et les fichiers d’exercice seront préparés pour vous.</p>
        <p v-else>{{ EXEMPLES.find(e => e.id === demande.exemple)!.resume }}</p>
        <p>Cette copie sera modifiable.</p>
        <label for="emplacement-exemple">{{ demande.usage === 'apprentissage' ? 'Emplacement de la démo' : 'Emplacement de votre copie' }}</label>
        <div class="champ"><input id="emplacement-exemple" :value="emplacement" readonly><button type="button" :disabled="operationExemple" @click="choisir">Modifier…</button></div>
        <details><summary>Fichiers d’exercice</summary><p>Les transcriptions, les audios et le guide d’entretien restent séparés de votre travail. Les audios sont communs aux copies.</p><p class="chemin">{{ etatExemples?.sources }}</p></details>
        <p v-if="erreur" class="erreur" role="alert">{{ erreur }}</p>
        <div class="actions"><button type="button" :disabled="operationExemple" @click="fermer">{{ demande.lancement ? 'Retour aux parcours' : 'Retour aux exemples' }}</button><button class="principal" :disabled="operationExemple">{{ operationExemple ? 'Préparation…' : demande.lancement ? 'Préparer et commencer' : 'Ouvrir ma copie' }}</button></div>
      </form>
    </dialog>
  </Teleport>
</template>
<style scoped>
dialog { width: min(560px, 92vw); max-height: 90vh; overflow: auto; border: 1px solid #bdcde0; border-radius: 12px; padding: 1.3rem; }
dialog::backdrop { background: #10263e80; }
h2 { font-size: 1.05rem; color: #1565c0; } p, label, summary, input, button { font-size: .85rem; }
label { display: block; margin-bottom: .4rem; } .champ, .actions { display: flex; gap: .5rem; flex-wrap: wrap; }
input { flex: 1; min-width: 0; padding: .5rem; } button { cursor: pointer; padding: .5rem .7rem; border: 1px solid #bdcde0; border-radius: 6px; background: white; }
.principal { color: white; background: #2368ae; } details { margin: 1rem 0; } summary { cursor: pointer; }
.chemin { overflow-wrap: anywhere; }.erreur { background: #ffebe8; color: #8c231b; padding: .6rem; }
</style>
