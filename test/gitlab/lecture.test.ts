import { describe, expect, test, vi } from 'vitest'
import {
  ClientGitLab,
  ErreurGitLab,
  type ConfigurationClientGitLab,
} from '../../src/main/gitlab/client'
import { LecteurGitLab } from '../../src/main/gitlab/lecture'

const SHA = '0123456789abcdef0123456789abcdef01234567'
const TOKEN = 'jeton-secret'

interface RequeteVue {
  url: URL
  init?: RequestInit
}

function reponseJson(valeur: unknown, entetes: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(valeur), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...entetes },
  })
}

function clientAvec(
  repondre: (requete: RequeteVue) => Promise<Response> | Response,
  configuration: Partial<ConfigurationClientGitLab> = {},
): { client: ClientGitLab; requetes: RequeteVue[] } {
  const requetes: RequeteVue[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const requete = { url: new URL(String(input)), init }
    requetes.push(requete)
    return repondre(requete)
  }) as unknown as typeof fetch
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

describe('lecture GitLab à commit fixé', () => {
  test('résout la branche une fois puis pagine toujours au même commit', async () => {
    const { client, requetes } = clientAvec(({ url }) => {
      if (url.pathname.includes('/repository/branches/')) {
        return reponseJson({ commit: { id: SHA } })
      }
      if (url.pathname.endsWith('/repository/tree')) {
        if (url.searchParams.get('path') === 'entretiens') {
          return reponseJson([
            {
              id: 'blob-e1',
              name: 'e1.json',
              type: 'blob',
              path: 'entretiens/e1.json',
              mode: '100644',
            },
          ])
        }
        if (url.searchParams.get('page') === '1') {
          return reponseJson([
            {
              id: 'blob-corpus',
              name: 'corpus.json',
              type: 'blob',
              path: 'corpus.json',
              mode: '100644',
            },
          ], { 'x-next-page': '2' })
        }
        return reponseJson([
          {
            id: 'arbre-entretiens',
            name: 'entretiens',
            type: 'tree',
            path: 'entretiens',
            mode: '040000',
          },
        ])
      }
      throw new Error(`Requête inattendue : ${url}.`)
    })

    const lecteur = await LecteurGitLab.depuisBranche(client, 'équipe/pilote')
    const inventaire = await lecteur.inventorier('')
    const entretiens = await lecteur.inventorier('entretiens')

    expect(lecteur.commit).toBe(SHA)
    expect(inventaire).toEqual([
      {
        chemin: 'corpus.json',
        dossier: false,
        empreinte: { type: 'gitlab-blob', valeur: 'blob-corpus' },
      },
      { chemin: 'entretiens', dossier: true, empreinte: null },
    ])
    expect(entretiens).toEqual([{
      chemin: 'e1.json',
      dossier: false,
      empreinte: { type: 'gitlab-blob', valeur: 'blob-e1' },
    }])
    expect(requetes[0].url.pathname).toContain('/branches/%C3%A9quipe%2Fpilote')
    for (const requete of requetes.slice(1)) {
      expect(requete.url.searchParams.get('ref')).toBe(SHA)
      expect(requete.url.searchParams.get('recursive')).toBe('false')
    }
    expect(requetes.every((requete) => !requete.url.toString().includes(TOKEN))).toBe(true)
    expect(new Headers(requetes[0].init?.headers).get('PRIVATE-TOKEN')).toBe(TOKEN)
  })

  test('lit le texte brut au commit fixé sans suivre la branche', async () => {
    const { client, requetes } = clientAvec(() =>
      new Response('{"formatVersion":3}', { status: 200 }))
    const lecteur = new LecteurGitLab(client, SHA)

    await expect(lecteur.lireTexte('entretiens/e1.json'))
      .resolves.toBe('{"formatVersion":3}')

    expect(requetes[0].url.pathname).toContain(
      '/repository/files/entretiens%2Fe1.json/raw',
    )
    expect(requetes[0].url.searchParams.get('ref')).toBe(SHA)
  })

  test.each([
    ['lien symbolique', 'blob', '120000'],
    ['sous-module', 'commit', '160000'],
  ] as const)('refuse un %s dans le corpus', async (_libelle, type, mode) => {
    const { client } = clientAvec(() => reponseJson([
      {
        id: 'objet-interdit',
        name: 'interdit',
        type,
        path: 'interdit',
        mode,
      },
    ]))
    const lecteur = new LecteurGitLab(client, SHA)

    await expect(lecteur.inventorier('')).rejects.toThrow(/non supporté/)
  })

  test('refuse les chemins ambigus avant tout appel réseau', async () => {
    const { client, requetes } = clientAvec(() => reponseJson([]))
    const lecteur = new LecteurGitLab(client, SHA)

    await expect(lecteur.lireTexte('../secret.json')).rejects.toThrow('invalide')
    await expect(lecteur.inventorier('entretiens//anciens')).rejects.toThrow('invalide')
    expect(requetes).toEqual([])
  })

  test('expose un refus typé sans inclure le jeton dans le diagnostic', async () => {
    const { client } = clientAvec(() => new Response('accès refusé', { status: 403 }))
    const lecteur = new LecteurGitLab(client, SHA)

    const erreur = await lecteur.lireTexte('corpus.json').catch((cause) => cause)
    expect(erreur).toBeInstanceOf(ErreurGitLab)
    expect(erreur.statut).toBe(403)
    expect(erreur.message).toContain('droits')
    expect(erreur.message).not.toContain(TOKEN)
    expect(erreur.message).not.toContain('accès refusé')
  })

  test('ne confond pas une ressource absente avec un projet vide', async () => {
    const { client } = clientAvec(() => new Response(null, { status: 404 }))

    await expect(client.lireTexte('/introuvable')).rejects.toMatchObject({
      statut: 404,
      message: expect.stringContaining('Vérifiez le projet et la branche'),
    })
  })

  test('relance un 429 en lecture dans une limite explicite', async () => {
    let appels = 0
    const attentes: number[] = []
    const { client } = clientAvec(() => {
      appels += 1
      return appels < 3
        ? new Response(null, { status: 429, headers: { 'Retry-After': '1' } })
        : new Response('contenu', { status: 200 })
    }, {
      nombreRelances429: 2,
      attendre: async (delai) => { attentes.push(delai) },
    })

    await expect(client.lireTexte('/lecture')).resolves.toBe('contenu')
    expect(appels).toBe(3)
    expect(attentes).toEqual([1_000, 1_000])
  })

  test('cesse les relances 429 après la limite configurée', async () => {
    let appels = 0
    const { client } = clientAvec(() => {
      appels += 1
      return new Response(null, { status: 429 })
    }, {
      nombreRelances429: 1,
      attendre: async () => undefined,
    })

    await expect(client.lireTexte('/lecture')).rejects.toMatchObject({ statut: 429 })
    expect(appels).toBe(2)
  })

  test('refuse une réponse dépassant la limite sans exposer son contenu', async () => {
    const secret = 'contenu-sensible'
    const { client } = clientAvec(() => new Response(secret), {
      tailleMaxReponseOctets: 4,
    })

    const erreur = await client.lireTexte('/lecture').catch((cause) => cause)
    expect(erreur.message).toContain('trop volumineuse')
    expect(erreur.message).not.toContain(secret)
  })

  test('propage une annulation au transport', async () => {
    let signalRecu: AbortSignal | null = null
    const { client } = clientAvec(({ init }) => new Promise<Response>((_resolve, reject) => {
      signalRecu = init?.signal as AbortSignal
      signalRecu.addEventListener('abort', () => reject(signalRecu?.reason), { once: true })
    }))
    const controleur = new AbortController()
    const lecture = client.lireTexte('/lecture', undefined, { signal: controleur.signal })

    controleur.abort(new Error('annulation demandée'))

    await expect(lecture).rejects.toThrow('annulation demandée')
    expect(signalRecu?.aborted).toBe(true)
  })
})
