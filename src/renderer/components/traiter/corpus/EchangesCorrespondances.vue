<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue'
import { OPTIONS_TABLE_DEFAUT, aplatirTableV1, type ApercuExportCorrespondance } from '../../../../shared/corpus/tablesCorrespondance'
import type { CibleImportCorrespondance, ChoixCibleCorrespondance, EtatPseudoImporte } from '../../../../shared/corpus/importCorrespondancesEntretiens'
import type { ApercuImportCorrespondance, ChoixImportCorrespondance, CorrectionCorrespondance, DocumentCorrespondance, BilanImportCorrespondance, SuiviImportCorrespondances } from '../../../../shared/corpus/importCorrespondances'
const props = defineProps<{ mode: 'import' | 'export'; importDisponible: boolean }>()
const emit = defineEmits<{ fermer: []; importe: [message: string]; activite: [enCours: boolean] }>()
const options = reactive({ ...OPTIONS_TABLE_DEFAUT })
const exportApercu = ref<ApercuExportCorrespondance | null>(null)
const importApercu = ref<ApercuImportCorrespondance | null>(null)
const suivi = ref<SuiviImportCorrespondances | null>(null)
const suiviIndisponible = ref(true)
const repriseConfirmee = ref(false)
const etatsReprise = { 'a-faire': 'À reprendre', envoi: 'Envoi indéterminé', confirme: 'Publication confirmée', garde: 'Inchangé' }
const documents = ref<DocumentCorrespondance[]>([])
const choix = ref<Record<string, ChoixImportCorrespondance>>({})
const decisionsCibles = ref<Record<string, { selection: boolean; action: ChoixCibleCorrespondance['action']; etat?: EtatPseudoImporte }>>({})
const ciblesConfirmees = ref(false)
const lignesParId = computed(() => new Map(importApercu.value?.lignes.map((l) => [l.id, l]) ?? []))
const ciblesParId = computed(() => new Map(importApercu.value?.cibles?.map((c) => [c.id, c]) ?? []))
const choixCibles = computed<ChoixCibleCorrespondance[]>(() => Object.entries(decisionsCibles.value).filter(([, c]) => c.selection).map(([cibleId, c]) => ({ cibleId, action: c.action, ...(c.etat ? { etat: c.etat } : {}) })))
const editions = ref<Record<string, { entite: string; pseudos: string; categorie: string }>>({})
const corrections = ref<Record<string, CorrectionCorrespondance>>({})
const correctionsValidees = ref<Record<string, CorrectionCorrespondance>>({})
const confidentiel = ref(false)
const limites = ref(false)
const v1 = ref(false)
const enCours = ref(false)
const erreur = ref<string | null>(null)
const message = ref<string | null>(null)
const boite = ref<HTMLDivElement | null>(null)
let generation = 0
let vivant = true
let focusAvant: HTMLElement | null = null
const exportPartiel = computed(() => !!exportApercu.value && (exportApercu.value.indisponibles.length > 0 || exportApercu.value.table.diagnostics.length > 0))
const exportPossible = computed(() => !enCours.value && !!exportApercu.value?.table.correspondances.length && confidentiel.value && (!exportPartiel.value || limites.value))
const importPossible = computed(() => !enCours.value && !suivi.value && !suiviIndisponible.value && props.importDisponible && !Object.keys(corrections.value).length && !!importApercu.value &&
  (importApercu.value.lignes.some((l) => choix.value[l.id] !== 'ignorer') || choixCibles.value.length > 0) &&
  (!choixCibles.value.length || (ciblesConfirmees.value && choixCibles.value.every((c) => ciblesParId.value.get(c.cibleId)?.nature !== 'locuteur' || !!c.etat))))
