<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { nomDepuisCrp, type RemplacementTranscriptionMigration, type VerificationMigrationV1 } from '../../../shared/migrationV1'
import { nettoyerMessage } from '../../erreurs'

const props = defineProps<{ initial: { chemin: string } }>()
const emit = defineEmits<{ fermer: [] }>()
const { migrerDepuisV1, etatMigration, annulerMigration, annulationMigrationDemandee } = utiliserSonal()
const cheminCrp = ref<string | null>(props.initial.chemin)
const nomCorpus = nomDepuisCrp(props.initial.chemin)
const nomDossier = `${nomCorpus}V2`
const emplacement = ref<string | undefined>()
const dossier = ref<string | null>(null)
const enCours = ref(false)
const erreur = ref<string | null>(null)
const erreurVerification = ref<string | null>(null)
const verification = ref<VerificationMigrationV1 | null>(null)
const verificationEnCours = ref(false)
const localisationEnCours = ref(false)
const transcriptions = ref<RemplacementTranscriptionMigration[]>([])
const empreinteCrp = ref<string>()
const bloquants = computed(() => verification.value?.transcriptions.filter((f) => f.etat !== 'ok') ?? [])
const mediasAbsents = computed(() => verification.value?.medias.filter((f) => f.etat !== 'ok') ?? [])
const occupe = computed(() => enCours.value || verificationEnCours.value || localisationEnCours.value)
const pret = computed(() => !!cheminCrp.value && !!dossier.value && !!verification.value && !bloquants.value.length && !occupe.value)
let generation = 0
let fermee = false
onBeforeUnmount(() => { fermee = true; generation++ })
const annulationPossible = computed(() => !enCours.value || (etatMigration.value === 'preparation' && !annulationMigrationDemandee.value))

watch([cheminCrp, emplacement], async ([source, parent]) => {
  dossier.value = null
  erreur.value = null
  if (!source) return
  const actualite = () => source === cheminCrp.value && parent === emplacement.value
  try {
    const cible = await window.sonal.migrer.destination(source, nomDossier, parent)
    if (actualite()) dossier.value = cible
  } catch (e) {
    if (actualite()) erreur.value = nettoyerMessage(e)
  }
}, { immediate: true })

async function verifier() {
  if (!cheminCrp.value) return false
  const jeton = ++generation
  verificationEnCours.value = true
  erreurVerification.value = null
  verification.value = null
  try {
    const resultat = await window.sonal.migrer.verifier({
      cheminCrp: cheminCrp.value, empreinteCrp: empreinteCrp.value,
      transcriptions: transcriptions.value.map((f) => ({ ...f })),
    })
    if (fermee || jeton !== generation) return false
    verification.value = resultat
    empreinteCrp.value = resultat.empreinteCrp
    return !resultat.transcriptions.some((f) => f.etat !== 'ok')
  } catch (e) {
    if (!fermee && jeton === generation) erreurVerification.value = nettoyerMessage(e)
    return false
  } finally {
    if (!fermee && jeton === generation) verificationEnCours.value = false
  }
}
watch(cheminCrp, () => { void verifier() }, { immediate: true })

async function localiser(index: number) {
  localisationEnCours.value = true
  erreur.value = null
  try {
    const chemin = await window.sonal.migrer.choisirTranscription()
    if (!chemin || fermee) return
    transcriptions.value = [...transcriptions.value.filter((f) => f.index !== index), { index, chemin }]
    await verifier()
  } catch (e) { if (!fermee) erreur.value = nettoyerMessage(e) }
  finally { localisationEnCours.value = false }
}
async function choisirEmplacement() {
  try {
    const parent = await window.sonal.migrer.choisirEmplacement(emplacement.value)
    if (parent) emplacement.value = parent
  } catch (e) { erreur.value = nettoyerMessage(e) }
}
async function annuler() {
  if (!enCours.value) { emit('fermer'); return }
  if (!annulationPossible.value) return
  try { await annulerMigration() }
  catch (e) { erreur.value = nettoyerMessage(e) }
}
async function migrer() {
  if (!pret.value || !cheminCrp.value || !dossier.value) return
  enCours.value = true
  erreur.value = null
  try {
    if (!await verifier() || fermee) return
    await migrerDepuisV1({
      cheminCrp: cheminCrp.value, nom: nomCorpus, dossier: dossier.value,
      empreinteCrp: empreinteCrp.value, transcriptions: transcriptions.value.map((f) => ({ ...f })),
    })
    emit('fermer')
  } catch (e) { erreur.value = nettoyerMessage(e) }
  finally { enCours.value = false }
}
</script>

