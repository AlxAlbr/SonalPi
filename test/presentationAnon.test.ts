import { describe, expect, test } from 'vitest'
import { abregerEntite, collisionsPseudos, etatRegleAnon, presenterReglesAnon } from '../src/shared/corpus/presentationAnon'
import { scannerCorpus } from '../src/shared/corpus/scanAnon'
import { fixturePseudonymisation } from './fixtures/pseudonymisation'

const options = { recherche: '', filtre: 'toutes', tri: 'entite', descendant: false, frais: true } as const

describe('présentation du tableau de pseudonymisation', () => {
  test('distingue inutilisée, traitée, à traiter et inconnue', () => {
    expect(etatRegleAnon({ anon: 0, exc: 0, incl: 0, non: 0 })).toBe('neutre')
    expect(etatRegleAnon({ anon: 0, exc: 1, incl: 0, non: 0 })).toBe('ok')
    expect(etatRegleAnon({ anon: 1, exc: 0, incl: 0, non: 1 })).toBe('todo')
    expect(etatRegleAnon()).toBe('inconnu')
    expect(etatRegleAnon({ anon: 1, exc: 0, incl: 0, non: 0 }, false)).toBe('inconnu')
  })

  test('la recherche porte sur la valeur entière, même abrégée dans le tableau', () => {
    const entite = 'un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize'
    expect(abregerEntite(entite)).toBe('un deux trois quatre cinq six […] onze douze treize quatorze quinze seize')
    const regles = [{ id: 'longue', entite: [entite], pseudos: ['Ville'] }]
    expect(presenterReglesAnon(regles, [], { ...options, recherche: 'huit' })).toHaveLength(1)
    expect(regles[0].entite[0]).toBe(entite)
  })

  test('tri français par défaut, recherche combinée au filtre et à la catégorie', () => {
    const { regles, entretiens } = fixturePseudonymisation()
    const scans = scannerCorpus(regles, entretiens)
    expect(presenterReglesAnon(regles, scans, options).map((l) => l.regle.entite[0])).toEqual(['Absente', 'Gare', 'Karine', 'Lyon', 'Marseille'])
    expect(presenterReglesAnon(regles, scans, { ...options, filtre: 'exceptions', recherche: 'ville', categorie: 'LOC' }).map((l) => l.regle.id)).toEqual(['ville'])
    expect(presenterReglesAnon(regles, scans, { ...options, filtre: 'inutilisees' }).map((l) => l.regle.id)).toEqual(['inutilisee'])
    expect(presenterReglesAnon(regles, scans, { ...options, filtre: 'inutilisees', frais: false })).toEqual([])
    expect(presenterReglesAnon(regles, [], options)).toHaveLength(regles.length)
    const croissant = presenterReglesAnon(regles, scans, { ...options, tri: 'pseudo' }).map((l) => l.regle.id)
    expect(presenterReglesAnon(regles, scans, { ...options, tri: 'pseudo', descendant: true }).map((l) => l.regle.id)).toEqual(croissant.reverse())
  })

  test('signale le pseudo partagé sans considérer deux variantes comme un conflit', () => {
    const { regles, entretiens } = fixturePseudonymisation()
    expect(collisionsPseudos(regles)).toEqual(new Set(['ville', 'collision']))
    expect(presenterReglesAnon(regles, scannerCorpus(regles, entretiens), { ...options, filtre: 'collisions' }).map((l) => l.regle.id)).toEqual(['ville', 'collision'])
  })
})
