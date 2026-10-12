import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { AjoutsVarianteAnonWebDAV } from '../../src/main/distant/ajoutsVarianteAnonWebDAV'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'

const max = { utilisateur: 'max', motDePasse: 'max-max-1234' }, olivier = { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' }
for (const port of [8080, 8081]) {
  const base = `http://localhost:${port}`
  const pret = await fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
  describe.skipIf(!pret)(`Ajout de variante Nextcloud réel :${port}`, () => {
    async function banc() {
      const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: max })
      const dossier = `sonde/ajout-variante-${randomUUID()}`
      await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
      const origin = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` })
      const tiers = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: olivier })
      await origin.creerDossier('entretiens'); await origin.creerDossier('verrous')
      const f = fixtureRenommageAnon(); f.corpus.reglesAnon.personne.pseudos = ['Claire']
      await origin.putTexte('corpus.json', JSON.stringify(f.corpus, null, 2), { ifNoneMatch: '*' })
      for (const s of f.sources) await origin.putTexte(`entretiens/${s.id}.json`, JSON.stringify(s.data, null, 2), { ifNoneMatch: '*' })
      const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-ajout-variante-nc-'))
      const requetes: { chemin: string; methode: string }[] = [], publies: string[] = [], miroir: string[] = []
      const pieges = { avant: async (_p: string, init: RequestInit | undefined) => init, apres: async (_p: string, _init: RequestInit | undefined, r: Response) => r }
      const transport: ImplementationFetch = async (url, init) => {
        const p = decodeURIComponent(new URL(String(url)).pathname).replace(`${new URL(origin.config.baseUrl).pathname}/`, '')
        requetes.push({ chemin: p, methode: init?.method ?? 'GET' }); init = await pieges.avant(p, init)
        const r = await fetch(url, init)
        if (p === 'corpus.json' && init?.method === 'PUT' && r.ok) publies.push(p)
        return pieges.apres(p, init, r)
      }
      const client = new ClientWebDAV(origin.config, transport)
      const service = () => new AjoutsVarianteAnonWebDAV({ client, dirLocal,
        identite: () => ({ userId: 'max', machineId: 'ajout-variante-synthetique', sessionId: randomUUID() }), miroir: (contenu) => { miroir.push(contenu) },
      })
      const moteur = service(), demande = { regleAvant: structuredClone(f.corpus.reglesAnon.personne), pseudo: 'Rebecca' }
      const tenir = async (id: string) => {
        const identite = () => ({ userId: 'olivier', machineId: 'autre-poste', sessionId: randomUUID() })
        const stable = identite(), provider = id !== 'corpus' && port === 8080 ? new ProviderFilesLock(tiers, () => stable) : new ProviderPutConditionnel(tiers, () => stable)
        const chemin = id !== 'corpus' && port === 8080 ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
        expect((await provider.acquerir(chemin)).ok).toBe(true)
        return () => provider.liberer(chemin)
      }
      const sources = () => Promise.all(f.sources.map((s) => origin.getTexteAvecEtag(`entretiens/${s.id}.json`)))
      return { f, origin, tiers, client, pieges, requetes, publies, miroir, moteur, service, demande, tenir, sources,
        nettoyer: async () => { await parent.supprimer(dossier); rmSync(dirLocal, { recursive: true, force: true }) } }
    }
    test('règle seule, entretien tenu par le second compte, bytes et ETags des entretiens conservés', { timeout: 120_000 }, async () => {
      const b = await banc(), rendre = await b.tenir('e1')
      try {
        const avant = await b.sources()
        expect(await b.moteur.appliquer(b.demande)).toMatchObject({ ajoute: true })
        const attendu = structuredClone(b.f.corpus); attendu.reglesAnon.personne.pseudos.push('Rebecca')
        expect(JSON.parse(await b.tiers.getTexte('corpus.json'))).toEqual(attendu); expect(await b.sources()).toEqual(avant)
        expect(b.requetes.some((r) => r.chemin.startsWith('entretiens/'))).toBe(false); expect(b.publies).toEqual(['corpus.json'])
      } finally { await rendre(); await b.nettoyer() }
    })
    test('corpus tenu puis doublon : aucune publication', { timeout: 120_000 }, async () => {
      const b = await banc(), rendre = await b.tenir('corpus')
      try {
        await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('ailleurs'); await rendre()
        expect(await b.moteur.appliquer({ ...b.demande, pseudo: ' CLAIRE ' })).toMatchObject({ ajoute: false })
        expect(b.publies).toEqual([])
      } finally { await rendre(); await b.nettoyer() }
    })
    test('catégorie fraîche divergente puis relecture et nouveau choix', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        const source = await b.tiers.getTexteAvecEtag('corpus.json'), c = JSON.parse(source.contenu); c.reglesAnon.personne.categorie = 'Autre'
        await b.tiers.putTexte('corpus.json', JSON.stringify(c, null, 2), { ifMatch: source.etag! })
        await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('changé')
        expect(await b.moteur.appliquer({ ...b.demande, regleAvant: c.reglesAnon.personne })).toMatchObject({ ajoute: true })
        expect(JSON.parse(await b.origin.getTexte('corpus.json')).reglesAnon.personne.categorie).toBe('Autre')
        expect(b.publies).toHaveLength(1)
      } finally { await b.nettoyer() }
    })
    test('concurrence tardive : If-Match refuse sans écrasement', { timeout: 120_000 }, async () => {
      const b = await banc(); let concurrent: unknown
      try {
        b.pieges.avant = async (p, init) => {
          if (p === 'corpus.json' && init?.method === 'PUT') {
            const s = await b.tiers.getTexteAvecEtag(p), c = JSON.parse(s.contenu); c.nom = 'Modification du second compte'
            await b.tiers.putTexte(p, JSON.stringify(c, null, 2), { ifMatch: s.etag! }); concurrent = c
          }
          return init
        }
        await expect(b.moteur.appliquer(b.demande)).rejects.toThrow(); expect(b.publies).toHaveLength(0)
        expect(JSON.parse(await b.origin.getTexte('corpus.json'))).toEqual(concurrent); expect(b.moteur.lireEnvoi()).toBeNull()
      } finally { await b.nettoyer() }
    })
    test('credential invalide au PUT : refus certain et pas de faux résultat acquis', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        b.pieges.avant = async (p, init) => { if (p === 'corpus.json' && init?.method === 'PUT') { const headers = new Headers(init.headers); headers.set('Authorization', `Basic ${Buffer.from('max:invalide').toString('base64')}`); return { ...init, headers } } return init }
        await expect(b.moteur.appliquer(b.demande)).rejects.toThrow(); expect(b.moteur.lireEnvoi()).toBeNull(); expect(b.publies).toHaveLength(0)
        expect(JSON.parse(await b.origin.getTexte('corpus.json')).reglesAnon.personne.pseudos).toEqual(['Claire'])
      } finally { await b.nettoyer() }
    })
    test('réponse acceptée perdue puis reconnaissance ; nouvelle instance ne rend pas le droit persistant', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        b.pieges.apres = async (p, init, r) => { if (p === 'corpus.json' && init?.method === 'PUT' && r.ok) { await r.body?.cancel(); throw new Error('Réponse perdue') } return r }
        await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('perdue'); expect(b.moteur.lireEnvoi()?.etat).toBe('envoi')
        const droit = await b.origin.getTexteAvecEtag('verrous/corpus.lock.json'), nouveau = b.service()
        await nouveau.reconcilier(); expect(await b.origin.getTexteAvecEtag('verrous/corpus.lock.json')).toEqual(droit)
        expect(b.publies).toHaveLength(1); expect(nouveau.lireEnvoi()).toBeNull()
        expect(JSON.parse(b.miroir[0]).reglesAnon.personne.pseudos).toEqual(['Claire', 'Rebecca'])
      } finally { await b.nettoyer() }
    })
    test('original seul après coupure avant réponse : aucune preuve de refus ni répétition', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        b.pieges.avant = async (p, init) => { if (p === 'corpus.json' && init?.method === 'PUT') throw new Error('Issue inconnue'); return init }
        await expect(b.moteur.appliquer(b.demande)).rejects.toThrow('inconnue')
        const droit = await b.origin.getTexteAvecEtag('verrous/corpus.lock.json')
        await expect(b.moteur.reconcilier()).rejects.toThrow('original'); await expect(b.service().reconcilier()).rejects.toThrow('original')
        expect(await b.origin.getTexteAvecEtag('verrous/corpus.lock.json')).toEqual(droit); expect(b.publies).toHaveLength(0)
      } finally { await b.nettoyer() }
    })
  })
}
