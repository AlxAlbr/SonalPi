export type OrigineJournalCorpus = 'personnes' | 'notes' | 'themes' | 'donnees' | 'anon' | 'corpus'

export type ProjectionJournalCorpus =
  | 'personnes'
  | 'notes'
  | 'matrice'
  | 'usages'
  | 'resumes'
  | 'scanAnon'

export interface EntreeJournalCorpusVue {
  id: string
  horodatage: string
  libelle: string
  origine: OrigineJournalCorpus
  etat: 'annulable' | 'inapplicable' | 'bloquee'
  raison?: string
}

export interface ImpactJournalCorpus {
  corpus: boolean
  entretiens: string[]
  projections: ProjectionJournalCorpus[]
}

export type ResultatAnnulationCorpus =
  | { ok: true; impact: ImpactJournalCorpus }
  | { ok: false; raison: string; temporaire: boolean }
