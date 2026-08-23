/**
 * Modèle PUR de navigation clavier de la table de données : construction de
 * la grille des cellules éditables dans l'ordre visuel + voisine dans les
 * quatre sens. Sans DOM — le câblage focus/scroll est testé par les e2e.
 */
import { describe, expect, it } from 'vitest'
import { celluleVoisine, cleGen, cleLoc, grilleCellules } from '../src/renderer/tableNavigation'

/** Deux entretiens : e1 avec 2 locuteurs, e2 avec 1. Deux variables :
 *  « ville » (entretien) et « âge » (locuteur). */
const entrees = [
  {
    entretienId: 'e1',
    locuteurs: [
      { index: 0 },
      { index: 1 },
    ],
  },
  {
    entretienId: 'e2',
    locuteurs: [{ index: 0 }],
  },
]
const variables = [
  { id: 'ville', portee: 'entretien' as const },
  { id: 'age', portee: 'locuteur' as const },
]

describe('grilleCellules', () => {
  it('ordre VISUEL : ligne entretien puis ses locuteurs, entretien suivant', () => {
    const g = grilleCellules({ entrees, variables, montrerLocuteurs: true, editable: () => true })
    // Ligne e1 (colonne ville seule — « age » est de portée locuteur)
    expect(g[0]).toEqual([cleGen('e1', 'ville'), null])
    // Locuteurs de e1 (colonne age seule)
    expect(g[1]).toEqual([null, cleLoc('e1', 0, 'age')])
    expect(g[2]).toEqual([null, cleLoc('e1', 1, 'age')])
    // Ligne e2 puis son locuteur
    expect(g[3]).toEqual([cleGen('e2', 'ville'), null])
    expect(g[4]).toEqual([null, cleLoc('e2', 0, 'age')])
  })

  it('filtre « entretien » : les lignes locuteurs disparaissent', () => {
    const g = grilleCellules({
      entrees,
      variables: variables.filter((v) => v.portee === 'entretien'),
      montrerLocuteurs: false,
      editable: () => true,
    })
    expect(g).toEqual([
      [cleGen('e1', 'ville')],
      [cleGen('e2', 'ville')],
    ])
  })

  it('ligne verrouillée 🔒 : géométrie conservée, cellules absentes', () => {
    const g = grilleCellules({
      entrees,
      variables,
      montrerLocuteurs: true,
      editable: (id) => id !== 'e1',
    })
    expect(g[0]).toEqual([null, null]) // e1 verrouillé : aucun cellule…
    expect(g[3]).toEqual([cleGen('e2', 'ville'), null]) // …mais la ligne EXISTE
    expect(g[4]).toEqual([null, cleLoc('e2', 0, 'age')])
  })
})

describe('celluleVoisine', () => {
  const g = grilleCellules({ entrees, variables, montrerLocuteurs: true, editable: () => true })

  it('Entrée (bas) depuis une colonne entretien SAUTE les lignes locuteur', () => {
    expect(celluleVoisine(g, cleGen('e1', 'ville'), 'bas')).toBe(cleGen('e2', 'ville'))
  })

  it('Shift+Entrée (haut) : symétrique', () => {
    expect(celluleVoisine(g, cleGen('e2', 'ville'), 'haut')).toBe(cleGen('e1', 'ville'))
  })

  it('Entrée (bas) dans une colonne locuteur : d\u2019un locuteur à l\u2019autre, en traversant la ligne entretien', () => {
    expect(celluleVoisine(g, cleLoc('e1', 0, 'age'), 'bas')).toBe(cleLoc('e1', 1, 'age'))
    expect(celluleVoisine(g, cleLoc('e1', 1, 'age'), 'bas')).toBe(cleLoc('e2', 0, 'age'))
  })

  it('Tab (droite) / Shift+Tab (gauche) : voisine sur la MÊME ligne, sans sortir', () => {
    // Ligne e1 : seule cellule = ville → pas de voisine horizontale.
    expect(celluleVoisine(g, cleGen('e1', 'ville'), 'droite')).toBeNull()
    expect(celluleVoisine(g, cleGen('e1', 'ville'), 'gauche')).toBeNull()
    // Grille mixte : deux variables d'entretien sur une même ligne.
    const deuxEnt = grilleCellules({
      entrees: [{ entretienId: 'e1', locuteurs: [] }],
      variables: [
        { id: 'a', portee: 'entretien' as const },
        { id: 'b', portee: 'entretien' as const },
      ],
      montrerLocuteurs: true,
      editable: () => true,
    })
    expect(deuxEnt[0]).toEqual([cleGen('e1', 'a'), cleGen('e1', 'b')])
    expect(celluleVoisine(deuxEnt, cleGen('e1', 'a'), 'droite')).toBe(cleGen('e1', 'b'))
    expect(celluleVoisine(deuxEnt, cleGen('e1', 'b'), 'gauche')).toBe(cleGen('e1', 'a'))
  })

  it('bord de grille : null (l\u2019appelant laisse Tab/Entrée natifs reprendre)', () => {
    expect(celluleVoisine(g, cleGen('e2', 'ville'), 'bas')).toBeNull()
    expect(celluleVoisine(g, cleLoc('e2', 0, 'age'), 'bas')).toBeNull()
    expect(celluleVoisine(g, cleGen('e1', 'ville'), 'haut')).toBeNull()
  })

  it('clé inconnue → null', () => {
    expect(celluleVoisine(g, 'nimporte|quoi', 'bas')).toBeNull()
  })

  it('les lignes verrouillées sont TRAVERSÉES, jamais cibles', () => {
    const gVerrou = grilleCellules({
      entrees,
      variables,
      montrerLocuteurs: true,
      editable: (id) => id !== 'e1',
    })
    // Depuis… rien sur e1 ; on part de la première cellule existante (e2) :
    expect(celluleVoisine(gVerrou, cleGen('e2', 'ville'), 'haut')).toBeNull() // e1 verrouillé au-dessus
    expect(celluleVoisine(gVerrou, cleLoc('e2', 0, 'age'), 'haut')).toBeNull()
  })
})
