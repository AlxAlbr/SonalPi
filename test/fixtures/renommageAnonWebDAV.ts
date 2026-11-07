import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CorpusStore } from '../../src/main/corpusStore'
import { RenommagesAnonWebDAV } from '../../src/main/distant/renommagesAnonWebDAV'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { empreinteCorrespondance } from '../../src/main/tablesCorrespondance'
import { preparerRenommageAnon, type DemandeRenommageAnon } from '../../src/shared/corpus/renommageAnon'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import type { ClientWebDAV } from '../../src/main/webdav/client'
import type { InstantaneOperationTheme } from '../../src/main/operationsThemes'
import type { PreparationRenommageDistant } from '../../src/main/renommagesAnon'

export function serviceRenommageWebDAV(client: ClientWebDAV, dir: string, natif: boolean, sessions: string[] = [], miroir = (_chemin: string, _contenu: string, _etag: string) => {}) {
  writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(squeletteCorpus('Miroir synthétique vide')))
  const store = new CorpusStore(dir); store.lectureSeule = true
  const creer = () => {
    const identite = { userId: 'max', machineId: 'renommage-synthetique', sessionId: `rename-${randomUUID()}` }
    return new RenommagesAnonWebDAV({ client, store, dirLocal: dir, sessionsLocales: () => sessions, miroir,
      verrouCorpus: () => ({ provider: new ProviderPutConditionnel(client, () => identite), chemin: 'verrous/corpus.lock.json' }),
      verrouEntretien: (id) => ({ provider: natif ? new ProviderFilesLock(client, () => identite) : new ProviderPutConditionnel(client, () => identite), chemin: natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json` }),
    })
  }
  return { service: creer(), creer, store }
}
export function preparationRenommageWebDAV(store: CorpusStore, instantane: InstantaneOperationTheme, demande: DemandeRenommageAnon,
  reprise?: { operationId: string; corpusPublie: InstantaneOperationTheme['corpus'] }): PreparationRenommageDistant {
  const plan = preparerRenommageAnon(instantane.corpus, instantane.entretiens.map((e) => ({ id: e.id, titre: e.titre, data: e.ok ? e.avant : undefined })), demande, reprise ? [demande.nouveauPseudo] : [])
  return { store, demande: plan.inventaire.demande, corpusAvant: structuredClone(instantane.corpus),
    empreinteCorpus: empreinteCorrespondance(reprise?.corpusPublie ?? instantane.corpus),
    cibles: plan.entretiens.map((e) => ({ ...e, annotations: plan.inventaire.entretiens.find((i) => i.id === e.id)!.renommages,
      incluses: plan.inventaire.entretiens.find((i) => i.id === e.id)!.inclusesRenommees })),
    ...(reprise ? { reprise: reprise.operationId } : {}) }
}
