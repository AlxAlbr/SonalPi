import { afterEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NOM_FICHIER_CORPUS } from '../src/shared/fichiersCorpus'
import { FORMAT_VERSION } from '../src/shared/format'
import { squeletteCorpus } from '../src/shared/corpus/squelette'
import { CorpusStore } from '../src/main/corpusStore'
import { MiroirWebDAV } from '../src/main/distant/miroirWebDAV'
import { PublieurCorpus } from '../src/main/distant/publication'
import { ClientWebDAV } from '../src/main/webdav/client'
import { ServeurWebDAVMemoire } from './webdav/serveurWebdavMemoire'

const dossiers: string[] = []
function dossier(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-crp-'))
  dossiers.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('nom natif du corpus', () => {
  test('reste fixe, sans incrément de version', () => {
    expect(NOM_FICHIER_CORPUS).toBe('corpus.crp')
    expect(FORMAT_VERSION).toBe(9)
  })

  test('création, transactions et réouverture gardent les entretiens en JSON séparés', () => {
    const dir = dossier()
    const store = new CorpusStore(dir)
    store.ouvrir()
    store.poserNom('Enquête été')
    const { id } = store.creerEntretienVide('Témoin')
    const corpus = new CorpusStore(dir).ouvrir()
    expect(corpus.nom).toBe('Enquête été')
    expect(corpus.membership[id].titre).toBe('Témoin')
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8'))).toEqual(corpus)
    expect(existsSync(join(dir, 'entretiens', `${id}.json`))).toBe(true)
    expect(existsSync(join(dir, 'corpus.json'))).toBe(false)
    expect(existsSync(join(dir, 'corpus.crp.tmp'))).toBe(false)
    expect(existsSync(join(dir, '.transaction-fichiers.json'))).toBe(false)
  })

  test('une cible disparue entre préparation et finalisation n’est pas recréée', () => {
    const dir = dossier()
    const store = new CorpusStore(dir)
    store.ouvrir()
    const cible = new CorpusStore(dir)
    const preparation = cible.preparerOuverture()
    rmSync(join(dir, 'corpus.crp'))
    expect(() => cible.finaliserOuverture(preparation)).toThrow(/changé/)
    expect(existsSync(join(dir, 'corpus.crp'))).toBe(false)
    expect(existsSync(join(dir, 'corpus.json'))).toBe(false)
  })
})

describe('nom natif distant', () => {
  test('publication JSON gardée, manifeste et corbeille suivent le CRP', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const config = { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }
    const envois: { chemin: string; mime: string | null; garde: string | null }[] = []
    const instrumente: typeof fetch = async (entree, init) => {
      const req = new Request(entree, init)
      if (req.method === 'PUT') {
        envois.push({ chemin: new URL(req.url).pathname, mime: req.headers.get('Content-Type'), garde: req.headers.get('If-None-Match') })
      }
      return serveur.fetch(entree, init)
    }
    await new PublieurCorpus(config, instrumente).publierSquelette('Équipe')
    expect(envois).toEqual([expect.objectContaining({
      chemin: expect.stringMatching(/\/corpus\.crp$/),
      mime: expect.stringContaining('application/json'),
      garde: '*',
    })])
    expect(serveur.contenuDe('corpus.json')).toBeUndefined()
    const client = new ClientWebDAV(config, serveur.fetch)
    const dir = dossier()
    const miroir = new MiroirWebDAV(client, dir)
    expect((await miroir.tirer()).telecharges).toEqual(['corpus.crp'])
    const manifeste = () => JSON.parse(readFileSync(join(dir, '.manifeste.json'), 'utf8'))
    expect(manifeste().empreintes['corpus.crp']).toEqual({ type: 'webdav-etag', valeur: serveur.etagDe('corpus.crp') })
    expect((await miroir.tirer()).corbeille).toEqual([])
    expect((await miroir.tirer()).telecharges).toEqual([])
    await client.supprimer('corpus.crp')
    await expect(miroir.tirer()).rejects.toThrow('ne contient pas de corpus.crp')
    expect(existsSync(join(dir, 'corpus.crp'))).toBe(true)
    expect(manifeste().empreintes['corpus.crp']).toBeDefined()
  })

  test.each(['corpus.crp', 'CORPUS.CRP'])('le CRP %s désigné comme audio ne passe jamais par le téléchargement binaire', async (chemin) => {
    const serveur = new ServeurWebDAVMemoire()
    const corpus = squeletteCorpus('Test média')
    const date = '2026-01-01T00:00:00.000Z'
    corpus.membership.e1 = { titre: 'E1', date: null, lastModified: date }
    serveur.poser('corpus.crp', JSON.stringify(corpus))
    serveur.poser('entretiens/e1.json', JSON.stringify({
      formatVersion: FORMAT_VERSION, lastModified: date,
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph' }] },
      annotations: [], ancres: [], locuteurs: [],
      meta: { valeursGen: {}, audioRef: null, audioDistant: { chemin } },
    }))
    const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, serveur.fetch)
    const binaire = vi.spyOn(client, 'getBinaireFichier')
    const miroir = new MiroirWebDAV(client, dossier())
    const premier = await miroir.tirer()
    expect(premier.telecharges.sort()).toEqual(['corpus.crp', 'entretiens/e1.json'])
    expect(premier.inaccessibles).toEqual([])
    expect(binaire).not.toHaveBeenCalled()
    expect((await miroir.tirer()).corbeille).toEqual([])
  })
})
