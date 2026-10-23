import { computed, ref, toRaw, watch, type Ref } from 'vue'
import type { Categorie, EntretienRef } from '../../../shared/format'
import { calculerAnalyseCroisee } from '../../../shared/analysesCroisees/moteur'
import type {
  CelluleAnalyseCroisee,
  DiagnosticAnalyseCroisee,
  MesureAnalyseCroisee,
  ResultatAnalyseCroisee,
  SourceAnalyseCroisee,
} from '../../../shared/analysesCroisees/types'
import {
  projeterCelluleAnalyseCroisee,
  sourceMoteurAnalyseCroisee,
} from '../../editor/analysesCroisees'
import type { ModeTextePassage, SourcePassagePreparee } from '../../editor/passages'
import type { SourcesAnalyseCorpus } from './useSourcesAnalyseCorpus'

/** Porte une analyse calculée explicitement et conserve son résultat jusqu'à l'actualisation. */
export function useAnalysesCroisees(deps: {
  membership: Ref<Record<string, EntretienRef>>
  codebook: Ref<Categorie[]>
  sources: SourcesAnalyseCorpus
  ouvrirSource: (entretienId: string, pos: number) => Promise<void> | void
  fermerAutresFenetres: () => void
  afficherDansSynthese: (themeId: string, entretienId: string) => void
}) {
  const analysesCroiseesOuvertes = ref(false)
  const chargementAnalysesCroisees = ref(false)
  const themesAnalyseCroisee = ref<string[]>([])
  const entretiensAnalyseCroisee = ref<string[]>([])
  const mesureAnalyseCroisee = ref<MesureAnalyseCroisee>('passages')
  const afficherEntretiensSansResultatAnalyse = ref(true)
  const modeTexteAnalyseCroisee = ref<ModeTextePassage>('pseudonymise')
  const resultatAnalyseCroisee = ref<ResultatAnalyseCroisee | null>(null)
  const sourcesAnalyseCroisee = ref<Map<string, SourcePassagePreparee>>(new Map())
  const diagnosticsAnalyseCroisee = ref<DiagnosticAnalyseCroisee[]>([])
  const resultatPerimeAnalyseCroisee = ref(false)
  const calculeLeAnalyseCroisee = ref<Date | null>(null)
  const selectionCelluleAnalyseCroisee = ref<{ themeId: string; entretienId: string } | null>(null)
  const selectionPassageAnalyseCroisee = ref<string | null>(null)
  const selectionAppliquee = ref<{ themes: string[]; entretiens: string[] } | null>(null)
  let initialisee = false
  let generation = 0

  const progressionAnalysesCroisees = deps.sources.progressionSourcesAnalyse
  const calculAnalyseCroiseePossible = computed(() => themesAnalyseCroisee.value.length > 0
    && entretiensAnalyseCroisee.value.length > 0)
  const cellulesAnalyseCroisee = computed(() => resultatAnalyseCroisee.value?.cellules ?? [])
  const celluleSelectionneeAnalyseCroisee = computed(() => {
    const selection = selectionCelluleAnalyseCroisee.value
    return selection ? cellulesAnalyseCroisee.value.find((item) => item.themeId === selection.themeId
      && item.entretienId === selection.entretienId) ?? null : null
  })
  const passagesCelluleAnalyseCroisee = computed(() => {
    const cellule = celluleSelectionneeAnalyseCroisee.value
    return cellule
      ? projeterCelluleAnalyseCroisee(cellule, sourcesAnalyseCroisee.value.get(cellule.entretienId), modeTexteAnalyseCroisee.value)
      : []
  })
  const entretiensAvecResultatAnalyseCroisee = computed(() => new Set(
    cellulesAnalyseCroisee.value.filter((item) => item.passages > 0).map((item) => item.entretienId),
  ).size)
  const cellulesNonVidesAnalyseCroisee = computed(() => cellulesAnalyseCroisee.value.filter((item) => item.passages > 0).length)
  const exportAnalyseCroiseePossible = computed(() => Boolean(calculeLeAnalyseCroisee.value)
    && !resultatPerimeAnalyseCroisee.value && !chargementAnalysesCroisees.value)

  function initialiserSelections(): void {
    themesAnalyseCroisee.value = deps.codebook.value.map((item) => item.id)
    entretiensAnalyseCroisee.value = Object.keys(deps.membership.value)
    initialisee = true
  }

  function afficherAnalysesCroisees(): void {
    deps.fermerAutresFenetres()
    if (!initialisee) initialiserSelections()
    analysesCroiseesOuvertes.value = true
  }
  function fermerAnalysesCroisees(): void { analysesCroiseesOuvertes.value = false }
  function perimerAnalysesCroisees(): void {
    if (calculeLeAnalyseCroisee.value) resultatPerimeAnalyseCroisee.value = true
  }

  async function actualiserAnalyseCroisee(): Promise<void> {
    if (!calculAnalyseCroiseePossible.value) return
    const jeton = ++generation
    chargementAnalysesCroisees.value = true
    try {
      const themes = [...themesAnalyseCroisee.value]
      const entretiens = [...entretiensAnalyseCroisee.value]
      const preparees = await deps.sources.chargerSourcesAnalyse(entretiens)
      if (jeton !== generation) return
      const sources: SourceAnalyseCroisee[] = entretiens.map((id) => {
        const source = preparees.get(id)
        return source?.ok
          ? sourceMoteurAnalyseCroisee(id, source)
          : {
              entretienId: id,
              longueurSource: null,
              contributions: [],
              disponible: false,
              diagnostic: source?.raison ?? 'Source indisponible.',
            }
      })
      const resultat = calculerAnalyseCroisee(sources, themes, entretiens)
      if (jeton !== generation) return
      resultatAnalyseCroisee.value = resultat
      sourcesAnalyseCroisee.value = preparees
      diagnosticsAnalyseCroisee.value = resultat.diagnostics
      selectionAppliquee.value = { themes, entretiens }
      calculeLeAnalyseCroisee.value = new Date()
      resultatPerimeAnalyseCroisee.value = JSON.stringify({
        themes: [...toRaw(themesAnalyseCroisee.value)],
        entretiens: [...toRaw(entretiensAnalyseCroisee.value)],
      }) !== JSON.stringify(selectionAppliquee.value)
      const selection = selectionCelluleAnalyseCroisee.value
      if (selection && !resultat.cellules.some((item) => item.themeId === selection.themeId
        && item.entretienId === selection.entretienId)) selectionCelluleAnalyseCroisee.value = null
    } catch (erreur) {
      if (jeton === generation) diagnosticsAnalyseCroisee.value = [{
        titre: 'Calcul impossible',
        message: erreur instanceof Error ? erreur.message : String(erreur),
      }]
    } finally {
      if (jeton === generation) chargementAnalysesCroisees.value = false
    }
  }

  function selectionnerCelluleAnalyseCroisee(cellule: CelluleAnalyseCroisee): void {
    selectionCelluleAnalyseCroisee.value = { themeId: cellule.themeId, entretienId: cellule.entretienId }
    selectionPassageAnalyseCroisee.value = cellule.plages[0]?.id ?? null
  }
  async function ouvrirPassageAnalyseCroisee(entretienId: string, from: number): Promise<void> {
    if (resultatPerimeAnalyseCroisee.value) return
    analysesCroiseesOuvertes.value = false
    await deps.ouvrirSource(entretienId, from)
  }
  function envoyerCelluleVersSynthese(): void {
    const cellule = celluleSelectionneeAnalyseCroisee.value
    if (!cellule) return
    deps.afficherDansSynthese(cellule.themeId, cellule.entretienId)
  }

  function reinitialiserAnalysesCroisees(): void {
    generation++
    analysesCroiseesOuvertes.value = false
    chargementAnalysesCroisees.value = false
    themesAnalyseCroisee.value = []
    entretiensAnalyseCroisee.value = []
    mesureAnalyseCroisee.value = 'passages'
    afficherEntretiensSansResultatAnalyse.value = true
    modeTexteAnalyseCroisee.value = 'pseudonymise'
    resultatAnalyseCroisee.value = null
    sourcesAnalyseCroisee.value = new Map()
    diagnosticsAnalyseCroisee.value = []
    resultatPerimeAnalyseCroisee.value = false
    calculeLeAnalyseCroisee.value = null
    selectionCelluleAnalyseCroisee.value = null
    selectionPassageAnalyseCroisee.value = null
    selectionAppliquee.value = null
    initialisee = false
  }

  watch([deps.membership, deps.codebook], perimerAnalysesCroisees, { deep: true })
  watch([themesAnalyseCroisee, entretiensAnalyseCroisee], () => {
    if (!selectionAppliquee.value) return
    const courante = JSON.stringify({
      themes: [...toRaw(themesAnalyseCroisee.value)],
      entretiens: [...toRaw(entretiensAnalyseCroisee.value)],
    })
    if (courante !== JSON.stringify(selectionAppliquee.value)) perimerAnalysesCroisees()
  }, { deep: true })

  return {
    analysesCroiseesOuvertes, chargementAnalysesCroisees, progressionAnalysesCroisees,
    themesAnalyseCroisee, entretiensAnalyseCroisee, mesureAnalyseCroisee,
    afficherEntretiensSansResultatAnalyse, modeTexteAnalyseCroisee,
    resultatAnalyseCroisee, cellulesAnalyseCroisee, diagnosticsAnalyseCroisee, selectionAppliquee,
    resultatPerimeAnalyseCroisee, calculeLeAnalyseCroisee, selectionCelluleAnalyseCroisee,
    selectionPassageAnalyseCroisee, celluleSelectionneeAnalyseCroisee, passagesCelluleAnalyseCroisee,
    entretiensAvecResultatAnalyseCroisee, cellulesNonVidesAnalyseCroisee,
    calculAnalyseCroiseePossible, exportAnalyseCroiseePossible,
    afficherAnalysesCroisees, fermerAnalysesCroisees, actualiserAnalyseCroisee,
    selectionnerCelluleAnalyseCroisee, ouvrirPassageAnalyseCroisee,
    envoyerCelluleVersSynthese, perimerAnalysesCroisees, reinitialiserAnalysesCroisees,
  }
}
