import type { EntretienRef, Note } from '../../../shared/format'
import type { TableauBord } from '../../../shared/corpus/tableaubord'
import { LIGNE_TRAVERSANTE } from '../../../shared/corpus/tableaubord'
import type { ResumeDocumentCadre } from '../../../shared/docsCadre'

export const NOM_GUIDE_DEMO = 'Guide-entretien-demo.txt'
export const TITRE_NOTE_PREPARATION = 'Avant l’entretien'

export function problematiqueRenseignee(tableau: TableauBord | null): boolean {
  return !!tableau?.cellules[LIGNE_TRAVERSANTE]?.problematique?.note?.trim()
}

export function guideDemoPresent(documents: readonly ResumeDocumentCadre[]): boolean {
  return documents.some(
    (document) => document.source === 'projet' && document.nom === NOM_GUIDE_DEMO,
  )
}

export function entretienPreparationPresent(
  id: string | null,
  membership: Readonly<Record<string, EntretienRef>>,
): boolean {
  return !!id && !!membership[id]
}

export function notePreparationPresente(notes: readonly Note[]): boolean {
  return notes.some(
    (note) => note.titre === TITRE_NOTE_PREPARATION && note.corps.replace(/<[^>]+>/g, '').trim().length > 0,
  )
}
