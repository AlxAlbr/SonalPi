<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'

/**
 *  Menu contextuel GÉNÉRIQUE de l'éditeur : petit menu flottant positionné à
 *  l'événement (clic droit dans l'éditeur). Les sections ne s'affichent QUE si
 *  la cible en contient :
 *  - occurrence anon → « exception ↔ anonymisé » (+ bascule multi-pseudo) ;
 *  - codages couvrants → un item de retrait PAR thème (sans resélectionner) ;
 *  - plage disponible → « Commenter » ; commentaires couvrants → un item
 *  d'édition par commentaire.
 *
 *  Une couche transparente plein écran intercepte le clic (gauche OU droit)
 *  hors du menu → fermer ; Escape ferme aussi. Le menu est Téléporté à body :
 *  aucun conteneur de la grille (colonnes collantes, overflow) ne le rogne.
 */
export interface ItemCodage {
  id: string
  libelle: string
}
export interface ItemCommentaire {
  id: string
  auteur: string
  extrait: string
}

const props = defineProps<{
  x: number
  y: number
  /** Occurrence anon sous le clic (section anon), sinon null. */
  anon: { etat: 'anonymise' | 'exception'; entite: string; pseudosAutres: string[] } | null
  codages: ItemCodage[]
  commentaires: ItemCommentaire[]
  /** Une plage est commentable (sélection ou annotation sous le clic). */
  peutCommenter: boolean
  /** Une sélection libre peut être ajoutée à un recueil. */
  peutAjouterRecueil: boolean
}>()
const emit = defineEmits<{
  (e: 'basculer-exception'): void
  (e: 'basculer-anonymise'): void
  (e: 'basculer-pseudo', pseudo: string): void
  (e: 'retirer-codage', id: string): void
  (e: 'commenter'): void
  (e: 'ajouter-recueil'): void
  (e: 'editer-commentaire', id: string): void
  (e: 'fermer'): void
}>()

/** Extrait de texte (titre du menu) : l'entité anon, sinon le 1er commentaire… */
const titre = computed(() => props.anon?.entite ?? props.commentaires[0]?.extrait ?? '')

function surTouche(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('fermer')
}
onMounted(() => window.addEventListener('keydown', surTouche))
onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <Teleport to="body">
    <!-- Couche plein écran : un clic (ou clic droit) hors du menu ferme.
         Le menu lui-même stoppe la propagation ('stop') : un clic sur un bouton ne ferme pas AVANT l'action. -->
    <div
      class="menu-ctx-couche"
      @mousedown.prevent.stop="emit('fermer')"
      @contextmenu.prevent.stop="emit('fermer')"
    >
      <div
        class="menu-ctx"
        :style="{ left: x + 'px', top: y + 'px' }"
        role="menu"
        @mousedown.stop
        @contextmenu.stop
      >
        <span v-if="titre" class="menu-ctx-titre" :title="titre">{{ titre }}</span>

        <!-- Section ANON : bascule exception ↔ anonymisé (+ multi-pseudo). -->
        <template v-if="anon">
          <button
            v-if="anon.etat === 'anonymise'"
            class="menu-ctx-action"
            role="menuitem"
            title="Le texte reste lisible (pas de barré, marqueur pointillé) et ne sera plus capturé par l'anonymisation."
            @click="emit('basculer-exception')"
          >
            Laisser en clair (exception)
          </button>
          <button
            v-for="p in anon.pseudosAutres"
            :key="p"
            class="menu-ctx-action"
            role="menuitem"
            title="Ré-anonymiser cette occurrence avec l'autre pseudo autorisé."
            @click="emit('basculer-pseudo', p)"
          >
            ↺ Anonymiser plutôt comme « {{ p }} »
          </button>
          <button
            v-if="anon.etat === 'exception'"
            class="menu-ctx-action"
            role="menuitem"
            title="Le texte redevient barré avec son pseudo."
            @click="emit('basculer-anonymise')"
          >
            Remettre en anonymisé
          </button>
        </template>

        <!-- Section CODAGES : retirer un thème sans resélectionner. -->
        <button
          v-for="c in codages"
          :key="c.id"
          class="menu-ctx-action"
          role="menuitem"
          :title="`Retirer le codage « ${c.libelle} » sur ce passage.`"
          @click="emit('retirer-codage', c.id)"
        >
          ✕ Retirer le codage « {{ c.libelle }} »
        </button>

        <button
          v-if="peutAjouterRecueil"
          class="menu-ctx-action"
          role="menuitem"
          title="Choisir un recueil pour cette sélection libre."
          @click="emit('ajouter-recueil')"
        >
          📌 Ajouter au recueil…
        </button>

        <!-- Section COMMENTAIRES : créer, ou éditer chacun de ceux présents. -->
        <button
          v-if="peutCommenter"
          class="menu-ctx-action"
          role="menuitem"
          title="Ajouter un commentaire en marge sur ce passage."
          @click="emit('commenter')"
        >
          💬 Commenter{{ anon || codages.length ? ' ce passage' : ' la sélection' }}
        </button>
        <button
          v-for="c in commentaires"
          :key="c.id"
          class="menu-ctx-action"
          role="menuitem"
          :title="c.extrait"
          @click="emit('editer-commentaire', c.id)"
        >
          ✏️ Commentaire — {{ c.auteur || 'sans auteur' }}…
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.menu-ctx-couche {
  position: fixed;
  inset: 0;
  z-index: 1000; /* au-dessus des barres épinglées (.barre z=30, lecteur z=20) */
}
.menu-ctx {
  position: fixed;
  /* Petite translation : le menu s'ouvre sous le curseur, sans le recouvrir. */
  transform: translate(4px, 4px);
  min-width: 15rem;
  max-width: 22rem;
  background: #fff;
  border: 1px solid #d0d0d8;
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  padding: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.menu-ctx-titre {
  font-size: 0.72rem;
  color: #777;
  font-style: italic;
  padding: 0.15rem 0.35rem;
  border-bottom: 1px solid #eee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.menu-ctx-action {
  border: none;
  background: transparent;
  text-align: left;
  font-size: 0.82rem;
  color: #333;
  padding: 0.35rem 0.45rem;
  border-radius: 5px;
  cursor: pointer;
}
.menu-ctx-action:hover {
  background: #eef4ff;
  color: #1565c0;
}
</style>
