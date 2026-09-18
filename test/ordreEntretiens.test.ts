import { describe, expect, test } from 'vitest'
import {
  ajouterEntretienOrdre,
  appliquerOrdreEntretiens,
  calculerOrdreEntretiens,
  compterMotsProseMirror,
  normaliserOrdreEntretiens,
  retirerEntretienOrdre,
} from '../src/shared/corpus/ordreEntretiens'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../src/shared/format'

function corpus(titres: Array<[string, string]>): CorpusFichier {
  return {
    formatVersion: FORMAT_VERSION,
    codebook: {},
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: Object.fromEntries(titres.map(([id, titre]) => [
      id,
      { titre, date: null, lastModified: '2000-01-01T00:00:00.000Z' },
    ])),
  }
}

function entretien(lastModified: string, corpsTexte: unknown): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION,
    lastModified,
    corpsTexte,
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
  }
}

function doc(...textes: string[]): unknown {
  return {
    type: 'doc',
    content: textes.map((texte) => ({
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }],
    })),
  }
}

describe('ordre persistant des entretiens', () => {
  test('normalise un ancien corpus selon les clés et attribue les rangs une fois', () => {
    const c = corpus([['b', 'B'], ['a', 'A']])
    normaliserOrdreEntretiens(c)
    expect(c.ordreEntretiens).toEqual(['b', 'a'])
    expect(Object.keys(c.membership)).toEqual(['b', 'a'])
    expect([c.membership.b.rangAjout, c.membership.a.rangAjout]).toEqual([0, 1])
  })

  test('retire doublons et ids inconnus, puis ajoute les ids manquants', () => {
    const c = corpus([['a', 'A'], ['b', 'B'], ['c', 'C']])
    c.ordreEntretiens = ['c', 'absent', 'c', 'a']
    normaliserOrdreEntretiens(c)
    expect(c.ordreEntretiens).toEqual(['c', 'a', 'b'])
    expect(Object.keys(c.membership)).toEqual(['c', 'a', 'b'])
  })

  test('répare globalement les rangs invalides ou dupliqués', () => {
    const c = corpus([['a', 'A'], ['b', 'B'], ['c', 'C']])
    c.ordreEntretiens = ['c', 'a', 'b']
    c.membership.a.rangAjout = 4
    c.membership.b.rangAjout = 4
    c.membership.c.rangAjout = -1
    normaliserOrdreEntretiens(c)
    expect(c.ordreEntretiens!.map((id) => c.membership[id].rangAjout)).toEqual([0, 1, 2])
  })

  test('conserve les rangs valides après tri et suppression, puis ajoute après le maximum', () => {
    const c = corpus([['a', 'A'], ['b', 'B'], ['c', 'C']])
    normaliserOrdreEntretiens(c)
    appliquerOrdreEntretiens(c, ['c', 'a', 'b'])
    retirerEntretienOrdre(c, 'b')
    ajouterEntretienOrdre(c, 'd', {
      titre: 'D', date: null, lastModified: '2000-01-01T00:00:00.000Z',
    })
    expect(c.ordreEntretiens).toEqual(['c', 'a', 'd'])
    expect([c.membership.c.rangAjout, c.membership.a.rangAjout, c.membership.d.rangAjout])
      .toEqual([2, 0, 3])
  })
})

describe('tris purs des entretiens', () => {
  test('trie les titres en français, sans casse, avec nombres et départage stable', () => {
    const c = corpus([
      ['e10', 'Été 10'],
      ['e2b', 'ete 2'],
      ['e2a', 'ÉTÉ 2'],
      ['a', 'À propos'],
    ])
    normaliserOrdreEntretiens(c)
    c.membership.e2b.rangAjout = 8
    c.membership.e2a.rangAjout = 4
    expect(calculerOrdreEntretiens(c, 'alpha')).toEqual(['a', 'e2a', 'e2b', 'e10'])
  })

  test('restaure l’ordre d’ajout même avec des rangs non contigus', () => {
    const c = corpus([['a', 'A'], ['b', 'B'], ['c', 'C']])
    normaliserOrdreEntretiens(c)
    c.membership.a.rangAjout = 20
    c.membership.b.rangAjout = 2
    c.membership.c.rangAjout = 9
    expect(calculerOrdreEntretiens(c, 'ajout')).toEqual(['b', 'c', 'a'])
  })

  test('trie les dates valides en décroissant et place les dates invalides à la fin', () => {
    const c = corpus([['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D']])
    normaliserOrdreEntretiens(c)
    const contenus = new Map([
      ['a', entretien('2024-01-01T00:00:00Z', doc('A'))],
      ['b', entretien('date-invalide', doc('B'))],
      ['c', entretien('2025-01-01T00:00:00Z', doc('C'))],
      ['d', entretien('', doc('D'))],
    ])
    expect(calculerOrdreEntretiens(c, 'modif', contenus)).toEqual(['c', 'a', 'b', 'd'])
  })

  test('compte récursivement les mots Unicode, apostrophes et traits d’union', () => {
    expect(compterMotsProseMirror(doc('L’été franco-québécois : déjà 2025 !', 'Ça va.'))).toBe(6)
    expect(compterMotsProseMirror(doc('', '...'))).toBe(0)
  })

  test('trie du texte le plus long au plus court avec départage par rang', () => {
    const c = corpus([['a', 'A'], ['b', 'B'], ['c', 'C']])
    normaliserOrdreEntretiens(c)
    const contenus = new Map([
      ['a', entretien('2024-01-01', doc('un deux'))],
      ['b', entretien('2024-01-01', doc('un deux trois'))],
      ['c', entretien('2024-01-01', doc('quatre cinq'))],
    ])
    expect(calculerOrdreEntretiens(c, 'longueur', contenus)).toEqual(['b', 'a', 'c'])
  })

  test('refuse un tri de contenu si une donnée manque', () => {
    const c = corpus([['a', 'A']])
    expect(() => calculerOrdreEntretiens(c, 'longueur', new Map())).toThrow(/ne peut pas être lu/)
  })
})
