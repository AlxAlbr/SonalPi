<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

/**
 *  Modale d'un commentaire en marge (création ET édition — même fenêtre) :
 *  auteur pré-rempli (dernier signataire mémorisé) + texte. Idiome voile+modale
 *  des autres fenêtres (EditionThemes…) ; l'édition EN PLACE dans la carte est
 *  écartée (contenteditable dans un widget ProseMirror = conflits de focus).
 *  « Supprimer » n'existe qu'en édition.
 */
const props = defineProps<{
  /** null = création ; sinon id du commentaire édité. */
  id: string | null
  auteurInitial: string
  texteInitial: string
}>()
const emit = defineEmits<{
  (e: 'valider', auteur: string, texte: string): void
  (e: 'supprimer'): void
  (e: 'fermer'): void
}>()

const auteur = ref(props.auteurInitial)
const texte = ref(props.texteInitial)
const champTexte = ref<HTMLTextAreaElement | null>(null)

// Le contenu est figé à l'ouverture (les props ne changent pas pendant la vie de la modale) ;
// watch défensif si le composant est réutilisé ouvert.
watch(
  () => [props.auteurInitial, props.texteInitial],
  ([a, t]) => {
    auteur.value = a
    texte.value = t
  },
)

function valider() {
  if (!texte.value.trim()) return // pas de commentaire vide
  emit('valider', auteur.value.trim(), texte.value)
}
function surTouche(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('fermer')
  // Ctrl/⌘+Entrée = valider (le texte est multiligne, Entrée doit passer à la ligne).
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) valider()
}
onMounted(() => {
  window.addEventListener('keydown', surTouche)
  champTexte.value?.focus()
})
onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <div class="voile" @click.self="emit('fermer')">
    <div class="modale-commentaire" data-test="modale-commentaire">
      <h3>{{ id ? 'Modifier le commentaire' : 'Nouveau commentaire' }}</h3>
      <label class="champ">
        <span>Auteur</span>
        <input v-model="auteur" type="text" placeholder="Signataire…" data-test="commentaire-auteur" />
      </label>
      <label class="champ">
        <span>Commentaire</span>
        <textarea
          ref="champTexte"
          v-model="texte"
          rows="4"
          placeholder="Votre commentaire…"
          data-test="commentaire-texte"
        ></textarea>
      </label>
      <p class="aide">Ctrl+Entrée pour valider · Échap pour fermer</p>
      <div class="actions">
        <button v-if="id" class="danger" data-test="commentaire-supprimer" @click="emit('supprimer')">
          Supprimer
        </button>
        <button @click="emit('fermer')">Annuler</button>
        <button class="primaire" :disabled="!texte.trim()" data-test="commentaire-valider" @click="valider">
          Valider
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.voile {
  position: fixed;
  inset: 0;
  background: rgba(30, 30, 40, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100; /* au-dessus du menu contextuel */
}
.modale-commentaire {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  padding: 1rem 1.2rem;
  width: min(30rem, 92vw);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
h3 {
  margin: 0;
  font-size: 1rem;
}
.champ {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #555;
}
.champ input,
.champ textarea {
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  font: inherit;
  resize: vertical;
}
.aide {
  margin: 0;
  font-size: 0.75rem;
  color: #999;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.actions button {
  border: 1px solid #bbb;
  background: #fff;
  border-radius: 6px;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
}
.actions button.primaire {
  background: #1565c0;
  border-color: #1565c0;
  color: #fff;
}
.actions button.primaire:disabled {
  opacity: 0.45;
  cursor: default;
}
.actions button.danger {
  color: #b3261e;
  border-color: #d9a19d;
  margin-right: auto; /* Supprimer isolé À GAUCHE des actions sûres */
}
</style>
