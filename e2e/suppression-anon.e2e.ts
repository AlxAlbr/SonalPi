import { test, expect, type Page } from '@playwright/test'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ouvrirSurCorpus, lancer } from './util'
import { fixtureDissociationAnon } from '../test/fixtures/dissociationAnon'

async function installer(page: Page) {
  const ids = await page.evaluate(async ({ corpus, sources }) => {
    const ids: string[] = []
    for (const s of sources) ids.push((await window.sonal.corpus.importer(s.titre, s.data, [], [], Object.values(corpus.reglesAnon))).id)
    return ids
  }, fixtureDissociationAnon())
  const regle = await page.evaluate(async () => (await window.sonal.corpus.reglesAnon()).find((r) => r.entite[0] === 'Karine')!)
  await page.reload(); await page.getByRole('button', { name: 'corpus', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pseudonymisation', exact: true })).toBeVisible()
  return { ids, regle }
}
const lire = (page: Page, ids: string[]) => page.evaluate(async (ids) => Promise.all(ids.map((id) => window.sonal.corpus.lireEntretien(id))), ids)
async function dialogue(page: Page) {
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
  await page.getByRole('button', { name: 'Supprimer partout Karine', exact: true }).click()
  return page.getByRole('dialog', { name: 'Supprimer une règle partout', exact: true })
}
async function preparer(page: Page) {
  const modal = await dialogue(page)
  await expect(modal).toContainText('8 passage(s) concerné(s) dans 2 entretien(s)')
  await expect(modal.getByRole('button', { name: 'Préparer la suppression globale', exact: true })).toHaveCount(0)
  return modal
}

test('suppression locale : annulation, consentement et seul retrait des décisions liées', async ({}, info) => {
  const { app, page } = await ouvrirSurCorpus('sonal-suppression-')
  try {
    const { ids, regle } = await installer(page), avant = await lire(page, ids)
    await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
    const croix = page.getByRole('button', { name: 'Supprimer partout Karine', exact: true })
    await expect(croix).toHaveText('✖')
    expect(await croix.evaluate((button) => getComputedStyle(button).color)).toBe('rgb(176, 0, 32)')
    await expect(page.getByRole('button', { name: 'Dissocier globalement Karine', exact: true })).toHaveText('📄')
    let modal = await preparer(page)
    await expect(modal.getByRole('button', { name: 'Confirmer la suppression globale', exact: true })).toBeDisabled()
    await expect(modal).toContainText('les noms et pseudonymes enregistrés dans chaque entretien et les locuteurs sont conservés')
    await page.screenshot({ path: info.outputPath('suppression-normale.png') })
    await page.setViewportSize({ width: 760, height: 700 }); await page.screenshot({ path: info.outputPath('suppression-reduite.png') })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await modal.getByRole('button', { name: 'Annuler', exact: true }).click(); expect(await lire(page, ids)).toEqual(avant)
    await page.setViewportSize({ width: 1280, height: 900 }); modal = await preparer(page)
    await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la suppression globale', exact: true }).click()
    await expect(modal).toHaveCount(0); await expect(page.locator('.pseudo-panneau')).toContainText('Suppression effectuée : 8 décision(s)')
    const apres = await lire(page, ids)
    for (let i = 0; i < ids.length; i++) {
      const a = avant[i], b = apres[i]; if (!a.ok || !b.ok) throw new Error('Fixture illisible.')
      const attendu = structuredClone(a.data)
      if (i < 2) attendu.annotations = attendu.annotations.filter((a) => a.regle !== regle.id)
      expect({ ...b.data, lastModified: a.data.lastModified }).toEqual(attendu)
    }
    expect((await page.evaluate(() => window.sonal.corpus.reglesAnon())).some((r) => r.id === regle.id)).toBe(false)
  } finally { await app.close() }
})
test('suppression locale : source non ciblée périmée refuse puis nouvel aperçu conserve son édition', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-suppression-perimee-')
  try {
    const { ids } = await installer(page), avant = await lire(page, ids.slice(0, 2)), modal = await preparer(page)
    await page.evaluate(async (id) => {
      const l = await window.sonal.corpus.lireEntretien(id); if (!l.ok) throw new Error('Fixture illisible.')
      await window.sonal.corpus.ecrireEntretien(id, { ...l.data, meta: { ...l.data.meta, valeursGen: { ...l.data.meta.valeursGen, 'concurrence-synthetique': 'À conserver' } } })
    }, ids[2])
    const tiers = await lire(page, ids.slice(2))
    await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la suppression globale', exact: true }).click()
    await expect(modal.getByRole('alert')).toContainText('rouvrez le corpus')
    await modal.getByText('Informations pour l’assistance', { exact: true }).click()
    await expect(modal).toContainText('changé depuis l’inventaire')
    await expect(modal.getByRole('button', { name: 'Actualiser le bilan', exact: true })).toBeDisabled()
    expect(await lire(page, ids.slice(0, 2))).toEqual(avant)
    await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
    const frais = await preparer(page); await frais.getByRole('checkbox').check(); await frais.getByRole('button', { name: 'Confirmer la suppression globale', exact: true }).click()
    await expect(frais).toHaveCount(0); expect(await lire(page, ids.slice(2))).toEqual(tiers)
  } finally { await app.close() }
})
test('suppression locale : session ouverte refuse, sa fermeture exige une préparation neuve', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-suppression-session-')
  try {
    const { ids } = await installer(page), avant = await lire(page, ids)
    await page.evaluate((id) => window.sonal.corpus.ouvrirEntretienPourEdition(id), ids[0])
    const modal = await preparer(page)
    await expect(modal.getByRole('checkbox')).toBeDisabled()
    await page.evaluate((id) => window.sonal.corpus.fermerEntretien(id), ids[0])
    await expect(modal.getByRole('button', { name: 'Confirmer la suppression globale', exact: true })).toBeDisabled()
    await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
    expect(await lire(page, ids)).toEqual(avant)
    const frais = await preparer(page); await expect(frais.getByRole('checkbox')).toBeEnabled()
    await frais.getByRole('checkbox').check(); await frais.getByRole('button', { name: 'Confirmer la suppression globale', exact: true }).click()
    await expect(frais).toHaveCount(0)
  } finally { await app.close() }
})
test('suppression locale interrompue : journal v4, relance et acquis non réécrit', async () => {
  let { app, page } = await ouvrirSurCorpus('sonal-suppression-reprise-')
  try {
    const { ids, regle } = await installer(page)
    const dir = (await page.evaluate(() => window.sonal.corpus.dossierCourant())).dir
    const profil = await app.evaluate(({ app }) => app.getPath('userData')), modal = await preparer(page)
    await app.evaluate((_electron, cible) => {
      const fs = process.getBuiltinModule('fs') as typeof import('node:fs'), original = fs.renameSync
      fs.renameSync = (...args: Parameters<typeof fs.renameSync>) => {
        if (String(args[1]) === cible) throw new Error('Interruption synthétique de la suppression.')
        return original(...args)
      }
    }, join(dir, 'entretiens', `${ids[1]}.json`))
    await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la suppression globale', exact: true }).click()
    await expect(modal.getByRole('alert')).toContainText('rouvrez le corpus')
    await modal.getByText('Informations pour l’assistance', { exact: true }).click()
    await expect(modal).toContainText('Interruption synthétique')
    const cible = join(dir, 'entretiens', `${ids[0]}.json`), acquis = readFileSync(cible, 'utf8'), mtime = statSync(cible).mtimeMs
    expect(JSON.parse(acquis).annotations.some((a: { regle?: string }) => a.regle === regle.id)).toBe(false)
    const journal = join(dir, '.transaction-fichiers.json')
    expect(JSON.parse(readFileSync(journal, 'utf8')).formatVersion).toBe(4); expect(statSync(journal).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8')).reglesAnon[regle.id]).toBeDefined()
    await app.close(); app = await lancer(profil, { preserverSettings: true }); page = await app.firstWindow()
    await page.getByRole('button', { name: 'corpus', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pseudonymisation', exact: true })).toBeVisible({ timeout: 20_000 })
    expect(readFileSync(cible, 'utf8')).toBe(acquis); expect(statSync(cible).mtimeMs).toBe(mtime)
    expect((await page.evaluate(() => window.sonal.corpus.reglesAnon())).some((r) => r.id === regle.id)).toBe(false)
  } finally { await app.close() }
})
