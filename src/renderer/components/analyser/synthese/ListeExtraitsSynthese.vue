<script setup lang="ts">
import { nextTick, watch } from 'vue'
import type { ExtraitSynthese } from '../../../../shared/synthese/types'

const props = defineProps<{
  extraits: ExtraitSynthese[]
  selection: string | null
  nomTheme: (id: string) => string
  couleurTheme: (id: string) => string
  navigationPossible: boolean
}>()
const emit = defineEmits<{
  selectionner: [extrait: ExtraitSynthese]
  ouvrir: [extrait: ExtraitSynthese]
}>()
async function copier(extrait: ExtraitSynthese) {
  await navigator.clipboard.writeText(extrait.texte)
}
watch(() => props.selection, async (id) => {
  if (!id) return
  await nextTick()
  document.getElementById(`synthese-${CSS.escape(id)}`)?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <section class="liste" aria-label="Extraits de la synthèse">
    <article
      v-for="(extrait, index) in extraits"
      :id="`synthese-${extrait.id}`"
      :key="extrait.id"
      class="extrait"
      :class="{ selection: extrait.id === selection }"
      @click="emit('selectionner', extrait)"
    >
      <header>
        <strong>{{ extrait.titreEntretien }}</strong>
        <span>{{ extrait.locuteurs.join(', ') || 'Sans locuteur' }} · {{ extrait.from }}–{{ extrait.to }}</span>
      </header>
      <div class="badges"><span v-for="theme in extrait.themeIds" :key="theme" :style="{ '--couleur-theme': couleurTheme(theme) }">{{ nomTheme(theme) }}</span></div>
      <p>{{ extrait.texte }}</p>
      <details><summary>Voir le contexte</summary><p class="contexte">{{ extrait.avant }} <mark>{{ extrait.texte }}</mark> {{ extrait.apres }}</p></details>
      <footer>
        <button @click.stop="copier(extrait)">Copier</button>
        <button :disabled="!navigationPossible" @click.stop="emit('ouvrir', extrait)">Ouvrir dans l’entretien</button>
        <small>Extrait {{ index + 1 }} · {{ extrait.annotationIds.length }} annotation(s)</small>
      </footer>
    </article>
    <p v-if="!extraits.length" class="vide">Aucun extrait ne correspond aux critères calculés.</p>
  </section>
</template>

<style scoped>
.liste { display: grid; gap: .75rem; }
.extrait { border: 1px solid #d9deea; border-radius: 7px; padding: .75rem; cursor: default; }
.extrait.selection { border-color: #3456a4; box-shadow: 0 0 0 2px #cbd8f5; }
header, footer { display: flex; align-items: center; gap: .7rem; justify-content: space-between; }
header span, small { color: #657083; font-size: .78rem; }
.badges { display: flex; gap: .3rem; margin-top: .4rem; }
.badges span { padding: .12rem .4rem; border: 1px solid var(--couleur-theme); border-radius: 10px; background: color-mix(in srgb, var(--couleur-theme) 18%, white); font-size: .75rem; }
.contexte { color: #525b69; }
mark { background: #fff0a8; }
footer { justify-content: flex-start; }
footer small { margin-left: auto; }
.vide { color: #657083; text-align: center; }
</style>