const effectifs = computed(() => {
  const lignes = exportApercu.value?.table.correspondances ?? []
  return { corpus: lignes.filter((r) => r.nature === 'texte' && r.portee === 'corpus').length, locaux: lignes.filter((r) => r.nature === 'texte' && r.portee === 'texte-local').length, locuteurs: lignes.filter((r) => r.nature === 'locuteur').length }
})
const libellesChoix = { ignorer: 'Ignorer', ajouter: 'Ajouter la définition', variante: 'Variante compatible', remplacer: 'Remplacer la définition' }
const afficher = (v: unknown): string => typeof v === 'string' ? v : Array.isArray(v) && v.every((x) => typeof x === 'string') ? v.join(' / ') : JSON.stringify(v) ?? ''
function nomCible(c: CibleImportCorrespondance): string {
  const ligne = lignesParId.value.get(c.ligneId)
  return `${c.titre} (${c.entretienId}) — ${c.nature === 'locuteur' ? `${c.nom}, locuteur ${c.locuteurIndex}` : afficher(ligne?.entite)} → ${afficher(ligne?.pseudos)} · ${ligne?.fichier ?? ''}`
}
function activite(valeur: boolean) { if (!vivant) return; enCours.value = valeur; emit('activite', valeur) }
function retenirFocus(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!enCours.value) emit('fermer'); return }
  if (e.key !== 'Tab') return
  const controles = [...(boite.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])]
  const premier = controles[0], dernier = controles.at(-1)
  if (!premier) { e.preventDefault(); boite.value?.focus(); return }
  if (e.shiftKey && (document.activeElement === premier || document.activeElement === boite.value)) { e.preventDefault(); dernier?.focus() }
  else if (!e.shiftKey && (document.activeElement === dernier || document.activeElement === boite.value)) { e.preventDefault(); premier.focus() }
}
async function actualiserExport() {
  if (props.mode !== 'export') return
  if (options.nature !== 'texte') options.perimetre = 'corpus-entretiens'
  const capture = ++generation
  exportApercu.value = null; limites.value = false; erreur.value = null
  activite(true)
  try {
    const resultat = await window.sonal.corpus.apercuExportCorrespondances({ ...toRaw(options) })
    if (vivant && capture === generation) exportApercu.value = resultat
  } catch (e) { if (vivant && capture === generation) erreur.value = e instanceof Error ? e.message : 'Lecture impossible.' }
  finally { if (capture === generation) activite(false) }
}
async function exporter(format: 'v2' | 'v1') {
  if (!exportPossible.value || !exportApercu.value || (format === 'v1' && !v1.value)) return
  activite(true); erreur.value = null; message.value = null
  try {
    const resultat = await window.sonal.corpus.exporterCorrespondances(exportApercu.value.token, format, confidentiel.value, limites.value, v1.value)
    if (vivant && !resultat.annule) message.value = 'Table exportée. Aucun fichier source n’a été modifié.'
  } catch (e) { if (vivant) erreur.value = e instanceof Error ? e.message : 'Export impossible.' }
  finally { activite(false) }
}
async function choisirFichiers(e: Event) {
  if (suivi.value || suiviIndisponible.value) return
  const fichiers = [...((e.target as HTMLInputElement).files ?? [])]
  if (!fichiers.length || enCours.value) return
  if (fichiers.length > 20 || fichiers.reduce((n, f) => n + f.size, 0) > 8 * 1024 * 1024) { erreur.value = '20 fichiers et 8 Mio maximum.'; return }
  activite(true); erreur.value = null
  try {
    documents.value = await Promise.all(fichiers.map(async (f) => ({ nom: f.name, texte: await f.text() })))
    corrections.value = {}
    correctionsValidees.value = {}
    await analyserImport()
  } catch (e) { if (vivant) erreur.value = e instanceof Error ? e.message : 'Lecture impossible.' }
  finally { activite(false) }
}
async function analyserImport() {
  if (!documents.value.length || suivi.value || suiviIndisponible.value) return
  activite(true); erreur.value = null; message.value = null
  importApercu.value = null
  try {
    const toutes = { ...correctionsValidees.value }
    for (const [id, correction] of Object.entries(corrections.value)) toutes[id] = { ...toutes[id], ...correction }
    const resultat = await window.sonal.corpus.apercuImportCorrespondances(JSON.parse(JSON.stringify(documents.value)), JSON.parse(JSON.stringify(Object.values(toutes))))
    if (!vivant) return
    importApercu.value = resultat
    decisionsCibles.value = Object.fromEntries((resultat.cibles ?? []).map((c) => [c.id, { selection: false, action: c.actionsPossibles[0] ?? 'ajouter', etat: c.etatPropose }]))
    ciblesConfirmees.value = false
    correctionsValidees.value = toutes
    choix.value = Object.fromEntries(resultat.lignes.map((l) => [l.id, l.defaut]))
    editions.value = Object.fromEntries(resultat.lignes.map((l) => [l.id, { entite: afficher(l.entite), pseudos: afficher(l.pseudos), categorie: typeof l.categorie === 'string' ? l.categorie : '' }]))
    corrections.value = {}
  } catch (e) { if (vivant) erreur.value = e instanceof Error ? e.message : 'Aperçu impossible.' }
  finally { activite(false) }
}
function corriger(id: string, champ: 'entite' | 'pseudos' | 'categorie') {
  const valeur = editions.value[id][champ]
  corrections.value[id] = { ...corrections.value[id], id, [champ]: champ === 'pseudos' ? valeur.split('/').map((v) => v.trim()) : valeur }
}
async function importer() {
  if (!importPossible.value || !importApercu.value) return
  activite(true); erreur.value = null
  const token = importApercu.value.token
  importApercu.value = null
  try {
    const bilan = await window.sonal.corpus.importerCorrespondances(token, { ...toRaw(choix.value) }, JSON.parse(JSON.stringify(choixCibles.value)), ciblesConfirmees.value)
    annoncerImport(bilan)
  } catch (e) {
    if (vivant) { erreur.value = e instanceof Error ? e.message : 'Import impossible. Recalculez l’aperçu.'; await chargerSuivi() }
  } finally { activite(false) }
}
function annoncerImport(bilan: BilanImportCorrespondance) {
  if (vivant) emit('importe', `${bilan.ajouts} ajout(s), ${bilan.variantes} ajout(s) de variante, ${bilan.remplacements} définition(s) remplacée(s), ${bilan.ignores} ligne(s) ignorée(s). ${bilan.entretiens ? `${bilan.entretiens.definitionsLocales} définition(s) locale(s), ${bilan.entretiens.locuteurs} libellé(s) de locuteur modifié(s) dans ${bilan.entretiens.entretiens} entretien(s). Aucune décision textuelle posée ou renommée.` : 'Aucun entretien modifié.'}`)
}
async function chargerSuivi() {
  repriseConfirmee.value = false
  suiviIndisponible.value = true
  const capture = ++generation
  try {
    const resultat = await window.sonal.corpus.suiviImportCorrespondances()
    if (!vivant || capture !== generation) return
    suivi.value = resultat
    suiviIndisponible.value = false
    if (resultat) importApercu.value = null
  } catch { if (vivant && capture === generation) erreur.value ??= 'Suivi indisponible. Aucun nouvel import ni reprise autorisé avant relecture.' }
}
async function actualiserSuivi() {
  if (enCours.value) return
  activite(true); erreur.value = null
  try { await chargerSuivi() } finally { activite(false) }
}
async function reprendre() {
  if (enCours.value || !props.importDisponible || !suivi.value || suiviIndisponible.value || !repriseConfirmee.value) return
  const operationId = suivi.value.operationId
  repriseConfirmee.value = false
  activite(true); erreur.value = null
  try { annoncerImport(await window.sonal.corpus.reprendreImportCorrespondances(operationId, true)) }
  catch (e) {
    if (vivant) { erreur.value = e instanceof Error ? e.message : 'Reprise impossible. Aucun succès acquis n’a été annulé.'; await chargerSuivi() }
  } finally { activite(false) }
}
watch(decisionsCibles, () => { ciblesConfirmees.value = false }, { deep: true, flush: 'sync' })
watch(enCours, async (occupe) => { await nextTick(); if (vivant && occupe) boite.value?.focus() })
watch(options, () => { void actualiserExport() }, { deep: true })
onMounted(() => { focusAvant = document.activeElement as HTMLElement; boite.value?.focus(); if (props.mode === 'export') void actualiserExport(); else void actualiserSuivi() })
onUnmounted(() => { generation++; vivant = false; emit('activite', false); if (focusAvant?.isConnected) focusAvant.focus() })
</script>

