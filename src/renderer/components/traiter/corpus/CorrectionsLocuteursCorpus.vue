<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import type { LigneRepertoireLocuteurs } from '../../../../shared/corpus/repertoireLocuteurs'
import type { ReferenceParticipation } from '../../../../shared/locuteurs'
import type { CommandeCorrectionLocuteurs } from '../../../../shared/corpus/contratsLocuteurs'
import { cleParticipationCorrection, preparerApercuCorrectionLocuteurs, type ApercuCorrectionLocuteurs } from '../../../../shared/corpus/apercusCorrectionsLocuteurs'
import BandeauRetourCorpus from './BandeauRetourCorpus.vue'

const props = defineProps<{ selection: LigneRepertoireLocuteurs[]; indisponible: boolean }>()
const emit = defineEmits<{ termine: [participations: ReferenceParticipation[]]; details: []; ouvrir: [entretienId: string] }>()
const { lirePersonnes, corrigerLocuteurs, lectureSeule, idDistantCourant } = utiliserSonal()
const apercu = ref<ApercuCorrectionLocuteurs | null>(null)
const dialogue = ref<HTMLDialogElement | null>(null)
const annuler = ref<HTMLButtonElement | null>(null)
const nom = ref('')
const choixNoms = ref<'' | 'conserver' | 'uniformiser'>('')
const dissocies = ref<string[]>([])
const preparation = ref(false)
const enregistrement = ref(false)
const erreur = ref('')
const message = ref('')
let generation = 0
let retour: HTMLElement | null = null
const sansAssociation = computed(() => props.selection.some((l) => !l.locuteurId))
const bloque = computed(() => props.indisponible || lectureSeule.value || !!idDistantCourant.value || sansAssociation.value)
const occupe = computed(() => preparation.value || enregistrement.value)
const titre = computed(() => apercu.value?.type === 'renommerGlobal' ? 'Renommer ce locuteur'
  : apercu.value?.type === 'regrouperSelection' ? 'Réunir les locuteurs sélectionnés' : 'Dissocier ce locuteur')
const nombreEntretiens = computed(() => new Set(apercu.value?.participations.map((p) => p.entretienId)).size)
const selectionDissociee = computed(() => apercu.value?.participations.filter((p) => dissocies.value.includes(cleParticipationCorrection(p))) ?? [])
const tousDissocies = computed(() => !!apercu.value && dissocies.value.length === apercu.value.participations.length)
const validationPossible = computed(() => {
  if (bloque.value || occupe.value || erreur.value || !apercu.value || apercu.value.conflits.length) return false
  if (apercu.value.type === 'dissocierSelection') return dissocies.value.length > 0 && !tousDissocies.value
  return !!nom.value.trim() && (apercu.value.type !== 'regrouperSelection' || !!choixNoms.value)
})
function fermer() {
  if (enregistrement.value) return
  generation++
  preparation.value = false
  dialogue.value?.close()
  apercu.value = null
  retour?.focus()
}
async function preparer(type: ApercuCorrectionLocuteurs['type']) {
  if (bloque.value || occupe.value) return
  const jeton = ++generation
  retour = document.activeElement as HTMLElement | null
  const selection = props.selection.map((l) => ({ ...l, participations: l.participations.map((p) => ({ ...p })) }))
  preparation.value = true
  erreur.value = ''; message.value = ''
  try {
    const inventaire = await lirePersonnes()
    if (jeton !== generation) return
    apercu.value = preparerApercuCorrectionLocuteurs(type, selection, inventaire)
    nom.value = apercu.value.locuteurs[0].nom
    choixNoms.value = ''; dissocies.value = []
    await nextTick()
    if (jeton !== generation) return
    dialogue.value?.showModal()
    annuler.value?.focus()
  } catch (e) {
    if (jeton === generation) erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (jeton === generation) preparation.value = false
  }
}
async function confirmer() {
  if (!validationPossible.value || !apercu.value) return
  const courant = apercu.value
  const commun = { attendu: courant.attendu, locuteurId: courant.locuteurs[0].id }
  const commande: CommandeCorrectionLocuteurs = courant.type === 'renommerGlobal'
    ? { ...commun, type: 'renommerGlobal', nom: nom.value.trim() }
    : courant.type === 'regrouperSelection'
      ? { type: 'regrouperSelection', attendu: courant.attendu, locuteurIds: courant.locuteurs.map((l) => l.id),
        conserverId: commun.locuteurId, nom: nom.value.trim(), uniformiserNoms: choixNoms.value === 'uniformiser' }
      : { ...commun, type: 'dissocierSelection', participations: selectionDissociee.value.map((p) => ({ entretienId: p.entretienId, participationId: p.participationId })) }
  const jeton = generation
  enregistrement.value = true
  erreur.value = ''
  try {
    await corrigerLocuteurs(commande)
    if (jeton !== generation) return
    message.value = courant.type === 'renommerGlobal' ? 'Le nom a été modifié dans tous les entretiens associés.'
      : courant.type === 'regrouperSelection' ? 'Les locuteurs sélectionnés sont maintenant réunis.'
        : 'Les entretiens cochés correspondent maintenant à des locuteurs indépendants.'
    dialogue.value?.close()
    apercu.value = null
    retour?.focus()
    emit('termine', courant.participations.map((p) => ({ entretienId: p.entretienId, participationId: p.participationId })))
  } catch (e) {
    if (jeton === generation) erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (jeton === generation) enregistrement.value = false
  }
}
function ouvrir(entretienId: string) {
  fermer()
  emit('ouvrir', entretienId)
}
watch(() => props.selection, () => { fermer(); erreur.value = '' })
watch(bloque, (valeur) => { if (valeur) fermer() })
onBeforeUnmount(() => { generation++; dialogue.value?.close() })
</script>

