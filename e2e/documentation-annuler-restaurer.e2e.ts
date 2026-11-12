import { test, expect, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import JSZip from 'jszip'
import type { CorpusFichier } from '../src/shared/format'
import { lancer, coderTheme, entrerCorpus, entrerEntretien, fermerAiguillage, retourCorpus, selectionner } from './util'

async function clicDroitSelection(page: Page) {
  const centre = await page.evaluate(() => {
    const selection = window.getSelection()
    if (!selection?.rangeCount) throw new Error('Sélection absente.')
    const rect = selection.getRangeAt(0).getClientRects()[0]
    if (!rect) throw new Error('Sélection sans position visible.')
    return { x: rect.x + Math.min(rect.width / 2, 8), y: rect.y + rect.height / 2 }
  })
  await page.mouse.click(centre.x, centre.y, { button: 'right' })
}

async function creerCommentaire(page: Page) {
  await selectionner(page, 'Lyon')
  await clicDroitSelection(page)
  await page.getByRole('menuitem', { name: /Commenter/ }).evaluate((element: HTMLElement) => element.click())
  await page.locator('[data-test="commentaire-auteur"]').fill('Karine D.')
  await page.locator('[data-test="commentaire-texte"]').fill('Vérifier le lieu avant diffusion.')
  await page.locator('[data-test="commentaire-valider"]').click()
  await expect(page.locator('.carte-commentaire')).toContainText('Vérifier le lieu')
}

async function creerNote(page: Page) {
  await page.locator('[data-onglet="notes"]').click()
  const formulaire = page.locator('.nouvelle-note-inline')
  await formulaire.locator('.champ-titre-note input').fill('Note avant correction')
  await formulaire.locator('.zone-corps-note').fill('Cette note sert à vérifier le Journal du corpus.')
  await formulaire.getByRole('button', { name: 'Créer une note', exact: true }).click()
  await expect(page.locator('.carte-note')).toContainText('Note avant correction')
}

async function extraireZip(archive: string, destination: string) {
  const zip = await JSZip.loadAsync(readFileSync(archive))
  for (const [nom, entree] of Object.entries(zip.files)) {
    if (entree.dir) continue
    const chemin = join(destination, ...nom.split('/'))
    mkdirSync(dirname(chemin), { recursive: true })
    writeFileSync(chemin, await entree.async('nodebuffer'))
  }
}

test('manuel : distinguer Ctrl+Z et le Journal de l’entretien', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-annulation-'))
  const app = await lancer(racine, { executablePath: process.env.JOURNAL_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await entrerCorpus(page)
    await entrerEntretien(page)

    const editeur = page.locator('.editeur')
    await page.waitForTimeout(600)
    await editeur.click()
    await editeur.press('ControlOrMeta+End')
    await page.keyboard.insertText(' Ajout temporaire.')
    await expect(editeur).toContainText('Ajout temporaire.')
    await editeur.press('ControlOrMeta+z')
    await expect(editeur).not.toContainText('Ajout temporaire.')
    await expect(editeur).toContainText('Karine habite Lyon depuis sa retraite.')
    await editeur.press('ControlOrMeta+Shift+z')
    await expect(editeur).toContainText('Ajout temporaire.')
    await editeur.press('ControlOrMeta+z')

    await selectionner(page, 'Karine')
    await coderTheme(page, 'Famille')
    await page.locator('[data-onglet="locuteurs"]').click()
    await page.locator('.nom-loc').nth(1).fill('Karine D.')
    await page.locator('.nom-loc').nth(1).press('Tab')
    await creerCommentaire(page)

    await page.locator('[data-onglet="journal"]').click()
    const journal = page.locator('.panneau.journal')
    await expect(journal.locator('.liste-journal li')).toHaveCount(3)
    await expect(journal).toContainText('Commentaire posé')
    await expect(journal).toContainText('Locuteur renommé : Karine → Karine D.')
    await expect(journal).toContainText('Codage posé : Famille')
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.screenshot({ path: 'docs/user/medias/journal-entretien.png' })
    }

    await journal.locator('.liste-journal li', { hasText: 'Codage posé : Famille' }).locator('.annuler-entree').click()
    await expect(editeur.locator('.annot')).toHaveCount(1)
    await expect(page.locator('.carte-commentaire')).toHaveCount(1)
    await creerNote(page)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')

    await retourCorpus(page)
    await page.getByRole('button', { name: 'Notes', exact: true }).click()
    const notes = page.locator('.notes-corpus')
    await notes.getByRole('button', { name: 'Modifier la note Note avant correction', exact: true }).click()
    const edition = page.getByRole('dialog', { name: 'Modifier la note', exact: true })
    await edition.getByLabel('Titre', { exact: true }).fill('Note corrigée')
    await edition.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(notes).toContainText('Note corrigée')

    // Le niveau corpus ne propose plus d'historique des actions.
    await expect(page.getByRole('button', { name: 'Actions récentes', exact: true })).toHaveCount(0)

    await page.locator('.onglets-corpus').getByRole('button', { name: 'Entretiens', exact: true }).click()
    await entrerEntretien(page)
    await page.locator('[data-onglet="journal"]').click()
    await expect(page.locator('.panneau.journal')).toContainText('Aucune action enregistrée.')
  } finally {
    await app.close()
  }
})

