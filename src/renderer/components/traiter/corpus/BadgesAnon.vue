<script setup lang="ts">
import type { StatutScan } from '../../../../shared/corpus/scanAnon'
defineProps<{ compteurs?: StatutScan; variantes?: Record<string, number>; frais?: boolean }>()
</script>

<template>
  <span class="badges-anon">
    <span v-if="!compteurs" role="status">En attente…</span>
    <template v-else>
      <template v-if="variantes && Object.keys(variantes).length">
        <span v-for="(nb, pseudo) in variantes" :key="pseudo" class="badge anon" :title="`${nb} anonymisée(s) avec ${pseudo}`" :aria-label="`${nb} anonymisée(s) avec ${pseudo}`">{{ nb }}</span>
      </template>
      <span v-else-if="compteurs.anon" class="badge anon" :title="`${compteurs.anon} anonymisée(s)`" :aria-label="`${compteurs.anon} anonymisée(s)`">{{ compteurs.anon }}</span>
      <span v-if="compteurs.exc" class="badge exc" :title="`${compteurs.exc} exception(s) laissée(s) en clair`" :aria-label="`${compteurs.exc} exception(s)`">{{ compteurs.exc }}</span>
      <span v-if="compteurs.non" class="badge non" :title="`${compteurs.non} occurrence(s) à traiter`" :aria-label="`${compteurs.non} occurrence(s) à traiter`">{{ compteurs.non }}</span>
      <span v-if="compteurs.incl" class="incl" :title="`${compteurs.incl} incluse(s), masquée(s) par une décision englobante, hors compteurs traités`" :aria-label="`${compteurs.incl} incluse(s)`">*{{ compteurs.incl }}</span>
      <span v-if="!compteurs.anon && !compteurs.exc && !compteurs.non && !compteurs.incl" title="Aucun usage textuel">—</span>
      <span v-if="frais === false" title="Résultat périmé ou non confirmé" aria-label="Résultat périmé ou non confirmé">⟳</span>
    </template>
  </span>
</template>

<style scoped>
.badges-anon { display: inline-flex; flex-wrap: wrap; gap: .25rem; align-items: center; }
.badge { display: inline-flex; justify-content: center; align-items: center; min-width: 1.3rem; padding: .15rem .25rem; box-sizing: border-box; border-radius: 999px; font-weight: 700; font-size: .75rem; color: white; font-variant-numeric: tabular-nums; }
.anon { background: #087f65; }
.exc { background: #555; }
.non { background: #a95100; }
.incl { color: #666; font-size: .75rem; }
</style>
