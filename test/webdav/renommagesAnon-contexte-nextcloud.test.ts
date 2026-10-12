import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { preparerContexteNextcloud, type ContexteCorpusDistant } from '../../src/main/distant/contexte'
import { RenommagesAnon } from '../../src/main/renommagesAnon'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'

for (const port of [8080, 8081]) {
  const base = `http://localhost:${port}`
  const pret = await fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
  describe.skipIf(!pret)(`Contexte du renommage Nextcloud :${port}`, () => {
    async function banc() {
      const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
      const dossier = `sonde/renommage-contexte-${randomUUID()}`
      await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
      const pieges = { apresE3: false, lecturesPerdues: false }
      const publies: string[] = []
      const client = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` }, async (url, init) => {
        const chemin = decodeURIComponent(new URL(String(url)).pathname)
        if (pieges.lecturesPerdues && chemin.endsWith('/entretiens/e3.json') && init?.method === 'GET') throw new Error('Relecture perdue')
        const r = await fetch(url, init)
        if (r.ok && init?.method === 'PUT' && chemin.includes('/entretiens/')) publies.push(chemin.split('/').at(-1)!)
        if (pieges.apresE3 && chemin.endsWith('/entretiens/e3.json') && init?.method === 'PUT' && r.ok) {
          pieges.lecturesPerdues = true; await r.body?.cancel(); throw new Error('Réponse perdue')
        }
        return r
      })
      await client.creerDossier('entretiens'); await client.creerDossier('verrous')
      const f = fixtureRenommageAnon(['e1', 'e2', 'e3']); f.sources[2].data.annotations = []
      f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
      await client.putTexte('corpus.json', JSON.stringify(f.corpus, null, 2), { ifNoneMatch: '*' })
      for (const s of f.sources) await client.putTexte(`entretiens/${s.id}.json`, JSON.stringify(s.data, null, 2), { ifNoneMatch: '*' })
      const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-renommage-contexte-nc-'))
      const natif = port === 8080
      const ouvrir = async () => {
        const identite = { userId: 'max', machineId: 'qualification-contexte', sessionId: randomUUID() }
        return (await preparerContexteNextcloud({ id: 'qualification', dirLocal, client, verrouNatif: natif, identite: () => identite })).contexte
      }
      let contexte = await ouvrir()
      publies.splice(0)
      const cache = new RenommagesAnon({ store: () => contexte.store, local: () => false })
      const preparer = async () => cache.preparerWebDAV(f.demande, await contexte.instantaneRenommageAnon(), contexte.renommageAnonDisponible(), contexte)
      const appliquer = (token: string) => contexte.renommerVarianteAnon(cache.consommerWebDAV(token, true, contexte))
      const reprendre = async () => {
        const r = await contexte.preparerRepriseRenommageAnon(contexte.lireSuiviRenommageAnon()!.operationId)
        const a = cache.preparerWebDAV(r.demande, r.instantane, true, contexte, r)
        return appliquer(a.token)
      }
      const tiers = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' } })
      const tenir = async (id: string) => {
        const identite = () => ({ userId: 'olivier', machineId: 'tiers', sessionId: 'qualification-tiers' })
        const provider = natif ? new ProviderFilesLock(tiers, identite) : new ProviderPutConditionnel(tiers, identite)
        const chemin = natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
        expect((await provider.acquerir(chemin)).ok).toBe(true)
        return () => provider.liberer(chemin)
      }
      return { f, client, dirLocal, cache, preparer, appliquer, reprendre, tenir, pieges, publies, get contexte() { return contexte },
        relancer: async () => { await contexte.fermer(); contexte = await ouvrir() },
        nettoyer: async () => { await contexte.fermer(); await parent.supprimer(dossier); rmSync(dirLocal, { recursive: true, force: true }) },
      }
    }
    test('cache et contexte réels : cible tenue, lot partiel relancé, non-cible éditable, reprise sans rejeu', { timeout: 240_000 }, async () => {
      const b = await banc(); const rendre = await b.tenir('e2')
      try {
        const a = await b.preparer()
        expect(await b.contexte.observerCiblesRenommageAnon(['e2'])).toContainEqual({ id: 'e2', etat: 'tenu-autrui' })
        expect(await b.appliquer(a.token)).toMatchObject({ statut: 'partiel', annotations: 2 })
        const premier = await b.client.getTexte('entretiens/e1.json')
        await rendre(); await b.relancer()
        expect(b.contexte.lireSuiviRenommageAnon()).toMatchObject({ fournisseur: 'webdav', bilan: { annotations: 2 } })
        await expect(b.contexte.ouvrirEntretienPourEdition('e2')).rejects.toThrow('reste à publier')
        await expect(b.contexte.executerDefinitions(() => null)).rejects.toThrow('renommage WebDAV')
        await b.contexte.ouvrirEntretienPourEdition('e3')
        b.contexte.exigerEcritureEntretien('e3')
        const fichier = join(b.dirLocal, 'entretiens/e3.json')
        const data = JSON.parse(readFileSync(fichier, 'utf8')); data.meta.titre = 'Publication non ciblée'
        writeFileSync(fichier, JSON.stringify(data)); b.contexte.sessions.noterSale('e3')
        expect(await b.contexte.publierEntretien('e3')).toEqual({ ok: true })
        expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 4 })
        expect(await b.client.getTexte('entretiens/e1.json')).toBe(premier)
        await b.contexte.fermerEntretien('e3')
      } finally { await rendre(); await b.nettoyer() }
    })
    test('session ciblée déjà ouverte : différée, anciens choix conservés, nouveaux choix contrôlés avant fermeture', { timeout: 240_000 }, async () => {
      const b = await banc()
      try {
        await b.contexte.ouvrirEntretienPourEdition('e2')
        expect(await b.appliquer((await b.preparer()).token)).toMatchObject({ statut: 'partiel', annotations: 2 })
        const fichier = join(b.dirLocal, 'entretiens/e2.json')
        const candidat = JSON.parse(readFileSync(fichier, 'utf8'))
        candidat.annotations.push({ ...candidat.annotations[0], id: 'nouvelle', from: 33, to: 39 })
        writeFileSync(fichier, JSON.stringify(candidat)); b.contexte.sessions.noterSale('e2')
        await expect(b.contexte.publierEntretien('e2')).rejects.toThrow('variante choisie n’est plus déclarée')
        b.contexte.exigerEcritureEntretien('e2')
        candidat.annotations.at(-1).pseudo = 'Nouvelle'
        writeFileSync(fichier, JSON.stringify(candidat)); b.contexte.sessions.noterSale('e2')
        expect(await b.contexte.fermerEntretien('e2')).toMatchObject({ fermee: true })
        expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 4 })
        expect(JSON.parse(await b.client.getTexte('entretiens/e2.json')).annotations.at(-1).pseudo).toBe('Nouvelle')
      } finally { await b.nettoyer() }
    })
    test('réponse/relecture de session perdues : garde corpus persistante, base confirmée sans perdre l’autosave ultérieure', { timeout: 240_000 }, async () => {
      const b = await banc()
      try {
        await b.contexte.ouvrirEntretienPourEdition('e3')
        const fichier = join(b.dirLocal, 'entretiens/e3.json')
        const data = JSON.parse(readFileSync(fichier, 'utf8'))
        data.annotations.push({ ...b.f.sources[0].data.annotations[0], id: 'nouvelle' })
        writeFileSync(fichier, JSON.stringify(data)); b.contexte.sessions.noterSale('e3')
        b.pieges.apresE3 = true
        await expect(b.contexte.publierEntretien('e3')).rejects.toThrow()
        await expect(b.contexte.instantaneRenommageAnon()).rejects.toThrow('publication d’entretien')
        const provider = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'autre', sessionId: 'sonde' }))
        expect((await provider.acquerir('verrous/corpus.lock.json')).ok).toBe(false)
        data.locuteurs[0].pseudo = 'Autosave indépendante ultérieure'
        writeFileSync(fichier, JSON.stringify(data)); b.contexte.sessions.noterSale('e3')
        b.pieges.apresE3 = false; b.pieges.lecturesPerdues = false
        await b.contexte.actualiser()
        expect(JSON.parse(readFileSync(fichier, 'utf8')).locuteurs[0].pseudo).toBe('Autosave indépendante ultérieure')
        expect(b.publies).toEqual(['e3.json'])
        expect(await b.appliquer((await b.preparer()).token)).toMatchObject({ statut: 'partiel', annotations: 4 })
        expect(await b.contexte.fermerEntretien('e3')).toMatchObject({ fermee: true })
        expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 5 })
        expect(b.publies.filter((id) => id === 'e3.json')).toHaveLength(3)
      } finally { await b.nettoyer() }
    })
    test('PUT court inconnu et contexte relancé : refuse le verrou persistant, confirme l’image sans nouveau PUT', { timeout: 240_000 }, async () => {
      const b = await banc()
      try {
        b.pieges.apresE3 = true
        await expect(b.contexte.transactions.executerEntretien('e3', () => {
          const fichier = join(b.dirLocal, 'entretiens/e3.json')
          const data = JSON.parse(readFileSync(fichier, 'utf8')); data.annotations.push({ ...b.f.sources[0].data.annotations[0], id: 'nouvelle' })
          writeFileSync(fichier, JSON.stringify(data))
        })).rejects.toThrow()
        b.pieges.apresE3 = false; b.pieges.lecturesPerdues = false
        await b.relancer()
        await expect(b.contexte.actualiser()).rejects.toThrow('verrou corpus')
        expect(await b.contexte.listerOrphelins()).toEqual([])
        const j = b.contexte.transactions.lirePublicationEntretien()!
        expect(await b.client.getTexte(j.chemin)).toBe(j.contenu)
        // Le contexte précédent est fermé et le PUT accepté est prouvé ; intervention extérieure uniquement.
        const verrou = await b.client.getTexteAvecEtag('verrous/corpus.lock.json')
        await b.client.supprimer('verrous/corpus.lock.json', verrou.etag!)
        await b.contexte.actualiser()
        expect(b.contexte.transactions.lirePublicationEntretien()).toBeNull()
        expect(b.contexte.store.lireEntretien('e3')).toMatchObject({ ok: true, data: { annotations: expect.arrayContaining([expect.objectContaining({ id: 'nouvelle', pseudo: 'Claire' })]) } })
        expect(b.publies).toEqual(['e3.json'])
      } finally { await b.nettoyer() }
    })
    test('publication courte et import réel : ancien nouveau choix refusé sans publication du fichier', { timeout: 240_000 }, async () => {
      const b = await banc()
      try {
        expect(await b.appliquer((await b.preparer()).token)).toMatchObject({ statut: 'termine' })
        const avant = await b.client.getTexte('entretiens/e3.json')
        await expect(b.contexte.transactions.executerEntretien('e3', () => {
          const data = JSON.parse(readFileSync(join(b.dirLocal, 'entretiens/e3.json'), 'utf8'))
          data.annotations.push({ ...b.f.sources[0].data.annotations[0], id: 'nouvelle' })
          writeFileSync(join(b.dirLocal, 'entretiens/e3.json'), JSON.stringify(data))
        })).rejects.toThrow('variante choisie n’est plus déclarée')
        expect(await b.client.getTexte('entretiens/e3.json')).toBe(avant)
        await expect(b.contexte.transactions.importerEntretien('Périmé', b.f.sources[0].data)).rejects.toThrow('variante choisie n’est plus déclarée')
        const data = structuredClone(b.f.sources[0].data)
        for (const a of data.annotations) if (a.regle === 'personne' && a.etat !== 'exception' && a.pseudo === 'Claire') a.pseudo = 'Nouvelle'
        expect(await b.contexte.transactions.importerEntretien('Courant', data)).toHaveProperty('id')
      } finally { await b.nettoyer() }
    })
  })
}
