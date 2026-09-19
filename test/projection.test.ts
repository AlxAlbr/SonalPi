// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import {
  projeterSegments,
  appliquerAnonymisation,
  type SegmentProjete,
} from '../src/shared/export/projectionEntretien'
import type { EntreeExport } from '../src/shared/export/types'

/** EntreeExport minimale, complétée par le cas de test. */
function entree(partiel: Partial<EntreeExport>): EntreeExport {
  return {
    corpsTexte: { type: 'doc', content: [] },
    annotations: [],
    ancres: [],
    locuteurs: [],
    codebook: [],
    variables: [],
    meta: { valeursGen: {} },
    legacy: { tabAnon: null, notes: '' },
    ...partiel,
  }
}

describe('projeterSegments — un segment par intervalle d\u2019ancres', () => {
  test('un tour fusionné est re-découpé aux ancres internes ; bornes temporelles fidèles', () => {
    // « Un deux. » [0→2] puis « Trois quatre. » [3→5] — la frontière interne vit
    // à la pos 10, où cohabitent la fin du cue 1 et le début du cue 2.
    const segments = projeterSegments(
      entree({
        corpsTexte: {
          type: 'doc',
          content: [
            { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Un deux. Trois quatre.' }] },
          ],
        },
        ancres: [
          { pos: 1, t: 0 },
          { pos: 10, t: 2 },
          { pos: 10, t: 3 },
          { pos: 23, t: 5 },
        ],
        locuteurs: [{ index: 1, nom: 'Speaker 3', valeursLoc: {}, personneRef: null }],
      }),
    )
    expect(segments.map((s) => [s.deb, s.fin, s.loc])).toEqual([
      [0, 2, 1],
      [3, 5, 1],
    ])
    expect(segments.map((s) => s.fragments.map((f) => f.texte))).toEqual([
      ['Un deux. '],
      ['Trois quatre.'],
    ])
  })

  test('sans ancre interne : le bloc forme un seul segment, sans bornes', () => {
    const segments = projeterSegments(
      entree({
        corpsTexte: {
          type: 'doc',
          content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Sans audio.' }] }],
        },
        ancres: [],
      }),
    )
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ deb: null, fin: null, loc: null })
    expect(segments[0].fragments.map((f) => f.texte)).toEqual(['Sans audio.'])
  })

  test('bloc vide : émis quand même, sans fragments', () => {
    const segments = projeterSegments(
      entree({
        corpsTexte: {
          type: 'doc',
          content: [
            { type: 'paragraph', attrs: { loc: 1 }, content: [] },
            { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Après.' }] },
          ],
        },
      }),
    )
    expect(segments).toHaveLength(2)
    expect(segments[0].fragments).toEqual([])
  })
})

describe('projeterSegments — codages, anon et commentaires', () => {
  const TEXTE = 'Karine habite Lyon depuis 2020.' // « Lyon » aux offsets 14..18
  const base: Partial<EntreeExport> = {
    corpsTexte: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: TEXTE }] }],
    },
    locuteurs: [{ index: 1, nom: 'Karine', valeursLoc: {}, personneRef: null }],
  }

  test('codage : le fragment porte le code de la catégorie couvrante', () => {
    const segments = projeterSegments(
      entree({
        ...base,
        annotations: [{ id: 'a1', type: 'codage', from: 15, to: 19, auteur: 'Ana', code: 'cat_001' }],
      }),
    )
    expect(segments[0].fragments.map((f) => [f.texte, f.codes])).toEqual([
      ['Karine habite ', []],
      ['Lyon', ['cat_001']],
      [' depuis 2020.', []],
    ])
  })

  test('anon : pseudo posé sur le fragment anonymisé, exception distinguée', () => {
    const segments = projeterSegments(
      entree({
        ...base,
        annotations: [
          { id: 'a1', type: 'anon', from: 1, to: 7, auteur: 'Ana', etat: 'anonymise', pseudo: 'Marie' },
          { id: 'a2', type: 'anon', from: 27, to: 31, auteur: 'Ana', etat: 'exception' },
        ],
      }),
    )
    const frags = segments[0].fragments
    expect(frags.map((f) => [f.texte, f.anon?.pseudo ?? null])).toEqual([
      ['Karine', 'Marie'],
      [' habite Lyon depuis ', null],
      ['2020', null],
      ['.', null],
    ])
    expect(frags[2].anon?.etat).toBe('exception')
  })

  test('commentaire : ouvert sur le fragment portant data-obs, fermé sur son propre rk', () => {
    // « depuis » aux offsets 19..25 du bloc → PM 20..26
    const segments = projeterSegments(
      entree({
        ...base,
        annotations: [{ id: 'a1', type: 'commentaire', from: 20, to: 26, auteur: 'Ana', texte: 'Vérifier.' }],
      }),
    )
    const frags = segments[0].fragments
    // commentaire court : le fragment initial ouvre ET ferme (data-finobs = son rk).
    expect(frags[1].obs).toEqual({ texte: 'Vérifier.', auteur: 'Ana' })
    expect(frags[1].finObs).toBe(frags[1].rk)
    expect(frags[0].finObs).toBeNull()
  })
})

