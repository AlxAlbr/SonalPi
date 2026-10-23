import type { EntretienRef } from '../../shared/format'
import type {
  CelluleAnalyseCroisee,
  SourceAnalyseCroisee,
} from '../../shared/analysesCroisees/types'
import {
  locuteursPassage,
  textePassage,
  type ModeTextePassage,
  type SourcePassagePreparee,
} from './passages'

/** Prépare les contributions et les tours de parole à partir d'une transcription parsée. */
export function sourceMoteurAnalyseCroisee(
  entretienId: string,
  source: Extract<SourcePassagePreparee, { ok: true }>,
): SourceAnalyseCroisee {
  const tours: NonNullable<SourceAnalyseCroisee['tours']> = []
  source.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true
    const locuteur = typeof node.attrs.loc === 'number' ? String(node.attrs.loc) : 'sans-locuteur'
    tours.push({ from: pos + 1, to: pos + 1 + node.content.size, id: `${locuteur}:${pos}` })
    return true
  })
  return {
    entretienId,
    longueurSource: source.doc.content.size,
    contributions: source.data.annotations.flatMap((annotation) => annotation.type === 'codage' && annotation.code
      ? [{
          entretienId,
          themeId: annotation.code,
          from: annotation.from,
          to: annotation.to,
          annotationIds: [annotation.id],
        }]
      : []),
    tours,
  }
}

export interface PassageDetailAnalyseCroisee {
  id: string
  from: number
  to: number
  texte: string
  avant: string
  apres: string
  locuteurs: string[]
  annotationIds: string[]
}

/** Ne projette du texte que pour la cellule actuellement consultée. */
export function projeterCelluleAnalyseCroisee(
  cellule: CelluleAnalyseCroisee,
  source: SourcePassagePreparee | undefined,
  mode: ModeTextePassage,
  contexte = 160,
): PassageDetailAnalyseCroisee[] {
  if (!source?.ok) return []
  return cellule.plages.map((plage) => ({
    ...plage,
    texte: textePassage(source.doc, source.data, plage.from, plage.to, mode),
    avant: textePassage(source.doc, source.data, Math.max(0, plage.from - contexte), plage.from, mode).trim(),
    apres: textePassage(source.doc, source.data, plage.to, Math.min(source.doc.content.size, plage.to + contexte), mode).trim(),
    locuteurs: locuteursPassage(source.doc, source.data, plage.from, plage.to, mode),
  }))
}

export function titreSourceAnalyse(reference: EntretienRef | undefined, id: string): string {
  return reference?.titre ?? id
}
