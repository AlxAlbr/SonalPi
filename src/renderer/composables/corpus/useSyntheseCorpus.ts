import { computed, ref, toRaw, watch, type Ref } from 'vue'
import type { Categorie, EntretienFichier, EntretienRef, Personne, Variable } from '../../../shared/format'
import type { Cas } from '../../../shared/corpus/cas'
import { calculerExtraitsSynthese } from '../../../shared/synthese/moteur'
import { nombreCriteresSynthese, resumerFiltresSynthese } from '../../../shared/synthese/resume'
import {
  filtresSyntheseParDefaut,
  type DiagnosticSynthese,
  type ExtraitSyntheseBrut,
  type FiltresSynthese,
} from '../../../shared/synthese/types'
import { projeterCasDepuisSourcesPreparees } from '../../editor/cas'
import { type ModeTextePassage, type SourcePassagePreparee } from '../../editor/passages'
import { diagnosticsValeursSynthese, projeterExtraitsSynthese, sourceMoteurSynthese } from '../../editor/synthese'
import type { SourcesAnalyseCorpus } from './useSourcesAnalyseCorpus'

/** Dimension de critères affichée dans la colonne de gauche de l'espace. */
export type OngletCriteresSynthese = 'entretiens' | 'variables' | 'personnes' | 'themes' | 'cas'

