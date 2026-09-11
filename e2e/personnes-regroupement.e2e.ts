import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer } from './util'

test('réunir deux personnes : aperçu, annulation et nom choisi', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-regroupement-e2e-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const ids = await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const personnes: string[] = []
      for (const [titre, nom, pseudo] of [
        ['Entretien A', 'Marie Dupont', 'Alice'],
        ['Entretien B', 'Mme Dupont', 'Lou'],
      ]) {
        const { id } = await api.creerEntretienVide(titre)
        const { data } = await api.lireEntretien(id)
        const { formatVersion, lastModified, ...payload } = data
        payload.locuteurs = [{ id: `loc-${id}`, index: 0, nom, pseudo, interviewer: false, valeursLoc: {}, personneRef: null }]
        await api.ecrireEntretien(id, payload)
        const personneId = await api.personnesCommander({ type: 'creer', entretienId: id, locuteurId: `loc-${id}`, nom })
        personnes.push(personneId)
      }
      return personnes
    })
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Personnes', exact: true }).click()
    const panneau = page.locator('.personnes-corpus')
    await panneau.locator('.repertoire').getByRole('button', { name: /Marie Dupont/ }).click()
    await panneau.locator('summary').filter({ hasText: 'Réunir…' }).click()
    await panneau.getByLabel('Avec').selectOption(ids[1])
    const ouvrir = panneau.getByRole('button', { name: 'Continuer…', exact: true })
    await ouvrir.click()
    const dialogue = panneau.getByRole('dialog')
    await expect(dialogue).toContainText('Les 2 entretiens seront réunis')
    await expect(dialogue.getByRole('button', { name: 'Annuler', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialogue).toHaveCount(0)
    await expect(ouvrir).toBeFocused()
    expect(await page.evaluate(async () => (await (window as any).sonal.corpus.personnesInventaire()).personnes.length)).toBe(2)
    await ouvrir.click()
    await page.evaluate(async (personneId) => {
      await (window as any).sonal.corpus.personnesCommander({ type: 'modifier', personneId, nom: 'Marie D.' })
    }, ids[0])
    await dialogue.getByRole('button', { name: 'Réunir', exact: true }).click()
    await expect(panneau.getByRole('alert')).toContainText('ont changé')
    expect(await page.evaluate(async () => (await (window as any).sonal.corpus.personnesInventaire()).personnes.length)).toBe(2)
    await panneau.getByLabel('Avec').selectOption(ids[1])
    await ouvrir.click()
    await dialogue.getByLabel('Nom de référence à conserver').selectOption(ids[0])
    await expect(dialogue.getByRole('checkbox', { name: /Reprendre toutes les informations disponibles/ })).not.toBeChecked()
    await dialogue.getByRole('button', { name: 'Réunir', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    await expect(panneau.getByRole('heading', { name: 'Personne · Marie D.', exact: true })).toBeVisible()
    await expect(panneau.locator('.liens li')).toHaveCount(2)
    const apres = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(apres.personnes).toHaveLength(1)
    expect(apres.locuteurs.find((l: any) => l.entretienTitre === 'Entretien A')).toMatchObject({ nom: 'Marie Dupont', pseudo: 'Alice', personneRef: ids[0] })
    expect(apres.locuteurs.find((l: any) => l.entretienTitre === 'Entretien B')).toMatchObject({ nom: 'Mme Dupont', pseudo: 'Lou', personneRef: ids[0] })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
