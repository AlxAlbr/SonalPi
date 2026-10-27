import { test, expect } from '@playwright/test'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil } from './util'

const sourcesFournies = join(process.cwd(), 'CorpusTest', 'CorpusSynth')
function profilAvecSources(profil: string, sources: string) {
  mkdirSync(profil, { recursive: true })
  writeFileSync(join(profil, 'settings.json'), JSON.stringify({ recents: [], exemples: { sources, travaux: [], apprentissages: {}, libres: {} } }))
}

test('les sources de CorpusSynth sont installées sans dossier intermédiaire', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-sources-demo-'))
  const sources = join(racine, 'sources')
  const profil = join(racine, 'profil')
  profilAvecSources(profil, sources)
  const app = await lancer(profil, { preserverSettings: true })
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await page.evaluate(() => window.sonal.exemples.restaurerSources())
    expect(readdirSync(sources).sort()).toEqual(['audio', 'docs', 'srt'])
    for (const dossier of ['audio', 'docs', 'srt']) {
      const fichiers = readdirSync(join(sourcesFournies, dossier)).sort()
      expect(readdirSync(join(sources, dossier)).sort()).toEqual(fichiers)
      for (const fichier of fichiers) expect(readFileSync(join(sources, dossier, fichier)))
        .toEqual(readFileSync(join(sourcesFournies, dossier, fichier)))
    }
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})

test('les sources enregistrées sont retrouvées et réparées sans remplacer les fichiers présents', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-sources-enregistrees-'))
  const profil = join(racine, 'profil')
  const sources = join(racine, 'dossier-sources')
  cpSync(sourcesFournies, sources, { recursive: true })
  const guide = join(sources, 'docs', 'Guide-entretien-demo.txt')
  writeFileSync(guide, 'Guide personnalisé conservé.\n')
  profilAvecSources(profil, sources)
  const app = await lancer(profil, { preserverSettings: true })
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    const etat = await page.evaluate(() => window.sonal.exemples.etat())
    expect(etat.sources).toBe(sources)
    expect(etat.sourcesPresentes).toBe(true)
    const audio = join(sources, 'audio', '1Coordinatrice.mp3')
    rmSync(audio)
    expect((await page.evaluate(() => window.sonal.exemples.etat())).sourcesPresentes).toBe(false)
    await page.evaluate(() => window.sonal.exemples.restaurerSources())
    expect((await page.evaluate(() => window.sonal.exemples.etat())).sourcesPresentes).toBe(true)
    expect(readFileSync(guide, 'utf8')).toBe('Guide personnalisé conservé.\n')
    expect(readFileSync(audio)).toEqual(readFileSync(join(sourcesFournies, 'audio', '1Coordinatrice.mp3')))
    expect(existsSync(join(sources, 'CorpusSynth'))).toBe(false)
    const settings = JSON.parse(readFileSync(join(profil, 'settings.json'), 'utf8'))
    expect(settings.exemples.sources).toBe(sources)
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})
