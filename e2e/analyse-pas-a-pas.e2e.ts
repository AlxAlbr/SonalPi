import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attendreAccueil, lancer } from './util'
import { preparerApprentissage } from './exemples-util'

const catalogue = (page: Page) => page.getByRole('dialog', { name: 'Choisir un parcours pas à pas' })
const lireCorpus = (dir: string) => JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'))
async function voirParcours(page: Page) {
  await page.getByTestId('resume-parcours-global').getByRole('button', { name: 'Voir les étapes ou changer de parcours' }).click()
}
async function syntheseUtilite(page: Page) {
  await page.locator('[data-tour="ouvrir-synthese"]').click()
  await page.locator('[data-tour="theme-synthese-cat_009"] input').check()
  await page.locator('[data-tour="calculer-synthese"]').click()
  await expect(page.locator('.fini-pp')).toContainText('Rassembler les passages')
}
async function calculerMatrice(page: Page) {
  await page.locator('[data-tour="ouvrir-analyses-croisees"]').click()
  await page.locator('[data-tour="vider-themes-analyse"]').click()
  await page.locator('[data-tour="theme-analyse-cat_009"] input').check()
  await page.locator('[data-tour="theme-analyse-cat_019"] input').check()
  await page.locator('[data-tour="calculer-analyse"]').click()
  await expect(page.locator('.panneau-analyses .cellule')).toHaveCount(8)
}

test('les quatre étapes traversent les trois outils et reviennent des chiffres aux passages', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-parcours-analyse-'))
  const dir = join(racine, 'analyse')
  const modele = readFileSync(join(process.cwd(), 'CorpusTest/CorpusSynthAnnot/corpus.json'), 'utf8')
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await preparerApprentissage(app, page, join(racine, 'sources'), dir, 'analyse')
    const initial = lireCorpus(dir)
    expect(initial.nom).toBe('Analyser et interpréter')
    expect(initial.demo.exemple).toBe('synth-annote')
    expect(initial.demo.parcours.analyse.validees).toEqual([])
    expect(initial.demo.parcours.traitement?.validees ?? []).toEqual([])
    expect(Object.keys(initial.membership)).toHaveLength(4)
    expect((await page.evaluate(() => window.sonal.corpus.recents())).some((r) => r.type === 'local' && r.dir === dir)).toBe(false)
    await syntheseUtilite(page)
    await expect(page.locator('.espace-analyse')).toBeVisible()
    await page.locator('.fini-pp').getByRole('button', { name: /Étape suivante/ }).click()
    await page.locator('[data-tour="ouvrir-lexico"]').click()
    await page.locator('[data-tour="rechercher-forme-lexico"]').fill('enfants')
    await page.locator('[data-tour="forme-lexico-enfants"]').click()
    await expect(page.locator('.fini-pp')).toContainText('Explorer les mots')
    await expect(page.locator('.concordances')).toContainText('enfants')
    await page.locator('.fini-pp').getByRole('button', { name: /Étape suivante/ }).click()
    await calculerMatrice(page)
    await expect(page.getByTestId('consigne-pas-a-pas')).toContainText('Couverture')
    await expect(page.locator('.fini-pp')).toHaveCount(0)
    await page.locator('[data-tour="mesure-analyse"]').selectOption('couverture')
    await expect(page.locator('.fini-pp')).toContainText('Comparer les thèmes')
    await page.locator('.fini-pp').getByRole('button', { name: /Étape suivante/ }).click()
    const id = Object.keys(initial.membership).find((id) => initial.membership[id].titre === '1Coordinatrice')!
    await page.locator(`[data-tour="cellule-analyse-cat_009-${id}"]`).click()
    await expect(page.locator('[data-tour="cellule-vers-synthese"]')).toBeVisible()
    await page.locator('[data-tour="cellule-vers-synthese"]').click()
    await expect(page.locator('.fini-pp')).toHaveCount(0)
    await page.locator('[data-tour="calculer-synthese"]').click()
    await expect(page.locator('.fini-pp')).toContainText('Revenir aux passages')
    await expect(page.getByTestId('resume-parcours-global')).toContainText('4 étapes sur 4')
    await expect(page.getByTestId('resume-parcours-global')).toContainText('terminé')
    await expect.poll(() => lireCorpus(dir).demo.parcours.analyse.validees.length).toBe(4)
    expect(lireCorpus(dir).demo.parcours.traitement?.validees ?? []).toEqual([])
    expect(readFileSync(join(process.cwd(), 'CorpusTest/CorpusSynthAnnot/corpus.json'), 'utf8')).toBe(modele)
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})

