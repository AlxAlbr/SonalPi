import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer } from './util'

test('Personnes : refus révocable et reprise depuis une source choisie', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-rapprochements-e2e-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const ids: string[] = []
      for (const [titre, nom, pseudo, interviewer] of [
        ['Source A', 'Marie Dupont', 'Alice', true],
        ['Source B', 'Mme Dupont', 'Lou', false],
        ['Cible', 'Marie Dupont', '', false],
      ]) {
        const { id } = await api.creerEntretienVide(titre)
        ids.push(id)
        const { data } = await api.lireEntretien(id)
        const { formatVersion, lastModified, ...payload } = data
        payload.locuteurs = [{ id: `loc-${id}`, index: 0, nom, pseudo, interviewer, valeursLoc: {}, personneRef: null }]
        await api.ecrireEntretien(id, payload)
      }
      const personneId = await api.personnesCommander({ type: 'creer', entretienId: ids[0], locuteurId: `loc-${ids[0]}`, nom: 'Marie Dupont' })
      await api.personnesCommander({ type: 'lier', entretienId: ids[1], locuteurId: `loc-${ids[1]}`, personneId })
    })
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Personnes', exact: true }).click()
    const panneau = page.locator('.personnes-corpus')
    await panneau.getByRole('region', { name: 'Suggestions à vérifier' }).getByRole('button', { name: 'Marie Dupont · Cible', exact: true }).click()
    const suggestions = panneau.getByRole('region', { name: 'Rapprochements proposés' })
    await suggestions.getByRole('button', { name: 'Personne différente', exact: true }).click()
    await expect(panneau).toHaveAttribute('aria-busy', 'false')
    await expect(suggestions).toHaveCount(0)
    await panneau.getByRole('button', { name: /Décisions écartées 1/ }).click()
    await panneau.getByRole('region', { name: 'Locuteurs avec décisions écartées' }).getByRole('button', { name: 'Marie Dupont · Cible' }).click()
    await panneau.getByRole('button', { name: 'Annuler le refus', exact: true }).click()
    await expect(panneau).toHaveAttribute('aria-busy', 'false')
    await suggestions.getByRole('button', { name: 'C’est la même personne…', exact: true }).click()
    const dialogue = panneau.getByRole('dialog')
    await expect(dialogue.getByRole('button', { name: 'Annuler', exact: true })).toBeFocused()
    await expect(dialogue).toContainText('Les 3 entretiens seront réunis')
    await dialogue.locator('summary').click()
    const pseudo = panneau.getByRole('checkbox', { name: /Utiliser le même pseudonyme/ })
    const role = panneau.getByRole('checkbox', { name: /Interv\./ })
    await expect(pseudo).not.toBeChecked()
    await expect(role).not.toBeChecked()
    await pseudo.check()
    const select = panneau.getByLabel('Entretien source des données')
    await select.selectOption({ label: 'Source B · Mme Dupont' })
    await expect(pseudo).not.toBeChecked()
    await expect(dialogue).toContainText('Lou')
    await pseudo.check()
    await dialogue.getByRole('button', { name: 'Réunir', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    await expect(panneau).toHaveAttribute('aria-busy', 'false')
    await expect(panneau.getByRole('alert')).toHaveCount(0)
    const resultat = await page.evaluate(async () => {
      const vue = await (window as any).sonal.corpus.personnesInventaire()
      return { cible: vue.locuteurs.find((l: any) => l.entretienTitre === 'Cible'), personnes: vue.personnes }
    })
    expect(resultat.cible).toMatchObject({ nom: 'Marie Dupont', pseudo: 'Lou', pseudoEtat: 'confirme', interviewer: false })
    expect(resultat.cible.personneRef).toBeTruthy()
    expect(resultat.personnes).toHaveLength(1)
    await expect(panneau.locator('.liens li')).toHaveCount(3)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
