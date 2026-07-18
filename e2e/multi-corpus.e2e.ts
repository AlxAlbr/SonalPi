import { test, expect } from '@playwright/test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { lancer, entrerCorpus, attendreCorpus, ecrireSeedDemo } from './util'

/** Renomme le 1er entretien via le panneau MÉTA (sélectionne sa carte, édite le nom). */
async function renommerPremier(page: import('@playwright/test').Page, nom: string) {
  await page.locator('.carte-ent').first().click() // sélectionne → colonne gauche = méta
  const input = page.locator('.meta-ent .titre-meta')
  await input.fill(nom)
  await input.blur() // @change → renomme (membership réactif)
}

/**
 * S2 inc. 2 — multi-corpus : « Ouvrir un corpus… » (openDirectory, stubbé) bascule
 * le store du main sur un autre dossier ; les récents sont mémorisés (settings.json
 * du profil) ; rouvrir un récent retrouve SON contenu (chaque dossier = un corpus).
 */
test('ouvrir un autre dossier, récents mémorisés, round-trip entre corpus', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-multi-'))
  const dirB = mkdtempSync(join(tmpdir(), 'sonal-corpusB-'))
  const dirC = mkdtempSync(join(tmpdir(), 'sonal-corpusC-'))
  // dirB = un corpus EXISTANT (baseline démo posée d'avance) ; dirC reste VIERGE
  // (prouve le nouvel amorçage S8 rév. : un corpus neuf naît vide).
  ecrireSeedDemo(dirB)

  const app = await lancer(profil)
  const page = await app.firstWindow()
  await entrerCorpus(page) // Accueil → Corpus (corpus par défaut du profil)

  // Stub du dialog de dossier : 1er appel → dirB, 2e → dirC.
  await app.evaluate(({ dialog }, dirs) => {
    let i = 0
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dirs[i++]] })
  }, [dirB, dirC])

  // Corpus par défaut (profil) : renommer son entretien pour le distinguer.
  await renommerPremier(page, 'ENT-DEFAUT')

  // Accueil → « Ouvrir un corpus… » → dirB (existant, avec son propre contenu).
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await page.locator('.carte.choisir-corpus').click()
  await attendreCorpus(page)
  // Corpus isolé : SON « Entretien Karine », PAS « ENT-DEFAUT ».
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await expect(page.locator('.carte-ent .ent-titre').first()).toHaveText('Entretien Karine')
  // Renommer l'entretien de dirB.
  await renommerPremier(page, 'ENT-B')

  // Accueil : dirB apparaît dans les récents.
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await expect(page.locator('.recents li')).toHaveCount(1)
  await expect(page.locator('.recents .recent').first()).toContainText(basename(dirB))

  // « Ouvrir un corpus… » → dirC (VIERGE) : amorcé VIDE — aucun entretien, et le
  // codebook par défaut = le bloc Pondérations SonalPi (parent + 3 enfants).
  await page.locator('.carte.choisir-corpus').click()
  await attendreCorpus(page)
  await expect(page.locator('.carte-ent')).toHaveCount(0)
  await expect(page.locator('.liste-thm-lecture li')).toHaveCount(4)
  await expect(page.locator('.liste-thm-lecture li').first()).toContainText('Pondérations')

  // Accueil : dirC ET dirB en récents ; rouvrir dirB → « ENT-B » revient (round-trip).
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await expect(page.locator('.recents li')).toHaveCount(2)
  await page.locator('.recents .recent', { hasText: basename(dirB) }).click()
  await attendreCorpus(page)
  await expect(page.locator('.carte-ent .ent-titre').first()).toHaveText('ENT-B')

  // ✕ sur le récent dirC : le RACCOURCI part de la liste, le dossier reste sur
  // disque (l'app ne détruit jamais un corpus).
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await page
    .locator('.recents li', { hasText: basename(dirC) })
    .locator('.oubli-recent')
    .click()
  await expect(page.locator('.recents li')).toHaveCount(1)
  await expect(page.locator('.recents .recent').first()).toContainText(basename(dirB))
  expect(existsSync(join(dirC, 'corpus.json'))).toBe(true)

  await app.close()
})
