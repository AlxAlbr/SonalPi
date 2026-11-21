<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { EntretienLocuteursCorpus, LigneRepertoireLocuteurs } from '../../../../shared/corpus/repertoireLocuteurs'

const props = defineProps<{
  selection: LigneRepertoireLocuteurs[]
  entretiens: EntretienLocuteursCorpus[]
  couleurs: Record<string, string>
  incomplet: boolean
}>()
const emit = defineEmits<{ ouvrir: [entretienId: string] }>()
const limite = ref(100)
const tri = ref<'nom' | 'entretiens' | 'mots' | 'interventions'>('mots')
const ascendant = ref(false)
const totalMots = computed(() => props.selection.reduce((n, l) => n + l.mots, 0))
const totalTours = computed(() => props.selection.reduce((n, l) => n + l.interventions, 0))
const cles = computed(() => new Set(props.selection.map((l) => l.cle)))
const parLocuteur = computed(() => props.selection.map((l) => ({ ...l,
  entretiens: new Set(l.participations.map((p) => p.entretienId)).size,
})).sort((a, b) => {
  const comparaison = tri.value === 'nom' ? a.nom.localeCompare(b.nom, 'fr') : a[tri.value] - b[tri.value]
  return (ascendant.value ? comparaison : -comparaison) || a.cle.localeCompare(b.cle)
}))
const parEntretien = computed(() => {
  const ids = new Set(props.selection.flatMap((l) => l.participations.map((p) => p.entretienId)))
  return props.entretiens.filter((e) => ids.has(e.id)).map((e) => {
    const tours = e.tours.filter((t) => t.cle && cles.value.has(t.cle))
    return { id: e.id, titre: e.titre, mots: tours.reduce((n, t) => n + t.mots, 0), tours: tours.length, total: e.mots }
  })
})
const pourcentage = (n: number, total: number) => total > 0 ? n / total * 100 : 0
const formatPourcentage = (n: number, total: number) => `${pourcentage(n, total).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
function trier(colonne: typeof tri.value) {
  if (tri.value === colonne) ascendant.value = !ascendant.value
  else { tri.value = colonne; ascendant.value = colonne === 'nom' }
}
function ordre(colonne: typeof tri.value): 'ascending' | 'descending' | 'none' {
  return tri.value === colonne ? ascendant.value ? 'ascending' : 'descending' : 'none'
}
watch(() => props.selection.map((l) => l.cle).join('\n'), () => { limite.value = 100 })
</script>

<template>
  <section class="statistiques-selection" aria-label="Statistiques de la sélection">
    <h2>Statistiques de la sélection</h2>
    <p><strong>{{ totalMots }} mots · {{ totalTours }} interventions</strong> (tours de parole), pour {{ selection.length }} locuteur{{ selection.length > 1 ? 's' : '' }} dans {{ parEntretien.length }} entretien{{ parEntretien.length > 1 ? 's' : '' }}.</p>
    <p v-if="incomplet" role="status">Bilan incomplet : certains entretiens sont indisponibles.</p>
    <p class="aide-stats">Le bilan porte sur toute la sélection, même masquée par la recherche. Un tour de parole réunit les paragraphes consécutifs attribués au même locuteur.</p>
    <div class="tableau-defilant">
      <table>
        <caption>Comparaison des locuteurs</caption>
        <thead><tr>
          <th :aria-sort="ordre('nom')"><button @click="trier('nom')">Locuteur</button></th>
          <th :aria-sort="ordre('entretiens')"><button @click="trier('entretiens')">Entretiens</button></th>
          <th :aria-sort="ordre('mots')"><button @click="trier('mots')">Mots</button></th>
          <th :aria-sort="ordre('interventions')"><button @click="trier('interventions')">Tours de parole</button></th>
          <th>Part des mots de la sélection</th>
        </tr></thead>
        <tbody><tr v-for="l in parLocuteur.slice(0, limite)" :key="l.cle">
          <th scope="row" :title="l.participations.map((p) => p.entretienTitre).join(', ')"><span class="pastille" :style="{ background: couleurs[l.cle] }"></span>{{ l.nom }}<small>{{ l.participations[0]?.entretienTitre }}</small></th>
          <td>{{ l.entretiens }}</td><td>{{ l.mots }}</td><td>{{ l.interventions }}</td>
          <td>{{ formatPourcentage(l.mots, totalMots) }}<span class="jauge"><span :style="{ width: pourcentage(l.mots, totalMots) + '%', background: couleurs[l.cle] }"></span></span></td>
        </tr></tbody>
      </table>
    </div>
    <div class="tableau-defilant">
      <table>
        <caption>Détail par entretien</caption>
        <thead><tr><th>Entretien</th><th>Mots de la sélection</th><th>Tours de parole</th><th>Part des mots de l’entretien</th></tr></thead>
        <tbody><tr v-for="e in parEntretien.slice(0, limite)" :key="e.id"><th scope="row"><button @click="emit('ouvrir', e.id)">{{ e.titre }}</button></th><td>{{ e.mots }}</td><td>{{ e.tours }}</td><td>{{ formatPourcentage(e.mots, e.total) }}</td></tr></tbody>
      </table>
    </div>
    <p class="aide-stats">La part dans l’entretien inclut tous les mots de sa transcription dans le total, y compris les passages non attribués ou dont le locuteur reste à vérifier. Il ne s’agit pas d’une durée audio.</p>
    <button v-if="selection.length > limite || parEntretien.length > limite" type="button" @click="limite += 100">Afficher les statistiques suivantes</button>
  </section>
</template>

<style scoped>
.statistiques-selection { margin-bottom: .8rem; padding: .8rem; border: 1px solid #dce2ec; border-radius: 6px; font-size: .85rem; }
h2 { margin: 0; font-size: 1rem; }
.aide-stats, small { color: #5d6878; font-size: .78rem; }
small { display: block; font-weight: normal; }
.tableau-defilant { overflow: auto; }
table { width: 100%; border-collapse: collapse; margin: .7rem 0; }
caption { text-align: left; font-weight: 600; padding: .4rem 0; }
th, td { text-align: left; padding: .45rem; border-bottom: 1px solid #e2e6ef; }
thead th { background: #f6f8fc; }
button { cursor: pointer; padding: .3rem; border: 0; background: transparent; color: #254d83; font: inherit; text-align: left; }
button:hover { text-decoration: underline; }
th[aria-sort=ascending] button::after { content: ' ↑'; }
th[aria-sort=descending] button::after { content: ' ↓'; }
button:focus-visible { outline: 2px solid #356ac3; outline-offset: 2px; }
.pastille { display: inline-block; width: .7rem; height: .7rem; border-radius: 50%; margin-right: .3rem; }
.jauge { display: block; height: 4px; background: #edf0f4; margin-top: .3rem; }
.jauge span { display: block; height: 100%; }
</style>
