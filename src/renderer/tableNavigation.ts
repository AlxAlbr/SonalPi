/**
 * NAVIGATION CLAVIER DE LA TABLE DE DONNÉES :
 * modèle de déplacement PUR, testable sans DOM. À partir de la matrice, des
 * variables visibles et du filtre de portée, calcule la GRILLE des cellules
 * éditables dans l'ordre VISUEL (lignes × colonnes), puis la voisine d'une
 * cellule dans un des quatre sens (Entrée/Shift+Entrée = bas/haut,
 * Tab/Shift+Tab = droite/gauche).
 *
 * Règles de saut :
 *  - une colonne n'a de cellule que sur les lignes de SA portée → les lignes
 *    sans cellule (locuteurs sous une colonne entretien, séparateurs
 *    entretien sous une colonne locuteur) sont traversées sans s'arrêter ;
 *  - les lignes NON ÉDITABLES (entretien verrouillé 🔒 par autrui en corpus
 *    distant) n'ont aucune cellule → la navigation les saute aussi.
 */
import type { MatriceCorpus, Variable } from '../shared/format'

export type SensNav = 'bas' | 'haut' | 'droite' | 'gauche'

/** Clés de cellules — MÊME convention que TableDonnees.vue (`cleGen`/`cleLoc`) :
 *  le registre de focus du composant et cette grille partagent l'espace. */
export const cleGen = (entId: string, idVar: string) => `${entId}|${idVar}`
export const cleLoc = (entId: string, index: number, idVar: string) => `${entId}|${index}|${idVar}`

/** La grille : lignes dans l'ordre visuel, cellules = clé ou null (absente). */
export type Grille = (string | null)[][]

/** Entrées minimales pour construire la grille (structural typing sur
 *  `MatriceCorpus` et `Variable[]` — rien à convertir côté composant). */
export interface SourceGrille {
  entrees: Pick<MatriceCorpus[number], 'entretienId' | 'locuteurs'>[]
  variables: Pick<Variable, 'id' | 'portee'>[]
  /** Filtre de portée ≠ « entretien » : les lignes locuteurs apparaissent. */
  montrerLocuteurs: boolean
  /** Garde PAR LIGNE (`tableLigneEditable`) : false = ligne sans cellules. */
  editable: (entretienId: string) => boolean
}

/** Construit la grille des cellules éditables dans l'ordre VISUEL. Les lignes
 *  non éditables restent présentes (que des null) : la géométrie suit ce que
 *  l'utilisateur voit, la navigation saute simplement les trous. */
export function grilleCellules(o: SourceGrille): Grille {
  const g: Grille = []
  for (const e of o.entrees) {
    const editable = o.editable(e.entretienId)
    g.push(
      o.variables.map((v) =>
        v.portee === 'entretien' && editable ? cleGen(e.entretienId, v.id) : null,
      ),
    )
    if (o.montrerLocuteurs)
      for (const l of e.locuteurs)
        g.push(
          o.variables.map((v) =>
            v.portee === 'locuteur' && editable ? cleLoc(e.entretienId, l.index, v.id) : null,
          ),
        )
  }
  return g
}

/** La voisine ÉDITABLE de `cle` dans le sens demandé (null = bord de grille :
 *  l'appelant laissera Tab/Entrée reprendre leur comportement natif). */
export function celluleVoisine(g: Grille, cle: string, sens: SensNav): string | null {
  let r = -1
  let c = -1
  for (let i = 0; i < g.length && r < 0; i++) {
    const j = g[i].indexOf(cle)
    if (j >= 0) {
      r = i
      c = j
    }
  }
  if (r < 0) return null // cellule inconnue (ex. saisie libre jamais rendue)
  switch (sens) {
    case 'droite':
      for (let j = c + 1; j < g[r].length; j++) if (g[r][j]) return g[r][j]
      return null
    case 'gauche':
      for (let j = c - 1; j >= 0; j--) if (g[r][j]) return g[r][j]
      return null
    case 'bas':
      for (let i = r + 1; i < g.length; i++) if (g[i][c]) return g[i][c]
      return null
    case 'haut':
      for (let i = r - 1; i >= 0; i--) if (g[i][c]) return g[i][c]
      return null
  }
}
