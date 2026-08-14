import type { Locuteur } from '../format'

/**
 * Locuteurs d'un entretien. Le `loc` d'un bloc RÉFÉRENCE un locuteur par son
 * `index` (numérique, par entretien — l'exception assumée à l'identité opaque :
 * sous verrou il n'y a qu'un écrivain, et c'est ce que le `.sonal` référence).
 * Renommer = éditer l'entrée ; les blocs, qui ne portent que l'index, ne sont
 * pas touchés (référence, pas copie).
 *
 * Fonctions pures : aucun DOM, aucun ProseMirror — testables headless.
 */

/** Nom d'un locuteur par index (fallback lisible si inconnu / non attribué). */
export function nomDeLocuteur(locuteurs: Locuteur[], index: number | null): string {
  if (index == null) return ''
  return locuteurs.find((l) => l.index === index)?.nom ?? `loc ${index}`
}

/** Prochain index libre (max + 1 ; 1 si vide). */
export function prochainIndex(locuteurs: Locuteur[]): number {
  return locuteurs.reduce((m, l) => Math.max(m, l.index), 0) + 1
}

/** Renomme un locuteur (répercuté partout par référence — aucun bloc modifié). */
export function renommerLocuteur(locuteurs: Locuteur[], index: number, nom: string): void {
  const l = locuteurs.find((x) => x.index === index)
  if (l) l.nom = nom
}

/** Ajoute un locuteur avec le prochain index libre ; renvoie l'entrée créée. */
export function ajouterLocuteur(locuteurs: Locuteur[], nom: string): Locuteur {
  const l: Locuteur = { index: prochainIndex(locuteurs), nom, valeursLoc: {}, personneRef: null }
  locuteurs.push(l)
  return l
}

/** Retire un locuteur de la liste. Les blocs qui le référencent doivent être
 *  désattribués (loc → null) par l'appelant — le module ignore l'éditeur. */
export function supprimerLocuteur(locuteurs: Locuteur[], index: number): void {
  const i = locuteurs.findIndex((l) => l.index === index)
  if (i !== -1) locuteurs.splice(i, 1)
}
