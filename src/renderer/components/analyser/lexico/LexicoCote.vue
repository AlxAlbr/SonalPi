<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import type { SelectionLexico } from '../../../../shared/lexico/types'

// Panneau gauche de Lexico : filtres et inclusion des enquêteurs.
// Le tableau et les concordances sont dans LexicoPanneau.vue.
const {
  filtresLexico, ongletFiltresLexico, ongletsFiltresLexico,
  personnesLexico, membership, variables, codebook, cas, famillesCas,
} = utiliserSonal()

const onglet = computed({
  get: () => ongletFiltresLexico.value,
  set: (valeur) => { ongletFiltresLexico.value = valeur },
})

const entretiens = computed(() => Object.entries(membership.value)
  .map(([id, reference]) => ({ id, nom: reference.titre }))
  .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id)))
const themes = computed(() => codebook.value.map((theme) => ({
  ...theme,
  profondeur: profondeurTheme(theme.id),
})))
const listeCas = computed(() => Object.values(cas.value)
  .sort((a, b) => (famillesCas.value[a.familleId ?? '']?.nom ?? '').localeCompare(famillesCas.value[b.familleId ?? '']?.nom ?? '', 'fr')
    || a.nom.localeCompare(b.nom, 'fr')))

function profondeurTheme(id: string): number {
  let profondeur = 0
  let parent = codebook.value.find((theme) => theme.id === id)?.parent ?? null
  const vus = new Set<string>()
  while (parent && !vus.has(parent)) {
    vus.add(parent)
    profondeur++
    parent = codebook.value.find((theme) => theme.id === parent)?.parent ?? null
  }
  return profondeur
}

function selectionPour(cle: 'entretiens' | 'themes' | 'cas'): SelectionLexico {
  return filtresLexico.value[cle]
}
function cocheListe(cle: 'entretiens' | 'themes' | 'cas', id: string): boolean {
  const selection = selectionPour(cle)
  return selection.mode === 'choix' && selection.ids.includes(id)
}
function idsUnivers(cle: 'entretiens' | 'themes' | 'cas'): string[] {
  if (cle === 'entretiens') return entretiens.value.map((item) => item.id)
  if (cle === 'themes') return themes.value.map((item) => item.id)
  return listeCas.value.map((item) => item.id)
}
function modifierListe(cle: 'entretiens' | 'themes' | 'cas', id: string) {
  const courant = selectionPour(cle)
  const ids = courant.mode === 'choix' ? [...courant.ids] : []
  const index = ids.indexOf(id)
  if (index >= 0) ids.splice(index, 1)
  else ids.push(id)
  filtresLexico.value = { ...filtresLexico.value, [cle]: { mode: 'choix', ids } }
}
function definirListe(cle: 'entretiens' | 'themes' | 'cas', action: 'retirer' | 'tout' | 'aucun') {
  const selection: SelectionLexico = action === 'retirer'
    ? { mode: 'sans-restriction' }
    : { mode: 'choix', ids: action === 'tout' ? idsUnivers(cle) : [] }
  filtresLexico.value = { ...filtresLexico.value, [cle]: selection }
}
function statutListe(cle: 'entretiens' | 'themes' | 'cas'): string {
  const selection = selectionPour(cle)
  if (selection.mode === 'sans-restriction') return 'Sans restriction'
  return `${selection.ids.length} choisi${selection.ids.length !== 1 ? 's' : ''}`
}

function filtreVariable(id: string) {
  return filtresLexico.value.variables[id]
}
function modaliteCochee(variableId: string, modaliteId: string): boolean {
  return filtreVariable(variableId)?.modaliteIds.includes(modaliteId) ?? false
}
function modifierModalite(variableId: string, modaliteId: string) {
  const variable = variables.value.find((item) => item.id === variableId)
  if (!variable) return
  const courant = filtreVariable(variableId) ?? { portee: variable.portee, modaliteIds: [], nonRenseigne: false }
  const ids = [...courant.modaliteIds]
  const index = ids.indexOf(modaliteId)
  if (index >= 0) ids.splice(index, 1)
  else ids.push(modaliteId)
  filtresLexico.value = {
    ...filtresLexico.value,
    variables: { ...filtresLexico.value.variables, [variableId]: { ...courant, modaliteIds: ids } },
  }
}
function modifierNonRenseigne(variableId: string) {
  const variable = variables.value.find((item) => item.id === variableId)
  if (!variable) return
  const courant = filtreVariable(variableId) ?? { portee: variable.portee, modaliteIds: [], nonRenseigne: false }
  filtresLexico.value = {
    ...filtresLexico.value,
    variables: { ...filtresLexico.value.variables, [variableId]: { ...courant, nonRenseigne: !courant.nonRenseigne } },
  }
}
function retirerVariable(id: string) {
  const copie = { ...filtresLexico.value.variables }
  delete copie[id]
  filtresLexico.value = { ...filtresLexico.value, variables: copie }
}

