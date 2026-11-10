<script setup lang="ts">
import { utiliserSonal } from '../../../composables/sonal'

defineProps<{ lectureSeule: boolean }>()

const {
  commentairesPourLiaison,
  selectionPassage,
  commenterPlage,
  allerAuCommentaire,
} = utiliserSonal()

function commenterSelection() {
  const selection = selectionPassage.value
  if (selection) void commenterPlage(selection.from, selection.to)
}
</script>

<template>
  <aside class="panneau commentaires">
    <div class="corpus-tete">
      <h3>Commentaires</h3>
    </div>
    <p class="aide-commentaires">Sélectionnez du texte, puis cliquez sur « Commentaire ».</p>
    <button
      type="button"
      class="ajouter-commentaire"
      :disabled="lectureSeule || !selectionPassage"
      @mousedown.prevent
      @click="commenterSelection"
    >Commentaire</button>
    <p v-if="commentairesPourLiaison.length === 0" class="vide">Aucun commentaire pour le moment.</p>
    <ul v-else class="liste-commentaires">
      <li v-for="commentaire in commentairesPourLiaison" :key="commentaire.id">
        <button
          type="button"
          class="aller-commentaire"
          title="Retrouver ce commentaire dans le texte"
          @click="allerAuCommentaire(commentaire.id)"
        >
          <span class="auteur-commentaire">{{ commentaire.auteur || 'Sans auteur' }}</span>
          <span class="texte-commentaire">{{ commentaire.texte }}</span>
        </button>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.aide-commentaires {
  font-size: 0.8rem;
  color: #666;
}
.ajouter-commentaire {
  border: 1px solid #1565c0;
  border-radius: 6px;
  padding: 0.4rem 0.7rem;
  background: #fff;
  color: #1565c0;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.ajouter-commentaire:disabled {
  opacity: 0.45;
  cursor: default;
}
.liste-commentaires {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
}
.aller-commentaire {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.65rem;
  background: #fff;
  text-align: left;
  font: inherit;
  font-size: 0.85rem;
  color: #333;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.aller-commentaire:hover {
  background: #f2f7ff;
  border-color: #1565c0;
}
.aller-commentaire:focus-visible,
.ajouter-commentaire:focus-visible {
  outline: 2px solid #1565c0;
  outline-offset: 2px;
}
.auteur-commentaire {
  font-weight: 600;
  color: #555;
}
.texte-commentaire {
  white-space: pre-wrap;
}
</style>
