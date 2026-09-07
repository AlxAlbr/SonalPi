import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer } from './util'

test('Personnes : créer, renommer, lier deux entretiens, ouvrir et délier', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-personnes-e2e-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const { id } = await api.creerEntretienVide('Deuxième entretien')
      const lecture = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = lecture.data
      payload.locuteurs = [{ id: 'loc-karine-2', index: 0, nom: 'Mme Dupont', valeursLoc: {}, personneRef: null }]
      await api.ecrireEntretien(id, payload)
    })
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Personnes', exact: true }).click()
    const panneau = page.locator('.personnes-corpus')
    await expect(panneau).toBeVisible()
    await expect(page.locator('.grille-corpus')).toBeHidden()
    await expect(panneau).toContainText('Aucune personne n’est encore identifiée')
    await panneau.getByRole('button', { name: 'Karine', exact: true }).click()
    await panneau.getByLabel('Nom de la nouvelle personne').fill('Karine Dupont')
    await panneau.getByRole('button', { name: 'Créer une personne depuis ce locuteur' }).click()
    await expect(panneau.getByRole('heading', { name: 'Personne · Karine Dupont' })).toBeVisible()
    await panneau.getByLabel('Nom de référence').fill('K. Dupont')
    await panneau.getByLabel('Note de la personne').fill('Identité vérifiée')
    await panneau.getByRole('button', { name: 'Enregistrer la fiche' }).click()
    await expect(panneau.getByRole('heading', { name: 'Personne · K. Dupont' })).toBeVisible()
    await expect(panneau.locator('.liens')).toContainText('Entretien Karine · Karine')
    await panneau.getByRole('button', { name: 'Mme Dupont', exact: true }).click()
    const id = await page.evaluate(async () => (await (window as any).sonal.corpus.personnesInventaire()).personnes[0].id)
    await panneau.getByLabel('Personne à associer').selectOption(id)
    await panneau.getByRole('button', { name: 'Lier à cette personne', exact: true }).click()
    await expect(panneau.getByRole('dialog')).toContainText('Mme Dupont')
    await panneau.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(panneau).toHaveAttribute('aria-busy', 'false')
    await expect(panneau.getByRole('alert')).toHaveCount(0)
    await panneau.locator('.repertoire').getByRole('button', { name: /K\. Dupont/ }).click()
    await expect(panneau.locator('.liens li')).toHaveCount(2)
    await panneau.locator('.liens li').filter({ hasText: 'Entretien Karine' }).getByRole('button', { name: 'Ouvrir l’entretien' }).click()
    await expect(page.locator('.entretien-ecran')).toBeVisible()
    await expect(page.locator('.entretien-ecran button[data-onglet="locuteurs"].actif')).toHaveAttribute('title', 'Locuteurs')
    await page.locator('.barre .retour').click()
    await expect(panneau).toBeVisible()
    await expect(panneau.getByRole('heading', { name: 'Personne · K. Dupont' })).toBeVisible()
    await expect(panneau.getByLabel('Note de la personne')).toHaveValue('Identité vérifiée')
    await expect(panneau).toHaveAttribute('aria-busy', 'false')
    await panneau.locator('.liens li').filter({ hasText: 'Entretien Karine' }).getByRole('button', { name: 'Délier', exact: true }).click()
    await panneau.getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(panneau.locator('.liens li')).toHaveCount(2)
    await panneau.locator('.liens li').filter({ hasText: 'Entretien Karine' }).getByRole('button', { name: 'Délier', exact: true }).click()
    await panneau.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(panneau.locator('.liens li')).toHaveCount(1)
    await expect(panneau.locator('.repertoire').getByRole('button', { name: 'Karine', exact: true })).toBeVisible()
    const separateur = panneau.getByRole('separator')
    const avant = Number(await separateur.getAttribute('aria-valuenow'))
    await separateur.focus()
    await page.keyboard.press('ArrowRight')
    await expect(separateur).toHaveAttribute('aria-valuenow', String(avant + 20))
    await page.setViewportSize({ width: 650, height: 850 })
    await expect(panneau.locator('.deux-colonnes')).toHaveClass(/verticale/)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
