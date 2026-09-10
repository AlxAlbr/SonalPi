import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { MiroirWebDAV } from '../src/main/distant/miroir'
import { ClientWebDAV } from '../src/main/webdav/client'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier, type Note } from '../src/shared/format'
import { ServeurWebDAVMemoire } from './webdav/serveurWebdavMemoire'

const dossiers: string[] = []
afterEach(() => {
  for (const dossier of dossiers.splice(0)) rmSync(dossier, { recursive: true, force: true })
})

function note(titre: string, corps: string): Note {
  return {
    id: 'note-distante',
    categorieId: 'ncat_resume',
    titre,
    date: null,
    statut: 'public',
    corps,
    locuteurIds: [],
    rang: 0,
    creeLe: '2025-01-01T10:00:00.000Z',
    modifieLe: null,
  }
}

function entretien(noteCourante: Note): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION,
    lastModified: '2025-01-01T10:00:00.000Z',
    corpsTexte: { type: 'doc', content: [] },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
    notes: [noteCourante],
  }
}

describe('Notes du corpus — consultation distante', () => {
  test('relit les notes du miroir après un nouveau tirage et refuse leur édition locale', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const corpus: CorpusFichier = {
      formatVersion: FORMAT_VERSION,
      nom: 'Corpus distant',
      codebook: {},
      variables: {},
      reglesAnon: {},
      personnes: {},
      membership: {
        e1: { titre: 'Entretien distant', date: null, lastModified: '2025-01-01T10:00:00.000Z' },
      },
    }
    serveur.poser('corpus.json', JSON.stringify(corpus))
    serveur.poser('entretiens/e1.json', JSON.stringify(entretien(note('Version A', 'Corps A'))))

    const dossier = mkdtempSync(join(tmpdir(), 'sonal-notes-distantes-'))
    dossiers.push(dossier)
    const client = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      serveur.fetch,
    )
    const miroir = new MiroirWebDAV(client, dossier)
    await miroir.tirer()
    const store = new CorpusStore(miroir.dirLocal)
    store.lectureSeule = true

    const premiere = store.notesInventaire().notes[0]
    expect(premiere).toMatchObject({
      entretienId: 'e1',
      entretienTitre: 'Entretien distant',
      titre: 'Version A',
      corps: 'Corps A',
    })
    expect(() => store.notesCommander({
      type: 'modifier',
      entretienId: 'e1',
      noteId: premiere.id,
      attendu: premiere.attendu,
      champs: {
        categorieId: premiere.categorieId,
        titre: 'Modification interdite',
        date: premiere.date,
        statut: premiere.statut,
        corps: premiere.corps,
      },
    }, true)).toThrow(/lecture seule/)

    serveur.poser('entretiens/e1.json', JSON.stringify(entretien(note('Version B', 'Corps B'))))
    await miroir.tirer()

    expect(store.notesInventaire().notes[0]).toMatchObject({
      titre: 'Version B',
      corps: 'Corps B',
    })
    expect(store.journalCorpusLister()).toEqual([])
  })
})
