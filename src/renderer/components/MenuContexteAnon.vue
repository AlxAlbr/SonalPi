<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

/**
 * Menu contextuel des occurrences anon (étape 1, §2.3) : petit menu flottant
 * positionné à l'événement (clic droit dans l'éditeur, sur une occurrence).
 * Une seule action selon l'état courant de l'occurrence :
 *  - `anonymise` → « Laisser en clair (exception) » (basculerException) ;
 *  - `exception` → « Remettre en anonymisé » (basculerAnonymise).
 *
 * Une couche transparente plein écran intercepte le clic (gauche OU droit)
 * hors du menu → fermer ; Escape ferme aussi. Le menu est Téléporté à body :
 * aucun conteneur de la grille (colonnes collantes, overflow) ne le rogne.
 */
const props = defineProps<{
  x: number
  y: number
  etat: 'anonymise' | 'exception'
  entite: string
  /** Autres pseudos autorisés (règle multi-pseudo) pour basculer CE match. */
  pseudosAutres: string[]
}>()
const emit = defineEmits<{
  (e: 'basculer-exception'): void
  (e: 'basculer-anonymise'): void
  (e: 'basculer-pseudo', pseudo: string): void
  (e: 'fermer'): void
}>()

function surTouche(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('fermer')
}
onMounted(() => window.addEventListener('keydown', surTouche))
onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <Teleport to="body">
    <!-- Couche plein écran : un clic (ou clic droit) hors du menu ferme. Le
         menu lui-même stoppe la propagation ('stop') : un clic sur un bouton
         ne ferme pas AVANT l'action. -->
    <div
      class="menu-anon-couche"
      @mousedown.prevent.stop="emit('fermer')"
      @contextmenu.prevent.stop="emit('fermer')"
    >
      <div
        class="menu-anon"
        :style="{ left: x + 'px', top: y + 'px' }"
        role="menu"
        @mousedown.stop
        @contextmenu.stop
      >
        <span class="menu-anon-titre">{{ entite }}</span>
        <button
          v-if="etat === 'anonymise'"
          class="menu-anon-action"
          role="menuitem"
          title="Le texte reste lisible (pas de barré, marqueur pointillé) et ne sera plus capturé par l'anonymisation."
          @click="emit('basculer-exception')"
        >
          Laisser en clair (exception)
        </button>
        <!-- Multi-pseudo (3b) : bascule CETTE occurrence vers un autre pseudo
             autorisé par sa règle ou son ensemble déclaré (niveau entretien,
             parité V1). Un item par pseudo, hors le courant. -->
        <button
          v-for="p in pseudosAutres"
          :key="p"
          class="menu-anon-action"
          role="menuitem"
          title="Ré-anonymiser cette occurrence avec l'autre pseudo autorisé."
          @click="emit('basculer-pseudo', p)"
        >
          ↺ Anonymiser plutôt comme « {{ p }} »
        </button>
        <button
          v-if="etat === 'exception'"
          class="menu-anon-action"
          role="menuitem"
          title="Le texte redevient barré avec son pseudo."
          @click="emit('basculer-anonymise')"
        >
          Remettre en anonymisé
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.menu-anon-couche {
  position: fixed;
  inset: 0;
  z-index: 1000; /* au-dessus des barres épinglées (.barre z=30, lecteur z=20) */
}
.menu-anon {
  position: fixed;
  /* Petite translation : le menu s'ouvre sous le curseur, sans le recouvrir. */
  transform: translate(4px, 4px);
  min-width: 13rem;
  background: #fff;
  border: 1px solid #d0d0d8;
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  padding: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.menu-anon-titre {
  font-size: 0.72rem;
  color: #777;
  font-style: italic;
  padding: 0.15rem 0.35rem;
  border-bottom: 1px solid #eee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.menu-anon-action {
  border: none;
  background: transparent;
  text-align: left;
  font-size: 0.82rem;
  color: #333;
  padding: 0.35rem 0.45rem;
  border-radius: 5px;
  cursor: pointer;
}
.menu-anon-action:hover {
  background: #eef4ff;
  color: #1565c0;
}
</style>