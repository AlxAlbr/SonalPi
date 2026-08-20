import { describe, test, expect } from 'vitest'
import { scinderPseudos, joindrePseudos, estMultiPseudo, ajouterPseudo, MAX_PSEUDOS } from '../src/shared/entretien/pseudos'

describe('scinderPseudos — saisie libre « a / b »', () => {
  test('saisie simple sans séparateur → un seul pseudo', () => {
    expect(scinderPseudos('Claire')).toEqual(['Claire'])
  })
  test('sépare sur « / » espacé', () => {
    expect(scinderPseudos('Claire / Rebecca')).toEqual(['Claire', 'Rebecca'])
  })
  test('sépare sur « / » sans espaces', () => {
    expect(scinderPseudos('Claire/Rebecca')).toEqual(['Claire', 'Rebecca'])
  })
  test('trim + ignore les morceaux vides', () => {
    expect(scinderPseudos('  Claire  /  ')).toEqual(['Claire'])
  })
  test('capé à 2 pseudos (parité V1 remplacement/remplacementAlt)', () => {
    expect(scinderPseudos('a / b / c').length).toBeLessThanOrEqual(MAX_PSEUDOS)
    expect(scinderPseudos('a / b / c')).toEqual(['a', 'b'])
  })
  test('supprime les doublons insensibles à la casse', () => {
    expect(scinderPseudos('Claire / claire / Rebecca')).toEqual(['Claire', 'Rebecca'])
  })
  test('saisie vide → []', () => {
    expect(scinderPseudos('')).toEqual([])
    expect(scinderPseudos('   ')).toEqual([])
  })
})

describe('joindrePseudos / estMultiPseudo', () => {
  test('joint avec « / »', () => {
    expect(joindrePseudos(['Claire', 'Rebecca'])).toBe('Claire / Rebecca')
    expect(joindrePseudos(['Claire'])).toBe('Claire')
  })
  test('estMultiPseudo', () => {
    expect(estMultiPseudo(['a'])).toBe(false)
    expect(estMultiPseudo(['a', 'b'])).toBe(true)
  })
})

describe('ajouterPseudo — « Garder les deux »', () => {
  test('ajoute un pseudo absent (sous le cap)', () => {
    expect(ajouterPseudo(['Claire'], 'Rebecca')).toEqual(['Claire', 'Rebecca'])
  })
  test('inoffensif si déjà présent (insensible à la casse)', () => {
    expect(ajouterPseudo(['Claire'], 'claire')).toEqual(['Claire'])
  })
  test('refusé si le cap de 2 est atteint', () => {
    expect(ajouterPseudo(['a', 'b'], 'c')).toEqual(['a', 'b'])
  })
  test('ignore un pseudo vide', () => {
    expect(ajouterPseudo(['a'], '   ')).toEqual(['a'])
  })
})
