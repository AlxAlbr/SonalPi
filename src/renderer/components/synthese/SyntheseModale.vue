<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { exporterSyntheseTxt } from '../../../shared/synthese/export'
import type { ExtraitSynthese, SelectionSynthese } from '../../../shared/synthese/types'
import { utiliserSonal } from '../../composables/sonal'
import ListeExtraitsSynthese from './ListeExtraitsSynthese.vue'
import VueEnsembleSynthese from './VueEnsembleSynthese.vue'

const {
  syntheseOuverte, chargementSynthese, progressionSynthese, filtresSynthese,
  modeTexteSynthese, representationSynthese, selectionExtraitSynthese,
  personnesSynthese, entretiensCalculSynthese, extraitsSynthese, diagnosticsSynthese, resultatPerimeSynthese,
  calculeLeSynthese, entretiensAvecExtraitsSynthese, volumeTexteSynthese,
  lignesResumeSynthese, criteresActifsSynthese, calculSynthesePossible, exportSynthesePossible,
  fermerSynthese, actualiserSynthese, ouvrirExtraitSynthese,
  membership, variables, codebook, cas, couleurTrait,
} = utiliserSonal()
const panneauVisible = ref(true)
const afficherEntretiensSansExtrait = ref(false)
const messageExport = ref('')
const onglet = ref<'entretiens' | 'variables' | 'personnes' | 'themes' | 'cas'>('themes')
const selectionne = computed(() => extraitsSynthese.value.find((item) => item.id === selectionExtraitSynthese.value) ?? null)
const dateCalcul = computed(() => calculeLeSynthese.value?.toLocaleString('fr-FR') ?? 'Aucun calcul')
watch(entretiensCalculSynthese, (entretiens) => {
  if (!entretiens.length) afficherEntretiensSansExtrait.value = false
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
async function exporterTxt() {
  if (!exportSynthesePossible.value || !calculeLeSynthese.value) return
  messageExport.value = ''
  try {
    const contenu = exporterSyntheseTxt({
      titre: 'Synthèse',
      date: calculeLeSynthese.value,
      criteres: [...lignesResumeSynthese.value, `Texte ${modeTexteSynthese.value === 'original' ? 'original' : 'pseudonymisé'}`],
      extraits: extraitsSynthese.value,
      diagnostics: diagnosticsSynthese.value,
      nomTheme: (id) => codebook.value.find((item) => item.id === id)?.nom ?? id,
    })
    const resultat = await window.sonal.corpus.syntheseExporterTxt({ nom: `synthese-${new Date().toISOString().slice(0, 10)}.txt`, contenu })
    if (!resultat.annule) messageExport.value = `Synthèse exportée : ${resultat.chemin ?? 'destination choisie'}`
  } catch (erreur) {
    messageExport.value = erreur instanceof Error ? erreur.message : String(erreur)
  }
}
function selectionnerDepuisMur(extrait: ExtraitSynthese) {
  selectionExtraitSynthese.value = extrait.id
}
function afficherDansExtraits() {
  representationSynthese.value = 'extraits'
}
function touche(event: KeyboardEvent) {
  if (event.key === 'Escape' && syntheseOuverte.value) fermerSynthese()
}
onMounted(() => window.addEventListener('keydown', touche))
onBeforeUnmount(() => window.removeEventListener('keydown', touche))
</script>

<template>
  <div v-show="syntheseOuverte" class="fond" role="dialog" aria-modal="true" aria-label="Synthèse">
    <div class="fenetre">
      <header class="entete">
        <div><h2>🧩 Synthèse</h2><small>{{ dateCalcul }}</small></div>
        <div class="actions">
          <label>Affichage
            <select v-model="modeTexteSynthese">
              <option value="pseudonymise">Texte pseudonymisé</option>
              <option value="original">Texte original — peut contenir des identités</option>
            </select>
          </label>
          <button :disabled="!exportSynthesePossible" @click="exporterTxt">Exporter TXT</button>
          <button @click="fermerSynthese">Quitter ✕</button>
        </div>
      </header>

      <div v-if="chargementSynthese" class="etat" role="status">Lecture en cours… {{ progressionSynthese.faits }} sur {{ progressionSynthese.total }} entretiens.</div>
      <div v-if="resultatPerimeSynthese" class="etat avertissement" role="status">Les sources ou les critères ont changé. Le résultat précédent reste visible ; actualisez-le pour naviguer.</div>
      <div v-if="!calculSynthesePossible && !calculeLeSynthese" class="etat aide">Choisissez au moins un thème ou un cas pour lancer le calcul.</div>
      <div v-if="messageExport" class="etat" role="status">{{ messageExport }}</div>
      <details v-if="diagnosticsSynthese.length" class="etat avertissement"><summary>Résultat incomplet · {{ diagnosticsSynthese.length }} problème(s)</summary><ul><li v-for="(item, index) in diagnosticsSynthese" :key="index"><strong>{{ item.titre }}</strong> — {{ item.message }}</li></ul></details>

      <section class="bilan">
        <strong>{{ entretiensAvecExtraitsSynthese }} entretien(s) · {{ extraitsSynthese.length }} extrait(s) · {{ volumeTexteSynthese.toLocaleString('fr-FR') }} caractères source</strong>
        <span>{{ criteresActifsSynthese }} critère(s) appliqué(s) · {{ resultatPerimeSynthese ? 'Périmé' : diagnosticsSynthese.length ? 'Incomplet' : calculeLeSynthese ? 'À jour' : 'À calculer' }}</span>
        <details><summary>Détail des critères</summary><ul><li v-for="ligne in lignesResumeSynthese" :key="ligne">{{ ligne }}</li></ul></details>
      </section>

      <div class="commandes">
        <div class="segments" aria-label="Représentation">
          <button :class="{ actif: representationSynthese === 'ensemble' }" @click="representationSynthese = 'ensemble'">Vue d’ensemble</button>
          <button :class="{ actif: representationSynthese === 'extraits' }" @click="representationSynthese = 'extraits'">Extraits</button>
        </div>
        <button class="btn-calcul" :disabled="chargementSynthese || !calculSynthesePossible" @click="actualiserSynthese">
          {{ chargementSynthese ? 'Calcul en cours…' : calculeLeSynthese ? 'Actualiser la synthèse' : 'Calculer la synthèse' }}
        </button>
        <button @click="panneauVisible = !panneauVisible">{{ panneauVisible ? 'Masquer' : 'Afficher' }} les critères</button>
      </div>

      <div class="travail" :class="{ sansPanneau: !panneauVisible }">
        <main class="resultats">
          <label v-if="representationSynthese === 'ensemble' && entretiensCalculSynthese.length > entretiensAvecExtraitsSynthese" class="option-tous-entretiens">
            <input v-model="afficherEntretiensSansExtrait" type="checkbox" role="switch">
            Afficher tous les entretiens sélectionnés ({{ entretiensCalculSynthese.length }}), dont {{ entretiensAvecExtraitsSynthese }} avec des extraits
          </label>
          <VueEnsembleSynthese v-if="representationSynthese === 'ensemble'" :extraits="extraitsSynthese" :entretiens="entretiensCalculSynthese" :afficher-sans-extrait="afficherEntretiensSansExtrait" :selection="selectionExtraitSynthese" :nom-theme="(id) => codebook.find((item) => item.id === id)?.nom ?? id" :couleur-theme="couleurTrait" @selectionner="selectionnerDepuisMur" />
          <ListeExtraitsSynthese v-else :extraits="extraitsSynthese" :selection="selectionExtraitSynthese" :nom-theme="(id) => codebook.find((item) => item.id === id)?.nom ?? id" :couleur-theme="couleurTrait" :navigation-possible="!resultatPerimeSynthese" @selectionner="selectionnerDepuisMur" @ouvrir="ouvrirExtraitSynthese" />
          <aside v-if="representationSynthese === 'ensemble' && selectionne" class="detail">
            <strong>{{ selectionne.titreEntretien }} · {{ selectionne.locuteurs.join(', ') || 'Sans locuteur' }}</strong>
            <p>{{ selectionne.texte }}</p>
            <p class="discret">Thèmes : {{ selectionne.themeIds.map((id) => codebook.find((item) => item.id === id)?.nom ?? id).join(', ') || 'aucun' }}</p>
            <details><summary>{{ selectionne.annotationIds.length }} annotation(s) contributrice(s)</summary><ul><li v-for="id in selectionne.annotationIds" :key="id">{{ id }}</li></ul></details>
            <button @click="afficherDansExtraits">Afficher dans les extraits</button>
            <button :disabled="resultatPerimeSynthese" @click="ouvrirExtraitSynthese(selectionne)">Ouvrir dans l’entretien</button>
          </aside>
        </main>

        <aside v-show="panneauVisible" class="filtres" aria-label="Critères de synthèse">
          <nav class="onglets" role="tablist" aria-label="Dimensions de sélection"><button v-for="item in (['entretiens', 'variables', 'personnes', 'themes', 'cas'] as const)" :key="item" role="tab" :aria-selected="onglet === item" :class="{ actif: onglet === item }" @click="onglet = item"><span>{{ libellesOnglets[item] }}</span><strong class="badge" :class="{ applique: ongletFiltreActif(item) }">{{ nombreSelectionsOnglet(item) }}</strong></button></nav>
          <div class="combinaison"><strong>Comment les choix se combinent</strong><span>Dans une liste, un passage peut correspondre à l’un ou l’autre des choix. Entre plusieurs onglets, il doit répondre à tous les critères.</span></div>
          <label class="role"><input type="checkbox" :checked="filtresSynthese.inclureEnqueteurs" @change="filtresSynthese = { ...filtresSynthese, inclureEnqueteurs: !filtresSynthese.inclureEnqueteurs }"> Inclure les paroles des enquêteurs</label>
          <section v-if="onglet === 'entretiens'" role="tabpanel">
            <h3>Entretiens</h3>
            <p class="etat-selection" :class="{ applique: ongletFiltreActif('entretiens') }">{{ nombreSelectionsOnglet('entretiens') }} entretien(s) sélectionné(s) sur {{ Object.keys(membership).length }}.</p>
            <div class="actions-liste"><button @click="toutSelectionner('entretiens')">Tout sélectionner</button><button @click="toutDeselectionner('entretiens')">Tout désélectionner</button></div>
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
            <p class="discret">Au moins un thème ou un cas doit être choisi pour calculer la synthèse.</p>
            <div class="actions-liste"><button @click="toutSelectionner('themes')">Tout sélectionner</button><button @click="toutDeselectionner('themes')">Tout désélectionner</button></div>
            <label v-for="item in codebook" :key="item.id" class="choix"><input type="checkbox" :checked="coche(filtresSynthese.themes, item.id)" @change="choix('themes', item.id)"> {{ item.nom }}</label>
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
            <article v-for="variable in variables" :key="variable.id" class="variable"><strong>{{ variable.lib }}</strong><small>{{ variable.portee === 'entretien' ? 'Entretien' : 'Locuteur' }}</small>
              <label v-for="item in variable.modalites" :key="item.id"><input type="checkbox" :checked="variableCochee(variable.id, item.id)" @change="modalite(variable.id, item.id)"> {{ item.lib }}</label>
              <label><input type="checkbox" :checked="filtresSynthese.variables[variable.id]?.nonRenseigne === true" @change="nonRenseigne(variable.id)"> Non renseigné</label>
            </article>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fond { position: fixed; inset: 0; z-index: 105; background: rgba(18, 24, 38, .58); padding: 1.2rem; }
.fenetre { height: calc(100vh - 2.4rem); max-width: 1500px; margin: auto; background: white; border-radius: 10px; display: flex; flex-direction: column; overflow: hidden; }
.entete, .commandes, .bilan { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .65rem 1rem; border-bottom: 1px solid #dde2eb; }.commandes { background: #f5f8fc; }.btn-calcul { padding: .58rem 1.1rem; border: 1px solid #174f87; background: #1769aa; color: white; font-size: .9rem; font-weight: 700; box-shadow: 0 2px 5px rgba(23, 79, 135, .24); }.btn-calcul:hover:not(:disabled) { background: #10578f; }.btn-calcul:disabled { color: #687080; background: #e1e5eb; border-color: #b9c0ca; box-shadow: none; }
h2, h3 { margin: 0; } h3 { font-size: .95rem; }.actions { display: flex; align-items: center; gap: .6rem; } .actions label { font-size: .8rem; }
.etat { margin: .5rem 1rem 0; padding: .45rem .7rem; background: #edf5ff; border-radius: 5px; }.avertissement { background: #fff2d9; }.aide { background: #f1f3f6; }
.bilan { align-items: flex-start; font-size: .84rem; }.bilan details { max-width: 42%; }.segments { display: flex; }.segments button.actif { color: white; background: #334e8a; }
.travail { display: grid; grid-template-columns: minmax(0, 1fr) minmax(330px, 410px); min-height: 0; flex: 1; }.travail.sansPanneau { grid-template-columns: 1fr; }
.resultats { padding: 1rem; overflow: auto; }.option-tous-entretiens { display: flex; align-items: center; gap: .45rem; width: fit-content; margin: 0 0 .75rem auto; padding: .38rem .6rem; border: 1px solid #b9c9df; border-radius: 16px; background: #f3f7fc; color: #40516a; font-size: .76rem; }.option-tous-entretiens input { margin: 0; }.filtres { min-width: 0; border-left: 1px solid #cdd2dc; background: #fff; overflow: auto; padding-bottom: 1rem; }.onglets { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; padding: .45rem; gap: .25rem; background: #fff; border-bottom: 1px solid #d8dbe3; }.onglets button { flex: 1 1 30%; padding: .42rem .25rem; }.onglets button.actif { color: #124d8b; font-weight: 700; background: #e7f0fc; border-color: #3976b8; box-shadow: inset 0 -2px #3976b8; }.badge { display: block; margin-top: .15rem; font-size: .63rem; color: #4f5968; background: #e9ecf1; border-radius: 8px; padding: .05rem .3rem; }.badge.applique { color: #6b4100; background: #ffedb3; font-weight: 700; }
.combinaison { display: flex; flex-direction: column; gap: .18rem; margin: .65rem .75rem; padding: .55rem; border: 1px solid #c9d7ea; border-radius: 5px; background: #f2f7fd; font-size: .76rem; line-height: 1.35; }.filtres section, .role { margin: .65rem .75rem; }.filtres section, .variable { display: grid; gap: .42rem; }.filtres label { font-size: .84rem; }.role { display: block; padding: .45rem; background: #f2f5fa; }.actions-liste { display: flex; flex-wrap: wrap; gap: .4rem; margin: .1rem 0; }.actions-liste button { font-size: .68rem; padding: .25rem .4rem; }.choix { display: flex; align-items: flex-start; gap: .3rem; padding: .28rem .3rem; }.choix:hover { background: #f3f6fb; }.choix input { margin-top: .15rem; }
.detail { position: sticky; bottom: 0; background: #f7f9fd; border: 1px solid #ccd5e8; border-radius: 7px; padding: .75rem; margin-top: 1rem; }.detail button { margin-right: .4rem; }.discret { color: #657083; font-size: .8rem; }.etat-selection { margin: .1rem 0; padding: .45rem .55rem; border-left: 3px solid #8b96a6; background: #f1f3f6; color: #4d5663; font-size: .76rem; line-height: 1.35; }.etat-selection.applique { border-left-color: #c18408; background: #fff5d6; color: #5d4105; }.correspondance-themes { margin: .15rem 0; padding: .45rem; border: 1px solid #c9d7ea; border-radius: 5px; }.correspondance-themes legend { padding: 0 .25rem; color: #465166; font-size: .76rem; font-weight: 700; }.variable { padding: .6rem 0; border-top: 1px solid #e2e5eb; }.variable small { color: #657083; }
@media (max-width: 850px) { .fond { padding: 0; }.fenetre { height: 100vh; border-radius: 0; }.travail { grid-template-columns: 1fr; overflow: auto; }.resultats, .filtres { overflow: visible; }.filtres { border-left: 0; border-top: 1px solid #dde2eb; }.entete { align-items: flex-start; }.actions { flex-wrap: wrap; justify-content: flex-end; } }
</style>
