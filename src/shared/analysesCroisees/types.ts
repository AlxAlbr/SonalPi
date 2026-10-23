export type MesureAnalyseCroisee = 'passages' | 'volume' | 'couverture'

export interface ContributionAnalyseCroisee {
  entretienId: string
  themeId: string
  from: number
  to: number
  annotationIds: string[]
}

export interface TourAnalyseCroisee {
  from: number
  to: number
  /** Deux plages contiguës ne sont réunies que si cette identité est la même. */
  id: string | null
}

export interface SourceAnalyseCroisee {
  entretienId: string
  longueurSource: number | null
  contributions: ContributionAnalyseCroisee[]
  tours?: TourAnalyseCroisee[]
  disponible?: boolean
  diagnostic?: string
}

export interface PlageAnalyseCroisee {
  id: string
  from: number
  to: number
  annotationIds: string[]
}

export interface CelluleAnalyseCroisee {
  themeId: string
  entretienId: string
  passages: number
  volume: number
  couverture: number | null
  plages: PlageAnalyseCroisee[]
}

export interface DiagnosticAnalyseCroisee {
  entretienId?: string
  themeId?: string
  annotationId?: string
  titre: string
  message: string
}

export interface TotauxAnalyseCroisee {
  /** Les entretiens sont disjoints : les totaux d'une ligne sont interprétables. */
  lignes: Record<string, Pick<CelluleAnalyseCroisee, 'passages' | 'volume'> & { couverture: number | null }>
  /** Les thèmes peuvent se superposer : aucun total trompeur n'est produit par colonne. */
  colonnes: Record<string, null>
}

export interface ResultatAnalyseCroisee {
  cellules: CelluleAnalyseCroisee[]
  sourcesIndisponibles: string[]
  diagnostics: DiagnosticAnalyseCroisee[]
  totaux: TotauxAnalyseCroisee
}
