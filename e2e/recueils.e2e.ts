import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, entrerEntretien, selectionner } from './util'

test('recueil vivant accessible par le bouton supérieur, sans onglet dédié', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'sonal-recueil-e2e-'))
  const app = await lancer(userDataDir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await expect(page.locator('.btn-recueils')).toBeVisible()
  await expect(page.locator('.onglets-corpus').getByRole('button', { name: 'Recueils' })).toHaveCount(0)
  await page.locator('.btn-recueils').click()
  await expect(page.locator('.modale-recueils')).toBeVisible()
  await page.getByPlaceholder('Nom du nouveau recueil').fill('Synthèse terrain')
  await page.getByPlaceholder('Nom du nouveau recueil').press('Enter')
  await expect(page.locator('.nom-recueil')).toHaveValue('Synthèse terrain')
  await page.getByTitle('Fermer les recueils').click()

  await entrerEntretien(page)
  await expect(page.locator('.onglets button[data-onglet="recueils"]')).toHaveCount(0)
  await selectionner(page, 'Karine habite Lyon')
  await page.locator('.btn-recueils').click()
  await page.getByRole('button', { name: '＋ Ajouter la sélection' }).click()
  await expect(page.locator('.passage blockquote')).toContainText('Karine habite Lyon')
  await page.getByTitle('Fermer les recueils').click()

  await selectionner(page, 'habite')
  await page.keyboard.type('réside')
  // Le recueil relit l'entretien SUR DISQUE : attendre l'autosave (l'en-tête
  // affiche « à jour » quand l'écriture est terminée).
  await expect(page.locator('.tete .etat')).toHaveText('à jour')
  await page.locator('.btn-recueils').click()
  await expect(page.locator('.passage blockquote')).toContainText('Karine réside Lyon')
  await expect(page.locator('.passage blockquote')).not.toContainText('habite')
  await page.getByTitle('Fermer les recueils').click()

  await app.close()
  const corpus = JSON.parse(readFileSync(join(userDataDir, 'corpus', 'corpus.json'), 'utf8'))
  const recueil = Object.values(corpus.recueils)[0] as any
  expect(recueil.items[0].source).toMatchObject({ entretienId: 'e1' })
  expect(recueil.items[0]).not.toHaveProperty('texte')
  expect(recueil.items[0].source).not.toHaveProperty('from')
  const entretien = JSON.parse(readFileSync(join(userDataDir, 'corpus', 'entretiens', 'e1.json'), 'utf8'))
  expect(entretien.reperesPassages).toHaveLength(1)
})
