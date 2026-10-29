import { test, expect, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import { lancer, attendreAccueil, selectionner, retourCorpus, entrerCorpus, entrerEntretien } from './util'
import { choisirDossierExemple, configurerSourcesExemples } from './exemples-util'

const passage = 'ça devait être en 2012'
const auteur = 'Karine D.'
const commentaireInitial = 'Vérifier la date dans le carnet de terrain.'
const commentaireCorrige = 'Vérifier la date et la source dans le carnet de terrain.'

async function selectionnerVisible(page: Page, texte: string) {
  await page.locator('.editeur p').filter({ hasText: texte }).first().scrollIntoViewIfNeeded()
  await selectionner(page, texte)
}

async function clicDroitSelection(page: Page) {
  const centre = await page.evaluate(() => {
    const selection = window.getSelection()
    if (!selection?.rangeCount) throw new Error('Sélection absente.')
    const rect = selection.getRangeAt(0).getClientRects()[0]
    if (!rect) throw new Error('Sélection sans rectangle visible.')
    return { x: rect.x + Math.min(rect.width / 2, 8), y: rect.y + rect.height / 2 }
  })
  await page.mouse.click(centre.x, centre.y, { button: 'right' })
}

async function creerCommentaire(page: Page, texte = commentaireInitial) {
  await selectionnerVisible(page, passage)
  await clicDroitSelection(page)
  await page.getByRole('menuitem', { name: /Commenter/ }).evaluate((element: HTMLElement) => element.click())
  await page.locator('[data-test="commentaire-auteur"]').fill(auteur)
  await page.locator('[data-test="commentaire-texte"]').fill(texte)
  await page.locator('[data-test="commentaire-valider"]').click()
  await expect(page.locator('.carte-commentaire')).toContainText(texte)
  await expect(page.locator('.tete .etat')).toHaveText('à jour')
}

async function exporterSonal(app: Awaited<ReturnType<typeof lancer>>, page: Page, chemin: string) {
  await app.evaluate(({ dialog }, sortie) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: sortie })
  }, chemin)
  await page.getByRole('button', { name: 'Exporter cet entretien', exact: true }).click()
  await page.locator('.ligne-format', { hasText: '.sonal' }).click()
  await page.locator('.actions .exporter').click()
  await expect.poll(() => existsSync(chemin)).toBe(true)
}

