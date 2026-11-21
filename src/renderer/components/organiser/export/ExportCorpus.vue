<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import {
  LIBELLES_OPTIONS,
  type FormatExport,
  type OptionsExport,
} from '../../../../shared/export/types'
import { OPTIONS_IRAMUTEQ_DEFAUT, type OptionsIramuteq } from '../../../../shared/export/iramuteq'
import { scinderNomDescriptionTheme } from '../../../../shared/corpus/categories'
import type {
  ApercuRapportPseudonymisationCorpus,
  DemandeLotCorpus,
  ResultatLotCorpus,
} from '../../../export/exportCorpus'

const props = defineProps<{ actif: boolean }>()

const {
  exporterCorpusLot,
  enregistrerExportGuide,
  exporterQualcoderLot,
  exporterIramuteqLot,
  exportCorpusEnCours: occupe,
  listeCas,
  preparerRapportCorpus,
  enregistrerRapportCorpus,
  listeEntretiens,
  ouvertId,
  variables: variablesCorpus,
  codebook,
} = utiliserSonal()

/** Liste des entretiens du corpus, dans l'ordre de la grille. */
const entretiens = computed(() => listeEntretiens())

/** Le rapport et le résultat s'affichent à côté des réglages. */
const etape = ref<'options' | 'rapport' | 'traitement' | 'resume'>('options')
const modeExport = ref<'lecture' | 'qualcoder' | 'iramuteq'>('lecture')
const casSelectionnes = ref<Set<string>>(new Set(listeCas.value.map((cas) => cas.id)))

/** Entretiens cochés (tous par défaut). */
const selectionnes = ref<Set<string>>(new Set(entretiens.value.map((e) => e.id)))
/** Filtre d'affichage de la liste, utile pour un corpus avec beaucoup d'entretiens. */
const filtreEntretiens = ref('')
const SEUIL_FILTRE = 8
const entretiensAffiches = computed(() => {
  const requete = filtreEntretiens.value.trim().toLocaleLowerCase('fr')
  if (!requete) return entretiens.value
  return entretiens.value.filter((e) => e.titre.toLocaleLowerCase('fr').includes(requete))
})
const tous = computed({
  get: () => entretiens.value.length > 0 && selectionnes.value.size === entretiens.value.length,
  set: (v: boolean) => {
    selectionnes.value = v ? new Set(entretiens.value.map((e) => e.id)) : new Set()
  },
})

/** Formats de lecture cochés : TXT et HTML par entretien, DOCX/PDF combinés. */
const FORMATS_LOT: FormatExport[] = ['txt', 'html', 'docx', 'pdf']
const formats = ref<Set<FormatExport>>(new Set(['txt']))

/** Options : mêmes libellés que l'export d'entretien, appliquées par entretien. */
const options = ref<OptionsExport>({
  entete: true,
  notes: true,
  vars: true,
  time: true,
  loc: false,
  thm: true,
  anon: true,
})
const copierMedias = ref(true)
// IRaMuTeQ propose par défaut l'encodage du système : Windows-1252 sous Windows.
const optionsIramuteq = ref<OptionsIramuteq>({
  ...OPTIONS_IRAMUTEQ_DEFAUT,
  encodage: window.sonal.platform === 'win32' ? 'windows-1252' : 'utf8',
})

