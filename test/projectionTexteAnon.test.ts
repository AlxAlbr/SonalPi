import { describe, expect, test } from 'vitest'
import { projeterPortionsAnon } from '../src/shared/entretien/anon/projectionTexte'
import type { Annotation } from '../src/shared/entretien/annotation'

const anon = (
  id: string,
  from: number,
  to: number,
  etat: 'anonymise' | 'exception',
  pseudo?: string,
): Annotation => ({ id, type: 'anon', from, to, etat, pseudo, auteur: 'test' })

describe('projection commune du texte pseudonymisé', () => {
  test.each([false, true])('la décision englobante prime indépendamment de l’ordre (%s)', (inverse) => {
    const large = anon('large', 2, 10, 'exception', 'Mémoire privée')
    const interne = anon('interne', 4, 7, 'anonymise', 'Visible seulement sans englobante')
    const annotations = inverse ? [interne, large] : [large, interne]
    expect(projeterPortionsAnon(annotations, { from: 1, to: 11 }).map((portion) => ({
      from: portion.from,
      to: portion.to,
      id: portion.annotation?.id ?? null,
    }))).toEqual([
      { from: 1, to: 2, id: null },
      { from: 2, to: 10, id: 'large' },
      { from: 10, to: 11, id: null },
    ])
  })

  test('découpe une sélection aux seules bornes utiles et ignore les annotations orphelines', () => {
    const annotations = [
      anon('avant', 1, 4, 'anonymise', 'A'),
      anon('coupee', 3, 8, 'anonymise', 'B'),
      anon('orpheline', 6, 6, 'anonymise', 'C'),
      anon('apres', 9, 12, 'anonymise', 'D'),
    ]
    expect(projeterPortionsAnon(annotations, { from: 5, to: 10 }).map((portion) => ({
      from: portion.from,
      to: portion.to,
      id: portion.annotation?.id ?? null,
    }))).toEqual([
      { from: 5, to: 8, id: 'coupee' },
      { from: 8, to: 9, id: null },
      { from: 9, to: 10, id: 'apres' },
    ])
  })
})
