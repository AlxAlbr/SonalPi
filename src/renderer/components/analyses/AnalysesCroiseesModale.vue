<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { exporterAnalyseCroisee } from '../../../shared/analysesCroisees/export'
import type { Categorie } from '../../../shared/format'
import { utiliserSonal } from '../../composables/sonal'
import DetailCelluleAnalyse from './DetailCelluleAnalyse.vue'
import MatriceThemesMateriaux from './MatriceThemesMateriaux.vue'

const {
  analysesCroiseesOuvertes, chargementAnalysesCroisees, progressionAnalysesCroisees,
  themesAnalyseCroisee, entretiensAnalyseCroisee, mesureAnalyseCroisee,
  afficherEntretiensSansResultatAnalyse, modeTexteAnalyseCroisee,
  resultatAnalyseCroisee, cellulesAnalyseCroisee, diagnosticsAnalyseCroisee, selectionAppliquee,
  resultatPerimeAnalyseCroisee, calculeLeAnalyseCroisee, celluleSelectionneeAnalyseCroisee,
  passagesCelluleAnalyseCroisee, entretiensAvecResultatAnalyseCroisee, cellulesNonVidesAnalyseCroisee,
  calculAnalyseCroiseePossible, exportAnalyseCroiseePossible,
  fermerAnalysesCroisees, actualiserAnalyseCroisee, selectionnerCelluleAnalyseCroisee,
  ouvrirPassageAnalyseCroisee, envoyerCelluleVersSynthese,
  selectionCelluleAnalyseCroisee, membership, codebook,
} = utiliserSonal()

const onglet = ref<'themes' | 'entretiens'>('themes')
const panneauVisible = ref(true)
const afficherThemesSansResultat = ref(true)
const triThemes = ref<'ordre' | 'nom' | 'total'>('ordre')
const rechercheThemes = ref('')
const rechercheEntretiens = ref('')
const formatExport = ref<'csv' | 'tsv'>('csv')
const dispositionExport = ref<'large' | 'long'>('large')
const messageExport = ref('')
const detailOuvert = ref(false)
const dateCalcul = computed(() => calculeLeAnalyseCroisee.value?.toLocaleString('fr-FR') ?? 'Aucun calcul')
const normaliser = (texte: string) => texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr')
const rechercheThemesNormalisee = computed(() => normaliser(rechercheThemes.value.trim()))
const rechercheEntretiensNormalisee = computed(() => normaliser(rechercheEntretiens.value.trim()))
const idsThemesAppliques = computed(() => selectionAppliquee.value?.themes ?? [])
const idsEntretiensAppliques = computed(() => selectionAppliquee.value?.entretiens ?? [])
const themesAffiches = computed(() => idsThemesAppliques.value
  .map((id) => codebook.value.find((item) => item.id === id))
  .filter((item): item is Categorie => Boolean(item))
  .filter((item) => afficherThemesSansResultat.value
    || cellulesAnalyseCroisee.value.some((cellule) => cellule.themeId === item.id && cellule.passages > 0))
  .filter((item) => !rechercheThemesNormalisee.value || normaliser(item.nom).includes(rechercheThemesNormalisee.value))
  .sort((a, b) => {
    if (triThemes.value === 'nom') return a.nom.localeCompare(b.nom, 'fr')
    if (triThemes.value === 'total') {
      const valeurA = resultatAnalyseCroisee.value?.totaux.lignes[a.id]?.[mesureAnalyseCroisee.value] ?? -1
      const valeurB = resultatAnalyseCroisee.value?.totaux.lignes[b.id]?.[mesureAnalyseCroisee.value] ?? -1
      return valeurB - valeurA || a.nom.localeCompare(b.nom, 'fr')
    }
    return idsThemesAppliques.value.indexOf(a.id) - idsThemesAppliques.value.indexOf(b.id)
  }))
const entretiensAffiches = computed(() => idsEntretiensAppliques.value
  .filter((id) => !rechercheEntretiensNormalisee.value || normaliser(membership.value[id]?.titre ?? id).includes(rechercheEntretiensNormalisee.value))
  .filter((id) => afficherEntretiensSansResultatAnalyse.value
    || resultatAnalyseCroisee.value?.sourcesIndisponibles.includes(id)
    || cellulesAnalyseCroisee.value.some((item) => item.entretienId === id && item.passages > 0))
  .map((id) => ({ id, titre: membership.value[id]?.titre ?? id })))