/** Variables proposées pour IRaMuTeQ : les privées seulement si l'utilisateur le demande. */
const variablesProposees = computed(() =>
  variablesCorpus.value
    .filter((v) => optionsIramuteq.value.variablesPrivees || !v.priv)
    .sort((a, b) => a.ordre - b.ordre),
)
const aDesVariablesPrivees = computed(() => variablesCorpus.value.some((v) => v.priv))
const aDesSousThemes = computed(() => themesProposes.value.some((t) => t.profondeur > 0))
/** Thèmes exportables, dans l'ordre de la grille, avec leur niveau dans l'arborescence. */
const themesProposes = computed(() =>
  codebook.value
    .filter((c) => c.codeExport)
    .map((c) => ({ id: c.id, nom: scinderNomDescriptionTheme(c.nom).nom || c.codeExport, profondeur: profondeurTheme(c.id) })),
)
function profondeurTheme(id: string): number {
  let profondeur = 0
  let parent = codebook.value.find((c) => c.id === id)?.parent ?? null
  const vus = new Set<string>()
  while (parent && !vus.has(parent)) {
    vus.add(parent)
    profondeur++
    parent = codebook.value.find((c) => c.id === parent)?.parent ?? null
  }
  return profondeur
}
// On retient ce qui est décoché : une variable ou un thème créé ensuite reste inclus.
const variablesExclues = ref<Set<string>>(new Set())
const themesExclus = ref<Set<string>>(new Set())
const variablesIramuteq = computed(() =>
  variablesProposees.value.filter((v) => !variablesExclues.value.has(v.id)).map((v) => v.id),
)
const themesIramuteq = computed(() =>
  themesProposes.value.filter((t) => !themesExclus.value.has(t.id)).map((t) => t.id),
)
const toutesVariables = computed({
  get: () => variablesProposees.value.length > 0 && variablesIramuteq.value.length === variablesProposees.value.length,
  set: (v: boolean) => {
    variablesExclues.value = v ? new Set() : new Set(variablesProposees.value.map((x) => x.id))
  },
})
const tousThemes = computed({
  get: () => themesProposes.value.length > 0 && themesIramuteq.value.length === themesProposes.value.length,
  set: (v: boolean) => {
    themesExclus.value = v ? new Set() : new Set(themesProposes.value.map((x) => x.id))
  },
})
/** Les thèmes ne servent que si le texte est découpé selon eux. */
const themesUtilesIramuteq = computed(
  () => optionsIramuteq.value.unite === 'passage' || optionsIramuteq.value.thematiques,
)
const aideHeritage = ref(false)
function basculerExclusion(ensemble: Set<string>, id: string): void {
  if (ensemble.has(id)) ensemble.delete(id)
  else ensemble.add(id)
}
function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? 's' : ''}`
}

const rapportDemande = ref(false)
const apercuRapport = ref<ApercuRapportPseudonymisationCorpus | null>(null)

/** Traitement en cours : progression « k / n — Titre… », arrêt demandé. */
const progression = ref<{ faits: number; total: number; titre: string } | null>(null)
const arretDemande = ref(false)
const arretPrisEnCompte = ref(false)
const resultat = ref<ResultatLotCorpus | null>(null)
const resultatQualcoder = ref<
  | { etat: 'succes'; dossier: string }
  | { etat: 'annule' }
  | { etat: 'echec'; message: string }
  | null
>(null)
const resultatIramuteq = ref<{ chemin: string; textes: number; vides: string[]; encodage: string } | null>(null)

const message = ref<string | null>(null)
const messageEstErreur = ref(true)

let generationRapport = 0

// Un changement de réglage demande une nouvelle vérification avant l'export.
watch([selectionnes, modeExport, casSelectionnes, formats, options, copierMedias, rapportDemande, optionsIramuteq, variablesExclues, themesExclus], () => {
  generationRapport += 1
  apercuRapport.value = null
  resultat.value = null
  resultatQualcoder.value = null
  resultatIramuteq.value = null
  message.value = null
  etape.value = 'options'
}, { deep: true, flush: 'sync' })

// Les sources peuvent être modifiées dans un autre outil : le rapport devra être relu.
watch(() => props.actif, (actif) => {
  if (actif) return
  generationRapport += 1
  apercuRapport.value = null
  if (etape.value === 'rapport') etape.value = 'options'
}, { flush: 'sync' })

/** La sélection ne conserve que les entretiens encore présents. */
watch(entretiens, (liste) => {
  for (const id of selectionnes.value) {
    if (!liste.some((e) => e.id === id)) selectionnes.value.delete(id)
  }
})

watch(listeCas, (liste) => {
  for (const id of casSelectionnes.value) {
    if (!liste.some((cas) => cas.id === id)) casSelectionnes.value.delete(id)
  }
})

const libellesFormats: Record<FormatExport, string> = {
  txt: 'Texte brut (.txt) — un fichier par entretien',
  html: 'Page web autonome (.html) — un fichier par entretien, codage + son',
  docx: 'Document combiné (.docx) — une section par entretien',
  pdf: 'PDF combiné — une section par entretien',
  sonal: '',
  srt: '',
  vtt: '',
}

/** L'option « copier les médias » n'a de sens que si l'HTML sort. */
const copierMediasVisible = computed(() => formats.value.has('html'))

function changerCas(event: Event, id: string): void {
  const target = event.target as HTMLInputElement
  if (target.checked) casSelectionnes.value.add(id)
  else casSelectionnes.value.delete(id)
}

function changerTousLesCas(event: Event): void {
  const target = event.target as HTMLInputElement
  casSelectionnes.value = target.checked ? new Set(listeCas.value.map((cas) => cas.id)) : new Set()
}

function basculerFormat(f: FormatExport): void {
  if (formats.value.has(f)) {
    if (formats.value.size === 1) return
    formats.value.delete(f)
  } else {
    formats.value.add(f)
  }
  apercuRapport.value = null
  message.value = null
}

function demandeCourante(): DemandeLotCorpus | null {
  const selection = entretiens.value
    .filter((e) => selectionnes.value.has(e.id))
    .map((e) => ({ id: e.id, titre: e.titre, date: e.date }))
  if (selection.length === 0) return null
  return {
    selection,
    idOuvert: ouvertId.value,
    formats: [...formats.value],
    options: { ...options.value },
    copierMedias: copierMediasVisible.value && copierMedias.value,
    enregistrerRapport: false,
  }
}

async function lancerQualcoder(): Promise<void> {
  if (occupe.value || selectionnes.value.size === 0) return
  occupe.value = true
  message.value = null
  messageEstErreur.value = true
  etape.value = 'traitement'
  const selection = entretiens.value
    .filter((e) => selectionnes.value.has(e.id))
    .map((e) => ({ id: e.id, titre: e.titre, date: e.date }))
  try {
    const r = await exporterQualcoderLot(selection, [...casSelectionnes.value])
    resultatQualcoder.value = r
    etape.value = 'resume'
  } catch (erreur) {
    message.value = `L'export QualCoder a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`
    etape.value = 'options'
  } finally {
    occupe.value = false
    progression.value = null
  }
}

async function lancerIramuteq(): Promise<void> {
  if (occupe.value || selectionnes.value.size === 0) return
  occupe.value = true
  message.value = null
  messageEstErreur.value = true
  etape.value = 'traitement'
  const selection = entretiens.value
    .filter((e) => selectionnes.value.has(e.id))
    .map((e) => ({ id: e.id, titre: e.titre, date: e.date }))
  try {
    const r = await exporterIramuteqLot(selection, {
      ...optionsIramuteq.value,
      variables: variablesIramuteq.value,
      themes: themesIramuteq.value,
    })
    if (r.etat === 'succes') {
      resultatIramuteq.value = { ...r, encodage: optionsIramuteq.value.encodage === 'windows-1252' ? 'cp1252' : 'utf-8' }
      etape.value = 'resume'
      return
    }
    if (r.etat === 'echec') message.value = r.message
    etape.value = 'options'
  } catch (erreur) {
    message.value = `L'export IRaMuTeQ a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`
    etape.value = 'options'
  } finally {
    occupe.value = false
  }
}

