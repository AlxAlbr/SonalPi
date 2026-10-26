<script setup lang="ts">
import { computed } from 'vue'
import type { ExtraitSynthese } from '../../../../shared/synthese/types'

const props = defineProps<{
  extraits: ExtraitSynthese[]
  entretiens: Array<{ id: string; titre: string; longueurSource: number | null }>
  afficherSansExtrait: boolean
  selection: string | null
  nomTheme: (id: string) => string
  couleurTheme: (id: string) => string
}>()
const emit = defineEmits<{ selectionner: [extrait: ExtraitSynthese] }>()
const lignes = computed(() => props.entretiens.flatMap((entretien) => {
  const extraits = props.extraits.filter((extrait) => extrait.entretienId === entretien.id)
  if (!props.afficherSansExtrait && !extraits.length) return []
  return [{ ...entretien, extraits }]
}))
function fond(extrait: ExtraitSynthese) {
  const couleurs = extrait.themeIds.map(props.couleurTheme)
  if (couleurs.length < 2) return couleurs[0] ?? '#65758b'
  return `linear-gradient(90deg, ${couleurs.map((item, index) => `${item} ${index * 100 / couleurs.length}% ${(index + 1) * 100 / couleurs.length}%`).join(',')})`
}
</script>

<template>
  <section class="mur" aria-label="Répartition des extraits dans les transcriptions">
    <article v-for="ligne in lignes" :key="ligne.id" class="ligne">
      <header><strong>{{ ligne.titre }}</strong><span>{{ ligne.extraits.length }} extrait(s)</span></header>
      <div v-if="ligne.longueurSource !== null" class="barre" :class="{ vide: !ligne.extraits.length }" title="Progression dans la transcription, et non durée audio">
        <span v-if="!ligne.extraits.length">Aucun extrait pour les critères calculés</span>
        <button
          v-for="(extrait, rang) in ligne.extraits"
          :key="extrait.id"
          class="zone"
          :class="{ selection: extrait.id === selection }"
          :style="{
            left: `${100 * extrait.from / Math.max(1, extrait.longueurSource)}%`,
            width: `${Math.max(0.8, 100 * (extrait.to - extrait.from) / Math.max(1, extrait.longueurSource))}%`,
            background: fond(extrait),
          }"
          :aria-label="`${extrait.titreEntretien}, extrait ${rang + 1}, ${extrait.themeIds.map(nomTheme).join(', ') || 'sans thème'}`"
          :title="`${extrait.from}–${extrait.to} · ${extrait.themeIds.map(nomTheme).join(', ')}`"
          @click="emit('selectionner', extrait)"
        />
      </div>
      <p v-else class="source-indisponible">Source indisponible</p>
    </article>
    <p v-if="!lignes.length" class="message-vide">Aucun extrait ne correspond aux critères calculés.</p>
  </section>
</template>

<style scoped>
.mur { display: grid; gap: .8rem; }
.ligne { border: 1px solid #d9deea; border-radius: 7px; padding: .65rem; }
header { display: flex; justify-content: space-between; gap: 1rem; font-size: .85rem; }
header span { color: #657083; }
.barre { position: relative; height: 2rem; margin-top: .5rem; border-radius: 4px; background: #edf0f5; overflow: hidden; }.barre.vide { display: flex; align-items: center; justify-content: center; color: #687080; font-size: .72rem; background: repeating-linear-gradient(135deg, #f1f3f6, #f1f3f6 8px, #e8ebf0 8px, #e8ebf0 16px); }
.zone { position: absolute; top: .2rem; bottom: .2rem; min-width: 7px; border: 1px solid #6b7280; border-radius: 3px; cursor: pointer; }
.zone:focus-visible, .zone.selection { outline: 3px solid #172554; outline-offset: 1px; z-index: 2; }
.message-vide, .source-indisponible { color: #657083; text-align: center; }.source-indisponible { margin: .5rem 0 0; font-size: .75rem; }
</style>
