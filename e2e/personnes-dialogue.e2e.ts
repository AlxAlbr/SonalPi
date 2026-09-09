import { test, expect } from '@playwright/test'
import { ouvrir } from './util'

test('un nom proche est proposé avec une raison distincte', async () => {
  const { app, page } = await ouvrir('sonal-personnes-proche-')
  try {
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const { id } = await api.creerEntretienVide('Source Maria')
      const { data } = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = data
      payload.locuteurs = [{ id: 'maria-source', index: 0, nom: 'Maria Dupont', interviewer: false, valeursLoc: {}, personneRef: null }]
      await api.ecrireEntretien(id, payload)
    })
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await expect(dialogue).toContainText('Une ou plusieurs graphies proches ont été trouvées.')
    await expect(dialogue.getByRole('radio')).toHaveAccessibleName(/Maria Dupont.*une lettre différente/)
    await dialogue.getByRole('button', { name: 'Plus tard' }).click()
    await expect(dialogue).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('une référence de Personne absente est diagnostiquée dans l’éditeur', async () => {
  const { app, page } = await ouvrir('sonal-personnes-reference-absente-')
  try {
    await page.locator('.barre .retour').click()
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const corpus = await api.ouvrir()
      const id = Object.keys(corpus.membership)[0]
      const { data } = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = data
      payload.locuteurs[0].personneRef = 'pers-absente'
      await api.ecrireEntretien(id, payload)
    })
    const carte = page.locator('.carte-ent', { hasText: 'Entretien Karine' })
    await carte.getByRole('button').click()
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    await expect(page.getByText(/Référence de personne absente.*pers-absente/)).toBeVisible()
    await expect(page.getByText(/Corrigez cette association dans Personnes/)).toBeVisible()
  } finally {
    await app.close()
  }
})

test('deux renommages immédiats ne créent que la Personne du nom final', async () => {
  const { app, page } = await ouvrir('sonal-personnes-renommage-rapide-')
  try {
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    const nom = page.locator('.nom-loc').first()
    await nom.evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = 'Marie Rapide'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.value = 'Paul Final'
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.getByRole('status')).toContainText('Personne « Paul Final » créée')
    await page.locator('.barre .retour').click()
    const vue = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(vue.personnes.map((personne: any) => personne.nom)).toEqual(['Paul Final'])
    expect(vue.locuteurs.find((locuteur: any) => locuteur.nom === 'Paul Final')?.personneRef)
      .toBe(vue.personnes[0].id)
  } finally {
    await app.close()
  }
})

test('le nommage propose une identité et lie sans écraser la session', async () => {
  const { app, page } = await ouvrir('sonal-personnes-dialogue-')
  try {
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const { id } = await api.creerEntretienVide('Source Marie')
      const { data } = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = data
      payload.locuteurs = [{ id: 'marie-source', index: 0, nom: 'Marie Dupont', pseudo: 'Alice', interviewer: true, valeursLoc: {}, personneRef: null }]
      await api.ecrireEntretien(id, payload)
    })
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await expect(dialogue).toBeVisible()
    await expect(dialogue.getByRole('button', { name: 'Plus tard' })).toBeFocused()
    await expect(dialogue.getByRole('radio')).not.toBeChecked()
    await dialogue.getByRole('radio').check()
    await expect(dialogue).toContainText('Une personne porte déjà ce nom.')
    await expect(dialogue.getByRole('region', { name: 'Données proposées pour ce locuteur' })).toContainText('Pseudonyme : Alice')
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    await nom.fill('Mme Dupont')
    await nom.press('Tab')
    await page.locator('.barre .retour').click()
    const vue = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    const source = vue.locuteurs.find((l: any) => l.locuteurId === 'marie-source')
    const cible = vue.locuteurs.find((l: any) => l.nom === 'Mme Dupont')
    expect(cible.personneRef).toBeTruthy()
    expect(cible.personneRef).toBe(source.personneRef)
    expect(cible.pseudo).toBe('Alice')
    expect(cible.pseudoEtat).toBe('confirme')
    expect(cible.interviewer).toBe(false)
    expect(vue.personnes).toHaveLength(1)
  } finally { await app.close() }
})
