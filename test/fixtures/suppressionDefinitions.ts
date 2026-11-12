import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import { FORMAT_VERSION, type EntretienFichier } from '../../src/shared/format'
import type { CorpusStore } from '../../src/main/corpusStore'

export type DefinitionSupprimee = 'thème' | 'variable' | 'modalité'
export const definitionsSupprimees: DefinitionSupprimee[] = ['thème', 'variable', 'modalité']

export function corpusSuppressionDefinitions() {
  const corpus = squeletteCorpus('Suppression de définitions')
  corpus.codebook.theme = { id: 'theme', nom: 'Thème', ordre: 10, parent: null, actif: true, codeExport: 'theme' }
  corpus.variables.v = { id: 'v', lib: 'Variable', portee: 'entretien', priv: false, ordre: 0, vExport: 1, modalites: [{ id: 'm', lib: 'Modalité', mExport: 1 }] }
  corpus.membership = Object.fromEntries(['e1', 'e2'].map((id) => [id, { titre: id, date: null, lastModified: '2026-01-01T00:00:00.000Z' }]))
  corpus.ordreEntretiens = ['e1', 'e2']
  return corpus
}

export function entretienSuppressionDefinitions(usage?: DefinitionSupprimee): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION, lastModified: '2026-01-01T00:00:00.000Z',
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texte conservé.' }] }] },
    annotations: usage === 'thème' ? [{ id: 'a', type: 'codage', code: 'theme', from: 1, to: 3, auteur: 'test' }] : [],
    ancres: [], locuteurs: [], meta: { valeursGen: usage && usage !== 'thème' ? { v: 'm' } : {}, audioRef: null },
  }
}

export function supprimerDefinitionTest(store: CorpusStore, type: DefinitionSupprimee) {
  if (type === 'thème') return store.supprimerCategorie('theme')
  if (type === 'variable') return store.supprimerVariable('v')
  return store.supprimerModalite('v', 'm')
}
