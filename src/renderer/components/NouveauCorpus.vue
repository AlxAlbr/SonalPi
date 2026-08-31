<script setup lang="ts">
import { ref, computed } from 'vue'
import { utiliserSonal } from '../composables/sonal'

/**
 *  Modale « Nouveau corpus local » — créer un corpus en choisissant un dossier
 *  et en indiquant un nom de projet. Le `nom` est indépendant du dossier : il
 *  vit dans `corpus.json.nom` et survit au renommage du dossier. Une fois
 *  choisi, si le dossier contient déjà un corpus, on l'ouvre simplement (on
 *  n'écrase jamais — son nom fait foi).
 */
const emit = defineEmits<{ (e: 'fermer'): void }>()
const { creerNouveauCorpus } = utiliserSonal()

const dossier = ref<string | null>(null)
const nom = ref('')
const dejaCorpus = ref(false)
const verifie = ref(false)
const enCours = ref(false)
const erreur = ref<string | null>(null)

/** Dernier segment d'un chemin (avant-dernier '/' ou '\'). */
function basename(p: string): string {
  const norm = p.replace(/[\\/]+$/, '')
  const i = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'))
  return i === -1 ? norm : norm.slice(i + 1)
}

async function choisirDossier() {
  erreur.value = null
  const d = await window.sonal.dialog.choisirDossier('projet')
  if (!d) return
  dossier.value = d
  nom.value = basename(d)
  verifie.value = false
  // La garde « déjà un corpus » est BEST-EFFORT :
  // si elle échoue (IPC non répondu), on laisse `creerNouveau` (côté main) trancher ;
  // le bouton ne doit JAMAIS rester bloqué grisé. `finaly` garantit `verifie = true`.
  try {
    const v = await window.sonal.corpus.verifierNouveau(d)
    dejaCorpus.value = v.dejaCorpus
  } catch {
    dejaCorpus.value = false
  } finally {
    verifie.value = true
  }
}

const pret = computed(() => {
  if (enCours.value) return false
  if (!dossier.value || !verifie.value) return false
  if (dejaCorpus.value) return true // ouvrir l'existant
  return nom.value.trim().length > 0 // créer avec un nom
})

async function valider() {
  if (!pret.value || !dossier.value) return
  enCours.value = true
  erreur.value = null
  try {
    // Si le dossier était déjà un corpus, `nom` est ignoré côté main (on ouvre).
    await creerNouveauCorpus(dossier.value, nom.value.trim() || basename(dossier.value))
    emit('fermer')
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Échec de la création du corpus.'
    enCours.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="voile-modale" @click.self="emit('fermer')">
      <div class="modale-nouveau">
        <h3>➕ Nouveau corpus local</h3>
        <p class="intro">
          Créez un corpus SonalPi2 dans un <b>dossier dédié</b> en lui donnant un
          <b>nom de projet</b> — indépendant de son dossier (il survivra au
          renommage du dossier).
        </p>

        <!-- 1 — choix du dossier -->
        <div class="question">
          <span class="q-lbl">1 — Choisissez le dossier où créer le corpus</span>
          <button class="choisir-dossier" :disabled="enCours" @click="choisirDossier">
            {{ dossier ?? 'Choisir un dossier…' }}
          </button>
        </div>

        <!-- 2 — nom du projet (sauf si le dossier est déjà un corpus) -->
        <div v-if="dossier && !dejaCorpus" class="question">
          <span class="q-lbl">2 — Quel est le nom du projet&nbsp;?</span>
          <input
            v-model="nom"
            class="champ-nom"
            :disabled="enCours"
            type="text"
            placeholder="Nom du projet"
            @keyup.enter="valider"
          />
        </div>

        <!-- Le dossier contient déjà un corpus : on l'ouvre, pas de création -->
        <div v-else-if="dossier && dejaCorpus" class="deja-corpus">
          Ce dossier est déjà un corpus — il sera simplement <b>ouvert</b> tel quel
          (on n'écrase jamais ; le nom saisi est ignoré).
        </div>

        <p v-if="erreur" class="msg">{{ erreur }}</p>

        <div class="pied-modale">
          <button class="annuler" :disabled="enCours" @click="emit('fermer')">Annuler</button>
          <button class="valider" :disabled="!pret" @click="valider">
            {{ enCours ? 'Création…' : dejaCorpus ? 'Ouvrir' : 'Créer le corpus' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-modale {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modale-nouveau {
  width: min(520px, 94vw);
  background: #fff;
  border-radius: 10px;
  padding: 1.1rem 1.2rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.modale-nouveau h3 {
  margin: 0;
  color: #1565c0;
}
.intro {
  margin: 0;
  font-size: 0.8rem;
  color: #555;
}
.question {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.q-lbl {
  font-size: 0.82rem;
  font-weight: 600;
}
.choisir-dossier {
  text-align: left;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fafafa;
  padding: 0.45rem 0.6rem;
  font-size: 0.8rem;
  color: #1565c0;
  cursor: pointer;
  word-break: break-all;
}
.choisir-dossier:hover:not(:disabled) {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.choisir-dossier:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.champ-nom {
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
}
.champ-nom:focus {
  border-color: #2e73d8;
  outline: none;
}
.deja-corpus {
  font-size: 0.78rem;
  color: #8a6d1a;
  background: #fdf8e6;
  border: 1px solid #ecd9a0;
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
}
.msg {
  margin: 0;
  background: #fdecea;
  color: #b3261e;
  border: 1px solid #f3b4ad;
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
  font-size: 0.78rem;
}
.pied-modale {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.2rem;
}
.annuler,
.valider {
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
}
.valider {
  border-color: #1565c0;
  background: #2e73d8;
  color: #fff;
}
.annuler:disabled,
.valider:disabled {
  border-color: #ccc;
  background: #e6e6e6;
  color: #999;
  cursor: not-allowed;
}
</style>