/** Le premier clic prépare l'aperçu demandé, sans lancer l'export final. */
async function lancerExport(): Promise<void> {
  if (modeExport.value === 'qualcoder') {
    await lancerQualcoder()
    return
  }
  if (modeExport.value === 'iramuteq') {
    await lancerIramuteq()
    return
  }
  const demande = demandeCourante()
  if (!demande || occupe.value) return
  if (options.value.anon && rapportDemande.value && !apercuRapport.value) {
    occupe.value = true
    message.value = null
    messageEstErreur.value = true
    try {
      const generation = generationRapport
      const preparation = await preparerRapportCorpus(demande)
      if (generation !== generationRapport) return
      if (preparation.etat === 'erreur') {
        message.value = preparation.message
        return
      }
      apercuRapport.value = preparation.apercu
      etape.value = 'rapport'
    } finally {
      occupe.value = false
    }
    return
  }
  await lancerExportFinal()
}

async function lancerExportFinal(): Promise<void> {
  const demande = demandeCourante()
  if (!demande || occupe.value) return
  occupe.value = true
  arretDemande.value = false
  arretPrisEnCompte.value = false
  message.value = null
  messageEstErreur.value = true
  etape.value = 'traitement'
  try {
    const r = await exporterCorpusLot(
      demande,
      {
        surProgression: (faits, total, titre) => {
          progression.value = { faits, total, titre }
        },
        continu: () => !arretDemande.value,
      },
    )
    resultat.value = r
    enregistrerExportGuide(demande, r)
    etape.value = 'resume'
  } catch (erreur) {
    message.value = `L'export du corpus a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`
    etape.value = apercuRapport.value ? 'rapport' : 'options'
  } finally {
    occupe.value = false
    progression.value = null
  }
}

async function sauvegarderRapport(): Promise<void> {
  if (!apercuRapport.value || occupe.value) return
  occupe.value = true
  message.value = null
  messageEstErreur.value = true
  try {
    const enregistrement = await enregistrerRapportCorpus(apercuRapport.value)
    if (enregistrement.etat === 'erreur') {
      message.value = enregistrement.message
    } else if (enregistrement.etat === 'succes') {
      messageEstErreur.value = false
      message.value = `Rapport enregistré : ${enregistrement.chemin}`
    }
  } finally {
    occupe.value = false
  }
}

function revenirAuxOptions(): void {
  apercuRapport.value = null
  message.value = null
  etape.value = 'options'
}

/** L'arrêt attend la fin de l'entretien courant pour conserver des fichiers complets. */
function demanderArret(): void {
  arretDemande.value = true
  arretPrisEnCompte.value = true
}
</script>

