<script setup lang="ts">
import type { EntreeRecent } from '../../../shared/format'

defineProps<{ recents: EntreeRecent[]; libelle: string }>()
defineEmits<{
  (e: 'ouvrir', entree: EntreeRecent): void
  (e: 'retirer', entree: EntreeRecent): void
}>()
</script>

<template>
  <ul class="recents" :aria-label="libelle">
    <li v-for="r in recents" :key="r.type === 'distant' ? `d-${r.id}` : r.dir">
      <button class="recent" @click="$emit('ouvrir', r)" :title="r.nom" :aria-label="r.nom">
        <span class="recent-tete">
          <span class="recent-nom">{{ r.nom }}</span>
          <span v-if="r.type === 'distant'" class="recent-type">{{ r.fournisseur === 'gitlab' ? 'GitLab' : 'Nextcloud' }}</span>
        </span>
      </button>
      <span class="recent-dir" :title="r.type === 'distant' ? r.url : r.dir">{{ r.type === 'distant' ? r.url : r.dir }}</span>
      <button
        class="x oubli-recent"
        title="Retirer de la liste (ne supprime rien)"
        :aria-label="`Retirer ${r.nom} de la liste des récents`"
        @click="$emit('retirer', r)"
      >✕</button>
    </li>
  </ul>
</template>

<style scoped>
.recents { list-style: none; padding: 0; margin: 0; display: grid; gap: .4rem; max-height: 22rem; overflow-y: auto; }
li { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) auto; align-items: center; gap: .5rem; padding: .25rem 0; border-bottom: 1px solid #e0e7ef; }
li:last-child { border-bottom: 0; }
.recent { min-width: 0; width: 100%; border: 0; border-radius: 3px; background: transparent; padding: .3rem .15rem; text-align: left; cursor: pointer; }
.recent:hover { background: #edf3fa; text-decoration: underline; text-decoration-color: var(--couleur-recent, #175d9e); }
.recent-tete { display: flex; align-items: baseline; gap: .5rem; }
.recent-nom { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--couleur-recent, #175d9e); font-size: .84rem; font-weight: 600; }
.recent-type { margin-left: auto; flex-shrink: 0; font-size: .7rem; color: #52677e; }
.recent-dir { display: block; min-width: 0; color: #687787; font-size: .7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oubli-recent { border: 1px solid transparent; background: transparent; border-radius: 5px; padding: .35rem; cursor: pointer; color: #697582; }
.oubli-recent:hover { color: #a82e36; background: #fff0f0; }
button:focus-visible { outline: 3px solid #a55b00; outline-offset: -3px; }
</style>
