import { test, expect, type Page } from '@playwright/test'
import { ouvrir } from './util'

async function nommer(page: Page) {
  await page.locator('.onglets button[data-onglet="locuteurs"]').click()
  await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
  await page.locator('.nom-loc').first().fill('Marie Dupont'); await page.locator('.nom-loc').first().press('Enter')
  const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?', exact: true })
  await expect(dialogue).toBeVisible()
  const avant = await page.evaluate(() => window.sonal.corpus.personnesInventaire())
  const cible = avant.participations.find((p) => p.entretienId === 'e1' && p.nom === 'Marie Dupont')!
  expect(cible.locuteurRef).toBeTruthy()
  return { dialogue, cible }
}
async function sources(page: Page, nombre = 1) {
  return page.evaluate(async (nombre) => {
    const api = window.sonal.corpus, ids: string[] = []
    for (let i = 0; i < nombre; i++) {
      const { id } = await api.creerEntretienVide(`Source ${i}`), r = await api.lireEntretien(id)
      if (!r.ok) throw new Error('Source absente')
      const { formatVersion: _v, lastModified: _d, ...payload } = r.data
      payload.participations = [{ id: 'local', index: 0, nom: 'Marie Dupont', pseudo: 'Alice', interviewer: true, valeursLoc: {}, locuteurRef: null }]
      await api.ecrireEntretien(id, payload); ids.push(id)
    }
    return ids
  }, nombre)
}

test('des données source modifiées bloquent la reprise et gardent l’identité distincte créée au nommage', async () => {
  const { app, page } = await ouvrir('sonal-conflit-source-donnees-')
  try {
    const [id] = await sources(page), { dialogue, cible } = await nommer(page)
    await dialogue.getByRole('radio').check()
    await expect(dialogue.getByRole('checkbox', { name: /Reprendre les informations disponibles/ })).toBeChecked()
    await page.evaluate(async (id) => {
      const api = window.sonal.corpus, r = await api.lireEntretien(id)
      if (!r.ok) throw new Error('Source absente')
      const { formatVersion: _v, lastModified: _d, ...payload } = r.data
      payload.participations[0].pseudo = 'Alice modifiée'; await api.ecrireEntretien(id, payload)
    }, id)
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue.getByRole('alert')).toContainText('ont changé')
    const vue = await page.evaluate(() => window.sonal.corpus.personnesInventaire())
    expect(vue.participations.find((p) => p.entretienId === 'e1' && p.participationId === cible.participationId)).toEqual(cible)
    expect(vue.participations.find((p) => p.entretienId === id)).toMatchObject({ locuteurRef: null, pseudo: 'Alice modifiée' })
    expect(vue.locuteurs).toHaveLength(1)
  } finally { await app.close() }
})

test('une source liée pendant le dialogue bloque la réunion sans modifier l’identité de la cible', async () => {
  const { app, page } = await ouvrir('sonal-conflit-source-liee-')
  try {
    const [id] = await sources(page), { dialogue, cible } = await nommer(page)
    await dialogue.getByRole('radio').check()
    const sourceId = await page.evaluate((id) => window.sonal.corpus.personnesCommander({ type: 'creer', entretienId: id, participationId: 'local', nom: 'Marie Dupont' }), id)
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue.getByRole('alert')).toContainText('ont changé')
    const vue = await page.evaluate(() => window.sonal.corpus.personnesInventaire())
    expect(vue.participations.find((p) => p.entretienId === 'e1' && p.participationId === cible.participationId)).toEqual(cible)
    expect(cible.locuteurRef).not.toBe(sourceId); expect(vue.locuteurs).toHaveLength(2)
  } finally { await app.close() }
})

test('des propositions modifiées empêchent un refus en masse sans supprimer l’identité indépendante', async () => {
  const { app, page } = await ouvrir('sonal-conflit-propositions-')
  try {
    const ids = await sources(page, 2), { dialogue, cible } = await nommer(page)
    await expect(dialogue.getByRole('radio')).toHaveCount(2)
    await page.evaluate((id) => window.sonal.corpus.personnesCommander({ type: 'creer', entretienId: id, participationId: 'local', nom: 'Marie Dupont' }), ids[0])
    await dialogue.getByRole('button', { name: 'Aucune de ces personnes', exact: true }).click()
    await expect(dialogue.getByRole('alert')).toContainText('ont changé')
    const vue = await page.evaluate(() => window.sonal.corpus.personnesInventaire())
    expect(vue.participations.find((p) => p.entretienId === 'e1' && p.participationId === cible.participationId)).toEqual(cible)
    expect(cible.rapprochementsRefuses).toHaveLength(0); expect(vue.locuteurs).toHaveLength(2)
  } finally { await app.close() }
})
