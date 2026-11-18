import { estOrpheline, type Annotation } from './annotation'
import { retirerAnnotation, type Entretien } from './entretien'
import { participationParId, renommerParticipation } from './participations'
import { poserValeurProprietaire, valeursCible, validerLotValeur, type CibleValeur } from '../corpus/valeursVariables'
import type { ParticipationLocuteur, ReferenceParticipation } from '../locuteurs'
import { noteCreationInchangee, notesParRang, referencesNoteDisponibles, renumeroterRangs } from './notes'
import { lireNoteFormat9 } from './notesFormat9'
import type { Note } from '../format'

/**
 *  Journal d'actions annulables. Seules les actions de MODÈLE y entrent
 *  (codages, locuteurs, valeurs) — la frappe de texte reste sur Ctrl+Z. Journal
 *  VOLATIL : session courante, jamais persisté, vidé à l'ouverture d'un
 *  entretien.
 *
 *  L'inverse d'une action est une DONNÉE typée (jamais une closure) ; on peut
 *  la tester headless, vérifier son applicabilité (la cible existe encore ?) et
 *  la remapper. Car les inverses portent des positions qui doivent SUIVRE les
 *  éditions, comme le modèle : l'annotation retirée (à re-poser) et les
 *  positions de blocs (dont il faut restaurer le `loc`) sont remappées en
 *  continu par `editor/journalRemap.ts` — le pendant journal du remap des
 *  annotations.
 *
 *  « Cible disparue → grisée » découle du même mécanisme : une annotation
 *  fantôme dont la plage a été supprimée se referme au remap (orpheline) →
 *  plus re-posable.
 *
 *  Hors périmètre (assumé) : ajouter un locuteur (pas de suppression
 *  modélisée), la suppression d'un thème (acte destructif NON réversible → pas
 *  d'entrée).
 */

/** L'inverse d'une action de modèle, prêt à être appliqué s'il est encore applicable. */
export type Inverse =
  /** Inverse de « coder » : retirer l'annotation posée (remappée en continu par le modèle). */
  | { type: 'retirerAnnotation'; annotationId: string }
  /** Inverse de « retirer » : re-poser l'objet retiré (remappé en continu par journalRemap). */
  | { type: 'reposerAnnotation'; annotation: Annotation }
  /** Inverse de « éditer un commentaire » ;
   *  restaurer l'auteur et le texte d'avant, sans position (la plage ne bouge
   *  pas, l'id suffit). */
  | { type: 'editerAnnotation'; annotationId: string; auteur: string; texte: string }
  /** Inverse d'« attribuer » : restaurer le loc de chaque bloc touché (positions remappées). */
  | { type: 'restaurerLocs'; blocs: Array<{ pos: number; loc: number | null }> }
  /** Restaure le nom local de la participation, sans renommer son identité corpus. */
  | { type: 'renommerParticipation'; reference: ReferenceParticipation; nom: string }
  /** Restaure la valeur chez son propriétaire dans le même entretien ; null signifie effacer. */
  | { type: 'poserValeur'; entretienId: string; cible: CibleValeur; idVar: string; idMod: string | null }
  /** Retire la note créée seulement si son contenu n'a pas changé. */
  | { type: 'retirerNote'; note: Note }
  /** Restaure une note supprimée si les autres notes sont toujours dans le même ordre. */
  | { type: 'restaurerNote'; note: Note; position: number; ordreApres: string[] }

export interface EntreeJournal {
  id: string
  horodatage: string // ISO
  libelle: string
  inverse: Inverse
}

export interface Journal {
  entrees: EntreeJournal[] // la plus récente en tête, cap CAP_JOURNAL
}

/** 10 dernières actions affichées — au-delà, l'entrée sort du journal (volatil). */
export const CAP_JOURNAL = 10

/**
 *  Le contexte sur lequel un inverse s'applique : le modèle de l'entretien
 *  ouvert. `blocs` est INJECTÉ par la couche éditeur (résolution/écriture
 *  d'un `loc` à une position du doc — le module reste pur, aucun ProseMirror
 *  ici) ; `locDe` renvoie `undefined` si la position ne résout plus un bloc
 *  (cible disparue).
 */
export type ParticipationJournal = Pick<ParticipationLocuteur, 'index' | 'nom' | 'valeursLoc'> & { id?: string }

export interface CtxInverse {
  entretienId: string | null
  entretien: Entretien
  participations: ParticipationJournal[]
  valeursGen: Record<string, string>
  notes?: Note[]
  themeExiste?: (id: string) => boolean
  valeurExiste?: (idVar: string, idMod: string | null) => boolean
  blocs?: {
    locDe: (pos: number) => number | null | undefined
    poserLoc: (pos: number, loc: number | null) => void
  }
}

/** Enregistre une action (entrée en tête, cap à CAP_JOURNAL). */
export function enregistrer(
  journal: Journal,
  libelle: string,
  inverse: Inverse,
  genId: () => string,
  horodatage: string = new Date().toISOString(),
): EntreeJournal {
  const entree: EntreeJournal = { id: genId(), horodatage, libelle, inverse }
  journal.entrees.unshift(entree)
  if (journal.entrees.length > CAP_JOURNAL) journal.entrees.length = CAP_JOURNAL
  return entree
}

