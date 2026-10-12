import { test, expect, type Page } from '@playwright/test'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ouvrirSurCorpus, lancer } from './util'
import { fixtureRetraitVarianteAnon } from '../test/fixtures/retraitVarianteAnon'

async function installer(page: Page) {
  const ids = await page.evaluate(async ({ corpus, sources }) => {
    const ids: string[] = []
    for (const s of sources) ids.push((await window.sonal.corpus.importer(s.titre, s.data, [], [], Object.values(corpus.reglesAnon))).id)
    return ids
  }, fixtureRetraitVarianteAnon())
  const regle = await page.evaluate(async () => (await window.sonal.corpus.reglesAnon()).find((r) => r.entite[0] === 'Karine')!)
  await page.reload(); await page.getByRole('button', { name: 'corpus', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pseudonymisation', exact: true })).toBeVisible()
  return { ids, regle }
}
const lire = (page: Page, ids: string[]) => page.evaluate(async (ids) => Promise.all(ids.map((id) => window.sonal.corpus.lireEntretien(id))), ids)
const action = 'Remplacer les choix et retirer la variante'
async function preparer(page: Page) {
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
  await page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true }).click()
  const edition = page.getByRole('dialog', { name: 'Modifier les pseudonymes', exact: true })
  await edition.getByLabel('Pseudonymes', { exact: true }).fill('Rebecca')
  await edition.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Retirer une variante', exact: true })
  await expect(modal).toContainText('6 choix à remplacer dans 2 entretien(s)')
  await expect(modal).toContainText('3 exception(s) et 2 choix masqué(s)')
  return modal
}
test('retrait local par slash : annulation puis remplacement explicite, exceptions et indépendants préservés', async ({}, info) => {
  const { app, page } = await ouvrirSurCorpus('sonal-retrait-variante-')
  try {
    const { ids, regle } = await installer(page), avant = await lire(page, ids)
    let modal = await preparer(page)
    await expect(modal.getByRole('button', { name: action, exact: true })).toBeDisabled()
    await expect(modal).toContainText('Les passages laissés en clair restent en clair')
    await page.screenshot({ path: info.outputPath('retrait-variante-normal.png') })
    await page.setViewportSize({ width: 760, height: 700 }); await page.screenshot({ path: info.outputPath('retrait-variante-reduit.png') })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await modal.getByRole('button', { name: 'Annuler', exact: true }).click(); expect(await lire(page, ids)).toEqual(avant)
    expect((await page.evaluate(() => window.sonal.corpus.reglesAnon())).find((r) => r.id === regle.id)!.pseudos).toEqual(['Claire', 'Rebecca'])
    await page.setViewportSize({ width: 1280, height: 900 }); modal = await preparer(page)
    await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: action, exact: true }).click()
    await expect(modal).toHaveCount(0); await expect(page.locator('.pseudo-panneau')).toContainText('Variante retirée : 6 choix remplacé(s), dont 3 exception(s) conservée(s) en clair')
    const apres = await lire(page, ids)
    for (let i = 0; i < ids.length; i++) {
      const a = avant[i], b = apres[i]; if (!a.ok || !b.ok) throw new Error('Fixture illisible.')
      const attendu = structuredClone(a.data)
      if (i < 2) for (const annotation of attendu.annotations) if (annotation.type === 'anon' && annotation.regle === regle.id && annotation.pseudo === 'Claire') annotation.pseudo = 'Rebecca'
      expect({ ...b.data, lastModified: a.data.lastModified }).toEqual(attendu)
    }
    expect((await page.evaluate(() => window.sonal.corpus.reglesAnon())).find((r) => r.id === regle.id)!.pseudos).toEqual(['Rebecca'])
  } finally { await app.close() }
})
test('retrait local : non-cible périmée refuse puis nouveau bilan préserve son édition', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-retrait-variante-perimee-')
  try {
    const { ids } = await installer(page), avant = await lire(page, ids.slice(0, 2)), modal = await preparer(page)
    await page.evaluate(async (id) => {
      const l = await window.sonal.corpus.lireEntretien(id); if (!l.ok) throw new Error('Fixture illisible.')
      await window.sonal.corpus.ecrireEntretien(id, { ...l.data, meta: { ...l.data.meta, valeursGen: { ...l.data.meta.valeursGen, 'concurrence-synthetique': 'À conserver' } } })
    }, ids[2])
    const tiers = await lire(page, ids.slice(2))
    await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: action, exact: true }).click()
    await expect(modal.getByRole('alert')).toContainText('rouvrez le corpus')
    await modal.getByText('Informations pour l’assistance', { exact: true }).click(); await expect(modal).toContainText('changé depuis le bilan')
    await expect(modal.getByRole('button', { name: 'Actualiser le bilan', exact: true })).toBeDisabled()
    expect(await lire(page, ids.slice(0, 2))).toEqual(avant)
    await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
    const frais = await preparer(page); await frais.getByRole('checkbox').check(); await frais.getByRole('button', { name: action, exact: true }).click()
    await expect(frais).toHaveCount(0); expect(await lire(page, ids.slice(2))).toEqual(tiers)
  } finally { await app.close() }
})
test('retrait local : session ouverte refusée, fermeture puis consentement neuf', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-retrait-variante-session-')
  try {
    const { ids } = await installer(page), avant = await lire(page, ids)
    await page.evaluate((id) => window.sonal.corpus.ouvrirEntretienPourEdition(id), ids[0])
    const modal = await preparer(page); await expect(modal.getByRole('checkbox')).toBeDisabled()
    await page.evaluate((id) => window.sonal.corpus.fermerEntretien(id), ids[0])
    await expect(modal.getByRole('button', { name: action, exact: true })).toBeDisabled()
    await modal.getByRole('button', { name: 'Annuler', exact: true }).click(); expect(await lire(page, ids)).toEqual(avant)
    const frais = await preparer(page); await frais.getByRole('checkbox').check(); await frais.getByRole('button', { name: action, exact: true }).click()
    await expect(frais).toHaveCount(0)
  } finally { await app.close() }
})
test('retrait local interrompu : journal v5, relance et choix acquis non réécrits', async () => {
  let { app, page } = await ouvrirSurCorpus('sonal-retrait-variante-reprise-')
  try {
    const { ids, regle } = await installer(page), dir = (await page.evaluate(() => window.sonal.corpus.dossierCourant())).dir
    const profil = await app.evaluate(({ app }) => app.getPath('userData')), modal = await preparer(page)
    await app.evaluate((_electron, cible) => {
      const fs = process.getBuiltinModule('fs') as typeof import('node:fs'), original = fs.renameSync
      fs.renameSync = (...args: Parameters<typeof fs.renameSync>) => {
        if (String(args[1]) === cible) throw new Error('Interruption synthétique du retrait de variante.')
        return original(...args)
      }
    }, join(dir, 'entretiens', `${ids[1]}.json`))
    await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: action, exact: true }).click()
    await expect(modal.getByRole('alert')).toContainText('rouvrez le corpus')
    const cible = join(dir, 'entretiens', `${ids[0]}.json`), acquis = readFileSync(cible, 'utf8'), mtime = statSync(cible).mtimeMs
    const data = JSON.parse(acquis)
    expect(data.annotations.filter((a: { regle?: string; pseudo?: string }) => a.regle === regle.id && a.pseudo === 'Claire')).toHaveLength(0)
    expect(JSON.parse(readFileSync(join(dir, '.transaction-fichiers.json'), 'utf8')).formatVersion).toBe(5)
    expect(statSync(join(dir, '.transaction-fichiers.json')).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')).reglesAnon[regle.id].pseudos).toEqual(['Claire', 'Rebecca'])
    await app.close(); app = await lancer(profil, { preserverSettings: true }); page = await app.firstWindow()
    await page.getByRole('button', { name: 'corpus', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pseudonymisation', exact: true })).toBeVisible({ timeout: 20_000 })
    expect(readFileSync(cible, 'utf8')).toBe(acquis); expect(statSync(cible).mtimeMs).toBe(mtime)
    expect((await page.evaluate(() => window.sonal.corpus.reglesAnon())).find((r) => r.id === regle.id)!.pseudos).toEqual(['Rebecca'])
  } finally { await app.close() }
})
