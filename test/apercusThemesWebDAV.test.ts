import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { ApercusThemesWebDAV } from '../src/main/distant/apercusThemesWebDAV'
import { ClientWebDAV } from '../src/main/webdav/client'
import { creerHandlersOperationsThemes } from '../src/main/ipcOperationsThemes'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import type { DemandeOperationTheme } from '../src/shared/corpus/themes'
import { ServeurWebDAVMemoire } from './webdav/serveurWebdavMemoire'
import { corpusDistantValide, entretienDistantValide } from './webdav/fixturesCorpusDistant'

afterEach(() => vi.restoreAllMocks())
const transfert: DemandeOperationTheme = { type: 'transfert', conserverSource: true, source: 'source', cible: { type: 'existante', id: 'cible' } }
function division(): Extract<DemandeOperationTheme, { type: 'division' }> {
  return { type: 'division', source: 'source', effacerSource: false, choix: [],
    cibles: ['destination-a', 'destination-b'] }
}
function corpus(): CorpusFichier {
  const c = JSON.parse(corpusDistantValide(['e1', 'e2'])) as CorpusFichier
  c.codebook = Object.fromEntries(['source', 'cible', 'destination-a', 'destination-b'].map((id, ordre) => [id, {
    id, nom: id, parent: null, ordre, actif: true, codeExport: id,
  }]))
  return c
}
function entretien(): EntretienFichier {
  return JSON.parse(entretienDistantValide({
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Un extrait à examiner.' }] }] },
    annotations: [
      { id: 'a', type: 'codage', code: 'source', from: 1, to: 7, auteur: 'test' },
      { id: 'orphelin', type: 'codage', code: 'source', from: 8, to: 8, auteur: 'test' },
      { id: 'c', type: 'codage', code: 'cible', from: 1, to: 7, auteur: 'test' },
      { id: 'memo', type: 'commentaire', texte: 'Mémo intact', from: 1, to: 7, auteur: 'test' },
    ],
  })) as EntretienFichier
}
function banc(hook?: (requete: Request, reponse: Response, serveur: ServeurWebDAVMemoire) => Response | Promise<Response>) {
  const serveur = new ServeurWebDAVMemoire()
  serveur.poser('corpus.crp', JSON.stringify(corpus()))
  serveur.poser('entretiens/e1.json', JSON.stringify(entretien()))
  serveur.poser('entretiens/e2.json', JSON.stringify(entretien()))
  const requetes: Request[] = []
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, async (input, init) => {
    const requete = new Request(input, init)
    requetes.push(requete)
    const reponse = await serveur.fetch(input, init)
    return hook ? hook(requete, reponse, serveur) : reponse
  })
  const dir = mkdtempSync(join(tmpdir(), 'sonal-apercus-webdav-'))
  const store = new CorpusStore(dir)
  store.lectureSeule = true
  // Un miroir volontairement périmé ne doit influencer aucune lecture serveur.
  writeFileSync(join(dir, 'corpus.crp'), 'miroir corpus périmé')
  const adapter = (data: EntretienFichier) => store.adapterEntretienOperationTheme(data)
  const apercus = new ApercusThemesWebDAV(client, adapter)
  return { serveur, client, requetes, dir, store, adapter, apercus }
}
function chemin(requete: Request): string { return decodeURIComponent(new URL(requete.url).pathname) }

async function remplacerEtag(reponse: Response, etag: string | null): Promise<Response> {
  const entetes = new Headers(reponse.headers)
  if (etag === null) entetes.delete('etag')
  else entetes.set('etag', etag)
  return new Response(await reponse.text(), { status: reponse.status, headers: entetes })
}