function personneCochee(id: string): boolean {
  const selection = filtresLexico.value.personnes.selection
  return selection.mode === 'choix' && selection.ids.includes(id)
}
function modifierPersonne(id: string) {
  const personnes = filtresLexico.value.personnes
  const ids = personnes.selection.mode === 'choix' ? [...personnes.selection.ids] : []
  const index = ids.indexOf(id)
  if (index >= 0) ids.splice(index, 1)
  else ids.push(id)
  filtresLexico.value = { ...filtresLexico.value, personnes: { ...personnes, selection: { mode: 'choix', ids } } }
}
function modifierPersonneSpeciale(cle: 'sansPersonne' | 'sansLocuteur') {
  const personnes = filtresLexico.value.personnes
  const selection = personnes.selection.mode === 'choix' ? personnes.selection : { mode: 'choix' as const, ids: [] }
  filtresLexico.value = { ...filtresLexico.value, personnes: { ...personnes, selection, [cle]: !personnes[cle] } }
}
function definirPersonnes(action: 'retirer' | 'tout' | 'aucun') {
  filtresLexico.value = {
    ...filtresLexico.value,
    personnes: action === 'retirer'
      ? { selection: { mode: 'sans-restriction' }, sansPersonne: false, sansLocuteur: false }
      : { selection: { mode: 'choix', ids: action === 'tout' ? personnesLexico.value.map((item) => item.id) : [] }, sansPersonne: false, sansLocuteur: false },
  }
}

function badge(ongletCible: typeof onglet.value): string {
  if (ongletCible === 'variables') {
    const total = Object.keys(filtresLexico.value.variables).length
    return total ? `${total} critère${total !== 1 ? 's' : ''}` : 'Sans restriction'
  }
  if (ongletCible === 'personnes') {
    const filtre = filtresLexico.value.personnes
    if (filtre.selection.mode === 'sans-restriction') return 'Sans restriction'
    const total = filtre.selection.ids.length + Number(filtre.sansPersonne) + Number(filtre.sansLocuteur)
    return `${total} choisi${total !== 1 ? 's' : ''}`
  }
  return statutListe(ongletCible)
}
function filtreApplique(ongletCible: typeof onglet.value): boolean {
  if (ongletCible === 'variables') return Object.keys(filtresLexico.value.variables).length > 0
  if (ongletCible === 'personnes') return filtresLexico.value.personnes.selection.mode === 'choix'
  return selectionPour(ongletCible).mode === 'choix'
}

function basculerEnqueteurs() {
  filtresLexico.value = { ...filtresLexico.value, inclureEnqueteurs: !filtresLexico.value.inclureEnqueteurs }
}
</script>

