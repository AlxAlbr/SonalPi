import { describe, expect, it } from 'vitest'
import { assemblerModeleQualcoder } from '../src/renderer/services/exportQualcoder'
import { projeterTexteQualcoder, plageTexteQualcoder } from '../src/shared/export/qualcoder/projection'
import type { InstantaneEntretienExport } from '../src/shared/export/types'
import type { Cas, DefinitionAttributCas } from '../src/shared/corpus/cas'

function instantane(): InstantaneEntretienExport {
  return {
    id: 'e1', titre: 'Entretien', date: '2024-01-01', reperesPassages: [{ id: 'r1', from: 10, to: 15 }],
    entretien: {
      corpsTexte: { type: 'doc', content: [
        { type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'Bonjour' }] },
        { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'le monde' }] },
      ] },
      annotations: [
        { id: 'a1', type: 'codage', from: 1, to: 7, auteur: 'A', code: 'cat1' },
        { id: 'a2', type: 'commentaire', from: 9, to: 17, auteur: 'A', texte: ' remarquant' },
      ],
      ancres: [], locuteurs: [
        { index: 0, nom: 'A', interviewer: false, valeursLoc: {} },
        { index: 1, nom: 'B', interviewer: false, valeursLoc: {} },
      ], codebook: [], variables: [], meta: { valeursGen: { v1: 'm1' } },
      legacy: { tabAnon: null, notes: '' },
    },
    notesPubliques: [], audioLocal: null,
  }
}

function cas(): Cas {
  return {
    id: 'cas1', nom: 'Cas', memo: '', creeLe: '2024-01-01', modifieLe: '2024-01-01',
    regles: [], rattachements: [{ id: 'm1', source: { entretienId: 'e1', repereId: 'r1' }, provenance: 'manuel', creeLe: '2024-01-01' }],
  }
}

function attribut(): DefinitionAttributCas {
  return { id: 'a1', lib: 'Statut', type: 'modalites', priv: false, ordre: 1, modalites: [{ id: 'm1', lib: 'Actif' }] }
}

describe('modèle QualCoder', () => {
  it('projette le texte et convertit les positions ProseMirror', () => {
    const projection = projeterTexteQualcoder(instantane().entretien.corpsTexte)
    expect(projection.fulltext).toBe('Bonjour\n\nle monde')
    expect(plageTexteQualcoder(projection, 10, 15)).toEqual({ from: 9, to: 14, seltext: 'le mo' })
  })

  it('réunit sources, cas, attributs et codages sans écrire', () => {
    const source = instantane()
    const modele = assemblerModeleQualcoder({
      nom: 'Corpus', selection: [source],
      corpus: {
        membership: { e1: { titre: 'Entretien' } }, variables: {
          v1: { id: 'v1', lib: 'Établissement', portee: 'entretien', priv: false, ordre: 1, vExport: 1, modalites: [{ id: 'm1', lib: 'A' }] },
        },
        famillesCas: {}, attributsCas: { a1: attribut() }, codebook: {
          cat1: { id: 'cat1', nom: 'Thème', couleur: '#112233', ordre: 1, parent: null, actif: true, codeExport: 'cat_001' },
        }, cas: { cas1: cas() },
      },
      personnes: {}, casSelectionnes: ['cas1'], owner: 'SonalPi',
    })
    expect(modele.sources[0].fulltext).toBe('Bonjour\n\nle monde')
    expect(modele.sources[0].annotations[0]).toMatchObject({ from: 0, to: 6, type: 'codage' })
    expect(modele.sources[0].attributs).toEqual([{ nom: 'Établissement', valeur: 'A', type: 'fichier' }])
    expect(modele.cases[0].passages).toEqual([{ sourceId: 'e1', from: 9, to: 14, seltext: 'le mo', provenance: 'manuel' }])
    expect(modele.cases[0].attributs).toEqual([])
  })
})