const themeDetail = computed(() => codebook.value.find((item) => item.id === celluleSelectionneeAnalyseCroisee.value?.themeId)?.nom ?? '')
const entretienDetail = computed(() => {
  const id = celluleSelectionneeAnalyseCroisee.value?.entretienId
  return id ? membership.value[id]?.titre ?? id : ''
})
function selectionnerCellule(cellule: Parameters<typeof selectionnerCelluleAnalyseCroisee>[0]): void {
  selectionnerCelluleAnalyseCroisee(cellule)
  detailOuvert.value = true
}
function fermerDetail(): void { detailOuvert.value = false }
function coche(liste: string[], id: string): boolean { return liste.includes(id) }
function basculer(cle: 'themes' | 'entretiens', id: string): void {
  const cible = cle === 'themes' ? themesAnalyseCroisee : entretiensAnalyseCroisee
  cible.value = cible.value.includes(id) ? cible.value.filter((item) => item !== id) : [...cible.value, id]
}
function tous(cle: 'themes' | 'entretiens', valeur: boolean): void {
  if (cle === 'themes') themesAnalyseCroisee.value = valeur ? codebook.value.map((item) => item.id) : []
  else entretiensAnalyseCroisee.value = valeur ? Object.keys(membership.value) : []
}
function profondeur(theme: Categorie): number {
  let niveau = 0
  let parent = theme.parent
  const visites = new Set<string>()
  while (parent && !visites.has(parent)) {
    visites.add(parent)
    niveau++
    parent = codebook.value.find((item) => item.id === parent)?.parent ?? null
  }
  return niveau
}
async function exporter(): Promise<void> {
  if (!exportAnalyseCroiseePossible.value || !resultatAnalyseCroisee.value || !calculeLeAnalyseCroisee.value) return
  messageExport.value = ''
  const extension = formatExport.value
  const contenu = exporterAnalyseCroisee({
    format: formatExport.value,
    disposition: dispositionExport.value,
    mesure: mesureAnalyseCroisee.value,
    date: calculeLeAnalyseCroisee.value,
    themes: idsThemesAppliques.value.map((id) => ({ id, nom: codebook.value.find((item) => item.id === id)?.nom ?? id })),
    entretiens: idsEntretiensAppliques.value.map((id) => ({ id, nom: membership.value[id]?.titre ?? id })),
    cellules: cellulesAnalyseCroisee.value,
    sourcesIndisponibles: resultatAnalyseCroisee.value.sourcesIndisponibles,
    diagnostics: diagnosticsAnalyseCroisee.value,
    totaux: resultatAnalyseCroisee.value.totaux,
  })
  try {
    const resultat = await window.sonal.corpus.analysesCroiseesExporter({
      nom: `analyses-croisees-${new Date().toISOString().slice(0, 10)}-${dispositionExport.value}.${extension}`,
      contenu,
      format: extension,
    })
    if (!resultat.annule) messageExport.value = `Analyse exportée : ${resultat.chemin ?? 'destination choisie'}`
  } catch (erreur) {
    messageExport.value = erreur instanceof Error ? erreur.message : String(erreur)
  }
}
function touche(event: KeyboardEvent): void {
  if (event.key === 'Escape' && analysesCroiseesOuvertes.value) {
    if (detailOuvert.value) detailOuvert.value = false
    else fermerAnalysesCroisees()
  }
}
onMounted(() => window.addEventListener('keydown', touche))
onBeforeUnmount(() => window.removeEventListener('keydown', touche))
</script>