<template>
  <div class="filtres-lexico cote-lexico" aria-label="Filtres Lexico">
    <div class="onglets" role="tablist" aria-label="Dimensions de sélection">
      <button
        v-for="cible in ongletsFiltresLexico"
        :key="cible"
        role="tab"
        :aria-selected="onglet === cible"
        :class="{ actif: onglet === cible }"
        @click="onglet = cible"
      >
        {{ cible === 'themes' ? 'Thèmes' : cible.charAt(0).toUpperCase() + cible.slice(1) }}
        <span class="badge" :class="{ applique: filtreApplique(cible) }">{{ badge(cible) }}</span>
      </button>
    </div>
    <div class="combinaison">
      <strong>Comment les choix se combinent</strong>
      <span>Dans une liste, un mot peut correspondre à l’un ou l’autre des choix. Entre plusieurs onglets filtrés, il doit répondre à tous les critères à la fois.</span>
      <small>« Sans restriction » signifie que cet onglet ne retire aucun mot.</small>
    </div>
    <div class="option-role"><label><input :checked="filtresLexico.inclureEnqueteurs" type="checkbox" @change="basculerEnqueteurs"> Inclure les paroles des enquêteurs</label></div>

    <section v-if="onglet === 'entretiens'" role="tabpanel">
      <h3>Entretiens</h3>
      <p class="etat-filtre" :class="{ applique: filtresLexico.entretiens.mode === 'choix' }">
        <template v-if="filtresLexico.entretiens.mode === 'sans-restriction'">Sans restriction : les {{ entretiens.length }} entretiens sont inclus. Les cases restent décochées car aucun entretien précis n’est demandé. Les futurs entretiens seront aussi inclus après actualisation.</template>
        <template v-else>{{ filtresLexico.entretiens.ids.length }} entretien(s) choisi(s) sur {{ entretiens.length }}. Ce filtre est appliqué.</template>
      </p>
      <div class="actions-liste"><button @click="definirListe('entretiens', 'retirer')">Retirer ce filtre</button><button @click="definirListe('entretiens', 'tout')">Tout cocher</button><button @click="definirListe('entretiens', 'aucun')">Tout décocher</button></div>
      <label v-for="item in entretiens" :key="item.id" class="choix"><input type="checkbox" :checked="cocheListe('entretiens', item.id)" @change="modifierListe('entretiens', item.id)"> {{ item.nom }}</label>
    </section>

    <section v-else-if="onglet === 'variables'" role="tabpanel">
      <h3>Variables</h3>
      <p class="etat-filtre" :class="{ applique: Object.keys(filtresLexico.variables).length > 0 }">
        <template v-if="Object.keys(filtresLexico.variables).length === 0">Sans restriction : les cases décochées ne retirent aucune occurrence. Cochez une modalité pour créer un filtre.</template>
        <template v-else>{{ Object.keys(filtresLexico.variables).length }} critère(s) de variable appliqué(s).</template>
      </p>
      <p v-if="!variables.length" class="vide">Aucune variable dans ce corpus.</p>
      <article v-for="variable in variables" :key="variable.id" class="groupe-variable">
        <header><strong>{{ variable.lib }}</strong><small>{{ variable.portee === 'locuteur' ? 'Paroles du locuteur' : 'Entretien entier' }}</small><button v-if="filtreVariable(variable.id)" @click="retirerVariable(variable.id)">Retirer ce filtre</button></header>
        <label v-for="modalite in variable.modalites" :key="modalite.id" class="choix"><input type="checkbox" :checked="modaliteCochee(variable.id, modalite.id)" @change="modifierModalite(variable.id, modalite.id)"> {{ modalite.lib }}</label>
        <label class="choix"><input type="checkbox" :checked="filtreVariable(variable.id)?.nonRenseigne ?? false" @change="modifierNonRenseigne(variable.id)"> Non renseigné</label>
      </article>
    </section>

    <section v-else-if="onglet === 'personnes'" role="tabpanel">
      <h3>Personnes</h3>
      <p class="etat-filtre" :class="{ applique: filtresLexico.personnes.selection.mode === 'choix' }">
        <template v-if="filtresLexico.personnes.selection.mode === 'sans-restriction'">Sans restriction : toutes les paroles admissibles sont analysées. Les personnes restent décochées car aucune personne précise n’est demandée.</template>
        <template v-else>{{ filtresLexico.personnes.selection.ids.length + Number(filtresLexico.personnes.sansPersonne) + Number(filtresLexico.personnes.sansLocuteur) }} choix de personne appliqué(s).</template>
      </p>
      <div class="actions-liste"><button @click="definirPersonnes('retirer')">Retirer ce filtre</button><button @click="definirPersonnes('tout')">Tout cocher</button><button @click="definirPersonnes('aucun')">Tout décocher</button></div>
      <label v-for="personne in personnesLexico" :key="personne.id" class="choix"><input type="checkbox" :checked="personneCochee(personne.id)" @change="modifierPersonne(personne.id)"> {{ personne.nom }}</label>
      <hr>
      <label class="choix"><input type="checkbox" :checked="filtresLexico.personnes.sansPersonne" @change="modifierPersonneSpeciale('sansPersonne')"> Locuteurs sans personne associée</label>
      <label class="choix"><input type="checkbox" :checked="filtresLexico.personnes.sansLocuteur" @change="modifierPersonneSpeciale('sansLocuteur')"> Passages sans locuteur</label>
    </section>

    <section v-else-if="onglet === 'themes'" role="tabpanel">
      <h3>Thèmes</h3>
      <p class="etat-filtre" :class="{ applique: filtresLexico.themes.mode === 'choix' }">
        <template v-if="filtresLexico.themes.mode === 'sans-restriction'">Sans restriction : les passages sont analysés avec ou sans thème. Cochez un thème pour limiter l’analyse à ses passages.</template>
        <template v-else>{{ filtresLexico.themes.ids.length }} thème(s) choisi(s). Ce filtre est appliqué.</template>
      </p>
      <div class="actions-liste"><button @click="definirListe('themes', 'retirer')">Retirer ce filtre</button><button @click="definirListe('themes', 'tout')">Tout cocher</button><button @click="definirListe('themes', 'aucun')">Tout décocher</button></div>
      <label v-for="theme in themes" :key="theme.id" class="choix" :style="{ paddingLeft: `${theme.profondeur * 1.1 + 0.3}rem` }"><input type="checkbox" :checked="cocheListe('themes', theme.id)" @change="modifierListe('themes', theme.id)"> {{ theme.nom }}</label>
    </section>

    <section v-else-if="onglet === 'cas'" role="tabpanel">
      <h3>Cas</h3>
      <p class="etat-filtre" :class="{ applique: filtresLexico.cas.mode === 'choix' }">
        <template v-if="filtresLexico.cas.mode === 'sans-restriction'">Sans restriction : les passages sont analysés qu’ils appartiennent ou non à un cas. Cochez un cas pour limiter l’analyse à ses matériaux.</template>
        <template v-else>{{ filtresLexico.cas.ids.length }} cas choisi(s). Ce filtre est appliqué.</template>
      </p>
      <p class="aide">Les matériaux existants des cas sont utilisés, règles et ajouts manuels compris. Cette option n’ajoute aucun passage absent d’un cas.</p>
      <div class="actions-liste"><button @click="definirListe('cas', 'retirer')">Retirer ce filtre</button><button @click="definirListe('cas', 'tout')">Tout cocher</button><button @click="definirListe('cas', 'aucun')">Tout décocher</button></div>
      <label v-for="item in listeCas" :key="item.id" class="choix"><input type="checkbox" :checked="cocheListe('cas', item.id)" @change="modifierListe('cas', item.id)"> <span><small v-if="item.familleId">{{ famillesCas[item.familleId]?.nom }} · </small>{{ item.nom }}</span></label>
    </section>
  </div>
