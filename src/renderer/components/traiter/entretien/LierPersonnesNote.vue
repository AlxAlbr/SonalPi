<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

const props = defineProps<{
  locuteurs: { id?: string; nom: string }[]
  modelValue?: string[]
}>()
const emit = defineEmits<{ 'update:modelValue': [ids: string[]] }>()
const personnes = computed(() => props.locuteurs.filter(
  (personne): personne is { id: string; nom: string } => !!personne.id,
))
const position = ref<{ left: number; top: number } | null>(null)
const bouton = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)

async function ouvrir() {
  const rect = bouton.value!.getBoundingClientRect()
  position.value = { left: rect.left, top: rect.bottom + 4 }
  await nextTick()
  if (menu.value) {
    const taille = menu.value.getBoundingClientRect()
    position.value = {
      left: Math.max(8, Math.min(rect.left, window.innerWidth - taille.width - 8)),
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - taille.height - 8)),
    }
    menu.value.focus()
  }
}
function fermer() {
  position.value = null
  bouton.value?.focus()
}
function choisir(id: string, selectionne: boolean) {
  const ids = props.modelValue ?? []
  emit('update:modelValue', selectionne ? [...new Set([...ids, id])] : ids.filter((valeur) => valeur !== id))
}
function surTouche(event: KeyboardEvent) {
  if (position.value && event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    fermer()
  }
}
window.addEventListener('keydown', surTouche, true)
onBeforeUnmount(() => window.removeEventListener('keydown', surTouche, true))
</script>

<template>
  <button ref="bouton" type="button" class="mini" aria-haspopup="dialog"
    :aria-expanded="!!position" title="Associer cette note à une ou plusieurs personnes"
    @click="ouvrir">🔗 Lier à une personne</button>
  <Teleport to="body">
    <div v-if="position" class="menu-personnes-couche" @mousedown.self.prevent="fermer"
      @contextmenu.self.prevent="fermer">
      <div ref="menu" class="menu-personnes-note" role="dialog" aria-label="Lier à une personne"
        tabindex="-1" :style="{ left: position.left + 'px', top: position.top + 'px' }">
        <span class="menu-titre">Lier cette note…</span>
        <label v-for="personne in personnes" :key="personne.id" class="menu-action">
          <input type="checkbox" :checked="modelValue?.includes(personne.id) ?? false"
            @change="choisir(personne.id, ($event.target as HTMLInputElement).checked)" />
          {{ personne.nom || 'Locuteur sans nom' }}
        </label>
        <span v-if="!personnes.length" class="menu-vide">Aucun locuteur dans cet entretien.</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.menu-personnes-couche {
  position: fixed;
  inset: 0;
  z-index: 1001;
}
.menu-personnes-note {
  position: fixed;
  min-width: min(15rem, calc(100vw - 2rem));
  max-width: min(22rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
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
}
.menu-action {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: #333;
  padding: 0.35rem 0.45rem;
  border-radius: 5px;
  cursor: pointer;
}
.menu-action:hover, .menu-action:focus-within {
  background: #eef4ff;
  color: #1565c0;
}
.menu-vide {
  font-size: 0.8rem;
  color: #999;
  padding: 0.35rem 0.45rem;
}
</style>