function noteInchangee(note: Note, initiale: Note): boolean {
  return noteCreationInchangee(lireNoteFormat9(note), lireNoteFormat9(initiale))
}

/** L'inverse est-il encore applicable (sa cible existe toujours) ?
 *  Sinon l'entrée est grisée « non annulable » — jamais appliquée à moitié. */
export function estApplicable(inverse: Inverse, ctx: CtxInverse): boolean {
  switch (inverse.type) {
    case 'retirerAnnotation':
      return ctx.entretien.annotations.some((a) => a.id === inverse.annotationId)
    case 'reposerAnnotation':
      // Refermée par le remap (texte supprimé) → orpheline → plus re-posable ;
      // déjà revenue au modèle (re-codée) → rien à re-poser.
      return (
        !estOrpheline(inverse.annotation) &&
        (inverse.annotation.type !== 'codage' || !ctx.themeExiste || !!inverse.annotation.code && ctx.themeExiste(inverse.annotation.code)) &&
        !ctx.entretien.annotations.some((a) => a.id === inverse.annotation.id)
      )
    case 'editerAnnotation':
      return ctx.entretien.annotations.some((a) => a.id === inverse.annotationId)
    case 'restaurerLocs':
      return !!ctx.blocs && inverse.blocs.every((b) => ctx.blocs!.locDe(b.pos) !== undefined)
    case 'renommerParticipation':
      return !!ctx.entretienId && inverse.reference?.entretienId === ctx.entretienId && typeof inverse.nom === 'string'
        && !!participationParId(ctx.participations, inverse.reference.participationId)
    case 'poserValeur': {
      if (!ctx.entretienId || inverse.entretienId !== ctx.entretienId
        || (inverse.idMod !== null && typeof inverse.idMod !== 'string')) return false
      try {
        validerLotValeur([{ entretienId: inverse.entretienId, cible: inverse.cible, idVar: inverse.idVar, idMod: inverse.idMod ?? '' }])
        return !!valeursCible({ meta: { valeursGen: ctx.valeursGen }, participations: ctx.participations }, inverse.cible)
          && (!ctx.valeurExiste || ctx.valeurExiste(inverse.idVar, inverse.idMod))
      } catch { return false }
    }
    case 'retirerNote':
      return !!ctx.notes?.some((note) => noteInchangee(note, inverse.note))
    case 'restaurerNote': {
      if (!ctx.notes || ctx.notes.some((note) => note.id === inverse.note.id)) return false
      const ordre = notesParRang(ctx.notes).map((note) => note.id)
      return ordre.length === inverse.ordreApres.length &&
        ordre.every((id, index) => id === inverse.ordreApres[index]) &&
        referencesNoteDisponibles(lireNoteFormat9(inverse.note), ctx.participations)
    }
    default: return false
  }
}

/** Applique l'inverse (mutation du modèle).
 *  Renvoie false sans RIEN toucher si la cible a disparu. */
export function appliquerInverse(inverse: Inverse, ctx: CtxInverse): boolean {
  if (!estApplicable(inverse, ctx)) return false
  switch (inverse.type) {
    case 'retirerAnnotation':
      retirerAnnotation(ctx.entretien, inverse.annotationId)
      return true
    case 'reposerAnnotation':
      ctx.entretien.annotations.push(inverse.annotation)
      return true
    case 'editerAnnotation': {
      const a = ctx.entretien.annotations.find((x) => x.id === inverse.annotationId)
      if (!a || a.type !== 'commentaire') return false
      a.auteur = inverse.auteur
      a.texte = inverse.texte
      return true
    }
    case 'restaurerLocs':
      for (const b of inverse.blocs) ctx.blocs!.poserLoc(b.pos, b.loc)
      return true
    case 'renommerParticipation':
      return renommerParticipation(ctx.participations, inverse.reference.participationId, inverse.nom)
    case 'poserValeur': {
      const valeurs = valeursCible({ meta: { valeursGen: ctx.valeursGen }, participations: ctx.participations }, inverse.cible)!
      poserValeurProprietaire(valeurs, inverse.idVar, inverse.idMod ?? '')
      return true
    }
    case 'retirerNote': {
      const notes = notesParRang(ctx.notes!).filter((note) => note.id !== inverse.note.id)
      ctx.notes!.splice(0, ctx.notes!.length, ...renumeroterRangs(notes))
      return true
    }
    case 'restaurerNote': {
      const notes = notesParRang(ctx.notes!)
      const note = { ...inverse.note, locuteurIds: [...(inverse.note.locuteurIds ?? [])] }
      notes.splice(inverse.position, 0, note)
      ctx.notes!.splice(0, ctx.notes!.length, ...renumeroterRangs(notes))
      return true
    }
  }
}

/** Annule une entrée : applique son inverse puis la retire du journal.
 *  Si la cible a disparu, ne touche à rien et renvoie false (l'entrée reste,
 *  grisée). */
export function annuler(journal: Journal, id: string, ctx: CtxInverse): boolean {
  const i = journal.entrees.findIndex((e) => e.id === id)
  if (i === -1) return false
  if (!appliquerInverse(journal.entrees[i].inverse, ctx)) return false
  journal.entrees.splice(i, 1)
  return true
}
