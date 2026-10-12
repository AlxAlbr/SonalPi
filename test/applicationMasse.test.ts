import { describe, test, expect } from 'vitest'
import { instructionsAppliquerRegle } from '../src/shared/entretien/anon'
import type { EntretienFichier, RegleAnon } from '../src/shared/format'
import type { Annotation } from '../src/shared/entretien/annotation'

/** Un entretien mono-paragraphe (PM : contenu démarrant à 1). */
function entretien(texte: string, annotations: Annotation[] = []): EntretienFichier {
  return {
    formatVersion: 3,
    lastModified: '',
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: texte }] }] },
    annotations,
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
  }
}
function anon(texte: string, idx: number, len: number, etat: 'anonymise' | 'exception', pseudo = 'A', regle?: string): Annotation {
  return { id: `a${idx}`, type: 'anon', from: 1 + idx, to: 1 + idx + len, auteur: '', etat, pseudo, regle }
}
let n = 0
const genId = () => `m${n++}`

const regle: RegleAnon = { id: 'r1', entite: ['Lyon'], pseudos: ['L1', 'L2'] }

describe('instructionsAppliquerRegle — application en masse', () => {
  test('pose une occurrence par match « à traiter » (non couvert)', () => {
    n = 0
    const e = entretien('Lyon est grand. Lyon est beau.')
    const instr = instructionsAppliquerRegle(e, regle, genId)
    expect(instr.nb).toBe(2)
    expect(instr.poser).toHaveLength(2)
    expect(instr.poser[0].pseudo).toBe('L1') // primaire
    expect(instr.poser[0].regle).toBe('r1')
  })

  test('respecte multi-alias (entite[])', () => {
    n = 0
    const r = { id: 'r2', entite: ['Lyon', 'Marseille'], pseudos: ['L'] }
    const e = entretien('Lyon et Marseille.')
    const instr = instructionsAppliquerRegle(e, r, genId)
    expect(instr.nb).toBe(2)
  })

  test('une occurrence déjà anonymisée ou en exception n’est PAS re-posée', () => {
    n = 0
    const texte = 'Lyon. Lyon. Lyon.'
    const e = entretien(texte, [anon(texte, 0, 4, 'anonymise', 'L1', 'r1'), anon(texte, 6, 4, 'exception')])
    const instr = instructionsAppliquerRegle(e, regle, genId)
    expect(instr.nb).toBe(1) // seulement le 3ᵉ « Lyon » non couvert
  })

  test('entité absente du texte → rien', () => {
    n = 0
    const instr = instructionsAppliquerRegle(entretien('Karine habite ici.'), regle, genId)
    expect(instr.nb).toBe(0)
  })

  test('multi-pseudo : on applique avec le pseudo primaire (application en masse)', () => {
    n = 0
    const instr = instructionsAppliquerRegle(entretien('Lyon.'), regle, genId)
    expect(instr.poser[0].pseudo).toBe('L1')
  })
})

import { poserDansPlages } from '../src/shared/entretien/anon/applicationMasse'
describe('poserDansPlages — application ciblée (occurrences cochées)', () => {
  const poser = [
    { id: 'a', from: 1, to: 6, pseudo: 'X', regle: 'r' },
    { id: 'b', from: 20, to: 25, pseudo: 'X', regle: 'r' },
    { id: 'c', from: 40, to: 45, pseudo: 'X', regle: 'r' },
  ]
  test('sans plages → aucune pose implicite', () => {
    expect(poserDansPlages(poser)).toEqual([])
  })
  test('application entière explicitement demandée', () => {
    expect(poserDansPlages(poser, undefined, true)).toEqual(poser)
  })
  test('liste vide → aucune pose demandée', () => {
    expect(poserDansPlages(poser, [])).toEqual([])
  })
  test('avec plages → seules les occurrences cochées restent', () => {
    const res = poserDansPlages(poser, [{ from: 1, to: 6 }, { from: 40, to: 45 }])
    expect(res.map((o) => o.id).sort()).toEqual(['a', 'c'])
  })
  test('une plage inconnue ne pose rien de supplémentaire', () => {
    expect(poserDansPlages(poser, [{ from: 99, to: 100 }])).toEqual([])
  })
})

import { appliquerDiffAnon } from '../src/shared/entretien/anon/applicationMasse'
describe('appliquerDiffAnon — validation du diff façon SonalPi1 (« Valider »)', () => {
  const anon = (id: string, from: number, to: number, etat?: 'anonymise' | 'exception'): Annotation => ({
    id,
    type: 'anon',
    from,
    to,
    auteur: 'corpus',
    regle: 'r',
    pseudo: 'X',
    ...(etat ? { etat } : {}),
  })
  test('retirer supprime les annotations anonymisées de la règle', () => {
    const anns = [anon('a', 0, 4, 'anonymise'), anon('b', 10, 14, 'anonymise')]
    const n = appliquerDiffAnon(anns, 'r', [{ from: 0, to: 4 }])
    expect(n).toBe(1)
    expect(anns.map((a) => a.id)).toEqual(['b'])
  })
  test('exception sur une plage anonymisée par la même règle → bascule d état, le pseudo reste', () => {
    const anns = [anon('a', 0, 4)]
    const n = appliquerDiffAnon(anns, 'r', undefined, [{ from: 0, to: 4 }])
    expect(n).toBe(1)
    expect(anns).toHaveLength(1)
    expect(anns[0].etat).toBe('exception')
    expect(anns[0].pseudo).toBe('X')
  })
  test('exception sans annotation existante → annotation exception créée', () => {
    const anns: Annotation[] = []
    const n = appliquerDiffAnon(anns, 'r', undefined, [{ from: 5, to: 9 }])
    expect(n).toBe(1)
    expect(anns[0].etat).toBe('exception')
    expect(anns[0].from).toBe(5)
  })
  test('retirerException SUPPRIME l annotation : l occurrence redevient à traiter', () => {
    const anns = [anon('a', 0, 4, 'exception')]
    const n = appliquerDiffAnon(anns, 'r', undefined, undefined, [{ from: 0, to: 4 }])
    expect(n).toBe(1)
    expect(anns).toHaveLength(0)
  })
  test('ordre SonalPi1 : retrait d exception AVANT dé-pseudonymisation, aucune interaction entre règles', () => {
    const anns = [anon('a', 0, 4, 'exception'), anon('b', 8, 12), anon('c', 20, 24, 'exception')]
    // c porte une AUTRE règle : intouchable.
    ;(anns[2] as Annotation).regle = 'autre'
    const n = appliquerDiffAnon(
      anns,
      'r',
      [{ from: 8, to: 12 }],
      undefined,
      [{ from: 0, to: 4 }],
    )
    expect(n).toBe(2)
    expect(anns.map((a) => a.id)).toEqual(['c'])
    expect(anns[0].regle).toBe('autre')
  })
})
