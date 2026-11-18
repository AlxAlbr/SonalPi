<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TourLocuteurCorpus } from '../../../../shared/corpus/repertoireLocuteurs'

const props = defineProps<{
  titre: string
  tours: TourLocuteurCorpus[]
  couleurs: Record<string, string>
}>()
const emit = defineEmits<{ ouvrir: [tour: TourLocuteurCorpus] }>()
const toile = ref<HTMLCanvasElement | null>(null)
let observateur: ResizeObserver | undefined

function dessiner() {
  const canvas = toile.value
  const contexte = canvas?.getContext('2d')
  if (!canvas || !contexte) return
  const largeur = Math.max(1, canvas.clientWidth)
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.round(largeur * ratio)
  canvas.height = Math.round(30 * ratio)
  contexte.scale(ratio, ratio)
  contexte.fillStyle = '#edf0f4'
  contexte.fillRect(0, 0, largeur, 30)
  for (const tour of props.tours) {
    contexte.fillStyle = '#bcc4cf'
    contexte.fillRect(tour.debut / 100 * largeur, 3, Math.max(1, (tour.fin - tour.debut) / 100 * largeur), 24)
  }
  // Les interventions sélectionnées restent visibles, même lorsqu’elles sont très courtes.
  for (const tour of props.tours) {
    const couleur = tour.cle && props.couleurs[tour.cle]
    if (!couleur) continue
    contexte.fillStyle = couleur
    contexte.fillRect(tour.debut / 100 * largeur, 3, Math.max(1, (tour.fin - tour.debut) / 100 * largeur), 24)
  }
}
function ouvrir(event: MouseEvent) {
  const rectangle = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const position = rectangle.width ? (event.clientX - rectangle.left) / rectangle.width * 100 : 0
  const tour = event.detail === 0
    ? props.tours.find((tour) => tour.cle && props.couleurs[tour.cle]) ?? props.tours[0]
    : props.tours.find((tour) => tour.debut <= position && tour.fin > position)
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
  <button class="barre-interventions" type="button" :disabled="!tours.length"
    :aria-label="`Ouvrir une intervention dans ${titre}`"
    title="Déroulement du texte : cliquez sur une intervention pour l’ouvrir" @click="ouvrir">
    <canvas ref="toile" aria-hidden="true"></canvas>
    <span class="bornes" aria-hidden="true"><span>Début du texte</span><span>Fin du texte</span></span>
  </button>
</template>

<style scoped>
.barre-interventions { display: block; width: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; }
canvas { display: block; width: 100%; height: 30px; border-radius: 4px; }
.bornes { display: flex; justify-content: space-between; margin-top: .15rem; color: #657184; font-size: .7rem; }
.barre-interventions:focus-visible { outline: 2px solid #356ac3; outline-offset: 4px; }
.barre-interventions:disabled { cursor: default; }
</style>
