import { randomUUID } from 'node:crypto'
import { fork } from 'node:child_process'
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { SessionsDEntretien } from '../../src/main/distant/sessions'
import { MiroirWebDAV } from '../../src/main/distant/miroirWebDAV'
import { GardePseudosWebDAV } from '../../src/main/distant/gardePseudosWebDAV'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'
import { serviceRenommageWebDAV, preparationRenommageWebDAV } from '../fixtures/renommageAnonWebDAV'

let compilation: Promise<string> | undefined
let dirProcessus: string | undefined
function compilerProcessus() {
  return compilation ??= (async () => {
    dirProcessus = mkdtempSync(join(tmpdir(), 'sonal-arret-renommage-'))
    const outfile = join(dirProcessus, 'arret-renommage.cjs')
    await build({ entryPoints: ['test/fixtures/arretRenommageWebDAV.ts'], outfile, bundle: true, platform: 'node', format: 'cjs' })
    return outfile
  })()
}
afterAll(() => { if (dirProcessus) rmSync(dirProcessus, { recursive: true, force: true }) })
const max = { utilisateur: 'max', motDePasse: 'max-max-1234' }
const olivier = { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' }
for (const port of [8080, 8081]) {
  const base = `http://localhost:${port}`
  const pret = await fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
  describe.skipIf(!pret)(`Renommage ciblé Nextcloud réel :${port}`, () => {
    async function banc() {
      const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: max })
      const dossier = `sonde/renommage-${randomUUID()}`
      await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
      const origin = new ClientWebDAV({ baseUrl: `${parent.config.baseUrl}/${dossier}`, identifiants: max })
      await origin.creerDossier('entretiens'); await origin.creerDossier('verrous')
      const f = fixtureRenommageAnon(['e1', 'e2', 'e3'])
      f.sources[2].data.annotations = []
      await origin.putTexte('corpus.crp', JSON.stringify(f.corpus, null, 2), { ifNoneMatch: '*' })
      for (const s of f.sources) await origin.putTexte(`entretiens/${s.id}.json`, JSON.stringify(s.data, null, 2), { ifNoneMatch: '*' })
      const natif = port === 8080
      const dir = mkdtempSync(join(tmpdir(), 'sonal-renommage-nc-'))
      const puts: string[] = []
      const panne = { apresE1: false, lectures: false, miroir: false }
      const transport: ImplementationFetch = async (url, init) => {
        const chemin = decodeURIComponent(new URL(String(url)).pathname)
        if (panne.lectures && chemin.endsWith('/entretiens/e1.json') && init?.method === 'GET') throw new Error('lecture perdue')
        const r = await fetch(url, init)
        if (init?.method === 'PUT' && r.ok && (chemin.endsWith('/corpus.crp') || chemin.includes('/entretiens/'))) puts.push(chemin.split('/').slice(-2).join('/'))
        if (panne.apresE1 && chemin.endsWith('/entretiens/e1.json') && init?.method === 'PUT') {
          panne.lectures = true
          await r.body?.cancel(); throw new Error('réponse perdue')
        }
        return r
      }
      const client = new ClientWebDAV(origin.config, transport)
      const sessionsLocales: string[] = []
      const options = serviceRenommageWebDAV(client, dir, natif, sessionsLocales, () => { if (panne.miroir) throw new Error('miroir') })
      const preparation = preparationRenommageWebDAV(options.store, await options.service.instantane(), f.demande)
      const tiers = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: olivier })
      const reprendre = async (service = options.service) => {
        const r = await service.preparerReprise(service.lireSuivi()!.operationId)
        return service.appliquer(preparationRenommageWebDAV(options.store, r.instantane, r.demande, r))
      }
      const tenir = async (id: string) => {
        const identite = { userId: 'olivier', machineId: 'tiers', sessionId: randomUUID() }
        const provider = natif ? new ProviderFilesLock(tiers, () => identite) : new ProviderPutConditionnel(tiers, () => identite)
        const chemin = natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
        expect((await provider.acquerir(chemin)).ok).toBe(true)
        return () => provider.liberer(chemin)
      }
      return { parent, dossier, origin, client, tiers, dir, puts, panne, natif, preparation, f, sessionsLocales, tenir, reprendre, ...options,
        nettoyer: async () => {
          await parent.supprimer(dossier)
          rmSync(dir, { recursive: true, force: true })
        },
      }
    }
    test('définition puis deux fichiers, entretien non ciblé tenu par le second compte', { timeout: 120_000 }, async () => {
      const b = await banc(); const liberer = await b.tenir('e3')
      try {
        const nonCible = await b.origin.getTexte('entretiens/e3.json')
        expect(await b.service.appliquer(b.preparation)).toMatchObject({ statut: 'termine', annotations: 4, entretiens: 2, incluses: 2 })
        expect(b.puts).toHaveLength(3)
        expect(b.puts[1]).toBe('entretiens/e1.json'); expect(b.puts[2]).toBe('entretiens/e2.json')
        const apres = JSON.parse(await b.tiers.getTexte('entretiens/e1.json'))
        expect(apres.locuteurs).toEqual(b.f.sources[0].data.locuteurs)
        expect(apres.definitionsAnonLocales).toEqual(b.f.sources[0].data.definitionsAnonLocales)
        expect(await b.origin.getTexte('entretiens/e3.json')).toBe(nonCible)
      } finally { await liberer(); await b.nettoyer() }
    })
    test('cible tenue : lot partiel, relance et reprise fraîche sans rejouer le succès acquis', { timeout: 120_000 }, async () => {
      const b = await banc(); const liberer = await b.tenir('e2')
      try {
        expect(await b.service.appliquer(b.preparation)).toMatchObject({ statut: 'partiel', annotations: 2, definitionModifiee: true })
        const premier = await b.origin.getTexte('entretiens/e1.json')
        await liberer()
        expect(await b.reprendre(b.creer())).toMatchObject({ statut: 'termine', annotations: 4, entretiens: 2 })
        expect(b.puts).toHaveLength(3)
        expect(await b.origin.getTexte('entretiens/e1.json')).toBe(premier)
      } finally { await liberer(); await b.nettoyer() }
    })
    test('source ciblée modifiée : différée, conservée dans la nouvelle préparation', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        const source = await b.tiers.getTexteAvecEtag('entretiens/e2.json')
        const data = JSON.parse(source.contenu); data.meta.titre = 'Modification du second compte'
        await b.tiers.putTexte('entretiens/e2.json', JSON.stringify(data), { ifMatch: source.etag! })
        expect(await b.service.appliquer(b.preparation)).toMatchObject({ statut: 'partiel', annotations: 2 })
        expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 4 })
        expect(JSON.parse(await b.origin.getTexte('entretiens/e2.json')).meta.titre).toBe('Modification du second compte')
      } finally { await b.nettoyer() }
    })
    test('réponse et relecture perdues : verrous inconnus non repris par une autre instance', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        b.panne.apresE1 = true
        expect(await b.service.appliquer(b.preparation)).toMatchObject({ statut: 'indetermine', annotations: 0 })
        b.panne.apresE1 = false; b.panne.lectures = false
        const avant = await b.origin.getTexte('entretiens/e1.json')
        await expect(b.reprendre(b.creer())).rejects.toThrow('verrou reste tenu')
        expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 4 })
        expect(await b.origin.getTexte('entretiens/e1.json')).toBe(avant)
        expect(b.puts).toHaveLength(3)
      } finally { await b.nettoyer() }
    })
    test('session non ciblée maintenue : ancien choix nouveau refusé, variante actuelle publiable', { timeout: 120_000 }, async () => {
      const b = await banc()
      const identite = () => ({ userId: 'max', machineId: 'session-non-cible', sessionId: randomUUID() })
      const sessions = new SessionsDEntretien(b.origin, new MiroirWebDAV(b.origin, b.dir), identite, undefined, undefined,
        { verrouNatif: b.natif, gardePseudos: new GardePseudosWebDAV(b.origin, identite, b.dir) })
      try {
        expect(await sessions.ouvrir('e3')).toMatchObject({ etat: 'a-nous' })
        b.sessionsLocales.push('e3')
        expect(await b.service.appliquer(b.preparation)).toMatchObject({ statut: 'termine' })
        const candidat = JSON.parse(readFileSync(join(b.dir, 'entretiens/e3.json'), 'utf8'))
        candidat.annotations.push({ ...b.f.sources[0].data.annotations[0], id: 'nouvelle' })
        writeFileSync(join(b.dir, 'entretiens/e3.json'), JSON.stringify(candidat)); sessions.noterSale('e3')
        await expect(sessions.publier('e3')).rejects.toThrow('variante choisie n’est plus déclarée')
        expect(sessions.etat('e3')).toMatchObject({ etat: 'a-nous', sale: true })
        candidat.annotations[0].pseudo = 'Nouvelle'
        writeFileSync(join(b.dir, 'entretiens/e3.json'), JSON.stringify(candidat)); sessions.noterSale('e3')
        expect(await sessions.publier('e3')).toEqual({ ok: true })
        expect(await sessions.fermer('e3')).toMatchObject({ fermee: true })
      } finally {
        if (sessions.etat('e3').etat === 'a-nous') {
          writeFileSync(join(b.dir, 'entretiens/e3.json'), await b.origin.getTexte('entretiens/e3.json'))
          sessions.noterSale('e3'); await sessions.fermer('e3')
        }
        sessions.dispose(); await b.nettoyer()
      }
    })
    test('SIGKILL après PUT accepté : refus des verrous persistants, intervention extérieure puis aucune répétition', { timeout: 180_000 }, async () => {
      const b = await banc()
      const enfant = fork(await compilerProcessus(), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
      const sortie = new Promise<void>((resolve) => { enfant.once('exit', () => resolve()) })
      try {
        const arret = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Point d’arrêt non atteint.')), 90_000)
          enfant.once('message', (message) => { clearTimeout(timeout); expect(message).toBe('premier-put-accepte'); resolve() })
          enfant.once('error', (e) => { clearTimeout(timeout); reject(e) })
          enfant.once('exit', () => { clearTimeout(timeout); reject(new Error('Sortie avant le point d’arrêt.')) })
        })
        enfant.send({ config: b.origin.config, dir: b.dir, natif: b.natif, demande: b.f.demande })
        await arret
        enfant.kill('SIGKILL'); await sortie
        const relance = b.creer()
        expect(relance.lireSuivi()).toMatchObject({ indeterminee: true, bilan: { annotations: 0 } })
        const premier = await b.origin.getTexte('entretiens/e1.json')
        await expect(b.reprendre(relance)).rejects.toThrow('verrou reste tenu')
        expect(b.puts).toEqual([])
        // Le processus synthétique est mort : cette libération extérieure n’est pas un geste de l’application.
        const corpus = await b.origin.getTexteAvecEtag('verrous/corpus.lock.json')
        await b.origin.supprimer('verrous/corpus.lock.json', corpus.etag!)
        if (b.natif) await b.origin.deverrouiller('entretiens/e1.json')
        else {
          const entretien = await b.origin.getTexteAvecEtag('verrous/e1.lock.json')
          await b.origin.supprimer('verrous/e1.lock.json', entretien.etag!)
        }
        expect(await b.reprendre(relance)).toMatchObject({ statut: 'termine', annotations: 4 })
        expect(b.puts).toEqual(['entretiens/e2.json'])
        expect(await b.origin.getTexte('entretiens/e1.json')).toBe(premier)
      } finally {
        if (enfant.exitCode === null && enfant.signalCode === null) { enfant.kill('SIGKILL'); await sortie }
        await b.nettoyer()
      }
    })
  })
}