<template>
  <div class="echanges-fond" role="dialog" aria-modal="true" aria-labelledby="echanges-titre" @keydown="retenirFocus">
    <div ref="boite" class="echanges-boite" tabindex="-1" :aria-busy="enCours">
      <header><h3 id="echanges-titre">{{ mode === 'export' ? 'Exporter les correspondances' : 'Importer les correspondances' }}</h3><button :disabled="enCours" aria-label="Fermer les échanges" @click="emit('fermer')">Fermer</button></header>
      <p class="attention">Cette table contient les identités originales. Ce n’est pas un document pseudonymisé à diffuser librement.</p>
      <template v-if="mode === 'export'">
        <div class="options">
          <label>Règles<select v-model="options.regles" :disabled="enCours"><option value="utilisees">Seulement utilisées</option><option value="toutes">Toutes, même inutilisées</option></select></label>
          <label>Nature<select v-model="options.nature" :disabled="enCours"><option value="texte-locuteurs">Texte et locuteurs</option><option value="texte">Texte uniquement</option><option value="locuteurs">Locuteurs uniquement</option></select></label>
          <label>Périmètre<select v-model="options.perimetre" :disabled="enCours || options.nature !== 'texte'"><option value="corpus-entretiens">Corpus et entretiens</option><option value="corpus">Corpus uniquement</option></select></label>
          <label><input v-model="options.categories" type="checkbox" :disabled="enCours" /> Inclure les catégories disponibles</label>
        </div>
        <p v-if="options.nature !== 'texte'">Les locuteurs imposent la lecture des entretiens, même sans tour de parole.</p>
        <p v-if="exportApercu?.lecture === 'miroir'" class="attention">Miroir local du poste, pas une lecture du serveur. Il peut inclure des sauvegardes locales non publiées et manquer des publications récentes. Actualisez le corpus avant d’ouvrir ce dialogue. Les modifications non sauvegardées ne sont pas incluses.</p>
        <template v-if="exportApercu">
          <p>{{ effectifs.corpus }} règle(s) corpus · {{ effectifs.locaux }} définition(s) texte local · {{ effectifs.locuteurs }} couple(s) locuteur/pseudo.</p>
          <div class="liste"><table><thead><tr><th>Provenance</th><th>Original</th><th>Pseudonymes</th><th>Entretiens / catégorie</th></tr></thead><tbody>
            <tr v-for="(r, i) in exportApercu.table.correspondances" :key="i"><td>{{ r.nature === 'locuteur' ? 'Locuteur' : r.portee }}</td><td>{{ r.nature === 'locuteur' ? r.nom : r.entite.join(' / ') }}</td><td>{{ r.nature === 'locuteur' ? r.pseudo : r.pseudos.join(' / ') }}<small v-if="r.nature === 'texte' && r.usages.length">Choisis : {{ r.usages.flatMap(u => u.pseudos).join(' / ') }}</small></td><td>{{ r.nature === 'locuteur' ? r.origines.length : r.usages.length }}<small v-if="r.nature === 'texte'">{{ r.categorie }}</small></td></tr>
          </tbody></table></div>
          <details v-if="exportApercu.table.divergencesLocuteurs.length"><summary>{{ exportApercu.table.divergencesLocuteurs.length }} divergence(s) de locuteurs</summary><p v-for="(d, i) in exportApercu.table.divergencesLocuteurs" :key="i">{{ d.nature === 'personne' ? 'Personne commune' : d.cle }} : {{ d.pseudos.join(' / ') }} — {{ d.entretiens.length }} entretiens. Aucun pseudo n’est synchronisé.</p></details>
          <details v-if="exportPartiel"><summary>Limites : {{ exportApercu.indisponibles.length }} entretien(s) indisponible(s), {{ exportApercu.table.diagnostics.length }} diagnostic(s)</summary><p v-for="e in exportApercu.indisponibles" :key="e.id">{{ e.titre }} ({{ e.id }}) : non lu.</p><p v-for="(d, i) in exportApercu.table.diagnostics" :key="i">{{ d.code }} — {{ d.entretienId }} {{ d.annotationId }} {{ d.regleId }}</p></details>
          <label v-if="exportPartiel"><input v-model="limites" type="checkbox" /> J’accepte cet inventaire partiel et ses diagnostics.</label>
          <label><input v-model="confidentiel" type="checkbox" /> Je comprends que le fichier contient les identités originales.</label>
          <details><summary>Export compatible V1 — limites</summary><p>Nature, portée, états et provenance sont aplatis. Les lignes sans pseudo ne sont pas convertibles. Des noms de locuteurs peuvent être interprétés comme règles textuelles par la V1. {{ aplatirTableV1(exportApercu.table).length }} ligne(s) convertie(s).</p><label><input v-model="v1" type="checkbox" /> J’accepte les pertes et ambiguïtés du format V1.</label></details>
        </template>
        <div class="actions"><button :disabled="enCours" @click="actualiserExport">Recalculer l’aperçu</button><button :disabled="!exportPossible" @click="exporter('v2')">Exporter V2</button><button :disabled="!exportPossible || !v1" @click="exporter('v1')">Export compatible V1</button></div>
      </template>
      <template v-else>
        <section v-if="suivi" aria-labelledby="reprise-titre">
          <h4 id="reprise-titre">Import WebDAV à reprendre</h4>
          <p role="status">{{ suivi.confirmes }} fichier(s) confirmé(s), {{ suivi.restants }} à reprendre. <strong v-if="suivi.indeterminee">Un envoi reste indéterminé.</strong></p>
          <p>Les succès acquis restent publiés. Aucun nouvel import ni autre écriture n’est autorisé avant la fin de cette reprise. Il n’y a pas de compensation automatique.</p>
          <p>Lot préparé : {{ suivi.bilanPrevu.entretiens?.definitionsLocales ?? 0 }} définition(s) locale(s), {{ suivi.bilanPrevu.entretiens?.locuteurs ?? 0 }} libellé(s) de locuteur ; {{ suivi.definitionsCorpus ? 'définitions corpus également modifiées' : 'définitions corpus inchangées' }}.</p>
          <ul><li v-for="c in suivi.cibles" :key="c.entretienId">{{ c.titre }} ({{ c.entretienId }}) — {{ etatsReprise[c.etat] }}</li></ul>
          <p class="attention">Après un arrêt brutal, des verrous peuvent rester tenus. Vérifiez les autres postes et faites libérer les verrous par leur détenteur ou l’administrateur. Le même compte Nextcloud peut être actif ailleurs : aucun verrou natif n’est forcé ni libéré automatiquement.</p>
          <p>La reprise relit tout le lot et refuse un contenu modifié, même déjà confirmé. En cas de refus concurrent, conservez ce suivi et faites examiner le conflit ; n’écrasez pas le fichier pour contourner le contrôle.</p>
          <label><input v-model="repriseConfirmee" type="checkbox" :disabled="enCours || suiviIndisponible || !importDisponible" /> Je confirme la reprise de ce lot préparé, sans rejouer les succès acquis.</label>
          <button :disabled="enCours || suiviIndisponible || !importDisponible || !repriseConfirmee" @click="reprendre">Reprendre l’import WebDAV</button>
        </section>
        <p v-if="suiviIndisponible && !enCours" role="status">Le suivi n’a pas pu être relu ; aucune application n’est autorisée.</p>
        <button v-if="suivi || suiviIndisponible" :disabled="enCours" @click="actualiserSuivi">Relire le suivi WebDAV</button>
        <template v-if="!suivi && !suiviIndisponible">
        <p>L’import ne pose jamais d’occurrence textuelle. Les divergences du corpus sont ignorées par défaut. Choisissez séparément chaque entretien et locuteur cible ; aucune cible n’est sélectionnée automatiquement.</p>
        <label>Fichiers JSON<input type="file" accept=".json,application/json" multiple :disabled="enCours" @change="choisirFichiers" /></label>
        <p v-if="importApercu?.lecture === 'miroir'">L’aperçu utilise le miroir. Les définitions sont revalidées sur la base fraîche sous droit avant publication ; un changement impose un nouvel aperçu. Un aperçu miroir ne permet aucun import ciblé.</p>
        <p v-if="importApercu?.lecture === 'gitlab'">L’aperçu lit un commit publié de GitLab, pas le miroir. Fermez les sessions des cibles avant confirmation. Le choix est revalidé sous baux et publié dans un seul commit ; un changement refuse tout le groupe. Une publication indéterminée exige la réouverture du corpus, sans rejeu de l’import.</p>
        <p v-if="importApercu?.lecture === 'webdav'">L’aperçu lit le serveur WebDAV, pas le miroir. Fermez toutes les sessions locales ou récupérables avant confirmation. Le lot est revalidé sous verrous, puis publié fichier par fichier avec garde de version : il n’est pas atomique. Une interruption conserve les succès acquis et exige une reprise confirmée ; aucune compensation automatique.</p>
        <p v-if="!importDisponible">Application indisponible en lecture seule ou hors ligne ; l’aperçu reste consultable.</p>
        <div v-if="importApercu" class="liste"><table><thead><tr><th>État / source</th><th>Définition</th><th>Décision</th></tr></thead><tbody><tr v-for="l in importApercu.lignes" :key="l.id">
          <td>{{ l.etat === 'hors-perimetre' ? 'Ciblage par entretien' : l.etat }}<small>{{ l.fichier }} · {{ l.nature }} {{ l.portee }}</small></td>
          <td><template v-if="l.nature === 'texte' && !l.erreur"><label>Alias<input v-model="editions[l.id].entite" :disabled="enCours" @input="corriger(l.id, 'entite')" /></label><label>Pseudos (séparés par /)<input v-model="editions[l.id].pseudos" :disabled="enCours" @input="corriger(l.id, 'pseudos')" /></label><label>Catégorie<input v-model="editions[l.id].categorie" :disabled="enCours" @input="corriger(l.id, 'categorie')" /></label></template><template v-else>{{ afficher(l.entite) }} → {{ afficher(l.pseudos) }}</template><small v-if="l.entretiensOrigine?.length">Entretiens d’origine : {{ l.entretiensOrigine.join(', ') }}</small><small>{{ l.motif }}</small></td>
          <td><small v-if="l.etat === 'hors-perimetre'">{{ importApercu.lecture !== 'miroir' ? 'Choisissez les cibles ci-dessous.' : 'Ciblage WebDAV indisponible.' }}</small><select v-else v-model="choix[l.id]" :disabled="enCours || !importDisponible || l.choix.length === 1" aria-label="Résolution de la ligne"><option v-for="c in l.choix" :key="c" :value="c">{{ libellesChoix[c] }}</option></select></td>
        </tr></tbody></table></div>
        <p v-if="importApercu?.indisponibles?.length" role="status">Entretiens non disponibles, donc non ciblables : {{ importApercu.indisponibles.map((e) => e.titre).join(', ') }}.</p>
        <template v-if="importApercu?.cibles?.length">
          <h4>{{ importApercu.lecture === 'gitlab' ? 'Entretiens GitLab ciblés' : importApercu.lecture === 'webdav' ? 'Entretiens WebDAV ciblés' : 'Cibles locales' }} — sélection explicite</h4>
          <p>Un même nom ne garantit pas la même personne. Vérifiez l’entretien et l’index local. Aucun lien Personne n’est réassigné et aucun locuteur absent n’est créé.</p>
          <div class="liste"><table><thead><tr><th>Sélection / destination</th><th>Source et état actuel</th><th>Action ciblée</th></tr></thead><tbody><tr v-for="c in importApercu.cibles" :key="c.id">
            <td><label><input v-model="decisionsCibles[c.id].selection" type="checkbox" :aria-label="nomCible(c)" :disabled="enCours || !importDisponible || !c.actionsPossibles.length" /> {{ c.titre }} ({{ c.entretienId }})<template v-if="c.nature === 'locuteur'"> — {{ c.nom }}, locuteur {{ c.locuteurIndex }}</template></label></td>
            <td>{{ afficher(lignesParId.get(c.ligneId)?.entite) }} → {{ afficher(lignesParId.get(c.ligneId)?.pseudos) }}<small>{{ lignesParId.get(c.ligneId)?.fichier }}<template v-if="c.nature === 'texte'"> · catégorie proposée : {{ lignesParId.get(c.ligneId)?.categorie || 'aucune' }}</template></small><small>Actuellement : {{ c.pseudosAvant.join(' / ') || 'aucun pseudo déclaré' }} {{ c.categorieAvant ? `· ${c.categorieAvant}` : '' }} {{ c.etatAvant ? `· ${c.etatAvant}` : '' }}</small><small>{{ c.motif }}</small></td>
            <td><label v-if="c.nature === 'texte'">Définition locale<select v-model="decisionsCibles[c.id].action" :aria-label="`Définition locale — ${nomCible(c)}`" :disabled="enCours || !importDisponible"><option v-for="action in c.actionsPossibles" :key="action" :value="action">{{ libellesChoix[action] }}</option></select></label><label v-else>Décision du locuteur<select v-model="decisionsCibles[c.id].etat" :aria-label="`Décision du locuteur — ${nomCible(c)}`" :disabled="enCours || !importDisponible"><option :value="undefined">Choisir explicitement</option><option value="confirme">Pseudo confirmé</option><option value="refuse">Pseudo refusé</option><option value="non-precise">Décision non précisée</option></select></label></td>
          </tr></tbody></table></div>
          <label><input v-model="ciblesConfirmees" type="checkbox" :disabled="enCours || !choixCibles.length" /> Je confirme ces seuls entretiens et décisions. L’import ne synchronise pas les Personnes et ne modifie aucune occurrence textuelle.</label>
        </template>
        <p v-if="Object.keys(corrections).length">Corrections en attente : recalculez pour les valider et choisir les résolutions. Les choix sont remis à leur défaut.</p>
        <div class="actions"><button :disabled="enCours || !documents.length" @click="analyserImport">Recalculer l’aperçu</button><button :disabled="!importPossible" @click="importer">{{ choixCibles.length ? 'Confirmer l’import ciblé' : 'Confirmer l’import des définitions' }}</button></div>
        </template>
      </template>
      <p v-if="enCours" role="status">Traitement en cours…</p><p v-if="erreur" class="erreur" role="alert">{{ erreur }}</p><p v-if="message" role="status">{{ message }}</p>
    </div>
  </div>
