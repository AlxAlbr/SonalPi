<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'

const { demandeRenommageGlobal: demande, renommageGlobalOccupe: occupe, enregistrementRenommageGlobal: enregistrement,
  erreurRenommageGlobal: erreur, confirmerRenommageGlobal, annulerRenommageGlobal } = utiliserSonal()
const dialogue = ref<HTMLDialogElement | null>(null)
const annuler = ref<HTMLButtonElement | null>(null)
const retour = [...document.querySelectorAll<HTMLInputElement>('.modale-locuteurs .nom-loc')]
  .find((champ) => champ.dataset.participationId === demande.value?.reference.participationId)
  ?? document.activeElement as HTMLElement | null
onMounted(async () => { dialogue.value?.showModal(); await nextTick(); annuler.value?.focus() })
onBeforeUnmount(() => {
  dialogue.value?.close()
  if (retour?.isConnected && !retour.matches(':disabled')) retour.focus()
  else document.querySelector<HTMLElement>('.modale-locuteurs button.fermer')?.focus()
})
</script>

<template>
  <dialog ref="dialogue" aria-labelledby="titre-renommage-ouvert" :aria-busy="occupe" @cancel.prevent="annulerRenommageGlobal">
    <form v-if="demande" @submit.prevent="confirmerRenommageGlobal">
      <h2 id="titre-renommage-ouvert">Renommer ce locuteur dans les entretiens</h2>
      <p v-if="!demande.apercu && occupe" role="status">Préparation des entretiens concernés…</p>
      <template v-if="demande.apercu">
        <p>Le nouveau nom sera utilisé dans les {{ demande.apercu.participations.length }} entretien{{ demande.apercu.participations.length > 1 ? 's' : '' }} associés, y compris cet entretien.</p>
        <ul><li v-for="p in demande.apercu.participations" :key="JSON.stringify([p.entretienId, p.participationId])">{{ p.entretienTitre }} · {{ p.nom }}</li></ul>
        <label>Nouveau nom<input v-model="demande.nom" type="text" required :disabled="occupe" /></label>
        <p>Les paroles, notes, pseudonymes, rôles, couleurs et données restent inchangés. Le texte courant est sauvegardé avant le renommage.</p>
      </template>
      <p v-if="erreur" role="alert">{{ erreur }}</p>
      <div class="actions">
        <button ref="annuler" type="button" :disabled="enregistrement" @click="annulerRenommageGlobal">{{ erreur ? 'Fermer' : 'Annuler' }}</button>
        <button type="submit" :disabled="occupe || !!erreur || !demande.apercu || !demande.nom.trim()">{{ enregistrement ? 'Enregistrement…' : 'Renommer dans tous les entretiens' }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(600px, calc(100vw - 4rem)); max-height: 80vh; overflow: auto; border: 1px solid #aebbd0; border-radius: 8px; padding: 1.3rem; }
dialog::backdrop { background: #0006; }
h2 { margin-top: 0; font-size: 1.2rem; }
ul { max-height: 30vh; overflow: auto; }
li { padding: .2rem 0; overflow-wrap: anywhere; }
label { display: block; }
input { display: block; width: 100%; box-sizing: border-box; margin-top: .3rem; padding: .5rem; }
.actions { display: flex; flex-wrap: wrap; gap: .7rem; justify-content: flex-end; margin-top: 1rem; }
button { padding: .5rem .7rem; cursor: pointer; }
button:disabled { opacity: .6; cursor: default; }
[role=alert] { color: #9b2626; }
button:focus-visible, input:focus-visible { outline: 2px solid #356ac3; outline-offset: 2px; }
</style>
