import { ClientWebDAV, type ConfigWebDAV } from '../../src/main/webdav/client'
import { serviceImportWebDAV, preparationImportWebDAV } from './correspondancesWebDAV'

// Le parent tue ce processus pendant le deuxième envoi, sans exécuter de finally.
process.once('message', async (message: { config: ConfigWebDAV; dir: string; natif: boolean }) => {
  try {
    const client = new ClientWebDAV(message.config, async (url, init) => {
      if (init?.method === 'PUT' && new URL(String(url)).pathname.endsWith('/entretiens/e2.json')) {
        process.send?.('verrous-persistants')
        await new Promise(() => {})
      }
      return fetch(url, init)
    })
    const { service, store } = serviceImportWebDAV(client, message.dir, message.natif)
    await service.appliquer(preparationImportWebDAV(store, await service.instantane()))
    process.send?.('fin-inattendue')
  } catch { process.send?.('erreur-avant-arret') }
})
