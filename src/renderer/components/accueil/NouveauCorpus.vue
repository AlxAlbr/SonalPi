<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { nettoyerMessage } from '../../erreurs'

const emit = defineEmits<{ (e: 'fermer'): void }>()
const { creerNouveauCorpus } = utiliserSonal()
const dialogue = ref<HTMLDialogElement | null>(null)
const dossier = ref<string | null>(null)
const nom = ref('')
const dejaCorpus = ref(false)
const verifie = ref(false)
const enCours = ref(false)
const erreur = ref<string | null>(null)
onMounted(() => dialogue.value?.showModal())
function fermer() { if (!enCours.value) emit('fermer') }
function basename(p: string): string { return p.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) ?? '' }
async function choisirDossier() {
  erreur.value = null
  const d = await window.sonal.dialog.choisirDossier('projet')
  if (!d) return
  dossier.value = d
  nom.value = basename(d)
  verifie.value = false
  try { dejaCorpus.value = (await window.sonal.corpus.verifierNouveau(d)).dejaCorpus }
  catch { dejaCorpus.value = false }
  finally { verifie.value = true }
}
const pret = computed(() => !enCours.value && !!dossier.value && verifie.value
  && (dejaCorpus.value || nom.value.trim().length > 0))
async function valider() {
  if (!pret.value || !dossier.value) return
  enCours.value = true
  erreur.value = null
  try {
    await creerNouveauCorpus(dossier.value, nom.value.trim() || basename(dossier.value))
    emit('fermer')
  } catch (e) { erreur.value = nettoyerMessage(e); enCours.value = false }
}
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialogue" class="modale-nouveau" aria-labelledby="titre-nouveau-corpus" @cancel.prevent="fermer">
      <form @submit.prevent="valider">
        <h3 id="titre-nouveau-corpus">Nouveau corpus local</h3>
        <p>Créez votre corpus dans un dossier dédié et donnez-lui un nom de projet.</p>
        <div class="question"><label>1 — Choisissez le dossier où créer le corpus</label>
          <button type="button" class="choisir-dossier" :disabled="enCours" @click="choisirDossier">{{ dossier ?? 'Choisir un dossier…' }}</button>
        </div>
        <div v-if="dossier && !dejaCorpus" class="question">
          <label for="nom-nouveau-corpus">2 — Quel est le nom du projet ?</label>
          <input id="nom-nouveau-corpus" v-model="nom" class="champ-nom" :disabled="enCours" required placeholder="Nom du projet">
        </div>
        <p v-if="dossier && dejaCorpus" class="deja-corpus">Ce dossier contient déjà un corpus : il sera ouvert tel quel, sans rien remplacer.</p>
        <p v-if="erreur" class="msg" role="alert">{{ erreur }}</p>
        <div class="pied-modale"><button type="button" class="annuler" :disabled="enCours" @click="fermer">Annuler</button><button class="valider" :disabled="!pret">{{ enCours ? 'Création…' : dejaCorpus ? 'Ouvrir' : 'Créer le corpus' }}</button></div>
      </form>
    </dialog>
  </Teleport>
</template>
<style scoped>
dialog { width: min(550px, 92vw); max-height: 92vh; overflow: auto; border: 1px solid #bdcde0; border-radius: 12px; background: #fff; padding: 1.2rem; }
dialog::backdrop { background: rgba(0,0,0,.48); }
h3 { color: #1565c0; font-size: 1.05rem; margin-top: 0; }
p, label, input, button { font-size: .85rem; line-height: 1.5; }
.question { display: flex; flex-direction: column; gap: .4rem; margin-bottom: .9rem; }
button { border: 1px solid #bdcde0; background: white; border-radius: 6px; padding: .45rem .7rem; cursor: pointer; }
.choisir-dossier { text-align: left; overflow-wrap: anywhere; } input { padding: .5rem; }
.pied-modale { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: .5rem; }
.valider { background: #2368ae; color: white; } button:disabled { opacity: .5; cursor: default; }
.msg, .deja-corpus { color: #8c231b; background: #ffebe8; padding: .6rem; }
button:focus-visible, input:focus-visible { outline: 3px solid #ae5b00; outline-offset: 3px; }
</style>
