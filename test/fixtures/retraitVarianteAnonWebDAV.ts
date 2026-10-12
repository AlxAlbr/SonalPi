import { randomUUID } from 'node:crypto'
import type { ClientWebDAV } from '../../src/main/webdav/client'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { RetraitsVarianteAnonWebDAV } from '../../src/main/distant/retraitsVarianteAnonWebDAV'

/** Services du banc synthétique, sans droit hérité d’une autre instance. */
export function serviceRetraitVarianteWebDAV(client: ClientWebDAV, dirLocal: string, natif: boolean,
  sessions: string[] = [], miroir: (p: string, c: string, e: string) => void = () => {}) {
  const identite = () => ({ userId: 'max', machineId: 'qualification-retrait', sessionId: `retrait-variante-${randomUUID()}` })
  return new RetraitsVarianteAnonWebDAV({ client, dirLocal, utilisateur: () => 'max', sessionsLocales: () => sessions, miroir,
    verrouCorpus: () => { const id = identite(); return { provider: new ProviderPutConditionnel(client, () => id), chemin: 'verrous/corpus.lock.json' } },
    verrouEntretien: (entretien) => { const id = identite(); return { provider: natif ? new ProviderFilesLock(client, () => id) : new ProviderPutConditionnel(client, () => id), chemin: natif ? `entretiens/${entretien}.json` : `verrous/${entretien}.lock.json` } },
  })
}