<template>
  <div v-show="analysesCroiseesOuvertes" class="fond" role="dialog" aria-modal="true" aria-label="Analyses croisées">
    <div class="fenetre">
      <header class="entete">
        <div><h2>▦ Analyses croisées</h2><small>Dernier calcul : {{ dateCalcul }}</small></div>
        <div class="actions">
          <label>Texte des justificatifs <select v-model="modeTexteAnalyseCroisee"><option value="pseudonymise">Pseudonymisé</option><option value="original">Original — peut contenir des identités</option></select></label>
          <select v-model="formatExport" aria-label="Format d’export"><option value="csv">CSV</option><option value="tsv">TSV</option></select>
          <select v-model="dispositionExport" aria-label="Disposition d’export"><option value="large">Matrice</option><option value="long">Format long</option></select>
          <button :disabled="!exportAnalyseCroiseePossible" @click="exporter">Exporter</button>
          <button @click="fermerAnalysesCroisees">Quitter ✕</button>
        </div>
      </header>
      <div v-if="chargementAnalysesCroisees" class="etat" role="status">Lecture en cours… {{ progressionAnalysesCroisees.faits }} sur {{ progressionAnalysesCroisees.total }} entretiens.</div>
      <div v-if="resultatPerimeAnalyseCroisee" class="etat avertissement" role="status">Les sources ou la sélection ont changé. Actualisez l’analyse pour ouvrir les passages ou exporter.</div>
      <div v-if="messageExport" class="etat" role="status">{{ messageExport }}</div>
      <details v-if="diagnosticsAnalyseCroisee.length" class="etat avertissement"><summary>Résultat incomplet · {{ diagnosticsAnalyseCroisee.length }} diagnostic(s)</summary><ul><li v-for="(item, index) in diagnosticsAnalyseCroisee" :key="index"><strong>{{ item.titre }}</strong> — {{ item.message }}</li></ul></details>
      <section class="bilan">
        <strong>{{ themesAnalyseCroisee.length }} thème(s) · {{ entretiensAnalyseCroisee.length }} entretien(s)</strong>
        <span>{{ entretiensAvecResultatAnalyseCroisee }} entretien(s) avec résultat · {{ cellulesNonVidesAnalyseCroisee }} cellule(s) non vide(s)</span>
        <span>{{ resultatPerimeAnalyseCroisee ? 'Périmé' : diagnosticsAnalyseCroisee.length ? 'Incomplet' : calculeLeAnalyseCroisee ? 'À jour' : 'À calculer' }}</span>
      </section>
      <div class="commandes">
        <button class="btn-calcul" :disabled="chargementAnalysesCroisees || !calculAnalyseCroiseePossible" @click="actualiserAnalyseCroisee">{{ chargementAnalysesCroisees ? 'Calcul en cours…' : calculeLeAnalyseCroisee ? 'Actualiser l’analyse' : 'Calculer l’analyse' }}</button>
        <label>Valeur affichée <select v-model="mesureAnalyseCroisee"><option value="passages">Passages</option><option value="volume">Volume</option><option value="couverture">Couverture</option></select></label>
        <label><input v-model="afficherThemesSansResultat" type="checkbox" role="switch"> Afficher les thèmes sans résultat</label>
        <label><input v-model="afficherEntretiensSansResultatAnalyse" type="checkbox" role="switch"> Afficher les entretiens sans résultat</label>
        <label>Trier les thèmes <select v-model="triThemes"><option value="ordre">Ordre du corpus</option><option value="nom">Nom</option><option value="total">Total décroissant</option></select></label>
        <label>Rechercher un thème <input v-model="rechercheThemes" type="search"></label>
        <label>Rechercher un entretien <input v-model="rechercheEntretiens" type="search"></label>
        <button @click="panneauVisible = !panneauVisible">{{ panneauVisible ? 'Masquer' : 'Afficher' }} la sélection</button>
      </div>
      <p class="regle">Une plage portant plusieurs thèmes contribue à chaque ligne. Les valeurs des thèmes ne sont donc pas toujours additionnables.</p>
      <div class="travail" :class="{ sansPanneau: !panneauVisible }">
        <aside v-show="panneauVisible" class="configuration" aria-label="Sélection de l’analyse">
          <nav><button :class="{ actif: onglet === 'themes' }" @click="onglet = 'themes'">Thèmes <b>{{ themesAnalyseCroisee.length }}</b></button><button :class="{ actif: onglet === 'entretiens' }" @click="onglet = 'entretiens'">Entretiens <b>{{ entretiensAnalyseCroisee.length }}</b></button></nav>
          <section v-if="onglet === 'themes'"><h3>Thèmes</h3><div class="actions-liste"><button @click="tous('themes', true)">Tout sélectionner</button><button @click="tous('themes', false)">Tout désélectionner</button></div><label v-for="theme in codebook" :key="theme.id" class="choix" :style="{ paddingLeft: `${.35 + profondeur(theme) * .8}rem` }"><input type="checkbox" :checked="coche(themesAnalyseCroisee, theme.id)" @change="basculer('themes', theme.id)"><span class="pastille" :style="{ backgroundColor: theme.couleur || '#788596' }"></span>{{ theme.nom }}</label></section>
          <section v-else><h3>Entretiens</h3><div class="actions-liste"><button @click="tous('entretiens', true)">Tout sélectionner</button><button @click="tous('entretiens', false)">Tout désélectionner</button></div><label v-for="(entretien, id) in membership" :key="id" class="choix"><input type="checkbox" :checked="coche(entretiensAnalyseCroisee, id)" @change="basculer('entretiens', id)">{{ entretien.titre }}</label></section>
        </aside>
        <main class="resultats">
          <p v-if="!calculeLeAnalyseCroisee" class="vide">Sélectionnez au moins un thème et un entretien, puis calculez l’analyse.</p>
          <MatriceThemesMateriaux v-else-if="resultatAnalyseCroisee" :themes="themesAffiches" :entretiens="entretiensAffiches" :cellules="cellulesAnalyseCroisee" :mesure="mesureAnalyseCroisee" :indisponibles="resultatAnalyseCroisee.sourcesIndisponibles" :totaux="resultatAnalyseCroisee.totaux" :selection="selectionCelluleAnalyseCroisee" @selectionner="selectionnerCellule" />
        </main>
        <DetailCelluleAnalyse v-if="detailOuvert && celluleSelectionneeAnalyseCroisee" :cellule="celluleSelectionneeAnalyseCroisee" :theme="themeDetail" :entretien="entretienDetail" :passages="passagesCelluleAnalyseCroisee" :perime="resultatPerimeAnalyseCroisee" @fermer="fermerDetail" @ouvrir="ouvrirPassageAnalyseCroisee" @synthese="envoyerCelluleVersSynthese" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.fond { position: fixed; inset: 0; z-index: 106; padding: 1rem; background: rgba(18, 24, 38, .6); }.fenetre { display: flex; flex-direction: column; height: calc(100vh - 2rem); max-width: 1600px; margin: auto; overflow: hidden; border-radius: 10px; background: white; }
