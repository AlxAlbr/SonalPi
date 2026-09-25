import type { Categorie, Note } from '../../format'
import type { Cas, DefinitionAttributCas } from '../../corpus/cas'

/** Source finale et ses correspondances opaques vers les objets QualCoder. */
export interface QualcoderSourceExport {
  id: string
  titre: string
  fulltext: string
  date: string | null
  memo: string
  owner: string
  annotations: QualcoderAnnotationExport[]
  attributs: Array<{
    nom: string
    valeur: string
    type: 'fichier'
  }>
}

export interface QualcoderAnnotationExport {
  id: string
  type: 'codage' | 'commentaire'
  from: number
  to: number
  auteur: string
  texte: string
  code?: QualcoderCodeExport
}

export interface QualcoderCodeExport {
  id: string
  nom: string
  memo: string
  couleur: string
  categorie: QualcoderCategorieExport | null
}

export interface QualcoderCategorieExport {
  id: string
  nom: string
  parent: QualcoderCategorieExport | null
  couleur: string
}

export interface QualcoderCaseExport {
  id: string
  nom: string
  memo: string
  owner: string
  sourceIds: string[]
  passages: QualcoderCaseTextExport[]
  attributs: QualcoderAttributExport[]
}

export interface QualcoderCaseTextExport {
  sourceId: string
  from: number
  to: number
  seltext: string
  provenance: string
}

export interface QualcoderAttributExport {
  nom: string
  valeur: string
  type: 'fichier' | 'cas'
  sourceId?: string
  caseId?: string
}

export interface QualcoderExportModel {
  nom: string
  dateExport: string
  sources: QualcoderSourceExport[]
  codebook: QualcoderCodeExport[]
  cases: QualcoderCaseExport[]
  attributs: Array<{
    nom: string
    type: 'fichier' | 'cas'
    memo?: string
    confidentiel: boolean
  }>
  diagnostics: string[]
}

/** Les définitions natives nécessaires au modèle ; elles ne dépendent pas de SQL. */
export interface ContexteQualcoderExport {
  codebook: Record<string, Categorie>
  cas: Record<string, Cas>
  attributsCas: Record<string, DefinitionAttributCas>
  notes: Note[]
  owner: string
}
