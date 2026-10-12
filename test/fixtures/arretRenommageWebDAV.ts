import { ClientWebDAV } from '../../src/main/webdav/client'
import { serviceRenommageWebDAV, preparationRenommageWebDAV } from './renommageAnonWebDAV'
import type { DemandeRenommageAnon } from '../../src/shared/corpus/renommageAnon'

process.once('message', async (message) => {
  const options = message as { config: ClientWebDAV['config']; dir: string; natif: boolean; demande: DemandeRenommageAnon }
  const client = new ClientWebDAV(options.config, async (url, init) => {
    const reponse = await fetch(url, init)
    if (init?.method === 'PUT' && String(url).endsWith('/entretiens/e1.json') && reponse.ok) {
      await reponse.body?.cancel()
      process.send?.('premier-put-accepte')
      await new Promise(() => {})
    }
    return reponse
  })
  const { service, store } = serviceRenommageWebDAV(client, options.dir, options.natif)
  await service.appliquer(preparationRenommageWebDAV(store, await service.instantane(), options.demande))
  process.exit(2)
})
