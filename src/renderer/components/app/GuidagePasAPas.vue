<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'

const {
  pasAPas,
  etapeCouranteId,
  etapeCourante,
  parcoursActif,
  surfaceGuide,
  retestInfo,
  finiInfo,
  activer,
  voirParcours,
  vue,
} = utiliserSonal()

type EtatCible =
  | { etat: 'visible'; rect: DOMRect }
  | { etat: 'absente' }
  | { etat: 'cachee' }

const cible = ref<EtatCible>({ etat: 'absente' })
const explicationOuverte = ref(false)
let raf = 0
let generationBoucle = 0

function arreterBoucle() {
  generationBoucle++
  cancelAnimationFrame(raf)
  raf = 0
  cible.value = { etat: 'absente' }
}

function recalc() {
  const e = etapeCourante.value
  if (!pasAPas.value || !e || vue.value === 'accueil') {
    cible.value = { etat: 'cachee' }
    return
  }
  const selecteur = e.cible()
  const element = selecteur ? document.querySelector(selecteur) : null
  if (!element) {
    cible.value = { etat: 'absente' }
    return
  }
  if ((element as HTMLElement).getClientRects().length === 0) {
    cible.value = { etat: 'cachee' }
    return
  }
  cible.value = {
    etat: 'visible',
    rect: (element as HTMLElement).getBoundingClientRect(),
  }
}

function lancerBoucle(generation: number) {
  if (generation !== generationBoucle) return
  recalc()
  raf = requestAnimationFrame(() => lancerBoucle(generation))
}

watch(
  [etapeCouranteId, pasAPas],
  async ([id, actif]) => {
    arreterBoucle()
    explicationOuverte.value = false
    if (!id || !actif) return
    const generation = generationBoucle
    await nextTick()
    if (generation !== generationBoucle) return
    lancerBoucle(generation)
  },
  { immediate: true },
)

onBeforeUnmount(arreterBoucle)

const styleBulle = computed(() => {
  if (cible.value.etat !== 'visible') {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }
  const rect = cible.value.rect
  const hauteur = document.querySelector<HTMLElement>('.spotlight-bulle')?.offsetHeight ?? 220
  const propose = rect.bottom + hauteur + 20 < window.innerHeight ? rect.bottom + 12 : rect.top - hauteur - 12
  const top = `${Math.max(8, Math.min(propose, window.innerHeight - hauteur - 8))}px`
  const largeur = Math.min(340, window.innerWidth * .8)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - largeur - 8))
  return { left: `${left}px`, top, transform: 'none' }
})

const styleTrou = computed(() => {
  if (cible.value.etat !== 'visible') return { display: 'none' }
  const rect = cible.value.rect
  return {
    left: `${rect.left - 6}px`,
    top: `${rect.top - 6}px`,
    width: `${rect.width + 12}px`,
    height: `${rect.height + 12}px`,
  }
})

const modePanneau = computed(() => {
  const etape = etapeCourante.value
  if (!etape?.panneau) return false
  return etape.panneauSur
    ? etape.panneauSur.includes(surfaceGuide.value)
    : surfaceGuide.value === 'entretien'
})

const ciblePanneau = computed(() => {
  // Le recalcul de cible à chaque frame permet de suivre l'apparition d'un formulaire.
  void cible.value
  if (surfaceGuide.value === 'tableau-bord') {
    return document.querySelector('[data-tour="ancre-guide-tableau-form"]')
      ? '[data-tour="ancre-guide-tableau-form"]'
      : '[data-tour="ancre-guide-tableau"]'
  }
  if (surfaceGuide.value === 'docs-cadre') return '[data-tour="ancre-guide-docs-cadre"]'
  if (surfaceGuide.value === 'analyse') return '[data-tour="ancre-guide-analyse"]'
  if (surfaceGuide.value === 'organisation') return '[data-tour="ancre-guide-organisation"]'
  if (surfaceGuide.value === 'entretien') {
    if (etapeCourante.value?.id === 'noter') return '[data-tour="ancre-guide-pp-notes"]'
    if (etapeCourante.value?.id === 'renommer') return '[data-tour="gestion-locuteurs"]'
    if (etapeCourante.value?.id === 'variable') return '[data-tour="ancre-guide-pp-donnees"]'
    if (etapeCourante.value?.id === 'coder') return '[data-tour="ancre-guide-pp-themes"]'
  }
  return '[data-tour="ancre-guide-pp"]'
})

const fichiersExercice = computed(() => {
  void cible.value
  return etapeCourante.value?.fichiersExercice?.() ?? null
})

