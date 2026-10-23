import { describe, expect, it } from 'vitest'
import { FORMAT_VERSION, type EntretienFichier, type EntretienRef, type Variable } from '../src/shared/format'
import { extraireOccurrencesLexico } from '../src/renderer/editor/lexico'
import { agregerOccurrencesLexico, selectionnerOccurrencesLexico } from '../src/shared/lexico/moteur'
import { exporterTableauLexico } from '../src/shared/lexico/export'
import { filtresLexicoParDefaut } from '../src/shared/lexico/types'
import { resumerEntretiensLexico } from '../src/shared/lexico/resume'
import { appliquerCommandeTraitementsLexico, appliquerTraitementsLexico, compterConcatenationsLexico, importerTraitementsLexicoV1, normaliserTraitementsLexico } from '../src/shared/lexico/traitements'

const reference: EntretienRef = { titre: 'Entretien A', date: null, lastModified: '' }
const source: EntretienFichier = {
  formatVersion: FORMAT_VERSION,
  lastModified: '',
  corpsTexte: {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'Bonjour Marie 12' }] },
      { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Travail partagé' }] },
    ],
  },
  annotations: [
    { id: 'anon', type: 'anon', from: 9, to: 14, auteur: '', pseudo: 'Personne A' },
    { id: 'theme', type: 'codage', from: 19, to: 26, auteur: '', code: 'travail' },
  ],
  ancres: [],
  locuteurs: [
    { index: 0, nom: 'Enquêteur', interviewer: true, valeursLoc: { sexe: 'f' }, personneRef: null },
    { index: 1, nom: 'Paul', valeursLoc: { sexe: 'm' }, personneRef: 'paul' },
  ],
  meta: { valeursGen: { zone: 'nord' }, audioRef: null },
}

const variables: Variable[] = [
  { id: 'sexe', lib: 'Sexe', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [
    { id: 'f', lib: 'F', mExport: 0 }, { id: 'm', lib: 'M', mExport: 1 },
  ] },
]

