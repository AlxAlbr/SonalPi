import { ClientWebDAV } from '../../src/main/webdav/client'
import { serviceDissociationWebDAV } from './dissociationAnonWebDAV'
import type { DemandeDissociationAnon } from '../../src/shared/corpus/dissociationAnon'

process.once('message', async (message) => {
  const options = message as { config: ClientWebDAV['config']; dir: string; natif: boolean; demande: DemandeDissociationAnon }
  const client = new ClientWebDAV(options.config, async (url, init) => {
    const reponse = await fetch(url, init)
    if (init?.method === 'PUT' && String(url).endsWith('/entretiens/e1.json') && reponse.ok) {
      await reponse.body?.cancel()
      process.send?.('premier-transfert-accepte')
      await new Promise(() => {})
    }
    return reponse
  })
  const service = serviceDissociationWebDAV(client, options.dir, options.natif)
  const p = await service.preparer(options.demande)
  await service.appliquer(p.token, true)
  process.exit(2)
})
