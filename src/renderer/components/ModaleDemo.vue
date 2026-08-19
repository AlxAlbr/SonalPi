<script setup lang="ts">
import { ref, computed } from 'vue'
import { utiliserSonal } from '../composables/sonal'
import type { ModeDemo } from '../composables/demo'

/**
 * Modale démo à deux questions : « où placer les sources de la démo » (sautée
 * si elles sont déjà en place) et « où placer CE corpus de test » (le dossier
 * du mode cliqué, sauté si déjà connu). Un dossier = un corpus.
 * Gardes : ni les sources, ni le corpus de l'autre mode, ni un dossier qui est
 * déjà un corpus (`corpus.json` présent — on n'écrase jamais). `defaultPath`
 * des pickers hinté Documents/Sonal/démo/<…>. À la validation →
 * `preparer(mode, { racineSources?, dossierCorpus? })`.
 */
const props = defineProps<{ mode: ModeDemo }>()
const emit = defineEmits<{ (e: 'fermer'): void }>()

const {
  preparer,
  enPreparation,
  racineSources,
  sourcesPresentes,
  corpusPasAPas,
  corpusAutonomie,
  corpusPasAPasPresent,
  corpusAutonomiePresent,
} = utiliserSonal()

// Réponses locales aux questions POSÉES (null tant que non choisies).
const nouvelleSources = ref<string | null>(null)
const nouveauCorpus = ref<string | null>(null)
const erreur = ref<string | null>(null)

const modeLib = computed(() => (props.mode === 'pas-a-pas' ? 'Pas à pas' : 'En autonomie'))

// Une question est nécessaire si la réponse mémorisée manque OU n'existe plus
// sur disque (dossier supprimé → on re-questionne).
const besoinSources = computed(() => !racineSources.value || !sourcesPresentes.value)
// Le corpus demandé est celui du MODE de la carte cliquée (indépendance des deux).
const corpusConnu = computed(() =>
  props.mode === 'pas-a-pas' ? corpusPasAPas.value : corpusAutonomie.value,
)
const corpusPresent = computed(() =>
  props.mode === 'pas-a-pas' ? corpusPasAPasPresent.value : corpusAutonomiePresent.value,
)
const besoinCorpus = computed(() => !corpusConnu.value || !corpusPresent.value)

async function choisirSources() {
  nouvelleSources.value = await window.sonal.dialog.choisirDossier('sources')
  erreur.value = null
}
async function choisirCorpus() {
  nouveauCorpus.value = await window.sonal.dialog.choisirDossier('corpus')
  erreur.value = null
}

const pret = computed(() => {
  if (enPreparation.value) return false
  if (besoinSources.value && !nouvelleSources.value) return false
  if (besoinCorpus.value && !nouveauCorpus.value) return false
  return true
})

async function valider() {
  if (!pret.value) return
  const sources = besoinSources.value ? nouvelleSources.value : racineSources.value
  const corpus = besoinCorpus.value ? nouveauCorpus.value : corpusConnu.value
  // Garde 1 — les sources ne sont pas le corpus de test.
  if (sources === corpus) {
    erreur.value =
      'Les deux dossiers doivent être distincts — les sources ne peuvent pas être le corpus de test.'
    return
  }
  // Garde 2 — l'autre mode n'utilise pas déjà ce dossier (indépendance des deux).
  const autre = props.mode === 'pas-a-pas' ? corpusAutonomie.value : corpusPasAPas.value
  if (autre && corpus === autre) {
    erreur.value = `Ce dossier est déjà le corpus « ${props.mode === 'pas-a-pas' ? 'En autonomie' : 'Pas à pas'} » — choisis un autre dossier.`
    return
  }
  // Garde 3 — le dossier n'est pas DÉJÀ un corpus (on n'écrase jamais).
  const verif = await window.sonal.demo.verifierCorpus(corpus!)
  if (verif.dejaCorpus) {
    erreur.value = 'Ce dossier contient déjà un corpus — choisis un dossier vide.'
    return
  }
  await preparer(props.mode, {
    ...(besoinSources.value ? { racineSources: nouvelleSources.value! } : {}),
    ...(besoinCorpus.value ? { dossierCorpus: nouveauCorpus.value! } : {}),
  })
  emit('fermer')
}
</script>

<template>
  <Teleport to="body">
    <div class="voile-modale" @click.self="emit('fermer')">
      <div class="modale-demo">
        <h3>🎓 Mini Corpus Test</h3>
        <p class="intro-demo">
          Le corpus « {{ modeLib }} » sera créé dans le dossier que vous indiquez
          (les deux modes ont chacun leur corpus — ils ne se mélangent pas).
        </p>

        <!-- Question 1 — sources : sautée si déjà en place -->
        <div v-if="besoinSources" class="question-demo">
          <span class="q-lbl">1 — Où voulez-vous placer les sources de la démo ?</span>
          <button class="choisir-dossier" @click="choisirSources">
            {{ nouvelleSources ?? 'Choisir un dossier…' }}
          </button>
          <span class="q-aide">srt/ + audio/ (~13 Mo) — copiés ici une seule fois, partagés par les deux modes</span>
        </div>
        <p v-else class="deja-place">✓ Sources déjà en place dans « {{ racineSources }} »</p>

        <!-- Question 2 — corpus de CE mode (SINGULIER) : sautée si déjà connu -->
        <div v-if="besoinCorpus" class="question-demo">
          <span class="q-lbl">2 — Où voulez-vous placer ce corpus de test ?</span>
          <button class="choisir-dossier" @click="choisirCorpus">
            {{ nouveauCorpus ?? 'Choisir un dossier…' }}
          </button>
          <span class="q-aide">le corpus « {{ modeLib }} » y sera créé (dossier vide, un dossier = un corpus)</span>
        </div>
        <p v-else class="deja-place">✓ Corpus « {{ modeLib }} » déjà en place dans « {{ corpusConnu }} »</p>

        <p v-if="erreur" class="msg-demo">{{ erreur }}</p>

        <div class="pied-modale">
          <button class="annuler" @click="emit('fermer')">Annuler</button>
          <button class="valider" :disabled="!pret" @click="valider">
            {{ enPreparation ? 'Préparation…' : 'Créer le corpus de démo' }}
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
  background: rgba(20, 25, 20, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modale-demo {
  width: min(560px, 92vw);
  background: #fff;
  border-radius: 10px;
  padding: 1.1rem 1.2rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.modale-demo h3 {
  margin: 0;
  color: #2e7d32;
}
.intro-demo {
  margin: 0;
  font-size: 0.8rem;
  color: #555;
}
.question-demo {
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
  color: #2e7d32;
  cursor: pointer;
  word-break: break-all;
}
.choisir-dossier:hover {
  border-color: #2e9e3f;
  background: #f3fbf4;
}
.q-aide {
  font-size: 0.72rem;
  color: #999;
  font-style: italic;
}
.deja-place {
  margin: 0;
  font-size: 0.8rem;
  color: #2e7d32;
  background: #eef7ef;
  border: 1px solid #cfe8d2;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  word-break: break-all;
}
.msg-demo {
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
  border-color: #2e7d32;
  background: #2e9e3f;
  color: #fff;
}
.valider:disabled {
  border-color: #ccc;
  background: #e6e6e6;
  color: #999;
  cursor: not-allowed;
}
</style>