</template>

<style scoped>
.filtres-lexico { min-width: 0; }
h3 { margin: 0; font-size: 0.95rem; }
.onglets { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; padding: 0.15rem 0.15rem 0.45rem; gap: 0.25rem; background: #fff; border-bottom: 1px solid #d8dbe3; }
.onglets button { flex: 1 1 30%; padding: 0.42rem 0.25rem; }
.onglets button.actif { color: #124d8b; font-weight: 700; background: #e7f0fc; border-color: #3976b8; box-shadow: inset 0 -2px #3976b8; }
.badge { display: block; margin-top: 0.15rem; font-size: 0.63rem; color: #4f5968; background: #e9ecf1; border-radius: 8px; padding: 0.05rem 0.3rem; }
.badge.applique { color: #6b4100; background: #ffedb3; font-weight: 700; }
.combinaison { display: flex; flex-direction: column; gap: 0.18rem; margin: 0.65rem 0.25rem; padding: 0.55rem; border: 1px solid #c9d7ea; border-radius: 5px; background: #f2f7fd; font-size: 0.76rem; line-height: 1.35; }
.combinaison small { color: #596779; }
.aide, section, .option-role { margin: 0.65rem 0.25rem; }
.aide { color: #606978; font-size: 0.75rem; }
.option-role { padding: 0.45rem; background: #f2f5fa; font-size: 0.8rem; }
.etat-filtre { margin: 0.5rem 0; padding: 0.45rem 0.55rem; border-left: 3px solid #8b96a6; background: #f1f3f6; color: #4d5663; font-size: 0.76rem; line-height: 1.35; }
.etat-filtre.applique { border-left-color: #c18408; background: #fff5d6; color: #5d4105; }
.actions-liste { margin: 0.5rem 0; display: flex; gap: 0.4rem; flex-wrap: wrap; }
.actions-liste button { font-size: 0.68rem; padding: 0.25rem 0.4rem; }
.choix { display: flex; align-items: flex-start; gap: 0.3rem; padding: 0.28rem 0.3rem; font-size: 0.82rem; }
.choix:hover { background: #f3f6fb; }
.choix input { margin-top: 0.15rem; }
.groupe-variable { border-top: 1px solid #e0e3e9; padding: 0.6rem 0; }
.groupe-variable header { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
.groupe-variable header small { color: #667080; }
.groupe-variable header button { margin-left: auto; font-size: 0.68rem; }
.vide { color: #707887; font-style: italic; }
</style>
