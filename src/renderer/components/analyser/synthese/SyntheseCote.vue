<script setup lang="ts">
import { computed } from 'vue'
import type { SelectionSynthese } from '../../../../shared/synthese/types'
import { utiliserSonal } from '../../../composables/sonal'

// Panneau gauche de la synthèse : les cinq dimensions de critères.
// Les résultats, le bilan et l'export sont dans SynthesePanneau.vue.
const {
  filtresSynthese, ongletCriteresSynthese, ongletsCriteresSynthese, casDisponiblesSynthese,
  personnesSynthese, membership, variables, codebook, cas,
} = utiliserSonal()

const onglet = computed({
  get: () => ongletCriteresSynthese.value,
  set: (valeur) => { ongletCriteresSynthese.value = valeur },
})

const libellesOnglets = {
  entretiens: 'Entretiens',
  variables: 'Variables',
  personnes: 'Personnes',
  themes: 'Thèmes',
  cas: 'Cas',
} as const

function nombreSelectionsOnglet(cle: keyof typeof libellesOnglets): number {
  if (cle === 'entretiens' && filtresSynthese.value.entretiens.mode === 'sans-restriction') {
    return Object.keys(membership.value).length
  }
  if (cle === 'variables') return Object.keys(filtresSynthese.value.variables).length
  if (cle === 'personnes') {
    const filtre = filtresSynthese.value.personnes
    return (filtre.selection.mode === 'choix' ? filtre.selection.ids.length : 0)
      + Number(filtre.sansPersonne) + Number(filtre.sansLocuteur)
  }
  const selection = filtresSynthese.value[cle]
  return selection.mode === 'choix' ? selection.ids.length : 0
}

function ongletFiltreActif(cle: keyof typeof libellesOnglets): boolean {
  if (cle === 'entretiens') return filtresSynthese.value.entretiens.mode === 'choix'
  return nombreSelectionsOnglet(cle) > 0
}

function idsDimension(cle: 'entretiens' | 'themes' | 'cas'): string[] {
  if (cle === 'entretiens') return Object.keys(membership.value)
  if (cle === 'themes') return codebook.value.map((item) => item.id)
  return Object.keys(cas.value)
}

function choix(cle: 'entretiens' | 'themes' | 'cas', id: string) {
  const courant = filtresSynthese.value[cle]
  const ids = courant.mode === 'choix' ? courant.ids : cle === 'entretiens' ? idsDimension(cle) : []
  const nouveauxIds = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
  filtresSynthese.value = {
    ...filtresSynthese.value,
    [cle]: cle === 'entretiens' || nouveauxIds.length
      ? { mode: 'choix', ids: nouveauxIds }
      : { mode: 'sans-restriction' },
  }
}

function toutSelectionner(cle: 'entretiens' | 'themes' | 'cas') {
  filtresSynthese.value = { ...filtresSynthese.value, [cle]: { mode: 'choix', ids: idsDimension(cle) } }
}

function toutDeselectionner(cle: 'entretiens' | 'themes' | 'cas') {
  filtresSynthese.value = {
    ...filtresSynthese.value,
    [cle]: cle === 'entretiens' ? { mode: 'choix', ids: [] } : { mode: 'sans-restriction' },
  }
}

function coche(selection: SelectionSynthese, id: string) {
  return selection.mode === 'choix' && selection.ids.includes(id)
}

function entretienCoche(id: string) {
  const selection = filtresSynthese.value.entretiens
  return selection.mode === 'sans-restriction' || selection.ids.includes(id)
}

function personne(id: string) {
  const actuel = filtresSynthese.value.personnes
  const ids = actuel.selection.mode === 'choix' ? actuel.selection.ids : []
  const nouveauxIds = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
  const sansChoixSpecial = !actuel.sansPersonne && !actuel.sansLocuteur
  filtresSynthese.value = {
    ...filtresSynthese.value,
    personnes: {
      ...actuel,
      selection: nouveauxIds.length || !sansChoixSpecial
        ? { mode: 'choix', ids: nouveauxIds }
        : { mode: 'sans-restriction' },
    },
  }
}

