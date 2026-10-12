import { randomUUID } from 'node:crypto'
import { SuppressionsAnonWebDAV } from '../../src/main/distant/suppressionsAnonWebDAV'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import type { ClientWebDAV } from '../../src/main/webdav/client'

export function serviceSuppressionWebDAV(client: ClientWebDAV, dirLocal: string, natif: boolean, sessions: string[] = [],
  miroir = (_chemin: string, _contenu: string, _etag: string) => {}, maintenant = Date.now) {
  const identite = { userId: 'max', machineId: 'suppression-synthetique', sessionId: `suppression-anon-${randomUUID()}` }
  return new SuppressionsAnonWebDAV({ client, dirLocal, sessionsLocales: () => sessions, miroir, maintenant,
    verrouCorpus: () => ({ provider: new ProviderPutConditionnel(client, () => identite), chemin: 'verrous/corpus.lock.json' }),
    verrouEntretien: (id) => ({ provider: natif ? new ProviderFilesLock(client, () => identite) : new ProviderPutConditionnel(client, () => identite),
      chemin: natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json` }),
  })
}
