import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'
import { serviceRenommageWebDAV, preparationRenommageWebDAV } from '../fixtures/renommageAnonWebDAV'

const dossiers: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function banc(natif = false, nombre = 3) {
  const serveur = new ServeurWebDAVMemoire({ olivier: 'pass-oli' })
  serveur.creerDossierRelatif('verrous')
  const f = fixtureRenommageAnon(Array.from({ length: nombre }, (_, i) => `e${i + 1}`))
  for (const s of f.sources.slice(2)) s.data.annotations = []
  serveur.poser('corpus.json', JSON.stringify(f.corpus, null, 2))
  for (const s of f.sources) serveur.poser(`entretiens/${s.id}.json`, JSON.stringify(s.data, null, 2))
  const dir = mkdtempSync(join(tmpdir(), 'sonal-rename-dav-')); dossiers.push(dir)
  const puts: string[] = []; const pistes: string[] = []; const miroirs: string[] = []; const sessions: string[] = []
  const pieges = { avant: async (_chemin: string, _init?: RequestInit) => {}, apres: async (_chemin: string, _init?: RequestInit) => {},
    reponse: (_chemin: string, _init?: RequestInit): Response | null => null }
  const fetch: ImplementationFetch = async (url, init) => {
    const chemin = new URL(String(url)).pathname.replace(`${serveur.racineDav}/`, '')
    pistes.push(`${init?.method ?? 'GET'} ${chemin}`)
    await pieges.avant(chemin, init)
    const r = pieges.reponse(chemin, init) ?? await serveur.fetch(url, init)
    if (init?.method === 'PUT' && r.ok && (chemin === 'corpus.json' || chemin.startsWith('entretiens/'))) puts.push(chemin)
    await pieges.apres(chemin, init)
    return r
  }
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, fetch)
  const options = serviceRenommageWebDAV(client, dir, natif, sessions, (chemin) => { miroirs.push(chemin) })
  const preparer = async () => preparationRenommageWebDAV(options.store, await options.service.instantane(), f.demande)
  const reprendre = async (service = options.service) => {
    const r = await service.preparerReprise(service.lireSuivi()!.operationId)
    return service.appliquer(preparationRenommageWebDAV(options.store, r.instantane, r.demande, r))
  }
  const tiers = async (id: string) => {
    const c = serveur.client({ utilisateur: 'olivier', motDePasse: 'pass-oli' })
    const identite = { userId: 'olivier', machineId: 'autre', sessionId: 'autre' }
    const provider = natif ? new ProviderFilesLock(c, () => identite) : new ProviderPutConditionnel(c, () => identite)
    const chemin = natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
    expect((await provider.acquerir(chemin)).ok).toBe(true)
    return () => provider.liberer(chemin)
  }
  return { serveur, client, dir, puts, pistes, pieges, sessions, miroirs, preparer, reprendre, tiers, f, ...options }
}
for (const natif of [false, true]) describe(`renommage WebDAV ciblé — ${natif ? 'natif' : 'conditionnel'}`, () => {
  test('150 membres, deux cibles : définition puis seules cibles, aucun verrou ni miroir des autres', async () => {
    const b = banc(natif, 150); const p = await b.preparer()
    expect(b.pistes.every((p) => p.startsWith('GET'))).toBe(true)
    b.sessions.push('e3')
    const liberer = await b.tiers('e4')
    expect(await b.service.appliquer(p)).toMatchObject({ statut: 'termine', annotations: 4, incluses: 2, entretiens: 2, definitionModifiee: true })
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json', 'entretiens/e2.json'])
    expect(b.miroirs).toEqual(b.puts)
    const avant = b.f.sources[0].data
    const apres = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!)
    expect(apres.locuteurs).toEqual(avant.locuteurs)
    expect(apres.definitionsAnonLocales).toEqual(avant.definitionsAnonLocales)
    expect(apres.annotations.filter((a: { id: string }) => !['a0', 'a5'].includes(a.id))).toEqual(avant.annotations.filter((a) => !['a0', 'a5'].includes(a.id)))
    expect(b.pistes.filter((p) => /^(PUT verrous\/e|LOCK entretiens\/e)/.test(p)).every((p) => /\/e[124](?:\.|\/)/.test(p))).toBe(true)
    expect(b.service.lireSuivi()).toBeNull()
    await liberer()
  })
  test('cible tenue : succès acquis et reprise fraîche, pas de rejeu du premier entretien', async () => {
    const b = banc(natif); const p = await b.preparer(); const liberer = await b.tiers('e2')
    expect(await b.service.appliquer(p)).toMatchObject({ statut: 'partiel', annotations: 2, entretiens: 1 })
    const suivi = b.service.lireSuivi()!
    expect(suivi.cibles).toContainEqual(expect.objectContaining({ id: 'e2', etat: 'a-faire' }))
    expect(JSON.stringify(suivi)).not.toContain('Rue Karine')
    expect(statSync(join(b.dir, '.renommage-anon-webdav.json')).mode & 0o777).toBe(0o600)
    suivi.cibles[0].id = 'faux'; suivi.bilan.annotations = 100
    expect(b.service.lireSuivi()!.bilan.annotations).toBe(2)
    await expect(b.service.instantane()).rejects.toThrow('reste à reprendre')
    await liberer()
    expect(await b.reprendre(b.creer())).toMatchObject({ statut: 'termine', annotations: 4, entretiens: 2 })
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json', 'entretiens/e2.json'])
  })
  test('cible changée différée, modification étrangère acceptée et aucun écrasement', async () => {
    const b = banc(natif); const p = await b.preparer()
    for (const id of ['e2', 'e3']) {
      const data = JSON.parse(b.serveur.contenuDe(`entretiens/${id}.json`)!)
      data.meta.titre = 'Publication concurrente synthétique'
      b.serveur.poser(`entretiens/${id}.json`, JSON.stringify(data))
    }
    expect(await b.service.appliquer(p)).toMatchObject({ statut: 'partiel', annotations: 2 })
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json'])
    expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 4 })
    expect(JSON.parse(b.serveur.contenuDe('entretiens/e2.json')!).meta.titre).toBe('Publication concurrente synthétique')
    expect(b.miroirs).not.toContain('entretiens/e3.json')
  })
  test('nouvel usage avant publication refuse ; après publication exige une nouvelle cible consentie', async () => {
    const b = banc(natif); const p = await b.preparer()
    const e3 = structuredClone(b.f.sources[0].data)
    b.serveur.poser('entretiens/e3.json', JSON.stringify(e3))
    await expect(b.service.appliquer(p)).rejects.toThrow('nouveaux usages')
    expect(b.puts).toEqual([])
    e3.annotations = []
    b.serveur.poser('entretiens/e3.json', JSON.stringify(e3))
    b.pieges.apres = async (chemin, init) => {
      if (chemin === 'entretiens/e2.json' && init?.method === 'PUT') b.serveur.poser('entretiens/e3.json', JSON.stringify(b.f.sources[0].data))
    }
    expect(await b.service.appliquer(p)).toMatchObject({ statut: 'partiel', nouvellesCibles: ['e3'], annotations: 4 })
    b.pieges.apres = async () => {}
    expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 6, entretiens: 3 })
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json', 'entretiens/e2.json', 'entretiens/e3.json'])
  })
  test('session récupérable ciblée différée ; non-ciblée ne refuse pas le lot', async () => {
    const b = banc(natif); const p = await b.preparer(); b.sessions.push('e2', 'e3')
    expect(await b.service.appliquer(p)).toMatchObject({ statut: 'partiel', annotations: 2 })
    b.sessions.splice(0, 1)
    expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 4 })
  })
  test('reprise retire la cible disparue sans recréer de décision', async () => {
    const b = banc(natif); const p = await b.preparer(); const liberer = await b.tiers('e2')
    await b.service.appliquer(p); await liberer()
    const data = JSON.parse(b.serveur.contenuDe('entretiens/e2.json')!)
    data.annotations = []
    b.serveur.poser('entretiens/e2.json', JSON.stringify(data))
    expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 2, ciblesRetirees: ['e2'] })
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json'])
  })
  test('catégorie préservée à la reprise ; divergence de variante interdit la poursuite', async () => {
    const b = banc(natif); const p = await b.preparer(); const liberer = await b.tiers('e2')
    await b.service.appliquer(p); await liberer()
    const corpus = JSON.parse(b.serveur.contenuDe('corpus.json')!)
    corpus.reglesAnon.personne.categorie = 'Catégorie concurrente'
    b.serveur.poser('corpus.json', JSON.stringify(corpus))
    expect(await b.reprendre()).toMatchObject({ statut: 'termine' })
    expect(JSON.parse(b.serveur.contenuDe('corpus.json')!).reglesAnon.personne.categorie).toBe('Catégorie concurrente')
    const c = banc(natif); const q = await c.preparer(); const rendre = await c.tiers('e2')
    await c.service.appliquer(q); await rendre()
    const divergent = JSON.parse(c.serveur.contenuDe('corpus.json')!)
    divergent.reglesAnon.personne.pseudos = ['Choix concurrent']
    c.serveur.poser('corpus.json', JSON.stringify(divergent))
    await expect(c.reprendre()).rejects.toThrow('définition du lot a changé')
    expect(c.puts).toEqual(['corpus.json', 'entretiens/e1.json'])
  })
  test('réponse perdue : octets acceptés reconnus sans rejeu', async () => {
    const b = banc(natif)
    b.pieges.apres = async (chemin, init) => { if (chemin === 'entretiens/e1.json' && init?.method === 'PUT') throw new Error('réponse perdue') }
    expect(await b.service.appliquer(await b.preparer())).toMatchObject({ statut: 'termine', annotations: 4 })
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json', 'entretiens/e2.json'])
  })
  test('réponse et relecture perdues : verrous conservés, instance vivante reprend sans nouveau PUT', async () => {
    const b = banc(natif); const p = await b.preparer(); let disparu = false
    b.pieges.apres = async (chemin, init) => { if (chemin === 'entretiens/e1.json' && init?.method === 'PUT') { disparu = true; throw new Error('réponse perdue') } }
    b.pieges.avant = async (chemin, init) => { if (disparu && chemin === 'entretiens/e1.json' && init?.method === 'GET') throw new Error('lecture perdue') }
    expect(await b.service.appliquer(p)).toMatchObject({ statut: 'indetermine', annotations: 0, definitionModifiee: true })
    expect(b.service.lireSuivi()!.indeterminee).toBe(true)
    b.pieges.avant = async () => {}; b.pieges.apres = async () => {}
    await expect(b.reprendre(b.creer())).rejects.toThrow('verrou reste tenu')
    expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 4 })
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json', 'entretiens/e2.json'])
  })
  test('original relu après envoi incertain ne constitue jamais une preuve de refus', async () => {
    const b = banc(natif); const p = await b.preparer()
    b.pieges.avant = async (chemin, init) => { if (chemin === 'entretiens/e1.json' && init?.method === 'PUT') throw new Error('avant transport') }
    expect(await b.service.appliquer(p)).toMatchObject({ statut: 'indetermine' })
    b.pieges.avant = async () => {}
    await expect(b.reprendre()).rejects.toThrow('indéterminée')
    expect(b.puts).toEqual(['corpus.json'])
  })
  test('PUT définitivement refusé reste différé, sans état inconnu ni verrou conservé', async () => {
    const b = banc(natif)
    b.pieges.reponse = (chemin, init) => chemin === 'entretiens/e1.json' && init?.method === 'PUT' ? new Response(null, { status: 403 }) : null
    expect(await b.service.appliquer(await b.preparer())).toMatchObject({ statut: 'partiel', annotations: 2 })
    expect(b.service.lireSuivi()!.indeterminee).toBe(false)
    b.pieges.reponse = () => null
    expect(await b.reprendre(b.creer())).toMatchObject({ statut: 'termine', annotations: 4 })
  })
  test('modification entre GET et PUT : If-Match refuse l’écrasement', async () => {
    const b = banc(natif)
    b.pieges.avant = async (chemin, init) => {
      if (chemin === 'entretiens/e1.json' && init?.method === 'PUT') {
        const data = JSON.parse(b.serveur.contenuDe(chemin)!); data.meta.titre = 'Course concurrente'
        b.serveur.poser(chemin, JSON.stringify(data))
      }
    }
    expect(await b.service.appliquer(await b.preparer())).toMatchObject({ statut: 'partiel', annotations: 2 })
    expect(b.service.lireSuivi()!.indeterminee).toBe(false)
    expect(JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!).meta.titre).toBe('Course concurrente')
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e2.json'])
  })
  test('ETag faible refuse l’inventaire, expiration refuse le PUT de la cible', async () => {
    const b = banc(natif)
    b.pieges.reponse = (chemin, init) => chemin === 'corpus.json' && init?.method === 'GET'
      ? new Response(b.serveur.contenuDe(chemin), { headers: { ETag: 'W/"faible"' } }) : null
    await expect(b.service.instantane()).rejects.toThrow('ETag fort')
    b.pieges.reponse = () => null
    const p = await b.preparer(); let saute = false
    b.pieges.apres = async (chemin, init) => {
      if (!saute && b.puts.length && chemin === 'entretiens/e1.json' && init?.method === 'GET') {
        saute = true
        const futur = Date.now() + 600_000
        vi.spyOn(Date, 'now').mockReturnValue(futur)
      }
    }
    expect(await b.service.appliquer(p)).toMatchObject({ statut: 'partiel', annotations: 2 })
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e2.json'])
  })
  test('contrôle final indisponible interdit une fausse fin complète', async () => {
    const b = banc(natif); const p = await b.preparer(); let final = false
    b.pieges.apres = async (chemin, init) => { if (chemin === 'entretiens/e2.json' && init?.method === 'PUT') final = true }
    b.pieges.avant = async (chemin, init) => { if (final && chemin === 'entretiens/e3.json' && init?.method === 'GET') throw new Error('source indisponible') }
    expect(await b.service.appliquer(p)).toMatchObject({ statut: 'partiel', annotations: 4, motif: expect.stringContaining('contrôle final') })
    b.pieges.avant = async () => {}
    expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 4 })
    expect(b.puts).toHaveLength(3)
  })
  test('panne de miroir après acquis : aucune compensation ni répétition', async () => {
    const b = banc(natif); const p = await b.preparer()
    const c = serviceRenommageWebDAV(b.client, b.dir, natif, [], () => { throw new Error('miroir indisponible') })
    expect(await c.service.appliquer({ ...p, store: c.store })).toMatchObject({ statut: 'partiel', definitionModifiee: true, annotations: 0 })
    await expect(c.service.preparerReprise(c.service.lireSuivi()!.operationId)).rejects.toThrow('miroir reste incomplet')
    const r = await c.creer().preparerReprise(c.service.lireSuivi()!.operationId)
    expect(await b.service.appliquer(preparationRenommageWebDAV(b.store, r.instantane, r.demande, r))).toMatchObject({ statut: 'termine', annotations: 4 })
    expect(b.puts).toHaveLength(3)
  })
  test('journal altéré, mauvaise destination et faux chemins refusés sans PUT', async () => {
    const b = banc(natif); const p = await b.preparer(); const liberer = await b.tiers('e2')
    await b.service.appliquer(p); await liberer()
    const chemin = join(b.dir, '.renommage-anon-webdav.json')
    const original = readFileSync(chemin, 'utf8')
    for (const alterer of [
      (j: any) => { j.destination = 'etrangere' },
      (j: any) => { j.cibles[0].id = '../faux' },
      (j: any) => { j.cibles[0].apres = j.cibles[0].apres.replace('Rue Karine', 'Autre texte') },
      (j: any) => { j.regleApres.pseudos = ['Autre choix'] },
      (j: any) => { j.cibles[0].annotations = 100 },
    ]) {
      const j = JSON.parse(original); alterer(j); writeFileSync(chemin, JSON.stringify(j))
      expect(() => b.creer().lireSuivi()).toThrow('invalide')
    }
    expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json'])
  })
})
