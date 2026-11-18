import type { EntretienFichier, Note } from '../natif/format'
import { objet } from '../natif/validationCommune'
import { projeterAncres, tempsAuPoint } from '../entretien/audio'
import { normaliserNotes, notesParRang } from '../entretien/notes'

export interface LienCommentaireNoteCorpus {
  commentaireId: string
  auteur: string
  texte: string
  timecodeSecondes: number | null
}

export type EtatNoteJournal = Omit<Note, 'modifieLe'>

export interface VueNoteCorpus {
  id: string
  entretienId: string
  entretienTitre: string
  categorieId: string
  titre: string
  date: string | null
  statut: 'prive' | 'public'
  corps: string
  rang: number
  creeLe: string
  modifieLe: string | null
  liensCommentaires: LienCommentaireNoteCorpus[]
  /** Snapshot sémantique opaque que l'interface renvoie sans le modifier. */
  attendu: EtatNoteJournal
}

export interface InventaireNotes {
  notes: VueNoteCorpus[]
  indisponibles: { id: string; titre: string; raison: string }[]
}

export interface ChampsNote {
  categorieId: string
  titre: string
  date: string | null
  statut: 'prive' | 'public'
  corps: string
}

export type CommandeNotes =
  | {
      type: 'modifier'
      entretienId: string
      noteId: string
      attendu: EtatNoteJournal
      champs: ChampsNote
    }
  | {
      type: 'supprimer'
      entretienId: string
      noteId: string
      attendu: EtatNoteJournal
    }

const identifiant = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const dateOuNull = (v: unknown) => v === null || typeof v === 'string'
const statutValide = (v: unknown) => v === 'public' || v === 'prive'

function champsExacts(v: Record<string, unknown>, champs: readonly string[]): boolean {
  return Object.keys(v).length === champs.length && Object.keys(v).every((cle) => champs.includes(cle))
}

/** Le contenu modifiable ne peut pas remplacer les références de la note. */
export function validerCommandeNotes(v: unknown): asserts v is CommandeNotes {
  const erreur = () => new Error('Cette demande de modification des notes est invalide. Actualisez puis vérifiez votre sélection.')
  if (!objet(v) || (v.type !== 'modifier' && v.type !== 'supprimer') || !identifiant(v.entretienId)
    || !identifiant(v.noteId) || !objet(v.attendu)) throw erreur()
  const a = v.attendu
  const champsEtat = ['id', 'categorieId', 'titre', 'date', 'statut', 'corps', 'rang', 'creeLe']
  if (!champsEtat.every((cle) => Object.hasOwn(a, cle)) || Object.keys(a).some((cle) => ![...champsEtat, 'participationIds'].includes(cle))
    || a.id !== v.noteId || !identifiant(a.categorieId) || typeof a.titre !== 'string' || !dateOuNull(a.date)
    || !statutValide(a.statut) || typeof a.corps !== 'string' || typeof a.rang !== 'number' || !Number.isFinite(a.rang)
    || typeof a.creeLe !== 'string' || (a.participationIds !== undefined
      && (!Array.isArray(a.participationIds) || !a.participationIds.every(identifiant)))) throw erreur()
  if (v.type === 'supprimer') {
    if (!champsExacts(v, ['type', 'entretienId', 'noteId', 'attendu'])) throw erreur()
  } else {
    if (!champsExacts(v, ['type', 'entretienId', 'noteId', 'attendu', 'champs']) || !objet(v.champs)) throw erreur()
    const c = v.champs
    if (!champsExacts(c, ['categorieId', 'titre', 'date', 'statut', 'corps']) || !identifiant(c.categorieId)
      || typeof c.titre !== 'string' || !dateOuNull(c.date) || !statutValide(c.statut) || typeof c.corps !== 'string') throw erreur()
  }
}

export type CritereTriNotes =
  | 'creeLe'
  | 'date'
  | 'modifieLe'
  | 'entretienTitre'
  | 'categorie'
  | 'statut'
  | 'titre'

