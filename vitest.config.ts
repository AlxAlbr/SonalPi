import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Les bancs contre les piles Nextcloud DOCKER partagent le MÊME état
    // serveur (corpus.json de MonCorpus) : deux fichiers qui écrivent/tirent
    // en parallèle se marchent dessus (un double-tirage « rien ne bouge »
    // peut voir un etag bouger à cause du fichier voisin). Séquentiel donc.
    fileParallelism: false,
  },
})
