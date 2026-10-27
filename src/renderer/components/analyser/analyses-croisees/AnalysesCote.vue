<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'

// Panneau gauche des analyses croisées : thèmes et entretiens à croiser.
// La matrice et le détail sont dans AnalysesPanneau.vue.
const {
  themesAnalyseCroisee, entretiensAnalyseCroisee, ongletSelectionAnalyse,
  membership, codebook,
} = utiliserSonal()

const onglet = computed({
  get: () => ongletSelectionAnalyse.value,
  set: (valeur) => { ongletSelectionAnalyse.value = valeur },
})

function coche(liste: string[], id: string): boolean { return liste.includes(id) }
function basculer(cle: 'themes' | 'entretiens', id: string): void {
  const cible = cle === 'themes' ? themesAnalyseCroisee : entretiensAnalyseCroisee
  cible.value = cible.value.includes(id) ? cible.value.filter((item) => item !== id) : [...cible.value, id]
}
function tous(cle: 'themes' | 'entretiens', valeur: boolean): void {
  if (cle === 'themes') themesAnalyseCroisee.value = valeur ? codebook.value.map((item) => item.id) : []
  else entretiensAnalyseCroisee.value = valeur ? Object.keys(membership.value) : []
}
function profondeur(idTheme: string): number {
  let niveau = 0
  let parent = codebook.value.find((item) => item.id === idTheme)?.parent ?? null
  const visites = new Set<string>()
  while (parent && !visites.has(parent)) {
    visites.add(parent)
    niveau++
    parent = codebook.value.find((item) => item.id === parent)?.parent ?? null
  }
  return niveau
}
</script>

<template>
  <div class="selection-analyse cote-analyses" aria-label="Sélection de l’analyse">
    <nav>
      <button data-tour="onglet-themes-analyse" :class="{ actif: onglet === 'themes' }" @click="onglet = 'themes'">Thèmes <b>{{ themesAnalyseCroisee.length }}</b></button>
      <button data-tour="onglet-entretiens-analyse" :class="{ actif: onglet === 'entretiens' }" @click="onglet = 'entretiens'">Entretiens <b>{{ entretiensAnalyseCroisee.length }}</b></button>
    </nav>
    <section v-if="onglet === 'themes'">
      <h3>Thèmes</h3>
      <div class="actions-liste"><button @click="tous('themes', true)">Tout sélectionner</button><button data-tour="vider-themes-analyse" @click="tous('themes', false)">Tout désélectionner</button></div>
      <label v-for="theme in codebook" :key="theme.id" :data-tour="`theme-analyse-${theme.id}`" class="choix" :style="{ paddingLeft: `${0.35 + profondeur(theme.id) * 0.8}rem` }"><input type="checkbox" :checked="coche(themesAnalyseCroisee, theme.id)" @change="basculer('themes', theme.id)"><span class="pastille" :style="{ backgroundColor: theme.couleur || '#788596' }"></span>{{ theme.nom }}</label>
    </section>
    <section v-else>
      <h3>Entretiens</h3>
      <div class="actions-liste"><button data-tour="tous-entretiens-analyse" @click="tous('entretiens', true)">Tout sélectionner</button><button @click="tous('entretiens', false)">Tout désélectionner</button></div>
      <label v-for="(entretien, id) in membership" :key="id" class="choix"><input type="checkbox" :checked="coche(entretiensAnalyseCroisee, id)" @change="basculer('entretiens', id)">{{ entretien.titre }}</label>
    </section>
  </div>
</template>

<style scoped>
.selection-analyse { min-width: 0; }
nav { position: sticky; top: 0; z-index: 2; display: flex; padding: 0.15rem 0.15rem 0.45rem; gap: 0.3rem; background: #fff; border-bottom: 1px solid #d8dbe3; }
nav button { flex: 1; }
nav .actif { background: #e2eefb; color: #164f88; font-weight: 700; }
section { padding: 0.4rem 0.25rem; }
h3 { margin: 0.25rem 0; font-size: 0.95rem; }
.actions-liste { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.actions-liste button { font-size: 0.68rem; }
.choix { display: flex; align-items: center; gap: 0.35rem; padding: 0.32rem; font-size: 0.82rem; }
.choix:hover { background: #f1f5fa; }
.pastille { width: 0.68rem; height: 0.68rem; flex: none; border: 1px solid rgba(0, 0, 0, 0.25); border-radius: 50%; }
</style>