test('manuel : créer une sauvegarde ZIP puis ouvrir sa restauration dans un nouveau dossier', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-sauvegarde-'))
  const profil = join(racine, 'profil')
  const archive = join(racine, 'copie-avant-modification.zip')
  const restauration = join(racine, 'corpus-restaure')
  const app = await lancer(profil, { executablePath: process.env.JOURNAL_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const carte = page.locator('.carte-ent').first()
    await carte.click()
    await page.locator('.titre-meta').fill('Version sauvegardée')
    await page.locator('.titre-meta').press('Tab')
    await expect(carte).toContainText('Version sauvegardée')

    await app.evaluate(({ dialog, Menu }, chemin) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: chemin })
      const corpus = Menu.getApplicationMenu()!.items.find((item) => item.label === 'Corpus')!
      corpus.submenu!.items.find((item) => item.label.startsWith('Faire une copie de sauvegarde'))!.click()
    }, archive)
    await expect.poll(() => existsSync(archive)).toBe(true)
    await expect(page.locator('.banniere.info')).toContainText('Copie de sauvegarde créée')
    const zip = await JSZip.loadAsync(readFileSync(archive))
    const corpusArchive = JSON.parse(await zip.file('corpus.crp')!.async('string')) as CorpusFichier
    expect(corpusArchive.membership.e1.titre).toBe('Version sauvegardée')

    await page.locator('.titre-meta').fill('Version modifiée après sauvegarde')
    await page.locator('.titre-meta').press('Tab')
    await expect(carte).toContainText('Version modifiée après sauvegarde')
    await extraireZip(archive, restauration)

    await page.locator('.fil').getByRole('button', { name: 'Accueil', exact: true }).click()
    await app.evaluate(({ dialog }, dossier) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dossier] })
    }, join(restauration, 'corpus.crp'))
    await page.locator('.ouvrir-corpus').click()
    await fermerAiguillage(page, 'entretiens', 10_000)
    await expect(page.locator('.corpus-ecran')).toBeVisible()
    await expect(page.locator('.carte-ent')).toContainText('Version sauvegardée')
    await expect(page.locator('.carte-ent')).not.toContainText('Version modifiée après sauvegarde')

    const courant = JSON.parse(readFileSync(join(profil, 'corpus', 'corpus.crp'), 'utf8')) as CorpusFichier
    expect(courant.membership.e1.titre).toBe('Version modifiée après sauvegarde')
    expect(readFileSync(join(restauration, 'corpus.crp'), 'utf8')).not.toBe(readFileSync(join(profil, 'corpus', 'corpus.crp'), 'utf8'))
  } finally {
    await app.close()
  }
})
