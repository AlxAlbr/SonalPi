import type { Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import type { CorpusFichier, EntretienFichier, Locuteur } from '../src/shared/format'
import { installerIdentitesFixture } from '../test/fixtures/identitesLocuteurs'

/** Installe les identités synthétiques avant d'importer les entretiens qui les référencent. */
export async function importerFixtureNative(page: Page, fixture: {
  corpus: Pick<CorpusFichier, 'reglesAnon'>
  sources: readonly { titre: string; data: EntretienFichier }[]
}): Promise<string[]> {
  const { dir } = await page.evaluate(() => window.sonal.corpus.dossierCourant())
  const sources = structuredClone([...fixture.sources]), identites = new Map<string, Locuteur>()
  for (const s of sources) for (const p of s.data.participations) if (p.locuteurRef && !identites.has(p.locuteurRef)) {
    identites.set(p.locuteurRef, { id: `fixture-${randomUUID()}`, nom: p.nom })
  }
  installerIdentitesFixture(dir, { locuteurs: [...identites.values()] })
  for (const s of sources) for (const p of s.data.participations) {
    if (p.locuteurRef) p.locuteurRef = identites.get(p.locuteurRef)!.id
    for (const refus of p.rapprochementsRefuses ?? []) if (refus.type === 'locuteur' && identites.has(refus.locuteurId)) {
      refus.locuteurId = identites.get(refus.locuteurId)!.id
    }
  }
  return page.evaluate(async ({ corpus, sources }) => {
    const ids: string[] = []
    for (const s of sources) ids.push((await window.sonal.corpus.importer(s.titre, s.data, [], [], Object.values(corpus.reglesAnon))).id)
    return ids
  }, { corpus: fixture.corpus, sources })
}
