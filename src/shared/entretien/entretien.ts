import type { Annotation, AnnotationType } from './annotation'
import type { Ancre } from './audio'
import type { ReperePassage } from './reperesPassages'

/**
 *  L'agrégat Entretien. Il porte les annotations et les ancres temporelles —
 *  deux familles de positions remappées par l'éditeur ; le corps-texte vit dans
 *  l'éditeur ProseMirror. Ces commandes sont pures : aucun accès au DOM ni au
 *  disque (le modèle est la vérité, l'éditeur n'en est que la projection).
 */
export interface Entretien {
  annotations: Annotation[]
  ancres: Ancre[]
  reperesPassages: ReperePassage[]
}

/**
 *  Pose un codage sur la plage [from, to[ (positions ProseMirror, déjà
 *  snappées au mot par la couche éditeur). Renvoie l'annotation créée, ou
 *  null si la plage est vide.
 */
export function ajouterCodage(
  entretien: Entretien,
  args: { from: number; to: number; code: string; auteur: string },
  genId: () => string,
): Annotation | null {
  if (args.from >= args.to) return null
  const annotation: Annotation = {
    id: genId(),
    type: 'codage',
    from: args.from,
    to: args.to,
    auteur: args.auteur,
    code: args.code,
  }
  entretien.annotations.push(annotation)
  return annotation
}

/** Retire une annotation par son id. */
export function retirerAnnotation(entretien: Entretien, id: string): void {
  const i = entretien.annotations.findIndex((a) => a.id === id)
  if (i !== -1) entretien.annotations.splice(i, 1)
}

/**
 *  Cherche un codage exactement sur la plage [from, to[ avec ce `code`
 *  (requête de lecture) — support du geste « re-coder la même sélection =
 *  retirer » (toggle).
 */
export function trouverCodage(
  entretien: Entretien,
  args: { from: number; to: number; code: string },
): Annotation | undefined {
  return entretien.annotations.find(
    (a) => a.type === 'codage' && a.code === args.code && a.from === args.from && a.to === args.to,
  )
}

/**
 *  Pose un commentaire sur la plage [from, to[ (positions ProseMirror). Un
 *  commentaire EST une annotation autonome (type « commentaire », texte +
 *  auteur) ; pas de lien vers un codage — le clic droit sur un codage copie
 *  simplement ses bornes. Renvoie l'annotation créée, ou null si la plage est
 *  vide ou le texte vide.
 */
export function ajouterCommentaire(
  entretien: Entretien,
  args: { from: number; to: number; auteur: string; texte: string },
  genId: () => string,
): Annotation | null {
  const texte = args.texte.trim()
  if (args.from >= args.to || !texte) return null
  const annotation: Annotation = {
    id: genId(),
    type: 'commentaire',
    from: args.from,
    to: args.to,
    auteur: args.auteur.trim(),
    texte,
  }
  entretien.annotations.push(annotation)
  return annotation
}

/** Réécrit le texte et/ou l'auteur d'un commentaire existant.
 *  Renvoie false si l'id ne désigne pas un commentaire, ou si le texte devient
 *  vide. */
export function modifierCommentaire(
  entretien: Entretien,
  id: string,
  args: { auteur: string; texte: string },
): boolean {
  const a = entretien.annotations.find((x) => x.id === id)
  if (!a || a.type !== 'commentaire') return false
  const texte = args.texte.trim()
  if (!texte) return false
  a.auteur = args.auteur.trim()
  a.texte = texte
  return true
}

/** Toutes les annotations d'un type (requête de lecture). */
export function annotationsDeType(entretien: Entretien, type: AnnotationType): Annotation[] {
  return entretien.annotations.filter((a) => a.type === type)
}

/** Texte brut d'un corps ProseMirror (schéma gelé doc › paragraph{loc} › text).
 *  Sert aux gardes « contenu déjà présent » — ex. l'assignation d'un SRT
 *  remplace la transcription et ne doit pas écraser en silence. */
export function texteDuCorps(corpsTexte: unknown): string {
  const doc = corpsTexte as
    | { content?: Array<{ content?: Array<{ text?: string }> }> }
    | null
    | undefined
  if (!doc?.content) return ''
  let texte = ''
  for (const bloc of doc.content) {
    for (const noeud of bloc.content ?? []) texte += noeud.text ?? ''
  }
  return texte
}
