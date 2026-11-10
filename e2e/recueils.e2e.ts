import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, entrerEntretien, ouvrirOrganisation, selectionner } from './util'

test('recueil vivant dans l’organisation, ajout contextuel et retour à l’entretien', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'sonal-recueil-e2e-'))
  const app = await lancer(userDataDir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await expect(page.locator('.barre-outils .btn-recueils')).toHaveCount(0)
    await expect(page.locator('.onglets-corpus').getByRole('button', { name: 'Recueils' })).toHaveCount(0)
    await page.getByRole('button', { name: /^Cas et Recueils sont dans Organiser & Exporter/ }).click()
    await ouvrirOrganisation(page, 'recueils')
    const panneau = page.locator('#contenu-recueils-organisation')
    await expect(panneau).toBeVisible()
    await panneau.getByPlaceholder('Nom du nouveau recueil').fill('Synthèse terrain')
    await panneau.getByPlaceholder('Nom du nouveau recueil').press('Enter')
    await expect(panneau.locator('.nom-recueil')).toHaveValue('Synthèse terrain')
    await panneau.getByPlaceholder('Libellé du titre').fill('Contexte')
    await panneau.getByRole('button', { name: '＋ Ajouter le titre', exact: true }).click()
    await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()

    await entrerEntretien(page)
    await expect(page.locator('.onglets button[data-onglet="recueils"]')).toHaveCount(0)
    await selectionner(page, 'Karine habite Lyon')
    const centre = await page.evaluate(() => {
      const plage = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
      return { x: plage.x + plage.width / 2, y: plage.y + plage.height / 2 }
    })
    await page.mouse.click(centre.x, centre.y, { button: 'right' })
    await page.getByRole('menuitem', { name: /recueil/ }).click()
    const dialogue = page.getByRole('dialog', { name: 'Ajouter à un recueil', exact: true })
    await expect(dialogue).toBeVisible()
    await expect(dialogue.locator('.recueils-corpus')).toHaveCount(0)
    await expect(dialogue.locator('blockquote')).toHaveText('Karine habite Lyon')
    await dialogue.getByLabel('Emplacement du passage').selectOption({ label: 'Avant Contexte' })
    await dialogue.getByRole('button', { name: 'Ajouter le passage', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    await expect(page.locator('.entretien-ecran')).toBeVisible()
    await page.getByRole('button', { name: 'Ouvrir le recueil « Synthèse terrain »', exact: true }).click()
    await expect(panneau.locator('.passage blockquote')).toContainText('Karine habite Lyon')
    await page.getByRole('button', { name: /Revenir au passage/ }).click()
    await expect(page.locator('.editeur')).toBeFocused()
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Karine habite Lyon')

    await selectionner(page, 'habite')
    await page.keyboard.type('réside')
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await ouvrirOrganisation(page, 'recueils')
    await expect(panneau.locator('.passage blockquote')).toContainText('Karine réside Lyon')
    await expect(panneau.locator('.passage blockquote')).not.toContainText('habite')
    await expect(page.locator('.modale-recueils')).toBeHidden()
    await expect(page.locator('.recueils-corpus')).toHaveCount(1)
    await panneau.getByLabel('Numérotation des titres').selectOption('plan')
    await panneau.getByRole('button', { name: 'Voir dans l’entretien', exact: true }).click()
    await expect(page.locator('.entretien-ecran')).toBeVisible()
    await page.getByRole('button', { name: /Revenir au recueil « Synthèse terrain »/ }).click()
    await expect(panneau.locator('.nom-recueil')).toHaveValue('Synthèse terrain')
    await expect(panneau.getByLabel('Numérotation des titres')).toHaveValue('plan')
    await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()
    await expect(page.locator('.editeur')).toContainText('Karine réside Lyon')

    const corpus = JSON.parse(readFileSync(join(userDataDir, 'corpus', 'corpus.json'), 'utf8'))
    const recueil = Object.values(corpus.recueils)[0] as any
    expect(recueil.items[0].source).toMatchObject({ entretienId: 'e1' })
    expect(recueil.items[1]).toMatchObject({ type: 'titre', libelle: 'Contexte' })
    expect(recueil.items[0]).not.toHaveProperty('texte')
    expect(recueil.items[0].source).not.toHaveProperty('from')
    const entretien = JSON.parse(readFileSync(join(userDataDir, 'corpus', 'entretiens', 'e1.json'), 'utf8'))
    expect(entretien.reperesPassages).toHaveLength(1)
  } finally {
    await app.close()
  }
})
