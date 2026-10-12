import { describe, expect, test } from 'vitest'
import { validerDefinitionAnon } from '../src/shared/corpus/definitionsAnon'
import { ajouterPseudoRegle, creerRegle } from '../src/shared/corpus/reglesAnon'
import { squeletteCorpus } from '../src/shared/corpus/squelette'

describe('définitions de pseudonymisation', () => {
  test('normalise les alias, pseudos et catégories sans tronquer les valeurs', () => {
    expect(validerDefinitionAnon([' Lyon / Lyons ', 'LYON'], [' Ville ', 'VILLE'], ' LOC ')).toEqual({ entite: ['Lyon', 'Lyons'], pseudos: ['Ville'], categorie: 'LOC' })
    expect(validerDefinitionAnon('Karine', ['Claire', 'Rebecca'])).toEqual({ entite: ['Karine'], pseudos: ['Claire', 'Rebecca'] })
  })

  test.each([
    ['', ['Pseudo']], ['Karine', []], ['Karine', ['A', 'B', 'C']],
    ['Lyon / Lyons', ['Ville', 'Cité']], [4, ['Pseudo']], ['Karine', [4]],
  ])('refuse une définition invalide %j sans résolution implicite', (entite, pseudos) => {
    expect(() => validerDefinitionAnon(entite, pseudos)).toThrow()
  })

  test('création seule et pseudo partagé : les règles restent distinctes', () => {
    const corpus = squeletteCorpus('Synthétique')
    const lyon = creerRegle(corpus, 'Lyon', ['Ville'], () => 'r1', 'LOC')
    const marseille = creerRegle(corpus, 'Marseille', ['Ville'], () => 'r2')
    expect(lyon.categorie).toBe('LOC')
    expect(marseille.id).toBe('r2')
    expect(Object.keys(corpus.reglesAnon)).toHaveLength(2)
  })

  test('réutilise les alias connus mais ne perd pas les nouveaux alias d’un chevauchement partiel', () => {
    const corpus = squeletteCorpus('Synthétique')
    const regle = creerRegle(corpus, 'Lyon / Lyons', ['Ville'], () => 'r1')
    expect(creerRegle(corpus, 'lyons', ['Autre'], () => 'r2')).toBe(regle)
    const avant = structuredClone(corpus)
    expect(() => creerRegle(corpus, 'Lyon / Vienne', ['Ville'], () => 'r3')).toThrow('nouveaux alias')
    expect(corpus).toEqual(avant)
  })

  test('ne choisit pas arbitrairement entre deux règles partageant des alias demandés', () => {
    const corpus = squeletteCorpus('Synthétique')
    creerRegle(corpus, 'Lyon', ['Ville'], () => 'r1')
    creerRegle(corpus, 'Marseille', ['Cité'], () => 'r2')
    const avant = structuredClone(corpus)
    expect(() => creerRegle(corpus, 'Lyon / Marseille', ['Ville'], () => 'r3')).toThrow('Plusieurs règles')
    expect(corpus).toEqual(avant)
  })

  test('refuse une variante supplémentaire sur une règle multi-alias, sans modifier sa définition', () => {
    const corpus = squeletteCorpus('Synthétique')
    creerRegle(corpus, 'Lyon / Lyons', ['Ville'], () => 'r1')
    const avant = structuredClone(corpus)
    expect(() => ajouterPseudoRegle(corpus, 'r1', 'Cité')).toThrow('plusieurs alias')
    expect(corpus).toEqual(avant)
  })
})
