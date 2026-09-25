import { describe, expect, test, vi } from 'vitest'
import {
  ClientGitLab,
  ErreurEcritureGitLab,
  type ConfigurationClientGitLab,
} from '../../src/main/gitlab/client'

const TOKEN = 'jeton-ecriture-secret'

interface RequeteVue {
  url: URL
  init?: RequestInit
}

function clientAvec(
  repondre: (requete: RequeteVue) => Promise<Response> | Response,
  configuration: Partial<ConfigurationClientGitLab> = {},
): { client: ClientGitLab; requetes: RequeteVue[] } {
  const requetes: RequeteVue[] = []
  const fetchImpl = vi.fn(async (entree: string | URL | Request, init?: RequestInit) => {
    const requete = { url: new URL(String(entree)), init }
    requetes.push(requete)
    return repondre(requete)
  }) as typeof fetch
  return {
    client: new ClientGitLab({
      urlInstance: 'https://gitlab.example.org/instance/',
      projetId: 42,
      jeton: TOKEN,
      ...configuration,
    }, fetchImpl),
    requetes,
  }
}

describe('écriture GitLab', () => {
  test('envoie une mutation JSON bornée sans mettre le jeton dans l’URL', async () => {
    const { client, requetes } = clientAvec(() => new Response(
      JSON.stringify({ id: 'commit-1' }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    ))
    const corps = {
      branch: 'main',
      commit_message: 'Sonal operation-1',
      actions: [{ action: 'create', file_path: 'verrous/e1.json', content: '{}' }],
    }

    await expect(client.ecrireJson<{ id: string }>(
      client.cheminProjet('/repository/commits'),
      corps,
    )).resolves.toMatchObject({ corps: { id: 'commit-1' } })

    expect(requetes).toHaveLength(1)
    expect(requetes[0].url.pathname).toBe('/instance/api/v4/projects/42/repository/commits')
    expect(requetes[0].url.toString()).not.toContain(TOKEN)
    expect(requetes[0].init?.method).toBe('POST')
    expect(requetes[0].init?.redirect).toBe('error')
    expect(requetes[0].init?.body).toBe(JSON.stringify(corps))
    const entetes = new Headers(requetes[0].init?.headers)
    expect(entetes.get('PRIVATE-TOKEN')).toBe(TOKEN)
    expect(entetes.get('Content-Type')).toBe('application/json')
  })

  test('ne relance jamais automatiquement une mutation 429', async () => {
    const { client, requetes } = clientAvec(() => new Response(null, { status: 429 }))

    const erreur = await client.ecrireJson('/mutation', {}).catch((cause) => cause)

    expect(erreur).toBeInstanceOf(ErreurEcritureGitLab)
    expect(erreur).toMatchObject({ statut: 429 })
    expect(erreur.message).toContain('Aucune relance automatique')
    expect(requetes).toHaveLength(1)
  })

  test('refuse une requête trop volumineuse avant tout appel réseau', async () => {
    const { client, requetes } = clientAvec(
      () => new Response('{}', { status: 201 }),
      { tailleMaxRequeteOctets: 16 },
    )

    await expect(client.ecrireJson('/mutation', {
      contenu: 'x'.repeat(100),
    })).rejects.toThrow('trop volumineuse')
    expect(requetes).toEqual([])
  })

  test('expurge le corps serveur d’un refus', async () => {
    const { client } = clientAvec(() => new Response(
      'secret de diagnostic serveur',
      { status: 400 },
    ))

    const erreur = await client.ecrireJson('/mutation', {}).catch((cause) => cause)

    expect(erreur).toBeInstanceOf(ErreurEcritureGitLab)
    expect(erreur.message).toContain('garde')
    expect(erreur.message).not.toContain('secret de diagnostic')
    expect(erreur.message).not.toContain(TOKEN)
  })

  test('propage une annulation au transport', async () => {
    let signalRecu: AbortSignal | null = null
    const { client } = clientAvec(({ init }) => new Promise<Response>((_resolve, reject) => {
      signalRecu = init?.signal as AbortSignal
      signalRecu.addEventListener('abort', () => reject(signalRecu?.reason), { once: true })
    }))
    const controleur = new AbortController()
    const mutation = client.ecrireJson('/mutation', {}, { signal: controleur.signal })

    controleur.abort(new Error('annulation d’écriture'))

    await expect(mutation).rejects.toThrow('annulation d’écriture')
    expect(signalRecu?.aborted).toBe(true)
  })
})
