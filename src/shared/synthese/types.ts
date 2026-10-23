import type { Variable } from '../format'

/** Une sélection explicite vide ne signifie jamais « tout inclure ». */
export type SelectionSynthese =
  | { mode: 'sans-restriction' }
  | { mode: 'choix'; ids: string[] }

export interface FiltreVariableSynthese {
  portee: Variable['portee']
  modaliteIds: string[]
  nonRenseigne: boolean
}

export interface FiltresSynthese {
  entretiens: SelectionSynthese
  variables: Record<string, FiltreVariableSynthese>
  personnes: {
    selection: SelectionSynthese
    sansPersonne: boolean
    sansLocuteur: boolean
  }
  themes: SelectionSynthese
  correspondanceThemes: 'au-moins-un' | 'tous-au-meme-endroit'
  cas: SelectionSynthese
  inclureEnqueteurs: boolean
}

export interface DiagnosticSynthese {
  entretienId?: string
  titre: string
  message: string
}

export interface PlageContributionSynthese {
  from: number
  to: number
  themeIds: string[]
  annotationIds: string[]
}

export interface TourSynthese {
  from: number
  to: number
  locuteurId: string | null
  personneId: string | null
  interviewer: boolean
  valeursLocuteur: Record<string, string> | null
}

export interface SourceMoteurSynthese {
  entretienId: string
  titreEntretien: string
  longueurSource: number
  ordre: number
  valeursEntretien: Record<string, string>
  contributions: PlageContributionSynthese[]
  tours: TourSynthese[]
}

export interface ContexteMoteurSynthese {
  variables: Pick<Variable, 'id' | 'portee' | 'modalites'>[]
  cas: Record<string, Array<{ entretienId: string; from: number; to: number }>>
}

export interface ExtraitSyntheseBrut {
  id: string
  entretienId: string
  titreEntretien: string
  from: number
  to: number
  longueurSource: number
  themeIds: string[]
  annotationIds: string[]
  locuteurIds: string[]
  personneIds: string[]
  ordre: number
}

export interface ExtraitSynthese extends ExtraitSyntheseBrut {
  texte: string
  avant: string
  apres: string
  locuteurs: string[]
}

export function selectionSyntheseSansRestriction(): SelectionSynthese {
  return { mode: 'sans-restriction' }
}

export function filtresSyntheseParDefaut(): FiltresSynthese {
  return {
    entretiens: selectionSyntheseSansRestriction(),
    variables: {},
    personnes: {
      selection: selectionSyntheseSansRestriction(),
      sansPersonne: false,
      sansLocuteur: false,
    },
    themes: selectionSyntheseSansRestriction(),
    correspondanceThemes: 'au-moins-un',
    cas: selectionSyntheseSansRestriction(),
    inclureEnqueteurs: false,
  }
}
