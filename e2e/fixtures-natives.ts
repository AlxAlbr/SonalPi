import type { Page } from '@playwright/test'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'

/** Installe les identités synthétiques avant d'importer les entretiens qui les référencent. */
export async function importerFixtureNative(page: Page, fixture: {
  corpus: Pick<CorpusFichier, 'reglesAnon'>
  sources: readonly { titre: string; data: EntretienFichier }[]
}): Promise<string[]> {
  return page.evaluate(async ({ corpus, sources }) => {
    const api = window.sonal.corpus, identites = new Map<string, string>(), ids: string[] = []
    for (const s of sources) {
      const data = structuredClone(s.data)
      for (const p of data.participations) if (p.locuteurRef) {
        const ancienne = p.locuteurRef
        if (!identites.has(ancienne)) {
          const id = await api.personnesCommander({ type: 'creerDefinition', nom: p.nom })
          if (!id) throw new Error('Identité de fixture absente')
          identites.set(ancienne, id)
        }
        p.locuteurRef = identites.get(ancienne)!
      }
      ids.push((await api.importer(s.titre, data, [], [], Object.values(corpus.reglesAnon))).id)
    }
    return ids
  }, { corpus: fixture.corpus, sources: [...fixture.sources] })
}
