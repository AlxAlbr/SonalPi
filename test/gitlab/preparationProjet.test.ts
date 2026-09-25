import { describe, expect, it, vi } from 'vitest'
import { preparerProjetGitLab } from '../../src/main/gitlab/preparationProjet'

const demande = { urlProjet: 'https://gitlab.example.org/groupe/corpus', jeton: 'jeton-sensible' }
const projet = { id: 42, name: 'Corpus', default_branch: 'terrain', archived: false }

function reponse(corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    headers: { 'Content-Type': 'application/json' },
  })
}

function transport(corpsProjet: unknown = projet, utilisateur: unknown = { username: 'moi' }) {
  return vi.fn(async (entree: string | URL | Request, _options?: RequestInit) => {
    const url = new URL(String(entree))
    return reponse(url.pathname === '/api/v4/user' ? utilisateur : corpsProjet)
  })
}

describe('préparation du projet GitLab', () => {
  it.each(['terrain', 'main', 'equipe/pilote'])('utilise la branche %s annoncée par le projet sans lister les branches', async (branche) => {
    const fetchImpl = transport({ ...projet, default_branch: branche })
    const resultat = await preparerProjetGitLab(demande, fetchImpl)
    expect(resultat).toEqual({
      urlInstance: 'https://gitlab.example.org',
      utilisateur: 'moi',
      projetId: 42,
      nomProjet: 'Corpus',
      branche,
    })
    expect(resultat).not.toHaveProperty('jeton')
    expect(fetchImpl.mock.calls.map(([url]) => new URL(String(url)).pathname))
      .toEqual(['/api/v4/projects/groupe%2Fcorpus', '/api/v4/user'])
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options?.method).toBe('GET')
      expect(options?.redirect).toBe('error')
      expect(new Headers(options?.headers).get('PRIVATE-TOKEN')).toBe(demande.jeton)
    }
  })

  it('accepte les sous-groupes, le suffixe .git et les espaces autour de l’adresse', async () => {
    const fetchImpl = transport()
    await preparerProjetGitLab({
      ...demande, urlProjet: '  https://gitlab.example.org/groupe/equipe/corpus.git/  ',
    }, fetchImpl)
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://gitlab.example.org/api/v4/projects/groupe%2Fequipe%2Fcorpus')
  })

  it.each(['http://localhost:8929', 'http://127.0.0.1:8929'])('accepte le banc local %s', async (url) => {
    await expect(preparerProjetGitLab({ ...demande, urlProjet: `${url}/groupe/corpus` }, transport()))
      .resolves.toMatchObject({ urlInstance: url })
  })

  it.each([
    '', 'groupe/corpus', 'https://gitlab.example.org/',
    'https://gitlab.example.org/groupe',
    'https://gitlab.example.org/groupe//corpus',
    'https://gitlab.example.org/groupe/cor%2Fpus',
    'https://gitlab.example.org/groupe/cor%5Cpus',
    'https://gitlab.example.org/groupe/cor%pus',
    'https://gitlab.example.org/groupe/corpus/-/tree/main',
    'https://moi:secret@gitlab.example.org/groupe/corpus',
    'https://gitlab.example.org/groupe/corpus?jeton=secret',
    'https://gitlab.example.org/groupe/corpus#secret',
    'http://gitlab.example.org/groupe/corpus',
    'ftp://localhost/groupe/corpus',
  ])('refuse l’adresse %s avant tout appel réseau', async (urlProjet) => {
    const fetchImpl = transport()
    await expect(preparerProjetGitLab({ ...demande, urlProjet }, fetchImpl)).rejects.toThrow(/adresse/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([null, '', '   '])('refuse un dépôt sans branche par défaut (%s), sans supposer main', async (branche) => {
    const fetchImpl = transport({ ...projet, default_branch: branche })
    await expect(preparerProjetGitLab(demande, fetchImpl)).rejects.toThrow('Initialisez le dépôt')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('refuse un projet archivé', async () => {
    await expect(preparerProjetGitLab(demande, transport({ ...projet, archived: true })))
      .rejects.toThrow('archivé')
  })

  it.each([
    null, [], {}, { ...projet, id: 0 }, { ...projet, id: '42' },
    { ...projet, name: '' }, { ...projet, default_branch: 3 }, { ...projet, archived: 'false' },
  ])('refuse un projet malformé (%j)', async (corps) => {
    await expect(preparerProjetGitLab(demande, transport(corps))).rejects.toThrow('Projet GitLab invalide')
  })

  it.each([null, {}, { username: '' }, { username: 42 }])('refuse une identité malformée (%j)', async (utilisateur) => {
    await expect(preparerProjetGitLab(demande, transport(projet, utilisateur))).rejects.toThrow('Utilisateur GitLab invalide')
  })

  it.each([401, 403, 404])('propage le refus HTTP %s sans exposer le jeton ou la réponse serveur', async (status) => {
    const fetchImpl = vi.fn(async () => new Response(demande.jeton, { status }))
    try {
      await preparerProjetGitLab(demande, fetchImpl)
      expect.fail('La préparation devait échouer.')
    } catch (erreur) {
      expect(erreur).toMatchObject({ statut: status })
      expect((erreur as Error).message).not.toContain(demande.jeton)
      expect((erreur as Error).message).not.toContain('Initialisez')
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
