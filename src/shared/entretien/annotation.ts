export type AnnotationType = 'codage' | 'anon' | 'commentaire'

export interface Annotation {
  id: string
  type: AnnotationType
  /**
   *  Positions ProseMirror absolues (entiers), remappées à chaque transaction
   *  par editor/remap.ts. Sérialisées atomiquement avec le document → valides
   *  par construction à la relecture (pas de reindexation).
   */
  from: number
  to: number
  auteur: string
  code?: string
  regle?: string
  /**
   *  anon : pseudonyme appliqué, tel que porté par le `.sonal` (data-pseudo).
   *  Provisoire — quand les `RegleAnon` seront modélisées, l'annotation
   *  référencera la règle par `regle` (id) et lira le pseudo depuis elle
   *  (le pseudo vit sur la règle, pas sur l'annotation).
   */
  pseudo?: string
  etat?: 'anonymise' | 'exception'
  texte?: string
}

/**
 *  Requête, pas un champ stocké (référence pendante = inerte, conservée,
 *  signalée) : une annotation dont la plage a été entièrement supprimée (from
 *  a rejoint to) est orpheline ; on la conserve (pas de suppression silencieuse),
 *  et elle se liste par cette requête.
 */
export function estOrpheline(a: Annotation): boolean {
  return a.from >= a.to
}