</template>

<style scoped>
.echanges-fond { position: fixed; inset: 0; z-index: 210; background: #0006; display: grid; place-items: center; }
.echanges-boite { box-sizing: border-box; background: white; width: min(1000px, 94vw); max-height: 92dvh; overflow: auto; padding: 1.2rem; border-radius: 8px; font-size: .9rem; }
header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
h3 { margin: 0; }
.attention { background: #fff3df; padding: .6rem; border-left: 3px solid #ad6800; }
.options { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: .7rem; }
label { display: block; margin: .4rem 0; }
.options select, td input:not([type="checkbox"]), td select { display: block; width: 100%; box-sizing: border-box; }
td input[type="checkbox"] { width: auto; }
.liste { max-height: 42dvh; overflow: auto; margin: .7rem 0; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; }
th:first-child { width: 24%; }
th:last-child { width: 28%; }
th { position: sticky; top: 0; background: #edf1f6; text-align: left; }
td, th { padding: .5rem; border: 1px solid #ddd; vertical-align: top; overflow-wrap: anywhere; }
small { display: block; color: #555; margin-top: .3rem; }
select, input, button { font: inherit; }
button { padding: .4rem .6rem; cursor: pointer; }
button:disabled { cursor: not-allowed; }
.actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .8rem; }
.erreur { color: #a12020; }
</style>
