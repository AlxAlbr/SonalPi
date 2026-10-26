import { test, expect } from '@playwright/test'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil } from './util'

const sourcesFournies = join(process.cwd(), 'CorpusTest', 'CorpusSynth')

test('les sources de CorpusSynth sont installées sans dossier intermédiaire', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-sources-demo-'))
  const sources = join(racine, 'sources')
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await page.evaluate((dir) => window.sonal.demo.copierSources(dir), sources)

    expect(readdirSync(sources).sort()).toEqual(['audio', 'docs', 'srt'])
    for (const dossier of ['audio', 'docs', 'srt']) {
      const fichiers = readdirSync(join(sourcesFournies, dossier)).sort()
      expect(readdirSync(join(sources, dossier)).sort()).toEqual(fichiers)
      for (const fichier of fichiers) {
        expect(readFileSync(join(sources, dossier, fichier)))
          .toEqual(readFileSync(join(sourcesFournies, dossier, fichier)))
      }
    }
  } finally {
    await app.close()
    rmSync(racine, { recursive: true, force: true })
  }
})

test('les sources déjà installées sont reconnues et réparées à leur emplacement historique', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-sources-historiques-'))
  const profil = join(racine, 'profil')
  const sources = join(racine, 'ancien-dossier-sources')
  cpSync(sourcesFournies, sources, { recursive: true })
  const guide = join(sources, 'docs', 'Guide-entretien-demo.txt')
  writeFileSync(guide, 'Guide personnalisé conservé.\n')
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await page.evaluate(async (dir) => {
      await window.sonal.demo.memoriser({ racineSources: dir })
    }, sources)
    const etat = await page.evaluate(() => window.sonal.demo.etat())
    expect(etat?.racineSources).toBe(sources)
    expect(etat?.sourcesExist).toBe(true)

    await page.evaluate((dir) => window.sonal.demo.copierSources(dir), sources)
    expect(readFileSync(guide, 'utf8')).toBe('Guide personnalisé conservé.\n')

    const audio = join(sources, 'audio', '1Coordinatrice.mp3')
    rmSync(audio)
    expect((await page.evaluate(() => window.sonal.demo.etat()))?.sourcesExist).toBe(false)
    await page.evaluate((dir) => window.sonal.demo.copierSources(dir), sources)
    expect((await page.evaluate(() => window.sonal.demo.etat()))?.sourcesExist).toBe(true)
    expect(readFileSync(audio))
      .toEqual(readFileSync(join(sourcesFournies, 'audio', '1Coordinatrice.mp3')))
    expect(existsSync(join(sources, 'CorpusSynth'))).toBe(false)
    expect(JSON.parse(readFileSync(join(profil, 'settings.json'), 'utf8')).demo.racineSources)
      .toBe(sources)
  } finally {
    await app.close()
    rmSync(racine, { recursive: true, force: true })
  }
})