.entete, .bilan, .commandes { display: flex; align-items: center; justify-content: space-between; gap: .8rem; padding: .6rem 1rem; border-bottom: 1px solid #dce2ea; }.entete h2 { margin: 0; }.actions, .commandes, .actions-liste { display: flex; align-items: center; flex-wrap: wrap; gap: .45rem; }.bilan { font-size: .8rem; }.commandes { justify-content: flex-start; background: #f3f7fb; font-size: .78rem; }.btn-calcul { padding: .55rem 1rem; border-color: #174f87; background: #1769aa; color: white; font-weight: 700; }.btn-calcul:disabled { border-color: #bbc2cb; background: #dfe4ea; color: #687080; }
.etat { margin: .4rem 1rem 0; padding: .4rem .65rem; border-radius: 5px; background: #eaf3fd; }.avertissement { background: #fff0d2; }.regle { margin: .4rem 1rem; color: #596678; font-size: .73rem; }
.travail { display: grid; grid-template-columns: minmax(16rem, 20rem) minmax(0, 1fr); min-height: 0; flex: 1; }.travail:has(.detail) { grid-template-columns: minmax(16rem, 20rem) minmax(0, 1fr) auto; }.travail.sansPanneau { grid-template-columns: minmax(0, 1fr); }.travail.sansPanneau:has(.detail) { grid-template-columns: minmax(0, 1fr) auto; }
.configuration { overflow: auto; border-right: 1px solid #d8dee7; }.configuration nav { position: sticky; top: 0; display: flex; padding: .45rem; gap: .3rem; background: white; }.configuration nav button { flex: 1; }.configuration nav .actif { background: #e2eefb; color: #164f88; font-weight: 700; }.configuration section { padding: .4rem .7rem; }.configuration h3 { margin: .25rem 0; }.actions-liste button { font-size: .68rem; }.choix { display: flex; align-items: center; gap: .35rem; padding: .32rem; font-size: .82rem; }.choix:hover { background: #f1f5fa; }.pastille { width: .68rem; height: .68rem; flex: none; border: 1px solid rgba(0, 0, 0, .25); border-radius: 50%; }
.resultats { min-width: 0; min-height: 0; padding: .7rem; overflow: hidden; }.vide { color: #687485; }
@media (max-width: 900px) { .fond { padding: 0; }.fenetre { height: 100vh; border-radius: 0; }.travail, .travail:has(.detail), .travail.sansPanneau:has(.detail) { display: flex; flex-direction: column; overflow: auto; }.configuration, .resultats { overflow: visible; }.entete, .bilan { align-items: flex-start; flex-wrap: wrap; } }
</style>