describe('aperçus de thèmes depuis WebDAV', () => {
  test('GET et ETag proviennent d’une même réponse, sans HEAD ni PROPFIND séparé', async () => {
    let original = ''
    const b = banc((req, rep, serveur) => {
      if (chemin(req).endsWith('/e1.json')) {
        original = serveur.etagDe('entretiens/e1.json')!
        serveur.poser('entretiens/e1.json', 'version suivante')
      }
      return rep
    })
    const lecture = await b.client.getTexteAvecEtag('entretiens/e1.json')
    expect(lecture.etag).toBe(original)
    expect(JSON.parse(lecture.contenu)).toEqual(entretien())
    expect(b.requetes.map((r) => r.method)).toEqual(['GET'])
    expect(b.requetes[0].headers.get('cache-control')).toBe('no-cache')
    expect(b.requetes[0].headers.get('accept-encoding')).toBe('identity')
  })

  test('l’aperçu lit le serveur sans écrire le miroir, ouvrir une session ou créer un verrou', async () => {
    const b = banc()
    const ouvrir = vi.spyOn(b.store, 'ouvrir')
    const lire = vi.spyOn(b.store, 'lireEntretien')
    const analyserLocal = vi.spyOn(b.store, 'analyserOperationTheme')
    const a = await b.apercus.analyser(transfert)
    expect(a.faisable).toBe(true)
    expect(a.totaux).toMatchObject({ entretiens: 2, passages: 4, orphelins: 2, doublonsPrevisibles: 2 })
    expect(b.apercus.details(a.operationId, 'e1').codages[0].extrait).toBe('Un ext')
    expect(b.apercus.details(a.operationId, 'e1').codages[1]).toMatchObject({ annotationId: 'orphelin', extrait: '' })
    expect(b.requetes.map((r) => chemin(r).split('/').at(-1))).toEqual(['corpus.crp', 'e1.json', 'e2.json', 'corpus.crp'])
    expect(b.requetes.every((r) => r.method === 'GET')).toBe(true)
    expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe('miroir corpus périmé')
    expect(ouvrir).not.toHaveBeenCalled()
    expect(lire).not.toHaveBeenCalled()
    expect(analyserLocal).not.toHaveBeenCalled()
    expect(b.serveur.contenuDe('entretiens/e1.json')).toBe(JSON.stringify(entretien()))
  })

  test.each(['absent', 'illisible', 'incomplet', 'version', 'réseau'])('un membre %s devient un obstacle nommé, jamais zéro usage', async (cas) => {
    const b = banc((req, rep) => {
      if (cas === 'réseau' && chemin(req).endsWith('/e2.json')) throw new Error('Connexion coupée')
      return rep
    })
    if (cas === 'absent') await b.client.supprimer('entretiens/e2.json')
    if (cas === 'illisible') b.serveur.poser('entretiens/e2.json', '{')
    if (cas === 'incomplet') b.serveur.poser('entretiens/e2.json', JSON.stringify({ ...entretien(), annotations: null }))
    if (cas === 'version') b.serveur.poser('entretiens/e2.json', JSON.stringify({ ...entretien(), formatVersion: 999 }))
    const a = await b.apercus.analyser(transfert)
    expect(a.faisable).toBe(true)
    expect(a.parEntretien.map((e) => e.id)).toEqual(['e1'])
    expect(a.obstacles).toEqual([{ phase: 'entretiens', entretienId: 'e2', motif: expect.any(String) }])
    expect(a.totaux.passages).toBe(2)
    expect(() => b.apercus.details(a.operationId, 'e2')).toThrow(/absent ou indisponible/)
  })

  test.each([null, 'W/"faible"'])('ETag %s d’un entretien : obstacle sans repli local', async (etag) => {
    const b = banc((req, rep) => chemin(req).endsWith('/e2.json') ? remplacerEtag(rep, etag) : rep)
    const a = await b.apercus.analyser(transfert)
    expect(a.obstacles).toContainEqual({ phase: 'entretiens', entretienId: 'e2', motif: expect.stringMatching(/ETag fort/) })
    expect(a.parEntretien.map((e) => e.id)).toEqual(['e1'])
  })

  test.each([null, 'W/"faible"'])('ETag %s du corpus : refus de l’inventaire entier', async (etag) => {
    const b = banc((req, rep) => chemin(req).endsWith('/corpus.crp') ? remplacerEtag(rep, etag) : rep)
    await expect(b.apercus.analyser(transfert)).rejects.toThrow(/ETag fort/)
    expect(b.requetes).toHaveLength(1)
  })

  test('un changement de définitions pendant l’inventaire refuse le nouvel aperçu', async () => {
    const b = banc((req, rep, serveur) => {
      if (chemin(req).endsWith('/e1.json')) serveur.poser('corpus.crp', JSON.stringify({ ...corpus(), nom: 'Autre version' }))
      return rep
    })
    await expect(b.apercus.analyser(transfert)).rejects.toThrow(/changé pendant l’inventaire/)
  })

  test('un contenu corpus différent refuse même avec un ETag identique', async () => {
    let n = 0
    const b = banc(async (req, rep) => {
      if (!chemin(req).endsWith('/corpus.crp') || ++n !== 2) return rep
      return new Response(JSON.stringify({ ...corpus(), nom: 'Contenu divergent' }), { status: 200, headers: rep.headers })
    })
    await expect(b.apercus.analyser(transfert)).rejects.toThrow(/changé pendant l’inventaire/)
  })

  test.each(['..', '../autre', 'invalide\\nom'])('un identifiant %s n’est jamais utilisé comme chemin serveur', async (id) => {
    const b = banc()
    const c = corpus()
    c.membership[id] = { titre: 'Invalide', date: null, lastModified: '' }
    b.serveur.poser('corpus.crp', JSON.stringify(c))
    const a = await b.apercus.analyser(transfert)
    expect(a.obstacles).toContainEqual({ phase: 'entretiens', entretienId: id, motif: expect.stringMatching(/Identifiant/) })
    expect(b.requetes).toHaveLength(4)
  })

  test('un entretien ancien est adapté en mémoire sans migration sur le serveur', async () => {
    const b = banc()
    const ancien = JSON.stringify({ ...entretien(), formatVersion: 2 })
    b.serveur.poser('entretiens/e1.json', ancien)
    const a = await b.apercus.analyser(transfert)
    expect(a.obstacles).toEqual([])
    expect(b.apercus.details(a.operationId, 'e1').codages).toHaveLength(2)
    expect(b.serveur.contenuDe('entretiens/e1.json')).toBe(ancien)
  })

  test('les choix recalculent les fichiers à modifier, avec identités distinctes par entretien', async () => {
    const b = banc()
    const d = division()
    const initial = await b.apercus.analyser(d)
    expect(initial.parEntretien.every((e) => !e.aModifier)).toBe(true)
    d.choix.push({ codage: { entretienId: 'e1', annotationId: 'a' }, destination: 'destination-a' })
    const final = await b.apercus.analyser(d, initial.operationId)
    expect(final.parEntretien.map((e) => e.aModifier)).toEqual([true, false])
    expect(() => b.apercus.details(initial.operationId, 'e1')).toThrow(/absent/)
    expect(b.apercus.details(final.operationId, 'e2').codages[0].codage).toEqual({ entretienId: 'e2', annotationId: 'a' })
  })

  test('une révision conserve les choix valides malgré un membre toujours indisponible', async () => {
    const b = banc()
    await b.client.supprimer('entretiens/e2.json')
    const d = division()
    const initial = await b.apercus.analyser(d)
    d.choix.push({ codage: { entretienId: 'e1', annotationId: 'a' }, destination: 'destination-a' })
    const final = await b.apercus.analyser(d, initial.operationId)
    expect(final.faisable).toBe(true)
    expect(final.parEntretien[0].aModifier).toBe(true)
    expect(final.obstacles[0].entretienId).toBe('e2')
  })

  test('des données déjà observées devenues obsolètes refusent la révision des choix', async () => {
    const b = banc()
    const initial = await b.apercus.analyser(division())
    b.serveur.poser('entretiens/e1.json', JSON.stringify({ ...entretien(), annotations: [] }))
    await expect(b.apercus.analyser(division(), initial.operationId)).rejects.toThrow(/a changé/)
  })

  test('un défaut des définitions reste bloquant malgré l’inventaire partiel', async () => {
    const b = banc()
    const c = corpus()
    c.codebook.autre = { id: 'autre', nom: 'Autre', parent: 'absente', ordre: 2, actif: true, codeExport: 'autre' }
    b.serveur.poser('corpus.crp', JSON.stringify(c))
    const a = await b.apercus.analyser(transfert)
    expect(a.faisable).toBe(false)
    expect(a.obstacles).toContainEqual({ phase: 'definitions', motif: expect.stringMatching(/hiérarchie/) })
  })

  test('expiration, taille et nombre d’aperçus reprennent les bornes du cache main', async () => {
    const b = banc()
    let heure = 0
    const service = new ApercusThemesWebDAV(b.client, b.adapter, { maintenant: () => heure, maxApercus: 1, dureeCacheMs: 5 })
    const premier = await service.analyser(transfert)
    const dernier = await service.analyser(transfert)
    expect(() => service.details(premier.operationId, 'e1')).toThrow(/absent/)
    heure = 6
    expect(() => service.details(dernier.operationId, 'e1')).toThrow(/expiré/)
    const petit = new ApercusThemesWebDAV(b.client, b.adapter, { maxOctetsCache: 1 })
    await expect(petit.analyser(transfert)).rejects.toThrow(/volumineux/)
  })

  test('les aperçus appartiennent à leur contexte et la fermeture écarte une réponse tardive', async () => {
    const b = banc()
    const premier = await b.apercus.analyser(transfert)
    const autre = new ApercusThemesWebDAV(b.client, b.adapter)
    expect(() => autre.details(premier.operationId, 'e1')).toThrow(/absent/)
    let finir!: () => void
    const pause = new Promise<void>((resolve) => { finir = resolve })
    vi.spyOn(b.client, 'getTexteAvecEtag').mockImplementationOnce(async () => {
      await pause
      return { contenu: JSON.stringify(corpus()), etag: 'ancien' }
    })
    const attente = b.apercus.analyser(transfert)
    b.apercus.vider()
    finir()
    await expect(attente).rejects.toThrow(/contexte distant a changé/)
    expect(() => b.apercus.details(premier.operationId, 'e1')).toThrow(/absent/)
  })

  test('deux analyses simultanées ne mélangent pas leurs sources ou leurs extraits', async () => {
    const b = banc()
    const [source, cible] = await Promise.all([b.apercus.analyser(transfert), b.apercus.analyser({
      type: 'transfert', conserverSource: true, source: 'cible', cible: { type: 'existante', id: 'source' },
    })])
    expect(b.apercus.details(source.operationId, 'e1').codages.map((c) => c.annotationId)).toEqual(['a', 'orphelin'])
    expect(b.apercus.details(cible.operationId, 'e1').codages.map((c) => c.annotationId)).toEqual(['c'])
  })

  test('les variantes destructives sont refusées avant tout accès réseau', async () => {
    const b = banc()
    await expect(b.apercus.analyser({ type: 'fusion', sources: ['source', 'cible'], cible: 'cible' })).rejects.toThrow(/transfert et la division/)
    await expect(b.apercus.analyser({ ...division(), effacerSource: true })).rejects.toThrow(/conserver/)
    expect(b.requetes).toHaveLength(0)
  })

  test('le dispatch WebDAV utilise les lectures dédiées et refuse l’exécution sans publieur injecté', async () => {
    const b = banc()
    const local = vi.spyOn(b.store, 'analyserOperationTheme')
    const executer = vi.spyOn(b.store, 'executerOperationTheme')
    const handlers = creerHandlersOperationsThemes({
      fournisseur: () => 'webdav', store: () => b.store, progression: vi.fn(),
      webdav: { analyser: (...args) => b.apercus.analyser(...args), details: async (...args) => b.apercus.details(...args) },
    })
    const a = await handlers.analyser(transfert)
    expect((await handlers.details(a.operationId, 'e1')).codages).toHaveLength(2)
    expect(() => handlers.executer(a.operationId, transfert, { entretiens: 'tous-prevus' })).toThrow(/pas encore livré/)
    expect(() => handlers.analyser({ ...division(), effacerSource: true })).toThrow(/suppression/)
    expect(local).not.toHaveBeenCalled()
    expect(executer).not.toHaveBeenCalled()
  })
})
