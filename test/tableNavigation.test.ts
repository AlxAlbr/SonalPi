import { describe, expect, it } from 'vitest'
import { celluleVoisine, cleGen, cleParticipation, grilleCellules } from '../src/renderer/tableNavigation'

const entrees = [
  { entretienId: 'e1', participations: [{ participationId: 'p0' }, { participationId: 'p1' }] },
  { entretienId: 'e2', participations: [{ participationId: 'p0' }] },
]
const variables = [{ id: 'ville', portee: 'entretien' as const }, { id: 'age', portee: "participation" as const }]

describe('grilleCellules', () => {
  it('garde l’ordre visuel : entretien, participations, entretien suivant', () => {
    const g = grilleCellules({ entrees, variables, montrerLocuteurs: true, editable: () => true })
    expect(g).toEqual([
      [cleGen('e1', 'ville'), null],
      [null, cleParticipation('e1', 'p0', 'age')],
      [null, cleParticipation('e1', 'p1', 'age')],
      [cleGen('e2', 'ville'), null],
      [null, cleParticipation('e2', 'p0', 'age')],
    ])
  })

  it('le filtre entretien retire les lignes locales', () => {
    const g = grilleCellules({ entrees, variables: [variables[0]], montrerLocuteurs: false, editable: () => true })
    expect(g).toEqual([[cleGen('e1', 'ville')], [cleGen('e2', 'ville')]])
  })

  it('une ligne verrouillée conserve sa place, sans cellule éditable', () => {
    const g = grilleCellules({ entrees, variables, montrerLocuteurs: true, editable: (id) => id !== 'e1' })
    expect(g[0]).toEqual([null, null])
    expect(g[1]).toEqual([null, null])
    expect(g[3]).toEqual([cleGen('e2', 'ville'), null])
    expect(g[4]).toEqual([null, cleParticipation('e2', 'p0', 'age')])
  })

  it('une participation sans id n’est ni complétée ni rendue éditable', () => {
    const source = [{ entretienId: 'e1', participations: [{ participationId: null }] }]
    expect(grilleCellules({ entrees: source, variables, montrerLocuteurs: true, editable: () => true })[1]).toEqual([null, null])
    expect(source[0].participations[0].participationId).toBeNull()
  })

  it('des ids contenant des séparateurs ne produisent pas la même clé', () => {
    expect(cleParticipation('e1', 'p|v', 'x')).not.toBe(cleParticipation('e1', 'p', 'v|x'))
    expect(cleParticipation('e1', 'p0', 'age')).not.toBe(cleParticipation('e2', 'p0', 'age'))
  })
})

describe('celluleVoisine', () => {
  const g = grilleCellules({ entrees, variables, montrerLocuteurs: true, editable: () => true })

  it('Entrée saute les lignes locales dans une colonne entretien', () => {
    expect(celluleVoisine(g, cleGen('e1', 'ville'), 'bas')).toBe(cleGen('e2', 'ville'))
  })

  it('Shift+Entrée remonte symétriquement', () => {
    expect(celluleVoisine(g, cleGen('e2', 'ville'), 'haut')).toBe(cleGen('e1', 'ville'))
  })

  it('une colonne locale parcourt les participations et traverse les lignes entretien', () => {
    expect(celluleVoisine(g, cleParticipation('e1', 'p0', 'age'), 'bas')).toBe(cleParticipation('e1', 'p1', 'age'))
    expect(celluleVoisine(g, cleParticipation('e1', 'p1', 'age'), 'bas')).toBe(cleParticipation('e2', 'p0', 'age'))
  })

  it('Tab et Shift+Tab restent sur la ligne', () => {
    expect(celluleVoisine(g, cleGen('e1', 'ville'), 'droite')).toBeNull()
    expect(celluleVoisine(g, cleGen('e1', 'ville'), 'gauche')).toBeNull()
    const deux = grilleCellules({ entrees: [{ entretienId: 'e1', participations: [] }],
      variables: [{ id: 'a', portee: 'entretien' }, { id: 'b', portee: 'entretien' }],
      montrerLocuteurs: true, editable: () => true })
    expect(deux[0]).toEqual([cleGen('e1', 'a'), cleGen('e1', 'b')])
    expect(celluleVoisine(deux, cleGen('e1', 'a'), 'droite')).toBe(cleGen('e1', 'b'))
    expect(celluleVoisine(deux, cleGen('e1', 'b'), 'gauche')).toBe(cleGen('e1', 'a'))
  })

  it('les bords de grille rendent la main à la navigation native', () => {
    expect(celluleVoisine(g, cleGen('e2', 'ville'), 'bas')).toBeNull()
    expect(celluleVoisine(g, cleParticipation('e2', 'p0', 'age'), 'bas')).toBeNull()
    expect(celluleVoisine(g, cleGen('e1', 'ville'), 'haut')).toBeNull()
  })

  it('une clé inconnue n’a pas de voisine', () => {
    expect(celluleVoisine(g, 'inconnue', 'bas')).toBeNull()
  })

  it('les lignes verrouillées sont traversées sans devenir des cibles', () => {
    const verrou = grilleCellules({ entrees, variables, montrerLocuteurs: true, editable: (id) => id !== 'e1' })
    expect(celluleVoisine(verrou, cleGen('e2', 'ville'), 'haut')).toBeNull()
    expect(celluleVoisine(verrou, cleParticipation('e2', 'p0', 'age'), 'haut')).toBeNull()
  })
})
