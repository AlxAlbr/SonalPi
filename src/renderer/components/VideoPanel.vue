<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { utiliserSonal } from '../composables/sonal'

/**
 * Panneau vidéo du mode vidéo de l'écran Entretien.
 * Il n'est pas un nouveau lecteur : il ADOPTE l'élément `<video>` créé par le
 * scope média (l'horloge du mode vidéo) en le déplaçant dans son conteneur —
 * une seule horloge, jamais deux, donc une synchro exacte avec le texte.
 * Porte les boutons − / + (largeur) et un avertissement si la forme d'onde n'a
 * pas pu être générée (le texte reste synchro, seule la bande est sans onde).
 */
const { audio } = utiliserSonal()
const { elVideo, estVideo, videoW, videoH, largeurVideo, agrandirVideo, reduireVideo, waveformUrl } =
  audio

const conteneur = ref<HTMLDivElement | null>(null)

/** Décale l'élément vidéo (créé par le scope, accroché au body) dans le panneau
 *  et le rend visible. `appendChild` DÉPLACE le nœud : c'est le même élément. */
function adopter() {
  const hote = conteneur.value
  const v = elVideo.value
  if (!hote || !v) return
  if (v.parentElement !== hote) hote.appendChild(v)
  v.style.display = 'block'
}

/** Applique largeur + ratio (4:3, 16:9…) au panneau. */
function majTaille() {
  const hote = conteneur.value
  if (!hote || !estVideo.value) return
  hote.style.width = `${largeurVideo.value || 480}px`
  if (videoW.value > 0 && videoH.value > 0) {
    hote.style.aspectRatio = `${videoW.value} / ${videoH.value}`
  }
}

onMounted(() => {
  adopter()
  majTaille()
})
watch(elVideo, () => adopter())
watch([largeurVideo, estVideo, videoW, videoH], () => majTaille())
</script>

<template>
  <div class="panneau-video">
    <div ref="conteneur" class="conteneur-video"></div>
    <div class="controles-video">
      <span class="lbl-taille" title="Taille de la vidéo (mémorisée par corpus)">
        Taille
      </span>
      <button class="mini-lect" title="Réduire la vidéo" @click="reduireVideo">−</button>
      <button class="mini-lect" title="Agrandir la vidéo" @click="agrandirVideo">+</button>
      <span v-if="!waveformUrl" class="note-sans-onde" title="Décodage audio de la vidéo impossible">
        ⚠ lecture sans forme d'onde
      </span>
    </div>
  </div>
</template>

<style scoped>
.panneau-video {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: flex-start;
  min-width: 0;
  /* Se réduit si le lecteur audio a besoin de place (clé du partage de largeur). */
  flex: 0 1 auto;
}
/* Conteneur qui reçoit l'élément <video> adopté : sa largeur et son ratio
   (4:3, 16:9…) sont pilotés par le script ; la vidéo le remplit en contain. */
.conteneur-video {
  background: #000;
  border: 1px solid #333;
  border-radius: 6px;
  overflow: hidden;
  max-width: 100%;
  max-height: 52vh;
}
.controles-video {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.lbl-taille {
  font-size: 0.72rem;
  color: #888;
}
.mini-lect {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.1rem 0.55rem;
}
.mini-lect:hover {
  border-color: #2e73d8;
}
.note-sans-onde {
  font-size: 0.7rem;
  color: #b06e0f;
  background: #fff3e0;
  border: 1px solid #e0a03a;
  border-radius: 5px;
  padding: 0.1rem 0.4rem;
  margin-left: 0.4rem;
}
</style>