test('une étape choisie directement conserve sa progression après fermeture et se reprend sans réinstallation', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-reprise-analyse-'))
  const profil = join(racine, 'profil'), dir = join(racine, 'analyse')
  let app = await lancer(profil)
  try {
    let page = await app.firstWindow()
    await attendreAccueil(page)
    await preparerApprentissage(app, page, join(racine, 'sources'), dir, 'analyse', 'Comparer les thèmes entre entretiens')
    await expect(page.getByTestId('consigne-pas-a-pas')).toContainText('Comparer les thèmes entre entretiens')
    await voirParcours(page)
    await expect(catalogue(page).getByRole('button', { name: /Revenir aux passages pour interpréter/ })).toBeDisabled()
    await catalogue(page).getByRole('button', { name: /Comparer les thèmes entre entretiens/ }).click()
    await calculerMatrice(page)
    await page.locator('[data-tour="mesure-analyse"]').selectOption('couverture')
    await expect(page.locator('.fini-pp')).toBeVisible()
    const id = lireCorpus(dir).demo.id
    await app.close()
    app = await lancer(profil, { preserverSettings: true })
    page = await app.firstWindow()
    await attendreAccueil(page)
    await page.locator('.carte-demo.parcours').click()
    await catalogue(page).getByRole('button', { name: /^Analyser et interpréter/ }).click()
    await expect(catalogue(page).locator('.progression-pp')).toHaveText('1 étape sur 4')
    await expect(page.locator('.spotlight-bulle')).toHaveCount(0)
    await expect(page.getByTestId('consigne-pas-a-pas')).toHaveCount(0)
    await catalogue(page).getByRole('button', { name: /Revenir aux passages pour interpréter/ }).click()
    await expect(page.getByTestId('consigne-pas-a-pas')).toBeVisible()
    await expect(page.locator('.installation-exemple')).toHaveCount(0)
    expect(lireCorpus(dir).demo.id).toBe(id)
    expect(lireCorpus(dir).demo.parcours.analyse.validees).toEqual(['croiser-themes'])
    await page.getByRole('button', { name: 'Mettre le guide en pause', exact: true }).click()
    await expect(page.getByTestId('consigne-pas-a-pas')).toHaveCount(0)
    await expect(page.getByTestId('resume-parcours-global')).toContainText('1 étape sur 4')
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})

test('recommencer l’analyse restaure le corpus annoté et présente son emplacement sans lancer le guide', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-reset-analyse-'))
  const dir = join(racine, 'analyse')
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await preparerApprentissage(app, page, join(racine, 'sources'), dir, 'analyse')
    const id = lireCorpus(dir).demo.id
    await syntheseUtilite(page)
    await voirParcours(page)
    page.once('dialog', (d) => d.accept())
    await catalogue(page).getByRole('button', { name: 'Recommencer cette démo' }).click()
    const bilan = page.getByRole('dialog', { name: 'La démo a été remise à zéro' })
    await expect(bilan).toContainText('corpus annoté')
    await expect(bilan).toContainText('restauré dans son état de départ')
    await expect(bilan).toContainText(dir)
    await expect(page.getByTestId('consigne-pas-a-pas')).toHaveCount(0)
    expect(lireCorpus(dir).demo.id).toBe(id)
    expect(lireCorpus(dir).demo.parcours.analyse.validees).toEqual([])
    expect(Object.keys(lireCorpus(dir).membership)).toHaveLength(4)
    await bilan.getByRole('button', { name: 'Commencer la première étape' }).click()
    await expect(page.getByTestId('consigne-pas-a-pas')).toContainText('Rassembler les passages')
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})
