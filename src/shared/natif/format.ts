import type {
  CorpusFichier as CorpusFormat9,
  EntretienFichier as EntretienFormat9,
  Note as NoteFormat9,
  Variable as VariableFormat9,
} from '../format'
import type {
  Cas as CasFormat9,
  DerivationAttributCas as DerivationFormat9,
  FamilleCas as FamilleFormat9,
} from '../corpus/cas'
import type { Locuteur, ParticipationLocuteur } from '../locuteurs'

/** Structure native des identités corpus et participations locales. */
export const FORMAT_NATIF_LOCUTEURS = 10

export interface Variable extends Omit<VariableFormat9, 'portee'> {
  portee: 'entretien' | 'participation'
}

export interface Note extends Omit<NoteFormat9, 'locuteurIds'> {
  participationIds?: string[]
}

export interface MembreLocuteurCas {
  locuteurId: string
  inclureEnqueteurs: boolean
}

export type RegleCas =
  | ({ type: 'locuteur' } & MembreLocuteurCas)
  | { type: 'locuteurs'; membres: MembreLocuteurCas[] }
  | { type: 'entretiens'; entretienIds: string[] }
  | { type: 'modalite'; variableId: string; modaliteId: string; portee: 'entretien' }
  | { type: 'modalite'; variableId: string; modaliteId: string; portee: 'participation'; inclureEnqueteurs: boolean }

export interface DerivationAttributCas extends Omit<DerivationFormat9, 'porteeSource'> {
  porteeSource: 'entretien' | 'participation'
}

export interface Cas extends Omit<CasFormat9, 'regles' | 'derivationsPropres'> {
  regles: RegleCas[]
  derivationsPropres?: DerivationAttributCas[]
}

export interface FamilleCas extends Omit<FamilleFormat9, 'origine' | 'derivationsAttributs'> {
  origine: { variableId: string; portee: 'entretien' }
    | { variableId: string; portee: 'participation'; inclureEnqueteurs: boolean }
  derivationsAttributs?: DerivationAttributCas[]
}

/** Les champs indépendants des identités gardent leur structure existante. */
export interface CorpusFichier extends Omit<CorpusFormat9,
  'formatVersion' | 'personnes' | 'variables' | 'cas' | 'famillesCas'> {
  formatVersion: typeof FORMAT_NATIF_LOCUTEURS
  locuteurs: Record<string, Locuteur>
  variables: Record<string, Variable>
  cas?: Record<string, Cas>
  famillesCas?: Record<string, FamilleCas>
}

export interface EntretienFichier extends Omit<EntretienFormat9, 'formatVersion' | 'locuteurs' | 'notes'> {
  formatVersion: typeof FORMAT_NATIF_LOCUTEURS
  participations: ParticipationLocuteur[]
  notes?: Note[]
}

export type PayloadEntretien = Omit<EntretienFichier, 'formatVersion' | 'lastModified'>
export type TranscriptionEntretien = Pick<PayloadEntretien, 'corpsTexte' | 'annotations' | 'ancres' | 'participations'>
