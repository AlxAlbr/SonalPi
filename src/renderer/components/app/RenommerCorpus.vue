<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'

const emit = defineEmits<{ fermer: [] }>()
const { dossierCourantNom, renommerCorpus } = utiliserSonal()
const nom = ref(dossierCourantNom.value)
const champ = ref<HTMLInputElement | null>(null)
const enCours = ref(false)
const erreur = ref<string | null>(null)
const valide = computed(() => !!nom.value.trim() && !enCours.value)
onMounted(() => { champ.value?.focus(); champ.value?.select() })
function fermer() { if (!enCours.value) emit('fermer') }
async function enregistrer() {
  if (!valide.value) return
  enCours.value = true
  erreur.value = null
  try {
    await renommerCorpus(nom.value)
    emit('fermer')
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Le nom n’a pas pu être enregistré.'
  } finally {
    enCours.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="voile-renommage" @click.self="fermer" @keydown.esc.prevent="fermer">
      <form class="modale-renommer-corpus" role="dialog" aria-modal="true" aria-labelledby="titre-renommer-corpus" @submit.prevent="enregistrer">
        <h3 id="titre-renommer-corpus">Renommer le corpus</h3>
        <p>Le nom affiché changera, pas le dossier qui contient le corpus.</p>
        <label>Nom du corpus <input ref="champ" v-model="nom" :disabled="enCours" /></label>
        <p v-if="erreur" class="erreur" role="alert">{{ erreur }}</p>
        <div class="actions">
          <button type="button" :disabled="enCours" @click="fermer">Annuler</button>
          <button type="submit" :disabled="!valide">{{ enCours ? 'Enregistrement…' : 'Renommer' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-renommage { position: fixed; inset: 0; z-index: 60; background: #0006; display: grid; place-items: center; }
.modale-renommer-corpus { background: white; padding: 1.2rem; border-radius: 10px; width: min(440px, 92vw); display: grid; gap: 0.8rem; }
h3, p { margin: 0; }
p { font-size: 0.85rem; }
label { display: grid; gap: 0.4rem; }
input { padding: 0.4rem; }
.actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
.erreur { color: #b71c1c; }
</style>
