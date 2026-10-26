<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

const props = defineProps<{ octets: Uint8Array }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const pageCourante = ref(1)
const nombrePages = ref(0)
const zoom = ref(1)
const chargement = ref(true)
const erreur = ref<string | null>(null)

const MAX_PIXELS_PAGE = 16_000_000
const MAX_OCTETS_CANVAS = MAX_PIXELS_PAGE * 4

let documentPdf: PDFDocumentProxy | null = null
let tacheChargement: PDFDocumentLoadingTask | null = null
let tacheRendu: RenderTask | null = null
let generation = 0
let generationRendu = 0

async function annulerRendu(): Promise<void> {
  const tache = tacheRendu
  if (!tache) return
  tache.cancel()
  try {
    await tache.promise
  } catch {
    // L'annulation est attendue lors d'un changement de page ou de document.
  } finally {
    if (tacheRendu === tache) tacheRendu = null
  }
}

async function libererDocument(): Promise<void> {
  await annulerRendu()
  const chargementEnCours = tacheChargement
  tacheChargement = null
  documentPdf = null
  if (chargementEnCours) await chargementEnCours.destroy()
}

async function rendrePage(): Promise<void> {
  const document = documentPdf
  const element = canvas.value
  if (!document || !element) return
  const maGenerationDocument = generation
  const maGenerationRendu = ++generationRendu
  await annulerRendu()
  if (
    maGenerationDocument !== generation ||
    maGenerationRendu !== generationRendu ||
    document !== documentPdf
  ) return
  erreur.value = null
  let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null
  let tacheLocale: RenderTask | null = null
  try {
    page = await document.getPage(pageCourante.value)
    if (
      maGenerationDocument !== generation ||
      maGenerationRendu !== generationRendu ||
      document !== documentPdf
    ) return
    const viewport = page.getViewport({ scale: zoom.value })
    if (viewport.width * viewport.height > MAX_PIXELS_PAGE) {
      erreur.value = 'Cette page est trop grande pour être affichée à ce niveau de zoom.'
      return
    }
    const contexte = element.getContext('2d')
    if (!contexte) throw new Error('Canvas indisponible.')
    element.width = Math.ceil(viewport.width)
    element.height = Math.ceil(viewport.height)
    tacheLocale = page.render({ canvasContext: contexte, canvas: element, viewport })
    tacheRendu = tacheLocale
    await tacheLocale.promise
  } catch (cause) {
    if (
      maGenerationDocument === generation &&
      maGenerationRendu === generationRendu &&
      (cause as { name?: string })?.name !== 'RenderingCancelledException'
    ) {
      erreur.value = 'Impossible d’afficher cette page du PDF.'
    }
  } finally {
    page?.cleanup()
    if (tacheRendu === tacheLocale) tacheRendu = null
  }
}

async function chargerPdf(octets: Uint8Array): Promise<void> {
  const maGeneration = ++generation
  generationRendu += 1
  chargement.value = true
  erreur.value = null
  nombrePages.value = 0
  pageCourante.value = 1
  await libererDocument()
  if (maGeneration !== generation) return
  try {
    const copie = new Uint8Array(octets)
    const tache = getDocument({
      data: copie,
      maxImageSize: MAX_PIXELS_PAGE,
      canvasMaxAreaInBytes: MAX_OCTETS_CANVAS,
    })
    tacheChargement = tache
    const document = await tache.promise
    if (maGeneration !== generation) {
      await tache.destroy()
      return
    }
    documentPdf = document
    nombrePages.value = document.numPages
    chargement.value = false
    await nextTick()
    await rendrePage()
  } catch {
    if (maGeneration !== generation) return
    const tache = tacheChargement
    tacheChargement = null
    if (tache) await tache.destroy()
    chargement.value = false
    erreur.value = 'Ce PDF est invalide ou ne peut pas être affiché.'
  }
}

function pagePrecedente(): void {
  if (pageCourante.value > 1) pageCourante.value -= 1
}

function pageSuivante(): void {
  if (pageCourante.value < nombrePages.value) pageCourante.value += 1
}

function changerZoom(delta: number): void {
  zoom.value = Math.min(2.5, Math.max(0.5, zoom.value + delta))
}

watch(() => props.octets, (octets) => { void chargerPdf(octets) }, { immediate: true })
watch([pageCourante, zoom], () => {
  if (!chargement.value && documentPdf) void rendrePage()
})

onUnmounted(() => {
  generation += 1
  generationRendu += 1
  void libererDocument()
})
</script>

<template>
  <div class="apercu-pdf">
    <div class="barre-pdf">
      <button :disabled="chargement || pageCourante <= 1" aria-label="Page précédente" title="Page précédente" @click="pagePrecedente">←</button>
      <span>Page {{ pageCourante }} / {{ nombrePages || '—' }}</span>
      <button :disabled="chargement || pageCourante >= nombrePages" aria-label="Page suivante" title="Page suivante" @click="pageSuivante">→</button>
      <span class="separateur"></span>
      <button :disabled="chargement || zoom <= .5" aria-label="Réduire" title="Réduire" @click="changerZoom(-.25)">−</button>
      <span>{{ Math.round(zoom * 100) }} %</span>
      <button :disabled="chargement || zoom >= 2.5" aria-label="Agrandir" title="Agrandir" @click="changerZoom(.25)">＋</button>
    </div>
    <p v-if="chargement" class="etat">Chargement du PDF…</p>
    <p v-else-if="erreur" class="erreur">{{ erreur }}</p>
    <div v-show="!chargement && !erreur" class="page-pdf">
      <canvas ref="canvas" aria-label="Page du document PDF"></canvas>
    </div>
  </div>
</template>

<style scoped>
.apercu-pdf {
  border: 1px solid #d8deea;
  border-radius: 6px;
  background: #e9ecf2;
  overflow: hidden;
}
.barre-pdf {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: .45rem;
  padding: .45rem .6rem;
  border-bottom: 1px solid #d2d7e1;
  background: #fff;
  color: #3f4758;
  font-size: .8rem;
}
.barre-pdf button { min-width: 2rem; padding: .2rem .45rem; }
.separateur { width: 1px; height: 1.2rem; margin: 0 .25rem; background: #d2d7e1; }
.page-pdf { overflow: auto; max-height: 72vh; padding: 1rem; text-align: center; }
.page-pdf canvas { display: inline-block; background: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, .18); }
.etat, .erreur { margin: 0; padding: 1rem; text-align: center; font-size: .85rem; }
.erreur { color: #b3261e; background: #fdecea; }
</style>
