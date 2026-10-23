<script setup lang="ts">
import type { CelluleAnalyseCroisee } from '../../../shared/analysesCroisees/types'
import type { PassageDetailAnalyseCroisee } from '../../editor/analysesCroisees'

const props = defineProps<{
  cellule: CelluleAnalyseCroisee
  theme: string
  entretien: string
  passages: PassageDetailAnalyseCroisee[]
  perime: boolean
}>()
const emit = defineEmits<{
  fermer: []
  ouvrir: [entretienId: string, from: number]
  synthese: []
}>()
</script>

<template>
  <aside class="detail" aria-label="Justificatifs de la cellule">
    <header><div><h3>{{ theme }}</h3><strong>{{ entretien }}</strong></div><button aria-label="Fermer le détail" @click="emit('fermer')">✕</button></header>
    <p class="mesures"><strong>{{ cellule.passages }}</strong> passage(s) · <strong>{{ cellule.volume.toLocaleString('fr-FR') }}</strong> caractères source · <strong>{{ cellule.couverture === null ? 'Indisponible' : `${cellule.couverture.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` }}</strong></p>
    <p v-if="!passages.length" class="vide">Aucun passage ne contribue à cette cellule.</p>
    <ol v-else>
      <li v-for="passage in passages" :key="passage.id">
        <small>{{ passage.locuteurs.join(', ') || 'Sans locuteur' }}</small>
        <p>{{ passage.texte }}</p>
        <details v-if="passage.avant || passage.apres"><summary>Afficher le contexte</summary><p class="contexte"><span>{{ passage.avant }}</span> <mark>{{ passage.texte }}</mark> <span>{{ passage.apres }}</span></p></details>
        <details><summary>{{ passage.annotationIds.length }} annotation(s) contributrice(s)</summary><ul><li v-for="id in passage.annotationIds" :key="id">{{ id }}</li></ul></details>
        <button :disabled="perime" @click="emit('ouvrir', cellule.entretienId, passage.from)">Ouvrir dans l’entretien</button>
      </li>
    </ol>
    <div class="actions"><button :disabled="perime" @click="emit('synthese')">Afficher dans Synthèse</button></div>
  </aside>
</template>

<style scoped>
.detail { width: min(31rem, 38vw); min-width: 19rem; overflow: auto; border-left: 1px solid #cdd5e1; background: #f8fafd; padding: .8rem; }
header { display: flex; justify-content: space-between; gap: .6rem; } h3 { margin: 0 0 .2rem; }
.mesures { padding: .55rem; background: #eaf2fb; border-radius: 5px; font-size: .8rem; }
ol { padding-left: 1.3rem; } li { margin-bottom: .8rem; padding: .55rem; background: white; border: 1px solid #d8dee8; border-radius: 5px; }
li p { white-space: pre-wrap; } small, .contexte { color: #5e6978; }.contexte mark { background: #ffe49a; }.vide { color: #667080; }
.actions { position: sticky; bottom: 0; padding-top: .6rem; background: #f8fafd; }
@media (max-width: 900px) { .detail { width: auto; min-width: 0; border-left: 0; border-top: 1px solid #cdd5e1; } }
</style>
