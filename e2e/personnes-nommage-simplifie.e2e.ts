import { test, expect } from '@playwright/test'
import { entrerCorpus, entrerEntretien, ouvrir } from './util'

test('le nommage affiche les informations divergentes et reprend la source choisie', async () => {
  const { app, page } = await ouvrir('sonal-nommage-donnees-')
  try {
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      let personneId: string | null = null
      for (const [titre, pseudo, interviewer] of [
        ['Source A', 'Alice', true],
        ['Source B', 'Lou', false],
      ] as const) {
        const { id } = await api.creerEntretienVide(titre)
        const { data } = await api.lireEntretien(id)
        data.locuteurs = [{ id: `loc-${id}`, index: 0, nom: 'Marie Dupont', pseudo, interviewer, valeursLoc: {}, personneRef: null }]
        await api.ecrireEntretien(id, data)
        if (!personneId) personneId = await api.personnesCommander({ type: 'creer', entretienId: id, locuteurId: `loc-${id}`, nom: 'Marie Dupont' })
        else await api.personnesCommander({ type: 'lier', entretienId: id, locuteurId: `loc-${id}`, personneId })
      }
    })
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await dialogue.locator('.proposition-personne').getByRole('radio').check()
    const sources = dialogue.getByRole('group', { name: 'Les informations diffèrent selon l’entretien. Choisissez celles à reprendre.' })
    await expect(sources.getByRole('radio', { name: /Source A.*Alice.*interviewer/ })).toBeVisible()
    await expect(sources.getByRole('radio', { name: /Source B.*Lou.*interviewé·e/ })).toBeVisible()
    await expect(dialogue.getByRole('button', { name: 'Confirmer', exact: true })).toBeDisabled()
    await sources.getByRole('radio', { name: /Source A/ }).check()
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    // Retour au corpus par le fil d'Ariane (pas de bouton « ← Corpus » dans la barre).
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
    const vue = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    const cible = vue.locuteurs.find((l: any) => l.entretienId === 'e1' && l.nom === 'Marie Dupont')
    expect(cible.pseudo).toBe('Alice')
    expect(cible.pseudoEtat).toBe('confirme')
    expect(cible.interviewer).toBe(true)
  } finally { await app.close() }
})

test('Aucune de ces personnes écarte toutes les propositions sans sélection préalable', async () => {
  const { app, page } = await ouvrir('sonal-nommage-refus-tous-')
  try {
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      for (const titre of ['Homonyme A', 'Homonyme B']) {
        const { id } = await api.creerEntretienVide(titre)
        const { data } = await api.lireEntretien(id)
        data.locuteurs = [{ id: `loc-${id}`, index: 0, nom: 'Marie Dupont', valeursLoc: {}, personneRef: null }]
        await api.ecrireEntretien(id, data)
      }
    })
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await expect(dialogue).toContainText('Des personnes portent déjà ce nom.')
    await expect(dialogue.getByRole('radio')).toHaveCount(2)
    await expect(dialogue.getByRole('button', { name: 'Confirmer', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    const avant = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(avant.personnes).toHaveLength(0)
    await nom.fill('MARIE DUPONT')
    await nom.press('Tab')
    await dialogue.getByRole('button', { name: 'Aucune de ces personnes', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    const apres = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    const cible = apres.locuteurs.find((l: any) => l.nom === 'MARIE DUPONT')
    expect(cible.rapprochementsRefuses).toHaveLength(2)
    expect(apres.personnes).toHaveLength(1)
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    await expect(dialogue).toHaveCount(0)
    // Retour au corpus par le fil d'Ariane (pas de bouton « ← Corpus » dans la barre).
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
    const persiste = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(persiste.locuteurs.find((l: any) => l.locuteurId === cible.locuteurId).rapprochementsRefuses).toHaveLength(2)
  } finally { await app.close() }
})
