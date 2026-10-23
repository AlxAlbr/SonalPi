<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { exporterTableauLexico, type FormatExportLexico } from '../../../shared/lexico/export'
import { compterConcatenationsLexico, LISTES_MOTS_OUTILS, normaliserFormeLexico } from '../../../shared/lexico/traitements'
import type { SelectionLexico } from '../../../shared/lexico/types'

const sonal = utiliserSonal()
const {
  lexicoOuvert, chargementLexico, progressionLexico, lignesLexico,
  occurrencesRetenuesLexico, diagnosticsLexico, personnesLexico,
  filtresLexico, resultatsPerimesLexico, entretiensAvecResultatsLexico,
  lignesResumeLexico, criteresActifsLexico, exportLexicoPossible,
  fermerLexico, actualiserLexico, reinitialiserSelectionLexico,
  traitementsLexico, historiqueTraitementsLexico, enregistrementTraitementsLexico, occurrencesLexico,
  ajouterMotsOutilsLexico, retirerMotOutilLexico,
  personnaliserListeMotsOutilsLexico, restaurerListeMotsOutilsLexico,
  regrouperFormesLexico, retirerRegroupementLexico,
  ajouterConcatenationLexico, retirerConcatenationLexico,
  annulerTraitementLexico, reinitialiserTraitementsLexico,
  voirOccurrenceLexico, membership, variables, codebook, cas, famillesCas, lectureSeule,
} = sonal

type Onglet = 'entretiens' | 'variables' | 'personnes' | 'themes' | 'cas'
const onglet = ref<Onglet>('entretiens')
const panneauVisible = ref(true)
const detailVisible = ref(false)
const recherche = ref('')
const frequenceMin = ref(1)
const afficherNombres = ref(false)
const tri = ref<{ colonne: 'forme' | 'occurrences' | 'entretiens'; sens: 1 | -1 }>({ colonne: 'occurrences', sens: -1 })
const formeSelectionnee = ref('')
const formesSelectionnees = ref<string[]>([])
const traitementVisible = ref(false)
const formeOutil = ref('')
const listeOutilsOuverte = ref<string | null>(null)
const brouillonListeOutils = ref<string[]>([])
const nouveauMotListeOutils = ref('')
const formeRegroupement = ref('')
const editionRegroupement = ref(false)
const sequenceConcat = ref('')
const formeConcat = ref('')
const messageTraitement = ref('')
const messageExport = ref('')

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

const normaliser = (texte: string) => texte.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
const estNombre = (forme: string) => /^\p{N}+(?:[.,]\p{N}+)?$/u.test(forme)
const lignesAffichees = computed(() => {
  const terme = normaliser(recherche.value.trim())
  return lignesLexico.value.filter((ligne) => ligne.occurrences >= Math.max(1, frequenceMin.value || 1)
    && (afficherNombres.value || !estNombre(ligne.forme))
    && (!terme || normaliser(ligne.forme).includes(terme)))
    .sort((a, b) => {
      const resultat = tri.value.colonne === 'forme'
        ? a.forme.localeCompare(b.forme, 'fr')
        : a[tri.value.colonne] - b[tri.value.colonne]
      return resultat * tri.value.sens || a.forme.localeCompare(b.forme, 'fr')
    })
})
const ligneSelectionnee = computed(() => lignesLexico.value.find((ligne) => ligne.forme === formeSelectionnee.value) ?? null)
const sequenceConcatTokens = computed(() => sequenceConcat.value.split(/\s*\+\s*/).map(normaliserFormeLexico).filter(Boolean))
const occurrencesConcat = computed(() => compterConcatenationsLexico(occurrencesLexico.value, sequenceConcatTokens.value))
const traitementsActifs = computed(() => traitementsLexico.value.motsOutils.length
  + traitementsLexico.value.regroupements.length
  + traitementsLexico.value.concatenations.length)

