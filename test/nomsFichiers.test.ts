import { describe, test, expect } from 'vitest'
import {
  nettoyerBaseNom,
  nomFichierExport,
  attribuerNomsUniques,
} from '../src/shared/export/nomsFichiers'

// ----------------------------------------------------------------
// NOMMAGE PRÉPARÉ POUR LES LOTS — plateformes croisées, collisions, disque
// ----------------------------------------------------------------

describe('nettoyerBaseNom', () => {
  test('remplace les caractères interdits sur les trois plateformes', () => {
    expect(nettoyerBaseNom('Entretien: A/B', 'txt')).toBe('Entretien- A-B')
    expect(nettoyerBaseNom('voix <1> | test', 'txt')).toBe('voix -1- - test')
    expect(nettoyerBaseNom('fin\\de\\chemin', 'txt')).toBe('fin-de-chemin')
  })

  test('préfixe les noms réservés Windows (avec ou sans majuscules)', () => {
    expect(nettoyerBaseNom('CON', 'txt')).toBe('-CON')
    expect(nettoyerBaseNom('com1', 'txt')).toBe('-com1')
    expect(nettoyerBaseNom('lpt9.txt', 'txt')).toBe('lpt9.txt')
  })

  test('retire points et espaces finaux (Windows les ignore)', () => {
    expect(nettoyerBaseNom('Entretien. ', 'txt')).toBe('Entretien')
    expect(nettoyerBaseNom('Entretien...', 'txt')).toBe('Entretien')
  })

  test('borne la longueur en gardant la place de l extension, jamais vide', () => {
    const long = 'A'.repeat(500)
    expect(nettoyerBaseNom(long, 'txt').length).toBeLessThanOrEqual(200)
    expect(nettoyerBaseNom(long, 'txt')).toMatch(/\.?A$/) // la base seule (sans extension) ≤ 200
    expect(nettoyerBaseNom('   ', 'txt')).toBe('entretien')
    expect(nettoyerBaseNom('///', 'txt')).toBe('---')
  })
})

describe('nomFichierExport', () => {
  test('titre nettoyé, suffixe _anonymise, extension', () => {
    expect(nomFichierExport('Entretien: A/B', 'txt', false)).toBe('Entretien- A-B.txt')
    expect(nomFichierExport('Entretien', 'sonal', true)).toBe('Entretien_anonymise.sonal')
    expect(nomFichierExport('   ', 'txt', false)).toBe('entretien.txt')
  })
})

describe('attribuerNomsUniques — toute la liste AVANT l écriture', () => {
  test('résout les collisions du lot de façon déterministe', () => {
    const noms = attribuerNomsUniques([
      { titre: 'Entretien', ext: 'txt' },
      { titre: 'Entretien', ext: 'txt' },
      { titre: 'Entretien', ext: 'txt' },
      { titre: 'Autre', ext: 'txt' },
    ])
    expect(noms).toEqual(['Entretien.txt', 'Entretien (2).txt', 'Entretien (3).txt', 'Autre.txt'])
  })

  test('n écrase jamais un fichier déjà présent sur disque (même règle)', () => {
    const surDisque = new Set(['Karine.txt', 'Karine (2).txt'])
    const noms = attribuerNomsUniques(
      [
        { titre: 'Karine', ext: 'txt' },
        { titre: 'Karine', ext: 'txt' },
      ],
      (nom) => surDisque.has(nom),
    )
    expect(noms).toEqual(['Karine (3).txt', 'Karine (4).txt'])
  })

  test('le rang se place avant l extension, et suffixe inclus dans la base', () => {
    const noms = attribuerNomsUniques([
      { titre: 'Entretien', ext: 'sonal', suffixe: '_anonymise' },
      { titre: 'Entretien', ext: 'sonal', suffixe: '_anonymise' },
    ])
    expect(noms).toEqual(['Entretien_anonymise.sonal', 'Entretien_anonymise (2).sonal'])
  })
})
