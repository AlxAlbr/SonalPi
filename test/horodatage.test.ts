import { describe, expect, test } from 'vitest'
import {
  bornesTour,
  formaterDuree,
  formaterTemps,
  lireTemps,
  toursHorodates,
  type BlocHorodatage,
} from '../src/shared/entretien/horodatage'

// Trois blocs de 10 caractères : deux du locuteur 1, puis un du locuteur 2.
// Contenus : [1, 11], [13, 23], [25, 35].
const blocs: BlocHorodatage[] = [
  { pos: 1, longueur: 10, loc: 1 },
  { pos: 13, longueur: 10, loc: 1 },
  { pos: 25, longueur: 10, loc: 2 },
]
// Une ancre au début et à la fin de chaque bloc, comme après un import SRT.
const ancres = [
  { pos: 1, t: 0 },
  { pos: 11, t: 2 },
  { pos: 13, t: 2.5 },
  { pos: 23, t: 5 },
  { pos: 25, t: 6 },
  { pos: 35, t: 9 },
]

describe('horodatage des tours', () => {
  test('regroupe les blocs du même locuteur et rattache leurs ancres', () => {
    const tours = toursHorodates(blocs, ancres)
    expect(tours.map((t) => [t.premierBloc, t.dernierBloc, t.premiereAncre, t.derniereAncre])).toEqual([
      [0, 1, 0, 3],
      [2, 2, 4, 5],
    ])
    expect(bornesTour(tours[0], ancres)).toEqual({ debut: 0, fin: 5 })
    expect(bornesTour(tours[1], ancres)).toEqual({ debut: 6, fin: 9 })
  })

  test('un tour sans ancres n’a pas de temps', () => {
    const tours = toursHorodates(blocs, ancres.slice(0, 4))
    expect(bornesTour(tours[1], ancres.slice(0, 4))).toBeNull()
  })

  test('formats d’affichage', () => {
    expect(formaterTemps(12.44)).toBe('0:12.4')
    expect(formaterTemps(3723.4)).toBe('1:02:03.4')
    expect(formaterDuree(19.4)).toBe('19,4 s')
    expect(formaterDuree(125)).toBe('2 min 05 s')
  })

  test('lecture des temps saisis', () => {
    expect(lireTemps('12,4')).toBeCloseTo(12.4)
    expect(lireTemps('0:12.4')).toBeCloseTo(12.4)
    expect(lireTemps('1:02:03.4')).toBeCloseTo(3723.4)
    expect(lireTemps('1:75')).toBeNull()
    expect(lireTemps('abc')).toBeNull()
  })
})