test('manuel : créer, retrouver, modifier, exporter, supprimer et rétablir un commentaire', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-commentaires-'))
  const dossier = join(racine, 'exemple')
  const app = await lancer(join(racine, 'profil'), { executablePath: process.env.COMMENTAIRES_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await attendreAccueil(page)
    await configurerSourcesExemples(app, join(racine, 'sources'))
    await choisirDossierExemple(app, dossier)
    await page.locator('.carte-demo.exemples').click()
    await page.locator('.exemple').filter({
      has: page.getByRole('heading', { name: 'Entretiens déjà importés', exact: true }),
    }).getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Modifier…', exact: true }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
    const corpus = JSON.parse(readFileSync(join(dossier, 'corpus.json'), 'utf8')) as CorpusFichier
    const id = Object.entries(corpus.membership).find(([, ref]) => ref.titre === '1Coordinatrice')![0]
    const fichier = join(dossier, 'entretiens', `${id}.json`)
    const lire = () => JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier
    const avant = lire()
    await page.locator('.carte-ent').filter({ hasText: '1Coordinatrice' }).locator('.crayon').click()

    await creerCommentaire(page)
    const carte = page.locator('.carte-commentaire')
    const plage = page.locator('.editeur .annot', { hasText: passage })
    await expect(carte).toContainText(auteur)
    await expect(plage).toHaveAttribute('title', new RegExp(auteur))
    await plage.hover()
    await expect(carte).toHaveClass(/survol/)
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.editeur p.p-commente').filter({ hasText: passage }).screenshot({
        path: 'docs/user/medias/commentaire-passage.png',
      })
    }

    await carte.evaluate((element: HTMLElement) => element.click())
    await expect(page.locator('[data-test="commentaire-auteur"]')).toHaveValue(auteur)
    await page.locator('[data-test="commentaire-texte"]').fill(commentaireCorrige)
    await page.locator('[data-test="commentaire-valider"]').click()
    await expect(carte).toContainText(commentaireCorrige)
    await selectionnerVisible(page, 'Oui, 2012')
    await clicDroitSelection(page)
    await page.getByRole('menuitem', { name: /Commenter/ }).evaluate((element: HTMLElement) => element.click())
    await expect(page.locator('[data-test="commentaire-auteur"]')).toHaveValue(auteur)
    await page.keyboard.press('Escape')
    await expect(page.locator('.carte-commentaire')).toHaveCount(1)

    await fenetre.evaluate((w) => w.setContentSize(900, 900))
    await expect(carte).toBeHidden()
    await plage.scrollIntoViewIfNeeded()
    const boite = (await plage.boundingBox())!
    await page.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2, { button: 'right' })
    await expect(page.getByRole('menuitem', { name: /Commentaire — Karine D\./ })).toBeVisible()
    await page.keyboard.press('Escape')
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await expect(carte).toBeVisible()

    const cheminExport = join(racine, 'commentaire.sonal')
    await exporterSonal(app, page, cheminExport)
    const exporte = readFileSync(cheminExport, 'utf8')
    expect(exporte).toContain(`data-obs="${commentaireCorrige}"`)
    expect(exporte).toContain(`data-auth="${auteur}"`)

    await carte.evaluate((element: HTMLElement) => element.click())
    await page.locator('[data-test="commentaire-supprimer"]').click()
    await expect(page.locator('.carte-commentaire')).toHaveCount(0)
    await expect(page.locator('.editeur')).toContainText(passage)
    await page.locator('[data-onglet="journal"]').click()
    const entree = page.locator('.liste-journal li').filter({ hasText: 'Commentaire supprimé' })
    await entree.locator('.annuler-entree').click()
    await expect(page.locator('.carte-commentaire')).toContainText(commentaireCorrige)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')

    const apres = lire()
    expect(apres.corpsTexte).toEqual(avant.corpsTexte)
    expect(apres.ancres).toEqual(avant.ancres)
    expect(apres.locuteurs).toEqual(avant.locuteurs)
    expect(apres.annotations.filter((annotation) => annotation.type === 'commentaire')).toEqual([
      expect.objectContaining({ auteur, texte: commentaireCorrige }),
    ])
    await retourCorpus(page)
    await page.locator('.carte-ent').filter({ hasText: '1Coordinatrice' }).locator('.crayon').click()
    await expect(page.locator('.carte-commentaire')).toContainText(commentaireCorrige)
  } finally {
    await app.close()
  }
})

test('manuel : un commentaire reste consultable sans être modifiable en lecture seule', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-commentaires-lecture-'))
  const app = await lancer(racine, { executablePath: process.env.COMMENTAIRES_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await selectionnerVisible(page, 'Karine')
    await clicDroitSelection(page)
    await page.getByRole('menuitem', { name: /Commenter/ }).evaluate((element: HTMLElement) => element.click())
    await page.locator('[data-test="commentaire-auteur"]').fill(auteur)
    await page.locator('[data-test="commentaire-texte"]').fill('Commentaire consultable.')
    await page.locator('[data-test="commentaire-valider"]').click()
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await retourCorpus(page)
    const fichier = join(racine, 'corpus/entretiens/e1.json')
    const avant = readFileSync(fichier, 'utf8')
    await app.evaluate(({ ipcMain }, data) => {
      ipcMain.removeHandler('corpus:ouvrirEntretienPourEdition')
      ipcMain.handle('corpus:ouvrirEntretienPourEdition', () => ({
        ok: true,
        acces: 'lecture-seule',
        verrouTenuParAutrui: null,
        data,
      }))
    }, JSON.parse(avant))
    await entrerEntretien(page)
    await expect(page.locator('.editeur')).toHaveAttribute('contenteditable', 'false')
    const carte = page.locator('.carte-commentaire')
    await expect(carte).toContainText('Commentaire consultable.')
    await carte.evaluate((element: HTMLElement) => element.click())
    await expect(page.locator('[data-test="modale-commentaire"]')).toHaveCount(0)
    await selectionnerVisible(page, 'Karine')
    await clicDroitSelection(page)
    await expect(page.locator('.menu-ctx')).toHaveCount(0)
    expect(readFileSync(fichier, 'utf8')).toBe(avant)
  } finally {
    await app.close()
  }
})