function personneSpeciale(cle: 'sansPersonne' | 'sansLocuteur') {
  const actuel = filtresSynthese.value.personnes
  const nouvelleValeur = !actuel[cle]
  const autreCle = cle === 'sansPersonne' ? 'sansLocuteur' : 'sansPersonne'
  const ids = actuel.selection.mode === 'choix' ? actuel.selection.ids : []
  filtresSynthese.value = { ...filtresSynthese.value, personnes: {
    ...actuel,
    selection: ids.length || nouvelleValeur || actuel[autreCle]
      ? { mode: 'choix', ids }
      : { mode: 'sans-restriction' },
    [cle]: nouvelleValeur,
  } }
}

function variableCochee(variableId: string, modaliteId: string) {
  return filtresSynthese.value.variables[variableId]?.modaliteIds.includes(modaliteId) === true
}

function modalite(variableId: string, modaliteId: string) {
  const variable = variables.value.find((item) => item.id === variableId)
  if (!variable) return
  const filtres = { ...filtresSynthese.value.variables }
  const actuel = filtres[variableId] ?? { portee: variable.portee, modaliteIds: [], nonRenseigne: false }
  const modaliteIds = actuel.modaliteIds.includes(modaliteId)
    ? actuel.modaliteIds.filter((item) => item !== modaliteId)
    : [...actuel.modaliteIds, modaliteId]
  if (!modaliteIds.length && !actuel.nonRenseigne) delete filtres[variableId]
  else filtres[variableId] = { ...actuel, modaliteIds }
  filtresSynthese.value = { ...filtresSynthese.value, variables: filtres }
}

function nonRenseigne(variableId: string) {
  const variable = variables.value.find((item) => item.id === variableId)
  if (!variable) return
  const filtres = { ...filtresSynthese.value.variables }
  const actuel = filtres[variableId] ?? { portee: variable.portee, modaliteIds: [], nonRenseigne: false }
  if (actuel.nonRenseigne && !actuel.modaliteIds.length) delete filtres[variableId]
  else filtres[variableId] = { ...actuel, nonRenseigne: !actuel.nonRenseigne }
  filtresSynthese.value = { ...filtresSynthese.value, variables: filtres }
}
</script>

