import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { assemblerSessionGitLab } from '../../src/main/gitlab/assemblageSession'
import { ClientGitLab } from '../../src/main/gitlab/client'

const racine = mkdtempSync(join(tmpdir(), 'sonal-assemblage-gitlab-'))

afterEach(() => {
  rmSync(racine, { recursive: true, force: true })
})

describe('assemblage de session GitLab', () => {
  test('sépare le chemin local de la racine GitLab configurée', async () => {
    const requetes: string[] = []
    const corps: Array<Record<string, unknown>> = []
    const fetchImpl = vi.fn(async (
      entree: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(String(entree))
      requetes.push(`${url.pathname}?${url.searchParams.toString()}`)
      if (init?.body) corps.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      if (url.pathname.endsWith('/repository/commits') && url.searchParams.has('ref_name')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.pathname.endsWith('/repository/commits')) {
        return new Response(JSON.stringify({ id: '1'.repeat(40) }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (decodeURIComponent(url.pathname).endsWith(
        '/repository/files/donnees/entretiens/e1.json',
      )) {
        return new Response(JSON.stringify({
          file_path: 'donnees/entretiens/e1.json',
          content: Buffer.from('{"formatVersion":8}').toString('base64'),
          encoding: 'base64',
          last_commit_id: '2'.repeat(40),
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch
    const client = new ClientGitLab({
      urlInstance: 'https://gitlab.example.org',
      projetId: 42,
      jeton: 'secret',
    }, fetchImpl)
    const dirJournal = join(racine, 'operations')

    const assemblage = assemblerSessionGitLab({
      destinationId: 'destination-test',
      dirLocal: racine,
      client,
      branche: 'main',
      racine: 'donnees',
      ressource: 'entretien:e1',
      cheminRelatif: 'entretiens/e1.json',
      identite: () => ({
        userId: 'alice',
        machineId: 'poste-a',
        sessionId: 'session-a',
      }),
      journalRepertoire: dirJournal,
    })

    await expect(assemblage.session.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
    expect(requetes.some((requete) => requete.includes('donnees%2Fentretiens%2Fe1.json')))
      .toBe(true)
    expect(readFileSync(join(racine, 'entretiens', 'e1.json'), 'utf8'))
      .toBe('{"formatVersion":8}')
    const actionBail = corps
      .flatMap((corps) => corps.actions as Array<{ file_path: string }> | undefined)
      .find(({ file_path: chemin }) => chemin.startsWith('.sonal/verrous/'))
    expect(actionBail?.file_path).toBe(`.sonal/verrous/${createHash('sha256')
      .update('branche:main\u0000chemin:donnees/entretiens/e1.json')
      .digest('hex')}.json`)
  })
})
