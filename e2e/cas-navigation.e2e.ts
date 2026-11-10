import { expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attendreCorpus, ecrireSeedDemo, fermerAiguillage, ouvrirOrganisation, ouvrirSurCorpus } from './util'

test('Cas occupe l’organisation, conserve ses filtres et relit une source modifiée', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-cas-navigation-')
  try {
    const onglets = page.locator('.onglets-corpus')
    await expect(page.locator('.barre-outils button')).toHaveCount(4)
    await expect(onglets.getByRole('button', { name: /^(Cas|Recueils|Journal)$/ })).toHaveCount(0)
    await expect(page.locator('.accueil-corpus')).toContainText('Retrouvez les fonctionnalités Cas et Recueils dans l’espace Organiser et exporter.')
    await page.getByRole('button', { name: 'Ouvrir les cas', exact: true }).click()
    const cas = page.locator('#contenu-cas-organisation')
    await expect(cas).toBeVisible()
    const navigation = page.locator('.onglets-organisation')
    await expect(navigation.getByRole('button', { name: 'Cas', exact: true }).locator('img')).toHaveJSProperty('naturalWidth', 32)
    await expect(navigation.getByRole('button', { name: 'Recueils', exact: true }).locator('img')).toHaveJSProperty('complete', true)
    await expect(page.locator('.cartes-ent')).toBeHidden()
    await expect(page.locator('.modale-cas')).toBeHidden()
    await cas.getByRole('button', { name: 'Nouveau cas' }).click()
    await cas.getByRole('radio', { name: 'Depuis des entretiens' }).check()
    await cas.getByRole('button', { name: 'Tout sélectionner', exact: true }).click()
    await cas.getByRole('button', { name: 'Prévisualiser les cas' }).click()
    await cas.getByRole('button', { name: 'Créer les cas' }).click()
    await cas.locator('.carte-cas').first().click()
    const nom = await cas.getByLabel('Nom du cas', { exact: true }).inputValue()
    await cas.getByLabel('Rechercher un cas').fill(nom)
    await cas.getByLabel('Mode du texte des cas').selectOption('original')

    await ouvrirOrganisation(page, 'recueils')
    await ouvrirOrganisation(page, 'cas')
    await page.getByRole('button', { name: 'Analyser & Interpréter', exact: true }).click()
    await ouvrirOrganisation(page)
    await expect(cas.getByLabel('Rechercher un cas')).toHaveValue(nom)
    await expect(cas.getByLabel('Mode du texte des cas')).toHaveValue('original')
    await expect(cas.getByLabel('Nom du cas', { exact: true })).toHaveValue(nom)
    await expect(page.locator('.cas-corpus')).toHaveCount(1)

    await cas.getByRole('button', { name: 'Voir dans l’entretien' }).first().click()
    await expect(page.locator('.editeur')).toBeVisible()
    await page.locator('.editeur').press('Control+End')
    await page.keyboard.insertText(' passage ajouté pour les cas ')
    await expect(page.locator('h1 .etat')).toHaveText('à jour')
    const editeur = await page.locator('.editeur').elementHandle()
    await ouvrirOrganisation(page)
    await expect(cas.getByLabel('Nom du cas', { exact: true })).toHaveValue(nom)
    await expect(cas.getByLabel('Rechercher un cas')).toHaveValue(nom)
    await expect(cas.locator('.passage-cas blockquote')).toContainText('passage ajouté pour les cas')
    await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()
    await expect(page.locator('.editeur')).toBeVisible()
    expect(await page.locator('.editeur').evaluate((el, ancien) => el === ancien, editeur)).toBe(true)
    await expect(page.locator('.editeur')).toContainText('passage ajouté pour les cas')
    await ouvrirOrganisation(page)

    await page.setViewportSize({ width: 760, height: 700 })
    await expect(cas.getByLabel('Rechercher un cas')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Organiser & Exporter', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  } finally {
    await app.close()
  }
})

test('un changement de corpus efface la recherche et le formulaire Cas', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-cas-navigation-reset-')
  const autre = mkdtempSync(join(tmpdir(), 'sonal-cas-autre-'))
  ecrireSeedDemo(autre)
  try {
    await ouvrirOrganisation(page)
    const cas = page.locator('#contenu-cas-organisation')
    await cas.getByLabel('Rechercher un cas').fill('Ancienne recherche')
    await cas.getByRole('button', { name: 'Nouveau cas' }).click()
    await cas.getByRole('radio', { name: 'Cas manuel vide' }).check()
    await cas.getByLabel('Nom du cas *').fill('Ancien brouillon')
    await app.evaluate(({ dialog }, dossier) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dossier] })
    }, autre)
    await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
    await page.locator('.carte-demo.ouvrir-corpus').click()
    await fermerAiguillage(page, 'entretiens', 10_000)
    await attendreCorpus(page)
    await expect(page.locator('.onglets-corpus button.actif')).toHaveAttribute('aria-label', 'Accueil')
    await ouvrirOrganisation(page)
    await expect(cas.getByLabel('Rechercher un cas')).toHaveValue('')
    await expect(cas.locator('.creation-cas')).toHaveCount(0)
    await expect(cas.locator('.carte-cas')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(autre, { recursive: true, force: true })
  }
})
