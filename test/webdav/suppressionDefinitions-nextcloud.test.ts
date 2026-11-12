import { describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../../src/main/corpusStore'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/distant/miroirWebDAV'
import { TransactionsCorpus } from '../../src/main/distant/transactions'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { corpusSuppressionDefinitions, definitionsSupprimees, entretienSuppressionDefinitions, supprimerDefinitionTest } from '../fixtures/suppressionDefinitions'

for (const port of [8080, 8081]) {
  const base = `http://localhost:${port}`
  const pret = await fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
  describe.skipIf(!pret)(`Suppressions de définitions Nextcloud réel :${port}`, () => {
    for (const type of definitionsSupprimees) {
      test(`${type} : refuse les éditions des deux comptes puis supprime seulement après fermeture`, { timeout: 120_000 }, async () => {
        const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
        const dossier = `sonde/suppression-definition-${randomUUID()}`
        await parent.creerDossier('sonde')
        await parent.creerDossier(dossier)
        const client = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` })
        const tiers = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' } })
        const natif = port === 8080
        const identite = (userId: string) => ({ userId, machineId: 'qualification', sessionId: randomUUID() })
        const idTiers = identite('olivier'), idAutrePoste = identite('max'), idTransaction = identite('max')
        const verrouTiers = natif ? new ProviderFilesLock(tiers, () => idTiers) : new ProviderPutConditionnel(tiers, () => idTiers)
        const verrouPropre = natif ? new ProviderFilesLock(client, () => idAutrePoste) : new ProviderPutConditionnel(client, () => idAutrePoste)
        const chemin = natif ? 'entretiens/e1.json' : 'verrous/e1.lock.json'
        const dir = mkdtempSync(join(tmpdir(), 'sonal-definitions-nc-'))
        try {
          await client.creerDossier('entretiens')
          await client.creerDossier('verrous')
          const corpus = JSON.stringify(corpusSuppressionDefinitions())
          await client.putTexte('corpus.json', corpus, { ifNoneMatch: '*' })
          const source = JSON.stringify(entretienSuppressionDefinitions())
          for (const id of ['e1', 'e2']) await client.putTexte(`entretiens/${id}.json`, source, { ifNoneMatch: '*' })
          const miroir = new MiroirWebDAV(client, dir)
          await miroir.tirer()
          const store = new CorpusStore(dir)
          store.lectureSeule = true
          const tx = new TransactionsCorpus(client, miroir, () => store, () => idTransaction, { verrouNatif: natif })
          const supprimer = () => tx.executerSuppressionDefinitions(() => supprimerDefinitionTest(store, type))
          expect((await verrouTiers.acquerir(chemin)).ok).toBe(true)
          await expect(supprimer()).rejects.toThrow(/ouvert/)
          expect(await client.getTexte('corpus.json')).toBe(corpus)
          await verrouTiers.liberer(chemin)
          expect((await verrouPropre.acquerir(chemin)).ok).toBe(true)
          await expect(supprimer()).rejects.toThrow(/ouvert/)
          await verrouPropre.liberer(chemin)
          await tiers.getTexte('entretiens/e1.json')
          expect((await supprimer()).ok).toBe(true)
          for (const id of ['e1', 'e2']) expect(await client.getTexte(`entretiens/${id}.json`)).toBe(source)
        } finally {
          await verrouTiers.liberer(chemin).catch(() => {})
          await verrouPropre.liberer(chemin).catch(() => {})
          await parent.supprimer(dossier)
          rmSync(dir, { recursive: true, force: true })
        }
      })
    }
  })
}
