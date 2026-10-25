<script setup lang="ts">
import { computed, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import type { OngletFiltresLexico } from '../../composables/corpus/useLexicoCorpus'
import { exporterTableauLexico, type FormatExportLexico } from '../../../shared/lexico/export'
import { compterConcatenationsLexico, LISTES_MOTS_OUTILS, normaliserFormeLexico } from '../../../shared/lexico/traitements'

// Panneau droit de Lexico : bilan, tableau, concordances et traitement lexical.
// Les filtres sont dans LexicoCote.vue.
const {
  chargementLexico, progressionLexico, lignesLexico,
  occurrencesRetenuesLexico, diagnosticsLexico,
  filtresLexico, resultatsPerimesLexico, entretiensAvecResultatsLexico,
  lignesResumeLexico, criteresActifsLexico, exportLexicoPossible,
  actualiserLexico, reinitialiserSelectionLexico,
  traitementsLexico, historiqueTraitementsLexico, enregistrementTraitementsLexico, occurrencesLexico,
  ajouterMotsOutilsLexico, retirerMotOutilLexico,
  personnaliserListeMotsOutilsLexico, restaurerListeMotsOutilsLexico,
  regrouperFormesLexico, retirerRegroupementLexico,
  ajouterConcatenationLexico, retirerConcatenationLexico,
  annulerTraitementLexico, reinitialiserTraitementsLexico,
  voirOccurrenceLexico, membership, variables, lectureSeule,
  ongletFiltresLexico, panneauAnalyseVisible, basculerPanneauAnalyse, afficherPanneauAnalyse,
} = utiliserSonal()

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

/** « Modifier » dans le résumé : ouvre la bonne dimension à gauche. */
function modifierDepuisResume(index: number) {
  const ligne = lignesResumeLexico.value[index] ?? ''
  const cible: OngletFiltresLexico = ligne.startsWith('Entretiens') ? 'entretiens'
    : ligne.startsWith('Personnes') ? 'personnes'
      : ligne.startsWith('Dans les thèmes') ? 'themes'
        : ligne.startsWith('Dans les matériaux') ? 'cas' : 'variables'
  ongletFiltresLexico.value = cible
  afficherPanneauAnalyse()
}

function criteresExport(): string[] {
  const privees = variables.value.filter((variable) => variable.priv).map((variable) => variable.lib)
  const criteres = lignesResumeLexico.value.map((ligne) => {
    if (ligne.startsWith('Personnes :')) return 'Filtre de personnes appliqué (identités non exportées)'
    if (privees.some((nom) => ligne.includes(nom))) return 'Filtre sur une variable privée appliqué (détail non exporté)'
    return ligne
  })
  const selection = filtresLexico.value.entretiens
  const ids = selection.mode === 'sans-restriction' ? Object.keys(membership.value) : selection.ids
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
</script>

<template>
  <div class="panneau-lexico" aria-label="Lexico">
    <header class="entete">
      <div>
        <h2>🔤 Lexico</h2>
        <span class="sous-titre">Index lexical du texte pseudonymisé</span>
      </div>
      <div class="actions-entete">
        <button :disabled="chargementLexico" @click="actualiserLexico">Actualiser</button>
        <button @click="basculerPanneauAnalyse()">{{ panneauAnalyseVisible ? 'Masquer' : 'Afficher' }} les filtres</button>
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
      </div>
      <ul v-if="detailVisible" class="resume">
        <li v-for="(ligne, index) in lignesResumeLexico" :key="ligne">
          <span>{{ ligne }}</span>
          <button v-if="index < lignesResumeLexico.length - 2" class="lien" @click="modifierDepuisResume(index)">Modifier</button>
        </li>
      </ul>
    </section>

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
  </div>
</template>

<style scoped>
.panneau-lexico { display: flex; flex-direction: column; min-height: 0; height: 100%; background: #f7f8fb; border-radius: 8px; overflow: hidden; color: #20232a; }
.entete { min-height: 3.2rem; display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.45rem 0.85rem; background: #fff; border-bottom: 1px solid #d8dbe3; }
h2, h3 { margin: 0; }
h2 { font-size: 1.15rem; }
h3 { font-size: 0.95rem; }
.sous-titre { color: #687080; font-size: 0.76rem; }
.actions-entete, .actions-bilan, .exports, .actions-liste { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.etat { margin: 0.45rem 0.85rem 0; padding: 0.4rem 0.65rem; border-radius: 5px; font-size: 0.8rem; }
.etat.attente { background: #eef3ff; border: 1px solid #bdccec; }
.etat.avertissement { background: #fff6dc; border: 1px solid #e4c86b; }
.etat ul { margin: 0.4rem 0 0; max-height: 7rem; overflow: auto; }
.bilan { padding: 0.55rem 0.85rem; border-bottom: 1px solid #d8dbe3; background: #fff; display: flex; justify-content: space-between; align-items: center; gap: 0.7rem; flex-wrap: wrap; }
.bilan strong { display: block; font-size: 0.92rem; }
.bilan span { font-size: 0.76rem; color: #5e6571; }
.resume { flex-basis: 100%; margin: 0.2rem 0 0; padding: 0.55rem 1.6rem; background: #f5f7fb; border-radius: 5px; }
.resume li { margin: 0.2rem 0; }
.resume .lien { border: 0; color: #155caa; background: none; padding: 0 0.4rem; }
.resultats { min-height: 0; flex: 1; display: flex; flex-direction: column; padding: 0.7rem 0.85rem; overflow: hidden; }
.controles-resultats { display: flex; align-items: end; gap: 0.7rem; flex-wrap: wrap; padding-bottom: 0.55rem; }
.controles-resultats label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.74rem; color: #515967; }
.controles-resultats label.case { flex-direction: row; align-items: center; padding-bottom: 0.35rem; }
.controles-resultats input[type="search"] { width: 13rem; }
.controles-resultats input[type="number"] { width: 5rem; }
.controles-resultats > button.actif { background: #e7f0fc; border-color: #3976b8; }
input { border: 1px solid #b8bdc8; border-radius: 4px; padding: 0.32rem; }
.exports { margin-left: auto; }
.message-export { flex-basis: 100%; text-align: right; color: #305b28; overflow-wrap: anywhere; }
.barre-selection { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; margin-bottom: 0.5rem; padding: 0.4rem 0.55rem; border: 1px solid #abc4e3; border-radius: 5px; background: #edf5ff; font-size: 0.78rem; }
.edition-regroupement { display: flex; align-items: end; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; padding: 0.5rem; border: 1px solid #d6bd68; background: #fff8df; font-size: 0.76rem; }
.edition-regroupement label { display: flex; flex-direction: column; gap: 0.15rem; }
.edition-regroupement input { min-width: 15rem; }
.traitements { flex: 0 1 auto; max-height: 48%; overflow: auto; margin-bottom: 0.6rem; padding: 0.65rem; border: 1px solid #c9ced8; border-radius: 6px; background: #fff; }
.traitements > header { display: flex; justify-content: space-between; gap: 0.7rem; align-items: flex-start; }
.traitements > header > div:last-child { display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: flex-end; }
.message-traitement { margin: 0.45rem 0; padding: 0.3rem 0.45rem; background: #edf6e9; color: #305b28; }
.message-traitement.avertissement { background: #fff5d6; color: #6a4b08; }
.zone-traitements { min-width: 0; margin: 0; padding: 0; border: 0; }
.colonnes-traitements { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.7rem; }
.colonnes-traitements article { min-width: 0; padding: 0.5rem; border: 1px solid #e0e3e8; border-radius: 5px; }
.colonnes-traitements h4 { margin: 0 0 0.25rem; font-size: 0.82rem; }
.colonnes-traitements p { margin: 0.25rem 0; font-size: 0.7rem; color: #626b78; }
.colonnes-traitements label { display: flex; flex-direction: column; gap: 0.12rem; margin: 0.3rem 0; font-size: 0.7rem; }
.saisie-traitement { display: flex; gap: 0.3rem; }
.saisie-traitement input { min-width: 0; flex: 1; }
.listes-predefinies { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0.35rem 0; }
.liste-predefinie { display: inline-flex; }
.listes-predefinies button { padding: 0.18rem 0.3rem; font-size: 0.64rem; }
.listes-predefinies .voir-liste { border-left: 0; border-radius: 0 4px 4px 0; }
.edition-liste-outils { margin: 0.4rem 0; padding: 0.4rem; border: 1px solid #b8c8dc; border-radius: 5px; background: #f5f8fc; }
.edition-liste-outils > header, .edition-liste-outils li, .actions-liste-outils { display: flex; justify-content: space-between; align-items: center; gap: 0.3rem; }
.edition-liste-outils ul { display: flex; flex-wrap: wrap; gap: 0.25rem; max-height: 7rem; overflow: auto; margin: 0.35rem 0; padding: 0; list-style: none; }
.edition-liste-outils li { padding: 0.16rem 0.25rem; border: 1px solid #d8dee8; border-radius: 4px; background: #fff; font-size: 0.68rem; }
.edition-liste-outils li button { padding: 0 0.15rem; border: 0; }
.actions-liste-outils { justify-content: flex-start; flex-wrap: wrap; margin-top: 0.35rem; }
.regles { max-height: 8rem; overflow: auto; list-style: none; margin: 0.35rem 0 0; padding: 0; }
.regles li { display: flex; justify-content: space-between; align-items: center; gap: 0.35rem; padding: 0.22rem 0; border-top: 1px solid #edf0f4; font-size: 0.7rem; }
.regles li button { flex: none; padding: 0.16rem 0.3rem; font-size: 0.64rem; }
.table-wrap { flex: 1; min-height: 12rem; overflow: auto; border: 1px solid #d5d9e2; background: #fff; }
table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
th { position: sticky; top: 0; background: #eef1f7; z-index: 1; text-align: left; }
th button { width: 100%; text-align: inherit; border: 0; background: transparent; font-weight: 700; }
th:nth-child(n+3), td:nth-child(n+3) { text-align: right; width: 8rem; }
.col-selection { width: 2rem; text-align: center; }
.col-selection input { margin: 0; }
td { padding: 0.3rem 0.55rem; border-top: 1px solid #edf0f4; }
tbody tr { cursor: pointer; }
tbody tr:hover, tbody tr.selectionnee { background: #e8f1ff; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
.vide { color: #707887; font-style: italic; }
.concordances { flex: 0 0 34%; min-height: 9rem; margin-top: 0.6rem; border: 1px solid #d5d9e2; background: #fff; overflow: auto; }
.concordances header { position: sticky; top: 0; display: flex; justify-content: space-between; padding: 0.45rem 0.6rem; background: #eef1f7; }
.concordances ul { list-style: none; margin: 0; padding: 0; }
.concordances li { border-top: 1px solid #edf0f4; }
.concordance { width: 100%; border: 0; border-radius: 0; text-align: left; line-height: 1.45; }
.concordance .source { display: block; color: #215b91; font-size: 0.7rem; }
.concordance .avant { color: #666; }
.concordances p { margin: 0.4rem 0.6rem; color: #687080; font-size: 0.72rem; }
@media (max-width: 1050px) { .colonnes-traitements { grid-template-columns: 1fr; } }
@media (max-width: 780px) {
  .exports { margin-left: 0; }
  .resultats { overflow: visible; }
  .traitements { max-height: none; }
  .entete { align-items: flex-start; flex-wrap: wrap; }
}
</style>
