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
    const aVerifier = panneau.getByRole('region', { name: 'Suggestions à vérifier' })
    await expect(aVerifier.getByRole('button')).toHaveCount(1)
    await expect(aVerifier).toContainText('2 entretiens (Source A, Source B)')
    await aVerifier.getByRole('button', { name: /Cible/ }).click()
    const suggestions = panneau.getByRole('region', { name: 'Rapprochements proposés' })
    const accesEntretiens = suggestions.locator('.acces-entretiens')
    await expect(accesEntretiens.getByRole('button')).toHaveCount(3)
    await expect(accesEntretiens.getByRole('button', { name: 'Source A', exact: true })).toBeVisible()
    await expect(accesEntretiens.getByRole('button', { name: 'Source B', exact: true })).toBeVisible()
    await expect(accesEntretiens.getByRole('button', { name: 'Cible', exact: true })).toBeVisible()
    await expect(panneau.getByLabel('Associer à')).toHaveCount(0)
    await suggestions.getByRole('button', { name: 'Personne différente', exact: true }).click()
    await expect(panneau).toHaveAttribute('aria-busy', 'false')
    await expect(suggestions).toHaveCount(0)
    await expect(panneau.getByRole('button', { name: /Écartées 1/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(panneau.getByLabel('Associer à')).toBeVisible()
    await panneau.getByRole('region', { name: 'Locuteurs avec décisions écartées' }).getByRole('button', { name: 'Marie Dupont · Cible' }).click()
    await panneau.getByRole('button', { name: 'Annuler le refus', exact: true }).click()
    await expect(panneau).toHaveAttribute('aria-busy', 'false')
    await panneau.getByRole('button', { name: 'Toutes', exact: true }).click()
    await suggestions.getByRole('button', { name: 'C’est la même personne…', exact: true }).click()
    const dialogue = panneau.getByRole('dialog')
    await expect(dialogue.getByRole('button', { name: 'Annuler', exact: true })).toBeFocused()
    await expect(dialogue).toContainText('Les 3 entretiens seront réunis')
    await expect(dialogue.getByLabel('Nom de référence à conserver')).toHaveCount(0)
    await dialogue.getByRole('checkbox', { name: /Reprendre toutes les informations disponibles/ }).check()
    const sources = dialogue.getByRole('group', { name: 'Choisir l’entretien source' })
    await expect(sources.getByRole('radio', { name: /Source A.*Alice.*interviewer/ })).toBeVisible()
    await expect(sources.getByRole('radio', { name: /Source B.*Lou/ })).toBeVisible()
    await sources.getByRole('radio', { name: /Source B/ }).check()
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

test('Personnes : refuser une paire conserve les suggestions vers un troisième locuteur indépendant', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-rapprochements-trois-e2e-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      for (const titre of ['Entretien A', 'Entretien B', 'Entretien C']) {
        const { id } = await api.creerEntretienVide(titre)
        const { data } = await api.lireEntretien(id)
        const { formatVersion, lastModified, ...payload } = data
        payload.locuteurs = [{ id: `marie-${titre}`, index: 0, nom: 'Marie Dupont', valeursLoc: {}, personneRef: null }]
        await api.ecrireEntretien(id, payload)
      }
    })
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Personnes', exact: true }).click()
    const panneau = page.locator('.personnes-corpus')
    const aVerifier = panneau.getByRole('region', { name: 'Suggestions à vérifier' })
    await expect(aVerifier.getByRole('button')).toHaveCount(3)
    await aVerifier.getByRole('button').filter({ hasText: /Entretien A.*Entretien B/ }).click()
    const propositions = panneau.getByRole('region', { name: 'Rapprochements proposés' })
    await expect(propositions.locator('li')).toHaveCount(1)
    await expect(propositions).toContainText('Entretien B')
    await expect(propositions.locator('.acces-entretiens').getByRole('button')).toHaveCount(2)
    await propositions.getByRole('button', { name: 'C’est la même personne…', exact: true }).click()
    const dialogue = panneau.getByRole('dialog')
    await expect(dialogue.getByRole('checkbox', { name: /Reprendre toutes les informations disponibles/ })).toHaveCount(0)
    await dialogue.getByRole('button', { name: 'Annuler', exact: true }).click()
    await propositions.getByRole('button', { name: 'Personne différente', exact: true }).click()
    await expect(panneau).toHaveAttribute('aria-busy', 'false')
    await expect(panneau.getByRole('button', { name: /Écartées 1/ })).toHaveAttribute('aria-pressed', 'true')
    await panneau.getByRole('button', { name: 'Toutes', exact: true }).click()
    await expect(aVerifier.getByRole('button')).toHaveCount(2)
    await expect(propositions.locator('li')).toHaveCount(1)
    await expect(propositions).toContainText('Entretien C')
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
