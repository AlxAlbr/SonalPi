import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { lancer, entrerCorpus, attendreCorpus } from './util'

/**
 * S2 inc. 2 — multi-corpus : « Ouvrir un corpus… » (openDirectory, stubbé) bascule
 * le store du main sur un autre dossier ; les récents sont mémorisés (settings.json
 * du profil) ; rouvrir un récent retrouve SON contenu (chaque dossier = un corpus).
 */
test('ouvrir un autre dossier, récents mémorisés, round-trip entre corpus', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-multi-'))
  const dirB = mkdtempSync(join(tmpdir(), 'sonal-corpusB-'))
  const dirC = mkdtempSync(join(tmpdir(), 'sonal-corpusC-'))

  const app = await lancer(profil)
  const page = await app.firstWindow()
  await entrerCorpus(page) // Accueil → Corpus (corpus par défaut du profil)

  // Stub du dialog de dossier : 1er appel → dirB, 2e → dirC.
  await app.evaluate(({ dialog }, dirs) => {
    let i = 0
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dirs[i++]] })
  }, [dirB, dirC])

  // Corpus par défaut (profil) : renommer son entretien pour le distinguer.
  await page.locator('.ents li .titre').first().fill('ENT-DEFAUT')
  await page.keyboard.press('Tab')

  // Accueil → « Ouvrir un corpus… » → dirB (neuf, amorcé avec son propre seed).
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await page.locator('.carte.choisir-corpus').click()
  await attendreCorpus(page)
  // Nouveau corpus, isolé : le seed frais « Entretien Karine », PAS « ENT-DEFAUT ».
  await expect(page.locator('.ents li')).toHaveCount(1)
  await expect(page.locator('.ents li .titre').first()).toHaveValue('Entretien Karine')
  // Renommer l'entretien de dirB.
  await page.locator('.ents li .titre').first().fill('ENT-B')
  await page.keyboard.press('Tab')

  // Accueil : dirB apparaît dans les récents.
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await expect(page.locator('.recents li')).toHaveCount(1)
  await expect(page.locator('.recents .recent').first()).toContainText(basename(dirB))

  // « Ouvrir un corpus… » → dirC (neuf) : encore un seed frais et isolé.
  await page.locator('.carte.choisir-corpus').click()
  await attendreCorpus(page)
  await expect(page.locator('.ents li .titre').first()).toHaveValue('Entretien Karine')

  // Accueil : dirC ET dirB en récents ; rouvrir dirB → « ENT-B » revient (round-trip).
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await expect(page.locator('.recents li')).toHaveCount(2)
  await page.locator('.recents .recent', { hasText: basename(dirB) }).click()
  await attendreCorpus(page)
  await expect(page.locator('.ents li .titre').first()).toHaveValue('ENT-B')

  await app.close()
})
