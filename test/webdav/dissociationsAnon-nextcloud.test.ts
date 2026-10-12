import { randomUUID } from 'node:crypto'
import { fork } from 'node:child_process'
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { GardePseudosWebDAV } from '../../src/main/distant/gardePseudosWebDAV'
import { fixtureDissociationAnon } from '../fixtures/dissociationAnon'
import { serviceDissociationWebDAV } from '../fixtures/dissociationAnonWebDAV'
import type { CorpusFichier, EntretienFichier } from '../../src/shared/format'

const max = { utilisateur: 'max', motDePasse: 'max-max-1234' }, olivier = { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' }
let compilation: Promise<string> | undefined, dirProcessus: string | undefined
const compiler = () => compilation ??= (async () => {
  dirProcessus = mkdtempSync(join(tmpdir(), 'sonal-arret-dissociation-'))
  const outfile = join(dirProcessus, 'arret.cjs')
  await build({ entryPoints: ['test/fixtures/arretDissociationWebDAV.ts'], outfile, bundle: true, platform: 'node', format: 'cjs' })
  return outfile
})()
afterAll(() => { if (dirProcessus) rmSync(dirProcessus, { recursive: true, force: true }) })
for (const port of [8080, 8081]) {
  const base = `http://localhost:${port}`
  const pret = await fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
  describe.skipIf(!pret)(`Dissociation Nextcloud réelle :${port}`, () => {
    async function banc() {
      const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: max })
      const dossier = `sonde/dissociation-${randomUUID()}`
      await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
      const origin = new ClientWebDAV({ baseUrl: `${parent.config.baseUrl}/${dossier}`, identifiants: max })
      const tiers = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: olivier })
      await origin.creerDossier('entretiens'); await origin.creerDossier('verrous')
      const f = fixtureDissociationAnon()
      await origin.putTexte('corpus.json', JSON.stringify(f.corpus, null, 2), { ifNoneMatch: '*' })
      for (const s of f.sources) await origin.putTexte(`entretiens/${s.id}.json`, JSON.stringify(s.data, null, 2), { ifNoneMatch: '*' })
      const dir = mkdtempSync(join(tmpdir(), 'sonal-dissociation-nc-')), natif = port === 8080
      const puts: string[] = [], miroirs = new Map<string, string>()
      const panne = { reponse: '' as string, lectures: '' as string }
      const avant = { action: async (_p: string, _init?: RequestInit) => {} }
      const transport: ImplementationFetch = async (url, init) => {
        const p = decodeURIComponent(new URL(String(url)).pathname).replace(`${new URL(origin.config.baseUrl).pathname}/`, '')
        if (panne.lectures === p && init?.method === 'GET') throw new Error('lecture perdue')
        await avant.action(p, init)
        const r = await fetch(url, init)
        if (init?.method === 'PUT' && r.ok && (p === 'corpus.json' || p.startsWith('entretiens/'))) {
          puts.push(p)
          if (panne.reponse === p) { panne.lectures = p; await r.body?.cancel(); throw new Error('réponse perdue') }
        }
        return r
      }
      const client = new ClientWebDAV(origin.config, transport)
      const creer = () => serviceDissociationWebDAV(client, dir, natif, [], (p, c) => { miroirs.set(p, c) })
      const service = creer(), preparation = await service.preparer(f.demande)
      const tenir = async (id: string) => {
        const identite = { userId: 'olivier', machineId: 'tiers-dissociation', sessionId: randomUUID() }
        const provider = natif ? new ProviderFilesLock(tiers, () => identite) : new ProviderPutConditionnel(tiers, () => identite)
        const chemin = natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
        expect((await provider.acquerir(chemin)).ok).toBe(true)
        return () => provider.liberer(chemin)
      }
      const reprendre = async (id: string, moteur = service) => {
        const p = await moteur.preparerReprise(id); return moteur.appliquer(p.token, true)
      }
      return { parent, dossier, origin, tiers, dir, natif, puts, miroirs, panne, avant, f, service, preparation, creer, tenir, reprendre,
        nettoyer: async () => { await parent.supprimer(dossier); rmSync(dir, { recursive: true, force: true }) } }
    }
    test('barrière, transferts et retrait ; aucune écriture de la non-cible tenue par le second compte', { timeout: 120_000 }, async () => {
      const b = await banc(), rendre = await b.tenir('e3')
      try {
        const avant = await b.origin.getTexte('entretiens/e3.json')
        expect(await b.service.appliquer(b.preparation.token, true)).toMatchObject({ statut: 'termine', annotations: 8, regleRetiree: true })
        expect(b.puts).toEqual(['corpus.json', 'entretiens/e1.json', 'entretiens/e2.json', 'corpus.json'])
        expect(await b.origin.getTexte('entretiens/e3.json')).toBe(avant)
        const apres = JSON.parse(await b.tiers.getTexte('entretiens/e1.json')) as EntretienFichier
        expect(apres.locuteurs).toEqual(b.f.sources[0].data.locuteurs)
        expect(apres.definitionsAnonLocales).toContainEqual(b.preparation.definitionLocale)
        expect(apres.annotations).toEqual(b.f.sources[0].data.annotations.map((a) => {
          const copie = structuredClone(a); if (copie.regle === 'personne') delete copie.regle; return copie
        }))
        const c = JSON.parse(await b.origin.getTexte('corpus.json')) as CorpusFichier
        expect(c.reglesAnon.personne).toBeUndefined(); expect(c.dissociationAnon).toBeUndefined()
      } finally { await rendre(); await b.nettoyer() }
    })
    test('cible tenue, refus réel des anciens liens et de la perte de mémoire ; reprise avec consentement frais', { timeout: 120_000 }, async () => {
      const b = await banc(), rendre = await b.tenir('e2')
      try {
        const r = await b.service.appliquer(b.preparation.token, true)
        expect(r).toMatchObject({ statut: 'partiel', annotations: 4 })
        const original = await b.origin.getTexte('entretiens/e1.json')
        const identite = () => ({ userId: 'olivier', machineId: 'tiers-pub', sessionId: `garde-${randomUUID()}` })
        const garde = new GardePseudosWebDAV(b.tiers, identite, b.dir)
        const source = await b.tiers.getTexteAvecEtag('entretiens/e1.json'), candidat = JSON.parse(source.contenu) as EntretienFichier
        candidat.definitionsAnonLocales = []
        const envoyer = async (garantir: () => void) => { garantir(); return b.tiers.putTexte('entretiens/e1.json', JSON.stringify(candidat), { ifMatch: source.etag! }) }
        await expect(garde.publier(JSON.stringify(candidat), source.contenu, envoyer, 'entretiens/e1.json')).rejects.toThrow('déclaration locale complète')
        await expect(garde.publier(JSON.stringify(b.f.sources[1].data), JSON.stringify(b.f.sources[1].data), envoyer, 'entretiens/e2.json')).rejects.toThrow('ancien lien')
        expect(await b.origin.getTexte('entretiens/e1.json')).toBe(original)
        await rendre()
        expect(await b.reprendre(r.operationId, b.creer())).toMatchObject({ statut: 'termine', annotations: 8 })
        expect(await b.origin.getTexte('entretiens/e1.json')).toBe(original)
      } finally { await rendre(); await b.nettoyer() }
    })
    test('cible modifiée par le second compte : aucune perte, reprise sur sa copie fraîche', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        const source = await b.tiers.getTexteAvecEtag('entretiens/e2.json'), e = JSON.parse(source.contenu)
        e.meta.titre = 'Modification indépendante'; await b.tiers.putTexte('entretiens/e2.json', JSON.stringify(e), { ifMatch: source.etag! })
        const r = await b.service.appliquer(b.preparation.token, true)
        expect(r).toMatchObject({ statut: 'partiel', annotations: 4 })
        expect(await b.reprendre(r.operationId)).toMatchObject({ statut: 'termine', annotations: 8 })
        expect(JSON.parse(await b.tiers.getTexte('entretiens/e2.json')).meta.titre).toBe('Modification indépendante')
      } finally { await b.nettoyer() }
    })
    test('perte directe de mémoire acquise : retrait suspendu, aucune réparation forcée', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        b.avant.action = async (p, init) => {
          if (p === 'entretiens/e2.json' && init?.method === 'PUT') {
            const s = await b.tiers.getTexteAvecEtag('entretiens/e1.json'), e = JSON.parse(s.contenu)
            e.definitionsAnonLocales = []
            await b.tiers.putTexte('entretiens/e1.json', JSON.stringify(e), { ifMatch: s.etag! })
          }
        }
        const r = await b.service.appliquer(b.preparation.token, true)
        expect(r).toMatchObject({ statut: 'partiel', annotations: 8, regleRetiree: false })
        const acquis = await b.origin.getTexte('entretiens/e1.json')
        await expect(b.service.preparerReprise(r.operationId)).rejects.toThrow('déclaration locale acquise')
        expect(await b.origin.getTexte('entretiens/e1.json')).toBe(acquis)
        expect(b.puts).toHaveLength(3)
      } finally { await b.nettoyer() }
    })
    test('réponse perdue : reconnaissance vivante sans rejeu ; une nouvelle instance refuse les droits persistants', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        b.panne.reponse = 'entretiens/e1.json'
        const r = await b.service.appliquer(b.preparation.token, true)
        expect(r).toMatchObject({ statut: 'indetermine', annotations: 0 })
        b.panne.reponse = ''; b.panne.lectures = ''
        const acquis = await b.origin.getTexte('entretiens/e1.json')
        await expect(b.creer().relireSuivi(r.operationId)).rejects.toThrow('verrou reste tenu')
        expect(await b.service.relireSuivi(r.operationId)).toMatchObject({ annotations: 4, statut: 'partiel' })
        expect(await b.reprendre(r.operationId)).toMatchObject({ statut: 'termine', annotations: 8 })
        expect(await b.origin.getTexte('entretiens/e1.json')).toBe(acquis)
        expect(b.puts).toHaveLength(4)
      } finally { await b.nettoyer() }
    })
    test('barrière et retrait perdus : chaque phase reconnue sans deuxième PUT', { timeout: 120_000 }, async () => {
      const b = await banc()
      try {
        b.panne.reponse = 'corpus.json'
        const debut = await b.service.appliquer(b.preparation.token, true)
        expect(debut).toMatchObject({ statut: 'indetermine', annotations: 0 })
        b.panne.reponse = ''; b.panne.lectures = ''
        await b.service.relireSuivi(debut.operationId)
        b.avant.action = async (p, init) => {
          if (p === 'corpus.json' && init?.method === 'PUT' && !JSON.parse(init.body as string).dissociationAnon) b.panne.reponse = 'corpus.json'
        }
        const fin = await b.reprendre(debut.operationId)
        expect(fin).toMatchObject({ statut: 'indetermine', annotations: 8 })
        b.panne.reponse = ''; b.panne.lectures = ''
        expect(await b.service.relireSuivi(fin.operationId)).toMatchObject({ statut: 'termine', regleRetiree: true })
        expect(b.puts).toHaveLength(4)
      } finally { await b.nettoyer() }
    })
    test('SIGKILL réel : refus du bail persistant, libération extérieure vérifiée puis seulement le travail restant', { timeout: 180_000 }, async () => {
      const b = await banc(), enfant = fork(await compiler(), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
      const sortie = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => enfant.once('exit', (code, signal) => resolve({ code, signal })))
      try {
        const arret = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Point d’arrêt non atteint.')), 90_000)
          enfant.once('message', (m) => { clearTimeout(timeout); expect(m).toBe('premier-transfert-accepte'); resolve() })
          enfant.once('error', (e) => { clearTimeout(timeout); reject(e) })
          enfant.once('exit', () => { clearTimeout(timeout); reject(new Error('Sortie prématurée.')) })
        })
        enfant.send({ config: b.origin.config, dir: b.dir, natif: b.natif, demande: b.f.demande })
        await arret; enfant.kill('SIGKILL'); expect(await sortie).toEqual({ code: null, signal: 'SIGKILL' })
        expect(enfant.exitCode !== null || enfant.signalCode !== null).toBe(true)
        const relance = b.creer(), suivi = relance.lireSuivi()!, acquis = await b.origin.getTexte('entretiens/e1.json')
        expect(suivi).toMatchObject({ statut: 'indetermine', annotations: 0 })
        const bail = await b.origin.getTexteAvecEtag('verrous/corpus.lock.json')
        await expect(relance.relireSuivi(suivi.operationId)).rejects.toThrow('verrou reste tenu')
        expect(await b.origin.getTexteAvecEtag('verrous/corpus.lock.json')).toEqual(bail)
        const utilisateur = await fetch(`${base}/ocs/v2.php/cloud/user?format=json`, {
          headers: { 'OCS-APIRequest': 'true', Authorization: `Basic ${Buffer.from(`${max.utilisateur}:${max.motDePasse}`).toString('base64')}` },
        }).then((r) => r.json()) as { ocs: { data: { id: string } } }
        expect(utilisateur.ocs.data.id).toBe('max')
        expect(JSON.parse(bail.contenu)).toMatchObject({ userId: 'max', machineId: 'dissociation-synthetique' })
        // Cette intervention appartient au banc, après preuve de mort et du détenteur.
        await b.origin.supprimer('verrous/corpus.lock.json', bail.etag!)
        if (b.natif) {
          expect((await b.origin.etatVerrouNatif('entretiens/e1.json'))?.owner).toBe('max')
          await b.origin.deverrouiller('entretiens/e1.json')
        } else {
          const cible = await b.origin.getTexteAvecEtag('verrous/e1.lock.json')
          expect(JSON.parse(cible.contenu)).toMatchObject({ userId: 'max', machineId: 'dissociation-synthetique' })
          await b.origin.supprimer('verrous/e1.lock.json', cible.etag!)
        }
        expect(await relance.relireSuivi(suivi.operationId)).toMatchObject({ statut: 'partiel', annotations: 4 })
        expect(await b.reprendre(suivi.operationId, relance)).toMatchObject({ statut: 'termine', annotations: 8 })
        expect(b.puts).toEqual(['entretiens/e2.json', 'corpus.json'])
        expect(await b.origin.getTexte('entretiens/e1.json')).toBe(acquis)
      } finally {
        if (enfant.exitCode === null && enfant.signalCode === null) { enfant.kill('SIGKILL'); await sortie }
        await b.nettoyer()
      }
    })
  })
}
