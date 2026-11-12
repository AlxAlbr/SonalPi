import { describe, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientGitLab } from '../../src/main/gitlab/client'
import { ApercusThemesGitLab } from '../../src/main/gitlab/apercusThemes'
import { InstantaneLectureGitLab } from '../../src/main/gitlab/lecture'
import { ObservationBailsGitLab } from '../../src/main/gitlab/observationBails'
import { cheminBailRessourceGitLab, cleRessourceBailGitLab } from '../../src/main/gitlab/bailGitLab'
import { creerHandlersOperationsThemes } from '../../src/main/ipcOperationsThemes'
import { CorpusStore } from '../../src/main/corpusStore'
import type { CorpusFichier } from '../../src/shared/format'
import type { DemandeOperationTheme } from '../../src/shared/corpus/themes'
import { corpusDistantValide, entretienDistantValide } from '../webdav/fixturesCorpusDistant'

const SHA = '1'.repeat(40)
const AUTRE_SHA = '2'.repeat(40)
const transfert: DemandeOperationTheme = { type: 'transfert', conserverSource: true, source: 'source', cible: { type: 'existante', id: 'cible' } }
function division(): Extract<DemandeOperationTheme, { type: 'division' }> {
  return { type: 'division', source: 'source', effacerSource: false, choix: [],
    cibles: ['destination-a', 'destination-b'] }
}
function corpus(ids = ['e1', 'e2']): string {
  const c = JSON.parse(corpusDistantValide(ids)) as CorpusFichier
  c.codebook = Object.fromEntries(['source', 'cible', 'destination-a', 'destination-b'].map((id, ordre) => [id, { id, nom: id, parent: null, ordre, actif: true, codeExport: id }]))
  return JSON.stringify(c)
}
function entretien(): string {
  return entretienDistantValide({ corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Passage de test.' }] }] },
    annotations: [{ id: 'a', type: 'codage', code: 'source', from: 1, to: 5, auteur: 'test' },
      { id: 'orphelin', type: 'codage', code: 'source', from: 8, to: 8, auteur: 'test' }] })
}
function banc(options: { membres?: string[]; maxApercus?: number; maintenant?: () => number; maxOctetsCache?: number } = {}) {
  const fichiers: Record<string, string> = { 'donnees/corpus.crp': corpus(options.membres),
    ...Object.fromEntries((options.membres ?? ['e1', 'e2']).map((id) => [`donnees/entretiens/${id}.json`, entretien()])) }
  const versions = new Map([[SHA, fichiers]])
  let tete = SHA
  const requetes: Array<{ url: URL; methode: string }> = []
  let intercepter: (url: URL) => Response | undefined = () => undefined
  const client = new ClientGitLab({ urlInstance: 'https://gitlab.example.org', projetId: 42,
    autorisation: { type: 'jeton-prive', jeton: 'test' }, nombreRelances429: 0 }, async (input, init) => {
    const url = new URL(String(input))
    requetes.push({ url, methode: init?.method ?? 'GET' })
    const speciale = intercepter(url)
    if (speciale) return speciale
    const chemin = decodeURIComponent(url.pathname).replace(/^.*\/repository\//, '')
    if (chemin.startsWith('branches/')) return Response.json({ commit: { id: tete } })
    const snapshot = versions.get(url.searchParams.get('ref')!)!
    if (chemin === 'tree') {
      const path = url.searchParams.get('path')!
      return Response.json(Object.keys(snapshot).filter((p) => p.startsWith(`${path}/`)).map((p) => ({
        id: SHA, path: p, name: p.split('/').at(-1), type: 'blob', mode: '100644',
      })))
    }
    if (chemin.startsWith('files/')) {
      const brut = chemin.endsWith('/raw')
      const path = chemin.slice(6).replace(/\/raw$/, '')
      const contenu = snapshot[path]
      if (contenu === undefined) return new Response(null, { status: 404 })
      return brut ? new Response(contenu) : Response.json({ file_path: path, content: Buffer.from(contenu).toString('base64'),
        encoding: 'base64', last_commit_id: SHA, execute_filemode: false })
    }
    return new Response(null, { status: 404 })
  })
  const locaux: string[] = []
  const observateur = new ObservationBailsGitLab({ instantane: new InstantaneLectureGitLab(client, 'main', 'donnees'),
    branche: 'main', racine: 'donnees', idsEntretiens: () => Object.keys(JSON.parse(fichiers['donnees/corpus.crp']).membership),
    ressource: (id) => `entretien:destination:${id}`, bailTenuLocalement: (id) => locaux.includes(id) })
  const dir = mkdtempSync(join(tmpdir(), 'sonal-apercu-gl-'))
  writeFileSync(join(dir, 'corpus.crp'), 'miroir périmé')
  const store = new CorpusStore(dir)
  const observer = vi.fn((ids, lecteur) => observateur.observerCibles(ids, lecteur))
  const service = new ApercusThemesGitLab({ ...options, client, branche: 'main', racine: 'donnees',
    adapter: (avant) => store.adapterEntretienOperationTheme(avant), observer, sessionsLocales: () => locaux })
  const bail = (id: string, cas: 'vivant' | 'expire' | 'legacy' | 'illisible' = 'vivant') => {
    const ressource = cas === 'legacy' ? `entretien:destination:${id}` : cleRessourceBailGitLab('main', `donnees/entretiens/${id}.json`)
    const chemin = cheminBailRessourceGitLab(ressource)
    fichiers[chemin] = cas === 'illisible' ? '{' : JSON.stringify({ version: cas === 'legacy' ? 1 : 2,
      protocole: cas === 'legacy' ? 'sonal-bail-v1' : 'sonal-bail-v2',
      resourceHash: createHash('sha256').update(ressource).digest('hex'), generation: 'g', compteur: 1,
      holder: { userId: 'max', machineId: 'autre-poste', sessionId: 'autre-session' },
      expireLe: cas === 'expire' || cas === 'legacy' ? '2020-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z' })
    return chemin
  }
  return { service, store, dir, observer, locaux, fichiers, requetes, bail,
    intercepter: (fn: typeof intercepter) => { intercepter = fn },
    nouvelleTete: (contenu: Record<string, string>) => { versions.set(AUTRE_SHA, contenu); tete = AUTRE_SHA } }
}

describe('aperçus des opérations de thèmes GitLab', () => {
  test('tout est lu au SHA résolu, même si la tête change ; aucune écriture ni repli miroir', async () => {
    const b = banc()
    b.intercepter((url) => {
      if (decodeURIComponent(url.pathname).includes('/files/donnees/corpus.crp')) b.nouvelleTete({ ...b.fichiers, 'donnees/corpus.crp': 'autre version' })
      return undefined
    })
    const lireLocal = vi.spyOn(b.store, 'lireEntretien')
    const a = await b.service.analyser(transfert)
    expect(a).toMatchObject({ faisable: true, instantaneGitLab: { commit: SHA }, totaux: { passages: 4, orphelins: 2 } })
    expect(b.requetes.filter((r) => !r.url.pathname.includes('/branches/')).every((r) => r.url.searchParams.get('ref') === SHA)).toBe(true)
    expect(b.requetes.every((r) => r.methode === 'GET')).toBe(true)
    expect(lireLocal).not.toHaveBeenCalled()
    expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe('miroir périmé')
    expect(b.service.details(a.operationId, 'e1').codages[1]).toMatchObject({ orphelin: true, extrait: '' })
  })

  test('la division observe les choix effectifs, sans demander la fermeture des autres entretiens', async () => {
    const b = banc()
    b.bail('e2')
    const d = division()
    d.choix = [{ codage: { entretienId: 'e1', annotationId: 'a' }, destination: 'destination-a' }]
    const a = await b.service.analyser(d)
    expect(b.observer.mock.calls[0][0]).toEqual(['e1'])
    expect(a.disponibiliteGitLab?.entretiens).toEqual([{ id: 'e1', etat: 'libre-observe' }])
    expect(b.requetes.some((r) => decodeURIComponent(r.url.pathname).includes(b.bail('e2')))).toBe(false)
    expect(a.faisable).toBe(true)
  })

  test.each(['vivant', 'expire', 'legacy'] as const)('bail %s : règles du coordinateur, même compte ne signifie pas libre', async (cas) => {
    const b = banc()
    b.bail('e1', cas)
    const a = await b.service.analyser(transfert)
    expect(a.disponibiliteGitLab?.entretiens[0].etat).toBe(cas === 'expire' ? 'libre-observe' : 'tenu-autrui')
    expect(a.faisable).toBe(true)
  })

  test('sessions locales et récupérables sont ajoutées aux badges qui les masquent', async () => {
    const b = banc()
    b.locaux.push('e1')
    b.bail('e1')
    const a = await b.service.analyser(transfert)
    expect(a.disponibiliteGitLab?.entretiens[0].etat).toBe('session-locale')
    expect(a.disponibiliteGitLab?.entretiens[1].etat).toBe('libre-observe')
  })

  test.each(['illisible', 'transport', 'inventaire'])('observation %s : inconnu, jamais libre', async (cas) => {
    const b = banc()
    const chemin = b.bail('e1', cas === 'illisible' ? 'illisible' : 'vivant')
    b.intercepter((url) => (cas === 'transport' && decodeURIComponent(url.pathname).includes(chemin))
      || (cas === 'inventaire' && url.pathname.endsWith('/tree')) ? new Response(null, { status: 503 }) : undefined)
    const a = await b.service.analyser(transfert)
    expect(a.disponibiliteGitLab?.entretiens.every((e) => e.etat === 'inconnu')).toBe(true)
    expect(a.faisable).toBe(false)
    expect(a.motif).toMatch(/observé libre/)
  })

  test('aucun entretien libre bloque la préparation ; zéro mutation ne consulte aucun bail', async () => {
    const b = banc()
    b.bail('e1'); b.bail('e2')
    expect((await b.service.analyser(transfert)).faisable).toBe(false)
    b.observer.mockClear()
    const vide = await b.service.analyser(division())
    expect(vide.faisable).toBe(true)
    expect(vide.disponibiliteGitLab?.entretiens).toEqual([])
    expect(b.observer).not.toHaveBeenCalled()
  })

  test('membre absent : obstacle nommé, source conservée possible, suppression interdite', async () => {
    const b = banc()
    delete b.fichiers['donnees/entretiens/e2.json']
    const a = await b.service.analyser(transfert)
    expect(a.faisable).toBe(true)
    expect(a.obstacles).toEqual([expect.objectContaining({ entretienId: 'e2' })])
    const f = await b.service.analyser({ type: 'fusion', sources: ['source', 'cible'], cible: 'cible' })
    expect(f.faisable).toBe(false)
    expect(f.obstacles.some((o) => o.phase === 'finalisation')).toBe(true)
  })

  test('249 membres : suppression infaisable, aucun plafond de lot pour le transfert', async () => {
    const b = banc({ membres: Array.from({ length: 249 }, (_, i) => `e${i}`) })
    const f = await b.service.analyser({ type: 'fusion', sources: ['source', 'cible'], cible: 'cible' })
    expect(f.faisable).toBe(false)
    expect(f.motif).toContain('248')
    expect((await b.service.analyser(transfert)).faisable).toBe(true)
  })

  test('borne par fichier avec garde : membre nommé, pas un refus cumulatif du lot', async () => {
    const b = banc()
    b.fichiers['donnees/entretiens/e2.json'] = entretien().repeat(5000)
    const a = await b.service.analyser(transfert)
    expect(a.faisable).toBe(true)
    expect(a.obstacles).toEqual([expect.objectContaining({ entretienId: 'e2', motif: expect.stringMatching(/borne individuelle/) })])
  })

  test('cache borné et contexte fermé : les détails ne survivent pas', async () => {
    const b = banc({ maxApercus: 1 })
    const a = await b.service.analyser(transfert)
    const second = await b.service.analyser(transfert)
    expect(() => b.service.details(a.operationId, 'e1')).toThrow(/absent/)
    b.service.vider()
    expect(() => b.service.details(second.operationId, 'e1')).toThrow(/absent/)
  })

  test('une observation tardive ne recrée pas le cache d’un contexte fermé', async () => {
    const b = banc()
    b.observer.mockImplementationOnce(async () => { b.service.vider(); return { entrees: [], indisponible: false } })
    await expect(b.service.analyser(transfert)).rejects.toThrow(/contexte GitLab a changé/)
  })

  test('révision de division : aucun choix conservé sur un entretien modifié', async () => {
    const b = banc()
    const d = division()
    const ancien = await b.service.analyser(d)
    b.nouvelleTete({ ...b.fichiers, 'donnees/entretiens/e1.json': entretien().replace('Passage', 'Nouveau passage') })
    d.choix = [{ codage: { entretienId: 'e1', annotationId: 'a' }, destination: 'destination-a' }]
    await expect(b.service.analyser(d, ancien.operationId)).rejects.toThrow(/a changé/)
  })

  test('expiration et coût des observations respectent aussi le cache borné', async () => {
    let temps = 0
    const b = banc({ maintenant: () => temps })
    const a = await b.service.analyser(transfert)
    temps = 16 * 60_000
    expect(() => b.service.details(a.operationId, 'e1')).toThrow(/expiré/)
    const borne = banc({ maxOctetsCache: 4000 })
    borne.observer.mockResolvedValueOnce({ entrees: [{ chemin: 'entretiens/e1.json', etag: null,
      contenu: { userId: 'x'.repeat(10_000), machineId: '', acquiredAt: '' } }], indisponible: false })
    await expect(borne.service.analyser(transfert)).rejects.toThrow(/trop volumineux/)
  })

  test('un badge sans contenu est inconnu, mais un autre entretien libre reste sélectionnable', async () => {
    const b = banc()
    b.observer.mockResolvedValueOnce({ entrees: [{ chemin: 'entretiens/e1.json', etag: null, contenu: null }], indisponible: false })
    const a = await b.service.analyser(transfert)
    expect(a.disponibiliteGitLab?.entretiens.map((e) => e.etat)).toEqual(['inconnu', 'libre-observe'])
    expect(a.faisable).toBe(true)
  })

  test('dispatch GitLab dédié pour la lecture et l’exécution', async () => {
    const b = banc()
    const local = vi.spyOn(b.store, 'analyserOperationTheme')
    const executer = vi.fn(async () => ({ statut: 'non-appliquee' as const, motif: 'test' }))
    const h = creerHandlersOperationsThemes({ store: () => b.store, fournisseur: () => 'gitlab', progression: vi.fn(),
      gitlab: { analyser: (d, p) => b.service.analyser(d, p),
        details: async (id, entretien) => b.service.details(id, entretien), executer } })
    const a = await h.analyser(transfert)
    expect((await h.details(a.operationId, 'e1')).codages).toHaveLength(2)
    await h.executer(a.operationId, transfert, { entretiens: 'observes-libres' })
    expect(executer).toHaveBeenCalledWith(a.operationId, transfert, { entretiens: 'observes-libres' }, expect.any(Function))
    expect(local).not.toHaveBeenCalled()
  })
})
