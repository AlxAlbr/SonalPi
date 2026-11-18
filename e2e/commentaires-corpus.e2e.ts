import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, selectionner, retourCorpus, entrerCorpus, entrerEntretien } from './util'

async function commenter(page: Page, passage: string, texte: string) {
  await page.locator('.editeur p').filter({ hasText: passage }).first().scrollIntoViewIfNeeded()
  await selectionner(page, passage)
  const centre = await page.evaluate(() => {
    const rect = window.getSelection()!.getRangeAt(0).getClientRects()[0]
    return { x: rect.x + Math.min(rect.width / 2, 8), y: rect.y + rect.height / 2 }
  })
  await page.mouse.click(centre.x, centre.y, { button: 'right' })
  await page.getByRole('menuitem', { name: /Commenter/ }).evaluate((element: HTMLElement) => element.click())
  await page.locator('[data-test="commentaire-auteur"]').fill('Karine D.')
  await page.locator('[data-test="commentaire-texte"]').fill(texte)
  await page.locator('[data-test="commentaire-valider"]').click()
  await expect(page.locator('.tete .etat')).toHaveText('à jour')
}

test('l’onglet Commentaires liste les commentaires du corpus, les filtre et ouvre l’entretien', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-commentaires-corpus-')))
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await commenter(page, 'Karine', 'Prénom à pseudonymiser plus tard.')
    await retourCorpus(page)

    await page.locator('.onglets-corpus').getByRole('button', { name: 'Commentaires', exact: true }).click()
    const onglet = page.getByRole('region', { name: 'Commentaires du corpus' })
    const lignes = onglet.locator('.tableau-notes tbody tr')
    await expect(lignes).toHaveCount(1)
    await expect(lignes.first()).toContainText('Prénom à pseudonymiser plus tard.')
    await expect(lignes.first()).toContainText('Karine D.')
    await expect(lignes.first()).toContainText('« Karine »')

    const recherche = onglet.getByLabel('Rechercher dans les commentaires')
    await recherche.fill('introuvable')
    await expect(lignes).toHaveCount(0)
    await expect(onglet).toContainText('Aucun commentaire ne correspond aux filtres.')
    await recherche.fill('PSEUDONYMISER')
    await expect(lignes).toHaveCount(1)

    await onglet.getByRole('button', { name: 'Feuille' }).click()
    const bloc = onglet.locator('.bloc-commentaire')
    await expect(bloc).toContainText('Prénom à pseudonymiser plus tard.')
    await expect(bloc.locator('.passage-commente')).toContainText('Karine')

    await bloc.getByRole('button', { name: 'Ouvrir dans l’entretien' }).click()
    await expect(page.locator('.entretien-ecran')).toBeVisible()
    await expect(page.locator('.liste-commentaires .aller-commentaire')).toContainText('Prénom à pseudonymiser plus tard.')
  } finally {
    await app.close()
  }
})
