import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { JournalCorrespondancesWebDAV } from '../../src/main/distant/journalCorrespondancesWebDAV'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { corpusImportWebDAV, entretienImportWebDAV, serviceImportWebDAV, preparationImportWebDAV, documentsImportWebDAV } from '../fixtures/correspondancesWebDAV'

const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function banc(natif = false) {
  const serveur = new ServeurWebDAVMemoire({ olivier: 'pass-oli' })
  serveur.creerDossierRelatif('verrous')
  serveur.poser('corpus.crp', corpusImportWebDAV())
  for (const id of ['e1', 'e2']) serveur.poser(`entretiens/${id}.json`, entretienImportWebDAV())
  const dir = mkdtempSync(join(tmpdir(), 'sonal-correspondances-dav-')); dossiers.push(dir)
  const puts: string[] = []
  const pistes: string[] = []
  const pieges = { avant: async (_chemin: string, _init?: RequestInit) => {}, apres: async (_chemin: string, _init?: RequestInit) => {} }
  const fetch: ImplementationFetch = async (url, init) => {
    const chemin = new URL(String(url)).pathname.replace(`${serveur.racineDav}/`, '')
    pistes.push(`${init?.method ?? 'GET'} ${chemin}`)
    await pieges.avant(chemin, init)
    const r = await serveur.fetch(url, init)
    if (init?.method === 'PUT' && (chemin === 'corpus.crp' || chemin.startsWith('entretiens/')) && r.ok) puts.push(chemin)
    await pieges.apres(chemin, init)
    return r
  }
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, fetch)
  const sessions: string[] = []
  const miroirs: string[] = []
  const options = serviceImportWebDAV(client, dir, natif, sessions, (chemin) => { miroirs.push(chemin) })
  const preparer = async (documents = documentsImportWebDAV) => preparationImportWebDAV(options.store, await options.service.instantane(), documents)
  return { serveur, client, dir, puts, pistes, pieges, sessions, miroirs, preparer, ...options }
}

