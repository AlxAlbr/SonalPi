import type { Note as NoteFormat9 } from '../format'
import type { Note } from '../natif/format'
import { normaliserNotes } from './notes'

/** La référence reste locale à l'entretien ; aucun id corpus n'est recherché. */
export function lireNoteFormat9(note: NoteFormat9): Note {
  if (Object.hasOwn(note, 'participationIds')) throw new Error('Cette note n’est pas compatible avec le format de cet entretien.')
  const { locuteurIds, ...commun } = note
  return { ...commun, ...(locuteurIds !== undefined ? {
    participationIds: Array.isArray(locuteurIds) ? [...locuteurIds] : locuteurIds,
  } : {}) }
}

/** Conserve les champs du stockage actif après la normalisation commune. */
export function normaliserNotesFormat9(notes?: NoteFormat9[] | null): NoteFormat9[] {
  const natives = normaliserNotes(Array.isArray(notes) ? notes.map(lireNoteFormat9) : [])
  return natives.map(({ participationIds, ...commun }) => ({ ...commun, locuteurIds: [...(participationIds ?? [])] }))
}
