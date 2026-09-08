import { test, expect } from '@playwright/test'
import { entrerCorpus, entrerEntretien, ouvrir } from './util'

test('le nommage complète les métadonnées vides depuis une source explicite et conserve les valeurs locales', async () => {
  const { app, page } = await ouvrir('sonal-nommage-donnees-')
  try {
    const variables = await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const { id: age } = await api.ajouterVariable('Âge', 'locuteur')
      const { id: profession } = await api.ajouterVariable('Profession', 'locuteur')
      await api.modifierVariable(age, { modalites: [{ id: 'age30', lib: '30 ans' }, { id: 'age40', lib: '40 ans' }] })
      await api.modifierVariable(profession, { modalites: [{ id: 'locale', lib: 'Enseignante' }, { id: 'source', lib: 'Médecin' }] })
      const { data: cible } = await api.lireEntretien('e1')
      cible.locuteurs[0].pseudo = 'Pseudo local'
      cible.locuteurs[0].valeursLoc = { [profession]: 'locale' }
      await api.ecrireEntretien('e1', cible)
      let personneId: string | null = null
      for (const [titre, nom, valeur] of [['Source A', 'Marie Dupont', 'age30'], ['Source B', 'Mme Dupont', 'age40']]) {
        const { id } = await api.creerEntretienVide(titre)
        const { data } = await api.lireEntretien(id)
        data.locuteurs = [{ id: `loc-${id}`, index: 0, nom, pseudo: 'Alice', interviewer: true, valeursLoc: { [age]: valeur, [profession]: 'source' }, personneRef: null }]
        await api.ecrireEntretien(id, data)
        if (!personneId) personneId = await api.personnesCommander({ type: 'creer', entretienId: id, locuteurId: `loc-${id}`, nom })
        else await api.personnesCommander({ type: 'lier', entretienId: id, locuteurId: `loc-${id}`, personneId })
      }
      return { age, profession }
    })
    await page.reload()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await dialogue.getByRole('radio').check()
    await expect(dialogue.getByRole('button', { name: 'Confirmer', exact: true })).toBeDisabled()
    const source = dialogue.getByLabel('Choisir l’entretien source')
    await source.selectOption({ label: 'Source A · Marie Dupont' })
    await expect(dialogue.locator('section > ul')).toContainText('Âge : 30 ans')
    await expect(dialogue.locator('section > ul')).not.toContainText('Médecin')
    await expect(dialogue.locator('section > ul')).not.toContainText('Alice')
    await dialogue.locator('summary').click()
    await expect(dialogue.getByRole('checkbox', { name: /^Pseudonyme/ })).not.toBeChecked()
    await expect(dialogue.getByRole('checkbox', { name: /^Interviewer/ })).not.toBeChecked()
    await dialogue.getByRole('checkbox', { name: /^Âge/ }).uncheck()
    await source.selectOption({ label: 'Source B · Mme Dupont' })
    await expect(dialogue.getByRole('checkbox', { name: /^Âge/ })).toBeChecked()
    await expect(dialogue.locator('section > ul')).toContainText('Âge : 40 ans')
    await dialogue.locator('summary').click()
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    await page.locator('.barre .retour').click()
    const cible = await page.evaluate(async () => (await (window as any).sonal.corpus.personnesInventaire()).locuteurs.find((l: any) => l.entretienId === 'e1' && l.nom === 'Marie Dupont'))
    expect(cible.pseudo).toBe('Pseudo local')
    expect(cible.interviewer).toBe(false)
    expect(cible.valeursLoc).toEqual({ [variables.profession]: 'locale', [variables.age]: 'age40' })
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
    await page.locator('.barre .retour').click()
    const persiste = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(persiste.locuteurs.find((l: any) => l.locuteurId === cible.locuteurId).rapprochementsRefuses).toHaveLength(2)
  } finally { await app.close() }
})
