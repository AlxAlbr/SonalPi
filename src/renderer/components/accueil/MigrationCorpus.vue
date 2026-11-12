<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { nomDepuisCrp } from '../../../shared/migrationV1'

const props = defineProps<{ initial: { chemin: string } }>()
const emit = defineEmits<{ fermer: [] }>()
const { migrerDepuisV1, etatMigration, annulerMigration, annulationMigrationDemandee } = utiliserSonal()
const cheminCrp = ref<string | null>(props.initial.chemin)
const nom = ref(nomDepuisCrp(props.initial.chemin))
const emplacement = ref<string | undefined>()
const dossier = ref<string | null>(null)
const enCours = ref(false)
const erreur = ref<string | null>(null)
const pret = computed(() => !!cheminCrp.value && !!nom.value.trim() && !!dossier.value && !enCours.value)
const annulationPossible = computed(() => !enCours.value || (etatMigration.value === 'preparation' && !annulationMigrationDemandee.value))

watch([cheminCrp, nom, emplacement], async ([source, libelle, parent]) => {
  dossier.value = null
  erreur.value = null
  if (!source || !libelle.trim()) return
  const actualite = () => source === cheminCrp.value && libelle === nom.value && parent === emplacement.value
  try {
    const cible = await window.sonal.migrer.destination(source, libelle, parent)
    if (actualite()) dossier.value = cible
  } catch (e) {
    if (actualite()) erreur.value = e instanceof Error ? e.message : 'Cet emplacement ne peut pas être utilisé.'
  }
}, { immediate: true })

async function choisirCrp() {
  cheminCrp.value = null
  nom.value = ''
  emplacement.value = undefined
  erreur.value = null
  try {
    const chemin = await window.sonal.migrer.choisirCrp()
    if (chemin) { cheminCrp.value = chemin; nom.value = nomDepuisCrp(chemin) }
  } catch (e) { erreur.value = e instanceof Error ? e.message : 'Le fichier SonalPi1 ne peut pas être lu.' }
}
async function choisirEmplacement() {
  try {
    const parent = await window.sonal.migrer.choisirEmplacement(emplacement.value)
    if (parent) emplacement.value = parent
  } catch (e) { erreur.value = e instanceof Error ? e.message : 'Cet emplacement ne peut pas être utilisé.' }
}
async function annuler() {
  if (!enCours.value) { emit('fermer'); return }
  if (!annulationPossible.value) return
  try { await annulerMigration() }
  catch (e) { erreur.value = e instanceof Error ? e.message : 'La préparation n’a pas pu être nettoyée.' }
}
async function migrer() {
  if (!pret.value || !cheminCrp.value || !dossier.value) return
  enCours.value = true
  erreur.value = null
  try {
    await migrerDepuisV1({ cheminCrp: cheminCrp.value, nom: nom.value.trim(), dossier: dossier.value })
    emit('fermer')
  } catch (e) { erreur.value = e instanceof Error ? e.message : 'Le passage à SonalPi2 n’a pas pu être terminé.' }
  finally { enCours.value = false }
}
</script>

<template>
  <Teleport to="body">
    <div class="voile-modale" @click.self="!enCours && emit('fermer')" @keydown.esc.prevent="!enCours && emit('fermer')">
      <form class="modale-migration" role="dialog" aria-modal="true" aria-labelledby="titre-migration" @submit.prevent="migrer">
        <h3 id="titre-migration">Passer à SonalPi2</h3>
        <p>Vos entretiens seront repris dans un nouveau dossier. Les médias de l'ancien dossier seront copiés ; les médias externes resteront à leur emplacement.</p>
        <p>L'ancien corpus sera conservé comme sauvegarde. Son fichier .crp sera renommé pour éviter une ouverture accidentelle ; il suffira de rétablir son nom pour réutiliser SonalPi1.</p>
        <p>Dans SonalPi2, le fichier s'appelle toujours <b>corpus.crp</b>. Fermez les applications qui utilisent le corpus SonalPi1 avant de continuer.</p>
        <button type="button" class="choisir-crp" :disabled="enCours" @click="choisirCrp">{{ cheminCrp ?? 'Choisir le fichier SonalPi1…' }}</button>
        <template v-if="cheminCrp">
          <label>Nom du corpus <input class="nom-corpus" v-model="nom" :disabled="enCours" /></label>
          <div class="destination">
            <span>Dossier SonalPi2 : <b>{{ dossier ?? '…' }}</b></span>
            <button type="button" class="choisir-dossier" :disabled="enCours" @click="choisirEmplacement">Changer l'emplacement…</button>
          </div>
        </template>
        <div v-if="enCours" class="progression-migration" role="status">
          <span>{{ annulationMigrationDemandee ? 'Annulation…' : 'Passage à SonalPi2…' }}</span>
          <progress aria-label="Passage à SonalPi2" />
        </div>
        <p v-if="erreur" class="msg-migration" role="alert">{{ erreur }}</p>
        <div class="pied-modale">
          <button type="button" class="annuler" :disabled="!annulationPossible" @click="annuler">Annuler</button>
          <button type="submit" class="valider" :disabled="!pret">Passer à SonalPi2</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-modale { position: fixed; inset: 0; background: #0006; display: grid; place-items: center; z-index: 50; }
.modale-migration { width: min(560px, 94vw); max-height: 88vh; overflow-y: auto; background: white; border-radius: 10px; padding: 1.2rem; display: grid; gap: 0.8rem; }
h3, p { margin: 0; }
p, .destination { font-size: 0.85rem; }
label, .destination, .progression-migration { display: grid; gap: 0.4rem; }
input { padding: 0.4rem; }
.choisir-crp, .destination { overflow-wrap: anywhere; }
.choisir-dossier { justify-self: start; }
.msg-migration { color: #b71c1c; white-space: pre-wrap; }
.pied-modale { display: flex; justify-content: flex-end; gap: 0.5rem; }
button { cursor: pointer; padding: 0.4rem 0.7rem; }
button:disabled { cursor: not-allowed; }
</style>
