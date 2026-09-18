import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attendreCorpus, ecrireSeedDemo, entrerCorpus, entrerEntretien, lancer } from './util'

test('Journal du corpus : annuler un renommage et une association Personnes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-corpus-e2e-'))
  const autreCorpus = mkdtempSync(join(tmpdir(), 'sonal-journal-autre-corpus-e2e-'))
  ecrireSeedDemo(autreCorpus)
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const { id } = await api.creerEntretienVide('Deuxième entretien')
      const lecture = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = lecture.data
      payload.locuteurs = [{ id: 'loc-journal', index: 0, nom: 'Mme Dupont', valeursLoc: {}, personneRef: null }]
      await api.ecrireEntretien(id, payload)
    })

    const onglets = page.locator('.onglets-corpus')
    await onglets.getByRole('button', { name: 'Personnes', exact: true }).click()
    const personnes = page.locator('.personnes-corpus')
    await personnes.getByRole('button', { name: 'Karine', exact: true }).click()
    await personnes.getByLabel('Nouvelle personne').fill('Karine Dupont')
    await personnes.getByRole('button', { name: 'Créer', exact: true }).click()
    await personnes.getByLabel('Nom de référence').fill('K. Dupont')
    await personnes.getByLabel('Nom de référence').press('Enter')
    await expect(personnes.getByRole('heading', { name: 'Personne · K. Dupont' })).toBeVisible()

    await onglets.getByRole('button', { name: 'Journal', exact: true }).click()
    const journal = page.locator('.journal-corpus')
    await expect(journal).toBeVisible()
    await expect(page.locator('.cartes-ent')).toBeVisible()
    await expect(journal).toContainText('Personne renommée : Karine Dupont → K. Dupont')
    await journal.getByRole('button', { name: 'Annuler : Personne renommée' }).click()
    await expect(journal).toContainText('Aucune action enregistrée.')

    await onglets.getByRole('button', { name: 'Personnes', exact: true }).click()
    await expect(personnes.getByRole('heading', { name: 'Personne · Karine Dupont' })).toBeVisible()
    await personnes.getByRole('button', { name: 'Mme Dupont', exact: true }).click()
    const personneId = await page.evaluate(async () => (await (window as any).sonal.corpus.personnesInventaire()).personnes[0].id)
    await personnes.getByLabel('Associer à').selectOption(personneId)
    await personnes.getByRole('button', { name: 'Associer', exact: true }).click()
    await personnes.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(personnes).toHaveAttribute('aria-busy', 'false')

    await onglets.getByRole('button', { name: 'Journal', exact: true }).click()
    await expect(journal).toContainText('Locuteur associé à Karine Dupont')
    await journal.getByRole('button', { name: 'Annuler : Locuteur associé' }).click()
    await expect(journal).toContainText('Aucune action enregistrée.')

    await onglets.getByRole('button', { name: 'Personnes', exact: true }).click()
    await expect(personnes.getByRole('button', { name: 'Mme Dupont', exact: true })).toBeVisible()
    await personnes.locator('.repertoire').getByRole('button', { name: /Karine Dupont/ }).click()
    await personnes.getByLabel('Nom de référence').fill('Karine Journal')
    await personnes.getByLabel('Nom de référence').press('Enter')
    await page.evaluate(async (id) => {
      await (window as any).sonal.corpus.personnesCommander({ type: 'modifier', personneId: id, nom: 'Modification extérieure' })
    }, personneId)

    await onglets.getByRole('button', { name: 'Journal', exact: true }).click()
    await expect(journal).toContainText('La personne a été modifiée depuis cette action.')
    await expect(journal.getByRole('button', { name: 'Annuler : Personne renommée' })).toBeDisabled()
    await entrerEntretien(page)
    // Retour au corpus par le fil d'Ariane (la barre d'actions de l'entretien
    // n'a plus de bouton « ← Corpus »).
    await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
    await expect(journal).toBeVisible()
    await expect(journal).toContainText('La personne a été modifiée depuis cette action.')

    await app.evaluate(({ dialog }, dossier) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dossier] })
    }, autreCorpus)
    await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
    await page.locator('.carte-demo.ouvrir-corpus').click()
    await attendreCorpus(page)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Journal', exact: true }).click()
    await expect(page.locator('.journal-corpus')).toContainText('Aucune action enregistrée.')
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(autreCorpus, { recursive: true, force: true })
  }
})
