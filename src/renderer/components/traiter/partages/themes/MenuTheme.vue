<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

/**
 * Petit menu contextuel d'un THÈME (panneau Thématiques / consultation Corpus) :
 * bascule actif ↔ passif sans ouvrir la fenêtre d'édition. Même patron que
 * MenuContexte : téléporté à body, couche plein écran qui ferme au clic, Escape
 * ferme aussi. L'action est un simple emit, le toggle écrit via `modifierTheme`.
 */
defineProps<{ x: number; y: number; nom: string; actif: boolean }>()
const emit = defineEmits<{ (e: 'basculer'): void; (e: 'fermer'): void }>()

function surTouche(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('fermer')
}
onMounted(() => window.addEventListener('keydown', surTouche))
onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <Teleport to="body">
    <!-- Couche plein écran : un clic (ou clic droit) hors du menu ferme. -->
    <div
      class="menu-thm-couche"
      @mousedown.prevent.stop="emit('fermer')"
      @contextmenu.prevent.stop="emit('fermer')"
    >
      <div
        class="menu-thm"
        :style="{ left: x + 'px', top: y + 'px' }"
        role="menu"
        @mousedown.stop
        @contextmenu.stop
      >
        <span class="menu-thm-titre">{{ nom }}</span>
        <button class="menu-thm-action" role="menuitem" @click="emit('basculer')">
          {{ actif ? '🚫 Passer en passif' : '✅ Passer en actif' }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.menu-thm-couche {
  position: fixed;
  inset: 0;
  z-index: 1000; /* au-dessus des barres épinglées (.barre z=30, lecteur z=20) */
}
.menu-thm {
  position: fixed;
  transform: translate(4px, 4px); /* s'ouvre sous le curseur, sans le recouvrir */
  min-width: 11rem;
  background: #fff;
  border: 1px solid #d0d0d8;
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  padding: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.menu-thm-titre {
  font-size: 0.72rem;
  color: #777;
  font-style: italic;
  padding: 0.15rem 0.35rem;
  border-bottom: 1px solid #eee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.menu-thm-action {
  border: none;
  background: transparent;
  text-align: left;
  font-size: 0.82rem;
  color: #333;
  padding: 0.35rem 0.45rem;
  border-radius: 5px;
  cursor: pointer;
}
.menu-thm-action:hover {
  background: #eef4ff;
  color: #1565c0;
}
</style>
