import type { Variable } from '../format'

/** Une liste sans restriction se distingue d'une sélection explicite, même vide. */
export type SelectionLexico =
  | { mode: 'sans-restriction' }
  | { mode: 'choix'; ids: string[] }

export interface FiltreVariableLexico {
  portee: Variable['portee']
  modaliteIds: string[]
  nonRenseigne: boolean
}

export interface FiltrePersonnesLexico {
  selection: SelectionLexico
  sansPersonne: boolean
  sansLocuteur: boolean
}

export interface FiltresLexico {
  entretiens: SelectionLexico
  variables: Record<string, FiltreVariableLexico>
  personnes: FiltrePersonnesLexico
  themes: SelectionLexico
  cas: SelectionLexico
  inclureEnqueteurs: boolean
}

export interface OccurrenceLexico {
  id: string
  forme: string
  texte: string
  entretienId: string
  titreEntretien: string
  from: number
  to: number
  locuteurIndex: number | null
  personneId: string | null
  interviewer: boolean
  valeursEntretien: Record<string, string>
  valeursLocuteur: Record<string, string> | null
  themeIds: string[]
  avant: string
  apres: string
  pseudonyme: boolean
  /** Forme avant un regroupement manuel, utile dans les concordances. */
  formeOriginale?: string
}

export interface RegroupementLexico {
  id: string
  forme: string
  membres: string[]
}

export interface ConcatenationLexico {
  id: string
  forme: string
  sequence: string[]
}

export interface TraitementsLexico {
  motsOutils: string[]
  regroupements: RegroupementLexico[]
  concatenations: ConcatenationLexico[]
  /** Personnalisations des listes proposées dans ce corpus. */
  listesMotsOutils?: Record<string, string[]>
}

export interface PlageLexico {
  entretienId: string
  from: number
  to: number
}

export interface ContexteSelectionLexico {
  variables: Pick<Variable, 'id' | 'portee' | 'modalites'>[]
  cas: Record<string, PlageLexico[]>
}

export interface LigneLexico {
  forme: string
  occurrences: number
  entretiens: number
  details: OccurrenceLexico[]
}

export interface DiagnosticLexico {
  entretienId?: string
  titre: string
  message: string
}

export function selectionSansRestriction(): SelectionLexico {
  return { mode: 'sans-restriction' }
}

export function filtresLexicoParDefaut(): FiltresLexico {
  return {
    entretiens: selectionSansRestriction(),
    variables: {},
    personnes: {
      selection: selectionSansRestriction(),
      sansPersonne: false,
      sansLocuteur: false,
    },
    themes: selectionSansRestriction(),
    cas: selectionSansRestriction(),
    inclureEnqueteurs: false,
  }
}