export function etatNoteJournal(note: Note): EtatNoteJournal {
  if (Object.hasOwn(note, 'locuteurIds')) throw new Error('Les notes doivent référencer les participations locales.')
  const { modifieLe: _ignore, ...etat } = note
  return structuredClone(etat)
}

function valeurCanonique(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(valeurCanonique)
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cle, contenu]) => [cle, valeurCanonique(contenu)]))
  }
  return valeur
}

export function memeEtatNote(a: EtatNoteJournal, b: EtatNoteJournal): boolean {
  return JSON.stringify(valeurCanonique(a)) === JSON.stringify(valeurCanonique(b))
}

export function memesChampsEditables<T extends ChampsNote>(note: T, champs: ChampsNote): boolean {
  return note.categorieId === champs.categorieId &&
    note.titre === champs.titre &&
    note.date === champs.date &&
    note.statut === champs.statut &&
    note.corps === champs.corps
}

export function trouverNote<T extends { id: string }>(entretien: { notes?: readonly T[] }, noteId: string): T {
  const note = entretien.notes?.find((candidate) => candidate.id === noteId)
  if (!note) throw new Error('Cette note n’existe plus. Actualisez la liste des notes.')
  return note
}

const MOTIF_ID_ANNOTATION = /^[a-zA-Z0-9_-]{1,64}$/
const MOTIF_LIENS = /<(?:em|mark)\b[^>]*\bdata-liens\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi

/** Lit les références portées par les passages d'une note sans interpréter son HTML. */
function idsCommentairesLies(corps: string): string[] {
  const ids: string[] = []
  const vus = new Set<string>()
  for (const correspondance of corps.matchAll(MOTIF_LIENS)) {
    for (const id of (correspondance[1] ?? correspondance[2] ?? '').split(/\s+/)) {
      if (!MOTIF_ID_ANNOTATION.test(id) || vus.has(id)) continue
      vus.add(id)
      ids.push(id)
    }
  }
  return ids
}

function longueursDuDocument(corpsTexte: unknown): number[] {
  const document = corpsTexte as { content?: Array<{ content?: Array<{ text?: string }> }> }
  return (document?.content ?? []).map((bloc) =>
    (bloc.content ?? []).reduce((total, noeud) => total + (noeud.text?.length ?? 0), 0),
  )
}

type EntretienNotes = Pick<EntretienFichier, 'corpsTexte' | 'annotations' | 'ancres' | 'notes'>

function timecodeCommentaire(data: EntretienNotes, position: number): number | null {
  const longueurs = longueursDuDocument(data.corpsTexte)
  if (!longueurs.length || !data.ancres?.length) return null
  const point = projeterAncres([{ pos: position, t: 0 }], longueurs)[0]
  return point ? tempsAuPoint(projeterAncres(data.ancres, longueurs), point.x) : null
}

/** Projette les notes et résout uniquement les commentaires de leur entretien. */
export function inventorierNotes(
  entretiens: readonly { id: string; titre: string; data: EntretienNotes }[],
): InventaireNotes {
  const notes = entretiens.flatMap(({ id: entretienId, titre: entretienTitre, data }) => {
    const commentaires = new Map(data.annotations
      .filter((annotation) => annotation.type === 'commentaire')
      .map((annotation) => [annotation.id, annotation]))

    return notesParRang(normaliserNotes(data.notes)).map((note): VueNoteCorpus => ({
      id: note.id,
      entretienId,
      entretienTitre,
      categorieId: note.categorieId,
      titre: note.titre,
      date: note.date,
      statut: note.statut,
      corps: note.corps,
      rang: note.rang,
      creeLe: note.creeLe,
      modifieLe: note.modifieLe,
      liensCommentaires: idsCommentairesLies(note.corps).flatMap((commentaireId) => {
        const commentaire = commentaires.get(commentaireId)
        if (!commentaire) return []
        return [{
          commentaireId,
          auteur: commentaire.auteur,
          texte: commentaire.texte ?? '',
          timecodeSecondes: timecodeCommentaire(data, commentaire.from),
        }]
      }),
      attendu: etatNoteJournal(note),
    }))
  })
  return { notes, indisponibles: [] }
}
