<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TourLocuteurCorpus } from '../../../../shared/corpus/repertoireLocuteurs'
import CadreOndeCorpus from './CadreOndeCorpus.vue'

const props = withDefaults(defineProps<{
  titre: string
  tours: TourLocuteurCorpus[]
  couleurs: Record<string, string>
  source?: string | null
}>(), { source: null })
const emit = defineEmits<{ ouvrir: [tour: TourLocuteurCorpus] }>()
const toile = ref<HTMLCanvasElement | null>(null)
const selectionnes = computed(() => props.tours.filter((tour) => tour.cle && props.couleurs[tour.cle]))
let observateur: ResizeObserver | undefined

function dessiner() {
  const canvas = toile.value
  const contexte = canvas?.getContext('2d')
  if (!canvas || !contexte) return
  const largeur = Math.max(1, canvas.clientWidth)
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.round(largeur * ratio)
  canvas.height = Math.round(25 * ratio)
  contexte.scale(ratio, ratio)
  contexte.globalAlpha = .55
  for (const tour of selectionnes.value) {
    contexte.fillStyle = props.couleurs[tour.cle!]
    contexte.fillRect(tour.debut / 100 * largeur, 1, Math.max(1, (tour.fin - tour.debut) / 100 * largeur), 23)
  }
}
function ouvrir(event: MouseEvent) {
  const rectangle = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const position = rectangle.width ? (event.clientX - rectangle.left) / rectangle.width * 100 : 0
  const tour = event.detail === 0 ? selectionnes.value[0]
    : selectionnes.value.find((tour) => tour.debut <= position && tour.fin > position)
  if (tour) emit('ouvrir', tour)
}
onMounted(() => {
  observateur = new ResizeObserver(dessiner)
  if (toile.value) observateur.observe(toile.value)
  dessiner()
})
watch([() => props.tours, () => props.couleurs], async () => { await nextTick(); dessiner() })
onBeforeUnmount(() => observateur?.disconnect())
</script>

<template>
  <CadreOndeCorpus :source="source">
    <button class="barre-interventions" type="button" :disabled="!selectionnes.length"
      :aria-label="`Ouvrir une intervention sélectionnée dans ${titre}`"
      title="Cliquez sur un tour de parole coloré pour l’ouvrir dans le texte" @click="ouvrir">
      <canvas ref="toile" aria-hidden="true"></canvas>
    </button>
  </CadreOndeCorpus>
</template>

<style scoped>
.barre-interventions { position: absolute; inset: 0; display: block; width: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; border-radius: 3px; }
canvas { display: block; width: 100%; height: 25px; }
.barre-interventions:focus-visible { outline: 2px solid #356ac3; outline-offset: 3px; }
.barre-interventions:disabled { cursor: default; pointer-events: none; }
</style>
