import { test, expect } from '@playwright/test'
import { ouvrir } from './util'

/**
 * Conflits survenus pendant que le dialogue de nommage est ouvert :
 * une autre source modifie les données ou le lien d'un candidat avant la
 * confirmation. La décision doit être refusée explicitement, sans liaison
 * ni reprise ni refus silencieux.
 */
test('des données source modifiées pendant le dialogue bloquent la reprise sans lier', async () => {
  const { app, page } = await ouvrir('sonal-conflit-source-donnees-')
  try {
    const sourceId = await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const { id } = await api.creerEntretienVide('Source Marie')
      const { data } = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = data
      payload.locuteurs = [{ id: 'marie-source', index: 0, nom: 'Marie Dupont', pseudo: 'Alice', interviewer: true, valeursLoc: {}, personneRef: null }]
      await api.ecrireEntretien(id, payload)
      return id
    })
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await expect(dialogue).toBeVisible()
    await dialogue.getByRole('radio').check()
    await expect(dialogue.locator('section > ul')).toContainText('Pseudonyme : Alice')
    // Changement en coulisse pendant que le dialogue est ouvert : le pseudo de la source change.
    await page.evaluate(async (id) => {
      const api = (window as any).sonal.corpus
      const { data } = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = data
      payload.locuteurs[0].pseudo = 'Alice modifiée'
      await api.ecrireEntretien(id, payload)
    }, sourceId)
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue.getByRole('alert')).toContainText('Les données source ont changé')
    const vue = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    const cible = vue.locuteurs.find((l: any) => l.nom === 'Marie Dupont' && l.entretienId === 'e1')
    expect(cible).toBeDefined()
    expect(cible.personneRef).toBeNull()
    expect(cible.pseudo).toBeFalsy()
    const source = vue.locuteurs.find((l: any) => l.locuteurId === 'marie-source')
    expect(source.personneRef).toBeNull()
    expect(source.pseudo).toBe('Alice modifiée')
  } finally { await app.close() }
})

test('une source liée pendant le dialogue bloque une association devenue périmée', async () => {
  const { app, page } = await ouvrir('sonal-conflit-source-liee-')
  try {
    const sourceId = await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const { id } = await api.creerEntretienVide('Source Marie')
      const { data } = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = data
      payload.locuteurs = [{ id: 'marie-source', index: 0, nom: 'Marie Dupont', valeursLoc: {}, personneRef: null }]
      await api.ecrireEntretien(id, payload)
      return id
    })
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await expect(dialogue).toBeVisible()
    await dialogue.getByRole('radio').check()
    // Changement en coulisse : la source est rattachée à une Personne pendant le dialogue.
    await page.evaluate(async (id) => {
      const api = (window as any).sonal.corpus
      await api.personnesCommander({ type: 'creer', entretienId: id, locuteurId: 'marie-source', nom: 'Marie Dupont' })
    }, sourceId)
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue.getByRole('alert')).toContainText('La personne sélectionnée a changé')
    const vue = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    const cible = vue.locuteurs.find((l: any) => l.nom === 'Marie Dupont' && l.entretienId === 'e1')
    expect(cible).toBeDefined()
    expect(cible.personneRef).toBeNull()
  } finally { await app.close() }
})

test('des propositions modifiées pendant le dialogue empêchent un refus en masse', async () => {
  const { app, page } = await ouvrir('sonal-conflit-propositions-')
  try {
    const ids = await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const sortie: string[] = []
      for (const titre of ['Homonyme A', 'Homonyme B']) {
        const { id } = await api.creerEntretienVide(titre)
        const { data } = await api.lireEntretien(id)
        const { formatVersion, lastModified, ...payload } = data
        payload.locuteurs = [{ id: `loc-${id}`, index: 0, nom: 'Marie Dupont', valeursLoc: {}, personneRef: null }]
        await api.ecrireEntretien(id, payload)
        sortie.push(id)
      }
      return sortie
    })
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await expect(dialogue).toContainText('Des personnes portent déjà ce nom.')
    await expect(dialogue.getByRole('radio')).toHaveCount(2)
    // Changement en coulisse : le premier candidat est rattaché à une Personne pendant le dialogue.
    await page.evaluate(async (id) => {
      const api = (window as any).sonal.corpus
      await api.personnesCommander({ type: 'creer', entretienId: id, locuteurId: `loc-${id}`, nom: 'Marie Dupont' })
    }, ids[0])
    await dialogue.getByRole('button', { name: 'Aucune de ces personnes', exact: true }).click()
    await expect(dialogue.getByRole('alert')).toContainText('Les propositions ont changé')
    const vue = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    const cible = vue.locuteurs.find((l: any) => l.nom === 'Marie Dupont' && l.entretienId === 'e1')
    expect(cible).toBeDefined()
    expect(cible.personneRef).toBeNull()
    expect(cible.rapprochementsRefuses ?? []).toHaveLength(0)
  } finally { await app.close() }
})