<template>
  <div class="corrections-locuteurs">
    <div v-if="selection.length" class="actions-correction" aria-label="Corriger la sélection">
      <button v-if="selection.length === 1" type="button" :disabled="bloque || occupe" @click="preparer('renommerGlobal')">Renommer…</button>
      <button v-if="selection.length > 1" type="button" :disabled="bloque || occupe" @click="preparer('regrouperSelection')">C’est le même locuteur…</button>
      <button v-if="selection.length === 1 && selection[0].participations.length > 1" type="button" :disabled="bloque || occupe" @click="preparer('dissocierSelection')">Dissocier…</button>
      <p v-if="lectureSeule || idDistantCourant">Les corrections sont disponibles uniquement dans un corpus local modifiable.</p>
      <p v-else-if="indisponible">Actualisez la liste et rétablissez l’accès aux entretiens indisponibles avant toute correction.</p>
      <p v-else-if="sansAssociation">Associez d’abord ces locuteurs pour les corriger ici. <button type="button" @click="emit('details')">Ouvrir les associations</button></p>
    </div>
    <p v-if="preparation" role="status">Préparation de l’aperçu… <button type="button" @click="fermer">Annuler la préparation</button></p>
    <BandeauRetourCorpus v-if="erreur && !apercu" type="erreur" @fermer="erreur = ''">{{ erreur }}</BandeauRetourCorpus>
    <BandeauRetourCorpus v-if="message" type="succes" @fermer="message = ''">{{ message }}</BandeauRetourCorpus>
    <dialog v-if="apercu" ref="dialogue" class="dialogue-correction" aria-labelledby="titre-correction-locuteurs" :aria-busy="enregistrement" @cancel.prevent="fermer">
      <form @submit.prevent="confirmer">
        <h2 id="titre-correction-locuteurs">{{ titre }}</h2>
        <p v-if="apercu.type === 'renommerGlobal'">Le nom sera modifié dans les {{ nombreEntretiens }} entretien{{ nombreEntretiens > 1 ? 's' : '' }} associés, même ceux masqués par la recherche.</p>
        <p v-else-if="apercu.type === 'regrouperSelection'">Ces {{ apercu.locuteurs.length }} locuteurs seront réunis dans {{ nombreEntretiens }} entretien{{ nombreEntretiens > 1 ? 's' : '' }}.</p>
        <p v-else>Chaque entretien coché apparaîtra séparément dans la liste. Les autres resteront réunis. Les noms actuels seront conservés.</p>
        <fieldset :disabled="enregistrement">
          <legend>Entretiens concernés</legend>
          <ul class="entretiens-correction">
            <li v-for="p in apercu.participations" :key="cleParticipationCorrection(p)">
              <label v-if="apercu.type === 'dissocierSelection'"><input v-model="dissocies" type="checkbox" :value="cleParticipationCorrection(p)" /> {{ p.entretienTitre }} · {{ p.nom }}</label>
              <span v-else>{{ p.entretienTitre }} · {{ p.nom }}</span>
            </li>
          </ul>
          <template v-if="apercu.type === 'dissocierSelection'">
            <p>{{ selectionDissociee.length }} entretien{{ selectionDissociee.length > 1 ? 's' : '' }} à dissocier ; {{ apercu.participations.length - selectionDissociee.length }} resteront associés au locuteur d’origine.</p>
            <p v-if="tousDissocies" role="alert">Laissez au moins un entretien sur le locuteur d’origine.</p>
            <p>Les cas fondés sur ce locuteur continueront à suivre le locuteur d’origine, pas les locuteurs dissociés.</p>
          </template>
          <label v-else class="nom-correction">{{ apercu.type === 'renommerGlobal' ? 'Nouveau nom' : 'Nom commun' }}<input v-model="nom" type="text" required /></label>
          <fieldset v-if="apercu.type === 'regrouperSelection'">
            <legend>Noms dans les entretiens</legend>
            <label><input v-model="choixNoms" type="radio" name="noms-correction" value="conserver" /> Conserver les noms actuels</label>
            <label><input v-model="choixNoms" type="radio" name="noms-correction" value="uniformiser" /> Remplacer tous les noms par le nom commun</label>
          </fieldset>
        </fieldset>
        <div v-if="apercu.conflits.length" role="alert">
          <p>Ces locuteurs ne peuvent pas être réunis : plusieurs interviennent dans le même entretien. Corrigez d’abord cet entretien.</p>
          <button v-for="conflit in apercu.conflits" :key="conflit.entretienId" type="button" @click="ouvrir(conflit.entretienId)">Ouvrir {{ conflit.titre }}</button>
        </div>
        <p v-if="apercu.type === 'regrouperSelection'">Les cas fondés sur ces locuteurs suivront désormais le locuteur réuni.</p>
        <p>Les paroles, notes, pseudonymes, rôles, couleurs et données restent inchangés.</p>
        <p v-if="erreur" role="alert">{{ erreur }} Fermez cet aperçu et actualisez la liste avant de réessayer.</p>
        <div class="actions-dialogue">
          <button ref="annuler" type="button" :disabled="enregistrement" @click="fermer">Annuler</button>
          <button type="submit" :disabled="!validationPossible || !!erreur">{{ enregistrement ? 'Enregistrement…' : apercu.type === 'renommerGlobal' ? 'Renommer dans tous les entretiens' : apercu.type === 'regrouperSelection' ? 'Réunir les locuteurs' : 'Dissocier les entretiens cochés' }}</button>
        </div>
      </form>
    </dialog>
  </div>
