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
const aideOuverte = ref(false)
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
    <div class="gabarit-entete">
      <button
        type="button"
        class="gabarit-icone"
        :aria-expanded="aideOuverte"
        aria-label="Aide sur les commentaires"
        title="Aide"
        @click="aideOuverte = !aideOuverte"
      ><span class="ico-info" aria-hidden="true"></span></button>
      <div class="gabarit-actions">
        <button
          type="button"
          class="gabarit-icone"
          :aria-expanded="rechercheOuverte"
          aria-label="Rechercher dans les commentaires"
          title="Rechercher dans les commentaires"
          @click="basculerRecherche"
        >🔍</button>
        <button
          type="button"
          class="gabarit-action"
          :disabled="lectureSeule"
          @mousedown.prevent
          @click="commenterSelection"
        >+ Commentaire</button>
      </div>
    </div>
    <div v-if="aideOuverte" class="gabarit-aide">
      <p>
        Sélectionnez un passage du texte, puis cliquez sur « + Commentaire » pour y écrire une remarque.
        Cliquez sur un commentaire de la liste pour retrouver son passage dans le texte.
        Pour le modifier, cliquez sur sa carte en marge du texte.
      </p>
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
    <p v-if="hintCommentaire" class="gabarit-indication">{{ hintCommentaire }}</p>
    <p v-if="commentairesFiltres.length === 0" class="gabarit-vide">
      {{ rechercheOuverte && recherche.trim() ? 'Aucun commentaire ne correspond à la recherche.' : 'Aucun commentaire pour le moment.' }}
    </p>
    <ul v-else class="gabarit-liste">
      <li v-for="commentaire in commentairesFiltres" :key="commentaire.id">
        <button
          type="button"
          class="gabarit-ligne aller-commentaire"
          title="Retrouver ce passage dans le texte"
          @click="allerAuCommentaire(commentaire.id)"
        >
          <span class="gabarit-ligne-texte">
            <span class="gabarit-ligne-titre">{{ commentaire.auteur || 'Sans auteur' }}</span>
            <span class="gabarit-ligne-detail texte-commentaire">{{ commentaire.texte }}</span>
          </span>
        </button>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
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
.aller-commentaire:focus-visible {
  outline: 2px solid #1565c0;
  outline-offset: 2px;
}
.texte-commentaire {
  white-space: pre-wrap;
}
</style>
