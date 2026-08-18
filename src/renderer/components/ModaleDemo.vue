<script setup lang="ts">
import { ref, computed } from 'vue'
import { utiliserSonal } from '../composables/sonal'
import type { ModeDemo } from '../composables/demo'

/**
 * Modale démo à DEUX dossiers (plan-reference-audio §7.2, façon SonalPi
 * `nouveau_corpus.html`) : les SOURCES de la démo (matérialisées une fois —
 * l'app copie le `CorpusTest/` bundled, ~13 Mo) et le CORPUS DE TRAVAIL qui les
 * RÉFÉRENCE. Composant partagé entre les deux cartes de l'Accueil.
 *
 * Gardes : les deux dossiers doivent être DISTINCTS (sinon `sources/audio/`
 * chevaucherait le `audio/` legacy du corpus) ; `defaultPath` des pickers hinté
 * `Documents/Sonal/démo/<sources|corpus>` (désamortit le geste, modifiable).
 * À la validation → `preparer(mode, { racineSources, dossierCorpus })` (zéro
 * copie d'audio dans le corpus : les entretiens référencent les sources).
 */
const props = defineProps<{ mode: ModeDemo }>()
const emit = defineEmits<{ (e: 'fermer'): void }>()

const { preparer, enPreparation } = utiliserSonal()

const racineSources = ref<string | null>(null)
const dossierCorpus = ref<string | null>(null)
const erreur = ref<string | null>(null)

async function choisirSources() {
  racineSources.value = await window.sonal.dialog.choisirDossier('sources')
  erreur.value = null
}
async function choisirCorpus() {
  dossierCorpus.value = await window.sonal.dialog.choisirDossier('corpus')
  erreur.value = null
}

const pret = computed(() => !!racineSources.value && !!dossierCorpus.value && !enPreparation.value)

async function valider() {
  if (!racineSources.value || !dossierCorpus.value) return
  if (racineSources.value === dossierCorpus.value) {
    erreur.value =
      'Les deux dossiers doivent être distincts — les sources ne peuvent pas être le corpus de travail.'
    return
  }
  await preparer(props.mode, {
    racineSources: racineSources.value,
    dossierCorpus: dossierCorpus.value,
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
          Deux endroits à choisir, comme dans SonalPi : la <strong>matière
          brute</strong> (les sources de la démo, copiées une fois chez vous) et
          le <strong>dossier de travail</strong> (le corpus qui les référence —
          un dossier = un corpus).
        </p>

        <div class="question-demo">
          <span class="q-lbl">1 — Où voulez-vous placer les sources de la démo ?</span>
          <button class="choisir-dossier" @click="choisirSources">
            {{ racineSources ?? 'Choisir un dossier…' }}
          </button>
          <span class="q-aide">srt/ + audio/ (~13 Mo) — copiés ici une seule fois</span>
        </div>

        <div class="question-demo">
          <span class="q-lbl">2 — Où voulez-vous placer le corpus de travail ?</span>
          <button class="choisir-dossier" @click="choisirCorpus">
            {{ dossierCorpus ?? 'Choisir un dossier…' }}
          </button>
          <span class="q-aide">le corpus y est créé et ouvert</span>
        </div>

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