for (const natif of [false, true]) describe(`correspondances WebDAV — ${natif ? 'verrou natif' : 'PUT conditionnel'}`, () => {
  test('lit le serveur, prépare toutes les cibles et n’altère ni texte ni Personne', async () => {
    const b = banc(natif)
    const preparation = await b.preparer()
    expect(b.pistes.every((p) => p.startsWith('GET'))).toBe(true)
    expect(b.store.ouvrir().membership).toEqual({})
    const bilan = await b.service.appliquer(preparation)
    expect(bilan.entretiens).toEqual({ definitionsLocales: 2, locuteurs: 2, entretiens: 2 })
    expect(b.puts).toEqual(['entretiens/e1.json', 'entretiens/e2.json'])
    const doc = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!)
    expect(doc.corpsTexte).toEqual(JSON.parse(entretienImportWebDAV()).corpsTexte)
    expect(doc.annotations).toEqual(JSON.parse(entretienImportWebDAV()).annotations)
    expect(doc.locuteurs[0]).toMatchObject({ index: 1, nom: 'Karine', personneRef: 'personne-synthetique', pseudo: 'Claire', pseudoEtat: 'confirme' })
    expect(doc.definitionsAnonLocales[0].entite).toEqual(['Alias sans occurrence', 'Autre graphie'])
    expect(b.service.lireSuivi()).toBeNull()
    const avant = b.puts.length
    expect((await b.service.appliquer(await b.preparer())).entretiens.entretiens).toBe(0)
    expect(b.puts).toHaveLength(avant)
  })
  test('refuse la session récupérable ou le verrou tiers avant publication', async () => {
    const b = banc(natif); const p = await b.preparer()
    b.sessions.push('e1')
    await expect(b.service.appliquer(p)).rejects.toThrow('avant publication')
    b.sessions.splice(0)
    const tiers = b.serveur.client({ utilisateur: 'olivier', motDePasse: 'pass-oli' })
    const id = { userId: 'olivier', machineId: 'autre', sessionId: 'autre' }
    const provider = natif ? new ProviderFilesLock(tiers, () => id) : new ProviderPutConditionnel(tiers, () => id)
    const chemin = natif ? 'entretiens/e2.json' : 'verrous/e2.lock.json'
    expect((await provider.acquerir(chemin)).ok).toBe(true)
    await expect(b.service.appliquer(p)).rejects.toThrow('avant publication')
    expect(b.puts).toEqual([])
    const corpus = new ProviderPutConditionnel(b.client, () => ({ ...id, userId: 'max', sessionId: 'apres' }))
    expect((await corpus.acquerir('verrous/corpus.lock.json')).ok).toBe(true)
    await corpus.liberer('verrous/corpus.lock.json'); await provider.liberer(chemin)
  })
  test('interruption au deuxième entretien : reprise confirmée, sans rejouer le premier', async () => {
    const b = banc(natif); const p = await b.preparer()
    b.pieges.avant = async (chemin, init) => { if (chemin === 'entretiens/e2.json' && init?.method === 'PUT') throw new Error('coupure') }
    await expect(b.service.appliquer(p)).rejects.toThrow('incomplet')
    expect(b.service.lireSuivi()).toMatchObject({ confirmes: 1, restants: 1, indeterminee: true })
    expect(statSync(join(b.dir, '.correspondances-webdav.json')).mode & 0o777).toBe(0o600)
    const suivi = b.service.lireSuivi()!
    expect(JSON.stringify(suivi)).not.toContain('Alias sans occurrence')
    expect(JSON.stringify(suivi)).not.toContain('personne-synthetique')
    suivi.bilanPrevu.ignores = 99
    suivi.cibles[0].entretienId = '../faux'
    expect(b.service.lireSuivi()!.bilanPrevu.ignores).toBe(0)
    expect(b.service.lireSuivi()!.cibles[0].entretienId).toBe('e1')
    await expect(b.service.instantane()).rejects.toThrow('reste à reprendre')
    await expect(b.creer().reprendre(suivi.operationId, false)).rejects.toThrow('Confirmez explicitement')
    b.pieges.avant = async () => {}
    const relance = b.creer()
    expect((await relance.reprendre(suivi.operationId, true)).entretiens.entretiens).toBe(2)
    expect(b.puts).toEqual(['entretiens/e1.json', 'entretiens/e2.json'])
    expect(relance.lireSuivi()).toBeNull()
  })
  test('réponse perdue après acceptation : relit sans nouveau PUT', async () => {
    const b = banc(natif)
    b.pieges.apres = async (chemin, init) => { if (chemin === 'entretiens/e1.json' && init?.method === 'PUT') throw new Error('réponse perdue') }
    expect((await b.service.appliquer(await b.preparer())).entretiens.entretiens).toBe(2)
    expect(b.puts).toEqual(['entretiens/e1.json', 'entretiens/e2.json'])
  })
  test('réponse et relecture perdues : redémarrage reconnaît le succès sans rejeu', async () => {
    const b = banc(natif); const p = await b.preparer(); let disparu = false
    b.pieges.apres = async (chemin, init) => { if (chemin === 'entretiens/e1.json' && init?.method === 'PUT') { disparu = true; throw new Error('réponse perdue') } }
    b.pieges.avant = async (chemin, init) => { if (disparu && chemin === 'entretiens/e1.json' && init?.method === 'GET') throw new Error('lecture perdue') }
    await expect(b.service.appliquer(p)).rejects.toThrow('indéterminée')
    const suivi = b.service.lireSuivi()!
    b.pieges.avant = async () => {}; b.pieges.apres = async () => {}
    expect((await b.creer().reprendre(suivi.operationId, true)).entretiens.entretiens).toBe(2)
    expect(b.puts).toEqual(['entretiens/e1.json', 'entretiens/e2.json'])
  })
  test('reprise refuse une modification concurrente, y compris d’un succès confirmé', async () => {
    for (const id of ['e1', 'e2']) {
      const b = banc(natif); const p = await b.preparer()
      b.pieges.avant = async (chemin, init) => { if (chemin === 'entretiens/e2.json' && init?.method === 'PUT') throw new Error('coupure') }
      await expect(b.service.appliquer(p)).rejects.toThrow('incomplet')
      const autre = JSON.stringify({ ...JSON.parse(b.serveur.contenuDe(`entretiens/${id}.json`)!), lastModified: 'autre' })
      b.serveur.poser(`entretiens/${id}.json`, autre)
      b.pieges.avant = async () => {}
      await expect(b.creer().reprendre(b.service.lireSuivi()!.operationId, true)).rejects.toThrow('incomplet')
      expect(b.serveur.contenuDe(`entretiens/${id}.json`)).toBe(autre)
      expect(b.puts).toEqual(['entretiens/e1.json'])
    }
  })
})

