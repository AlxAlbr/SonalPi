/**
 *  Flux OAuth GitLab : preuves PKCE, échange, refus et non-fuite de secret.
 *  La callback loopback est réellement écoutée : seul le navigateur est simulé.
 */

import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, test, vi } from 'vitest'
import { CallbackLoopbackOAuth, ErreurCallbackOAuth } from '../../src/main/gitlab/oauth/callbackLoopback'
import { ClientOAuthGitLab, ErreurOAuthGitLab } from '../../src/main/gitlab/oauth/clientOAuth'
import { connecterGitLabOAuth } from '../../src/main/gitlab/oauth/connexion'
import {
  credentialDepuisReponse,
  credentialExpire,
  type CredentialOAuthGitLab,
} from '../../src/main/gitlab/oauth/credential'
import type { InstanceGitLabOAuth } from '../../src/main/gitlab/oauth/instances'
import { challengeS256, etatValide, nouvelEtat, nouveauVerifierCode } from '../../src/main/gitlab/oauth/pkce'

const INSTANCE: InstanceGitLabOAuth = {
  urlInstance: 'https://gitlab.example.org',
  clientId: 'client-sonal-public',
  scopes: 'api',
  portCallback: 0,
  cheminCallback: '/callback',
}

async function portLibre(): Promise<number> {
  const sonde = createServer()
  await new Promise<void>((resolve) => sonde.listen(0, '127.0.0.1', () => resolve()))
  const port = (sonde.address() as AddressInfo).port
  await new Promise<void>((resolve) => sonde.close(() => resolve()))
  return port
}

interface Echange {
  url: string
  corps: URLSearchParams
}

interface InstanceFausse {
  instance: InstanceGitLabOAuth
  fetchImpl: typeof fetch
  echanges: Echange[]
}