<template>
  <div class="criteres cote-synthese" aria-label="Critères de synthèse">
    <nav class="onglets" role="tablist" aria-label="Dimensions de sélection">
      <button
        v-for="item in ongletsCriteresSynthese"
        :key="item"
        role="tab"
        :data-tour="`onglet-${item}-synthese`"
        :aria-selected="onglet === item"
        :class="{ actif: onglet === item }"
        @click="onglet = item"
      >
        <span>{{ libellesOnglets[item] }}</span>
        <strong class="badge" :class="{ applique: ongletFiltreActif(item) }">{{ nombreSelectionsOnglet(item) }}</strong>
      </button>
    </nav>

    <div class="combinaison">
      <strong>Comment les choix se combinent</strong>
      <span>Dans une liste, un passage peut correspondre à l’un ou l’autre des choix. Entre plusieurs onglets, il doit répondre à tous les critères.</span>
    </div>

    <label class="role">
      <input
        type="checkbox"
        :checked="filtresSynthese.inclureEnqueteurs"
        @change="filtresSynthese = { ...filtresSynthese, inclureEnqueteurs: !filtresSynthese.inclureEnqueteurs }"
      >
      Inclure les paroles des enquêteurs
    </label>

    <section v-if="onglet === 'entretiens'" role="tabpanel">
      <h3>Entretiens</h3>
      <p class="etat-selection" :class="{ applique: ongletFiltreActif('entretiens') }">{{ nombreSelectionsOnglet('entretiens') }} entretien(s) sélectionné(s) sur {{ Object.keys(membership).length }}.</p>
      <div class="actions-liste"><button data-tour="tous-entretiens-synthese" @click="toutSelectionner('entretiens')">Tout sélectionner</button><button @click="toutDeselectionner('entretiens')">Tout désélectionner</button></div>
      <label v-for="(item, id) in membership" :key="id" class="choix"><input type="checkbox" :checked="entretienCoche(id)" @change="choix('entretiens', id)"> {{ item.titre }}</label>
    </section>

    <section v-if="onglet === 'themes'" role="tabpanel">
      <h3>Thèmes</h3>
      <p class="etat-selection" :class="{ applique: ongletFiltreActif('themes') }">{{ nombreSelectionsOnglet('themes') ? `${nombreSelectionsOnglet('themes')} thème(s) sélectionné(s).` : 'Aucun thème sélectionné.' }}</p>
      <fieldset class="correspondance-themes">
        <legend>Correspondance des thèmes</legend>
        <label class="choix"><input v-model="filtresSynthese.correspondanceThemes" type="radio" value="au-moins-un"> Au moins un thème sélectionné</label>
        <label class="choix"><input v-model="filtresSynthese.correspondanceThemes" type="radio" value="tous-au-meme-endroit"> Tous les thèmes sélectionnés au même endroit</label>
      </fieldset>
      <p class="discret">{{ casDisponiblesSynthese ? 'Au moins un thème ou un cas doit être choisi pour calculer la synthèse.' : 'Choisissez au moins un thème pour calculer la synthèse.' }}</p>
      <div class="actions-liste"><button @click="toutSelectionner('themes')">Tout sélectionner</button><button data-tour="vider-themes-synthese" @click="toutDeselectionner('themes')">Tout désélectionner</button></div>
      <label v-for="item in codebook" :key="item.id" class="choix" :data-tour="`theme-synthese-${item.id}`"><input type="checkbox" :checked="coche(filtresSynthese.themes, item.id)" @change="choix('themes', item.id)"> {{ item.nom }}</label>
    </section>

    <section v-if="onglet === 'cas'" role="tabpanel">
      <h3>Cas</h3>
      <p class="etat-selection" :class="{ applique: ongletFiltreActif('cas') }">{{ nombreSelectionsOnglet('cas') ? `${nombreSelectionsOnglet('cas')} cas sélectionné(s).` : 'Aucun cas sélectionné.' }}</p>
      <div class="actions-liste"><button @click="toutSelectionner('cas')">Tout sélectionner</button><button @click="toutDeselectionner('cas')">Tout désélectionner</button></div>
      <label v-for="item in Object.values(cas)" :key="item.id" class="choix"><input type="checkbox" :checked="coche(filtresSynthese.cas, item.id)" @change="choix('cas', item.id)"> {{ item.nom }}</label>
    </section>

    <section v-if="onglet === 'personnes'" role="tabpanel">
      <h3>Personnes</h3>
      <p class="etat-selection" :class="{ applique: ongletFiltreActif('personnes') }">{{ nombreSelectionsOnglet('personnes') ? `${nombreSelectionsOnglet('personnes')} choix de personne appliqué(s).` : 'Aucun filtre de personne.' }}</p>
      <div v-if="nombreSelectionsOnglet('personnes')" class="actions-liste"><button @click="filtresSynthese = { ...filtresSynthese, personnes: { selection: { mode: 'sans-restriction' }, sansPersonne: false, sansLocuteur: false } }">Effacer la sélection</button></div>
      <label v-for="item in personnesSynthese" :key="item.id" class="choix"><input type="checkbox" :checked="coche(filtresSynthese.personnes.selection, item.id)" @change="personne(item.id)"> {{ item.nom }}</label>
      <hr>
      <label class="choix"><input type="checkbox" :checked="filtresSynthese.personnes.sansPersonne" @change="personneSpeciale('sansPersonne')"> Locuteurs sans personne associée</label>
      <label class="choix"><input type="checkbox" :checked="filtresSynthese.personnes.sansLocuteur" @change="personneSpeciale('sansLocuteur')"> Passages sans locuteur</label>
    </section>

    <section v-if="onglet === 'variables'" role="tabpanel">
      <h3>Variables</h3>
      <p class="etat-selection" :class="{ applique: ongletFiltreActif('variables') }">{{ nombreSelectionsOnglet('variables') ? `${nombreSelectionsOnglet('variables')} critère(s) de variable appliqué(s).` : 'Aucun filtre de variable.' }}</p>
      <div v-if="nombreSelectionsOnglet('variables')" class="actions-liste"><button @click="filtresSynthese = { ...filtresSynthese, variables: {} }">Effacer la sélection</button></div>
      <article v-for="variable in variables" :key="variable.id" class="variable">
        <strong>{{ variable.lib }}</strong><small>{{ variable.portee === 'entretien' ? 'Entretien' : 'Locuteur' }}</small>
        <label v-for="item in variable.modalites" :key="item.id"><input type="checkbox" :checked="variableCochee(variable.id, item.id)" @change="modalite(variable.id, item.id)"> {{ item.lib }}</label>
        <label><input type="checkbox" :checked="filtresSynthese.variables[variable.id]?.nonRenseigne === true" @change="nonRenseigne(variable.id)"> Non renseigné</label>
      </article>
    </section>
  </div>
