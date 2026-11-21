<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { suspendreTirageAutomatique } from '../../../tirageAutomatique'

const props = defineProps<{ actif: boolean }>()
const emit = defineEmits<{ actualiser: [synchroniser: boolean] }>()
const { suiviLocuteurs, erreurSuiviLocuteurs, revisionSuiviLocuteurs, dossierCourantDir, idDistantCourant,
  rafraichirSuiviLocuteurs, oublierSuiviLocuteurs, reprendreCorrectionLocuteurs, verifierCorrectionLocuteurs, arreterCorrectionLocuteurs, repriseCorrectionLocuteursPossible } = utiliserSonal()
const lecture = ref(false), enregistrement = ref(false), message = ref('')
const confirmationArret = ref(false), dialogueArret = ref<HTMLDialogElement | null>(null), annulerArret = ref<HTMLButtonElement | null>(null)
let retourArret: HTMLElement | null = null
async function demanderArret() {
  if (enregistrement.value || suiviLocuteurs.value?.etat !== 'a-reprendre') return
  retourArret = document.activeElement as HTMLElement | null
  confirmationArret.value = true; await nextTick(); dialogueArret.value?.showModal(); annulerArret.value?.focus()
}
function fermerArret() {
  if (enregistrement.value) return
  dialogueArret.value?.close(); confirmationArret.value = false
  if (retourArret?.isConnected) retourArret.focus()
}
let generation = 0
let reprendreTirage: (() => void) | null = null
watch(() => !!suiviLocuteurs.value || !!erreurSuiviLocuteurs.value || lecture.value || enregistrement.value, (suspendre) => {
  if (suspendre && !reprendreTirage) reprendreTirage = suspendreTirageAutomatique()
  else if (!suspendre) { reprendreTirage?.(); reprendreTirage = null }
}, { immediate: true })
async function actualiser() {
  const courant = generation
  if (!enregistrement.value) message.value = ''
  lecture.value = true
  try { await rafraichirSuiviLocuteurs() }
  finally { if (courant === generation) lecture.value = false }
}
async function agir(arreter = false) {
  const suivi = suiviLocuteurs.value, courant = generation
  if (!suivi || enregistrement.value || lecture.value || !repriseCorrectionLocuteursPossible()) return
  enregistrement.value = true; message.value = ''
  try {
    if (arreter) await arreterCorrectionLocuteurs(suivi.operationId)
    else if (suivi.etat === 'a-verifier') await verifierCorrectionLocuteurs(suivi.operationId)
    else await reprendreCorrectionLocuteurs(suivi.operationId)
    if (courant !== generation) return
    await actualiser()
    if (courant !== generation) return
    dialogueArret.value?.close(); confirmationArret.value = false
    message.value = arreter ? 'La correction est arrêtée. Les modifications déjà enregistrées sont conservées.'
      : suiviLocuteurs.value ? 'Le résultat a été vérifié. Vous pouvez reprendre les étapes restantes.' : 'La correction est terminée.'
    emit('actualiser', !suiviLocuteurs.value)
  } catch (e) {
    if (courant === generation) {
      message.value = e instanceof Error ? e.message : String(e)
      await actualiser()
    }
  } finally { if (courant === generation) enregistrement.value = false }
}
watch([dossierCourantDir, idDistantCourant], () => {
  generation++; lecture.value = false; enregistrement.value = false; message.value = ''
  dialogueArret.value?.close(); confirmationArret.value = false
  oublierSuiviLocuteurs()
  if (props.actif && idDistantCourant.value) void actualiser()
})
watch([() => props.actif, revisionSuiviLocuteurs], () => { if (props.actif && idDistantCourant.value && !enregistrement.value) void actualiser() }, { immediate: true })
onBeforeUnmount(() => { generation++; dialogueArret.value?.close(); oublierSuiviLocuteurs(); reprendreTirage?.(); reprendreTirage = null })
</script>

<template>
  <section v-if="suiviLocuteurs || erreurSuiviLocuteurs || message" class="suivi-corrections-locuteurs" aria-label="Correction des locuteurs à terminer" :aria-busy="lecture || enregistrement">
    <template v-if="suiviLocuteurs">
      <h3>{{ suiviLocuteurs.action }}</h3>
      <p>{{ suiviLocuteurs.termines }} étape(s) confirmée(s) sur {{ suiviLocuteurs.total }}. Les modifications déjà enregistrées sont conservées.</p>
      <p v-if="suiviLocuteurs.etat === 'a-verifier'">La réponse du serveur n’a pas pu être vérifiée. Vérifiez le résultat pour pouvoir reprendre ou arrêter la correction. Les étapes déjà enregistrées ne seront pas renvoyées.</p>
      <p v-else>Cette correction n’est pas terminée. Reprenez les étapes restantes avant de modifier les locuteurs ou les entretiens de ce corpus.</p>
      <button type="button" :disabled="lecture || enregistrement || !repriseCorrectionLocuteursPossible()" @click="agir()">{{ suiviLocuteurs.etat === 'a-verifier' ? 'Vérifier le résultat' : 'Reprendre la correction' }}</button>
      <button v-if="suiviLocuteurs.etat === 'a-reprendre'" type="button" :disabled="lecture || enregistrement || !repriseCorrectionLocuteursPossible()" @click="demanderArret">Arrêter cette correction…</button>
    </template>
    <p v-if="erreurSuiviLocuteurs" role="alert">{{ erreurSuiviLocuteurs }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <button type="button" :disabled="lecture || enregistrement" @click="actualiser">Actualiser le suivi</button>
    <dialog v-if="confirmationArret" ref="dialogueArret" aria-labelledby="titre-arret-correction" @cancel.prevent="fermerArret">
      <h3 id="titre-arret-correction">Arrêter cette correction</h3>
      <p>Les étapes déjà enregistrées resteront en place. Les étapes restantes ne seront pas appliquées. Cette action ne rétablit pas les anciens noms ni les anciennes associations.</p>
      <p v-if="message" role="alert">{{ message }}</p>
      <button ref="annulerArret" type="button" :disabled="enregistrement" @click="fermerArret">Annuler</button>
      <button type="button" :disabled="enregistrement" @click="agir(true)">Conserver les étapes enregistrées et arrêter</button>
    </dialog>
  </section>
</template>

<style scoped>
.suivi-corrections-locuteurs { margin: .8rem 0; padding: .8rem; border: 1px solid #c89735; border-radius: 6px; background: #fff8e8; }
h3 { margin-top: 0; }
button { margin-right: .5rem; padding: .45rem .7rem; }
button:focus-visible { outline: 2px solid #356ac3; outline-offset: 2px; }
</style>
