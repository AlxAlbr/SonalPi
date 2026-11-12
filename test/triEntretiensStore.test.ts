import { describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import type { CorpusFichier, EntretienFichier, PayloadEntretien } from '../src/shared/format'

function banc(): { dir: string; store: CorpusStore } {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-tri-store-'))
  return { dir, store: new CorpusStore(dir) }
}

function payload(texte: string): PayloadEntretien {
  return {
    corpsTexte: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }],
    },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
  }
}

function lireCorpus(dir: string): CorpusFichier {
  return JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8')) as CorpusFichier
}

function changerDate(dir: string, id: string, lastModified: string): void {
  const chemin = join(dir, 'entretiens', `${id}.json`)
  const entretien = JSON.parse(readFileSync(chemin, 'utf8')) as EntretienFichier
  entretien.lastModified = lastModified
  writeFileSync(chemin, JSON.stringify(entretien, null, 2), 'utf8')
}

describe('CorpusStore — ordre et tri des entretiens', () => {
  test('création, import et suppression maintiennent liste et rangs', () => {
    const { store } = banc()
    store.ouvrir()
    const a = store.creerEntretienVide('A').id
    const b = store.importerEntretien('B', payload('deux mots')).id
    const c = store.creerEntretienVide('C').id

    expect(store.ouvrir().ordreEntretiens).toEqual([a, b, c])
    expect([a, b, c].map((id) => store.ouvrir().membership[id].rangAjout)).toEqual([0, 1, 2])

    store.supprimerEntretien(b)
    const apres = store.ouvrir()
    expect(apres.ordreEntretiens).toEqual([a, c])
    expect(apres.membership[b]).toBeUndefined()
    expect(apres.membership[c].rangAjout).toBe(2)
  })

  test('persiste le tri et projette le membership dans le même ordre', () => {
    const { dir, store } = banc()
    store.ouvrir()
    const z = store.creerEntretienVide('Zulu').id
    const a = store.creerEntretienVide('Alpha').id

    const trie = store.trierEntretiens('alpha')
    expect(trie.ordreEntretiens).toEqual([a, z])
    expect(Object.keys(trie.membership)).toEqual([a, z])
    expect(lireCorpus(dir).ordreEntretiens).toEqual([a, z])
    expect(Object.keys(lireCorpus(dir).membership)).toEqual([a, z])
  })

  test('le tri par modification lit les fichiers, pas le cache du membership', () => {
    const { dir, store } = banc()
    store.ouvrir()
    const ancien = store.creerEntretienVide('Ancien').id
    const recent = store.creerEntretienVide('Récent').id
    changerDate(dir, ancien, '2020-01-01T00:00:00Z')
    changerDate(dir, recent, '2030-01-01T00:00:00Z')
    const corpus = lireCorpus(dir)
    corpus.membership[ancien].lastModified = '2099-01-01T00:00:00Z'
    corpus.membership[recent].lastModified = '2000-01-01T00:00:00Z'
    writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(corpus, null, 2), 'utf8')

    expect(store.trierEntretiens('modif').ordreEntretiens).toEqual([recent, ancien])
  })

  test('alpha et ajout ne lisent aucun fichier entretien', () => {
    const { dir, store } = banc()
    store.ouvrir()
    const b = store.creerEntretienVide('B').id
    const a = store.creerEntretienVide('A').id
    writeFileSync(join(dir, 'entretiens', `${b}.json`), '{invalide', 'utf8')
    writeFileSync(join(dir, 'entretiens', `${a}.json`), '{invalide', 'utf8')

    expect(store.trierEntretiens('alpha').ordreEntretiens).toEqual([a, b])
    expect(store.trierEntretiens('ajout').ordreEntretiens).toEqual([b, a])
  })

  test('un fichier requis absent fait échouer le tri avant toute écriture', () => {
    const { dir, store } = banc()
    store.ouvrir()
    const a = store.creerEntretienVide('A').id
    const b = store.creerEntretienVide('B').id
    rmSync(join(dir, 'entretiens', `${b}.json`))
    const avant = readFileSync(join(dir, 'corpus.crp'), 'utf8')

    expect(() => store.trierEntretiens('longueur')).toThrow(/ne peut pas être lu/)
    expect(readFileSync(join(dir, 'corpus.crp'), 'utf8')).toBe(avant)
    expect(store.ouvrir().ordreEntretiens).toEqual([a, b])
  })
})
