<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  ApercuOperationTheme,
  DetailCodageOperationTheme,
  DetailsOperationTheme,
  NouvelleDestinationTheme,
  ReferenceCodage,
} from '../../../shared/corpus/themes'
import { cleCodageTheme } from '../../composables/corpus/useOperationsThemesCorpus'

const props = defineProps<{
  apercu: ApercuOperationTheme
  destinations: NouvelleDestinationTheme[]
  details: Map<string, DetailsOperationTheme>
  choix: Map<string, string>
  chargements: Set<string>
  disabled: boolean
}>()
const emit = defineEmits<{
  charger: [entretienId: string]
  attribuer: [codage: ReferenceCodage, destination: string | null]
  toutAttribuer: [entretienId: string, destination: string]
  consulter: [entretienId: string]
}>()
const deplie = ref<string | null>(null)
const selection = ref<string | null>(null)
const tousVers = ref('')
const entretiens = computed(() => props.apercu.parEntretien.filter((e) => e.passages > 0))
const codages = computed(() => deplie.value ? props.details.get(deplie.value)?.codages ?? [] : [])
watch(() => props.apercu.operationId, () => { deplie.value = null; selection.value = null })

function basculer(id: string): void {
  if (props.disabled) return
  deplie.value = deplie.value === id ? null : id
  selection.value = null
  if (deplie.value) emit('charger', id)
}
function selectionner(codage: DetailCodageOperationTheme): void {
  selection.value = cleCodageTheme(codage.codage)
}
function raccourci(event: KeyboardEvent): void {
  if (props.disabled || !selection.value || event.ctrlKey || event.metaKey || event.altKey) return
  const cible = event.target as HTMLElement
  if (cible.tagName === 'SELECT' || cible.tagName === 'TEXTAREA'
    || (cible instanceof HTMLInputElement && cible.type !== 'radio')) return
  const index = Number(event.key) - 1
  if (!/^[1-4]$/.test(event.key) || !props.destinations[index]) return
  const ligne = codages.value.find((c) => cleCodageTheme(c.codage) === selection.value)
  if (!ligne) return
  event.preventDefault()
  emit('attribuer', ligne.codage, props.destinations[index].token)
}
function tout(): void {
  if (!props.disabled && deplie.value && tousVers.value) emit('toutAttribuer', deplie.value, tousVers.value)
}
</script>

