<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'

/**
 * Menu contextuel d'un passage de note (`<mark>` important ou `<em>` lié) :
 * clic droit dans la fenêtre d'édition ou bouton « Lier… » → lier ou délier le
 * passage à un commentaire de l'entretien. Un commentaire déjà lié propose la
 * déliaison ; une liaison vers un commentaire supprimé reste listée pour
 * pouvoir être retirée (référence pendante). Même idiome que MenuContexte :
 * couche plein écran qui ferme au clic hors menu, Escape aussi, Téléport vers
 * <body>.
 */
export interface CommentaireLiaison {
  id: string
  auteur: string
  texte: string
}

const props = defineProps<{
  x: number
  y: number
  /** Commentaires liaisables de l'entretien. */
  commentaires: CommentaireLiaison[]
  /** Ids de commentaires actuellement liés au passage visé. */
  liens: string[]
}>()
const emit = defineEmits<{
  (e: 'lier', id: string): void
  (e: 'delier', id: string): void
  (e: 'fermer'): void
}>()

/** Libellé court d'un commentaire dans le menu. */
const libelle = (c: CommentaireLiaison) =>
  `${c.auteur || 'sans auteur'} : ${c.texte.slice(0, 60)}`

/** Commentaires pas encore liés → items « Lier à… ». */
const proposables = computed(() =>
  props.commentaires.filter((c) => !props.liens.includes(c.id)),
)
/** Commentaires liés encore existants → items « Délier… ». */
const lies = computed(() => props.commentaires.filter((c) => props.liens.includes(c.id)))
/** Liens vers des commentaires supprimés → déliaison sans libellé. */
const pendus = computed(() =>
  props.liens.filter((id) => !props.commentaires.some((c) => c.id === id)),
)

function surTouche(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('fermer')
}
onMounted(() => window.addEventListener('keydown', surTouche))
onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <Teleport to="body">
    <div
      class="menu-ctx-couche"
      @mousedown.prevent.stop="emit('fermer')"
      @contextmenu.prevent.stop="emit('fermer')"
    >
      <div
        class="menu-liens-note"
        :style="{ left: x + 'px', top: y + 'px' }"
        role="menu"
        @mousedown.stop
        @contextmenu.stop
      >
        <span class="menu-titre">Lier ce passage…</span>

        <!-- Liaisons possibles : chaque commentaire non encore lié. -->
        <button
          v-for="c in proposables"
          :key="c.id"
          class="menu-action"
          role="menuitem"
          :title="`Lier ce passage au commentaire « ${libelle(c)} ».`"
          @click="emit('lier', c.id)"
        >
          Lier à « {{ libelle(c) }} »
        </button>

        <!-- Liaisons actives vers des commentaires existants : délier. -->
        <button
          v-for="c in lies"
          :key="c.id"
          class="menu-action"
          role="menuitem"
          :title="`Retirer le lien vers « ${libelle(c)} ».`"
          @click="emit('delier', c.id)"
        >
          ✕ Délier « {{ libelle(c) }} »
        </button>

        <!-- Liens restés sur un commentaire supprimé : déliables à l'aveugle. -->
        <button
          v-for="id in pendus"
          :key="id"
          class="menu-action"
          role="menuitem"
          title="Ce commentaire a été supprimé ; le lien est retiré du passage."
          @click="emit('delier', id)"
        >
          ✕ Délier un commentaire supprimé
        </button>

        <span v-if="!proposables.length && !lies.length && !pendus.length" class="menu-vide">
          Aucun commentaire dans cet entretien.
        </span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.menu-ctx-couche {
  position: fixed;
  inset: 0;
  z-index: 1001; /* au-dessus de la modale de note (z=50) et de MenuContexte (z=1000) */
}
.menu-liens-note {
  position: fixed;
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
.menu-titre {
  font-size: 0.72rem;
  color: #777;
  font-style: italic;
  padding: 0.15rem 0.35rem;
  border-bottom: 1px solid #eee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.menu-action {
  border: none;
  background: transparent;
  text-align: left;
  font-size: 0.82rem;
  color: #333;
  padding: 0.35rem 0.45rem;
  border-radius: 5px;
  cursor: pointer;
}
.menu-action:hover {
  background: #eef4ff;
  color: #1565c0;
}
.menu-vide {
  font-size: 0.8rem;
  color: #999;
  padding: 0.35rem 0.45rem;
}
</style>