<template>
  <section class="export-corpus">
    <aside class="panneau reglages-export" data-tour="reglages-export-guide">
      <div class="corpus-tete"><h3>Exporter le corpus</h3></div>
      <p class="accueil-intro">Choisissez le type d’export et ses options. Les entretiens à exporter se cochent à droite.</p>
      <fieldset class="champs-export" :disabled="occupe">
        <div>
          <p v-if="entretiens.length === 0" class="vide">Aucun entretien dans le corpus.</p>
          <template v-else>
            <fieldset class="mode-export">
              <legend>Type d’export</legend>
              <label class="option">
                <input v-model="modeExport" type="radio" value="lecture" />
                Formats de lecture (TXT, HTML, DOCX, PDF)
              </label>
              <label class="option">
                <input v-model="modeExport" type="radio" value="qualcoder" />
                Projet QualCoder (.qda)
              </label>
              <label class="option">
                <input v-model="modeExport" type="radio" value="iramuteq" />
                Corpus pour IRaMuTeQ (.txt)
              </label>
            </fieldset>
          </template>
        </div>

        <div v-if="entretiens.length > 0">
          <h4>{{ modeExport === 'qualcoder' ? 'Cas à intégrer au projet QualCoder' : modeExport === 'iramuteq' ? 'Préparer le corpus IRaMuTeQ' : 'Formats et éléments à intégrer' }}</h4>
          <template v-if="modeExport === 'iramuteq'">
            <p class="accueil-intro">
              Un seul fichier texte, prêt à ouvrir dans IRaMuTeQ.
              Chaque entretien y est repéré par la variable <code>*ent_…</code>.
            </p>
            <fieldset class="mode-export">
              <legend>Un texte IRaMuTeQ par…</legend>
              <label class="option">
                <input v-model="optionsIramuteq.unite" type="radio" value="entretien" />
                Entretien
              </label>
              <label class="option">
                <input v-model="optionsIramuteq.unite" type="radio" value="tour" />
                <span>Tour de parole <small>(ajoute la variable <code>*loc_…</code>)</small></span>
              </label>
              <label class="option">
                <input v-model="optionsIramuteq.unite" type="radio" value="passage" />
                <span>Passage selon les thèmes codés <small>(une variable par thème, par exemple <code>*thville_oui</code>)</small></span>
              </label>
            </fieldset>
            <p v-if="optionsIramuteq.unite === 'passage'" class="avertissement-anon">
              Le texte est coupé à chaque début et fin de codage : chaque passage porte tous ses thèmes.
              Le texte non codé est gardé, avec <code>*thaucun_oui</code>.
            </p>
            <div class="options">
              <label class="option">
                <input v-model="optionsIramuteq.exclureInterviewers" type="checkbox" />
                Retirer les propos des interviewers
              </label>
              <template v-if="optionsIramuteq.unite === 'passage'">
                <label class="option">
                  <input v-model="optionsIramuteq.themesAbsents" type="checkbox" />
                  Indiquer aussi les thèmes absents
                </label>
                <p v-if="optionsIramuteq.themesAbsents" class="avertissement-anon">
                  Chaque texte indique aussi les thèmes qu’il ne porte pas, par exemple <code>*thville_non</code>.
                  Dans IRaMuTeQ, vous pourrez ainsi comparer les passages sur un thème à tout le reste du corpus
                  (mots caractéristiques, AFC), ou isoler un sous-corpus « tout sauf ce thème ».
                  Sans cette option, seuls les thèmes présents sont indiqués.
                </p>
              </template>
              <template v-else>
                <label class="option">
                  <input v-model="optionsIramuteq.thematiques" type="checkbox" />
                  Découper le texte selon les thèmes codés
                </label>
                <p v-if="optionsIramuteq.thematiques" class="avertissement-anon">
                  Un passage codé par plusieurs thèmes est rattaché au premier thème de la grille.
                  Pour garder tous les thèmes, choisissez un texte par passage.
                  Les passages sans thème sont regroupés sous <code>-*hors_theme</code>.
                </p>
              </template>
              <label class="option">
                <input v-model="optionsIramuteq.anon" type="checkbox" />
                Pseudonymisation
              </label>
              <p v-if="optionsIramuteq.anon" class="avertissement-anon">
                Seuls les pseudonymes configurés sont appliqués. Les titres d’entretiens
                et les autres éléments restent en clair ; cette opération ne garantit pas l'anonymat.
              </p>
            </div>
            <fieldset class="mode-export">
              <legend>IRaMuTeQ sera utilisé sous…</legend>
              <label class="option">
                <input v-model="optionsIramuteq.encodage" type="radio" value="windows-1252" />
                Windows
              </label>
              <label class="option">
                <input v-model="optionsIramuteq.encodage" type="radio" value="utf8" />
                Mac ou Linux
              </label>
            </fieldset>
          </template>
          <template v-else-if="modeExport === 'qualcoder'">
            <p class="avertissement-anon">
              Le projet QualCoder contiendra les sources sélectionnées, leurs passages,
              les cas choisis et les attributs disponibles. Les règles dynamiques ne
              deviendront pas des règles QualCoder.
            </p>
            <p class="limite-rapport">
              Cette première version exporte le texte source. La pseudonymisation et
              le rapport détaillé des pertes restent à valider avant de partager un projet.
            </p>
            <div class="selection-cas">
              <label class="option tous-option">
                <input
                  type="checkbox"
                  :checked="listeCas.length > 0 && casSelectionnes.size === listeCas.length"
                  @change="changerTousLesCas"
                />
                Tous les cas ({{ listeCas.length }})
              </label>
              <label v-for="cas in listeCas" :key="cas.id" class="option cas-export">
                <input type="checkbox" :checked="casSelectionnes.has(cas.id)" @change="changerCas($event, cas.id)" />
                <span>{{ cas.nom }} <small>({{ cas.regles.length ? 'avec règle' : 'manuel' }})</small></span>
              </label>
              <p v-if="listeCas.length === 0" class="vide">Aucun cas dans ce corpus.</p>
            </div>
          </template>
          <template v-else>
          <div class="formats">
            <label v-for="f in FORMATS_LOT" :key="f" class="option">
              <input
                type="checkbox"
                :checked="formats.has(f)"
                @change="basculerFormat(f)"
              />
              {{ libellesFormats[f] }}
            </label>
          </div>
          <hr />
          <div class="options">
            <template v-for="{ cle, label } in LIBELLES_OPTIONS" :key="cle">
              <label class="option">
                <input type="checkbox" v-model="options[cle]" />
                {{ label }}
              </label>
            </template>
            <label v-if="copierMediasVisible" class="option">
              <input type="checkbox" v-model="copierMedias" />
              <span>Copier les médias accessibles (dossier <code>medias/</code>)</span>
            </label>
            <p v-if="copierMediasVisible && copierMedias" class="avertissement-anon">
              Les enregistrements seront copiés à l’identique, même si le texte est pseudonymisé.
              Leur voix et leur contenu peuvent identifier les personnes.
            </p>
            <label v-if="options.anon" class="option rapport-option">
              <input type="checkbox" v-model="rapportDemande" />
              Consulter le rapport de pseudonymisation avant l'export
            </label>
            <p v-if="options.anon" class="avertissement-anon">
              Seuls les pseudonymes configurés sont appliqués. Les autres
              éléments restent en clair ; cette opération ne garantit pas l'anonymat.
            </p>
          </div>
          </template>
        </div>
      </fieldset>
    </aside>

    <section class="resultats-export" aria-label="Vérifications et résultat de l’export" :aria-busy="occupe">
      <!-- Choix des entretiens : la liste occupe la place, le lancement reste en bas. -->
      <div v-if="etape === 'options'" class="corps choix-entretiens">
        <div class="entete-choix">
          <h2>Entretiens à exporter</h2>
          <span class="compte">{{ selectionnes.size }} entretien{{ selectionnes.size > 1 ? 's' : '' }} sélectionné{{ selectionnes.size > 1 ? 's' : '' }} sur {{ entretiens.length }}</span>
        </div>
        <p v-if="entretiens.length === 0" class="vide">Aucun entretien dans le corpus.</p>
        <fieldset v-else class="liste-entretiens" :disabled="occupe">
          <div class="outils-liste">
            <label class="option tous-option">
              <input type="checkbox" v-model="tous" />
              Tous les entretiens ({{ entretiens.length }})
            </label>
            <input
              v-if="entretiens.length > SEUIL_FILTRE"
              v-model="filtreEntretiens"
              type="search"
              class="filtre-entretiens"
              placeholder="Filtrer par titre…"
              aria-label="Filtrer les entretiens par titre"
            />
          </div>
          <div class="grille-selection">
            <label v-for="e in entretiensAffiches" :key="e.id" class="ligne-entretien">
              <input
                type="checkbox"
                :checked="selectionnes.has(e.id)"
                @change="selectionnes.has(e.id) ? selectionnes.delete(e.id) : selectionnes.add(e.id)"
              />
              <span class="titre" :title="e.titre">{{ e.titre }}</span>
              <span v-if="e.date" class="date">{{ e.date }}</span>
            </label>
            <p v-if="entretiensAffiches.length === 0" class="vide">Aucun entretien ne correspond à ce filtre.</p>
          </div>
        </fieldset>
        <div v-if="modeExport === 'iramuteq'" class="choix-iramuteq">
          <fieldset class="liste-complementaire" :disabled="occupe">
            <legend>Variables à ajouter</legend>
            <p v-if="variablesProposees.length === 0" class="vide">
              {{ optionsIramuteq.variablesPrivees ? 'Aucune variable dans ce corpus.' : 'Aucune variable publique dans ce corpus.' }}
            </p>
            <template v-else>
              <label class="option tous-option">
                <input v-model="toutesVariables" type="checkbox" />
                Toutes les variables ({{ variablesProposees.length }})
              </label>
              <div class="grille-selection">
                <label v-for="v in variablesProposees" :key="v.id" class="ligne-entretien">
                  <input
                    type="checkbox"
                    :checked="!variablesExclues.has(v.id)"
                    @change="basculerExclusion(variablesExclues, v.id)"
                  />
                  <span class="titre" :title="v.lib">{{ v.lib }}</span>
                  <span class="date">{{ v.portee === 'participation' ? 'locuteur' : 'entretien' }}{{ v.priv ? ' · privée' : '' }}</span>
                </label>
              </div>
            </template>
            <label v-if="aDesVariablesPrivees" class="option">
              <input v-model="optionsIramuteq.variablesPrivees" type="checkbox" />
              Proposer aussi les variables privées
            </label>
            <p v-if="optionsIramuteq.variablesPrivees" class="avertissement-anon">
              Les variables privées peuvent permettre de reconnaître les personnes interrogées.
              Vérifiez le fichier avant de le partager.
            </p>
          </fieldset>
          <fieldset v-if="themesUtilesIramuteq" class="liste-complementaire" :disabled="occupe">
            <legend>Thèmes à prendre en compte</legend>
            <p v-if="themesProposes.length === 0" class="vide">Aucun thème dans ce corpus.</p>
            <template v-else>
              <label class="option tous-option">
                <input v-model="tousThemes" type="checkbox" />
                Tous les thèmes ({{ themesProposes.length }})
              </label>
              <div class="grille-themes">
                <label
                  v-for="t in themesProposes"
                  :key="t.id"
                  class="ligne-entretien"
                  :style="{ paddingLeft: `${t.profondeur * 1.2}rem` }"
                >
                  <input
                    type="checkbox"
                    :checked="!themesExclus.has(t.id)"
                    @change="basculerExclusion(themesExclus, t.id)"
                  />
                  <span class="titre" :title="t.nom">{{ t.nom }}</span>
                </label>
              </div>
            </template>
            <div v-if="aDesSousThemes" class="option-avec-aide">
              <label class="option">
                <input v-model="optionsIramuteq.heriterParents" type="checkbox" />
                Compter les sous-thèmes dans leur thème parent
              </label>
              <button
                type="button"
                class="bouton-aide"
                :aria-expanded="aideHeritage"
                aria-label="Aide : compter les sous-thèmes dans leur thème parent"
                title="Aide"
                @click="aideHeritage = !aideHeritage"
              ><span class="ico-info" aria-hidden="true"></span></button>
            </div>
            <div v-if="aDesSousThemes && aideHeritage" class="aide-option">
              <p>
                Exemple : « Ville » est un sous-thème de « Lieu de vie ».
                Avec cette option, un passage codé « Ville » compte aussi pour « Lieu de vie »,
                même s’il n’a pas été codé « Lieu de vie ».
              </p>
              <p>
                Un sous-thème décoché est ignoré : si vous décochez « Ville »,
                ses passages ne comptent pas non plus pour « Lieu de vie ».
              </p>
              <p>
                L’inverse ne se produit pas : un passage codé « Lieu de vie » ne compte jamais pour « Ville ».
              </p>
            </div>
            <p class="destination-export">
              Un passage codé seulement par des thèmes décochés est exporté comme non codé.
            </p>
          </fieldset>
        </div>
        <div class="pied-export">
          <p v-if="entretiens.length > 0 && selectionnes.size === 0" class="vide">Cochez au moins un entretien.</p>
          <template v-else-if="selectionnes.size > 0">
            <p v-if="modeExport === 'iramuteq'" class="avertissement-anon">
              Un fichier IRaMuTeQ avec {{ pluriel(variablesIramuteq.length, 'variable') }}<template v-if="themesUtilesIramuteq"> et {{ pluriel(themesIramuteq.length, 'thème') }}</template>{{ optionsIramuteq.anon ? ', avec les pseudonymes configurés' : ', sans pseudonymisation' }}.
            </p>
            <p v-else-if="modeExport === 'qualcoder'" class="avertissement-anon">Un projet QualCoder (.qda), avec {{ casSelectionnes.size }} cas. Le texte source sera exporté sans pseudonymisation.</p>
            <p v-else-if="options.anon" class="avertissement-anon">Les pseudonymes configurés seront appliqués. Vérifiez les informations restantes avant de partager les fichiers.</p>
            <p v-else class="avertissement-anon">Les transcriptions seront exportées sans pseudonymisation.</p>
          </template>
          <p class="destination-export">{{ modeExport === 'iramuteq' ? 'L’emplacement du fichier' : 'Le dossier de destination' }} vous sera demandé au lancement. Les entretiens du corpus ne seront pas modifiés.</p>
          <p v-if="message" class="message-erreur" role="alert">{{ message }}</p>
          <div class="actions">
            <button class="exporter" :disabled="occupe || selectionnes.size === 0" @click="lancerExport">
              {{ occupe ? 'Préparation…' : options.anon && rapportDemande && modeExport === 'lecture' ? 'Vérifier le rapport avant l’export' : `Exporter ${selectionnes.size} entretien${selectionnes.size > 1 ? 's' : ''}` }}
            </button>
          </div>
        </div>
      </div>

      <!-- Le rapport reste consultable à côté des réglages. -->
        <div v-else-if="etape === 'rapport' && apercuRapport" class="corps">
          <p class="etape">Rapport de pseudonymisation avant l'export</p>
          <p class="limite-rapport">
            Ce rapport décrit les remplacements configurés. Il ne constitue pas une garantie d'anonymat.
          </p>
          <div v-if="apercuRapport.indisponibles.length > 0" class="avertissement-anon">
            <b>Aperçu incomplet :</b>
            <div v-for="item in apercuRapport.indisponibles" :key="item.id">
              {{ item.titre }} — {{ item.raison }}
            </div>
          </div>
          <div class="rapport-contenu">
            <article v-for="entretien in apercuRapport.entretiens" :key="entretien.id">
              <h3>{{ entretien.titre }}</h3>
              <section v-for="detail in entretien.formats" :key="detail.format">
                <h4 v-if="entretien.formats.length > 1">Format {{ detail.format.toUpperCase() }}</h4>
                <h5>Pseudonymisation appliquée</h5>
                <ul><li v-for="ligne in detail.rapport.appliquees" :key="ligne.code">{{ ligne.message }}</li></ul>
                <h5>Éléments conservés</h5>
                <ul><li v-for="ligne in detail.rapport.conserves" :key="ligne.code">{{ ligne.message }}</li></ul>
                <h5>Éléments à vérifier manuellement</h5>
                <ul v-if="detail.rapport.aVerifier.length > 0">
                  <li v-for="ligne in detail.rapport.aVerifier" :key="ligne.code">{{ ligne.message }}</li>
                </ul>
                <p v-else>Aucun élément à signaler.</p>
              </section>
            </article>
          </div>
          <p
            v-if="message"
            :class="messageEstErreur ? 'message-erreur' : 'message-information'"
            :role="messageEstErreur ? 'alert' : 'status'"
          >{{ message }}</p>
          <div class="actions actions-rapport">
            <button class="retour" :disabled="occupe" @click="revenirAuxOptions">Modifier les réglages</button>
            <button class="enregistrer" :disabled="occupe" @click="sauvegarderRapport">Enregistrer le rapport</button>
            <button class="exporter" :disabled="occupe" @click="lancerExportFinal">
              {{ occupe ? '⏳ Traitement…' : '📥 Lancer l’export' }}
            </button>
          </div>
        </div>

        <!-- Progression par entretien et arrêt à la fin du fichier courant. -->
        <div v-else-if="etape === 'traitement'" class="corps" role="status">
          <p class="etape">Export en cours…</p>
          <p class="progression">
            <template v-if="progression">
              <b>{{ progression.faits }} / {{ progression.total }}</b> — {{ progression.titre }}
            </template>
            <template v-else>Préparation…</template>
          </p>
          <p v-if="arretPrisEnCompte" class="avertissement-anon">
            Arrêt demandé : l'export s'arrête après l'entretien en cours.
          </p>
          <div v-if="modeExport === 'lecture'" class="actions">
            <button v-if="!arretDemande" class="annuler" @click="demanderArret">Annuler après l'entretien courant</button>
            <button v-else class="annuler" disabled>⏳ Arrêt en cours…</button>
          </div>
        </div>

        <!-- Bilan du fichier IRaMuTeQ. -->
        <div v-else-if="etape === 'resume' && resultatIramuteq" class="corps" aria-live="polite">
          <p class="etape">Fichier IRaMuTeQ créé ✅</p>
          <p class="dossier">Fichier : <code>{{ resultatIramuteq.chemin }}</code></p>
          <p>{{ resultatIramuteq.textes }} texte{{ resultatIramuteq.textes > 1 ? 's' : '' }} IRaMuTeQ produit{{ resultatIramuteq.textes > 1 ? 's' : '' }}.</p>
          <div v-if="resultatIramuteq.vides.length > 0" class="avertissement-anon">
            <b>Entretiens sans texte retenu :</b>
            <div v-for="titre in resultatIramuteq.vides" :key="titre">{{ titre }}</div>
          </div>
          <p class="destination-export">
            Dans IRaMuTeQ : Fichier → Ouvrir un corpus, puis vérifiez que l’encodage indiqué est
            <b>{{ resultatIramuteq.encodage }}</b>. Sinon, les accents s’afficheraient mal.
          </p>
          <div class="actions">
            <button class="retour" @click="revenirAuxOptions">Préparer un autre export</button>
          </div>
        </div>

        <!-- Bilan du projet QualCoder. -->
        <div v-else-if="etape === 'resume' && resultatQualcoder" class="corps" aria-live="polite">
          <p class="etape">
            <template v-if="resultatQualcoder.etat === 'succes'">Projet QualCoder créé ✅</template>
            <template v-else-if="resultatQualcoder.etat === 'annule'">Export QualCoder annulé</template>
            <template v-else>Export QualCoder en échec ❌</template>
          </p>
          <p v-if="resultatQualcoder.etat === 'succes'" class="dossier">
            Dossier : <code>{{ resultatQualcoder.dossier }}</code>
          </p>
          <p v-if="resultatQualcoder.etat === 'echec'" class="message-erreur" role="alert">
            {{ resultatQualcoder.message }}
          </p>
          <div class="actions">
            <button class="retour" @click="revenirAuxOptions">Préparer un autre export</button>
          </div>
        </div>

        <!-- Bilan du lot : réussites, échecs expliqués et dossier de destination. -->
        <div v-else-if="etape === 'resume' && resultat" class="corps" aria-live="polite">
          <p class="etape">
            <template v-if="resultat.etat === 'succes'">Export terminé ✅</template>
            <template v-else-if="resultat.etat === 'annule'">Export arrêté ⏹</template>
            <template v-else>Export en échec ❌</template>
          </p>
          <p v-if="resultat.etat !== 'echec' && resultat.dossier" class="dossier">
            Dossier : <code>{{ resultat.dossier }}</code>
          </p>
          <p v-if="resultat.etat === 'echec'" class="message-erreur" role="alert">{{ resultat.message }}</p>

          <template v-if="resultat.etat !== 'echec'">
            <div class="resume-lot">
              <div v-for="f in resultat.faits" :key="f.id" class="resume-ligne" :class="f.etat">
                <span class="icone">
                  {{ f.etat === 'succes' ? '✅' : f.etat === 'abandonne' ? '⏹' : '❌' }}
                </span>
                <span class="titre">{{ f.titre }}</span>
                <span v-if="f.raison" class="raison">{{ f.raison }}</span>
              </div>
            </div>

            <details v-if="resultat.etat === 'succes' && resultat.rapportResume.length > 0" class="rapport-global">
              <summary>Rapport de pseudonymisation ({{ resultat.rapportResume.length }} entretien{{ resultat.rapportResume.length > 1 ? 's' : '' }})</summary>
              <p class="limite-rapport">
                Ce rapport décrit les remplacements configurés. Il ne constitue pas une garantie d'anonymat.
                Le rapport détaillé par entretien peut être enregistré avant le lancement de l’export.
              </p>
              <div v-for="r in resultat.rapportResume" :key="r.id" class="ligne-rapport">
                <b>{{ r.titre }}</b> — {{ r.appliquees }} appliqué(s), {{ r.conserves }} conservé(s),
                {{ r.aVerifier }} à vérifier.
              </div>
            </details>
          </template>

          <div class="actions">
            <button class="retour" @click="revenirAuxOptions">Préparer un autre export</button>
          </div>
        </div>
    </section>
  </section>