/** Porte une session Synthèse et conserve un résultat immuable jusqu'au prochain calcul. */
export function useSyntheseCorpus(deps: {
  membership: Ref<Record<string, EntretienRef>>
  variables: Ref<Variable[]>
  codebook: Ref<Categorie[]>
  cas: Ref<Record<string, Cas>>
  ouvertId: Ref<string | null>
  sourceOuverte: () => EntretienFichier | null
  ouvrirSource: (entretienId: string, pos: number) => Promise<void> | void
  sources: SourcesAnalyseCorpus
}) {
  const chargementSynthese = ref(false)
  const progressionSynthese = deps.sources.progressionSourcesAnalyse
  const filtresSynthese = ref<FiltresSynthese>(filtresSyntheseParDefaut())
  /** Onglet de critères courant ; état de vue, réinitialisé avec le corpus. */
  const ongletCriteresSynthese = ref<OngletCriteresSynthese>('themes')
  const casDisponiblesSynthese = computed(() => Object.keys(deps.cas.value).length > 0)
  const ongletsCriteresSynthese = computed(() => (['entretiens', 'variables', 'personnes', 'themes', 'cas'] as const)
    .filter((onglet) => onglet !== 'cas' || casDisponiblesSynthese.value))
  watch(casDisponiblesSynthese, (disponibles) => {
    if (!disponibles && ongletCriteresSynthese.value === 'cas') ongletCriteresSynthese.value = 'themes'
  }, { flush: 'sync' })
  const modeTexteSynthese = ref<ModeTextePassage>('pseudonymise')
  const representationSynthese = ref<'ensemble' | 'extraits'>('ensemble')
  const selectionExtraitSynthese = ref<string | null>(null)
  const personnesSynthese = ref<Personne[]>([])
  const entretiensCalculSynthese = ref<Array<{ id: string; titre: string; longueurSource: number | null }>>([])
  const extraitsBrutsSynthese = ref<ExtraitSyntheseBrut[]>([])
  const sourcesSynthese = ref<Map<string, SourcePassagePreparee>>(new Map())
  const diagnosticsSynthese = ref<DiagnosticSynthese[]>([])
  const resultatPerimeSynthese = ref(false)
  const calculeLeSynthese = ref<Date | null>(null)
  const filtresAppliques = ref<FiltresSynthese | null>(null)
  let generation = 0

  const filtreCasIndisponibleSynthese = computed(() => {
    const selections = [filtresSynthese.value.cas, filtresAppliques.value?.cas]
    return selections.some((selection) => selection?.mode === 'choix'
      && (!casDisponiblesSynthese.value || selection.ids.some((id) => !deps.cas.value[id])))
  })
  function retirerFiltreCasSynthese(): void {
    filtresSynthese.value = { ...filtresSynthese.value, cas: { mode: 'sans-restriction' } }
  }

  // Les filtres Vue peuvent contenir des proxys imbriqués après une modification.
  // Une copie JSON suffit ici car le contrat ne contient que des données sérialisables.
  const copierFiltres = (filtres: FiltresSynthese): FiltresSynthese =>
    JSON.parse(JSON.stringify(filtres)) as FiltresSynthese

  const extraitsSynthese = computed(() => projeterExtraitsSynthese(
    extraitsBrutsSynthese.value,
    sourcesSynthese.value,
    modeTexteSynthese.value,
  ))
  const entretiensAvecExtraitsSynthese = computed(() => new Set(extraitsBrutsSynthese.value.map((item) => item.entretienId)).size)
  const volumeTexteSynthese = computed(() => extraitsBrutsSynthese.value.reduce((total, item) => total + item.to - item.from, 0))
  const contexteResume = computed(() => ({
    entretiens: Object.entries(deps.membership.value).map(([id, item]) => ({ id, nom: item.titre })),
    variables: deps.variables.value,
    personnes: personnesSynthese.value,
    themes: deps.codebook.value,
    cas: Object.values(deps.cas.value),
  }))
  const lignesResumeSynthese = computed(() => resumerFiltresSynthese(filtresAppliques.value ?? filtresSynthese.value, contexteResume.value))
  const criteresActifsSynthese = computed(() => nombreCriteresSynthese(filtresAppliques.value ?? filtresSynthese.value))
  const calculSynthesePossible = computed(() => filtresSynthese.value.themes.mode === 'choix'
    || filtresSynthese.value.cas.mode === 'choix')
  const exportSynthesePossible = computed(() => Boolean(calculeLeSynthese.value)
    && !resultatPerimeSynthese.value && !chargementSynthese.value && diagnosticsSynthese.value.length === 0)

  async function actualiserSynthese(): Promise<void> {
    if (!calculSynthesePossible.value) return
    const jeton = ++generation
    chargementSynthese.value = true
    try {
      const diagnostics: DiagnosticSynthese[] = []
      let personnes: Personne[] = []
      try {
        personnes = (await window.sonal.corpus.personnesInventaire()).personnes
      } catch (erreur) {
        diagnostics.push({ titre: 'Personnes', message: erreur instanceof Error ? erreur.message : String(erreur) })
      }
      const toutesEntrees = Object.entries(deps.membership.value)
      const idsDemandes = filtresSynthese.value.entretiens.mode === 'choix'
        ? filtresSynthese.value.entretiens.ids
        : toutesEntrees.map(([id]) => id)
      const preparees = await deps.sources.chargerSourcesAnalyse(idsDemandes)
      if (jeton !== generation) return
      const sources = []
      const idsRetenusLecture = new Set(idsDemandes)
      const entrees = toutesEntrees.filter(([id]) => idsRetenusLecture.has(id))
      for (let ordre = 0; ordre < entrees.length; ordre++) {
        const [id, reference] = entrees[ordre]
        const source = preparees.get(id)
        if (!source?.ok) {
          diagnostics.push({ entretienId: id, titre: reference.titre, message: source?.raison ?? 'Source indisponible.' })
          continue
        }
        sources.push(sourceMoteurSynthese(id, reference, source, ordre))
        const erreurs = diagnosticsValeursSynthese(source, deps.variables.value)
        if (erreurs.length) diagnostics.push({ entretienId: id, titre: reference.titre, message: `Valeur(s) de variable invalide(s) : ${erreurs.join(', ')}.` })
      }
      const personnesParId = Object.fromEntries(personnes.map((personne) => [personne.id, personne]))
      const variablesParId = Object.fromEntries(deps.variables.value.map((variable) => [variable.id, variable]))
      const plagesCas: Record<string, Array<{ entretienId: string; from: number; to: number }>> = {}
      const choixCas = filtresSynthese.value.cas.mode === 'choix' ? filtresSynthese.value.cas.ids : []
      for (const id of choixCas) {
        const cas = deps.cas.value[id]
        if (!cas) {
          diagnostics.push({ titre: 'Cas introuvable', message: id })
          continue
        }
        const copieCas = JSON.parse(JSON.stringify(cas)) as Cas
        const projection = projeterCasDepuisSourcesPreparees({ membership: deps.membership.value, personnes: personnesParId, variables: variablesParId }, copieCas, preparees, 'pseudonymise')
        plagesCas[id] = projection.passages.flatMap((passage) => {
          if (passage.etat !== 'disponible' || passage.from === null || passage.to === null) {
            diagnostics.push({ titre: cas.nom, message: passage.diagnostic ?? 'Un matériau du cas est indisponible.' })
            return []
          }
          return [{ entretienId: passage.origine.type === 'manuel' ? passage.origine.source.entretienId : passage.origine.entretienId, from: passage.from, to: passage.to }]
        })
        projection.diagnosticsRegles.forEach((item) => diagnostics.push({ entretienId: item.entretienId ?? undefined, titre: cas.nom, message: item.diagnostic }))
      }
      if (jeton !== generation) return
      const appliques = copierFiltres(filtresSynthese.value)
      const idsRetenus = appliques.entretiens.mode === 'choix' ? new Set(appliques.entretiens.ids) : null
      entretiensCalculSynthese.value = entrees.flatMap(([id, reference]) => {
        if (idsRetenus && !idsRetenus.has(id)) return []
        const source = preparees.get(id)
        return [{ id, titre: reference.titre, longueurSource: source?.ok ? source.doc.content.size : null }]
      })
      extraitsBrutsSynthese.value = calculerExtraitsSynthese(sources, appliques, { variables: deps.variables.value, cas: plagesCas })
      sourcesSynthese.value = preparees
      personnesSynthese.value = personnes
      diagnosticsSynthese.value = diagnostics
      filtresAppliques.value = appliques
      calculeLeSynthese.value = new Date()
      resultatPerimeSynthese.value = false
      if (!extraitsBrutsSynthese.value.some((item) => item.id === selectionExtraitSynthese.value)) selectionExtraitSynthese.value = null
    } catch (erreur) {
      if (jeton === generation) diagnosticsSynthese.value = [{
        titre: 'Calcul impossible',
        message: erreur instanceof Error ? erreur.message : String(erreur),
      }]
    } finally {
      if (jeton === generation) chargementSynthese.value = false
    }
  }

  function perimerSynthese() { if (calculeLeSynthese.value) resultatPerimeSynthese.value = true }
  function reinitialiserSynthese() {
    generation++
    chargementSynthese.value = false
    filtresSynthese.value = filtresSyntheseParDefaut()
    ongletCriteresSynthese.value = 'themes'
    modeTexteSynthese.value = 'pseudonymise'
    representationSynthese.value = 'ensemble'
    selectionExtraitSynthese.value = null
    personnesSynthese.value = []
    entretiensCalculSynthese.value = []
    extraitsBrutsSynthese.value = []
    sourcesSynthese.value = new Map()
    diagnosticsSynthese.value = []
    resultatPerimeSynthese.value = false
    calculeLeSynthese.value = null
    filtresAppliques.value = null
  }
  async function ouvrirExtraitSynthese(extrait: ExtraitSyntheseBrut) {
    if (resultatPerimeSynthese.value) return
    await deps.ouvrirSource(extrait.entretienId, extrait.from)
  }

  watch([deps.membership, deps.variables, deps.codebook, deps.cas], perimerSynthese, { deep: true })
  watch(filtresSynthese, () => {
    if (filtresAppliques.value && JSON.stringify(toRaw(filtresSynthese.value)) !== JSON.stringify(filtresAppliques.value)) perimerSynthese()
  }, { deep: true })

  return {
    chargementSynthese, progressionSynthese, filtresSynthese,
    ongletCriteresSynthese, ongletsCriteresSynthese, casDisponiblesSynthese,
    filtreCasIndisponibleSynthese, retirerFiltreCasSynthese,
    modeTexteSynthese, representationSynthese, selectionExtraitSynthese,
    personnesSynthese, entretiensCalculSynthese, extraitsSynthese, diagnosticsSynthese, resultatPerimeSynthese,
    calculeLeSynthese, entretiensAvecExtraitsSynthese, volumeTexteSynthese,
    lignesResumeSynthese, criteresActifsSynthese, calculSynthesePossible,
    exportSynthesePossible, actualiserSynthese,
    perimerSynthese, reinitialiserSynthese, ouvrirExtraitSynthese,
  }
}