function voirFichiers(): void {
  const fichiers = fichiersExercice.value
  if (fichiers) void window.sonal.exemples.voirSources(fichiers.dossier)
}

async function revenirRetest() {
  if (await voirParcours()) retestInfo.value = null
}

function fermerRetest() {
  if (retestInfo.value?.vue === 'entretien') void revenirRetest()
  else retestInfo.value = null
}

function enchainFini() {
  const info = finiInfo.value
  finiInfo.value = null
  if (info?.prochaineId) activer(info.parcoursId, info.prochaineId)
}

async function revenirFini() {
  if (await voirParcours()) finiInfo.value = null
}

function ancreMessage(vueMessage: string | undefined): string {
  if (vueMessage === 'analyser') return '[data-tour="ancre-guide-analyse"]'
  if (vueMessage === 'organiser') return '[data-tour="ancre-guide-organisation"]'
  if (vueMessage === 'entretien') return '[data-tour="ancre-guide-pp"]'
  return '[data-tour="ancre-guide-corpus"]'
}
const cibleRetest = computed(() => ancreMessage(retestInfo.value?.vue))
const cibleFini = computed(() => ancreMessage(finiInfo.value?.vue))
</script>

<template>
  <Teleport to="body">
    <template
      v-if="pasAPas && etapeCourante && vue !== 'accueil' && cible.etat !== 'cachee' && (!modePanneau || etapeCourante.panneauAvecTrou)"
    >
      <div v-if="cible.etat === 'absente' && !modePanneau" class="spotlight-voile"></div>
      <div v-else class="spotlight-trou" :class="{ 'repere-analyse': surfaceGuide === 'analyse' || surfaceGuide === 'organisation' }" :style="styleTrou"></div>
      <div v-if="!modePanneau" class="spotlight-bulle" :style="styleBulle">
        <div class="guide-pp-parcours">{{ parcoursActif.titre }}</div>
        <div class="bulle-titre">{{ etapeCourante.titre }}</div>
        <p class="bulle-texte">{{ etapeCourante.texte() }}</p>
        <button
          v-if="etapeCourante.explication"
          class="details-pp"
          :aria-expanded="explicationOuverte"
          @click="explicationOuverte = !explicationOuverte"
        >
          {{ explicationOuverte ? 'Masquer les explications' : 'Afficher les explications' }}
        </button>
        <p v-if="etapeCourante.explication && explicationOuverte" class="explication-pp">
          {{ etapeCourante.explication() }}
        </p>
        <div class="bulle-actions">
          <button class="bulle-btn arreter" @click="etapeCouranteId = null">Mettre le guide en pause</button>
          <button class="bulle-btn" @click="voirParcours()">Revenir aux parcours</button>
          <button v-if="fichiersExercice" class="bulle-btn" @click="voirFichiers">
            {{ fichiersExercice.libelle }}
          </button>
        </div>
      </div>
    </template>
  </Teleport>

  <Teleport
    v-if="pasAPas && modePanneau && etapeCourante"
    :to="ciblePanneau"
  >
    <div class="guide-pp" data-testid="consigne-pas-a-pas">
      <div class="guide-pp-parcours">{{ parcoursActif.titre }}</div>
      <div class="guide-pp-titre">{{ etapeCourante.titre }}</div>
      <p class="guide-pp-texte">{{ etapeCourante.texte() }}</p>
      <button
        v-if="etapeCourante.explication"
        class="details-pp"
        :aria-expanded="explicationOuverte"
        @click="explicationOuverte = !explicationOuverte"
      >
        {{ explicationOuverte ? 'Masquer les explications' : 'Afficher les explications' }}
      </button>
      <p v-if="etapeCourante.explication && explicationOuverte" class="explication-pp">
        {{ etapeCourante.explication() }}
      </p>
      <div class="guide-pp-actions">
        <button class="guide-pp-btn arreter" @click="etapeCouranteId = null">Mettre le guide en pause</button>
        <button class="guide-pp-btn" @click="voirParcours()">Revenir aux parcours</button>
        <button v-if="fichiersExercice" class="guide-pp-btn" @click="voirFichiers">
          {{ fichiersExercice.libelle }}
        </button>
      </div>
    </div>
  </Teleport>

  <Teleport v-if="pasAPas && retestInfo && retestInfo.vue === vue" :to="cibleRetest">
    <div class="guide-pp retest">
      <div class="guide-pp-titre">« {{ retestInfo.titre }} » déjà réalisée</div>
      <p class="guide-pp-texte">Vous pouvez essayer de {{ retestInfo.suite }}.</p>
      <div class="guide-pp-actions">
        <button class="guide-pp-btn" @click="fermerRetest">
          {{ retestInfo.vue === 'entretien' ? 'Voir les étapes du parcours' : 'OK' }}
        </button>
      </div>
    </div>
  </Teleport>

  <Teleport v-if="pasAPas && finiInfo && finiInfo.vue === vue" :to="cibleFini">
    <div class="fini-pp">
      <div class="fini-pp-titre">{{ finiInfo.titre }}</div>
      <p class="fini-pp-texte">{{ finiInfo.suite }}</p>
      <div class="fini-pp-actions">
        <button v-if="finiInfo.prochaineId" class="fini-pp-btn" @click="enchainFini">
          Étape suivante : {{ finiInfo.prochaineTitre }} →
        </button>
        <button
          v-if="!finiInfo.prochaineId && finiInfo.parcoursSuivantId"
          class="fini-pp-btn revenir"
          @click="voirParcours(finiInfo.parcoursSuivantId!); finiInfo = null"
        >Découvrir le parcours suivant</button>
        <template v-if="finiInfo.vue === 'entretien'">
          <button class="fini-pp-btn revenir" @click="revenirFini">Voir les étapes du parcours</button>
          <button class="fini-pp-btn discret" title="Continuer dans l’entretien" @click="finiInfo = null">OK</button>
        </template>
        <button v-else class="fini-pp-btn" @click="finiInfo = null">OK</button>
      </div>
    </div>
  </Teleport>