function instanceFausse(port: number, jeton?: Record<string, unknown>): InstanceFausse {
  const echanges: Echange[] = []
  const fetchImpl = vi.fn(async (entree: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entree))
    if (url.hostname === '127.0.0.1') return fetch(entree, init)
    const chemin = url.pathname
    if (chemin === '/oauth/token') {
      const corps = new URLSearchParams(String(init?.body ?? ''))
      echanges.push({ url: String(entree), corps })
      if (jeton === undefined) {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
      }
      return new Response(JSON.stringify(jeton), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (chemin === '/api/v4/user') {
      return new Response(JSON.stringify({ username: 'max' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(null, { status: 404 })
  }) as unknown as typeof fetch
  return { instance: { ...INSTANCE, portCallback: port }, fetchImpl, echanges }
}

const jetonValide = {
  access_token: 'access-secret',
  refresh_token: 'refresh-secret',
  token_type: 'bearer',
  expires_in: 7200,
  scope: 'api read_repository',
  created_at: 1_700_000_000,
}

describe('preuves PKCE', () => {
  test('le challenge est bien le S256 du verifier', () => {
    const verifier = nouveauVerifierCode()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(challengeS256(verifier))
      .toBe(createHash('sha256').update(verifier, 'ascii').digest('base64url'))
  })

  test('un state correct est reconnu, un autre jamais', () => {
    const etat = nouvelEtat()
    expect(etatValide(etat, etat)).toBe(true)
    expect(etatValide(etat, `${etat}x`)).toBe(false)
    expect(etatValide(etat, etat.slice(1))).toBe(false)
    expect(etatValide(etat, null)).toBe(false)
  })
})

describe('credential OAuth', () => {
  test('lit la réponse de jeton et refuse un échange sans refresh token', () => {
    const credential = credentialDepuisReponse(jetonValide, 1_000)
    expect(credential).toMatchObject({
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      expiresAt: 1_000 + 7_200_000,
      scopes: ['api', 'read_repository'],
    })
    expect(() => credentialDepuisReponse({ access_token: 'seul' })).toThrow(
      /jeton exploitable/,
    )
  })

  test('un token proche de l’échéance est déjà considéré comme périmé', () => {
    const credential = credentialDepuisReponse(jetonValide, 0)
    expect(credentialExpire(credential, 0)).toBe(false)
    expect(credentialExpire(credential, 7_200_000 - 30_000)).toBe(true)
  })
})

describe('client OAuth GitLab', () => {
  test('échange le code sans secret client et avec le verifier', async () => {
    const port = await portLibre()
    const { instance, fetchImpl, echanges } = instanceFausse(port, jetonValide)
    const client = new ClientOAuthGitLab(instance, fetchImpl)

    const credential = await client.echangerCode('code-1', 'verifier-1')

    expect(credential.accessToken).toBe('access-secret')
    expect(echanges[0].url).toBe('https://gitlab.example.org/oauth/token')
    expect(echanges[0].corps.get('grant_type')).toBe('authorization_code')
    expect(echanges[0].corps.get('code')).toBe('code-1')
    expect(echanges[0].corps.get('code_verifier')).toBe('verifier-1')
    expect(echanges[0].corps.get('client_id')).toBe('client-sonal-public')
    expect(echanges[0].corps.get('redirect_uri'))
      .toBe(`http://127.0.0.1:${port}/callback`)
    expect(echanges[0].corps.has('client_secret')).toBe(false)
  })

  test('un renouvellement remplace les deux tokens', async () => {
    const { instance, fetchImpl, echanges } = instanceFausse(await portLibre(), {
      ...jetonValide,
      access_token: 'access-roté',
      refresh_token: 'refresh-roté',
    })
    const client = new ClientOAuthGitLab(instance, fetchImpl)

    const credential = await client.rafraichir('refresh-secret')

    expect(echanges[0].corps.get('grant_type')).toBe('refresh_token')
    expect(credential).toMatchObject({
      accessToken: 'access-roté',
      refreshToken: 'refresh-roté',
    })
  })

  test('un refus d’instance devient un message lisible, sans secret ni corps reçu', async () => {
    const { instance, fetchImpl } = instanceFausse(await portLibre())
    const client = new ClientOAuthGitLab(instance, fetchImpl)

    const erreur = await client.echangerCode('code-1', 'verifier-1').catch((e) => e)

    expect(erreur).toBeInstanceOf(ErreurOAuthGitLab)
    expect(erreur.raison).toBe('refus-instance')
    expect(erreur.message).toMatch(/expiré|utilisé/)
    expect(erreur.message).not.toContain('code-1')
  })

  test('une instance injoignable est un problème réseau, pas un refus', async () => {
    const client = new ClientOAuthGitLab(
      { ...INSTANCE, portCallback: 1 },
      () => Promise.reject(new Error('ECONNREFUSED')),
    )

    const erreur = await client.echangerCode('code-1', 'verifier-1').catch((e) => e)

    expect(erreur.raison).toBe('reseau')
    expect(erreur.message).not.toContain('ECONNREFUSED')
  })
})

describe('callback loopback', () => {
  test('accepte le code une fois, puis ferme l’écoute', async () => {
    const port = await portLibre()
    const etat = nouvelEtat()
    const callback = new CallbackLoopbackOAuth({ port, chemin: '/callback' }, etat)
    await callback.demarrer()
    const attente = callback.attendre()

    const reponse = await fetch(
      `http://127.0.0.1:${port}/callback?code=code-1&state=${etat}`,
    )

    expect(reponse.status).toBe(200)
    await expect(attente).resolves.toEqual({ code: 'code-1' })
    // L'écoute est levée : plus rien n'accepte de code.
    await expect(
      fetch(`http://127.0.0.1:${port}/callback?code=code-2&state=${etat}`),
    ).rejects.toThrow()
  })

  test('un chemin étranger est ignoré sans toucher à la tentative', async () => {
    const port = await portLibre()
    const etat = nouvelEtat()
    const callback = new CallbackLoopbackOAuth({ port, chemin: '/callback' }, etat)
    await callback.demarrer()
    const attente = callback.attendre()

    expect((await fetch(`http://127.0.0.1:${port}/favicon.ico`)).status).toBe(404)
    const reponse = await fetch(`http://127.0.0.1:${port}/callback?code=code-1&state=${etat}`)
    await expect(attente).resolves.toEqual({ code: 'code-1' })
    expect(reponse.status).toBe(200)
  })

  test('un state invalide n’est jamais échangé, et abandonne après plusieurs essais', async () => {
    const port = await portLibre()
    const etat = nouvelEtat()
    const callback = new CallbackLoopbackOAuth(
      { port, chemin: '/callback', tentativesMax: 2 },
      etat,
    )
    await callback.demarrer()
    const fin = callback.attendre().catch((e: ErreurCallbackOAuth) => e)

    for (let essai = 0; essai < 2; essai += 1) {
      const reponse = await fetch(
        `http://127.0.0.1:${port}/callback?code=code-faux&state=etat-faux`,
      )
      expect(reponse.status).toBe(400)
    }

    await expect(fin).resolves.toMatchObject({ raison: 'etat-invalide' })
  })

  test('un refus de consentement ne crée aucun token', async () => {
    const port = await portLibre()
    const etat = nouvelEtat()
    const callback = new CallbackLoopbackOAuth({ port, chemin: '/callback' }, etat)
    await callback.demarrer()
    const fin = callback.attendre().catch((e: ErreurCallbackOAuth) => e)

    await fetch(`http://127.0.0.1:${port}/callback?error=access_denied&state=${etat}`)

    const erreur = await fin
    expect(erreur.raison).toBe('refus-utilisateur')
  })

  test('un port déjà occupé est signalé sans trace technique', async () => {
    const port = await portLibre()
    const occupant = createServer()
    await new Promise<void>((resolve) => occupant.listen(port, '127.0.0.1', () => resolve()))
    const callback = new CallbackLoopbackOAuth({ port, chemin: '/callback' }, nouvelEtat())
    try {
      const erreur = await callback.demarrer().catch((e: ErreurCallbackOAuth) => e)
      expect(erreur.raison).toBe('port-indisponible')
      expect(erreur.message).toMatch(/port/i)
      expect(erreur.message).not.toContain('EADDRINUSE')
    } finally {
      await new Promise<void>((resolve) => occupant.close(() => resolve()))
    }
  })

  test('le délai dépassé referme la tentative', async () => {
    const port = await portLibre()
    const callback = new CallbackLoopbackOAuth(
      { port, chemin: '/callback', delaiMs: 40 },
      nouvelEtat(),
    )
    await callback.demarrer()
    const fin = callback.attendre().catch((e: ErreurCallbackOAuth) => e)

    await expect(fin).resolves.toMatchObject({ raison: 'delai-depasse' })
  })
})

describe('connexion OAuth de bout en bout', () => {
  test('le code reçu est échangé avec le verifier du challenge annoncé', async () => {
    const port = await portLibre()
    const { instance, fetchImpl, echanges } = instanceFausse(port, jetonValide)
    let challengeAnnonce = ''

    const connexion = await connecterGitLabOAuth({
      instance,
      ouvrirNavigateur: async (url) => {
        const autorisation = new URL(url)
        challengeAnnonce = autorisation.searchParams.get('code_challenge') ?? ''
        await fetch(
          `http://127.0.0.1:${port}/callback?code=code-1&state=${autorisation.searchParams.get('state')}`,
        )
      },
      fetchImpl,
      portCallback: port,
    })

    // Le verifier présenté à l'instance correspond au challenge annoncé.
    const verifier = echanges[0].corps.get('code_verifier') ?? ''
    expect(challengeS256(verifier)).toBe(challengeAnnonce)
    expect(challengeAnnonce).not.toBe('')
    expect(connexion.utilisateur).toBe('max')
    expect(connexion.credential.accessToken).toBe('access-secret')
    expect(echanges[0].corps.get('redirect_uri')).toBe(`http://127.0.0.1:${port}/callback`)
  })

  test('deux connexions simultanées : la seconde est refusée', async () => {
    const port = await portLibre()
    const { instance, fetchImpl } = instanceFausse(port, jetonValide)
    let navigateur: (() => void) | null = null
    const attendreNavigateur = new Promise<void>((resolve) => {
      navigateur = resolve
    })
    const ouvrirNavigateur = async (url: string): Promise<void> => {
      const autorisation = new URL(url)
      await attendreNavigateur
      await fetch(
        `http://127.0.0.1:${port}/callback?code=code-1&state=${autorisation.searchParams.get('state')}`,
      )
    }

    const premiere = connecterGitLabOAuth({
      instance,
      ouvrirNavigateur,
      fetchImpl,
      portCallback: port,
    })
    const seconde = connecterGitLabOAuth({
      instance,
      ouvrirNavigateur,
      fetchImpl,
      portCallback: port,
    })

    const erreur = await seconde.catch((e: ErreurCallbackOAuth) => e)
    expect(erreur).toBeInstanceOf(ErreurCallbackOAuth)
    expect(erreur.raison).toBe('connexion-concurrente')
    navigateur?.()
    await expect(premiere).resolves.toMatchObject({ utilisateur: 'max' })
  })
})