</template>

<style scoped>
.export-corpus { display: grid; grid-template-columns: var(--largeur-organisation) minmax(0, 1fr); gap: 1rem; height: 100%; min-height: 0; }
.reglages-export, .resultats-export { min-width: 0; min-height: 0; overflow-y: auto; }
.reglages-export { font-size: .82rem; }
.champs-export { border: 0; padding: 0; margin: 0; min-width: 0; }
h4 { margin: 1rem 0 .5rem; font-size: .85rem; }
.resultats-export { border: 1px solid #ddd; border-radius: 8px; background: #fff; }
h2 { margin: 0; font-size: 1.1rem; }
.corps { padding: 1rem 1.2rem; }
.choix-entretiens { display: flex; flex-direction: column; gap: .6rem; height: 100%; box-sizing: border-box; line-height: 1.45; }
.entete-choix { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.compte { color: #555; font-size: .9rem; }
.liste-entretiens { display: flex; flex-direction: column; gap: .4rem; flex: 1; min-height: 8rem; min-width: 0; border: 0; padding: 0; margin: 0; }
.outils-liste { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; border-bottom: 1px solid #ddd; padding-bottom: .4rem; }
.outils-liste .tous-option { border: 0; padding: 0; margin: 0; font-weight: 600; }
.filtre-entretiens { width: min(18rem, 100%); padding: .3rem .5rem; border: 1px solid #c9d0da; border-radius: 5px; font: inherit; font-size: .85rem; }
.pied-export { flex: none; border-top: 1px solid #eee; padding-top: .4rem; }
.pied-export .actions { margin-top: .6rem; }
.destination-export { color: #666; font-size: .85rem; margin: .4rem 0 0; }
@media (max-width: 780px) {
  .export-corpus { grid-template-columns: minmax(0, 1fr); height: auto; }
  .choix-entretiens { height: auto; }
  .grille-selection { max-height: 50vh; }
  .reglages-export, .resultats-export { overflow: visible; }
}
.etape { font-size: .95rem; margin: 1rem 0 .8rem; color: #333; }
.vide { color: #777; }
.grille-selection {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  align-content: start;
  gap: .15rem 1.2rem;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: .2rem 0;
  box-sizing: border-box;
}
.grille-selection .vide { grid-column: 1 / -1; margin: .3rem 0; }
.ligne-entretien { display: flex; align-items: baseline; gap: .5rem; padding: .2rem 0; cursor: pointer; }
.ligne-entretien .titre { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ligne-entretien .date { color: #999; font-size: .8rem; }
.choix-iramuteq { display: flex; flex-direction: column; gap: .6rem; flex: none; }
.liste-complementaire { border: 1px solid #ddd; border-radius: 5px; padding: .4rem .8rem .5rem; margin: 0; min-width: 0; }
.liste-complementaire legend { padding: 0 .3rem; font-weight: 600; }
.liste-complementaire .grille-selection { max-height: 9rem; }
.grille-themes { max-height: 12rem; overflow-y: auto; padding: .2rem 0; }
.option-avec-aide { display: flex; align-items: center; gap: .3rem; }
.bouton-aide { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 1.4rem; height: 1.4rem; padding: 0; border: 1px solid transparent; border-radius: 50%; background: none; color: #55708f; cursor: pointer; font-size: .95rem; }
.bouton-aide:hover, .bouton-aide[aria-expanded='true'] { border-color: #2e73d8; color: #2e73d8; }
.aide-option { margin: .2rem 0 .3rem; padding: .5rem .7rem; border-radius: 5px; background: #eef4fc; color: #24456b; border: 1px solid #c9daf2; font-size: .85rem; }
.aide-option p { margin: 0; }
.aide-option p + p { margin-top: .35rem; }
.tous-option { border-bottom: 1px solid #ddd; padding-bottom: .5rem; margin-bottom: .5rem; }
.mode-export { border: 1px solid #ddd; border-radius: 5px; padding: .5rem .7rem; margin: .8rem 0 0; }
.mode-export legend { padding: 0 .3rem; font-weight: 600; }
.selection-cas { max-height: 42vh; overflow-y: auto; border: 1px solid #ddd; border-radius: 5px; padding: .5rem .7rem; }
.cas-export { border-bottom: 1px solid #eee; }
.cas-export:last-of-type { border-bottom: 0; }
.option { display: flex; align-items: baseline; gap: .6rem; padding: .3rem 0; cursor: pointer; }
.options { display: flex; flex-direction: column; gap: .1rem; }
.rapport-option { margin-top: .25rem; border-top: 1px solid #ddd; padding-top: .65rem; }
hr { border: none; border-top: 1px solid #eee; margin: .8rem 0; }
.avertissement-anon { margin: .4rem 0 0; padding: .5rem .7rem; border-radius: 5px; background: #fff8e1; color: #7a5c00; border: 1px solid #ffe082; font-size: .85rem; }
.progression { font-size: 1rem; }
.dossier { font-size: .9rem; word-break: break-all; }
.message-erreur, .message-information { margin: .6rem 0 0; padding: .6rem .8rem; border-radius: 5px; font-size: .9rem; white-space: pre-wrap; }
.message-erreur { background: #fdecea; color: #b71c1c; border: 1px solid #f5c6cb; }
.message-information { background: #edf7ed; color: #1b5e20; border: 1px solid #a5d6a7; }
.resume-ligne { display: flex; align-items: baseline; gap: .5rem; padding: .15rem 0; font-size: .9rem; }
.resume-ligne .titre { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resume-ligne .raison { color: #b71c1c; font-size: .85rem; }
.resume-ligne.abandonne { color: #777; }
.actions { display: flex; gap: .6rem; margin-top: 1rem; }
.actions button { padding: .5rem .8rem; border-radius: 5px; cursor: pointer; }
.actions button:disabled { opacity: .55; cursor: default; }
.actions .retour { flex: 1; border: 1px solid #bbb; background: #fff; }
.actions .annuler { flex: 1; border: 1px solid #b71c1c; color: #b71c1c; background: #fff; }
.actions .enregistrer { flex: 2; border: 1px solid #1565c0; color: #0d47a1; background: #e3f2fd; }
.actions .exporter { flex: 2; border: 1px solid #2e7d32; color: #fff; background: #2e7d32; }
.actions-rapport { flex-wrap: wrap; }
.actions .exporter:hover:not(:disabled) { background: #256a28; }
.limite-rapport { padding: .5rem .7rem; border-radius: 5px; background: #fff8e1; color: #5f4900; font-size: .85rem; }
.rapport-contenu article { margin-top: 1rem; padding-top: .75rem; border-top: 1px solid #ddd; }
.rapport-contenu h3 { margin: 0 0 .5rem; font-size: 1rem; }
.rapport-contenu h4 { margin: .7rem 0 .35rem; font-size: .9rem; color: #555; }
.rapport-contenu h5 { margin: .55rem 0 .2rem; font-size: .9rem; }
.rapport-contenu ul { margin: 0; padding-left: 1.25rem; }
.rapport-contenu p { margin: 0; font-size: .9rem; }
.rapport-global { margin-top: .8rem; }
.rapport-global summary { cursor: pointer; font-weight: 600; }
.ligne-rapport { padding: .2rem 0; font-size: .9rem; }
</style>