</template>

<style scoped>
.criteres { min-width: 0; }
h3 { margin: 0; font-size: 0.95rem; }
.onglets { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; padding: 0.15rem 0.15rem 0.45rem; gap: 0.25rem; background: #fff; border-bottom: 1px solid #d8dbe3; }
.onglets button { flex: 1 1 30%; padding: 0.42rem 0.25rem; }
.onglets button.actif { color: #124d8b; font-weight: 700; background: #e7f0fc; border-color: #3976b8; box-shadow: inset 0 -2px #3976b8; }
.badge { display: block; margin-top: 0.15rem; font-size: 0.63rem; color: #4f5968; background: #e9ecf1; border-radius: 8px; padding: 0.05rem 0.3rem; }
.badge.applique { color: #6b4100; background: #ffedb3; font-weight: 700; }
.combinaison { display: flex; flex-direction: column; gap: 0.18rem; margin: 0.65rem 0.25rem; padding: 0.55rem; border: 1px solid #c9d7ea; border-radius: 5px; background: #f2f7fd; font-size: 0.76rem; line-height: 1.35; }
section, .role { margin: 0.65rem 0.25rem; }
section, .variable { display: grid; gap: 0.42rem; }
label { font-size: 0.84rem; }
.role { display: block; padding: 0.45rem; background: #f2f5fa; }
.actions-liste { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.1rem 0; }
.actions-liste button { font-size: 0.68rem; padding: 0.25rem 0.4rem; }
.choix { display: flex; align-items: flex-start; gap: 0.3rem; padding: 0.28rem 0.3rem; }
.choix:hover { background: #f3f6fb; }
.choix input { margin-top: 0.15rem; }
.discret { color: #657083; font-size: 0.8rem; }
.etat-selection { margin: 0.1rem 0; padding: 0.45rem 0.55rem; border-left: 3px solid #8b96a6; background: #f1f3f6; color: #4d5663; font-size: 0.76rem; line-height: 1.35; }
.etat-selection.applique { border-left-color: #c18408; background: #fff5d6; color: #5d4105; }
.correspondance-themes { margin: 0.15rem 0; padding: 0.45rem; border: 1px solid #c9d7ea; border-radius: 5px; }
.correspondance-themes legend { padding: 0 0.25rem; color: #465166; font-size: 0.76rem; font-weight: 700; }
.variable { padding: 0.6rem 0; border-top: 1px solid #e2e5eb; }
.variable small { color: #657083; }
</style>
