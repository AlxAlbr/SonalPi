<script setup lang="ts">
import { computed } from 'vue'
import type { Categorie } from '../../../../shared/format'
import type { CelluleAnalyseCroisee, MesureAnalyseCroisee, TotauxAnalyseCroisee } from '../../../../shared/analysesCroisees/types'

const props = defineProps<{
  themes: Categorie[]
  entretiens: Array<{ id: string; titre: string }>
  cellules: CelluleAnalyseCroisee[]
  mesure: MesureAnalyseCroisee
  indisponibles: string[]
  totaux: TotauxAnalyseCroisee
  selection?: { themeId: string; entretienId: string } | null
}>()
const emit = defineEmits<{ selectionner: [cellule: CelluleAnalyseCroisee] }>()

const cellulesParCle = computed(() => new Map(props.cellules.map((item) => [`${item.themeId}\u0000${item.entretienId}`, item])))
const maximum = computed(() => props.mesure === 'couverture'
  ? 100
  : Math.max(0, ...props.cellules.map((item) => item[props.mesure] ?? 0)))
function cellule(themeId: string, entretienId: string) {
  return cellulesParCle.value.get(`${themeId}\u0000${entretienId}`)
}
function valeur(item: CelluleAnalyseCroisee): number | null {
  return item[props.mesure]
}
function formater(valeur: number | null): string {
  if (valeur === null) return 'Indisponible'
  return props.mesure === 'couverture'
    ? `${valeur.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
    : valeur.toLocaleString('fr-FR')
}
function intensite(item: CelluleAnalyseCroisee): string {
  const valeurCourante = valeur(item) ?? 0
  const ratio = maximum.value > 0 ? Math.min(1, valeurCourante / maximum.value) : 0
  return `rgba(31, 111, 181, ${0.05 + ratio * 0.48})`
}
function total(themeId: string): number | null {
  return props.totaux.lignes[themeId]?.[props.mesure] ?? null
}
function nomAccessible(theme: Categorie, entretien: { id: string; titre: string }, item: CelluleAnalyseCroisee): string {
  const mesure = props.mesure === 'passages' ? 'passages' : props.mesure === 'volume' ? 'volume' : 'couverture'
  return `${theme.nom}, ${entretien.titre}, ${mesure} : ${formater(valeur(item))}`
}
</script>

<template>
  <div class="conteneur" tabindex="0" aria-label="Matrice des thèmes et des entretiens">
    <table>
      <thead><tr><th class="coin" scope="col">Thème</th><th v-for="entretien in entretiens" :key="entretien.id" scope="col" :title="entretien.titre">{{ entretien.titre }}</th><th class="total" scope="col">Total</th></tr></thead>
      <tbody>
        <tr v-for="theme in themes" :key="theme.id">
          <th scope="row"><span class="pastille" :style="{ backgroundColor: theme.couleur || '#788596' }"></span>{{ theme.nom }}</th>
          <td v-for="entretien in entretiens" :key="entretien.id">
            <span v-if="indisponibles.includes(entretien.id)" class="indisponible" title="Source indisponible">⚠ Indisponible</span>
            <button
              v-else-if="cellule(theme.id, entretien.id)"
              class="cellule"
              :data-tour="`cellule-analyse-${theme.id}-${entretien.id}`"
              :class="{ selectionnee: selection?.themeId === theme.id && selection?.entretienId === entretien.id }"
              :style="{ backgroundColor: intensite(cellule(theme.id, entretien.id)!) }"
              :aria-pressed="selection?.themeId === theme.id && selection?.entretienId === entretien.id"
              :aria-label="nomAccessible(theme, entretien, cellule(theme.id, entretien.id)!)"
              @click="emit('selectionner', cellule(theme.id, entretien.id)!)"
            >{{ formater(valeur(cellule(theme.id, entretien.id)!)) }}</button>
            <span v-else class="indisponible">—</span>
          </td>
          <td class="total">{{ formater(total(theme.id)) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p class="legende">{{ mesure === 'couverture' ? 'Échelle commune : 0 à 100 %.' : `Échelle commune : 0 à ${maximum.toLocaleString('fr-FR')}.` }} L’intensité complète la valeur numérique.</p>
</template>

<style scoped>
.conteneur { max-width: 100%; max-height: 100%; overflow: auto; border: 1px solid #cfd6e0; border-radius: 6px; }
table { border-collapse: separate; border-spacing: 0; min-width: 100%; font-size: .78rem; }
th, td { min-width: 7rem; padding: 0; border-right: 1px solid #dfe4eb; border-bottom: 1px solid #dfe4eb; text-align: center; }
thead th { position: sticky; top: 0; z-index: 3; height: 4.3rem; padding: .35rem; background: #eef3f9; vertical-align: bottom; overflow-wrap: anywhere; }
tbody th { position: sticky; left: 0; z-index: 2; min-width: 12rem; max-width: 18rem; padding: .55rem; background: #fff; text-align: left; overflow-wrap: anywhere; }
.coin { left: 0; z-index: 4; text-align: left; }
.cellule { width: 100%; min-height: 2.45rem; border: 0; border-radius: 0; font-variant-numeric: tabular-nums; color: #122235; }
.cellule:focus-visible { position: relative; z-index: 1; outline: 3px solid #d16b00; outline-offset: -3px; }.cellule.selectionnee { box-shadow: inset 0 0 0 3px #d16b00; font-weight: 700; }
.pastille { display: inline-block; width: .72rem; height: .72rem; margin-right: .42rem; border: 1px solid rgba(0, 0, 0, .25); border-radius: 50%; }
.total { min-width: 6.5rem; padding: .4rem; background: #f5f6f8; font-weight: 700; }
.indisponible { display: inline-block; padding: .4rem; color: #79550e; font-size: .7rem; }
.legende { margin: .35rem 0 0; color: #596678; font-size: .72rem; }
</style>
