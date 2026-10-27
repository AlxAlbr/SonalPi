import { test, expect } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { lancer, attendreAccueil } from './util'
import { choisirDossierExemple, configurerSourcesExemples } from './exemples-util'

const executablePath = process.env.EXEMPLES_E2E_EXECUTABLE
test.skip(!executablePath, 'Définir EXEMPLES_E2E_EXECUTABLE pour tester les exemples dans le paquet installé.')

for (const exemple of [
  { titre: 'Entretiens déjà importés', annote: false },
  { titre: 'Corpus annoté', annote: true },
]) {
  test(`paquet installé : ${exemple.titre}, sources et références audio utilisables`, async () => {
    const racine = mkdtempSync(join(tmpdir(), 'sonal-exemple-paquet-'))
    const app = await lancer(join(racine, 'profil'), { executablePath })
    try {
      expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true)
      const page = await app.firstWindow()
      await attendreAccueil(page)
      const sources = join(racine, 'sources'), corpus = join(racine, 'corpus')
      await configurerSourcesExemples(app, sources)
      await choisirDossierExemple(app, corpus)
      await page.locator('.carte-demo.exemples').click()
      const carte = page.locator('.exemple').filter({ has: page.getByRole('heading', { name: exemple.titre, exact: true }) })
      await carte.getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
      const installation = page.locator('.installation-exemple')
      await installation.getByRole('button', { name: 'Modifier…', exact: true }).click()
      await installation.getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
      await expect(installation).toHaveCount(0)
      await expect(page.locator(exemple.annote ? '.espace-analyse' : '.corpus-ecran')).toBeVisible()
      const c = JSON.parse(readFileSync(join(corpus, 'corpus.json'), 'utf8'))
      expect(Object.keys(c.membership)).toHaveLength(4)
      let annotations = 0
      for (const id of Object.keys(c.membership)) {
        const entretien = JSON.parse(readFileSync(join(corpus, 'entretiens', `${id}.json`), 'utf8'))
        expect(entretien.meta.audioRef.startsWith(sources)).toBe(true)
        expect(existsSync(entretien.meta.audioRef)).toBe(true)
        annotations += entretien.annotations.length
      }
      if (exemple.annote) expect(annotations).toBe(324)
      expect(existsSync(join(sources, 'docs/Guide-entretien-demo.txt'))).toBe(true)
      expect(existsSync(join(corpus, 'audio'))).toBe(false)
    } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
  })
}
