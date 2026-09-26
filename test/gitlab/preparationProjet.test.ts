import { describe, expect, it, vi } from 'vitest'
import type { ServiceAuthentificationGitLab } from '../../src/main/gitlab/authentification'
import { preparerProjetGitLab } from '../../src/main/gitlab/preparationProjet'

const URL_INSTANCE = 'https://gitlab.example.org'
const demande = { urlProjet: `${URL_INSTANCE}/groupe/corpus`, compteId: 'compte-1' }
const projet = { id: 42, name: 'Corpus', default_branch: 'terrain', archived: false }

function reponse(corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    headers: { 'Content-Type': 'application/json' },
  })
}

function transport(corpsProjet: unknown = projet) {
  return vi.fn(async (entree: string | URL | Request, _options?: RequestInit) =>
    reponse(corpsProjet))
}

/** Service d'authentification réduit à ce que la préparation lit. */
function authentificationFactice(
  fetchImpl: typeof fetch,
  urlInstance = URL_INSTANCE,
): ServiceAuthentificationGitLab {
  return {
    client: async () => {
      const { ClientGitLab, autorisationOAuth } = await import(
        '../../src/main/gitlab/client'
      )
      return new ClientGitLab(
        { urlInstance, autorisation: autorisationOAuth('access-oauth') },
        fetchImpl,
      )
    },
    comptePublic: () => ({
      id: demande.compteId,
      urlInstance,
      utilisateur: 'moi',
      connecte: true,
      aRafraichir: false,
      scopes: ['read_api'],
    }),
  } as unknown as ServiceAuthentificationGitLab
}

describe('préparation du projet GitLab', () => {
  it.each(['terrain', 'main', 'equipe/pilote'])('utilise la branche %s annoncée par le projet sans lister les branches', async (branche) => {
    const fetchImpl = transport({ ...projet, default_branch: branche })
    const resultat = await preparerProjetGitLab(
      demande,
      authentificationFactice(fetchImpl),
    )
    expect(resultat).toEqual({
      compteId: demande.compteId,
      urlInstance: URL_INSTANCE,
      utilisateur: 'moi',
      projetId: 42,
      nomProjet: 'Corpus',
      branche,
    })
    expect(fetchImpl.mock.calls.map(([url]) => new URL(String(url)).pathname))
      .toEqual([`/api/v4/projects/groupe%2Fcorpus`])
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options?.method).toBe('GET')
      expect(options?.redirect).toBe('error')
      expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer access-oauth')
    }
  })

  it('accepte les sous-groupes, le suffixe .git et les espaces autour de l’adresse', async () => {
    const fetchImpl = transport()
    await preparerProjetGitLab({
      ...demande, urlProjet: `  ${URL_INSTANCE}/groupe/equipe/corpus.git/  `,
    }, authentificationFactice(fetchImpl))
    expect(String(fetchImpl.mock.calls[0][0]))
      .toBe(`${URL_INSTANCE}/api/v4/projects/groupe%2Fequipe%2Fcorpus`)
  })

  it.each(['http://localhost:8929', 'http://127.0.0.1:8929'])('accepte le banc local %s', async (url) => {
    await expect(preparerProjetGitLab(
      { ...demande, urlProjet: `${url}/groupe/corpus` },
      authentificationFactice(transport(), url),
    )).resolves.toMatchObject({ projetId: 42 })
  })

  it.each([
    'http://gitlab.example.org/groupe/corpus',
    'ftp://localhost/groupe/corpus',
    'https://gitlab.example.org/corpus',
    'https://gitlab.example.org/groupe/../corpus',
  ])('refuse l’adresse %s avant tout appel réseau', async (urlProjet) => {
    const fetchImpl = transport()
    await expect(preparerProjetGitLab(
      { ...demande, urlProjet },
      authentificationFactice(fetchImpl),
    )).rejects.toThrow('Adresse du projet GitLab invalide')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuse un projet hébergé sur une autre instance que celle du compte', async () => {
    const fetchImpl = transport()
    await expect(preparerProjetGitLab(
      { ...demande, urlProjet: 'https://autre.example.org/groupe/corpus' },
      authentificationFactice(fetchImpl),
    )).rejects.toThrow('n’est pas sur l’instance GitLab du compte connecté')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuse un projet archivé ou sans branche par défaut', async () => {
    await expect(preparerProjetGitLab(
      demande,
      authentificationFactice(transport({ ...projet, archived: true })),
    )).rejects.toThrow('archivé')
    await expect(preparerProjetGitLab(
      demande,
      authentificationFactice(transport({ ...projet, default_branch: null })),
    )).rejects.toThrow('branche par défaut')
  })

  it('refuse une réponse de projet illisible', async () => {
    await expect(preparerProjetGitLab(
      demande,
      authentificationFactice(transport({ id: 'x', name: 'Corpus' })),
    )).rejects.toThrow('Projet GitLab invalide')
  })
})
