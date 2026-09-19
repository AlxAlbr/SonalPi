/**
 *  Document combiné de l'export corpus : un document intermédiaire par
 *  entretien, concaténés sous un titre de niveau 1 chacun. Les sections
 *  internes d'un entretien (NOTES, VARIABLES, CONTENU) deviennent alors des
 *  sous-sections du document final.
 */
import type { BlocDocumentExport, DocumentExport } from './documentExport'

/** Concatène les documents d'entretiens : un bloc `titre` (titre Word) par
 *  entretien, suivi de ses blocs, séparés par une ligne vide. */
export function documentCombine(
  entrees: Array<{ titre: string; document: DocumentExport }>,
): DocumentExport {
  const blocs: BlocDocumentExport[] = []
  for (const e of entrees) {
    if (blocs.length > 0) blocs.push({ type: 'espace' })
    blocs.push({ type: 'titre', runs: [{ texte: e.titre, gras: true }] })
    blocs.push(...e.document.blocs)
  }
  return { blocs }
}
