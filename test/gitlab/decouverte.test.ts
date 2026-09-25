import { describe, expect, it, vi } from 'vitest'
import { DecouverteGitLab } from '../../src/main/gitlab/decouverte'

interface Appel {
  url: URL
  jeton: string | null
  methode: string | undefined
}

function reponse(corps: unknown, nextPage?: string): Response {
  return new Response(JSON.stringify(corps), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...(nextPage ? { 'x-next-page': nextPage } : {}),
    },
  })
}

function projet(id: number, nom = `Projet ${id}`): Record<string, unknown> {
  return {
    id,
    name: nom,
    path_with_namespace: `groupe/${nom.toLowerCase().replaceAll(' ', '-')}`,
    default_branch: 'main',
    archived: false,
  }
}

describe('découverte GitLab', () => {
  it('liste les projets accessibles par pages sans exposer le jeton', async () => {
    const appels: Appel[] = []
    const fetchImpl = vi.fn(async (entree: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(entree))
      appels.push({
        url,
        jeton: new Headers(init?.headers).get('PRIVATE-TOKEN'),
        methode: init?.method,
      })
      const page = url.searchParams.get('page')
      return page === '1'
        ? reponse([projet(42), projet(84, 'Corpus-large')], '2')
        : reponse([projet(126, 'Archives')])
    }) as typeof fetch

    const resultat = await new DecouverteGitLab({
      urlInstance: 'https://gitlab.example.org/instance/',
      jeton: 'jeton-sensible',
      taillePage: 2,
      fetchImpl,
    }).listerProjets()

    expect(resultat).toEqual({
      tronque: false,
      elements: [
        {
          id: 42,
          nom: 'Projet 42',
          chemin: 'groupe/projet-42',
          brancheParDefaut: 'main',
          archive: false,
        },
        {
          id: 84,
          nom: 'Corpus-large',
          chemin: 'groupe/corpus-large',
          brancheParDefaut: 'main',
          archive: false,
        },
        {
          id: 126,
          nom: 'Archives',
          chemin: 'groupe/archives',
          brancheParDefaut: 'main',
          archive: false,
        },
      ],
    })
    expect(appels).toHaveLength(2)
    expect(appels.every(({ url }) =>
      url.pathname === '/instance/api/v4/projects' &&
      url.searchParams.get('membership') === 'true' &&
      url.searchParams.get('per_page') === '2')).toBe(true)
    expect(appels.every(({ jeton, methode }) => jeton === 'jeton-sensible' && methode === 'GET')).toBe(true)
  })

  it('interrompt la pagination et signale une liste tronquée', async () => {
    const pagesVues: string[] = []
    const fetchImpl = vi.fn(async (entree: string | URL | Request) => {
      const url = new URL(String(entree))
      const page = url.searchParams.get('page') ?? ''
      pagesVues.push(page)
      return reponse([projet(Number(page))], String(Number(page) + 1))
    }) as typeof fetch

    const resultat = await new DecouverteGitLab({
      urlInstance: 'https://gitlab.example.org',
      jeton: 'jeton',
      taillePage: 1,
      nombrePagesMax: 2,
      fetchImpl,
    }).listerProjets()

    expect(resultat.tronque).toBe(true)
    expect(resultat.elements).toHaveLength(2)
    expect(pagesVues).toEqual(['1', '2'])
  })

  it('liste les branches du projet sélectionné et conserve la branche par défaut', async () => {
    const fetchImpl = vi.fn(async (entree: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(entree))
      expect(url.pathname).toBe('/api/v4/projects/42/repository/branches')
      expect(url.searchParams.get('page')).toBe('1')
      expect(init?.method).toBe('GET')
      return reponse([
        { name: 'équipe/pilote', default: false },
        { name: 'main', default: true },
      ])
    }) as typeof fetch

    await expect(new DecouverteGitLab({
      urlInstance: 'https://gitlab.example.org',
      jeton: 'jeton',
      fetchImpl,
    }).listerBranches(42)).resolves.toEqual({
      tronque: false,
      elements: [
        { nom: 'équipe/pilote', parDefaut: false },
        { nom: 'main', parDefaut: true },
      ],
    })
  })

  it('refuse une réponse paginée malformée plutôt que d’inventer des choix', async () => {
    const fetchImpl = vi.fn(async () =>
      reponse([{ name: 'branche sans indicateur par défaut' }])) as typeof fetch

    await expect(new DecouverteGitLab({
      urlInstance: 'https://gitlab.example.org',
      jeton: 'jeton',
      fetchImpl,
    }).listerBranches(42)).rejects.toThrow('Branche GitLab invalide')
  })
})
