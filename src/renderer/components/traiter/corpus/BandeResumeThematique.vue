<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import type { SegmentThematique } from '../../../../shared/format'

/**
 *  Bande des thèmes d'une carte d'entretien : un segment coloré par passage codé,
 *  placé en % du texte.
 *  Les couleurs sont dessinées dans une seule image :
 *  des milliers de segments en dégradé ralentissaient tout l'écran Corpus, notamment le zoom.
 *  Des zones transparentes, posées par-dessus, gardent l'infobulle et le clic de chaque segment.
 */
const props = defineProps<{ entretienId: string; segments: SegmentThematique[] }>()
const emit = defineEmits<{ ouvrir: [entretienId: string, pos: number] }>()
const { peintureSegment, nomTheme } = utiliserSonal()

const affichage = computed(() =>
  props.segments.flatMap((s) => {
    const p = peintureSegment(s.codes)
    if (p.masque) return []
    return [{
      deb: s.deb,
      fin: s.fin,
      pos: s.pos,
      couleurs: p.couleurs,
      ponderation: p.ponderation,
      style: { left: s.deb + '%', width: s.fin - s.deb + '%' },
      titre: s.codes.map(nomTheme).join(' + '),
    }]
  }),
)

const toile = ref<HTMLCanvasElement | null>(null)
let observateur: ResizeObserver | undefined
/** Hauteur fixe de l'image, étirée à la hauteur de la carte :
 *  le zoom change la hauteur sans rien redessiner. */
const HAUTEUR_IMAGE = 60
/** Vrai quand un dessin n'a pas pu se faire, la bande étant masquée. */
let dessinEnAttente = false

/** Dessine les segments à la largeur réelle de la bande, en pixels de l'écran. */
function dessiner(): void {
  const canvas = toile.value
  const contexte = canvas?.getContext('2d')
  if (!canvas || !contexte) return
  const largeur = Math.round(canvas.clientWidth * (window.devicePixelRatio || 1))
  dessinEnAttente = !largeur
  if (!largeur) return
  const hauteur = HAUTEUR_IMAGE
  if (canvas.width !== largeur) canvas.width = largeur
  if (canvas.height !== hauteur) canvas.height = hauteur
  contexte.clearRect(0, 0, largeur, hauteur)
  // Un thème de grande taille se signale par un trait noir sous le segment.
  const trait = Math.round(hauteur / 8)
  for (const s of affichage.value) {
    const x = Math.round((s.deb / 100) * largeur)
    const l = Math.max(1, Math.round((s.fin / 100) * largeur) - x)
    const bas = s.ponderation ? trait : 0
    // Plusieurs thèmes se partagent la hauteur, en bandes horizontales.
    s.couleurs.forEach((couleur, i) => {
      const y = Math.round((i / s.couleurs.length) * (hauteur - bas))
      const yFin = Math.round(((i + 1) / s.couleurs.length) * (hauteur - bas))
      contexte.fillStyle = couleur
      contexte.fillRect(x, y, l, yFin - y)
    })
    if (bas) {
      contexte.fillStyle = '#000'
      contexte.fillRect(x, hauteur - bas, l, bas)
    }
  }
}

watch(affichage, dessiner, { flush: 'post' })
onMounted(() => {
  dessiner()
  // Un nouveau dessin n'est utile qu'après un changement de largeur,
  // ou quand la bande réapparaît après une mise à jour faite pendant qu'elle était masquée.
  observateur = new ResizeObserver(() => {
    const canvas = toile.value
    if (!canvas) return
    if (dessinEnAttente || canvas.width !== Math.round(canvas.clientWidth * (window.devicePixelRatio || 1))) dessiner()
  })
  if (toile.value) observateur.observe(toile.value)
})
onBeforeUnmount(() => observateur?.disconnect())
</script>

<template>
  <canvas ref="toile" class="bande-themes" aria-hidden="true"></canvas>
  <span
    v-for="(s, i) in affichage"
    :key="i"
    class="xtr-graph"
    :style="s.style"
    :title="s.titre"
    @click.stop="emit('ouvrir', entretienId, s.pos)"
  ></span>
</template>

<style scoped>
.bande-themes {
  position: absolute;
  top: 1px;
  left: 0;
  width: 100%;
  height: calc(100% - 2px);
  opacity: 0.55; /* la couleur reste celle du thème, l'onde reste lisible dessous */
  pointer-events: none;
}
.xtr-graph {
  position: absolute;
  top: 1px;
  bottom: 1px;
  cursor: pointer;
  box-sizing: border-box;
  border-radius: 2px;
}
.xtr-graph:hover {
  /* Au survol, le segment se détache (clic = rouvrir au texte). */
  border: 1px solid #030303;
  background: rgba(0, 0, 0, 0.15);
}
</style>
