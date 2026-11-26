import { afterEach, describe, expect, it } from 'vitest'
import { ClientWebDAV } from '../../src/main/webdav/client'
import {
  autoriserRepriseVerrousPerimes,
  contenuVerrou,
  DELAIS_REESSAI_VERROU_MS,
  ProviderPutConditionnel,
} from '../../src/main/verrous/providerPutConditionnel'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'

const CHEMIN = 'verrous/corpus.lock.json'
const MOI = { userId: 'max', machineId: 'poste-1', sessionId: 'concurrence-moi' }
const AUTRE = JSON.stringify(contenuVerrou({ userId: 'julie', machineId: 'poste-2', sessionId: 'concurrence-autre' }))
const delais = [...DELAIS_REESSAI_VERROU_MS]
afterEach(() => {
  DELAIS_REESSAI_VERROU_MS.splice(0, DELAIS_REESSAI_VERROU_MS.length, ...delais)
  autoriserRepriseVerrousPerimes(new ServeurWebDAVMemoire().baseUrl, null)
})

function banc() {
  const serveur = new ServeurWebDAVMemoire()
  const requetes: Request[] = []
  const interception = {
    avant: null as ((requete: Request) => Response | void) | null,
    apres: null as ((requete: Request, reponse: Response) => Response | void) | null,
  }
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, async (entree, init) => {
    const requete = new Request(entree, init)
    requetes.push(requete)
    const reponse = interception.avant?.(requete) ?? await serveur.fetch(entree, init)
    return interception.apres?.(requete, reponse) ?? reponse
  })
  const provider = (sessionId = MOI.sessionId) => new ProviderPutConditionnel(client, () => ({ ...MOI, sessionId }))
  const verifierConditions = () => {
    for (const r of requetes) {
      if (r.method === 'DELETE') expect(r.headers.has('If-Match')).toBe(true)
      if (r.method === 'PUT') expect(r.headers.has('If-Match') || r.headers.has('If-None-Match')).toBe(true)
    }
  }
  return { serveur, requetes, interception, provider, verifierConditions }
}

describe('réservations — changements entre vérification et action', () => {
  it.each(['avant', 'apres'] as const)('un battement ne remplace pas le concurrent arrivé %s la relecture', async (moment) => {
    const b = banc()
    const p = b.provider()
    await p.acquerir(CHEMIN)
    b.serveur.poser(CHEMIN, b.serveur.contenuDe(CHEMIN)!)
    let lectures = 0
    b.interception[moment] = (r) => {
      if (r.method === 'GET' && ++lectures === 2) b.serveur.poser(CHEMIN, AUTRE)
    }
    expect((await p.battre(CHEMIN)).ok).toBe(false)
    expect(b.serveur.contenuDe(CHEMIN)).toBe(AUTRE)
    b.verifierConditions()
  })

  it('une libération ne supprime pas le concurrent arrivé après la relecture', async () => {
    const b = banc()
    const p = b.provider()
    await p.acquerir(CHEMIN)
    b.serveur.poser(CHEMIN, b.serveur.contenuDe(CHEMIN)!)
    b.interception.apres = (r) => {
      if (r.method === 'GET') b.serveur.poser(CHEMIN, AUTRE)
    }
    await expect(p.liberer(CHEMIN)).rejects.toMatchObject({ statut: 412 })
    expect(b.serveur.contenuDe(CHEMIN)).toBe(AUTRE)
    b.verifierConditions()
  })

  it('une libération différée ne supprime pas une réservation reprise pendant sa vérification', async () => {
    DELAIS_REESSAI_VERROU_MS.fill(0)
    const b = banc()
    const p = b.provider()
    await p.acquerir(CHEMIN)
    b.interception.avant = (r) => r.method === 'DELETE' ? new Response('panne', { status: 503 }) : undefined
    await expect(p.liberer(CHEMIN)).rejects.toThrow()
    b.interception.avant = null
    let lectures = 0
    b.interception.apres = (r) => {
      if (r.method === 'GET' && ++lectures === 2) b.serveur.poser(CHEMIN, AUTRE)
    }
    expect((await b.provider('concurrence-suivante').acquerir(CHEMIN)).ok).toBe(false)
    expect(b.serveur.contenuDe(CHEMIN)).toBe(AUTRE)
    b.verifierConditions()
  })

  it('le nettoyage automatique ne supprime pas une réservation reprise après observation', async () => {
    const b = banc()
    b.serveur.poser(CHEMIN, JSON.stringify(contenuVerrou({ ...MOI, sessionId: 'ancien' }, 300, new Date('2020-01-01'))))
    autoriserRepriseVerrousPerimes(b.serveur.baseUrl, () => true)
    let lectures = 0
    b.interception.apres = (r) => {
      if (r.method === 'GET' && ++lectures === 2) b.serveur.poser(CHEMIN, AUTRE)
    }
    expect((await b.provider().acquerir(CHEMIN)).ok).toBe(false)
    expect(b.serveur.contenuDe(CHEMIN)).toBe(AUTRE)
    b.verifierConditions()
  })

  it('sans version dans la relecture, la libération reste impossible', async () => {
    const b = banc()
    const p = b.provider()
    await p.acquerir(CHEMIN)
    b.serveur.poser(CHEMIN, b.serveur.contenuDe(CHEMIN)!)
    b.interception.apres = (r, reponse) => {
      if (r.method === 'GET') reponse.headers.delete('etag')
    }
    await expect(p.liberer(CHEMIN)).rejects.toThrow('réservation')
    expect(b.serveur.contenuDe(CHEMIN)).toContain(MOI.sessionId)
    b.verifierConditions()
  })

  it('une réponse PUT sans version peut être complétée par une relecture identique', async () => {
    const b = banc()
    b.interception.apres = (r, reponse) => {
      if (r.method === 'PUT') reponse.headers.delete('etag')
    }
    const p = b.provider()
    expect((await p.acquerir(CHEMIN)).ok).toBe(true)
    expect((await p.battre(CHEMIN)).ok).toBe(true)
    await p.liberer(CHEMIN)
    expect(b.serveur.contenuDe(CHEMIN)).toBeUndefined()
    b.verifierConditions()
  })

  it('une réponse PUT sans version ne permet pas d’hériter de la réservation d’un concurrent', async () => {
    const b = banc()
    b.interception.apres = (r, reponse) => {
      if (r.method === 'PUT') {
        reponse.headers.delete('etag')
        b.serveur.poser(CHEMIN, AUTRE)
      }
    }
    await expect(b.provider().acquerir(CHEMIN)).rejects.toThrow('version vérifiable')
    expect(b.serveur.contenuDe(CHEMIN)).toBe(AUTRE)
    b.verifierConditions()
  })
})
