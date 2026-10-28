import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, entrerCorpus, retourCorpus, ajouterParModale } from './util'

const source = readFileSync(join(process.cwd(), 'docs/user/traiter/importer.html'), 'utf8')
const exemples = [...source.matchAll(/<code data-fichier="([^"]+)">([\s\S]*?)<\/code>/g)]
  .map((match) => ({ nom: match[1], contenu: match[2] }))

test('les exemples du guide s’importent depuis la fenêtre d’ajout sans modifier les sources', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-import-'))
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await entrerCorpus(page)
    await page.locator('.ajout-ent').click()
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.modale-ajout').screenshot({ path: 'docs/user/medias/ajouter-entretien.png' })
    }
    await page.locator('.modale-ajout .annuler').click()
    await expect(page.locator('.carte-ent')).toHaveCount(1)
    expect(exemples).toHaveLength(5)
    for (const [index, exemple] of exemples.entries()) {
      const fichier = join(racine, exemple.nom)
      writeFileSync(fichier, exemple.contenu)
      await app.evaluate(({ dialog }, chemin) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chemin] })
      }, fichier)
      await ajouterParModale(page, ['texte'])
      await expect(page.locator('.entretien-ecran')).toBeVisible()
      await expect(page.locator('.editeur')).toContainText('Depuis quand êtes-vous bénévole')
      await expect(page.locator('.editeur')).toContainText('aide aux devoirs depuis cinq ans')
      await expect(page.locator('.editeur p[data-loc]')).toHaveCount(2)
      await expect(page.locator('.tete .etat')).toHaveText('à jour')
      expect(readFileSync(fichier, 'utf8')).toBe(exemple.contenu)
      await retourCorpus(page)
      await expect(page.locator('.carte-ent')).toHaveCount(index + 2)
    }
    await ajouterParModale(page, ['texte'])
    await expect(page.locator('.entretien-ecran')).toBeVisible()
    await retourCorpus(page)
    await expect(page.locator('.carte-ent')).toHaveCount(exemples.length + 2)
  } finally {
    await app.close()
  }
})

test('un TXT tabulé invalide ne crée aucun entretien et permet une nouvelle sélection', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-txt-invalide-'))
  const fichier = join(racine, 'invalide.txt')
  const contenu = '0\tAlice\tBonjour\n\n2\t\tRéponse'
  writeFileSync(fichier, contenu)
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await app.evaluate(({ dialog }, chemin) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chemin] })
    }, fichier)
    await ajouterParModale(page, ['texte'])
    await expect(page.locator('.msg-ajout')).toContainText('Ligne 3')
    await expect(page.locator('.msg-ajout')).toContainText('locuteur est manquant')
    await expect(page.locator('.modale-ajout')).toBeVisible()
    await expect(page.locator('.carte-ent')).toHaveCount(1)
    expect(readFileSync(fichier, 'utf8')).toBe(contenu)

    const corrige = join(racine, 'corrige.txt')
    writeFileSync(corrige, '0\tAlice\tBonjour\n2\tBob\tRéponse')
    await app.evaluate(({ dialog }, chemin) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chemin] })
    }, corrige)
    await page.locator('.zone-texte').click()
    await expect(page.locator('.zone-texte .zone-fichier')).toHaveText('corrige.txt')
    await page.locator('.modale-ajout .valider').click()
    await expect(page.locator('.editeur')).toContainText('Bonjour')
    await expect(page.locator('.editeur')).toContainText('Réponse')
    await expect(page.locator('.editeur p[data-loc]')).toHaveCount(2)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await retourCorpus(page)
    await expect(page.locator('.carte-ent')).toHaveCount(2)
  } finally {
    await app.close()
  }
})

test('les parcours et les deux exemples se consultent avant de préparer une copie', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-doc-decouverte-')))
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await attendreAccueil(page)
    const avant = await page.evaluate(() => window.sonal.corpus.dossierCourant())
    await page.locator('.carte-demo.parcours').click()
    const catalogue = page.getByRole('dialog', { name: 'Choisir un parcours pas à pas' })
    await expect(catalogue.locator('.carte-parcours')).toHaveCount(4)
    await expect(catalogue.locator('.liste-pp li')).toHaveCount(4)
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await catalogue.screenshot({ path: 'docs/user/medias/choisir-parcours.png' })
    }
    await catalogue.getByRole('button', { name: /^Importer et traiter/ }).click()
    await expect(catalogue.locator('.liste-pp li')).toHaveCount(6)
    await catalogue.getByRole('button', { name: 'Fermer les parcours' }).click()
    await page.locator('.carte-demo.exemples').click()
    const exploration = page.getByRole('dialog', { name: 'Explorer les corpus exemples' })
    await expect(exploration.locator('.exemple h3')).toHaveText(['Entretiens déjà importés', 'Corpus annoté'])
    await exploration.getByRole('button', { name: 'Fermer les exemples' }).click()
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toEqual(avant)
    expect((await page.evaluate(() => window.sonal.exemples.etat())).travaux).toHaveLength(0)
  } finally {
    await app.close()
  }
})
