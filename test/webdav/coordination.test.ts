import { describe, expect, test } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/distant/miroirWebDAV'
import { ObservationVerrousWebDAV } from '../../src/main/distant/observationVerrousWebDAV'
import { SessionsDEntretien } from '../../src/main/distant/sessions'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'

function banc() {
  const serveur = new ServeurWebDAVMemoire()
  const client = new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    serveur.fetch,
  )
  const miroir = new MiroirWebDAV(
    client,
    mkdtempSync(join(tmpdir(), 'sonal-observation-verrous-')),
  )
  const sessions = new SessionsDEntretien(client, miroir, () => ({
    userId: 'max',
    machineId: 'poste-max',
    sessionId: 'session-max',
  }))
  return { serveur, client, sessions }
}

describe('observation de la coordination WebDAV', () => {
  test('les verrous coopératifs sont observés hors du tirage du miroir', async () => {
    const b = banc()
    b.serveur.poser('verrous/e1.lock.json', JSON.stringify({
      userId: 'olivier',
      machineId: 'poste-olivier',
      sessionId: 'session-olivier',
      acquiredAt: '2026-01-01T10:00:00.000Z',
      refreshedAt: '2026-01-01T10:00:00.000Z',
      ttl: 3600,
    }))
    const observation = new ObservationVerrousWebDAV(b.client, b.sessions, false)

    await expect(observation.observerVerrous()).resolves.toEqual({
      indisponible: false,
      entrees: [{
        chemin: 'verrous/e1.lock.json',
        etag: b.serveur.etagDe('verrous/e1.lock.json'),
        contenu: {
          userId: 'olivier',
          machineId: 'poste-olivier',
          acquiredAt: '2026-01-01T10:00:00.000Z',
        },
      }],
    })
  })

  test('un dossier de verrous absent signifie qu’aucun verrou coopératif n’est observé', async () => {
    const b = banc()
    const observation = new ObservationVerrousWebDAV(b.client, b.sessions, false)

    await expect(observation.observerVerrous()).resolves.toEqual({
      entrees: [],
      indisponible: false,
    })
  })

  test('une panne de lecture d’un verrou inventorié rend l’observation indisponible', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('verrous/e1.lock.json', '{}')
    const client = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (requete, init) => {
        const methode = init?.method ?? (requete instanceof Request ? requete.method : 'GET')
        const url = requete instanceof Request ? requete.url : String(requete)
        return methode === 'GET' && new URL(url).pathname.endsWith('/verrous/e1.lock.json')
          ? new Response(null, { status: 503 })
          : serveur.fetch(requete, init)
      },
    )
    const sessions = new SessionsDEntretien(client, {} as never, () => ({
      userId: 'max',
      machineId: 'poste-max',
      sessionId: 'session-max',
    }))

    await expect(new ObservationVerrousWebDAV(client, sessions, false).observerVerrous())
      .resolves.toEqual({ entrees: [], indisponible: true })
  })

  test('une panne d’inventaire se signale au lieu de ressembler à « personne »', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const client = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (requete, init) => {
        const methode = init?.method ?? (requete instanceof Request ? requete.method : 'GET')
        return methode === 'PROPFIND'
          ? new Response(null, { status: 500 })
          : serveur.fetch(requete, init)
      },
    )
    const sessions = new SessionsDEntretien(client, {} as never, () => ({
      userId: 'max',
      machineId: 'poste-max',
      sessionId: 'session-max',
    }))

    await expect(new ObservationVerrousWebDAV(client, sessions, false).observerVerrous())
      .resolves.toEqual({ entrees: [], indisponible: true })
  })
})
