export type AnnotationType = 'codage' | 'anon' | 'commentaire'

export interface Annotation {
  id: string
  type: AnnotationType
  /**
   * Positions ProseMirror absolues (entiers), remappées à chaque transaction
   * par editor/remap.ts. Sérialisées atomiquement avec le document → valides
   * par construction à la relecture (pas de reindexation). Cf. MODELE_OBJET §2.
   */
  from: number
  to: number
  auteur: string
  code?: string
  regle?: string
  /**
   * anon : pseudonyme appliqué, tel que porté par le `.sonal` (data-pseudo).
   * Provisoire (étape 3) — quand les `RegleAnon` seront modélisées, l'annotation
   * référencera la règle par `regle` (id) et lira le pseudo depuis elle
   * (MODELE_OBJET2 §6, « le pseudo vit sur la règle »).
   */
  pseudo?: string
  etat?: 'anonymise' | 'exception'
  texte?: string
}

/**
 * Requête, pas un champ stocké (MODELE_OBJET2 règle n°3) : une annotation dont
 * la plage a été entièrement supprimée (from a rejoint to) est orpheline. On la
 * conserve (pas de suppression silencieuse) ; elle se liste par cette requête.
 */
export function estOrpheline(a: Annotation): boolean {
  return a.from >= a.to
}