describe('garanties du plan WebDAV', () => {
  test('toutes les mutations sont préparées avant publication des définitions et entretiens', async () => {
    const b = banc()
    const docs = structuredClone(documentsImportWebDAV)
    const table = JSON.parse(docs[0].texte)
    table.correspondances.push({ nature: 'texte', portee: 'corpus', entite: ['Règle partagée'], pseudos: ['Autre pseudo'] })
    docs[0].texte = JSON.stringify(table)
    const bilan = await b.service.appliquer(await b.preparer(docs))
    expect(bilan.ajouts).toBe(1)
    expect(b.puts).toEqual(['corpus.crp', 'entretiens/e1.json', 'entretiens/e2.json'])
    const autre = banc()
    table.correspondances[2].entite = ['Alias sans occurrence', 'Autre graphie']
    docs[0].texte = JSON.stringify(table)
    await expect(autre.service.appliquer(await autre.preparer(docs))).rejects.toThrow('avant publication')
    expect(autre.puts).toEqual([])
  })
  test('arrêt après le PUT mais avant confirmation du journal : reprise reconnaît le succès', async () => {
    const b = banc(); const p = await b.preparer()
    const original = JournalCorrespondancesWebDAV.prototype.ecrire
    let arret = false
    const ecrire = vi.spyOn(JournalCorrespondancesWebDAV.prototype, 'ecrire').mockImplementation(function (j) {
      if (!arret && j.fichiers[1].etat === 'confirme') { arret = true; throw new Error('arrêt de processus simulé') }
      return original.call(this, j)
    })
    try {
      await expect(b.service.appliquer(p)).rejects.toThrow('indéterminée')
      expect(b.puts).toEqual(['entretiens/e1.json'])
      ecrire.mockRestore()
      const suivi = b.service.lireSuivi()!
      await b.creer().reprendre(suivi.operationId, true)
      expect(b.puts).toEqual(['entretiens/e1.json', 'entretiens/e2.json'])
    } finally { ecrire.mockRestore() }
  })
  test('un aperçu périmé refuse toutes les écritures', async () => {
    const b = banc(); const p = await b.preparer()
    b.serveur.poser('entretiens/e2.json', JSON.stringify({ ...JSON.parse(entretienImportWebDAV()), lastModified: 'changé' }))
    await expect(b.service.appliquer(p)).rejects.toThrow('avant publication')
    expect(b.puts).toEqual([])
  })
  test('412 à l’envoi conserve le tiers et ne compense aucun succès', async () => {
    const b = banc(); const p = await b.preparer(); let course = false
    b.pieges.avant = async (chemin, init) => {
      if (!course && chemin === 'entretiens/e2.json' && init?.method === 'PUT') {
        course = true; b.serveur.poser(chemin, JSON.stringify({ ...JSON.parse(entretienImportWebDAV()), lastModified: 'tiers' }))
      }
    }
    await expect(b.service.appliquer(p)).rejects.toThrow('incomplet')
    expect(b.service.lireSuivi()).toMatchObject({ confirmes: 1, restants: 1, indeterminee: false })
    expect(JSON.parse(b.serveur.contenuDe('entretiens/e2.json')!).lastModified).toBe('tiers')
    expect(b.puts).toEqual(['entretiens/e1.json'])
  })
  test('corpus changé pendant l’inventaire ou avant un PUT : refus sans compensation', async () => {
    const b = banc(); let lu = false
    b.pieges.apres = async (chemin, init) => { if (!lu && chemin.startsWith('entretiens/') && init?.method === 'GET') { lu = true; b.serveur.poser('corpus.crp', JSON.stringify({ ...JSON.parse(corpusImportWebDAV()), nom: 'Autre' })) } }
    await expect(b.service.instantane()).rejects.toThrow('pendant l’inventaire')
    expect(b.puts).toEqual([])
  })
  test('corpus modifié après un premier succès : arrêt, tiers conservé et reprise refusée', async () => {
    const b = banc(); const p = await b.preparer()
    const corpusTiers = JSON.stringify({ ...JSON.parse(corpusImportWebDAV()), nom: 'Corpus concurrent' })
    b.pieges.apres = async (chemin, init) => { if (chemin === 'entretiens/e1.json' && init?.method === 'PUT') b.serveur.poser('corpus.crp', corpusTiers) }
    await expect(b.service.appliquer(p)).rejects.toThrow('incomplet')
    expect(b.puts).toEqual(['entretiens/e1.json'])
    expect(b.serveur.contenuDe('corpus.crp')).toBe(corpusTiers)
    b.pieges.apres = async () => {}
    await expect(b.creer().reprendre(b.service.lireSuivi()!.operationId, true)).rejects.toThrow('incomplet')
    expect(b.puts).toEqual(['entretiens/e1.json'])
  })
  test('perte du verrou au battement interdit tout PUT de données', async () => {
    const b = banc(); const p = await b.preparer()
    b.pieges.avant = async (chemin, init) => {
      if (chemin === 'verrous/e2.lock.json' && init?.method === 'PUT' && new Headers(init.headers).has('If-Match')) b.serveur.poser(chemin, '{"sessionId":"tiers"}')
    }
    await expect(b.service.appliquer(p)).rejects.toThrow('incomplet')
    expect(b.puts).toEqual([])
    expect(b.service.lireSuivi()).toMatchObject({ confirmes: 0, restants: 2, indeterminee: false })
  })
  test('ETag faible : aperçu refusé sans publication', async () => {
    const b = banc()
    const client = new ClientWebDAV({ baseUrl: b.serveur.baseUrl, identifiants: b.serveur.identifiants }, async (url, init) => {
      const r = await b.serveur.fetch(url, init)
      const headers = new Headers(r.headers); headers.set('ETag', 'W/"faible"')
      return new Response(r.body, { status: r.status, headers })
    })
    const service = serviceImportWebDAV(client, b.dir, false).service
    await expect(service.instantane()).rejects.toThrow('ETag fort')
    expect(b.puts).toEqual([])
  })
  test('un journal malformé ne permet jamais de reprendre une écriture', async () => {
    const b = banc(); const p = await b.preparer()
    b.pieges.avant = async (chemin, init) => { if (chemin === 'entretiens/e1.json' && init?.method === 'PUT') throw new Error('coupure') }
    await expect(b.service.appliquer(p)).rejects.toThrow('incomplet')
    const fichier = join(b.dir, '.correspondances-webdav.json')
    const brut = JSON.parse(readFileSync(fichier, 'utf8'))
    brut.fichiers[1].chemin = 'entretiens/../autre.json'
    writeFileSync(fichier, JSON.stringify(brut))
    await expect(b.creer().reprendre(brut.operationId, true)).rejects.toThrow('invalide')
    expect(b.puts).toEqual([])
  })
})
