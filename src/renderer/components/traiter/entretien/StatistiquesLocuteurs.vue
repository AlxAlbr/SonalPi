<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { couleurPourLocuteur } from '../../../../shared/entretien/locuteurs'
import { statistiquesLocuteurs, type StatistiqueLocuteur } from '../../../../shared/entretien/statistiquesLocuteurs'

const emit = defineEmits<{ naviguer: [selection: { loc: number | null; pos: number }] }>()
const { blocsParole, locuteurs, entretien, allerAuTexte, tempsAuTexte, audio } = utiliserSonal()
const bilan = computed(() => statistiquesLocuteurs(blocsParole.value, locuteurs.value, entretien.ancres))
const indices = ref<Record<string, number>>({})
const cle = (loc: number | null) => loc === null ? 'aucun' : String(loc)
watch(() => JSON.stringify(bilan.value.tours.map((tour) => [tour.loc, tour.pos])), () => { indices.value = {} })
const nom = (loc: number | null) => loc === null ? 'Sans locuteur' : locuteurs.value.find((l) => l.index === loc)?.nom ?? 'Sans locuteur'
const couleur = (loc: number | null) => loc === null ? '#8b949e' : locuteurs.value.find((l) => l.index === loc)?.couleur ?? couleurPourLocuteur(loc)
const pourcentage = (valeur: number) => valeur.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
const maxMots = computed(() => Math.max(1, ...bilan.value.lignes.map((ligne) => ligne.mots)))
function duree(ligne: StatistiqueLocuteur): string {
  if (ligne.secondes === null) return '—'
  const secondes = Math.round(ligne.secondes)
  return `${Math.floor(secondes / 60)}m${String(secondes % 60).padStart(2, '0')}s${ligne.dureePartielle ? '*' : ''}`
}
function naviguer(ligne: StatistiqueLocuteur, sens: -1 | 1) {
  if (!ligne.positions.length) return
  const courant = indices.value[cle(ligne.loc)] ?? (sens === 1 ? -1 : 0)
  const index = (courant + sens + ligne.positions.length) % ligne.positions.length
  indices.value[cle(ligne.loc)] = index
  const pos = ligne.positions[index]
  emit('naviguer', { loc: ligne.loc, pos })
  allerAuTexte(pos)
  if (audio.url.value && !bilan.value.reperesIncoherents) {
    const temps = tempsAuTexte(pos)
    if (temps !== null) audio.seek(temps)
  }
}
</script>

<template>
  <section id="stats-locuteurs" class="stats-locuteurs" aria-label="Statistiques des locuteurs">
    <p v-if="!bilan.lignes.length">Aucune prise de parole à compter.</p>
    <template v-else>
      <ul class="liste-stats-loc">
        <li v-for="ligne in bilan.lignes" :key="cle(ligne.loc)" :data-loc="cle(ligne.loc)">
          <div class="ligne-stat">
            <div class="info-stat">
              <strong>{{ nom(ligne.loc) }}</strong>
              <span>{{ ligne.interventions }} interv. · {{ ligne.mots }} mots · <span :title="ligne.dureePartielle ? 'Durée estimée partielle à partir des repères du texte' : 'Durée estimée à partir des repères du texte'">{{ duree(ligne) }}</span></span>
            </div>
            <span v-if="indices[cle(ligne.loc)] !== undefined" class="compteur-tour" aria-live="polite">{{ indices[cle(ligne.loc)] + 1 }}/{{ ligne.interventions }}</span>
            <button type="button" class="mini" :aria-label="`Prise de parole précédente de ${nom(ligne.loc)}`" :title="`Prise de parole précédente de ${nom(ligne.loc)}`" @click="naviguer(ligne, -1)">◄</button>
            <button type="button" class="mini" :aria-label="`Prise de parole suivante de ${nom(ligne.loc)}`" :title="`Prise de parole suivante de ${nom(ligne.loc)}`" @click="naviguer(ligne, 1)">►</button>
          </div>
          <div class="barre-stat" aria-hidden="true"><span :style="{ width: ligne.mots / maxMots * 100 + '%', backgroundColor: couleur(ligne.loc) }"></span></div>
        </li>
      </ul>
      <p class="bilan-stat"><strong>Total :</strong> {{ bilan.totalMots }} mots<template v-if="bilan.motsEnqueteurs"> · <strong>Questions :</strong> {{ pourcentage(bilan.pourcentageEnqueteurs) }} %</template></p>
      <p v-if="bilan.reperesIncoherents" class="limite-durees">Durées indisponibles : repères temporels incohérents.</p>
      <p v-else-if="bilan.lignes.some((ligne) => ligne.dureePartielle)" class="limite-durees">* Durée estimée partielle.</p>
    </template>
  </section>
</template>

<style scoped>
.stats-locuteurs { margin-top: 1rem; }
p { font-size: .76rem; line-height: 1.45; margin: .35rem 0; }
.limite-durees { color: #5c6673; }
.liste-stats-loc { list-style: none; padding: 0; margin: .5rem 0; display: grid; gap: .45rem; }
.liste-stats-loc li { font-size: .76rem; }
.ligne-stat { display: flex; align-items: center; gap: .35rem; }
.info-stat { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .1rem; }
.info-stat strong { overflow-wrap: anywhere; }
.info-stat > span { color: #5c6673; }
.barre-stat { height: 6px; background: #eef1f5; border-radius: 3px; margin-top: .25rem; overflow: hidden; }
.barre-stat span { display: block; height: 100%; }
.compteur-tour { color: #5c6673; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bilan-stat { border-top: 1px solid #e0e5ec; padding-top: .5rem; }
</style>