describe('Lexico', () => {
  it('remplace une entité par une seule forme et conserve les positions', () => {
    const occurrences = extraireOccurrencesLexico('a', reference, source)
    expect(occurrences.map((occurrence) => occurrence.forme)).toEqual([
      'bonjour', 'personne a', '12', 'travail', 'partagé',
    ])
    expect(occurrences.some((occurrence) => occurrence.forme === 'marie')).toBe(false)
    const pseudo = occurrences.find((occurrence) => occurrence.pseudonyme)!
    expect([pseudo.from, pseudo.to, pseudo.locuteurIndex]).toEqual([9, 14, 0])
    expect(occurrences.find((occurrence) => occurrence.forme === 'travail')?.themeIds).toEqual(['travail'])
  })

  it.each([false, true])('respecte une exception englobante indépendamment de l’ordre (%s)', (inverse) => {
    const data = structuredClone(source)
    data.corpsTexte = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'abcdefghij' }] }],
    }
    const large = { id: 'large', type: 'anon' as const, from: 2, to: 10, auteur: '', etat: 'exception' as const, pseudo: 'Mémoire' }
    const interne = { id: 'interne', type: 'anon' as const, from: 4, to: 7, auteur: '', etat: 'anonymise' as const, pseudo: 'X' }
    data.annotations = inverse ? [interne, large] : [large, interne]
    const occurrences = extraireOccurrencesLexico('a', reference, data)
    expect(occurrences.map((occurrence) => occurrence.forme)).toEqual(['abcdefghij'])
    expect(occurrences.some((occurrence) => occurrence.pseudonyme)).toBe(false)
  })

  it('une englobante anonymisée masque l’exception interne et une décision sans pseudo reste en clair', () => {
    const data = structuredClone(source)
    data.corpsTexte = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'abcdefghij' }] }],
    }
    data.annotations = [
      { id: 'large', type: 'anon', from: 2, to: 10, auteur: '', etat: 'anonymise', pseudo: 'X' },
      { id: 'interne', type: 'anon', from: 4, to: 7, auteur: '', etat: 'exception', pseudo: 'Mémoire' },
    ]
    expect(extraireOccurrencesLexico('a', reference, data).map((occurrence) => occurrence.forme))
      .toEqual(['a', 'x', 'j'])

    data.annotations = [{ id: 'sans-pseudo', type: 'anon', from: 2, to: 10, auteur: '', etat: 'anonymise' }]
    expect(extraireOccurrencesLexico('a', reference, data).map((occurrence) => occurrence.forme))
      .toEqual(['abcdefghij'])
  })

  it('conserve un pseudonyme unique sur une plage traversant un saut de ligne interne', () => {
    const data = structuredClone(source)
    data.corpsTexte = {
      type: 'doc',
      content: [{
        type: 'paragraph', attrs: { loc: 0 }, content: [
          { type: 'text', text: 'Avant' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Après' },
        ],
      }],
    }
    data.annotations = [{ id: 'a1', type: 'anon', from: 1, to: 12, auteur: '', etat: 'anonymise', pseudo: 'X' }]
    expect(extraireOccurrencesLexico('a', reference, data).map((occurrence) => occurrence.forme))
      .toEqual(['x'])
  })

  it('conserve deux décisions visibles lors d’un chevauchement partiel sans révéler le texte couvert', () => {
    const data = structuredClone(source)
    data.corpsTexte = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'abcdefghij' }] }],
    }
    data.annotations = [
      { id: 'a1', type: 'anon', from: 2, to: 7, auteur: '', etat: 'anonymise', pseudo: 'X' },
      { id: 'a2', type: 'anon', from: 5, to: 10, auteur: '', etat: 'anonymise', pseudo: 'Y' },
    ]
    const occurrences = extraireOccurrencesLexico('a', reference, data)
    expect(occurrences.map((occurrence) => occurrence.forme)).toEqual(['a', 'x', 'y', 'j'])
    expect(occurrences.filter((occurrence) => occurrence.pseudonyme).map((occurrence) => [occurrence.from, occurrence.to]))
      .toEqual([[2, 7], [7, 10]])
  })

  it('évalue les variables et le rôle sur le locuteur de chaque occurrence', () => {
    const occurrences = extraireOccurrencesLexico('a', reference, source)
    const filtres = filtresLexicoParDefaut()
    filtres.variables.sexe = { portee: 'locuteur', modaliteIds: ['m'], nonRenseigne: false }
    const retenues = selectionnerOccurrencesLexico(occurrences, filtres, { variables, cas: {} })
    expect(retenues.map((occurrence) => occurrence.forme)).toEqual(['travail', 'partagé'])
  })

  it('intersecte les thèmes et les cas sans compter deux fois', () => {
    const occurrences = extraireOccurrencesLexico('a', reference, source)
    const filtres = filtresLexicoParDefaut()
    filtres.themes = { mode: 'choix', ids: ['travail'] }
    filtres.cas = { mode: 'choix', ids: ['c1', 'c2'] }
    const retenues = selectionnerOccurrencesLexico(occurrences, filtres, {
      variables,
      cas: {
        c1: [{ entretienId: 'a', from: 19, to: 26 }],
        c2: [{ entretienId: 'a', from: 19, to: 35 }],
      },
    })
    expect(agregerOccurrencesLexico(retenues).map((ligne) => [ligne.forme, ligne.occurrences]))
      .toEqual([['travail', 1]])
  })

  it('applique mots outils, regroupements et concaténations sans perdre les sources', () => {
    const occurrences = extraireOccurrencesLexico('a', reference, source)
    expect(compterConcatenationsLexico(occurrences, ['bonjour', 'personne a'])).toBe(1)
    expect(compterConcatenationsLexico(occurrences, ['12', 'travail'])).toBe(0)
    const traitees = appliquerTraitementsLexico(occurrences, {
      motsOutils: ['12'],
      regroupements: [{ id: 'g', forme: 'activité', membres: ['travail', 'partagé'] }],
      concatenations: [{ id: 'c', forme: 'salutation', sequence: ['bonjour', 'personne a'] }],
    })
    expect(traitees.map((occurrence) => occurrence.forme)).toEqual(['salutation', 'activité', 'activité'])
    expect(traitees[0].texte).toBe('Bonjour Personne A')
    expect(traitees[1].formeOriginale).toBe('travail')
    expect(agregerOccurrencesLexico(traitees).find((ligne) => ligne.forme === 'activité')?.occurrences).toBe(2)
  })

  it('normalise les personnalisations de listes de mots outils du corpus', () => {
    const traitements = normaliserTraitementsLexico({
      motsOutils: [], regroupements: [], concatenations: [],
      listesMotsOutils: {
        Articles: [' Le ', 'le', 'l’'],
        Pronoms: [],
        Inconnue: ['mot'],
      },
    })
    expect(traitements.listesMotsOutils).toEqual({ Articles: ['le', 'l’'], Pronoms: [] })
  })

  it('importe et contrôle les réglages annexes de SonalPi1', () => {
    const importee = importerTraitementsLexicoV1({
      out: 'le\nla\n',
      lem: 'allais\taller\tV\nallons\taller\tV\ninvalide',
      cnct: 'prise en charge\tprise en charge\tC\nseul',
    })
    expect(importee.traitements.motsOutils).toEqual(['le', 'la'])
    expect(importee.traitements.regroupements[0]).toMatchObject({ forme: 'aller', membres: ['allais', 'allons'] })
    expect(importee.traitements.concatenations[0]).toMatchObject({ forme: 'prise en charge', sequence: ['prise', 'en', 'charge'] })
    expect(importee.diagnostics).toHaveLength(2)
    expect(() => appliquerCommandeTraitementsLexico(importee.traitements, {
      type: 'remplacer',
      attendu: { motsOutils: [], regroupements: [], concatenations: [] },
      traitements: importee.traitements,
    })).toThrow('ont changé')
  })

  it('résume une petite exclusion d’entretiens', () => {
    const univers = Array.from({ length: 50 }, (_, index) => ({ id: String(index), nom: `E${index}` }))
    expect(resumerEntretiensLexico({ mode: 'choix', ids: univers.slice(0, 48).map((item) => item.id) }, univers))
      .toBe('Tous les entretiens sauf « E48 » et « E49 » (48 sur 50)')
  })

  it('neutralise les formules dans les exports', () => {
    const contenu = exporterTableauLexico([{
      forme: '=commande', occurrences: 1, entretiens: 1, details: [],
    }], ['Texte pseudonymisé'], 'csv', new Date('2025-01-01T00:00:00.000Z'))
    expect(contenu).toContain("'=commande,1,1")
  })
})
