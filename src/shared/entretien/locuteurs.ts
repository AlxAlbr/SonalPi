import type { Locuteur } from '../format'

/**
 *  Locuteurs d'un entretien. Le `loc` d'un bloc RÉFÉRENCE un locuteur par son
 *  `index` (numérique, par entretien — l'exception assumée à l'identité
 *  opaque : sous verrou il n'y a qu'un écrivain, et c'est ce que le `.sonal`
 *  référence). Renommer = éditer l'entrée ; les blocs, qui ne portent que
 *  l'index, ne sont pas touchés (référence, pas copie).
 *
 *  Fonctions pures : aucun DOM, aucun ProseMirror — testables headless.
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

/** Retire un locuteur de la liste.
 *  Les blocs qui le référencent doivent être désattribués (loc → null)
 *  par l'appelant — le module ignore l'éditeur. */
export function supprimerLocuteur(locuteurs: Locuteur[], index: number): void {
  const i = locuteurs.findIndex((l) => l.index === index)
  if (i !== -1) locuteurs.splice(i, 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Pseudonymisation de l'ÉTIQUETTE du locuteur.
//
// Le pseudo est un CHAMP du locuteur (`pseudo`/`pseudoEtat`) : le rendu suit par RÉFÉRENCE (le widget de gouttière,
// futur export) — pas de hack DOM.
// La fonction pure ci-dessous dérive les parts d'affichage du libellé ;
// la « suggestion » (nom matchant une règle corpus) est une REQUÊTE, jamais stockée — hors de cette fonction.
// ─────────────────────────────────────────────────────────────────────────────

/** Parts d'affichage du libellé de tour (gouttière / exports) : PURE, testable.
 *  - `nom` : nom réel affiché, avec « ? » pour un interviewer (convention
 *    SonalPi1, réintroduite au rendu seulement — jamais au modèle) ;
 *  - `pseudo` : pseudonyme affiché (libellé BARRÉ + [pseudo]), ou null ;
 *  - `refuse` : décision « ne pas pseudonymiser » persistée (libellé en clair
 *    + ⊘).
 *  Ordre des cas : un refus explicite prime sur le pseudo (parité SonalPi1). */
export interface LibelleGouttiere {
  nom: string
  pseudo: string | null
  refuse: boolean
  index: number
  /** Couleur effective du NOM dans l'éditeur : choisie par l'utilisateur (locuteur.couleur),
   *  ou auto par index (palette prédéfinie). */
  couleur: string
}

/**
 *  Palette PRÉDÉFINIE des pastilles de locuteur (parité visuelle des pastilles
 *  de thème, mais ici auto-remplie — pas de codebook). Une couleur stable par
 *  INDEX (l'identité que les blocs référencent) : renommer un locuteur ne
 *  change pas sa couleur ; la suppression d'un locuteur fait remonter les
 *  couleurs des suivants (l'index est la seule identité du modèle).
 */
export const PALETTE_PASTILLES_LOCUTEURS = [
  '#e57373', // rouge doux
  '#64b5f6', // bleu
  '#81c784', // vert
  '#ffb74d', // orange
  '#ba68c8', // violet
  '#4dd0e1', // cyan
  '#f06292', // rose
  '#aed581', // vert clair
  '#7986cb', // indigo
  '#ffd54f', // jaune
]

/** Couleur de la pastille d'un locuteur : stable par index, dans la palette. */
export function couleurPourLocuteur(index: number): string {
  return PALETTE_PASTILLES_LOCUTEURS[(index - 1) % PALETTE_PASTILLES_LOCUTEURS.length] ?? PALETTE_PASTILLES_LOCUTEURS[0]
}

/** Noms affichables des couleurs de la palette,
 *  pour l'écriture du nom de la couleur choisie depuis le tableau des locuteurs.
 */
export const NOMS_COULEURS_LOCUTEURS: Record<string, string> = {
  '#e57373': 'Rouge',
  '#64b5f6': 'Bleu',
  '#81c784': 'Vert',
  '#ffb74d': 'Orange',
  '#ba68c8': 'Violet',
  '#4dd0e1': 'Cyan',
  '#f06292': 'Rose',
  '#aed581': 'Vert clair',
  '#7986cb': 'Indigo',
  '#ffd54f': 'Jaune',
}

/** Nom d'une couleur de la palette (« Vert » pour #81c784) — repli = le code brut. */
export function nomDeCouleur(couleur: string): string {
  return NOMS_COULEURS_LOCUTEURS[couleur] ?? couleur
}

export function libelleGouttiere(
  locuteurs: Locuteur[],
  index: number | null,
  interviewer: boolean,
): LibelleGouttiere {
  if (index == null) return { nom: '', pseudo: null, refuse: false, index: -1, couleur: couleurPourLocuteur(1) }
  const l = locuteurs.find((x) => x.index === index)
  const nomBrut = l?.nom ?? `loc ${index}`
  const nom = nomBrut && interviewer ? `${nomBrut} ?` : nomBrut
  const couleur = l?.couleur ?? couleurPourLocuteur(index)
  if (!l) return { nom, pseudo: null, refuse: false, index, couleur }
  if (l.pseudoEtat === 'refuse') return { nom, pseudo: null, refuse: true, index, couleur }
  return { nom, pseudo: l.pseudo || null, refuse: false, index, couleur }
}
