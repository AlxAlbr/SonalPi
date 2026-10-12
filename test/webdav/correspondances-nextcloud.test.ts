import { randomUUID } from 'node:crypto'
import { fork } from 'node:child_process'
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { preparerContexteNextcloud, type ContexteCorpusDistant } from '../../src/main/distant/contexte'
import { corpusImportWebDAV, entretienImportWebDAV, serviceImportWebDAV, preparationImportWebDAV } from '../fixtures/correspondancesWebDAV'

let compilation: Promise<string> | undefined
let dirProcessus: string | undefined
function compilerProcessus() {
  return compilation ??= (async () => {
    dirProcessus = mkdtempSync(join(tmpdir(), 'sonal-arret-import-'))
    const outfile = join(dirProcessus, 'arret-import.cjs')
    await build({ entryPoints: ['test/fixtures/arretImportWebDAV.ts'], outfile, bundle: true, platform: 'node', format: 'cjs' })
    return outfile
  })()
}
afterAll(() => { if (dirProcessus) rmSync(dirProcessus, { recursive: true, force: true }) })
const max = { utilisateur: 'max', motDePasse: 'max-max-1234' }
const olivier = { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' }
for (const port of [8080, 8081]) {
  const base = `http://localhost:${port}`
  const pret = await fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
  describe.skipIf(!pret)(`Correspondances Nextcloud réel :${port}`, () => {
    async function banc() {
      const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: max })
      const dossier = `sonde/correspondances-${randomUUID()}`
      await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
      const origin = new ClientWebDAV({ baseUrl: `${parent.config.baseUrl}/${dossier}`, identifiants: max })
      await origin.creerDossier('entretiens'); await origin.creerDossier('verrous')
      await origin.putTexte('corpus.json', corpusImportWebDAV(), { ifNoneMatch: '*' })
      for (const id of ['e1', 'e2']) await origin.putTexte(`entretiens/${id}.json`, entretienImportWebDAV(), { ifNoneMatch: '*' })
      const natif = port === 8080
      const dir = mkdtempSync(join(tmpdir(), 'sonal-correspondances-nc-'))
      const puts: string[] = []
      const panne = { avantE2: false, apresE1: false, lectures: false }
      const transport: ImplementationFetch = async (url, init) => {
        const chemin = decodeURIComponent(new URL(String(url)).pathname)
        if (panne.lectures && chemin.endsWith('/entretiens/e1.json') && init?.method === 'GET') throw new Error('lecture perdue')
        if (panne.avantE2 && chemin.endsWith('/entretiens/e2.json') && init?.method === 'PUT') throw new Error('avant envoi')
        const r = await fetch(url, init)
        if (init?.method === 'PUT' && chemin.includes('/entretiens/') && r.ok) puts.push(chemin)
        if (panne.apresE1 && chemin.endsWith('/entretiens/e1.json') && init?.method === 'PUT') {
          await r.body?.cancel(); throw new Error('réponse perdue')
        }
        return r
      }
      const client = new ClientWebDAV(origin.config, transport)
      const options = serviceImportWebDAV(client, dir, natif)
      const preparation = preparationImportWebDAV(options.store, await options.service.instantane())
      const tiers = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: olivier })
      return { parent, dossier, origin, client, tiers, dir, puts, panne, natif, preparation, ...options,
        nettoyer: async () => { await parent.supprimer(dossier); rmSync(dir, { recursive: true, force: true }) },
      }
    }
    test.skipIf(port !== 8080)('un verrou natif peut changer la version sans changer les octets', { timeout: 120_000 }, async () => {
      const b = await banc()
      const provider = new ProviderFilesLock(b.origin, () => ({ userId: 'max', machineId: 'sonde', sessionId: randomUUID() }))
      try {
        const avant = await b.origin.getTexteAvecEtag('entretiens/e2.json')
        expect((await provider.acquerir('entretiens/e2.json')).ok).toBe(true)
        const verrouille = await b.origin.getTexteAvecEtag('entretiens/e2.json')
        await provider.liberer('entretiens/e2.json')
        const apres = await b.origin.getTexteAvecEtag('entretiens/e2.json')
        expect(verrouille.contenu).toBe(avant.contenu); expect(apres.contenu).toBe(avant.contenu)
      } finally { await provider.liberer('entretiens/e2.json'); await b.nettoyer() }
    })
    test('préparation complète puis interruption au deuxième fichier, reprise sans premier PUT supplémentaire', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        b.panne.avantE2 = true
        await expect(b.service.appliquer(b.preparation)).rejects.toThrow('incomplet')
        const suivi = b.service.lireSuivi()!
        expect(suivi).toMatchObject({ confirmes: 1, restants: 1, indeterminee: true })
        expect(JSON.parse(await b.origin.getTexte('entretiens/e1.json')).locuteurs[0]).toMatchObject({ personneRef: 'personne-synthetique', pseudo: 'Claire' })
        expect(await b.origin.getTexte('entretiens/e2.json')).toBe(entretienImportWebDAV())
        b.panne.avantE2 = false
        expect((await b.creer().reprendre(suivi.operationId, true)).entretiens.entretiens).toBe(2)
        expect(b.puts).toHaveLength(2)
        expect(b.puts[0]).toMatch(/e1\.json$/); expect(b.puts[1]).toMatch(/e2\.json$/)
        const doc = JSON.parse(await b.tiers.getTexte('entretiens/e2.json'))
        expect(doc.corpsTexte).toEqual(JSON.parse(entretienImportWebDAV()).corpsTexte)
        expect(doc.annotations).toEqual(JSON.parse(entretienImportWebDAV()).annotations)
        expect(doc.definitionsAnonLocales[0].entite).toEqual(['Alias sans occurrence', 'Autre graphie'])
        expect(b.service.lireSuivi()).toBeNull()
      } finally { await b.nettoyer() }
    })
    test('bail tiers refuse tout le lot avant publication', { timeout: 120_000 }, async () => {
      const b = await banc()
      const id = { userId: 'olivier', machineId: 'banc-tiers', sessionId: randomUUID() }
      const verrou = b.natif ? new ProviderFilesLock(b.tiers, () => id) : new ProviderPutConditionnel(b.tiers, () => id)
      const chemin = b.natif ? 'entretiens/e2.json' : 'verrous/e2.lock.json'
      try {
        expect((await verrou.acquerir(chemin)).ok).toBe(true)
        await expect(b.service.appliquer(b.preparation)).rejects.toThrow('avant publication')
        expect(b.puts).toEqual([])
        expect(await b.origin.getTexte('entretiens/e1.json')).toBe(entretienImportWebDAV())
      } finally { await verrou.liberer(chemin); await b.nettoyer() }
    })
    test('réponse et relecture perdues, relance reconnaît le PUT accepté sans rejeu', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        b.panne.apresE1 = true
        const ancien = b.service.lireSuivi()
        expect(ancien).toBeNull()
        let accepte = false
        const transport: ImplementationFetch = async (url, init) => {
          const chemin = decodeURIComponent(new URL(String(url)).pathname)
          if (accepte && chemin.endsWith('/entretiens/e1.json') && init?.method === 'GET') throw new Error('relecture perdue')
          const r = await fetch(url, init)
          if (chemin.endsWith('/entretiens/e1.json') && init?.method === 'PUT') { accepte = true; await r.body?.cancel(); throw new Error('réponse perdue') }
          return r
        }
        const { service, store } = serviceImportWebDAV(new ClientWebDAV(b.origin.config, transport), b.dir, b.natif)
        await expect(service.appliquer({ ...b.preparation, store })).rejects.toThrow('incomplet')
        const suivi = service.lireSuivi()!
        const avant = await b.origin.getTexteAvecEtag('entretiens/e1.json')
        b.panne.apresE1 = false
        const relance = b.creer()
        await relance.reprendre(suivi.operationId, true)
        const apres = await b.origin.getTexteAvecEtag('entretiens/e1.json')
        expect(apres.contenu).toBe(avant.contenu)
        if (!b.natif) expect(apres.etag).toBe(avant.etag)
        expect(b.puts).toHaveLength(1); expect(b.puts[0]).toMatch(/e2\.json$/)
      } finally { await b.nettoyer() }
    })
    test('contexte réel : garde des éditions et définitions, relance puis reprise confirmée', { timeout: 180_000 }, async () => {
      const b = await banc()
      let contexte: ContexteCorpusDistant | undefined
      const ouvrir = async () => {
        const identite = { userId: 'max', machineId: 'qualification-contexte', sessionId: randomUUID() }
        return (await preparerContexteNextcloud({
          id: 'qualification-correspondances', dirLocal: b.dir, client: b.client, verrouNatif: b.natif,
          identite: () => identite,
        })).contexte
      }
      try {
        contexte = await ouvrir()
        const preparation = preparationImportWebDAV(contexte.store, await contexte.instantaneCorrespondances())
        b.panne.avantE2 = true
        await expect(contexte.importerCorrespondances(preparation)).rejects.toThrow('incomplet')
        const suivi = contexte.lireSuiviImportCorrespondances()!
        expect(suivi).toMatchObject({ confirmes: 1, restants: 1 })
        expect(contexte.store.lireEntretien('e1')).toMatchObject({ ok: true, data: { locuteurs: [{ pseudo: 'Claire' }] } })
        await contexte.fermer()
        b.panne.avantE2 = false
        contexte = await ouvrir()
        expect(contexte.lireSuiviImportCorrespondances()).toEqual(suivi)
        await expect(contexte.ouvrirEntretienPourEdition('e1')).rejects.toThrow('import WebDAV')
        await expect(contexte.executerDefinitions(() => null)).rejects.toThrow('import WebDAV')
        await expect(contexte.reprendreImportCorrespondances(suivi.operationId, false)).rejects.toThrow('Confirmez explicitement')
        expect((await contexte.reprendreImportCorrespondances(suivi.operationId, true)).entretiens?.entretiens).toBe(2)
        expect(b.puts).toHaveLength(2)
        expect(contexte.lireSuiviImportCorrespondances()).toBeNull()
        await contexte.fermer()
      } finally { contexte?.sessions.dispose(); contexte?.arreterPresence(); await b.nettoyer() }
    })
    test('SIGKILL : verrous persistants refusés, libération extérieure puis reprise sans rejeu', { timeout: 180_000 }, async () => {
      const b = await banc()
      const enfant = fork(await compilerProcessus(), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
      const sortie = new Promise<void>((resolve) => { enfant.once('exit', () => resolve()) })
      try {
        const pret = new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Le processus n’a pas atteint le point d’arrêt.')), 90_000)
          enfant.once('message', (message) => { clearTimeout(timeout); resolve(String(message)) })
          enfant.once('error', (e) => { clearTimeout(timeout); reject(e) })
          enfant.once('exit', () => { clearTimeout(timeout); reject(new Error('Le processus est sorti avant le point d’arrêt.')) })
        })
        enfant.send({ config: b.origin.config, dir: b.dir, natif: b.natif })
        expect(await pret).toBe('verrous-persistants')
        enfant.kill('SIGKILL')
        await sortie
        expect(enfant.signalCode).toBe('SIGKILL')
        const suivi = b.service.lireSuivi()!
        expect(suivi).toMatchObject({ confirmes: 1, restants: 1, indeterminee: true })
        const premier = await b.origin.getTexte('entretiens/e1.json')
        await expect(b.creer().reprendre(suivi.operationId, true)).rejects.toThrow('Aucune libération automatique')
        expect(b.puts).toEqual([])
        // Dans ce scénario synthétique, la mort du détenteur est prouvée par le parent.
        const corpus = await b.origin.getTexteAvecEtag('verrous/corpus.lock.json')
        await b.origin.supprimer('verrous/corpus.lock.json', corpus.etag!)
        if (b.natif) {
          await expect(b.creer().reprendre(suivi.operationId, true)).rejects.toThrow('Aucune libération automatique')
          for (const id of ['e1', 'e2']) {
            expect((await b.origin.etatVerrouNatif(`entretiens/${id}.json`))?.verrouille).toBe(true)
          }
          expect(b.puts).toEqual([])
          for (const id of ['e1', 'e2']) await b.origin.deverrouiller(`entretiens/${id}.json`)
        } else {
          for (const id of ['e1', 'e2']) {
            const verrou = await b.origin.getTexteAvecEtag(`verrous/${id}.lock.json`)
            await b.origin.supprimer(`verrous/${id}.lock.json`, verrou.etag!)
          }
        }
        await b.creer().reprendre(suivi.operationId, true)
        expect(await b.origin.getTexte('entretiens/e1.json')).toBe(premier)
        expect(b.puts).toHaveLength(1)
        expect(b.puts[0]).toMatch(/e2\.json$/)
        expect(b.service.lireSuivi()).toBeNull()
      } finally {
        if (enfant.exitCode === null && enfant.signalCode === null) enfant.kill('SIGKILL')
        await sortie
        if (b.natif) for (const id of ['e1', 'e2']) await b.origin.deverrouiller(`entretiens/${id}.json`).catch(() => {})
        await b.nettoyer()
      }
    })
    test('modification concurrente après échec : aucune compensation ni écrasement à la reprise', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        b.panne.avantE2 = true
        await expect(b.service.appliquer(b.preparation)).rejects.toThrow('incomplet')
        const courant = await b.tiers.getTexteAvecEtag('entretiens/e2.json')
        const concurrent = JSON.stringify({ ...JSON.parse(courant.contenu), lastModified: '2026-11-01T00:00:00.000Z' }, null, 2)
        await b.tiers.putTexte('entretiens/e2.json', concurrent, { ifMatch: courant.etag! })
        b.panne.avantE2 = false
        await expect(b.creer().reprendre(b.service.lireSuivi()!.operationId, true)).rejects.toThrow('incomplet')
        expect(await b.origin.getTexte('entretiens/e2.json')).toBe(concurrent)
        expect(b.puts).toHaveLength(1)
      } finally { await b.nettoyer() }
    })
  })
}
