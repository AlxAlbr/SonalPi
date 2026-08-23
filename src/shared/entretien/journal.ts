import { estOrpheline, type Annotation } from './annotation'
import { retirerAnnotation, type Entretien } from './entretien'
import { renommerLocuteur } from './locuteurs'
import type { Locuteur } from '../format'

/**
 * Journal d'actions annulables. Seules les actions de MODÈLE y entrent
 * (codages, locuteurs, valeurs) — la frappe de texte reste sur Ctrl+Z. Journal
 * VOLATIL : session courante, jamais persisté, vidé à l'ouverture d'un entretien.
 *
 * L'inverse d'une action est une DONNÉE typée (jamais une closure) : on peut la
 * tester headless, vérifier son applicabilité (la cible existe encore ?) et la
 * remapper. Car les inverses portent des positions qui doivent SUIVRE les
 * éditions, comme le modèle : l'annotation retirée (à re-poser) et les positions
 * de blocs (dont il faut restaurer le `loc`) sont remappées en continu par
 * `editor/journalRemap.ts` — le pendant journal du remap des annotations.
 *
 * « Cible disparue → grisée » découle du même mécanisme : une annotation fantôme
 * dont la plage a été supprimée se referme au remap (orpheline) → plus re-posable.
 *
 * Hors périmètre (assumé) : ajouter un locuteur (pas de suppression modélisée),
 * la suppression d'un thème (acte destructif NON réversible → pas d'entrée).
 */

/** L'inverse d'une action de modèle, prêt à être appliqué s'il est encore applicable. */
export type Inverse =
  /** Inverse de « coder » : retirer l'annotation posée (remappée en continu par le modèle). */
  | { type: 'retirerAnnotation'; annotationId: string }
  /** Inverse de « retirer » : re-poser l'objet retiré (remappé en continu par journalRemap). */
  | { type: 'reposerAnnotation'; annotation: Annotation }
  /** Inverse de « éditer un commentaire » : restaurer l'auteur et le texte
   *  d'avant (pas de position : la plage ne bouge pas, l'id suffit). */
  | { type: 'editerAnnotation'; annotationId: string; auteur: string; texte: string }
  /** Inverse d'« attribuer » : restaurer le loc de chaque bloc touché (positions remappées). */
  | { type: 'restaurerLocs'; blocs: Array<{ pos: number; loc: number | null }> }
  /** Inverse de « renommer un locuteur » : reposer l'ancien nom. */
  | { type: 'renommerLocuteur'; index: number; nom: string }
  /** Inverse de « saisir une valeur » (portée entretien) : reposer l'ancienne (null = effacer). */
  | { type: 'poserValeurGen'; idVar: string; idMod: string | null }
  /** Inverse de « saisir une valeur » (portée locuteur). */
  | { type: 'poserValeurLoc'; index: number; idVar: string; idMod: string | null }

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
 * Le contexte sur lequel un inverse s'applique : le modèle de l'entretien ouvert.
 * `blocs` est INJECTÉ par la couche éditeur (résolution/écriture d'un `loc` à une
 * position du doc — le module reste pur, aucun ProseMirror ici) ; `locDe` renvoie
 * `undefined` si la position ne résout plus un bloc (cible disparue).
 */
export interface CtxInverse {
  entretien: Entretien
  locuteurs: Locuteur[]
  valeursGen: Record<string, string>
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

/** L'inverse est-il encore applicable (sa cible existe toujours) ? Sinon l'entrée
 *  est grisée « non annulable » — jamais appliquée à moitié. */
export function estApplicable(inverse: Inverse, ctx: CtxInverse): boolean {
  switch (inverse.type) {
    case 'retirerAnnotation':
      return ctx.entretien.annotations.some((a) => a.id === inverse.annotationId)
    case 'reposerAnnotation':
      // Refermée par le remap (texte supprimé) → orpheline → plus re-posable ;
      // déjà revenue au modèle (re-codée) → rien à re-poser.
      return (
        !estOrpheline(inverse.annotation) &&
        !ctx.entretien.annotations.some((a) => a.id === inverse.annotation.id)
      )
    case 'editerAnnotation':
      return ctx.entretien.annotations.some((a) => a.id === inverse.annotationId)
    case 'restaurerLocs':
      return !!ctx.blocs && inverse.blocs.every((b) => ctx.blocs!.locDe(b.pos) !== undefined)
    case 'renommerLocuteur':
    case 'poserValeurLoc':
      return ctx.locuteurs.some((l) => l.index === inverse.index)
    case 'poserValeurGen':
      return true
  }
}

/** Applique l'inverse (mutation du modèle). Renvoie false sans RIEN toucher si
 *  la cible a disparu. */
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
    case 'renommerLocuteur':
      renommerLocuteur(ctx.locuteurs, inverse.index, inverse.nom)
      return true
    case 'poserValeurGen':
      if (inverse.idMod) ctx.valeursGen[inverse.idVar] = inverse.idMod
      else delete ctx.valeursGen[inverse.idVar]
      return true
    case 'poserValeurLoc': {
      const l = ctx.locuteurs.find((x) => x.index === inverse.index)!
      if (inverse.idMod) l.valeursLoc[inverse.idVar] = inverse.idMod
      else delete l.valeursLoc[inverse.idVar]
      return true
    }
  }
}

/** Annule une entrée : applique son inverse puis la retire du journal. Si la
 *  cible a disparu, ne touche à rien et renvoie false (l'entrée reste, grisée). */
export function annuler(journal: Journal, id: string, ctx: CtxInverse): boolean {
  const i = journal.entrees.findIndex((e) => e.id === id)
  if (i === -1) return false
  if (!appliquerInverse(journal.entrees[i].inverse, ctx)) return false
  journal.entrees.splice(i, 1)
  return true
}
