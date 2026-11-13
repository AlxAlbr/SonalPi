<script setup lang="ts">
import type { EntreeRecent } from '../../../shared/format'

withDefaults(defineProps<{ recents: EntreeRecent[]; libelle: string; occupe?: boolean; ton?: 'travail' | 'exemple' }>(), { ton: 'travail' })
defineEmits<{
  (e: 'ouvrir', entree: EntreeRecent): void
  (e: 'retirer', entree: EntreeRecent): void
}>()

/** Où vit le corpus, dit en mots simples. */
function lieu(r: EntreeRecent): string {
  if (r.type === 'distant') return r.fournisseur === 'gitlab' ? 'GitLab' : 'Nextcloud'
  return r.exemple ? 'Exemple' : 'Cet ordinateur'
}
</script>

<template>
  <ul class="recents" :class="`ton-${ton}`" :aria-label="libelle">
    <li v-for="r in recents" :key="r.type === 'distant' ? `d-${r.id}` : r.dir">
      <button class="recent" :disabled="occupe" @click="$emit('ouvrir', r)" :title="r.type === 'distant' ? r.url : r.dir" :aria-label="r.nom">
        <span class="recent-icone" aria-hidden="true">
          <svg v-if="r.type === 'distant'" viewBox="0 0 24 24"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z" /></svg>
          <svg v-else-if="r.exemple" viewBox="0 0 24 24"><path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7 15h10" /></svg>
          <svg v-else viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
        </span>
        <span class="recent-texte">
          <span class="recent-nom">{{ r.nom }}</span>
          <span class="recent-dir">{{ r.type === 'distant' ? r.url : r.dir }}</span>
        </span>
      </button>
      <span class="recent-type">{{ lieu(r) }}</span>
      <button
        class="x oubli-recent"
        title="Retirer de la liste (ne supprime rien)"
        :aria-label="`Retirer ${r.nom} de la liste des récents`"
        @click="$emit('retirer', r)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.recents { --teinte: #1c5c33; --fond-icone: #e3f1e7; list-style: none; padding: 0 .5rem; margin: 0; max-height: 26rem; overflow-y: auto; }
.recents.ton-exemple { --teinte: #175d9e; --fond-icone: #e3eef9; }
li { display: flex; align-items: center; gap: .5rem; border-bottom: 1px solid #edf1f5; }
li:last-child { border-bottom: 0; }
.recent { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: .75rem; min-height: 3.5rem; padding: .4rem .5rem; border: 0; border-radius: 8px; background: transparent; text-align: left; cursor: pointer; font: inherit; }
.recent:hover { background: #f3f6fa; }
.recent:hover .recent-nom { text-decoration: underline; }
.recent:disabled { cursor: progress; opacity: .6; }
.recent-icone { flex: none; display: flex; align-items: center; justify-content: center; width: 2.25rem; height: 2.25rem; border-radius: 8px; background: var(--fond-icone); color: var(--teinte); }
svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.recent-texte { min-width: 0; display: flex; flex-direction: column; gap: .1rem; }
.recent-nom { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--teinte); font-size: .875rem; font-weight: 600; }
.recent-dir { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #5a6b7d; font-size: .75rem; }
.recent-type { flex: none; font-size: .75rem; font-weight: 500; padding: .2rem .5rem; border-radius: 6px; background: #f1f4f8; color: #44566a; }
.oubli-recent { flex: none; display: flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; margin: 0; border-radius: 8px; color: #5a6b7d; }
.oubli-recent svg { width: 16px; height: 16px; }
.oubli-recent:hover { color: #a82e36; background: #fff0f0; }
button:focus-visible { outline: 3px solid #a55b00; outline-offset: -3px; }
@media (max-width: 520px) {
  .recent-type { display: none; }
}
</style>
