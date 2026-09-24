import { describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MiroirWebDAV } from '../../src/main/distant/miroir'
import { LecteurWebDAV } from '../../src/main/distant/lecteurWebDAV'
import type { LectureDistante } from '../../src/main/distant/lecture'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'

const CHEMIN = 'entretiens/e1.json'
const BASE = JSON.stringify({ texte: 'version initiale', meta: {} })
const DISTANT = JSON.stringify({ texte: 'version distante', meta: {} })
const LOCAL = JSON.stringify({ texte: 'travail local non publié', meta: {} })

function banc() {
  const serveur = new ServeurWebDAVMemoire()
  serveur.poser('corpus.json', JSON.stringify({ membership: { e1: {} } }))
  serveur.poser(CHEMIN, BASE)
  const requetes: { methode: string; chemin: string }[] = []
  const panne = { inventaireEntretiens: null as number | null }
  const client = new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    async (entree, init) => {
      const requete = new Request(entree, init)
      const chemin = decodeURIComponent(new URL(requete.url).pathname)
        .slice(serveur.racineDav.length + 1)
      requetes.push({ methode: requete.method, chemin })
      if (
        requete.method === 'PROPFIND' &&
        chemin === 'entretiens' &&
        panne.inventaireEntretiens !== null
      ) {
        return new Response('Inventaire indisponible', { status: panne.inventaireEntretiens })
      }
      return serveur.fetch(entree, init)
    },
  )
  const dir = mkdtempSync(join(tmpdir(), 'sonal-miroir-contrat-'))
  const miroir = new MiroirWebDAV(client, dir)
  const fichier = join(dir, CHEMIN)
  const manifeste = join(dir, '.manifeste.json')
  return { serveur, client, miroir, dir, fichier, manifeste, requetes, panne }
}

