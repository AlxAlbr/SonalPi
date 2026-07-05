import type { Annotation, AnnotationType } from './annotation'

/**
 * L'agrégat Entretien. Au set minimum, il porte les annotations (le corps-texte
 * vit dans l'éditeur ProseMirror ; sa sérialisation JSON viendra à l'étape 2).
 * Ces commandes sont pures : aucun accès au DOM ni au disque (MODELE_OBJET §2).
 */
export interface Entretien {
  annotations: Annotation[]
}

/**
 * Pose un codage sur la plage [from, to[ (positions ProseMirror, déjà snappées
 * au mot par la couche éditeur). Renvoie l'annotation créée, ou null si la plage
 * est vide.
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
 * Cherche un codage exactement sur la plage [from, to[ avec ce `code` (requête
 * de lecture) — support du geste « re-coder la même sélection = retirer » (toggle).
 */
export function trouverCodage(
  entretien: Entretien,
  args: { from: number; to: number; code: string },
): Annotation | undefined {
  return entretien.annotations.find(
    (a) => a.type === 'codage' && a.code === args.code && a.from === args.from && a.to === args.to,
  )
}

/** Toutes les annotations d'un type (requête de lecture). */
export function annotationsDeType(entretien: Entretien, type: AnnotationType): Annotation[] {
  return entretien.annotations.filter((a) => a.type === type)
}
