import type { CorpusFichier, EntretienFichier, Note } from '../format'
import { lireNoteFormat9 } from '../entretien/notesFormat9'
import { etatNoteJournal, inventorierNotes, type EtatNoteJournal, type InventaireNotes } from './notes'

export function etatNoteJournalFormat9(note: Note): EtatNoteJournal {
  return etatNoteJournal(lireNoteFormat9(note))
}

/** Projette les références locales sans convertir les fichiers du stockage actif. */
export function inventorierNotesFormat9(
  _corpus: CorpusFichier,
  entretiens: readonly { id: string; titre: string; data: EntretienFichier }[],
): InventaireNotes {
  return inventorierNotes(entretiens.map((e) => ({ id: e.id, titre: e.titre, data: {
    corpsTexte: e.data.corpsTexte, annotations: e.data.annotations, ancres: e.data.ancres,
    notes: e.data.notes?.map(lireNoteFormat9),
  } })))
}
