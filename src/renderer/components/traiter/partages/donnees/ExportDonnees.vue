<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { MatriceCorpus, Variable } from '../../../../../shared/format'
import { exporterDonneesCsv } from '../../../../../shared/corpus/exportDonnees'
import { nettoyerMessage } from '../../../../erreurs'

const props = defineProps<{
  variables: Variable[]
  entretiensAttendus: string[]
  montrerLocuteurs: boolean
  charger: () => Promise<MatriceCorpus>
}>()
const emit = defineEmits<{ fermer: []; enregistre: [] }>()
const dialogue = ref<HTMLDialogElement | null>(null)
const annuler = ref<HTMLButtonElement | null>(null)
const inclurePrivees = ref(false)
const enCours = ref(false)
const erreur = ref('')
const privees = computed(() => props.variables.filter((v) => v.priv).length)
const nombreColonnes = computed(() => props.variables.filter((v) => inclurePrivees.value || !v.priv).length)
const retour = document.activeElement as HTMLElement | null
let actif = true
onMounted(async () => {
  dialogue.value?.showModal()
  await nextTick()
  annuler.value?.focus()
})
onBeforeUnmount(() => {
  actif = false
  dialogue.value?.close()
  retour?.focus()
})

async function exporter() {
  if (enCours.value || !nombreColonnes.value) return
  enCours.value = true
  erreur.value = ''
  const signature = () => JSON.stringify([
    props.variables.map(({ id, lib, portee, priv }) => ({ id, lib, portee, priv })),
    props.entretiensAttendus, props.montrerLocuteurs,
  ])
  const avant = signature()
  try {
    const matrice = await props.charger()
    if (!actif) return
    if (avant !== signature()) throw new Error('Les colonnes ou les entretiens ont changé. Rouvrez l’export pour vérifier le contenu.')
    const contenu = exporterDonneesCsv({
      variables: props.variables, matrice,
      entretiensAttendus: props.entretiensAttendus,
      montrerLocuteurs: props.montrerLocuteurs,
      inclurePrivees: inclurePrivees.value,
    })
    let chemin: string | null
    try {
      chemin = await window.sonal.dialog.choisirExport('Table-de-donnees.csv', contenu)
    } catch {
      throw new Error('Impossible d’enregistrer le fichier CSV. Choisissez un autre emplacement.')
    }
    if (chemin && actif) emit('enregistre')
  } catch (raison) {
    if (actif) erreur.value = nettoyerMessage(raison)
  } finally {
    enCours.value = false
  }
}
</script>

<template>
  <dialog
    ref="dialogue"
    class="export-donnees"
    aria-labelledby="titre-export-donnees"
    :aria-busy="enCours"
    @cancel.prevent="!enCours && emit('fermer')"
  >
    <h2 id="titre-export-donnees">Exporter la table en CSV</h2>
    <p>Le fichier reprendra les variables affichées et tous les entretiens de la table.</p>
    <p v-if="montrerLocuteurs">Les lignes des locuteurs seront aussi incluses.</p>
    <p>Les noms des entretiens et des locuteurs restent en clair. Vérifiez-les avant tout partage.</p>
    <label v-if="privees" class="choix-privees">
      <input v-model="inclurePrivees" type="checkbox" :disabled="enCours" />
      Inclure aussi les variables privées affichées ({{ privees }})
    </label>
    <p v-if="inclurePrivees" class="attention">Ce fichier contiendra les réponses des variables privées choisies.</p>
    <p v-else>Les variables privées sont exclues.</p>
    <p role="status">{{ nombreColonnes }} variable(s) à exporter.</p>
    <p v-if="!nombreColonnes">Affichez au moins une variable publique ou choisissez d’inclure les variables privées.</p>
    <p v-if="erreur" class="erreur-export" role="alert">{{ erreur }}</p>
    <div class="actions">
      <button ref="annuler" :disabled="enCours" @click="emit('fermer')">Annuler</button>
      <button :disabled="enCours || !nombreColonnes" @click="exporter">{{ enCours ? 'Préparation…' : 'Exporter CSV' }}</button>
    </div>
  </dialog>
</template>

<style scoped>
dialog { width: min(500px, 92vw); max-height: 85vh; overflow: auto; border: 1px solid #bdcde0; border-radius: 10px; padding: 1.2rem; }
dialog::backdrop { background: #0006; }
h2 { margin-top: 0; font-size: 1.1rem; }
p, label { font-size: .85rem; line-height: 1.5; }
.choix-privees { display: flex; align-items: flex-start; gap: .4rem; }
.attention, .erreur-export { background: #fff2df; padding: .6rem; color: #7b3800; }
.actions { display: flex; justify-content: flex-end; gap: .6rem; margin-top: 1rem; }
button { border: 1px solid #bdcde0; border-radius: 5px; padding: .4rem .7rem; background: #fff; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible { outline: 3px solid #ae5b00; outline-offset: 2px; }
</style>
