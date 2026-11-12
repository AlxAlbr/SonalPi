import { describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/distant/miroirWebDAV'
import { TransactionsCorpus } from '../../src/main/distant/transactions'
import { CorpusStore } from '../../src/main/corpusStore'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import type { CorpusFichier } from '../../src/shared/format'
import type { DemandeOperationTheme } from '../../src/shared/corpus/themes'
import { corpusDistantValide, entretienDistantValide } from './fixturesCorpusDistant'

const max = { utilisateur: 'max', motDePasse: 'max-max-1234' }
const olivier = { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' }
const identite = (userId: string) => ({ userId, machineId: 'banc-themes', sessionId: randomUUID() })
for (const port of [8080, 8081]) {
  const base = `http://localhost:${port}`
  const pret = await fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
  describe.skipIf(!pret)(`Publication de thèmes Nextcloud réel :${port}`, () => {
    test('division, refus du tiers, succès acquis et reprise avec destinations existantes', { timeout: 90_000 }, async () => {
      const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: max })
      const dossier = `sonde/themes-lot-${randomUUID()}`
      await parent.creerDossier('sonde')
      await parent.creerDossier(dossier)
      const client = new ClientWebDAV({ baseUrl: `${parent.config.baseUrl}/${dossier}`, identifiants: max })
      const tiers = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: olivier })
      const idTiers = identite('olivier')
      const natif = port === 8080
      const verrou = natif ? new ProviderFilesLock(tiers, () => idTiers) : new ProviderPutConditionnel(tiers, () => idTiers)
      const cheminVerrou = natif ? 'entretiens/e2.json' : 'verrous/e2.lock.json'
      try {
        await client.creerDossier('entretiens')
        await client.creerDossier('verrous')
        const c = JSON.parse(corpusDistantValide(['e1', 'e2'])) as CorpusFichier
        c.codebook = {
          source: { id: 'source', nom: 'Source', ordre: 0, parent: null, actif: true, codeExport: 'source' },
          'destination-a': { id: 'destination-a', nom: 'Destination A', ordre: 1, parent: null, actif: true, codeExport: 'destination-a' },
          'destination-b': { id: 'destination-b', nom: 'Destination B', ordre: 2, parent: null, actif: true, codeExport: 'destination-b' },
        }
        await client.putTexte('corpus.crp', JSON.stringify(c), { ifNoneMatch: '*' })
        const contenu = entretienDistantValide({
          corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Un passage partagé.' }] }] },
          annotations: [
            { id: 'a', type: 'codage', code: 'source', from: 1, to: 6, auteur: 'test' },
            { id: 'memo', type: 'commentaire', texte: 'Conserver', from: 1, to: 6, auteur: 'test' },
          ],
        })
        for (const id of ['e1', 'e2']) await client.putTexte(`entretiens/${id}.json`, contenu, { ifNoneMatch: '*' })
        const miroir = new MiroirWebDAV(client, mkdtempSync(join(tmpdir(), 'sonal-lot-themes-nc-')))
        await miroir.tirer()
        const store = new CorpusStore(miroir.dirLocal)
        store.lectureSeule = true
        const idMax = identite('max')
        const creer = () => new TransactionsCorpus(client, miroir, () => store, () => idMax, { verrouNatif: natif })
        const tx = creer()
        expect((await verrou.acquerir(cheminVerrou)).ok).toBe(true)
        const demande: DemandeOperationTheme = { type: 'division', source: 'source', effacerSource: false,
          cibles: ['destination-a', 'destination-b'],
          choix: ['e1', 'e2'].map((entretienId) => ({ codage: { entretienId, annotationId: 'a' }, destination: 'destination-a' })),
        }
        const a = await tx.analyserOperationTheme(demande)
        const resultat = await tx.executerOperationTheme(a.operationId, demande, { entretiens: 'tous-prevus' })
        expect(resultat, JSON.stringify(resultat)).toMatchObject({ statut: 'partielle', bilan: { reussis: [{ id: 'e1' }], echecs: [{ id: 'e2' }], sourceConservee: true } })
        const suivi = tx.lireSuiviOperationTheme()!
        expect(suivi.bilan.ciblesCreees).toEqual([])
        expect((await client.getTexteAvecEtag('entretiens/e2.json')).contenu).toBe(contenu)
        const e1Avant = await client.getTexteAvecEtag('entretiens/e1.json')
        expect(JSON.parse(e1Avant.contenu).annotations[0].code).toBe('destination-a')
        await verrou.liberer(cheminVerrou)
        const nouveau = creer()
        const reprise = await nouveau.preparerRepriseOperationTheme(a.operationId)
        expect(reprise.demande).toMatchObject({ choix: [] })
        const d = reprise.demande as Extract<DemandeOperationTheme, { type: 'division' }>
        d.choix = [{ codage: { entretienId: 'e2', annotationId: 'a' }, destination: 'destination-b' }]
        const final = await nouveau.analyserOperationTheme(d, reprise.apercu.operationId)
        expect(await nouveau.executerOperationTheme(final.operationId, d, { entretiens: 'tous-prevus' })).toMatchObject({ statut: 'appliquee', entretiens: 2, reaffectes: 2 })
        expect(await client.getTexteAvecEtag('entretiens/e1.json')).toEqual(e1Avant)
        const dernierCorpus = JSON.parse(await client.getTexte('corpus.crp')) as CorpusFichier
        expect(Object.keys(dernierCorpus.codebook)).toHaveLength(3)
        expect(dernierCorpus.codebook.source).toBeDefined()
        expect(JSON.parse(await tiers.getTexte('entretiens/e2.json')).annotations[0].code).toBe('destination-b')
        expect(JSON.parse(readFileSync(join(miroir.dirLocal, 'entretiens/e2.json'), 'utf8')).annotations[1].texte).toBe('Conserver')
        expect(nouveau.lireSuiviOperationTheme()).toBeNull()
      } finally {
        await verrou.liberer(cheminVerrou).catch(() => {})
        await parent.supprimer(dossier)
      }
    })
  })
}
