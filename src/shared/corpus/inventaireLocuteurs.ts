import type { CorpusFichier, ParticipationLocuteur, Locuteur, Note } from '../format'
import type { EntreeMatrice } from './requetes'

export interface VueParticipationLocuteur extends Omit<ParticipationLocuteur, 'id' | 'couleur'> {
  entretienId: string
  entretienTitre: string
  participationId: string
  interviewer: boolean
}

export interface VueNoteParticipation extends Pick<Note, 'id' | 'categorieId' | 'titre' | 'date' | 'statut' | 'corps' | 'rang'> {
  entretienId: string
  entretienTitre: string
  participationIds: string[]
}

export interface InventaireIdentitesLocuteurs {
  locuteurs: Locuteur[]
  participations: VueParticipationLocuteur[]
  notes: VueNoteParticipation[]
  indisponibles: { id: string; titre: string; raison: string }[]
}

/** Projette les identités et leurs données locales, sans transporter les transcriptions. */
export function inventorierLocuteurs(corpus: CorpusFichier, entretiens: EntreeMatrice[]): InventaireIdentitesLocuteurs {
  return {
    locuteurs: Object.values(corpus.locuteurs).sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id)),
    participations: entretiens.flatMap((e) => e.data.participations.map((p) => ({
      entretienId: e.id, entretienTitre: e.titre, participationId: p.id,
      index: p.index, nom: p.nom, interviewer: p.interviewer === true,
      locuteurRef: p.locuteurRef,
      ...(p.associationRetiree === undefined ? {} : { associationRetiree: p.associationRetiree }),
      valeursLoc: { ...p.valeursLoc }, pseudo: p.pseudo, pseudoEtat: p.pseudoEtat,
      rapprochementsRefuses: structuredClone(p.rapprochementsRefuses ?? []),
    }))),
    notes: entretiens.flatMap((e) => (e.data.notes ?? []).filter((note) => note.participationIds?.length).map((note) => ({
      entretienId: e.id, entretienTitre: e.titre, id: note.id, categorieId: note.categorieId,
      titre: note.titre, date: note.date, statut: note.statut, corps: note.corps,
      participationIds: [...(note.participationIds ?? [])], rang: note.rang,
    }))),
    indisponibles: [],
  }
}