</template>

<style>
.spotlight-voile {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 100;
}
.spotlight-trou {
  position: fixed;
  border-radius: 6px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  border: 2px solid #2e73d8;
  pointer-events: none;
  z-index: 1001;
  transition: all 0.12s ease-out;
}
.spotlight-trou.repere-analyse { box-shadow: none; }
.spotlight-bulle {
  box-sizing: border-box;
  position: fixed;
  width: min(340px, 80vw);
  max-height: min(70vh, 420px);
  overflow-y: auto;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
  padding: 0.7rem 0.9rem;
  z-index: 1002;
}
.guide-pp-parcours {
  color: #596579;
  font-size: 0.7rem;
  font-weight: 700;
  margin-bottom: 0.1rem;
  text-transform: uppercase;
}
.bulle-titre,
.guide-pp-titre {
  font-weight: 600;
  font-size: 0.88rem;
  color: #1565c0;
  margin-bottom: 0.2rem;
}
.bulle-texte,
.guide-pp-texte,
.explication-pp {
  font-size: 0.8rem;
  color: #333;
  margin: 0 0 0.45rem;
  line-height: 1.35;
}
.explication-pp {
  color: #596579;
  padding-left: 0.55rem;
  border-left: 2px solid #b8c9df;
}
.details-pp {
  border: 0;
  background: transparent;
  color: #1565c0;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.1rem 0;
  margin-bottom: 0.35rem;
}
.details-pp:hover {
  text-decoration: underline;
}
.bulle-actions,
.guide-pp-actions {
  display: flex;
  gap: 0.4rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 0.2rem;
}
.bulle-btn,
.guide-pp-btn {
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
}
.bulle-btn:hover,
.guide-pp-btn:hover {
  border-color: #2e73d8;
}
.bulle-btn.arreter,
.guide-pp-btn.arreter {
  border: none;
  background: transparent;
  color: #778;
  font-size: 0.72rem;
  padding: 0.15rem 0.4rem;
}
.bulle-btn.arreter:hover,
.guide-pp-btn.arreter:hover {
  color: #445;
  text-decoration: underline;
}
.guide-pp {
  border: 1px solid #2e73d8;
  background: #f0f6ff;
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  margin-bottom: 0.5rem;
}
.guide-pp.retest {
  border-color: #e0a03a;
  background: #fff8ec;
}
.guide-pp.retest .guide-pp-titre {
  color: #8a6d3b;
}
.fini-pp {
  border: 1px solid #2e8b57;
  background: #f0faf4;
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  margin-bottom: 0.5rem;
}
.fini-pp-titre {
  font-weight: 600;
  font-size: 0.85rem;
  color: #1d7a44;
  margin-bottom: 0.2rem;
}
.fini-pp-texte {
  font-size: 0.8rem;
  color: #333;
  margin: 0 0 0.5rem;
}
.fini-pp-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.fini-pp-btn {
  border: 1px solid #2e8b57;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
  color: #1d7a44;
}
.fini-pp-btn:hover {
  background: #e6f6ec;
}
.fini-pp-btn.discret {
  border: none;
  background: transparent;
  color: #62806e;
  font-size: 0.72rem;
}
.fini-pp-btn.discret:hover {
  color: #1d7a44;
  text-decoration: underline;
}
</style>
