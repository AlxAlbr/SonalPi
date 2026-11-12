import { describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { ecrireSeedDemo } from './seedDemo'
import { FORMAT_VERSION, type EntretienFichier } from '../src/shared/format'

function storeSeed() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-recueils-'))
  ecrireSeedDemo(dir)
  return { dir, store: new CorpusStore(dir) }
}

describe('CorpusStore — recueils et repères', () => {
  test('migre explicitement v3 vers le format courant avec collections normalisées', () => {
    const { dir, store } = storeSeed()
    const corpus = store.ouvrir()
    expect(corpus.formatVersion).toBe(FORMAT_VERSION)
    expect(corpus.recueils).toEqual({})
    expect(corpus.cas).toEqual({})
    const entretien = JSON.parse(readFileSync(join(dir, 'entretiens/e1.json'), 'utf8')) as EntretienFichier
    expect(entretien.formatVersion).toBe(FORMAT_VERSION)
    expect(entretien.reperesPassages).toEqual([])
  })

  test('persiste les commandes ciblées et revalide la présence du repère', () => {
    const { dir, store } = storeSeed()
    store.ouvrir()
    const lecture = store.lireEntretien('e1')
    expect(lecture.ok).toBe(true)
    if (!lecture.ok) return
    const { formatVersion: _version, lastModified: _date, ...payload } = lecture.data
    payload.reperesPassages = [{ id: 'p1', from: 1, to: 7 }]
    store.ecrireEntretien('e1', payload)
    expect(store.reperePassageExiste('e1', 'p1')).toBe(true)

    let corpus = store.recueilsCommander({ type: 'creer', id: 'r1', nom: 'Synthèse' })
    corpus = store.recueilsCommander({
      type: 'inserer-item',
      recueilId: 'r1',
      attenduOrdre: [],
      avantId: null,
      item: {
        id: 'i1',
        type: 'passage',
        source: { entretienId: 'e1', repereId: 'p1' },
        commentaireEditorial: '',
      },
    })
    expect(corpus.recueils?.r1.items).toHaveLength(1)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8')).recueils.r1.items[0].source)
      .toEqual({ entretienId: 'e1', repereId: 'p1' })
  })

  test('un remplacement complet rend les repères existants orphelins', () => {
    const { dir, store } = storeSeed()
    store.ouvrir()
    const fichier = join(dir, 'entretiens/e1.json')
    const data = JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier
    data.reperesPassages = [{ id: 'p1', from: 1, to: 7 }]
    writeFileSync(fichier, JSON.stringify(data, null, 2), 'utf8')

    store.remplacerTranscription('e1', {
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Nouveau' }] }] },
      annotations: [],
      ancres: [],
      locuteurs: [],
    })
    const lecture = store.lireEntretien('e1')
    expect(lecture.ok && lecture.data.reperesPassages).toEqual([{ id: 'p1', from: 0, to: 0 }])
  })
})
