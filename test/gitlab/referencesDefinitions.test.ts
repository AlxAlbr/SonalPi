import { describe, expect, test } from 'vitest'
import {
  ReferencesDefinitionsInvalidesError,
  verifierReferencesDefinitions,
} from '../../src/main/gitlab/referencesDefinitions'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import type { EntretienFichier } from '../../src/shared/format'

function entretien(): EntretienFichier {
  return {
    formatVersion: 8,
    lastModified: '2026-01-01T00:00:00.000Z',
    corpsTexte: { type: 'doc', content: [] },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
  }
}

describe('références des entretiens vers les définitions', () => {
  test('accepte les références encore définies', () => {
    const corpus = squeletteCorpus()
    corpus.codebook.theme = {
      id: 'theme', nom: 'Thème', parent: null, ordre: 0, actif: true, codeExport: 'theme',
    }
    corpus.reglesAnon.regle = { id: 'regle', entite: ['Alice'], pseudos: ['A.'] }
    corpus.categoriesNote = [{ id: 'note', nom: 'Note', couleur: '#fff' }]
    corpus.variables.variable = {
      id: 'variable', lib: 'Variable', ordre: 0, vExport: 1, portee: 'entretien', priv: false,
      modalites: [{ id: 'modalite', lib: 'Oui', mExport: 1 }],
    }
    const candidat = entretien()
    candidat.annotations = [
      { id: 'a1', type: 'codage', from: 1, to: 2, auteur: 'alice', code: 'theme' },
      { id: 'a2', type: 'anon', from: 2, to: 3, auteur: 'alice', regle: 'regle' },
    ]
    candidat.notes = [{
      id: 'n1', categorieId: 'note', titre: '', date: null, statut: 'prive', corps: '',
      rang: 0, creeLe: '2026-01-01T00:00:00.000Z', modifieLe: null,
    }]
    candidat.meta.valeursGen.variable = 'modalite'

    expect(() => verifierReferencesDefinitions(candidat, corpus)).not.toThrow()
  })

  test.each([
    ['thème', (candidat: EntretienFichier) => candidat.annotations.push({
      id: 'a1', type: 'codage', from: 1, to: 2, auteur: 'alice', code: 'absent',
    })],
    ['règle d’anonymisation', (candidat: EntretienFichier) => candidat.annotations.push({
      id: 'a1', type: 'anon', from: 1, to: 2, auteur: 'alice', regle: 'absente',
    })],
    ['catégorie de note', (candidat: EntretienFichier) => {
      candidat.notes = [{
        id: 'n1', categorieId: 'absente', titre: '', date: null, statut: 'prive', corps: '',
        rang: 0, creeLe: '2026-01-01T00:00:00.000Z', modifieLe: null,
      }]
    }],
    ['variable', (candidat: EntretienFichier) => { candidat.meta.valeursGen.absente = 'modalite' }],
  ])('refuse une référence vers une %s supprimée', (type, modifier) => {
    const candidat = entretien()
    modifier(candidat)
    expect(() => verifierReferencesDefinitions(candidat, squeletteCorpus()))
      .toThrow(ReferencesDefinitionsInvalidesError)
    expect(() => verifierReferencesDefinitions(candidat, squeletteCorpus()))
      .toThrow(new RegExp(type))
  })

  test('refuse une modalité supprimée chez un locuteur', () => {
    const corpus = squeletteCorpus()
    corpus.variables.variable = {
      id: 'variable', lib: 'Variable', ordre: 0, vExport: 1, portee: 'locuteur', priv: false,
      modalites: [],
    }
    const candidat = entretien()
    candidat.locuteurs.push({
      index: 0,
      nom: 'Alice',
      valeursLoc: { variable: 'modalite-supprimee' },
      personneRef: null,
    })

    expect(() => verifierReferencesDefinitions(candidat, corpus)).toThrow(/modalité/)
  })
})
