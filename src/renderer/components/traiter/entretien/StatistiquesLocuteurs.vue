<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { couleurPourLocuteur } from '../../../../shared/entretien/locuteurs'
import { statistiquesLocuteurs, type StatistiqueLocuteur } from '../../../../shared/entretien/statistiquesLocuteurs'

const { blocsParole, locuteurs, entretien, allerAuTexte, tempsAuTexte, audio } = utiliserSonal()
const bilan = computed(() => statistiquesLocuteurs(blocsParole.value, locuteurs.value, entretien.ancres))
const indices = ref<Record<string, number>>({})
const cle = (loc: number | null) => loc === null ? 'aucun' : String(loc)
watch(() => JSON.stringify(bilan.value.tours.map((tour) => [tour.loc, tour.pos])), () => { indices.value = {} })
const nom = (loc: number | null) => loc === null ? 'Sans locuteur' : locuteurs.value.find((l) => l.index === loc)?.nom ?? 'Sans locuteur'
const couleur = (loc: number | null) => loc === null ? '#8b949e' : locuteurs.value.find((l) => l.index === loc)?.couleur ?? couleurPourLocuteur(loc)
const pourcentage = (valeur: number) => valeur.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
const dureesDisponibles = computed(() => bilan.value.lignes.some((ligne) => ligne.secondes !== null))
const dureesPartielles = computed(() => bilan.value.lignes.some((ligne) => ligne.secondes === null || ligne.dureePartielle))
function duree(ligne: StatistiqueLocuteur): string {
  if (ligne.secondes === null) return '—'
  const secondes = Math.round(ligne.secondes)
  return `${Math.floor(secondes / 60)} min ${String(secondes % 60).padStart(2, '0')} s${ligne.dureePartielle ? ' (partielle)' : ''}`
}
function suivant(ligne: StatistiqueLocuteur) {
  if (!ligne.positions.length) return
  const index = ((indices.value[cle(ligne.loc)] ?? -1) + 1) % ligne.positions.length
  indices.value[cle(ligne.loc)] = index
  const pos = ligne.positions[index]
  allerAuTexte(pos)
  if (audio.url.value && !bilan.value.reperesIncoherents) {
    const temps = tempsAuTexte(pos)
    if (temps !== null) audio.seek(temps)
  }
}
</script>

<template>
  <section id="stats-locuteurs" class="stats-locuteurs" aria-labelledby="titre-stats-locuteurs">
    <h4 id="titre-stats-locuteurs">Statistiques des locuteurs</h4>
    <p v-if="!bilan.lignes.length">Aucune prise de parole à compter.</p>
    <template v-else>
      <p class="total-mots"><strong>Total : {{ bilan.totalMots }} mots</strong>, passages sans locuteur compris.</p>
      <p class="part-enqueteurs">Enquêteurs : {{ bilan.motsEnqueteurs }} mots, soit {{ pourcentage(bilan.pourcentageEnqueteurs) }} % du total.</p>
      <p class="aide-stats">Un tour réunit les paragraphes consécutifs du même locuteur. Les barres indiquent la part des mots transcrits.</p>
      <ul class="liste-stats-loc">
        <li v-for="ligne in bilan.lignes" :key="cle(ligne.loc)" :data-loc="cle(ligne.loc)">
          <div class="entete-stat">
            <strong :style="{ color: couleur(ligne.loc) }">{{ nom(ligne.loc) }}</strong>
            <span class="part-mots">{{ pourcentage(ligne.pourcentage) }} %</span>
          </div>
          <div class="barre-stat" aria-hidden="true"><span :style="{ width: ligne.pourcentage + '%', backgroundColor: couleur(ligne.loc) }"></span></div>
          <div class="chiffres-stat">
            <span>{{ ligne.interventions }} tour(s) · {{ ligne.mots }} mots</span>
            <span class="duree-stat">Durée estimée : {{ duree(ligne) }}</span>
          </div>
          <div class="navigation-stat">
            <button type="button" class="mini" :aria-label="`Prise de parole suivante de ${nom(ligne.loc)}`" @click="suivant(ligne)">🔎 Suivante</button>
            <span class="compteur-tour" aria-live="polite">{{ indices[cle(ligne.loc)] === undefined ? '—' : indices[cle(ligne.loc)] + 1 }} / {{ ligne.interventions }}</span>
          </div>
        </li>
      </ul>
      <p v-if="bilan.reperesIncoherents" class="limite-durees">Les repères temporels sont incohérents : les durées ne sont pas affichées.</p>
      <p v-else-if="!dureesDisponibles" class="limite-durees">Durées indisponibles : il manque des repères temporels utilisables.</p>
      <p v-else class="limite-durees">Les durées sont estimées à partir des repères du texte, sans mesure automatique de la voix. Les silences repérés entre deux passages ne sont pas attribués.<template v-if="dureesPartielles"> Certains passages ne sont pas chronométrés : les durées disponibles sont partielles.</template></p>
    </template>
  </section>
</template>

<style scoped>
.stats-locuteurs { border-top: 1px solid #dce2ea; margin-top: 1rem; padding-top: .65rem; }
h4 { margin: 0 0 .5rem; font-size: .9rem; }
p { font-size: .76rem; line-height: 1.45; margin: .35rem 0; }
.aide-stats, .limite-durees { color: #5c6673; }
.liste-stats-loc { list-style: none; padding: 0; margin: .65rem 0; display: grid; gap: .6rem; }
.liste-stats-loc li { border: 1px solid #e0e5ec; border-radius: 6px; padding: .45rem; font-size: .76rem; }
.entete-stat, .navigation-stat { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
.entete-stat strong { overflow-wrap: anywhere; }
.barre-stat { height: 6px; background: #eef1f5; border-radius: 3px; margin: .4rem 0; overflow: hidden; }
.barre-stat span { display: block; height: 100%; }
.chiffres-stat { display: grid; gap: .2rem; }
.navigation-stat { margin-top: .4rem; }
.compteur-tour { color: #5c6673; font-variant-numeric: tabular-nums; }
</style>