function choisirTri(colonne: typeof tri.value.colonne) {
  tri.value = tri.value.colonne === colonne
    ? { colonne, sens: tri.value.sens === 1 ? -1 : 1 }
    : { colonne, sens: colonne === 'forme' ? 1 : -1 }
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

function badge(ongletCible: Onglet): string {
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
function filtreApplique(ongletCible: Onglet): boolean {
  if (ongletCible === 'variables') return Object.keys(filtresLexico.value.variables).length > 0
  if (ongletCible === 'personnes') return filtresLexico.value.personnes.selection.mode === 'choix'
  return selectionPour(ongletCible).mode === 'choix'
}

function modifierDepuisResume(index: number) {
  const ligne = lignesResumeLexico.value[index] ?? ''
  onglet.value = ligne.startsWith('Entretiens') ? 'entretiens'
    : ligne.startsWith('Personnes') ? 'personnes'
      : ligne.startsWith('Dans les thèmes') ? 'themes'
        : ligne.startsWith('Dans les matériaux') ? 'cas' : 'variables'
  panneauVisible.value = true
}

function criteresExport(): string[] {
  const privees = variables.value.filter((variable) => variable.priv).map((variable) => variable.lib)
  const criteres = lignesResumeLexico.value.map((ligne) => {
    if (ligne.startsWith('Personnes :')) return 'Filtre de personnes appliqué (identités non exportées)'
    if (privees.some((nom) => ligne.includes(nom))) return 'Filtre sur une variable privée appliqué (détail non exporté)'
    return ligne
  })
  const selection = filtresLexico.value.entretiens
  const ids = selection.mode === 'sans-restriction' ? entretiens.value.map((item) => item.id) : selection.ids
  const titres = ids.map((id) => membership.value[id]?.titre ?? `Source introuvable (${id})`)
  criteres.push(`Sources demandées (${titres.length}) : ${titres.join(' | ') || 'aucune'}`)
  criteres.push(`Traitement lexical : ${traitementsLexico.value.motsOutils.length} mot(s) outil(s), ${traitementsLexico.value.regroupements.length} regroupement(s), ${traitementsLexico.value.concatenations.length} concaténation(s)`)
  criteres.push(`Affichage : fréquence minimale ${Math.max(1, frequenceMin.value || 1)} ; nombres ${afficherNombres.value ? 'affichés' : 'masqués'}`)
  if (recherche.value.trim()) criteres.push(`Recherche dans le tableau : ${recherche.value.trim()}`)
  return criteres
}
async function exporter(format: FormatExportLexico) {
  if (!exportLexicoPossible.value) return
  messageExport.value = ''
  try {
    const contenu = exporterTableauLexico(lignesAffichees.value, criteresExport(), format)
    const resultat = await window.sonal.corpus.lexicoExporterTableau({
      nom: `lexico-${new Date().toISOString().slice(0, 10)}.${format}`,
      contenu,
      format,
    })
    if (!resultat.annule) messageExport.value = `Tableau exporté : ${resultat.chemin ?? 'destination choisie'}`
  } catch (erreur) {
    messageExport.value = erreur instanceof Error ? erreur.message : String(erreur)
  }
}

function basculerEnqueteurs() {
  filtresLexico.value = { ...filtresLexico.value, inclureEnqueteurs: !filtresLexico.value.inclureEnqueteurs }
}
function formeCochee(forme: string): boolean {
  return formesSelectionnees.value.includes(forme)
}
function basculerForme(forme: string) {
  formesSelectionnees.value = formeCochee(forme)
    ? formesSelectionnees.value.filter((candidate) => candidate !== forme)
    : [...formesSelectionnees.value, forme]
}
async function executerTraitement(action: () => Promise<void>, succes: string): Promise<boolean> {
  messageTraitement.value = ''
  try {
    await action()
    messageTraitement.value = succes
    return true
  } catch (erreur) {
    messageTraitement.value = erreur instanceof Error ? erreur.message : String(erreur)
    return false
  }
}
async function ajouterSelectionAuxMotsOutils() {
  const succes = await executerTraitement(
    () => ajouterMotsOutilsLexico(formesSelectionnees.value),
    'Mots outils ajoutés et enregistrés.',
  )
  if (!succes) return
  formesSelectionnees.value = []
  formeSelectionnee.value = ''
}
function ouvrirRegroupement() {
  if (!formesSelectionnees.value.length) return
  formeRegroupement.value = formesSelectionnees.value.length === 1
    ? formesSelectionnees.value[0]
    : formesSelectionnees.value.join(' / ')
  editionRegroupement.value = true
  messageTraitement.value = ''
}
async function validerRegroupement() {
  const succes = await executerTraitement(
    () => regrouperFormesLexico(formesSelectionnees.value, formeRegroupement.value),
    'Regroupement appliqué et enregistré.',
  )
  if (!succes) return
  formesSelectionnees.value = []
  editionRegroupement.value = false
  traitementVisible.value = true
}
async function ajouterMotOutil() {
  if (!formeOutil.value.trim()) return
  const succes = await executerTraitement(
    () => ajouterMotsOutilsLexico([formeOutil.value]),
    'Mot outil ajouté et enregistré.',
  )
  if (succes) formeOutil.value = ''
}
function contenuListeMotsOutils(nom: string): string[] {
  return traitementsLexico.value.listesMotsOutils?.[nom] ?? LISTES_MOTS_OUTILS[nom] ?? []
}
function ouvrirListeMotsOutils(nom: string) {
  if (listeOutilsOuverte.value === nom) {
    listeOutilsOuverte.value = null
    return
  }
  listeOutilsOuverte.value = nom
  brouillonListeOutils.value = [...contenuListeMotsOutils(nom)]
  nouveauMotListeOutils.value = ''
}
function ajouterAuBrouillonListeOutils() {
  const forme = normaliserFormeLexico(nouveauMotListeOutils.value)
  if (!forme || brouillonListeOutils.value.includes(forme)) return
  brouillonListeOutils.value.push(forme)
  nouveauMotListeOutils.value = ''
}
async function enregistrerListeMotsOutils() {
  const nom = listeOutilsOuverte.value
  if (!nom) return
  const succes = await executerTraitement(
    () => personnaliserListeMotsOutilsLexico(nom, brouillonListeOutils.value),
    `Liste « ${nom} » personnalisée pour ce corpus.`,
  )
  if (succes) brouillonListeOutils.value = [...contenuListeMotsOutils(nom)]
}
async function restaurerListeMotsOutils() {
  const nom = listeOutilsOuverte.value
  if (!nom) return
  const succes = await executerTraitement(
    () => restaurerListeMotsOutilsLexico(nom),
    `Liste « ${nom} » restaurée.`,
  )
  if (succes) brouillonListeOutils.value = [...(LISTES_MOTS_OUTILS[nom] ?? [])]
}
async function ajouterListeMotsOutils(nom: string) {
  await executerTraitement(
    () => ajouterMotsOutilsLexico(contenuListeMotsOutils(nom)),
    `Liste « ${nom} » ajoutée et enregistrée.`,
  )
}
async function validerConcatenation() {
  if (occurrencesConcat.value < 1) {
    messageTraitement.value = 'Cette suite de formes n’apparaît pas dans les entretiens.'
    return
  }
  const succes = await executerTraitement(
    () => ajouterConcatenationLexico(sequenceConcatTokens.value, formeConcat.value),
    'Concaténation appliquée et enregistrée.',
  )
  if (!succes) return
  sequenceConcat.value = ''
  formeConcat.value = ''
}
async function annulerDernierTraitement() {
  const succes = await executerTraitement(annulerTraitementLexico, 'Dernière modification annulée et enregistrée.')
  if (!succes) return
  formesSelectionnees.value = []
  formeSelectionnee.value = ''
}
function surTouche(event: KeyboardEvent) {
  if (event.key === 'Escape' && lexicoOuvert.value) fermerLexico()
}
onMounted(() => window.addEventListener('keydown', surTouche))
onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <Teleport to="body">
    <div v-show="lexicoOuvert" class="fond-lexico" role="dialog" aria-modal="true" aria-label="Lexico">
      <section class="modale-lexico">
        <header class="entete">
          <div>
            <h2>🔤 Lexico</h2>
            <span class="sous-titre">Index lexical du texte pseudonymisé</span>
          </div>
          <div class="actions-entete">
            <button :disabled="chargementLexico" @click="actualiserLexico">Actualiser</button>
            <button @click="fermerLexico">Quitter ✕</button>
          </div>
        </header>

        <div v-if="chargementLexico" class="etat attente" role="status">
          Analyse en cours… {{ progressionLexico.faits }} sur {{ progressionLexico.total }} entretiens lus.
        </div>
        <div v-if="resultatsPerimesLexico" class="etat avertissement" role="status">
          Les sources ont changé. Actualisez les résultats avant de les exporter.
        </div>
        <details v-if="diagnosticsLexico.length" class="etat avertissement">
          <summary>Analyse incomplète · {{ diagnosticsLexico.length }} problème(s)</summary>
          <ul><li v-for="(diagnostic, index) in diagnosticsLexico" :key="index"><strong>{{ diagnostic.titre }}</strong> — {{ diagnostic.message }}</li></ul>
        </details>

        <section class="bilan" aria-label="Bilan de l'analyse">
          <div>
            <strong>{{ entretiensAvecResultatsLexico }} entretiens avec résultats · {{ occurrencesRetenuesLexico.length.toLocaleString('fr-FR') }} occurrences · {{ lignesLexico.length.toLocaleString('fr-FR') }} formes</strong>
            <span>{{ criteresActifsLexico }} critère(s) appliqué(s)</span>
          </div>
          <div class="actions-bilan">
            <button @click="detailVisible = !detailVisible">{{ detailVisible ? 'Masquer' : 'Voir' }} les critères</button>
            <button @click="reinitialiserSelectionLexico">Réinitialiser la sélection</button>
            <button @click="panneauVisible = !panneauVisible">{{ panneauVisible ? 'Masquer' : 'Afficher' }} les filtres</button>
          </div>
          <ul v-if="detailVisible" class="resume">
            <li v-for="(ligne, index) in lignesResumeLexico" :key="ligne">
              <span>{{ ligne }}</span>
              <button v-if="index < lignesResumeLexico.length - 2" class="lien" @click="modifierDepuisResume(index)">Modifier</button>
            </li>
          </ul>
        </section>

        <div class="corps" :class="{ 'sans-panneau': !panneauVisible }">
          <main class="resultats">
            <div class="controles-resultats">
              <label>Rechercher une forme <input v-model="recherche" type="search" placeholder="Ex. travail"></label>
              <label>Fréquence minimale <input v-model.number="frequenceMin" type="number" min="1"></label>
              <label class="case"><input v-model="afficherNombres" type="checkbox"> Afficher les nombres</label>
              <button :class="{ actif: traitementVisible }" @click="traitementVisible = !traitementVisible">Traitement lexical <span v-if="traitementsActifs">· {{ traitementsActifs }}</span></button>
              <div class="exports">
                <button :disabled="!exportLexicoPossible" @click="exporter('csv')">Exporter CSV</button>
                <button :disabled="!exportLexicoPossible" @click="exporter('tsv')">Exporter TSV</button>
              </div>
              <small v-if="messageExport" class="message-export" role="status">{{ messageExport }}</small>
            </div>

            <div v-if="formesSelectionnees.length" class="barre-selection" role="status">
              <strong>{{ formesSelectionnees.length }} forme(s) sélectionnée(s)</strong>
              <button :disabled="lectureSeule || enregistrementTraitementsLexico" @click="ouvrirRegroupement">Regrouper / lemmatiser</button>
              <button :disabled="lectureSeule || enregistrementTraitementsLexico" @click="ajouterSelectionAuxMotsOutils">Ajouter aux mots outils</button>
              <button @click="formesSelectionnees = []">Effacer la sélection</button>
            </div>
            <div v-if="editionRegroupement" class="edition-regroupement">
              <label>Forme de regroupement <input v-model="formeRegroupement" type="text" @keyup.enter="validerRegroupement"></label>
              <span>Les occurrences de {{ formesSelectionnees.join(', ') }} seront réunies sous cette forme.</span>
              <button :disabled="lectureSeule || enregistrementTraitementsLexico" @click="validerRegroupement">Appliquer</button>
              <button @click="editionRegroupement = false">Annuler</button>
            </div>

            <section v-if="traitementVisible" class="traitements" aria-label="Traitement lexical">
              <header>
                <h3>Traitement lexical</h3>
                <div>
                  <button :disabled="lectureSeule || enregistrementTraitementsLexico || !historiqueTraitementsLexico.length" @click="annulerDernierTraitement">Annuler la dernière modification</button>
                  <button :disabled="lectureSeule || enregistrementTraitementsLexico || !traitementsActifs" @click="executerTraitement(reinitialiserTraitementsLexico, 'Tous les traitements ont été retirés et enregistrés.')">Tout retirer</button>
                </div>
              </header>
              <p v-if="lectureSeule" class="message-traitement avertissement">Les traitements sont consultables, mais ce corpus est en lecture seule.</p>
              <p v-if="messageTraitement" class="message-traitement" role="status">{{ messageTraitement }}</p>
              <fieldset class="zone-traitements" :disabled="lectureSeule || enregistrementTraitementsLexico">
              <div class="colonnes-traitements">
                <article>
                  <h4>Mots outils</h4>
                  <p>Les formes choisies sont retirées de l'index et des concordances.</p>
                  <div class="saisie-traitement"><input v-model="formeOutil" type="text" placeholder="Ajouter une forme" @keyup.enter="ajouterMotOutil"><button @click="ajouterMotOutil">Ajouter</button></div>
                  <div class="listes-predefinies">
                    <span v-for="(_, nom) in LISTES_MOTS_OUTILS" :key="nom" class="liste-predefinie">
                      <button @click="ajouterListeMotsOutils(nom)">+ {{ nom }}<template v-if="traitementsLexico.listesMotsOutils?.[nom] !== undefined"> · modifiée</template></button>
                      <button class="voir-liste" :aria-label="`Voir et modifier la liste ${nom}`" :aria-expanded="listeOutilsOuverte === nom" @click="ouvrirListeMotsOutils(nom)">👁</button>
                    </span>
                  </div>
                  <section v-if="listeOutilsOuverte" class="edition-liste-outils">
                    <header><strong>{{ listeOutilsOuverte }}</strong><button aria-label="Fermer la liste" @click="listeOutilsOuverte = null">✕</button></header>
                    <p>Contenu utilisé par le bouton « + {{ listeOutilsOuverte }} » dans ce corpus.</p>
                    <ul><li v-for="mot in brouillonListeOutils" :key="mot"><span>{{ mot }}</span><button :aria-label="`Retirer ${mot} de la liste`" @click="brouillonListeOutils = brouillonListeOutils.filter((item) => item !== mot)">✕</button></li></ul>
                    <p v-if="!brouillonListeOutils.length" class="vide">Cette liste est vide.</p>
                    <div class="saisie-traitement"><input v-model="nouveauMotListeOutils" type="text" placeholder="Ajouter à cette liste" @keyup.enter.prevent="ajouterAuBrouillonListeOutils"><button @click="ajouterAuBrouillonListeOutils">Ajouter</button></div>
                    <div class="actions-liste-outils"><button @click="enregistrerListeMotsOutils">Enregistrer cette liste</button><button v-if="traitementsLexico.listesMotsOutils?.[listeOutilsOuverte] !== undefined" @click="restaurerListeMotsOutils">Restaurer la liste d’origine</button></div>
                  </section>
                  <ul class="regles"><li v-for="mot in traitementsLexico.motsOutils" :key="mot"><span>{{ mot }}</span><button :title="`Réafficher ${mot}`" @click="executerTraitement(() => retirerMotOutilLexico(mot), 'Mot outil retiré et réglages enregistrés.')">Retirer</button></li></ul>
                  <p v-if="!traitementsLexico.motsOutils.length" class="vide">Aucun mot outil.</p>
                </article>
                <article>
                  <h4>Regroupements et lemmes manuels</h4>
                  <p>Sélectionnez des formes dans le tableau, puis choisissez « Regrouper / lemmatiser ».</p>
                  <ul class="regles"><li v-for="regroupement in traitementsLexico.regroupements" :key="regroupement.id"><span><strong>{{ regroupement.forme }}</strong> ← {{ regroupement.membres.join(', ') }}</span><button @click="executerTraitement(() => retirerRegroupementLexico(regroupement.id), 'Regroupement retiré et réglages enregistrés.')">Retirer</button></li></ul>
                  <p v-if="!traitementsLexico.regroupements.length" class="vide">Aucun regroupement.</p>
                </article>
                <article>
                  <h4>Concaténations</h4>
                  <p>Réunissez des formes successives avec le signe +, par exemple « prise + en + charge ».</p>
                  <label>Suite de formes <input v-model="sequenceConcat" type="text" placeholder="prise + en + charge"></label>
                  <label>Forme obtenue <input v-model="formeConcat" type="text" :placeholder="sequenceConcatTokens.join(' ')"></label>
                  <small v-if="sequenceConcatTokens.length >= 2">{{ occurrencesConcat }} suite(s) trouvée(s).</small>
                  <button :disabled="sequenceConcatTokens.length < 2 || occurrencesConcat < 1" @click="validerConcatenation">Ajouter la concaténation</button>
                  <ul class="regles"><li v-for="regle in traitementsLexico.concatenations" :key="regle.id"><span><strong>{{ regle.forme }}</strong> ← {{ regle.sequence.join(' + ') }}</span><button @click="executerTraitement(() => retirerConcatenationLexico(regle.id), 'Concaténation retirée et réglages enregistrés.')">Retirer</button></li></ul>
                  <p v-if="!traitementsLexico.concatenations.length" class="vide">Aucune concaténation.</p>
                </article>
              </div>
              </fieldset>
            </section>

            <p v-if="!chargementLexico && !lignesAffichees.length" class="vide">Aucune forme ne correspond à cette sélection et à cet affichage.</p>
            <div v-else class="table-wrap">
              <table>
                <thead><tr>
                  <th class="col-selection"><span class="sr-only">Sélection</span></th>
                  <th><button @click="choisirTri('forme')">Forme</button></th>
                  <th><button @click="choisirTri('occurrences')">Occurrences</button></th>
                  <th><button @click="choisirTri('entretiens')">Entretiens</button></th>
                </tr></thead>
                <tbody><tr v-for="ligne in lignesAffichees" :key="ligne.forme" :class="{ selectionnee: formeSelectionnee === ligne.forme }" @click="formeSelectionnee = ligne.forme">
                  <td class="col-selection"><input type="checkbox" :checked="formeCochee(ligne.forme)" :aria-label="`Sélectionner ${ligne.forme}`" @click.stop @change="basculerForme(ligne.forme)"></td>
                  <td>{{ ligne.forme }}</td><td>{{ ligne.occurrences }}</td><td>{{ ligne.entretiens }}</td>
                </tr></tbody>
              </table>
            </div>
            <section v-if="ligneSelectionnee" class="concordances">
              <header><h3>Concordances · {{ ligneSelectionnee.forme }}</h3><button title="Fermer les concordances" @click="formeSelectionnee = ''">✕</button></header>
              <ul><li v-for="occurrence in ligneSelectionnee.details" :key="occurrence.id">
                <button class="concordance" @click="voirOccurrenceLexico(occurrence)">
                  <span class="source">{{ occurrence.titreEntretien }}</span>
                  <span class="avant">{{ occurrence.avant }}</span>
                  <mark>{{ occurrence.texte }}</mark>
                  <span>{{ occurrence.apres }}</span>
                </button>
              </li></ul>
              <p>Le contexte aide à relire l'occurrence ; seul le mot au centre est compté.</p>
            </section>
          </main>

          <aside v-show="panneauVisible" class="filtres" aria-label="Filtres Lexico">
            <div class="onglets" role="tablist" aria-label="Dimensions de sélection">
              <button v-for="cible in (['entretiens', 'variables', 'personnes', 'themes', 'cas'] as Onglet[])" :key="cible"
                role="tab" :aria-selected="onglet === cible" :class="{ actif: onglet === cible }" @click="onglet = cible">
                {{ cible === 'themes' ? 'Thèmes' : cible.charAt(0).toUpperCase() + cible.slice(1) }}
                <span class="badge" :class="{ applique: filtreApplique(cible) }">{{ badge(cible) }}</span>
              </button>
            </div>
            <div class="combinaison">
              <strong>Comment les choix se combinent</strong>
              <span>Dans une liste, un mot peut correspondre à l'un ou l'autre des choix. Entre plusieurs onglets filtrés, il doit répondre à tous les critères à la fois.</span>
              <small>« Sans restriction » signifie que cet onglet ne retire aucun mot.</small>
            </div>
            <div class="option-role"><label><input :checked="filtresLexico.inclureEnqueteurs" type="checkbox" @change="basculerEnqueteurs"> Inclure les paroles des enquêteurs</label></div>

            <section v-if="onglet === 'entretiens'" role="tabpanel">
              <h3>Entretiens</h3>
              <p class="etat-filtre" :class="{ applique: filtresLexico.entretiens.mode === 'choix' }">
                <template v-if="filtresLexico.entretiens.mode === 'sans-restriction'">Sans restriction : les {{ entretiens.length }} entretiens sont inclus. Les cases restent décochées car aucun entretien précis n'est demandé. Les futurs entretiens seront aussi inclus après actualisation.</template>
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
                <template v-if="filtresLexico.personnes.selection.mode === 'sans-restriction'">Sans restriction : toutes les paroles admissibles sont analysées. Les personnes restent décochées car aucune personne précise n'est demandée.</template>
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
                <template v-if="filtresLexico.themes.mode === 'sans-restriction'">Sans restriction : les passages sont analysés avec ou sans thème. Cochez un thème pour limiter l'analyse à ses passages.</template>
                <template v-else>{{ filtresLexico.themes.ids.length }} thème(s) choisi(s). Ce filtre est appliqué.</template>
              </p>
              <div class="actions-liste"><button @click="definirListe('themes', 'retirer')">Retirer ce filtre</button><button @click="definirListe('themes', 'tout')">Tout cocher</button><button @click="definirListe('themes', 'aucun')">Tout décocher</button></div>
              <label v-for="theme in themes" :key="theme.id" class="choix" :style="{ paddingLeft: `${theme.profondeur * 1.1 + .3}rem` }"><input type="checkbox" :checked="cocheListe('themes', theme.id)" @change="modifierListe('themes', theme.id)"> {{ theme.nom }}</label>
            </section>

            <section v-else role="tabpanel">
              <h3>Cas</h3>
              <p class="etat-filtre" :class="{ applique: filtresLexico.cas.mode === 'choix' }">
                <template v-if="filtresLexico.cas.mode === 'sans-restriction'">Sans restriction : les passages sont analysés qu'ils appartiennent ou non à un cas. Cochez un cas pour limiter l'analyse à ses matériaux.</template>
                <template v-else>{{ filtresLexico.cas.ids.length }} cas choisi(s). Ce filtre est appliqué.</template>
              </p>
              <p class="aide">Les matériaux existants des cas sont utilisés, règles et ajouts manuels compris. Cette option n'ajoute aucun passage absent d'un cas.</p>
              <div class="actions-liste"><button @click="definirListe('cas', 'retirer')">Retirer ce filtre</button><button @click="definirListe('cas', 'tout')">Tout cocher</button><button @click="definirListe('cas', 'aucun')">Tout décocher</button></div>
              <label v-for="item in listeCas" :key="item.id" class="choix"><input type="checkbox" :checked="cocheListe('cas', item.id)" @change="modifierListe('cas', item.id)"> <span><small v-if="item.familleId">{{ famillesCas[item.familleId]?.nom }} · </small>{{ item.nom }}</span></label>
            </section>
          </aside>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.fond-lexico { position: fixed; inset: 0; z-index: 910; background: rgba(0,0,0,.48); padding: 1.5vh 1.5vw; box-sizing: border-box; }
.modale-lexico { height: 97vh; display: flex; flex-direction: column; background: #f7f8fb; border-radius: 10px; box-shadow: 0 8px 35px rgba(0,0,0,.32); overflow: hidden; color: #20232a; }
.entete { min-height: 55px; display: flex; align-items: center; justify-content: space-between; padding: .45rem 1rem; background: #fff; border-bottom: 1px solid #d8dbe3; }
h2, h3 { margin: 0; } h2 { font-size: 1.15rem; } h3 { font-size: .95rem; }
.sous-titre { color: #687080; font-size: .76rem; }
button { border: 1px solid #b8bdc8; border-radius: 5px; background: #fff; padding: .35rem .6rem; cursor: pointer; }
button:hover:not(:disabled) { background: #edf3fc; } button:disabled { cursor: default; opacity: .5; }
.actions-entete, .actions-bilan, .exports, .actions-liste { display: flex; gap: .4rem; flex-wrap: wrap; }
.etat { margin: .45rem 1rem 0; padding: .4rem .65rem; border-radius: 5px; font-size: .8rem; }
.etat.attente { background: #eef3ff; border: 1px solid #bdccec; }
.etat.avertissement { background: #fff6dc; border: 1px solid #e4c86b; }
.etat ul { margin: .4rem 0 0; max-height: 7rem; overflow: auto; }
.bilan { padding: .55rem 1rem; border-bottom: 1px solid #d8dbe3; background: #fff; display: flex; justify-content: space-between; align-items: center; gap: .7rem; flex-wrap: wrap; }
.bilan strong { display: block; font-size: .92rem; }.bilan span { font-size: .76rem; color: #5e6571; }
.resume { flex-basis: 100%; margin: .2rem 0 0; padding: .55rem 1.6rem; background: #f5f7fb; border-radius: 5px; }
.resume li { margin: .2rem 0; }.resume .lien { border: 0; color: #155caa; background: none; padding: 0 .4rem; }
.corps { min-height: 0; flex: 1; display: grid; grid-template-columns: minmax(480px, 1fr) minmax(330px, 410px); }
.corps.sans-panneau { grid-template-columns: 1fr; }.resultats { min-width: 0; display: flex; flex-direction: column; padding: .7rem 1rem; overflow: hidden; }
.controles-resultats { display: flex; align-items: end; gap: .7rem; flex-wrap: wrap; padding-bottom: .55rem; }
.controles-resultats label { display: flex; flex-direction: column; gap: .15rem; font-size: .74rem; color: #515967; }
.controles-resultats label.case { flex-direction: row; align-items: center; padding-bottom: .35rem; }
.controles-resultats input[type="search"] { width: 15rem; }.controles-resultats input[type="number"] { width: 5rem; }.controles-resultats > button.actif { background: #e7f0fc; border-color: #3976b8; }
input { border: 1px solid #b8bdc8; border-radius: 4px; padding: .32rem; }.exports { margin-left: auto; }.message-export { flex-basis: 100%; text-align: right; color: #305b28; overflow-wrap: anywhere; }
.barre-selection { display: flex; align-items: center; gap: .45rem; flex-wrap: wrap; margin-bottom: .5rem; padding: .4rem .55rem; border: 1px solid #abc4e3; border-radius: 5px; background: #edf5ff; font-size: .78rem; }.edition-regroupement { display: flex; align-items: end; gap: .5rem; flex-wrap: wrap; margin-bottom: .5rem; padding: .5rem; border: 1px solid #d6bd68; background: #fff8df; font-size: .76rem; }.edition-regroupement label { display: flex; flex-direction: column; gap: .15rem; }.edition-regroupement input { min-width: 15rem; }
.traitements { flex: 0 1 auto; max-height: 48%; overflow: auto; margin-bottom: .6rem; padding: .65rem; border: 1px solid #c9ced8; border-radius: 6px; background: #fff; }.traitements > header { display: flex; justify-content: space-between; gap: .7rem; align-items: flex-start; }.traitements > header > div:last-child { display: flex; flex-wrap: wrap; gap: .35rem; justify-content: flex-end; }.message-traitement { margin: .45rem 0; padding: .3rem .45rem; background: #edf6e9; color: #305b28; }.message-traitement.avertissement { background: #fff5d6; color: #6a4b08; }.zone-traitements { min-width: 0; margin: 0; padding: 0; border: 0; }.colonnes-traitements { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .7rem; }.colonnes-traitements article { min-width: 0; padding: .5rem; border: 1px solid #e0e3e8; border-radius: 5px; }.colonnes-traitements h4 { margin: 0 0 .25rem; font-size: .82rem; }.colonnes-traitements p { margin: .25rem 0; font-size: .7rem; color: #626b78; }.colonnes-traitements label { display: flex; flex-direction: column; gap: .12rem; margin: .3rem 0; font-size: .7rem; }.saisie-traitement { display: flex; gap: .3rem; }.saisie-traitement input { min-width: 0; flex: 1; }.listes-predefinies { display: flex; flex-wrap: wrap; gap: .3rem; margin: .35rem 0; }.liste-predefinie { display: inline-flex; }.listes-predefinies button { padding: .18rem .3rem; font-size: .64rem; }.listes-predefinies .voir-liste { border-left: 0; border-radius: 0 4px 4px 0; }.edition-liste-outils { margin: .4rem 0; padding: .4rem; border: 1px solid #b8c8dc; border-radius: 5px; background: #f5f8fc; }.edition-liste-outils > header, .edition-liste-outils li, .actions-liste-outils { display: flex; justify-content: space-between; align-items: center; gap: .3rem; }.edition-liste-outils ul { display: flex; flex-wrap: wrap; gap: .25rem; max-height: 7rem; overflow: auto; margin: .35rem 0; padding: 0; list-style: none; }.edition-liste-outils li { padding: .16rem .25rem; border: 1px solid #d8dee8; border-radius: 4px; background: #fff; font-size: .68rem; }.edition-liste-outils li button { padding: 0 .15rem; border: 0; }.actions-liste-outils { justify-content: flex-start; flex-wrap: wrap; margin-top: .35rem; }.regles { max-height: 8rem; overflow: auto; list-style: none; margin: .35rem 0 0; padding: 0; }.regles li { display: flex; justify-content: space-between; align-items: center; gap: .35rem; padding: .22rem 0; border-top: 1px solid #edf0f4; font-size: .7rem; }.regles li button { flex: none; padding: .16rem .3rem; font-size: .64rem; }
.table-wrap { flex: 1; min-height: 12rem; overflow: auto; border: 1px solid #d5d9e2; background: #fff; }
table { width: 100%; border-collapse: collapse; font-size: .84rem; }th { position: sticky; top: 0; background: #eef1f7; z-index: 1; text-align: left; }
th button { width: 100%; text-align: inherit; border: 0; background: transparent; font-weight: 700; }th:nth-child(n+3), td:nth-child(n+3) { text-align: right; width: 8rem; }.col-selection { width: 2rem; text-align: center; }.col-selection input { margin: 0; }
td { padding: .3rem .55rem; border-top: 1px solid #edf0f4; }tbody tr { cursor: pointer; }tbody tr:hover, tbody tr.selectionnee { background: #e8f1ff; }.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.vide { color: #707887; font-style: italic; }.concordances { flex: 0 0 34%; min-height: 9rem; margin-top: .6rem; border: 1px solid #d5d9e2; background: #fff; overflow: auto; }
.concordances header { position: sticky; top: 0; display: flex; justify-content: space-between; padding: .45rem .6rem; background: #eef1f7; }.concordances ul { list-style: none; margin: 0; padding: 0; }
.concordances li { border-top: 1px solid #edf0f4; }.concordance { width: 100%; border: 0; border-radius: 0; text-align: left; line-height: 1.45; }.concordance .source { display: block; color: #215b91; font-size: .7rem; }.concordance .avant { color: #666; }.concordances p { margin: .4rem .6rem; color: #687080; font-size: .72rem; }
.filtres { min-width: 0; border-left: 1px solid #cdd2dc; background: #fff; overflow: auto; padding-bottom: 1rem; }.onglets { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; padding: .45rem; gap: .25rem; background: #fff; border-bottom: 1px solid #d8dbe3; }
.onglets button { flex: 1 1 30%; padding: .42rem .25rem; }.onglets button.actif { color: #124d8b; font-weight: 700; background: #e7f0fc; border-color: #3976b8; box-shadow: inset 0 -2px #3976b8; }.badge { display: block; margin-top: .15rem; font-size: .63rem; color: #4f5968; background: #e9ecf1; border-radius: 8px; padding: .05rem .3rem; }.badge.applique { color: #6b4100; background: #ffedb3; font-weight: 700; }
.combinaison { display: flex; flex-direction: column; gap: .18rem; margin: .65rem .75rem; padding: .55rem; border: 1px solid #c9d7ea; border-radius: 5px; background: #f2f7fd; font-size: .76rem; line-height: 1.35; }.combinaison small { color: #596779; }
.filtres > .aide, .filtres section, .option-role { margin: .65rem .75rem; }.aide { color: #606978; font-size: .75rem; }.option-role { padding: .45rem; background: #f2f5fa; font-size: .8rem; }.etat-filtre { margin: .5rem 0; padding: .45rem .55rem; border-left: 3px solid #8b96a6; background: #f1f3f6; color: #4d5663; font-size: .76rem; line-height: 1.35; }.etat-filtre.applique { border-left-color: #c18408; background: #fff5d6; color: #5d4105; }.actions-liste { margin: .5rem 0; }.actions-liste button { font-size: .68rem; padding: .25rem .4rem; }
.choix { display: flex; align-items: flex-start; gap: .3rem; padding: .28rem .3rem; font-size: .82rem; }.choix:hover { background: #f3f6fb; }.choix input { margin-top: .15rem; }.groupe-variable { border-top: 1px solid #e0e3e9; padding: .6rem 0; }.groupe-variable header { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; }.groupe-variable header small { color: #667080; }.groupe-variable header button { margin-left: auto; font-size: .68rem; }
@media (max-width: 1050px) { .colonnes-traitements { grid-template-columns: 1fr; } }
@media (max-width: 820px) { .corps { grid-template-columns: 1fr; overflow: auto; }.resultats { min-height: 65vh; }.filtres { border-left: 0; border-top: 1px solid #cdd2dc; min-height: 45vh; }.exports { margin-left: 0; }.traitements { max-height: none; } }
</style>