<template>
  <section class="repartition-theme" aria-label="Répartition des codages" @keydown="raccourci">
    <p class="aide">Dépliez un entretien, puis attribuez chaque codage à une destination. Sur la ligne sélectionnée, les touches 1 à 4 choisissent une destination.</p>
    <p v-if="!entretiens.length">Aucun codage à répartir.</p>
    <article v-for="entretien in entretiens" :key="entretien.id" class="entretien-repartition">
      <button class="entete" :aria-expanded="deplie === entretien.id" :disabled="disabled" @click="basculer(entretien.id)">
        <span>{{ deplie === entretien.id ? '▾' : '▸' }} {{ entretien.titre }}</span>
        <span>{{ entretien.passages }} codage(s) · {{ entretien.orphelins }} orphelin(s)</span>
      </button>
      <div v-if="deplie === entretien.id" class="detail-repartition">
        <p v-if="chargements.has(entretien.id)" role="status">Chargement des passages…</p>
        <div v-else-if="!details.has(entretien.id)">
          <p>Les détails n’ont pas pu être chargés.</p>
          <button :disabled="disabled" @click="emit('charger', entretien.id)">Réessayer</button>
        </div>
        <template v-else>
          <button :disabled="disabled" title="Consulter l’entretien impose de recalculer l’aperçu au retour" @click="emit('consulter', entretien.id)">Consulter l’entretien</button>
          <div class="tout-attribuer">
            <label>Tout attribuer à
              <select v-model="tousVers" :disabled="disabled">
                <option value="">Choisir une destination…</option>
                <option v-for="destination in destinations" :key="destination.token" :value="destination.token">{{ destination.nom }}</option>
              </select>
            </label>
            <button :disabled="disabled || !tousVers" @click="tout">Attribuer tout cet entretien</button>
          </div>
          <template v-for="section in ['texte', 'sans-texte']" :key="section">
            <h4>{{ section === 'texte' ? 'Passages avec texte' : 'Passages sans texte (orphelins compris)' }}</h4>
            <div class="table-defilante">
              <table>
                <thead><tr>
                  <th scope="col">Passage</th>
                  <th v-for="(destination, index) in destinations" :key="destination.token" scope="col">{{ index + 1 }}. {{ destination.nom }}</th>
                  <th scope="col">Source</th>
                </tr></thead>
                <tbody>
                  <tr v-for="codage in codages.filter((c) => section === 'texte' ? !!c.extrait : !c.extrait)" :key="cleCodageTheme(codage.codage)"
                    :class="{ selectionnee: selection === cleCodageTheme(codage.codage) }" @click="selectionner(codage)">
                    <td><button class="passage" :aria-pressed="selection === cleCodageTheme(codage.codage)" @focus="selectionner(codage)">
                      <template v-if="codage.extrait"><span class="contexte">{{ codage.avant }}</span><strong>{{ codage.extrait }}</strong><span class="contexte">{{ codage.apres }}</span></template>
                      <template v-else>Sans extrait — {{ codage.orphelin ? 'codage orphelin' : 'plage sans texte' }} ({{ codage.from }}–{{ codage.to }})</template>
                    </button></td>
                    <td v-for="destination in destinations" :key="destination.token">
                      <input type="radio" :name="cleCodageTheme(codage.codage)" :aria-label="`Attribuer ${codage.annotationId} à ${destination.nom}`"
                        :checked="choix.get(cleCodageTheme(codage.codage)) === destination.token" :disabled="disabled"
                        @focus="selectionner(codage)" @change="emit('attribuer', codage.codage, destination.token)" />
                    </td>
                    <td><input type="radio" :name="cleCodageTheme(codage.codage)" :aria-label="`Conserver ${codage.annotationId} sur la source`"
                      :checked="!choix.has(cleCodageTheme(codage.codage))" :disabled="disabled"
                      @focus="selectionner(codage)" @change="emit('attribuer', codage.codage, null)" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </template>
      </div>
    </article>
  </section>
</template>

<style scoped>
.aide { color: #5b6070; font-size: .82rem; }
.entretien-repartition { border: 1px solid #dce2ec; border-radius: 8px; margin-top: .7rem; overflow: hidden; }
.entete { display: flex; justify-content: space-between; gap: 1rem; width: 100%; padding: .8rem; border: 0; background: #f1f5fb; text-align: left; cursor: pointer; font: inherit; }
.entete span:last-child { color: #5b6070; font-size: .8rem; }
.detail-repartition { padding: .8rem; }
.tout-attribuer { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
select, button:not(.entete):not(.passage) { border: 1px solid #bdc9db; border-radius: 5px; padding: .35rem .5rem; background: white; }
h4 { margin: 1rem 0 .4rem; font-size: .85rem; }
.table-defilante { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .82rem; }
th { color: #4c5770; background: #f7f9fc; }
th, td { padding: .5rem; border-bottom: 1px solid #e3e8f0; }
td:not(:first-child) { text-align: center; }
.selectionnee { background: #edf3ff; }
.passage { border: 0; background: transparent; text-align: left; font: inherit; width: 100%; cursor: pointer; white-space: pre-wrap; min-width: 180px; }
.contexte { color: #747a87; }
input[type=radio] { accent-color: #356ac3; width: 1.1rem; height: 1.1rem; cursor: pointer; }
button:disabled, input:disabled { cursor: default; opacity: .55; }
button:focus-visible, input:focus-visible { outline: 2px solid #356ac3; outline-offset: 2px; }
</style>
