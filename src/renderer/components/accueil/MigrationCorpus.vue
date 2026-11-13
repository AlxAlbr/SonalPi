<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { nomDepuisCrp } from '../../../shared/migrationV1'

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
const pret = computed(() => !!cheminCrp.value && !!dossier.value && !enCours.value)
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
    if (actualite()) erreur.value = e instanceof Error ? e.message : 'Cet emplacement ne peut pas être utilisé.'
  }
}, { immediate: true })

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
    await migrerDepuisV1({ cheminCrp: cheminCrp.value, nom: nomCorpus, dossier: dossier.value })
    emit('fermer')
  } catch (e) { erreur.value = e instanceof Error ? e.message : 'Le passage à SonalPi2 n’a pas pu être terminé.' }
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

        <div v-if="cheminCrp" class="destination">
          <span class="libelle-champ">Emplacement du nouveau corpus</span>
          <strong class="chemin-complet">{{ dossier ?? 'Calcul en cours…' }}</strong>
          <button type="button" class="choisir-dossier" :disabled="enCours" @click="choisirEmplacement">Changer l'emplacement…</button>
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
.destination, .progression-migration { display: grid; gap: 0.4rem; }
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
