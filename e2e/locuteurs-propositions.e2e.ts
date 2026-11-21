import { test, expect } from '@playwright/test'
import { creerLocuteurFixture } from '../test/fixtures/identitesLocuteurs'
import { ouvrir } from './util'

test('un nom proche est proposé avec une raison distincte', async () => {
  const { app, page } = await ouvrir('sonal-personnes-proche-')
  try {
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const { id } = await api.creerEntretienVide('Source Maria')
      const { data } = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = data
      payload.participations = [{ id: 'maria-source', index: 0, nom: 'Maria Dupont', interviewer: false, valeursLoc: {}, locuteurRef: null }]
      await api.ecrireEntretien(id, payload)
    })
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
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

test('une identité déjà rapprochée est présentée sur une seule ligne avec ses entretiens', async () => {
  const { app, page } = await ouvrir('sonal-personnes-identite-groupee-')
  try {
    const ids = await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const ids: string[] = []
      for (const titre of ['Source A', 'Source B']) {
        const { id } = await api.creerEntretienVide(titre)
        ids.push(id)
        const { data } = await api.lireEntretien(id)
        const { formatVersion, lastModified, ...payload } = data
        payload.participations = [{ id: `marie-${id}`, index: 0, nom: 'Marie Dupont', valeursLoc: {}, locuteurRef: null }]
        await api.ecrireEntretien(id, payload)
      }
      return ids
    })
    creerLocuteurFixture((await page.evaluate(() => window.sonal.corpus.dossierCourant())).dir, 'Marie Dupont', ids.map((id) => ({ entretienId: id, participationId: `marie-${id}` })))
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    const propositions = dialogue.locator('.proposition-personne')
    await expect(propositions).toHaveCount(1)
    await expect(propositions).toContainText('Identité déjà reliée à 2 entretiens : Source A, Source B.')
    await propositions.getByRole('radio').check()
    await expect(dialogue).toContainText('Les informations disponibles sont identiques dans ces entretiens : pseudonyme « non renseigné » et statut interviewé·e.')
    await expect(dialogue.getByRole('group', { name: /Les informations diffèrent/ })).toHaveCount(0)
    await expect(dialogue.getByRole('button', { name: 'Confirmer', exact: true })).toBeEnabled()
    await dialogue.getByRole('button', { name: 'Plus tard' }).click()
  } finally {
    await app.close()
  }
})

test('une référence de locuteur absente est diagnostiquée dans l’éditeur', async () => {
  const { app, page } = await ouvrir('sonal-personnes-reference-absente-')
  try {
    // Retour au corpus par le fil d'Ariane (pas de bouton « ← Corpus » dans la barre).
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const corpus = await api.ouvrir()
      const id = Object.keys(corpus.membership)[0]
      const { data } = await api.ouvrirEntretienPourEdition(id)
      const { formatVersion, lastModified, ...payload } = data
      payload.participations[0].locuteurRef = 'pers-absente'
      await api.ecrireEntretien(id, payload)
      await api.fermerEntretien(id)
    })
    const carte = page.locator('.carte-ent', { hasText: 'Entretien Karine' })
    await carte.locator('.crayon').click()
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    await expect(page.getByText(/Référence de personne absente.*pers-absente/)).toBeVisible()
    await expect(page.getByText(/Corrigez cette association dans Personnes/)).toBeVisible()
  } finally {
    await app.close()
  }
})

test('deux renommages immédiats ne créent que le locuteur du nom final', async () => {
  const { app, page } = await ouvrir('sonal-personnes-renommage-rapide-')
  try {
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    const nom = page.locator('.nom-loc').first()
    await nom.evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = 'Marie Rapide'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.value = 'Paul Final'
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.getByRole('status').filter({ hasText: 'Locuteur « Paul Final » créé' })).toBeVisible()
    await page.getByRole('button', { name: 'Fermer la gestion des locuteurs' }).click()
    // Retour au corpus par le fil d'Ariane (pas de bouton « ← Corpus » dans la barre).
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
    const vue = await page.evaluate(async () => (window as any).sonal.corpus.inventaireIdentitesLocuteurs())
    expect(vue.locuteurs.map((personne: any) => personne.nom)).toEqual(['Paul Final'])
    expect(vue.participations.find((locuteur: any) => locuteur.nom === 'Paul Final')?.locuteurRef)
      .toBe(vue.locuteurs[0].id)
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
      payload.participations = [{ id: 'marie-source', index: 0, nom: 'Marie Dupont', pseudo: 'Alice', interviewer: true, valeursLoc: {}, locuteurRef: null }]
      await api.ecrireEntretien(id, payload)
    })
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await expect(dialogue).toBeVisible()
    await expect(dialogue.getByRole('button', { name: 'Plus tard' })).toBeFocused()
    await expect(dialogue.getByRole('radio')).not.toBeChecked()
    await dialogue.getByRole('radio').check()
    await expect(dialogue).toContainText('Une personne porte déjà ce nom.')
    await expect(dialogue.getByRole('checkbox', { name: /Reprendre les informations disponibles/ })).toBeChecked()
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    await nom.fill('Mme Dupont')
    await nom.press('Enter')
    const renommage = page.getByRole('dialog', { name: 'Renommer ce locuteur dans les entretiens', exact: true })
    await renommage.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true }).click()
    await expect(renommage).toHaveCount(0)
    await page.getByRole('button', { name: 'Fermer la gestion des locuteurs' }).click()
    // Retour au corpus par le fil d'Ariane (pas de bouton « ← Corpus » dans la barre).
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
    const vue = await page.evaluate(async () => (window as any).sonal.corpus.inventaireIdentitesLocuteurs())
    const source = vue.participations.find((l: any) => l.participationId === 'marie-source')
    const cible = vue.participations.find((l: any) => l.entretienId === 'e1' && l.nom === 'Mme Dupont')
    expect(source.nom).toBe('Mme Dupont')
    expect(cible.locuteurRef).toBeTruthy()
    expect(cible.locuteurRef).toBe(source.locuteurRef)
    expect(cible.pseudo).toBe('Alice')
    expect(cible.pseudoEtat).toBe('confirme')
    expect(cible.interviewer).toBe(true)
    expect(vue.locuteurs).toHaveLength(1)
  } finally { await app.close() }
})