</template>

<style scoped>
.actions-correction { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin-top: .7rem; }
.actions-correction p { flex-basis: 100%; margin: 0; font-size: .85rem; }
button { padding: .4rem .6rem; cursor: pointer; }
button:disabled { opacity: .6; cursor: default; }
.dialogue-correction { width: min(620px, calc(100vw - 4rem)); max-height: 85vh; overflow: auto; border: 1px solid #aebbd0; border-radius: 8px; padding: 1.3rem; }
.dialogue-correction::backdrop { background: #0006; }
h2 { margin-top: 0; font-size: 1.2rem; }
fieldset { min-width: 0; margin: .8rem 0; border: 1px solid #dce2ec; border-radius: 5px; }
.entretiens-correction { max-height: 30vh; overflow: auto; padding-left: 1.4rem; }
.entretiens-correction li { padding: .3rem 0; overflow-wrap: anywhere; }
label { display: block; margin: .5rem 0; }
.nom-correction input { display: block; box-sizing: border-box; width: 100%; margin-top: .3rem; padding: .5rem; }
.actions-dialogue { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: .6rem; margin-top: 1rem; }
[role=alert] { color: #9b2626; }
button:focus-visible, input:focus-visible { outline: 2px solid #356ac3; outline-offset: 2px; }
</style>
