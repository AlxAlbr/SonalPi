<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 *  Zone défilante dont la barre se superpose au contenu, en semi-transparence.
 *  Le navigateur ne sait plus superposer sa barre native :
 *  elle est donc masquée et remplacée par une poignée, sans toucher au défilement.
 */
const MARGE_RAIL = 4
const HAUTEUR_MINI_POIGNEE = 28

const zone = ref<HTMLElement | null>(null)
const contenu = ref<HTMLElement | null>(null)
const visible = ref(false)
const hauteurPoignee = ref(0)
const hautPoignee = ref(0)
let observateur: ResizeObserver | null = null
let glissement: { y: number; defilement: number; idPointeur: number } | null = null

function hauteurRail(el: HTMLElement) {
  return el.clientHeight - 2 * MARGE_RAIL
}

function actualiser() {
  const el = zone.value
  if (!el) return
  const course = el.scrollHeight - el.clientHeight
  visible.value = course > 0
  if (course <= 0) return
  const rail = hauteurRail(el)
  hauteurPoignee.value = Math.max(HAUTEUR_MINI_POIGNEE, (rail * el.clientHeight) / el.scrollHeight)
  hautPoignee.value = MARGE_RAIL + (el.scrollTop / course) * (rail - hauteurPoignee.value)
}

function commencerGlissement(event: PointerEvent) {
  const el = zone.value
  if (!el) return
  event.preventDefault()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  glissement = { y: event.clientY, defilement: el.scrollTop, idPointeur: event.pointerId }
}

function glisser(event: PointerEvent) {
  const el = zone.value
  if (!el || glissement?.idPointeur !== event.pointerId) return
  const course = el.scrollHeight - el.clientHeight
  const coursePoignee = hauteurRail(el) - hauteurPoignee.value
  if (coursePoignee > 0) el.scrollTop = glissement.defilement + (event.clientY - glissement.y) * (course / coursePoignee)
}

function terminerGlissement() {
  glissement = null
}

onMounted(() => {
  observateur = new ResizeObserver(actualiser)
  if (zone.value) observateur.observe(zone.value)
  if (contenu.value) observateur.observe(contenu.value)
  actualiser()
})
onBeforeUnmount(() => observateur?.disconnect())
</script>

<template>
  <div class="defilement-superpose">
    <div ref="zone" class="zone-defilement" @scroll.passive="actualiser">
      <div ref="contenu" class="contenu-defilement"><slot /></div>
    </div>
    <div
      v-show="visible"
      class="poignee-defilement"
      aria-hidden="true"
      :style="{ top: `${hautPoignee}px`, height: `${hauteurPoignee}px` }"
      @pointerdown="commencerGlissement"
      @pointermove="glisser"
      @pointerup="terminerGlissement"
      @pointercancel="terminerGlissement"
    ></div>
  </div>
</template>

<style scoped>
.defilement-superpose {
  position: relative;
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  min-height: 0;
}
.zone-defilement {
  flex: 0 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
}
.contenu-defilement {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.poignee-defilement {
  position: absolute;
  z-index: 5;
  right: 3px;
  width: 6px;
  border-radius: 3px;
  background: rgba(40, 45, 70, 0.32);
  cursor: default;
  touch-action: none;
  transition: background 120ms ease;
}
.poignee-defilement:hover,
.poignee-defilement:active {
  background: rgba(40, 45, 70, 0.55);
}
</style>
