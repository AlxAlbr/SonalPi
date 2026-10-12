import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { GardePseudosWebDAV } from '../../src/main/distant/gardePseudosWebDAV'
import { fixtureRetraitVarianteAnon } from '../fixtures/retraitVarianteAnon'
import { serviceRetraitVarianteWebDAV } from '../fixtures/retraitVarianteAnonWebDAV'
import type { EntretienFichier } from '../../src/shared/format'

for (const port of [8080, 8081]) {
  const base = `http://localhost:${port}`
  const pret = await fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
  describe.skipIf(!pret)(`Retrait de variante Nextcloud :${port}`, () => {
    async function banc() {
      const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
      const dossier = `sonde/retrait-variante-${randomUUID()}`
      await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
      const origin = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` })
      const tiers = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' } })
      await origin.creerDossier('entretiens'); await origin.creerDossier('verrous')
      const f = fixtureRetraitVarianteAnon(), dir = mkdtempSync(join(tmpdir(), 'sonal-retrait-nc-'))
      await origin.putTexte('corpus.json', JSON.stringify(f.corpus, null, 2), { ifNoneMatch: '*' })
      for (const e of f.sources) await origin.putTexte(`entretiens/${e.id}.json`, JSON.stringify(e.data, null, 2), { ifNoneMatch: '*' })
      const puts: string[] = [], miroirs = new Map<string, string>(), panne = { reponse: '', lecture: '' }
      const transport: ImplementationFetch = async (url, init) => {
        const p = decodeURIComponent(new URL(String(url)).pathname).replace(`${new URL(origin.config.baseUrl).pathname}/`, '')
        if (init?.method === 'GET' && panne.lecture === p) throw new Error('Lecture synthétique perdue')
        const r = await fetch(url, init)
        if (init?.method === 'PUT' && r.ok && (p === 'corpus.json' || p.startsWith('entretiens/'))) {
          puts.push(p)
          if (panne.reponse === p) { panne.lecture = p; await r.body?.cancel(); throw new Error('Réponse synthétique perdue') }
        }
        return r
      }
      const client = new ClientWebDAV(origin.config, transport), natif = port === 8080
      const creer = () => serviceRetraitVarianteWebDAV(client, dir, natif, [], (p, c) => { miroirs.set(p, c) })
      const service = creer(), preparation = await service.preparer(f.demande)
      const tenir = async (id: string) => {
        const idSession = { userId: 'olivier', machineId: 'tiers', sessionId: randomUUID() }, identite = () => idSession
        const provider = natif ? new ProviderFilesLock(tiers, identite) : new ProviderPutConditionnel(tiers, identite)
        const chemin = natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
        expect((await provider.acquerir(chemin)).ok).toBe(true); return () => provider.liberer(chemin)
      }
      const reprendre = async (id: string, moteur = service) => { const p = await moteur.preparerReprise(id); return moteur.appliquer(p.token, true) }
      return { f, dir, origin, tiers, client, puts, miroirs, panne, service, creer, preparation, tenir, reprendre,
        nettoyer: async () => { await parent.supprimer(dossier); rmSync(dir, { recursive: true, force: true }) } }
    }
    test('six choix remplacés avec états et non-cible tenue conservés ; barrière puis retrait de la seule variante', { timeout: 120_000 }, async () => {
      const b = await banc(), rendre = await b.tenir('e3')
      try {
        const nonCible = await b.origin.getTexte('entretiens/e3.json')
        expect(await b.service.appliquer(b.preparation.token, true)).toMatchObject({ statut: 'termine', annotations: 6, exceptions: 3, incluses: 2, varianteRetiree: true })
        expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json', 'entretiens/e2.json', 'corpus.json'])
        expect(await b.origin.getTexte('entretiens/e3.json')).toBe(nonCible)
        for (const s of b.f.sources.slice(0, 2)) {
          const actuel = JSON.parse(await b.origin.getTexte(`entretiens/${s.id}.json`)), attendu = structuredClone(s.data)
          for (const a of attendu.annotations) if (a.regle === 'personne' && a.pseudo?.trim().toLowerCase() === 'claire') a.pseudo = 'Rebecca'
          attendu.lastModified = actuel.lastModified; expect(actuel).toEqual(attendu)
        }
        expect(JSON.parse(await b.origin.getTexte('corpus.json')).reglesAnon.personne.pseudos).toEqual(['Rebecca'])
      } finally { await rendre(); await b.nettoyer() }
    })
    test('cible tenue, exception ancienne refusée ; modification indépendante restante permise et reprise neuve', { timeout: 120_000 }, async () => {
      const b = await banc(), rendre = await b.tenir('e2')
      try {
        const r = await b.service.appliquer(b.preparation.token, true), acquis = await b.origin.getTexte('entretiens/e1.json')
        expect(r).toMatchObject({ statut: 'partiel', annotations: 3 })
        const identite = { userId: 'olivier', machineId: 'tiers', sessionId: `garde-${randomUUID()}` }
        const garde = new GardePseudosWebDAV(b.tiers, () => identite, b.dir)
        const ancien = b.f.sources[1].data
        await expect(garde.publier(JSON.stringify(ancien), JSON.stringify(ancien), async () => 'interdit', 'entretiens/e2.json')).rejects.toThrow('en cours de retrait')
        const s = await b.tiers.getTexteAvecEtag('entretiens/e3.json'), e = JSON.parse(s.contenu) as EntretienFichier
        e.meta.titre = 'Modification indépendante conservée'
        await garde.publier(JSON.stringify(e), s.contenu, async (garantir) => { garantir(); return b.tiers.putTexte('entretiens/e3.json', JSON.stringify(e), { ifMatch: s.etag! }) }, 'entretiens/e3.json')
        const independant = await b.origin.getTexte('entretiens/e3.json')
        await rendre(); expect(await b.reprendre(r.operationId, b.creer())).toMatchObject({ statut: 'termine', annotations: 6 })
        expect(await b.origin.getTexte('entretiens/e1.json')).toBe(acquis); expect(await b.origin.getTexte('entretiens/e3.json')).toBe(independant)
      } finally { await rendre(); await b.nettoyer() }
    })
    test('source changée et nouvel usage : aucun écrasement ni consentement étendu, bilan renouvelé', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        const s = await b.tiers.getTexteAvecEtag('entretiens/e2.json'), e = JSON.parse(s.contenu)
        e.meta.titre = 'Texte tiers conservé'; await b.tiers.putTexte('entretiens/e2.json', JSON.stringify(e), { ifMatch: s.etag! })
        const r = await b.service.appliquer(b.preparation.token, true); expect(r.annotations).toBe(3)
        const n = await b.tiers.getTexteAvecEtag('entretiens/e3.json'), nouveau = JSON.parse(n.contenu)
        nouveau.annotations[0].pseudo = 'Claire'; await b.tiers.putTexte('entretiens/e3.json', JSON.stringify(nouveau), { ifMatch: n.etag! })
        const p = await b.service.preparerReprise(r.operationId); expect(p.bilan.annotations).toBe(4)
        expect(await b.service.appliquer(p.token, true)).toMatchObject({ statut: 'termine', annotations: 7 })
        expect(JSON.parse(await b.origin.getTexte('entretiens/e2.json')).meta.titre).toBe('Texte tiers conservé')
        expect(b.puts.filter((p) => p === 'entretiens/e1.json')).toHaveLength(1)
      } finally { await b.nettoyer() }
    })
    test.each(['corpus.json', 'entretiens/e1.json'])('réponse perdue %s : preuve sans répétition et nouvelle instance sans droits hérités', { timeout: 120_000 }, async (chemin) => {
      const b = await banc()
      try {
        b.panne.reponse = chemin
        const r = await b.service.appliquer(b.preparation.token, true); expect(r.statut).toBe('indetermine')
        const droits = await b.origin.getTexteAvecEtag('verrous/corpus.lock.json'), puts = [...b.puts]
        b.panne.reponse = ''; b.panne.lecture = ''
        const neuf = b.creer(); await neuf.relireSuivi(r.operationId)
        expect(b.puts).toEqual(puts); expect(await b.origin.getTexteAvecEtag('verrous/corpus.lock.json')).toEqual(droits)
        expect((await b.reprendre(r.operationId, neuf)).statut).toBe('partiel'); expect(b.puts).toEqual(puts)
        await b.service.relireSuivi(r.operationId); expect((await b.reprendre(r.operationId)).statut).toBe('termine')
        expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json', 'entretiens/e2.json', 'corpus.json'])
      } finally { await b.nettoyer() }
    })
  })
}
