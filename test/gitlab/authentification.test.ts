/**
 *  Détection d'instance et service d'authentification GitLab.
 *  Le navigateur est simulé, la callback reste réelle : ce qui est vérifié
 *  ici est le contrat public — états, comptes, aucune fuite de secret.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { CoffreComptes, type Chiffreur } from '../../src/main/distant/coffre'
import { ServiceAuthentificationGitLab } from '../../src/main/gitlab/authentification'
import {
  candidatsInstance,
  detecterInstanceGitLab,
} from '../../src/main/gitlab/detectionInstance'
import {
  InstancesGitLab,
  ErreurInstanceGitLabOAuth,
  uriCallback,
} from '../../src/main/gitlab/oauth/instances'
import type { CredentialOAuthGitLab } from '../../src/main/gitlab/oauth/credential'

const chiffreur: Chiffreur = {
  disponible: () => true,
  chiffre: (clair) => `chiffre:${Buffer.from(clair).toString('base64')}`,
  dechiffre: (secret) => {
    if (!secret.startsWith('chiffre:')) throw new Error('secret illisible')
    return Buffer.from(secret.slice('chiffre:'.length), 'base64').toString()
  },
}

const chiffreurIndisponible: Chiffreur = {
  disponible: () => false,
  chiffre: () => { throw new Error('stockage indisponible') },
  dechiffre: () => { throw new Error('stockage indisponible') },
}

const JETON = {
  access_token: 'access-secret',
  refresh_token: 'refresh-secret',
  token_type: 'bearer',
  expires_in: 7200,
  scope: 'api',
}

function credential(surcharge: Partial<CredentialOAuthGitLab> = {}): CredentialOAuthGitLab {
  return {
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['api'],
    rotationneeLe: Date.now(),
    ...surcharge,
  }
}

describe('détection d’instance', () => {
  test('propose les sous-chemins du plus profond vers la racine', () => {
    expect(candidatsInstance('https://hote.example.org/groupe/corpus')).toEqual([
      'https://hote.example.org/groupe',
      'https://hote.example.org',
    ])
    expect(candidatsInstance('https://hote.example.org/gitlab/groupe/equipe/corpus')).toEqual([
      'https://hote.example.org/gitlab/groupe/equipe',
      'https://hote.example.org/gitlab/groupe',
      'https://hote.example.org/gitlab',
      'https://hote.example.org',
    ])
    expect(candidatsInstance('pas une url')).toEqual([])
  })

  test('retient le sous-chemin qui expose l’API GitLab', async () => {
    const vus: string[] = []
    const fetchImpl = vi.fn(async (entree: string | URL | Request) => {
      const url = new URL(String(entree))
      vus.push(url.toString())
      const estLeBon = url.toString() === 'https://hote.example.org/gitlab/api/v4/version'
      return new Response(JSON.stringify({ version: estLeBon ? '18.0.0' : 'not found' }), {
        status: estLeBon ? 200 : 404,
      })
    }) as unknown as typeof fetch

    await expect(detecterInstanceGitLab(
      'https://hote.example.org/gitlab/groupe/corpus',
      { fetchImpl },
    )).resolves.toBe('https://hote.example.org/gitlab')
    // Le sonde s'arrête au premier succès : pas de jeton, seulement la version.
    expect(vus.every((url) => url.endsWith('/api/v4/version'))).toBe(true)
  })

  test('retient la racine quand aucune instance sous-chemin ne répond', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch
    await expect(detecterInstanceGitLab(
      'https://hote.example.org/groupe/corpus',
      { fetchImpl },
    )).resolves.toBe('https://hote.example.org')
  })

  test('une adresse inexplorable ne renvoie aucune instance', async () => {
    await expect(detecterInstanceGitLab('')).resolves.toBeNull()
  })
})

describe('instances prises en charge', () => {
  function instances(): InstancesGitLab {
    return new InstancesGitLab(
      join(mkdtempSync(join(tmpdir(), 'sonal-instances-')), 'instances-gitlab.json'),
    )
  }

  test('une instance inconnue est refusée avec une demande de client_id', () => {
    const registre = instances()
    expect(() => registre.resoudre('https://gitlab.inconnu.example')).toThrow(
      ErreurInstanceGitLabOAuth,
    )
    try {
      registre.resoudre('https://gitlab.inconnu.example')
    } catch (erreur) {
      expect(erreur).toMatchObject({ applicationAbsente: true })
      expect((erreur as Error).message).toMatch(/client_id/)
    }
  })

  test('un client_id déclaré est mémorisé, sans être un secret', () => {
    const registre = instances()
    expect(registre.connue('https://gitlab.exemple.org')).toBe(false)
    const declaree = registre.declarer('https://GITLAB.exemple.org:443/', ' client-sonal ')

    expect(declaree).toMatchObject({
      urlInstance: 'https://gitlab.exemple.org',
      clientId: 'client-sonal',
      origine: 'poste',
    })
    expect(registre.connue('https://gitlab.exemple.org')).toBe(true)
    expect(registre.resoudre('https://gitlab.exemple.org')).toEqual(declaree)
    expect(uriCallback(declaree)).toBe('http://127.0.0.1:7474/callback')
  })

  test('un identifiant qui ne ressemble pas à un client_id est refusé', () => {
    const registre = instances()
    expect(() => registre.declarer('https://gitlab.exemple.org', '   ')).toThrow(/manquant/)
    expect(() => registre.declarer('https://gitlab.exemple.org', 'a b')).toThrow(/client_id/)
    expect(() => registre.declarer('https://gitlab.exemple.org', 'x')).toThrow(/client_id/)
  })

  test('une adresse non HTTPS est refusée avant toute écriture', () => {
    expect(() => instances().declarer('http://gitlab.exemple.org', 'client-sonal')).toThrow(
      ErreurInstanceGitLabOAuth,
    )
  })

  test('oublier une instance la retire du poste', () => {
    const registre = instances()
    registre.declarer('https://gitlab.exemple.org', 'client-sonal')
    registre.oublier('https://gitlab.exemple.org')
    expect(registre.connue('https://gitlab.exemple.org')).toBe(false)
  })
})

describe('service d’authentification GitLab', () => {
  interface Banc {
    service: ServiceAuthentificationGitLab
    coffre: CoffreComptes
    urlOuverte: string[]
  }

  function banc(
    port: number,
    jeton: unknown = JETON,
    chiffreurCoffre: Chiffreur = chiffreur,
  ): Banc {
    const dirProfil = mkdtempSync(join(tmpdir(), 'sonal-authentification-'))
    const coffre = new CoffreComptes(join(dirProfil, 'comptes-distant.json'), chiffreurCoffre)
    const instances = new InstancesGitLab(join(dirProfil, 'instances-gitlab.json'))
    instances.declarer('https://gitlab.example.org', 'client-sonal')
    const urlOuverte: string[] = []
    const fetchImpl = vi.fn(async (entree: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(entree))
      if (url.hostname === '127.0.0.1') {
        const autorisation = new URL(urlOuverte[urlOuverte.length - 1])
        return fetch(
          `http://127.0.0.1:${port}/callback?code=code-1&state=${autorisation.searchParams.get('state')}`,
          init,
        )
      }
      if (url.pathname === '/oauth/token') {
        return new Response(JSON.stringify(jeton), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.pathname === '/oauth/revoke') return new Response(null, { status: 200 })
      if (url.pathname === '/api/v4/user') {
        return new Response(JSON.stringify({ username: 'max' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ version: '18.0.0' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch
    const service = new ServiceAuthentificationGitLab({
      coffre,
      instances,
      ouvrirNavigateur: async (url) => {
        urlOuverte.push(url)
        // Le navigateur revient : il frappe la callback avec le state annoncé.
        const autorisation = new URL(url)
        await fetch(
          `http://127.0.0.1:${port}/callback?code=code-1&state=${autorisation.searchParams.get('state')}`,
        )
      },
      fetchImpl,
      portCallback: port,
    })
    return { service, coffre, urlOuverte }
  }

  async function portLibre(): Promise<number> {
    const { createServer } = await import('node:http')
    const sonde = createServer()
    await new Promise<void>((resolve) => sonde.listen(0, '127.0.0.1', () => resolve()))
    const port = (sonde.address() as { port: number }).port
    await new Promise<void>((resolve) => sonde.close(() => resolve()))
    return port
  }

  test('une connexion publie l’instance, le compte et l’URI de callback', async () => {
    const port = await portLibre()
    const { service, coffre, urlOuverte } = banc(port)

    const etat = await service.connecter('https://gitlab.example.org')

    expect(urlOuverte[0]).toContain('https://gitlab.example.org/oauth/authorize?')
    expect(urlOuverte[0]).toContain('client_id=client-sonal')
    expect(etat).toMatchObject({
      urlInstance: 'https://gitlab.example.org',
      applicationConnue: true,
      uriCallback: `http://127.0.0.1:${port}/callback`,
    })
    expect(etat.comptes).toEqual([{
      id: expect.any(String),
      urlInstance: 'https://gitlab.example.org',
      utilisateur: 'max',
      connecte: true,
      aRafraichir: false,
      scopes: ['api'],
    }])
    // Le secret reste dans le coffre chiffré, il ne figure pas dans l'état public.
    expect(JSON.stringify(etat)).not.toContain('access-secret')
    expect(coffre.credentialOAuthGitLab(etat.comptes[0].id)?.refreshToken).toBe('refresh-secret')
  })

  test('un credential en mémoire apparaît connecté sans stockage sécurisé', async () => {
    const { service, coffre } = banc(await portLibre(), JETON, chiffreurIndisponible)

    const etat = await service.connecter('https://gitlab.example.org')
    const compte = etat.comptes[0]

    expect(compte).toMatchObject({ utilisateur: 'max', connecte: true, scopes: ['api'] })
    expect(coffre.listerComptesGitLab()[0].oauth).toBeUndefined()
    await expect(service.client(compte.id)).resolves.toBeDefined()
  })

  test('un client_id saisi au moment de la connexion déclare l’instance', async () => {
    const port = await portLibre()
    const { service } = banc(port)

    const etat = await service.connecter(
      'https://nouveau.example.org',
      'client-de-lutilisateur',
    )

    expect(etat).toMatchObject({
      urlInstance: 'https://nouveau.example.org',
      applicationConnue: true,
    })
    expect(etat.comptes[0]).toMatchObject({ utilisateur: 'max', connecte: true })
  })

  test('un compte connecté puis déconnecté reste connu, sans credential', async () => {
    const { service } = banc(await portLibre())
    const connecte = await service.connecter('https://gitlab.example.org')
    const compte = connecte.comptes[0]

    const deconnecte = await service.deconnecter(
      'https://gitlab.example.org',
      compte.utilisateur,
    )

    expect(deconnecte.comptes[0]).toMatchObject({ connecte: false, aRafraichir: false })
    expect(deconnecte.comptes[0].scopes).toEqual([])
    await expect(service.client(compte.id)).rejects.toThrow(/expiré ou a été révoquée/)
  })

  test('oublier un compte le retire, ses destinations restent au coffre', async () => {
    const { service, coffre } = banc(await portLibre())
    const connecte = await service.connecter('https://gitlab.example.org')
    const compte = connecte.comptes[0]
    coffre.enregistrerDestinationGitLab({
      compteId: compte.id,
      projetId: 42,
      nomProjet: 'Corpus pilote',
      branche: 'main',
    })

    service.oublierCompte('https://gitlab.example.org', compte.utilisateur)

    expect(service.etat('https://gitlab.example.org').comptes).toEqual([])
    expect(coffre.listerDestinationsGitLab()).toHaveLength(1)
  })

  test('le client d’un compte porte le credential à jour', async () => {
    const { service } = banc(await portLibre())
    const etat = await service.connecter('https://gitlab.example.org')
    const compte = etat.comptes[0]

    const client = await service.client(compte.id, 42)

    expect(await client.lireJson('/user')).toMatchObject({ corps: { username: 'max' } })
    expect(service.aConnecte(compte.id)).toBe(true)
    expect(service.aRafraichir(compte.id)).toBe(false)
  })

  test('un compte inconnu ou une instance inconnue sont refusés clairement', async () => {
    const { service } = banc(await portLibre())
    await expect(service.client('compte-inexistant')).rejects.toThrow(/Compte GitLab inconnu/)
    expect(() => service.comptePublic('compte-inexistant')).toThrow(/Compte GitLab inconnu/)
    await expect(service.deconnecter('https://gitlab.example.org', 'inconnu')).rejects.toThrow(
      /Compte GitLab inconnu/,
    )
  })

  test('un échange refusé ne laisse aucun compte connecté', async () => {
    const { service, coffre } = banc(await portLibre(), { error: 'invalid_grant' })

    await expect(service.connecter('https://gitlab.example.org')).rejects.toThrow()

    expect(service.etat('https://gitlab.example.org').comptes).toEqual([])
    expect(coffre.listerComptesGitLab()).toEqual([])
  })

  test('le coffre ne conserve aucun jeton d’accès personnel', async () => {
    const { service, coffre } = banc(await portLibre())
    await service.connecter('https://gitlab.example.org')

    const compte = coffre.listerComptesGitLab()[0]
    expect(compte).not.toHaveProperty('jetonChiffre')
    expect(coffre).not.toHaveProperty('jetonGitLab')
  })
})
