import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer } from './util'

test('séparer une personne laisse au moins un locuteur sur la fiche d’origine', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-personnes-separation-e2e-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const inventaire = await api.personnesInventaire()
      const karine = inventaire.locuteurs.find((locuteur: any) => locuteur.nom === 'Karine')
      const personneId = await api.personnesCommander({
        type: 'creer',
        entretienId: karine.entretienId,
        locuteurId: karine.locuteurId,
        nom: 'Karine Dupont',
      })
      for (const [titre, id, nom] of [
        ['Entretien B', 'loc-b', 'Mme Dupont'],
        ['Entretien C', 'loc-c', 'K. Dupont'],
      ]) {
        const creation = await api.creerEntretienVide(titre)
        const lecture = await api.lireEntretien(creation.id)
        const { formatVersion, lastModified, ...payload } = lecture.data
        payload.locuteurs = [{ id, index: 0, nom, valeursLoc: {}, personneRef: null }]
        await api.ecrireEntretien(creation.id, payload)
        await api.personnesCommander({ type: 'lier', entretienId: creation.id, locuteurId: id, personneId })
      }
    })

    await page.locator('.onglets-corpus').getByRole('button', { name: 'Personnes', exact: true }).click()
    const panneau = page.locator('.personnes-corpus')
    await panneau.locator('.repertoire').getByRole('button', { name: /Karine Dupont/ }).click()
    await expect(panneau.locator('.liens li')).toHaveCount(3)
    await panneau.locator('summary').filter({ hasText: 'Séparer…' }).click()
    const formulaire = panneau.locator('.separer-personne form')
    await formulaire.getByRole('checkbox', { name: 'Entretien Karine · Karine' }).check()
    await formulaire.getByRole('checkbox', { name: 'Entretien B · Mme Dupont' }).check()
    await formulaire.getByRole('checkbox', { name: 'Entretien C · K. Dupont' }).check()
    await formulaire.getByLabel('Nom de la nouvelle personne').fill('Deuxième identité')
    await expect(formulaire).toContainText('Laissez au moins un locuteur')
    await expect(formulaire.getByRole('button', { name: 'Continuer…' })).toBeDisabled()

    await formulaire.getByRole('checkbox', { name: 'Entretien Karine · Karine' }).uncheck()
    const continuer = formulaire.getByRole('button', { name: 'Continuer…' })
    await continuer.click()
    const dialogue = panneau.getByRole('dialog', { name: 'Séparer cette personne' })
    await expect(dialogue).toContainText('avec 2 locuteurs')
    await expect(dialogue).toContainText('conservera 1 locuteur')
    await dialogue.getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(continuer).toBeFocused()
    await continuer.click()
    await dialogue.getByRole('button', { name: 'Séparer', exact: true }).click()

    await expect(panneau).toHaveAttribute('aria-busy', 'false')
    await expect(panneau.getByRole('heading', { name: 'Personne · Deuxième identité' })).toBeVisible()
    await expect(panneau.locator('.liens li')).toHaveCount(2)
    await panneau.locator('.repertoire').getByRole('button', { name: /Karine Dupont/ }).click()
    await expect(panneau.locator('.liens li')).toHaveCount(1)
    const inventaire = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(inventaire.locuteurs.map((locuteur: any) => locuteur.nom)).toEqual(expect.arrayContaining(['Karine', 'Mme Dupont', 'K. Dupont']))

    await panneau.getByRole('button', { name: 'Annuler une modification…' }).click()
    await expect(page.locator('.journal-corpus')).toContainText('Aucune action enregistrée.')
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
