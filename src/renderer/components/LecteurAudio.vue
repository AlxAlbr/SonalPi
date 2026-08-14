<script setup lang="ts">
import { utiliserSonal } from '../composables/sonal'
import type { SegmentThematique } from '../../shared/format'

/**
 * Lecteur audio — en HAUT de l'écran entretien, comme SonalPi :
 * play/pause, position, vitesse, ±5 s, puis la bande (forme d'onde PNG +
 * curseur de position + clic = seek TEMPOREL). Composant « bête » : tout
 * l'état vit dans le scope audio partagé (useAudio) — c'est la réactivité qui
 * le coordonne avec le surlignage du bloc lu, pas un composant dynamique.
 * La bande porte aussi le CALQUE du résumé thématique de l'entretien
 * ouvert (live — il suit le codage), calé sur l'axe TEMPS via les ancres.
 */
const { audio, resumeOuvert, tempsAuTexte, peintureSegment } = utiliserSonal()
const { url, waveformUrl, enLecture, duree, position, vitesse, ratio, basculer, decaler, changerVitesse, seek } =
  audio

/** Style d'un segment sur la BANDE : la bande est un axe TEMPOREL (le curseur y
 *  vit) → les bornes texte du segment sont re-projetées en temps via les ancres
 *  (`tempsAuTexte`) ; sans ancre (texte sans timecodes), repli en % du texte —
 *  l'approximation SonalPi. Peinture partagée avec les cartes Corpus. */
function styleSegmentBande(s: SegmentThematique): Record<string, string> {
  const p = peintureSegment(s.codes)
  let deb = s.deb
  let fin = s.fin
  if (duree.value > 0) {
    const t0 = tempsAuTexte(s.pos)
    const t1 = tempsAuTexte(s.posFin)
    if (t0 != null && t1 != null && t1 > t0) {
      deb = (t0 / duree.value) * 100
      fin = (t1 / duree.value) * 100
    }
  }
  const style: Record<string, string> = { left: deb + '%', width: fin - deb + '%' }
  if (p.background) style.background = p.background
  if (p.borderBottom) style.borderBottom = p.borderBottom
  if (p.masque) style.display = 'none'
  return style
}

function fmt(t: number): string {
  if (!Number.isFinite(t)) return '0:00'
  const s = Math.floor(t % 60)
  const m = Math.floor(t / 60) % 60
  const h = Math.floor(t / 3600)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0')
}

/** Clic sur la bande = seek proportionnel au TEMPS (la bande est une image
 *  temporelle — choix assumé, ≠ SonalPi qui vise une position dans le texte). */
function clicBande(e: MouseEvent) {
  if (duree.value <= 0) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const r = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  seek(r * duree.value)
}
</script>

<template>
  <div v-if="url" class="lecteur-audio">
    <div class="commandes">
      <button class="play" :title="enLecture ? 'Pause' : 'Lecture'" @click="basculer">
        {{ enLecture ? '⏸' : '▶' }}
      </button>
      <span class="temps">{{ fmt(position) }} / {{ fmt(duree) }}</span>
      <span class="groupe-vitesse">
        <button class="mini-lect" title="Ralentir" @click="changerVitesse('-')">−</button>
        <button class="mini-lect lbl-vitesse" title="Vitesse normale" @click="changerVitesse('=')">
          x {{ vitesse.toFixed(2).replace(/\.?0+$/, '') || '1' }}
        </button>
        <button class="mini-lect" title="Accélérer" @click="changerVitesse('+')">+</button>
      </span>
      <button class="mini-lect" title="Reculer de 5 secondes" @click="decaler(-5)">−5s</button>
      <button class="mini-lect" title="Avancer de 5 secondes" @click="decaler(5)">+5s</button>
    </div>
    <div class="bande" title="Cliquer pour se déplacer dans la bande" @click="clicBande">
      <img v-if="waveformUrl" class="onde" :src="waveformUrl" alt="" draggable="false" />
      <div v-else class="onde onde-vide"></div>
      <!-- Calque du résumé thématique : décoratif (pointer-events none —
           le clic sur la bande reste un seek), sous le curseur. -->
      <span
        v-for="(s, i) in resumeOuvert"
        :key="i"
        class="xtr-bande"
        :style="styleSegmentBande(s)"
      ></span>
      <div class="curseur" :style="{ left: ratio * 100 + '%' }"></div>
    </div>
  </div>
</template>

<style scoped>
.lecteur-audio {
  /* En flux normal : c'est .entete-centre (Entretien.vue) qui colle l'ensemble
     barre + lecteur en haut de la fenêtre pendant le défilement. */
  display: flex;
  align-items: center;
  gap: 0.8rem;
  border: 1px solid #dfe5df;
  border-radius: 8px;
  background: #fbfdfb;
  padding: 0.35rem 0.6rem;
  margin-bottom: 0.6rem;
}
.commandes {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: none;
}
.play {
  width: 2rem;
  height: 2rem;
  border: 1px solid #2e7d32;
  background: #2e9e3f;
  color: #fff;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
}
.temps {
  font-family: monospace;
  font-size: 0.78rem;
  color: #555;
  min-width: 6.5rem;
  text-align: center;
}
.groupe-vitesse {
  display: inline-flex;
  gap: 0.15rem;
}
.mini-lect {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  font-size: 0.72rem;
  padding: 0.15rem 0.4rem;
}
.mini-lect:hover {
  border-color: #2e9e3f;
}
.lbl-vitesse {
  min-width: 3rem;
  font-family: monospace;
}
/* La bande : forme d'onde + curseur de position (ratio temps/durée). */
.bande {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 46px;
  cursor: pointer;
  border: 1px solid #e3e8e3;
  border-radius: 5px;
  overflow: hidden;
  background: #fff;
}
.onde {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  user-select: none;
  pointer-events: none;
}
.onde-vide {
  background: repeating-linear-gradient(90deg, #f6f6fa 0 6px, #fafafe 6px 12px);
}
.curseur {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #d84315;
  pointer-events: none;
}
/* Segment du résumé thématique sur la bande — translucide, jamais interactif. */
.xtr-bande {
  position: absolute;
  top: 1px;
  bottom: 1px;
  opacity: 0.45;
  pointer-events: none;
  box-sizing: border-box;
  border-radius: 2px;
}
</style>