describe('projeterSegments — tours de parole', () => {
  test('libellé de tour sur les segments du 1er bloc du run ; pseudonymisé si confirmé', () => {
    const segments = projeterSegments(
      entree({
        corpsTexte: {
          type: 'doc',
          content: [
            { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Question ?' }] },
            { type: 'paragraph', attrs: { loc: 2 }, content: [{ type: 'text', text: 'Réponse.' }] },
          ],
        },
        locuteurs: [
          { index: 1, nom: 'Enquêteur', interviewer: true, valeursLoc: {}, personneRef: null },
          { index: 2, nom: 'Karine', pseudo: 'Claire', pseudoEtat: 'confirme', valeursLoc: {}, personneRef: null },
        ],
      }),
    )
    expect(segments.map((s) => [s.loc, s.nomloc, s.libelle])).toEqual([
      [1, 'Enquêteur', { type: 'simple' }],
      [2, 'Karine', { type: 'pseudo', pseudo: 'Claire' }],
    ])
  })

  test('refus explicite : libellé marqué refuse, pseudo non transporté', () => {
    const segments = projeterSegments(
      entree({
        corpsTexte: {
          type: 'doc',
          content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Un mot.' }] }],
        },
        locuteurs: [
          { index: 1, nom: 'Karine', pseudo: 'Chercheur', pseudoEtat: 'refuse', valeursLoc: {}, personneRef: null },
        ],
      }),
    )
    expect(segments[0].libelle).toEqual({ type: 'refuse' })
  })

  test('locuteur sans nom : pas de libellé', () => {
    const segments = projeterSegments(
      entree({
        corpsTexte: {
          type: 'doc',
          content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Un mot.' }] }],
        },
        locuteurs: [{ index: 1, nom: '', valeursLoc: {}, personneRef: null }],
      }),
    )
    expect(segments[0].libelle).toBeNull()
  })
})

describe('projeterSegments — sauts de ligne du modèle (hardBreak)', () => {
  test('les sauts sont portés par les fragments ; ancres après un saut bien mappées', () => {
    // PM : « Avant. » [1..7[, hardBreak 7..8, « Après. » [8..14[ ; le saut vit
    // à l'offset plat 6, l'ancre PM 8 → plat 6 (le poids du saut est compté).
    const segments = projeterSegments(
      entree({
        corpsTexte: {
          type: 'doc',
          content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [
            { type: 'text', text: 'Avant.' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Après.' },
          ] }],
        },
        ancres: [{ pos: 1, t: 1 }, { pos: 8, t: 2 }, { pos: 14, t: 3 }],
        locuteurs: [{ index: 1, nom: 'Karine', valeursLoc: {}, personneRef: null }],
      }),
    )
    // l'ancre interne (plat 6) reste une COUPE de cue : 2 segments, mais le
    // saut lui-même (\n) n'est pas une coupe, il est porté par le fragment.
    expect(segments.map((s) => [s.deb, s.fin])).toEqual([[1, 2], [2, 3]])
    expect(segments.map((s) => s.fragments.map((f) => [f.texte, f.sauts]))).toEqual([
      [['Avant.', [6]]],
      [['Après.', []]],
    ])
  })

  test('un codage à cheval sur un saut reste couvrant sur les deux lignes', () => {
    // PM : 'AB' [1..3[, hardBreak 3..4, 'CD' [4..6[ ; codage PM 1..5 →
    // couvre A, B et C (le saut ne pèse aucun caractère) → plat 0..3.
    const segments = projeterSegments(
      entree({
        corpsTexte: {
          type: 'doc',
          content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [
            { type: 'text', text: 'AB' },
            { type: 'hardBreak' },
            { type: 'text', text: 'CD' },
          ] }],
        },
        annotations: [{ id: 'a1', type: 'codage', from: 1, to: 5, auteur: 'Ana', code: 'cat_001' }],
      }),
    )
    expect(segments[0].fragments.map((f) => [f.texte, f.codes])).toEqual([
      ['ABC', ['cat_001']],
      ['D', []],
    ])
  })
})

describe('appliquerAnonymisation', () => {
  const SEGMENTS: SegmentProjete[] = projeterSegments(
    entree({
      corpsTexte: {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Karine habite Lyon.' }] },
        ],
      },
      locuteurs: [
        { index: 1, nom: 'Karine', pseudo: 'Claire', pseudoEtat: 'confirme', valeursLoc: {}, personneRef: null },
      ],
      annotations: [
        { id: 'a1', type: 'anon', from: 1, to: 7, auteur: 'Ana', etat: 'anonymise', pseudo: 'Marie' },
      ],
    }),
  )

  test('texte des occurrences anonymisées remplacé, libellés retirés (voie autonome)', () => {
    const out = appliquerAnonymisation(SEGMENTS, { garderLibelles: false })
    expect(out[0].fragments.map((f) => f.texte)).toEqual(['[Marie]', ' habite Lyon.'])
    expect(out[0].fragments[0].anon).toBeNull()
    expect(out[0].nomloc).toBeNull()
    expect(out[0].libelle).toEqual({ type: 'simple' }) // la classe ligloc reste
  })

  test('voie .sonal : libellés conservés (pseudo de tour), vrai nom jamais porté', () => {
    const out = appliquerAnonymisation(SEGMENTS, { garderLibelles: true })
    expect(out[0].fragments.map((f) => f.texte)).toEqual(['[Marie]', ' habite Lyon.'])
    // Copie pseudonymisée : data-nomloc disparaît, le pseudo de tour reste
    // (les tables de locuteurs sont pseudonymisées en amont).
    expect(out[0].nomloc).toBeNull()
    expect(out[0].libelle).toEqual({ type: 'pseudo', pseudo: 'Claire' })
  })
})
