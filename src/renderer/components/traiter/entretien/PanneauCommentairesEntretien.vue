<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'

defineProps<{ lectureSeule: boolean }>()

const {
  commentairesPourLiaison,
  selectionPassage,
  commenterPlage,
  allerAuCommentaire,
} = utiliserSonal()

// Sans sélection, le clic se contente d'afficher un hint (l'aide permanente
// d'origine est retirée) ; avec une sélection, la modale s'ouvre.
const hintCommentaire = ref<string | null>(null)
function commenterSelection() {
  const selection = selectionPassage.value
  if (!selection) {
    hintCommentaire.value = 'Sélectionnez du texte, puis cliquez sur « Commentaire ».'
    return
  }
  hintCommentaire.value = null
  void commenterPlage(selection.from, selection.to)
}

// Recherche dans les commentaires (auteur ou texte) : le bouton déplie un champ,
// le filtre s'applique à la volée sur la liste.
const rechercheOuverte = ref(false)
const recherche = ref('')
const champRecherche = ref<HTMLInputElement | null>(null)
const commentairesFiltres = computed(() => {
  const requete = recherche.value.trim().toLowerCase()
  if (!requete) return commentairesPourLiaison.value
  return commentairesPourLiaison.value.filter((c) =>
    c.texte.toLowerCase().includes(requete) || (c.auteur ?? '').toLowerCase().includes(requete))
})
function basculerRecherche() {
  rechercheOuverte.value = !rechercheOuverte.value
  recherche.value = ''
  if (rechercheOuverte.value) nextTick(() => champRecherche.value?.focus())
}
</script>

<template>
  <aside class="panneau commentaires" aria-label="Commentaires">
    <div class="corpus-tete">
      <button
        type="button"
        class="bouton-recherche"
        :class="{ actif: rechercheOuverte }"
        :aria-expanded="rechercheOuverte"
        @click="basculerRecherche"
      >🔍 Rechercher</button>
    </div>
    <div v-if="rechercheOuverte" class="recherche-commentaires">
      <input
        ref="champRecherche"
        v-model="recherche"
        type="search"
        placeholder="Auteur ou texte…"
        aria-label="Rechercher dans les commentaires"
        @keydown.esc.prevent="basculerRecherche"
      />
    </div>
    <p v-if="hintCommentaire" class="hint-commentaire">{{ hintCommentaire }}</p>
    <button
      type="button"
      class="ajouter-commentaire"
      :disabled="lectureSeule"
      @mousedown.prevent
      @click="commenterSelection"
    >Commentaire</button>
    <p v-if="commentairesFiltres.length === 0" class="vide">
      {{ rechercheOuverte && recherche.trim() ? 'Aucun commentaire ne correspond à la recherche.' : 'Aucun commentaire pour le moment.' }}
    </p>
    <ul v-else class="liste-commentaires">
      <li v-for="commentaire in commentairesFiltres" :key="commentaire.id">
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
.bouton-recherche {
  border: 1px solid #ddd;
  border-radius: 5px;
  padding: 0.3rem 0.6rem;
  background: #fff;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.bouton-recherche.actif {
  background: #e8f0fb;
  border-color: #1565c0;
}
.recherche-commentaires {
  margin-bottom: 0.5rem;
}
.recherche-commentaires input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 0.85rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid #ccc;
  border-radius: 5px;
}
.hint-commentaire {
  background: #fff3e0;
  color: #b06e0f;
  border: 1px solid #e0a03a;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  font-size: 0.75rem;
  margin: 0.3rem 0;
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