describe('miroir distant — protection du travail local', () => {
  test('un tirage ne publie pas le contenu local et ne prend aucun verrou', async () => {
    const b = banc()
    await b.miroir.tirer()
    writeFileSync(b.fichier, LOCAL)
    b.requetes.length = 0

    expect((await b.miroir.tirer([CHEMIN])).telecharges).toEqual([])

    expect(b.requetes.length).toBeGreaterThan(0)
    expect(b.requetes.every(({ methode }) => methode === 'GET' || methode === 'PROPFIND'))
      .toBe(true)
    expect(b.serveur.contenuDe(CHEMIN)).toBe(BASE)
    expect(b.serveur.contenuDe('verrous/e1.lock.json')).toBeUndefined()
    expect(readFileSync(b.fichier, 'utf8')).toBe(LOCAL)
  })

  test('un fichier exclu garde son contenu et sa version, les autres sont actualisés', async () => {
    const b = banc()
    await b.miroir.tirer()
    const versionInitiale = b.miroir.etagDistant(CHEMIN)
    writeFileSync(b.fichier, LOCAL)
    b.serveur.poser(CHEMIN, DISTANT)
    b.serveur.poser('entretiens/e2.json', DISTANT)
    b.requetes.length = 0

    const tirage = await b.miroir.tirer([CHEMIN])

    expect(tirage.telecharges).toEqual(['entretiens/e2.json'])
    expect(readFileSync(b.fichier, 'utf8')).toBe(LOCAL)
    expect(b.miroir.etagDistant(CHEMIN)).toBe(versionInitiale)
    expect(b.miroir.etagDistant(CHEMIN)).not.toBe(b.serveur.etagDe(CHEMIN))
    expect(b.requetes).not.toContainEqual({ methode: 'GET', chemin: CHEMIN })
    expect(readFileSync(join(b.dir, 'entretiens/e2.json'), 'utf8')).toBe(DISTANT)
  })

  test('un fichier exclu dès le premier tirage ne reçoit ni contenu ni version', async () => {
    const b = banc()

    const tirage = await b.miroir.tirer([CHEMIN])

    expect(tirage.telecharges).toEqual(['corpus.json'])
    expect(existsSync(b.fichier)).toBe(false)
    expect(b.miroir.etagDistant(CHEMIN)).toBeNull()
  })

  test('la disparition distante d’un fichier exclu ne déplace pas le travail local', async () => {
    const b = banc()
    await b.miroir.tirer()
    const versionInitiale = b.miroir.etagDistant(CHEMIN)
    writeFileSync(b.fichier, LOCAL)
    await b.client.supprimer(CHEMIN)

    expect((await b.miroir.tirer([CHEMIN])).corbeille).toEqual([])
    expect(readFileSync(b.fichier, 'utf8')).toBe(LOCAL)
    expect(b.miroir.etagDistant(CHEMIN)).toBe(versionInitiale)
    expect(existsSync(join(b.dir, 'corbeille-miroir', CHEMIN))).toBe(false)

    const tirageSansExclusion = await b.miroir.tirer()
    expect(tirageSansExclusion.corbeille).toEqual([CHEMIN])
    expect(readFileSync(join(b.dir, 'corbeille-miroir', CHEMIN), 'utf8')).toBe(LOCAL)
    expect(b.miroir.etagDistant(CHEMIN)).toBeNull()
  })

  test('un téléchargement incomplet ne remplace aucun fichier du miroir', async () => {
    const b = banc()
    b.serveur.poser('entretiens/e2.json', BASE)
    await b.miroir.tirer()
    const manifesteInitial = readFileSync(b.manifeste, 'utf8')
    b.serveur.poser(CHEMIN, DISTANT)
    b.serveur.poser('entretiens/e2.json', DISTANT)
    const lecteur = new LecteurWebDAV(b.client)
    const lectureEnPanne: LectureDistante = {
      inventorier: (dossier) => lecteur.inventorier(dossier),
      lireTexte: async (chemin) => {
        if (chemin === 'entretiens/e2.json') throw new Error('réseau interrompu')
        return lecteur.lireTexte(chemin)
      },
    }
    const miroirEnPanne = new MiroirWebDAV(b.client, b.dir, undefined, lectureEnPanne)

    await expect(miroirEnPanne.tirer()).rejects.toThrow('réseau interrompu')

    expect(readFileSync(b.fichier, 'utf8')).toBe(BASE)
    expect(readFileSync(join(b.dir, 'entretiens/e2.json'), 'utf8')).toBe(BASE)
    expect(readFileSync(b.manifeste, 'utf8')).toBe(manifesteInitial)
    expect(existsSync(join(b.dir, '.installation-miroir.json'))).toBe(false)
    expect(existsSync(join(b.dir, '.installation-miroir'))).toBe(false)
  })

  test.each([403, 503])('un inventaire refusé (%i) ne vaut pas suppression', async (statut) => {
    const b = banc()
    await b.miroir.tirer()
    const manifesteInitial = readFileSync(b.manifeste, 'utf8')
    await b.client.supprimer(CHEMIN)
    b.panne.inventaireEntretiens = statut

    await expect(b.miroir.tirer()).rejects.toMatchObject({ statut })

    expect(readFileSync(b.fichier, 'utf8')).toBe(BASE)
    expect(readFileSync(b.manifeste, 'utf8')).toBe(manifesteInitial)
    expect(existsSync(join(b.dir, 'corbeille-miroir', CHEMIN))).toBe(false)
    expect(b.requetes.some(({ methode }) => methode === 'PUT')).toBe(false)
  })

  test('un manifeste WebDAV historique est migré sans retélécharger les fichiers inchangés', async () => {
    const b = banc()
    await b.miroir.tirer()
    const etagCorpus = b.miroir.etagDistant('corpus.json')!
    const etagEntretien = b.miroir.etagDistant(CHEMIN)!
    writeFileSync(b.manifeste, JSON.stringify({
      formatVersion: 1,
      etags: { 'corpus.json': etagCorpus, [CHEMIN]: etagEntretien },
    }), 'utf8')
    b.requetes.length = 0

    await b.miroir.tirer()

    expect(b.requetes.filter(({ methode }) => methode === 'GET')).toEqual([])
    expect(JSON.parse(readFileSync(b.manifeste, 'utf8'))).toMatchObject({
      formatVersion: 2,
      destination: { fournisseur: 'webdav' },
      empreintes: {
        'corpus.json': { type: 'webdav-etag', valeur: etagCorpus },
        [CHEMIN]: { type: 'webdav-etag', valeur: etagEntretien },
      },
    })
  })

  test('un manifeste appartenant à une autre destination est refusé sans toucher au miroir', async () => {
    const b = banc()
    await b.miroir.tirer()
    const contenuInitial = readFileSync(b.fichier, 'utf8')
    const manifeste = JSON.parse(readFileSync(b.manifeste, 'utf8')) as {
      destination: { destinationId: string }
    }
    manifeste.destination.destinationId = 'autre-destination'
    writeFileSync(b.manifeste, JSON.stringify(manifeste), 'utf8')
    b.serveur.poser(CHEMIN, DISTANT)

    await expect(b.miroir.tirer()).rejects.toThrow('autre destination')

    expect(readFileSync(b.fichier, 'utf8')).toBe(contenuInitial)
    expect(existsSync(join(b.dir, 'corbeille-miroir', CHEMIN))).toBe(false)
  })

  test('un nouveau miroir conserve les exclusions explicites et les fichiers de récupération', async () => {
    const b = banc()
    await b.miroir.tirer()
    const versionInitiale = b.miroir.etagDistant(CHEMIN)
    writeFileSync(b.fichier, LOCAL)
    mkdirSync(join(b.dir, 'sessions'))
    const copie = join(b.dir, 'sessions', 'e1.divergence-session.json')
    writeFileSync(copie, LOCAL)
    b.serveur.poser(CHEMIN, DISTANT)
    const miroirReouvert = new MiroirWebDAV(b.client, b.dir)

    await miroirReouvert.tirer([CHEMIN])

    expect(readFileSync(b.fichier, 'utf8')).toBe(LOCAL)
    expect(readFileSync(copie, 'utf8')).toBe(LOCAL)
    expect(miroirReouvert.etagDistant(CHEMIN)).toBe(versionInitiale)
  })
})