<template>
  <Teleport to="body">
    <div class="voile-modale" @click.self="!enCours && emit('fermer')" @keydown.esc.prevent="!enCours && emit('fermer')">
      <form class="modale-migration" role="dialog" aria-modal="true" aria-labelledby="titre-migration" @submit.prevent="migrer">
        <h3 id="titre-migration">Créer une version SonalPi2 de ce corpus</h3>
        <p class="introduction">SonalPi va créer une version SonalPi2 de votre corpus dans un nouveau dossier. Votre corpus SonalPi1 sera conservé.</p>

        <section class="consequences" aria-labelledby="titre-consequences">
          <h4 id="titre-consequences">Ce qui va se passer</h4>
          <ul>
            <li>Les entretiens et les médias présents dans le dossier SonalPi1 seront copiés.</li>
            <li>Les médias enregistrés ailleurs resteront à leur emplacement actuel. Ne les déplacez pas après cette opération.</li>
            <li>Le fichier d'ouverture SonalPi1 sera renommé afin d'éviter une ouverture accidentelle.</li>
          </ul>
          <details>
            <summary>Comment rouvrir le corpus avec SonalPi1 ?</summary>
            <p>Rétablissez le nom d'origine de son fichier .crp. Les autres fichiers d'origine ne seront ni déplacés ni supprimés.</p>
          </details>
        </section>

        <section class="verification-fichiers" aria-label="Vérification des fichiers" :aria-busy="verificationEnCours">
          <h4>Fichiers du corpus SonalPi1</h4>
          <p v-if="verificationEnCours" role="status">Vérification des fichiers…</p>
          <p v-if="erreurVerification" class="msg-migration" role="alert">{{ erreurVerification }}</p>
          <template v-if="verification">
            <div v-if="bloquants.length" class="avertissement" role="status">
              <p><strong>{{ bloquants.length }} transcription{{ bloquants.length > 1 ? 's sont' : ' est' }} à retrouver avant de continuer.</strong></p>
              <p>Certains fichiers ont peut-être été déplacés ou proviennent d’un autre ordinateur. Choisissez la transcription de chaque entretien concerné. Votre corpus SonalPi1 n’a pas été modifié.</p>
            </div>
            <p v-else role="status">Les transcriptions sont accessibles. Les entretiens peuvent être convertis.</p>
            <details v-if="verification.transcriptions.length" :open="bloquants.length > 0 || transcriptions.length > 0 || !!erreur">
              <summary>Transcriptions des entretiens ({{ verification.transcriptions.length }})</summary>
              <p>Retrouvez de préférence le fichier .sonal utilisé dans SonalPi1 : il contient le texte, les codages et les notes.</p>
              <ul class="liste-fichiers">
                <li v-for="fichier in verification.transcriptions" :key="fichier.index">
                  <strong>{{ fichier.titre }}</strong>
                  <span>{{ fichier.etat === 'ok' ? 'Accessible' : fichier.etat === 'manquant' ? 'Introuvable' : 'Impossible à lire' }}<template v-if="transcriptions.some((f) => f.index === fichier.index)"> — fichier choisi pour cette migration : {{ fichier.chemin.split(/[\\/]/).pop() }}</template></span>
                  <button type="button" :disabled="occupe" :aria-label="`Localiser le fichier de ${fichier.titre}`" @click="localiser(fichier.index)">Localiser le fichier…</button>
                  <details><summary>Emplacements du fichier</summary><p class="chemin-complet">Emplacement enregistré dans SonalPi1 : {{ fichier.reference }}</p><p class="chemin-complet">Emplacement vérifié : {{ fichier.chemin }}</p></details>
                </li>
              </ul>
            </details>
            <div v-if="mediasAbsents.length" class="avertissement" role="status">
              <p><strong>{{ mediasAbsents.length }} enregistrement{{ mediasAbsents.length > 1 ? 's' : '' }} à reconnecter.</strong></p>
              <p>Cela n’empêche pas la conversion des entretiens. Vous pourrez choisir ces fichiers dans SonalPi2 pour les écouter ou les regarder.</p>
              <details><summary>Voir les enregistrements concernés</summary><ul><li v-for="fichier in mediasAbsents" :key="fichier.index"><strong>{{ fichier.titre }}</strong><span class="chemin-complet">{{ fichier.reference }}</span></li></ul></details>
            </div>
          </template>
          <button type="button" :disabled="occupe" @click="verifier">Vérifier à nouveau les fichiers</button>
        </section>

        <div v-if="cheminCrp" class="destination">
          <span class="libelle-champ">Emplacement du nouveau corpus</span>
          <strong class="chemin-complet">{{ dossier ?? 'Calcul en cours…' }}</strong>
          <button type="button" class="choisir-dossier" :disabled="occupe" @click="choisirEmplacement">Changer l'emplacement…</button>
        </div>
        <div v-if="enCours" class="progression-migration" role="status">
          <span>{{ annulationMigrationDemandee ? 'Annulation…' : 'Création du corpus SonalPi2…' }}</span>
          <progress aria-label="Création du corpus SonalPi2" />
        </div>
        <p v-if="erreur" class="msg-migration" role="alert">{{ erreur }}</p>
        <p class="avertissement"><strong>Avant de continuer, fermez SonalPi1 et toute autre application utilisant ce corpus.</strong></p>
        <details class="informations-complementaires">
          <summary>Informations complémentaires</summary>
          <p>Dans SonalPi2, le fichier d'ouverture s'appelle toujours <b>corpus.crp</b>.</p>
        </details>
        <div class="pied-modale">
          <button type="button" class="annuler" :disabled="!annulationPossible" @click="annuler">Annuler</button>
          <button type="submit" class="valider" :disabled="!pret">Créer le corpus SonalPi2</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-modale { position: fixed; inset: 0; background: #0006; display: grid; place-items: center; z-index: 50; }
.modale-migration { width: min(620px, 94vw); max-height: 88vh; overflow-y: auto; background: white; border-radius: 10px; padding: 1.2rem; display: grid; gap: 0.9rem; }
h3, h4, p { margin: 0; }
h4 { font-size: 0.9rem; }
p, li, .destination, details { font-size: 0.85rem; }
.introduction { line-height: 1.45; }
.consequences { display: grid; gap: 0.5rem; padding: 0.8rem; border-radius: 8px; background: #f4f7fa; }
ul { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.35rem; line-height: 1.4; }
.destination, .progression-migration, .verification-fichiers { display: grid; gap: 0.4rem; }
.liste-fichiers { margin-top: .5rem; }
.liste-fichiers > li { display: grid; gap: .3rem; padding: .5rem; border: 1px solid #dce2ec; border-radius: 5px; }
.liste-fichiers button, .verification-fichiers > button { justify-self: start; }
.verification-fichiers .avertissement p + p { margin-top: .4rem; }
.libelle-champ { font-weight: 600; }
details { min-width: 0; }
summary { width: fit-content; color: #315f89; cursor: pointer; }
details p { margin-top: 0.4rem; line-height: 1.4; }
.chemin-complet { line-height: 1.4; overflow-wrap: anywhere; }
.choisir-dossier { justify-self: start; }
.avertissement { padding: 0.7rem; border-left: 4px solid #b36b00; background: #fff8e8; font-size: 0.85rem; line-height: 1.4; }
.msg-migration { color: #b71c1c; white-space: pre-wrap; }
.pied-modale { display: flex; justify-content: flex-end; gap: 0.5rem; }
button { cursor: pointer; padding: 0.4rem 0.7rem; }
button:disabled { cursor: not-allowed; }
</style>
