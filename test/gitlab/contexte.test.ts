import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { ClientGitLab } from '../../src/main/gitlab/client'
import { preparerContexteGitLabLectureSeule } from '../../src/main/gitlab/contexte'
import {
  corpusDistantValide,
  entretienDistantValide,
} from '../webdav/fixturesCorpusDistant'

const SHA_1 = '1111111111111111111111111111111111111111'
const SHA_2 = '2222222222222222222222222222222222222222'

function reponseJson(valeur: unknown): Response {
  return new Response(JSON.stringify(valeur), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('contexte GitLab en lecture seule', () => {
  test('résout un nouveau commit à chaque tirage sans aucune écriture serveur', async () => {
    let tete = SHA_1
    const requetes: { url: URL; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (
      entree: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(String(entree))
      requetes.push({ url, init })
      if (url.pathname.includes('/repository/branches/')) {
        return reponseJson({ commit: { id: tete } })
      }
      if (url.pathname.endsWith('/repository/tree')) {
        const ref = url.searchParams.get('ref')
        const suffixe = ref === SHA_1 ? '1' : '2'
        if (url.searchParams.get('path') === 'donnees') {
          return reponseJson([
            {
              id: `corpus-${suffixe}`,
              name: 'corpus.json',
              type: 'blob',
              path: 'donnees/corpus.json',
              mode: '100644',
            },
            {
              id: `entretiens-${suffixe}`,
              name: 'entretiens',
              type: 'tree',
              path: 'donnees/entretiens',
              mode: '040000',
            },
          ])
        }
        return reponseJson([{
          id: `e1-${suffixe}`,
          name: 'e1.json',
          type: 'blob',
          path: 'donnees/entretiens/e1.json',
          mode: '100644',
        }])
      }
      if (url.pathname.includes('/repository/files/')) {
        const chemin = decodeURIComponent(url.pathname)
        if (chemin.includes('/donnees/corpus.json/raw')) {
          return new Response(corpusDistantValide(['e1']))
        }
        const texte = url.searchParams.get('ref') === SHA_1 ? 'première version' : 'seconde version'
        return new Response(entretienDistantValide({ texte }))
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch
    const client = new ClientGitLab({
      urlInstance: 'https://gitlab.example.org',
      projetId: 42,
      jeton: 'secret',
    }, fetchImpl)

    const preparation = await preparerContexteGitLabLectureSeule({
      id: 'gitlab:42:main:donnees',
      dirLocal: mkdtempSync(join(tmpdir(), 'sonal-gitlab-contexte-')),
      client,
      branche: 'main',
      racine: 'donnees',
    })

    expect(preparation.corpus.membership).toHaveProperty('e1')
    expect(preparation.contexte.store.lectureSeule).toBe(true)
    expect(preparation.contexte.store.lireEntretien('e1')).toMatchObject({
      ok: true,
      data: { texte: 'première version' },
    })
    const finPremierTirage = requetes.length
    expect(requetes.slice(1).every(({ url }) =>
      url.searchParams.get('ref') === SHA_1)).toBe(true)

    tete = SHA_2
    await expect(preparation.contexte.actualiser()).resolves.toMatchObject({
      telecharges: ['corpus.json', 'entretiens/e1.json'],
      verrous: [],
    })
    expect(preparation.contexte.store.lireEntretien('e1')).toMatchObject({
      ok: true,
      data: { texte: 'seconde version' },
    })
    expect(requetes.slice(finPremierTirage + 1).every(({ url }) =>
      url.searchParams.get('ref') === SHA_2)).toBe(true)
    expect(requetes.every(({ init }) => init?.method === 'GET')).toBe(true)

    await preparation.contexte.fermer()
    await expect(preparation.contexte.actualiser()).rejects.toThrow('fermé')
  })
})
