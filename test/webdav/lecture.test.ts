import { describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { LecteurWebDAV } from '../../src/main/distant/lecteurWebDAV'
import { TransfertWebDAV } from '../../src/main/distant/transfertWebDAV'
import type { EntreeLectureDistante, LectureDistante } from '../../src/main/distant/lecture'
import type { TransfertFichiersDistants } from '../../src/main/distant/transfert'
import { MiroirWebDAV } from '../../src/main/distant/miroirWebDAV'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { corpusDistantValide, entretienDistantValide } from './fixturesCorpusDistant'

class LectureMemoire implements LectureDistante {
  readonly inventorier = vi.fn(async (dossier: string): Promise<EntreeLectureDistante[]> => {
    if (dossier === '') {
      return [
        {
          chemin: 'corpus.crp',
          dossier: false,
          empreinte: { type: 'webdav-etag', valeur: 'corpus-v1' },
        },
        { chemin: 'entretiens', dossier: true, empreinte: null },
      ]
    }
    if (dossier === 'entretiens') {
      return [{
        chemin: 'e1.json',
        dossier: false,
        empreinte: { type: 'webdav-etag', valeur: 'e1-v1' },
      }]
    }
    if (dossier === 'audio') {
      return [{
        chemin: 'extrait.mp3',
        dossier: false,
        empreinte: { type: 'webdav-etag', valeur: 'audio-v1' },
      }]
    }
    return []
  })

  readonly lireTexte = vi.fn(async (chemin: string): Promise<string> => {
    if (chemin === 'corpus.crp') return corpusDistantValide(['e1'])
    return entretienDistantValide({
      texte: 'lu par le contrat',
      meta: {
        valeursGen: {},
        audioRef: null,
        audioDistant: { chemin: 'audio/extrait.mp3' },
      },
    })
  })
}

describe('lecture distante', () => {
  test('l’adaptateur WebDAV expose une empreinte de lecture et télécharge en flux', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('corpus.crp', '{"membership":{}}')
    serveur.poser('audio/extrait.mp3', 'octets-audio')
    const requetes: string[] = []
    const client = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (entree, init) => {
        requetes.push(new Request(entree, init).method)
        return serveur.fetch(entree, init)
      },
    )
    const lecture = new LecteurWebDAV(client)
    const transfert = new TransfertWebDAV(client)
    const destination = join(mkdtempSync(join(tmpdir(), 'sonal-lecture-')), 'extrait.mp3')

    const racine = await lecture.inventorier('')
    expect(racine.find((entree) => entree.chemin === 'corpus.crp')?.empreinte)
      .toMatchObject({ type: 'webdav-etag' })
    await expect(lecture.lireTexte('corpus.crp')).resolves.toContain('membership')
    await transfert.telechargerFichier('audio/extrait.mp3', destination)

    expect(readFileSync(destination, 'utf8')).toBe('octets-audio')
    expect(requetes.every((methode) => methode === 'GET' || methode === 'PROPFIND')).toBe(true)
  })

  test('le miroir consomme le lecteur injecté sans lire avec son client WebDAV', async () => {
    const fetchInterdit = vi.fn(async () => {
      throw new Error('Le client WebDAV ne doit pas porter les lectures du miroir.')
    })
    const client = new ClientWebDAV(
      {
        baseUrl: 'https://nextcloud.invalid/remote.php/dav/files/max/corpus',
        identifiants: { utilisateur: 'max', motDePasse: 'secret' },
      },
      fetchInterdit,
    )
    const lecture = new LectureMemoire()
    const transfert: TransfertFichiersDistants = {
      telechargerFichier: vi.fn(async (_chemin, destination) => {
        writeFileSync(destination, 'audio transféré')
      }),
      televerserFichier: vi.fn(async () => ({ ok: true })),
    }
    const dir = mkdtempSync(join(tmpdir(), 'sonal-miroir-lecture-'))
    const miroir = new MiroirWebDAV(
      client,
      dir,
      undefined,
      lecture,
      { fournisseur: 'webdav', destinationId: 'test-lecture' },
      transfert,
    )

    const tirage = await miroir.tirer()

    expect(tirage.telecharges).toEqual([
      'corpus.crp',
      'entretiens/e1.json',
      'audio/extrait.mp3',
    ])
    expect(JSON.parse(readFileSync(join(dir, 'entretiens', 'e1.json'), 'utf8')))
      .toMatchObject({ texte: 'lu par le contrat' })
    expect(lecture.inventorier).toHaveBeenCalledWith('')
    expect(lecture.inventorier).toHaveBeenCalledWith('entretiens')
    expect(lecture.inventorier).not.toHaveBeenCalledWith('verrous')
    expect(transfert.telechargerFichier).toHaveBeenCalledWith(
      'audio/extrait.mp3',
      expect.any(String),
      expect.any(Function),
    )
    expect(readFileSync(join(dir, 'audio/extrait.mp3'), 'utf8')).toBe('audio transféré')
    expect(fetchInterdit).not.toHaveBeenCalled()
  })
})
