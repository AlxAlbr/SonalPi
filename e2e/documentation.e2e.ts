import { test, expect, chromium } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lancer, entrerCorpus, entrerEntretien } from './util'
import { intercepterOuverturesAide, lireOuverturesAide } from './aide-util'

test('l’aide ouvre des pages locales navigables hors ligne, sans fermer l’entretien', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-aide-')), {
    executablePath: process.env.DOCS_E2E_EXECUTABLE,
  })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await expect(page.locator('.editeur')).toContainText('Karine')
    const titre = await page.locator('.fil').innerText()
    await intercepterOuverturesAide(app)
    await app.evaluate(({ Menu }) => {
      const aide = Menu.getApplicationMenu()!.items.find((item) => item.label === 'Aide')!
      for (const item of aide.submenu!.items) item.click()
    })
    await expect.poll(async () => (await lireOuverturesAide(app)).fichiers.length).toBe(2)
    const fichiers = (await lireOuverturesAide(app)).fichiers
    expect(fichiers).toHaveLength(2)
    expect(fichiers[0]).toMatch(/[/\\]index\.html$/)
    expect(fichiers[1]).toMatch(/[/\\]faq[/\\]premiers-pas\.html$/)
    expect(await app.windows()).toHaveLength(1)
    await expect(page.locator('.editeur')).toBeVisible()
    expect(await page.locator('.fil').innerText()).toBe(titre)
    if (process.env.DOCS_E2E_EXECUTABLE) {
      expect(await app.evaluate(({ app: application }) => application.isPackaged)).toBe(true)
      expect(fichiers[0]).toMatch(/[/\\]resources[/\\]documentation[/\\]/)
    }

    const navigateur = await chromium.launch()
    try {
      const contexte = await navigateur.newContext({ offline: true, javaScriptEnabled: false })
      const lecture = await contexte.newPage()
      await lecture.goto(pathToFileURL(fichiers[0]).href)
      await expect(lecture.getByRole('heading', { level: 1 })).toHaveText('Documentation utilisateur')
      await expect(lecture.locator('main > h2')).toHaveText([
        'Découvrir et démarrer',
        'Importer et traiter',
        'Organiser et exporter',
        'Questions fréquentes',
        'Lire et pratiquer à votre rythme',
      ])
      await expect(lecture.locator('main > ol')).toHaveCount(3)
      await expect(lecture.locator('main > ol').nth(0).locator('li')).toHaveCount(4)
      await expect(lecture.locator('main > ol').nth(1).locator('li')).toHaveCount(11)
      await expect(lecture.locator('main > ol').nth(2).locator('li')).toHaveCount(2)
      await lecture.setViewportSize({ width: 390, height: 844 })
      for (const chapitre of [
        'Découvrir SonalPi',
        'Comprendre les notions et se repérer',
        'Choisir un parcours ou un corpus exemple',
        'Créer et retrouver un corpus local',
        'Préparer et importer une transcription',
        'Gérer les entretiens et leurs médias',
        'Relire et corriger un entretien',
        'Identifier les locuteurs et les tours de parole',
        'Coder un premier passage avec un thème',
        'Organiser et documenter ses thèmes',
        'Définir les variables et saisir les données',
        'Écrire et consulter des notes',
        'Commenter un passage',
        'Pseudonymiser et vérifier un entretien',
        'Revenir sur une modification',
        'Exporter un entretien',
        'Exporter un lot d’entretiens',
      ]) {
        await lecture.locator('.suite a[rel="next"]').click()
        await expect(lecture.getByRole('heading', { level: 1 })).toHaveText(chapitre)
        await expect.poll(() => lecture.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), chapitre).toBe(true)
        for (const image of await lecture.locator('img').all()) {
          await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
        }
      }
      await lecture.getByRole('link', { name: /Suivant : questions/ }).click()
      await expect(lecture.getByRole('heading', { level: 1 })).toHaveText('Questions fréquentes')
      await expect(lecture.locator('main > h2')).toHaveCount(9)
      await expect(lecture.locator('main > h3')).toHaveCount(52)
      await lecture.getByRole('link', { name: 'Contrôler le bilan et les fichiers du lot.' }).click()
      await expect(lecture).toHaveURL(/exporter-corpus\.html#bilan$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Contrôler les sous-titres exportés.' }).click()
      await expect(lecture).toHaveURL(/exporter-entretien\.html#sous-titres$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.locator('#export-sauvegarde + p + p').getByRole('link', { name: 'Créer une copie de sauvegarde ZIP.' }).click()
      await expect(lecture).toHaveURL(/annuler-restaurer\.html#sauvegarder$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Restaurer le corpus et vérifier ses médias.' }).click()
      await expect(lecture).toHaveURL(/annuler-restaurer\.html#restaurer$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Gérer les graphies et les variantes.' }).click()
      await expect(lecture).toHaveURL(/pseudonymiser\.html#variantes$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Contrôler les règles et leurs occurrences.' }).click()
      await expect(lecture).toHaveURL(/pseudonymiser\.html#verifier-corpus$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Comprendre ce qui doit être vérifié avant le partage.' }).click()
      await expect(lecture).toHaveURL(/commentaires\.html#exporter$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Retrouver un commentaire dans la transcription.' }).click()
      await expect(lecture).toHaveURL(/commentaires\.html#retrouver$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Exporter les notes affichées avec les bonnes précautions.' }).click()
      await expect(lecture).toHaveURL(/notes\.html#exporter$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Comprendre privé et public pour les notes.' }).click()
      await expect(lecture).toHaveURL(/notes\.html#prive-public$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Exporter la table vers un tableur.' }).click()
      await expect(lecture).toHaveURL(/donnees\.html#csv$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Comprendre les limites du statut privé.' }).click()
      await expect(lecture).toHaveURL(/donnees\.html#privee$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Comprendre les sous-thèmes et leurs compteurs.' }).click()
      await expect(lecture).toHaveURL(/organiser-themes\.html#hierarchie$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Comprendre la portée du pseudonyme de locuteur.' }).click()
      await expect(lecture).toHaveURL(/locuteurs\.html#pseudo$/)
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Lire le bilan et parcourir les prises de parole.' }).click()
      await expect(lecture).toHaveURL(/locuteurs\.html#statistiques$/)
      await expect(lecture.locator('#statistiques')).toBeVisible()
      await lecture.locator('header').getByRole('link', { name: 'FAQ', exact: true }).click()
      await lecture.getByRole('link', { name: 'Retirer un codage sans supprimer le thème.' }).click()
      await expect(lecture).toHaveURL(/premier-codage\.html#retirer-codage$/)
      await lecture.getByRole('link', { name: 'Sommaire', exact: true }).click()
      await expect(lecture.getByRole('heading', { level: 1 })).toHaveText('Documentation utilisateur')
      await lecture.goto(pathToFileURL(fichiers[1]).href)
      await expect(lecture.getByRole('heading', { level: 1 })).toHaveText('Questions fréquentes')
      await lecture.setViewportSize({ width: 390, height: 844 })
      expect(await lecture.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await lecture.keyboard.press('Tab')
      await expect(lecture.getByRole('link', { name: 'Aller au contenu' })).toBeFocused()
      expect(readFileSync(fichiers[0], 'utf8')).not.toContain('<script')
    } finally {
      await navigateur.close()
    }
    await expect(page.locator('.editeur')).toBeVisible()
    await expect(page.locator('.editeur')).toContainText('Karine')
  } finally {
    await app.close()
  }
})
