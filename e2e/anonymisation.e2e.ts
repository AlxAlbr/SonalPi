import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  lancer,
  entrerCorpus,
  entrerEntretien,
  ajouterParModale,
  ouvrir,
  ouvrirSurCorpus,
  retourCorpus,
  selectionner,
} from './util'

/**
 *  E2E round-trip ANONYMISATION : importer un `.sonal`
 *  SonalPi1 anonymisé (spans anon + exception + anon-json de règles corpus) →
 *  l'exporter → le ré-importer → les règles corpus SURVIVENT sans doublon
 *  (texte + exceptions + règles, sans perte), dans la vraie app.
 */

import { fixturePseudonymisation } from '../test/fixtures/pseudonymisation'
import { fixtureRenommageAnon } from '../test/fixtures/renommageAnon'

const FIXTURE = join(process.cwd(), 'test', 'fixtures', 'entretien1.sonal')

test('tableau corpus : quatre colonnes, filtres, variantes et garde des changements', async ({}, testInfo) => {
  const { app, page } = await ouvrirSurCorpus('sonal-anon-tableau-')
  try {
    const fixture = fixturePseudonymisation()
    await page.evaluate(async ({ regles, entretiens }) => {
      await window.sonal.corpus.importer('Recette synthétique', entretiens[0].data, [], [], regles)
    }, fixture)
    const entiteLongue = 'un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize'
    await page.evaluate(async (entite) => {
      await window.sonal.corpus.regleAnonCreer(entite, ['Un remplacement synthétique très long qui doit rester lisible même dans une fenêtre étroite'])
    }, entiteLongue)
    await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
    await expect(page.locator('.pseudo-table thead th')).toHaveCount(4)
    const filtre = page.getByLabel('Filtre d’état'), ajouter = page.getByRole('button', { name: 'Ajouter une règle', exact: true })
    expect(await ajouter.evaluate((button) => button.previousElementSibling?.getAttribute('aria-label'))).toBe('Filtre d’état')
    const positionFiltre = (await filtre.boundingBox())!, positionAjout = (await ajouter.boundingBox())!
    expect(positionAjout.x).toBeGreaterThan(positionFiltre.x)
    expect(Math.abs(positionAjout.y - positionFiltre.y)).toBeLessThan(5)
    await expect(page.getByRole('button', { name: 'Import règles', exact: true })).toHaveText('Import règles 📥')
    await expect(page.getByRole('button', { name: 'Export règles', exact: true })).toHaveText('Export règles 📤')
    const parametres = page.getByRole('button', { name: 'Paramètres de pseudonymisation', exact: true })
    await expect(parametres).toHaveText('Paramètres ⚙')
    await parametres.click(); await expect(parametres).toHaveAttribute('aria-expanded', 'true')
    await parametres.click(); await expect(parametres).toHaveAttribute('aria-expanded', 'false')
    const enteteActions = page.locator('.pseudo-outils-regles')
    const positionOutils = (await enteteActions.boundingBox())!, positionActualiser = (await page.locator('.actualiser-pseudo').boundingBox())!
    expect(positionOutils.x).toBeGreaterThan(positionActualiser.x + positionActualiser.width)
    expect(await page.locator('.pseudo-table tbody tr').first().locator('td').evaluateAll((tds) => tds.slice(0, 3).map((td) => getComputedStyle(td).textAlign))).toEqual(['center', 'center', 'center'])
    const legende = page.locator('.pseudo-legende')
    await expect(legende).toHaveAttribute('open', '')
    await legende.locator('summary').click(); await expect(legende).not.toHaveAttribute('open')
    await legende.locator('summary').press('Enter'); await expect(legende).toHaveAttribute('open', '')
    const absente = page.locator('.pseudo-table tbody tr', { hasText: 'Absente' })
    await expect(absente).toHaveClass(/neutre/)
    await expect(absente).not.toHaveClass(/\bok\b/)
    await page.getByLabel('Filtre d’état').selectOption('inutilisees')
    await expect(absente).toBeVisible()
    await page.getByLabel('Filtre d’état').selectOption('collisions')
    await expect(page.locator('.pseudo-table tbody tr')).toHaveCount(2)
    await page.getByLabel('Filtre d’état').selectOption('toutes')
    await page.getByLabel('Rechercher une règle').fill('huit')
    await expect(page.locator('.pseudo-table tbody tr')).toHaveCount(1)
    await expect(page.getByTitle(entiteLongue, { exact: true })).toContainText('[…]')
    await page.getByLabel('Rechercher une règle').fill('')
    await page.locator('.pseudo-table tbody tr', { hasText: 'Karine' }).getByRole('button', { name: 'Voir les entretiens' }).click()
    await page.locator('.acc-tete').last().getByRole('button').press('Enter')
    await expect(page.locator('.occ-pseudo', { hasText: '[Rebecca]' })).toBeVisible()
    await expect(page.locator('.occ input[type="checkbox"]').nth(0)).toBeDisabled()
    await expect(page.locator('.occ input[type="checkbox"]').nth(1)).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('pseudonymisation-normal.png') })
    const ratioInitial = await page.evaluate(() => window.devicePixelRatio)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25))
    await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBe(ratioInitial * 1.25)
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    expect((await page.locator('.pseudo-table-wrap').boundingBox())!.height).toBeGreaterThan(170)
    const captureZoom = await app.evaluate(async ({ BrowserWindow }) => {
      const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage()
      return image.toPNG().toString('base64')
    })
    writeFileSync(testInfo.outputPath('pseudonymisation-zoom.png'), Buffer.from(captureZoom, 'base64'))
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1))
    await page.setViewportSize({ width: 760, height: 700 })
    await page.screenshot({ path: testInfo.outputPath('pseudonymisation-reduite.png') })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.locator('.pseudo-table tbody tr', { hasText: 'Marseille' }).getByRole('button', { name: 'Voir les entretiens' }).click()
    await page.locator('.acc-tete').last().click()
    await page.locator('.occ input[type="checkbox"]').first().check()
    await page.locator('.pseudo-table tbody tr', { hasText: 'Absente' }).getByRole('button', { name: 'Voir les entretiens' }).click()
    await expect(page.getByRole('heading', { name: 'Changements non validés' })).toBeVisible()
    await page.getByRole('button', { name: 'Rester', exact: true }).click()
    await expect(page.locator('.occ input[type="checkbox"]').first()).toBeChecked()
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Notes', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Changements non validés' })).toBeVisible()
    await page.getByRole('button', { name: 'Rester', exact: true }).click()
    await expect(page.locator('.onglets-corpus button.actif')).toHaveAttribute('aria-label', 'Pseudonymisation')
    await page.getByRole('button', { name: 'Organiser et exporter', exact: true }).click()
    await expect(page.locator('.accueil-organisation')).toBeVisible()
    await page.getByRole('button', { name: 'Importer et traiter', exact: true }).click()
    await expect(page.locator('.onglets-corpus button.actif')).toHaveAttribute('aria-label', 'Pseudonymisation')
    await expect(page.locator('.occ input[type="checkbox"]').first()).toBeChecked()
    await page.getByRole('button', { name: 'Actualiser', exact: false }).click()
    await page.locator('.garde-dialogue').getByRole('button', { name: 'Abandonner', exact: true }).click()
    await expect(page.locator('.occ input[type="checkbox"]').first()).not.toBeChecked()
  } finally {
    await app.close()
  }
})

test('renommage global local : annulation, source périmée, inventaire confirmé et seules décisions liées', async ({}, testInfo) => {
  const { app, page } = await ouvrirSurCorpus('sonal-anon-renommage-')
  try {
    const fixture = fixtureRenommageAnon()
    const ids = await page.evaluate(async ({ corpus, sources }) => {
      const ids: string[] = []
      for (const s of sources) ids.push((await window.sonal.corpus.importer(s.titre, s.data, [], [], Object.values(corpus.reglesAnon))).id)
      return ids
    }, fixture)
    const avant = await page.evaluate(async (ids) => Promise.all(ids.map((id) => window.sonal.corpus.lireEntretien(id))), ids)
    await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
    const ouvrirRenommage = async () => {
      await page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true }).click()
      const edition = page.getByRole('dialog', { name: 'Modifier les pseudonymes', exact: true })
      await edition.getByLabel('Pseudonymes', { exact: true }).fill('Nouvelle / Rebecca')
      await edition.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    }
    await ouvrirRenommage()
    let dialogue = page.getByRole('dialog', { name: 'Renommer une variante corpus' })
    await dialogue.getByLabel('Nouveau pseudonyme').fill('Nouvelle')
    await dialogue.getByRole('button', { name: 'Préparer l’inventaire' }).click()
    await expect(dialogue).toContainText('4 annotation(s) à renommer, dont 2 masquée(s)')
    await expect(dialogue.getByRole('button', { name: 'Confirmer le renommage global' })).toBeDisabled()
    await dialogue.getByRole('button', { name: 'Annuler', exact: true }).click()
    expect(await page.evaluate(async (ids) => Promise.all(ids.map((id) => window.sonal.corpus.lireEntretien(id))), ids)).toEqual(avant)
    await ouvrirRenommage()
    dialogue = page.getByRole('dialog', { name: 'Renommer une variante corpus' })
    await dialogue.getByLabel('Nouveau pseudonyme').fill('Nouvelle')
    await dialogue.getByRole('button', { name: 'Préparer l’inventaire' }).click()
    await expect(dialogue).toContainText('4 annotation(s) à renommer')
    await page.evaluate(async (id) => {
      const lecture = await window.sonal.corpus.lireEntretien(id)
      if (!lecture.ok) throw new Error('Source synthétique indisponible.')
      await window.sonal.corpus.ecrireEntretien(id, { ...lecture.data, meta: { ...lecture.data.meta,
        valeursGen: { ...lecture.data.meta.valeursGen, 'concurrence-synthetique': 'Modification concurrente synthétique' } } })
    }, ids[1])
    await dialogue.getByRole('checkbox').check()
    await dialogue.getByRole('button', { name: 'Confirmer le renommage global' }).click()
    await expect(dialogue.getByRole('alert')).toContainText('changé depuis l’inventaire')
    await expect(dialogue.getByRole('checkbox')).toHaveCount(0)
    const frais = await page.evaluate(async (ids) => Promise.all(ids.map((id) => window.sonal.corpus.lireEntretien(id))), ids)
    await dialogue.getByRole('button', { name: 'Préparer l’inventaire' }).click()
    await expect(dialogue).toContainText('4 annotation(s) à renommer')
    await page.screenshot({ path: testInfo.outputPath('renommage-normal.png') })
    await page.setViewportSize({ width: 760, height: 700 })
    await page.screenshot({ path: testInfo.outputPath('renommage-reduit.png') })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await dialogue.getByRole('checkbox').check()
    await dialogue.getByRole('button', { name: 'Confirmer le renommage global' }).click()
    await expect(dialogue).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true })).toHaveText('Nouvelle / Rebecca')
    const apres = await page.evaluate(async (ids) => Promise.all(ids.map((id) => window.sonal.corpus.lireEntretien(id))), ids)
    for (let n = 0; n < frais.length; n++) {
      const a = frais[n], b = apres[n]
      expect(a.ok && b.ok).toBe(true)
      if (!a.ok || !b.ok) throw new Error('Source synthétique indisponible.')
      const attendu = structuredClone(a.data)
      for (const annotation of attendu.annotations) if (['a0', 'a5'].includes(annotation.id)) annotation.pseudo = 'Nouvelle'
      expect({ ...b.data, lastModified: a.data.lastModified }).toEqual(attendu)
    }
  } finally { await app.close() }
})

test('ajouter depuis un corpus sans règle crée seulement la définition et respecte les invariants', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-anon-creation-')
  try {
    const avant = await page.evaluate(() => window.sonal.corpus.lireEntretien('e1'))
    await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
    await expect(page.locator('.pseudo-vide')).toContainText('Aucune règle')
    await page.getByRole('button', { name: 'Ajouter une règle', exact: true }).click()
    const formulaire = page.getByRole('dialog', { name: 'Ajouter une règle au corpus' })
    await formulaire.getByLabel('Entité originale / alias').fill('Lyon / Lyons')
    await formulaire.getByLabel('Pseudonymes', { exact: true }).fill('Ville / Cité')
    await formulaire.getByRole('button', { name: 'Créer la définition' }).click()
    await expect(formulaire.getByRole('alert')).toContainText('plusieurs alias')
    expect(await page.evaluate(() => window.sonal.corpus.reglesAnon())).toEqual([])
    await formulaire.getByRole('button', { name: 'Annuler', exact: true }).click()
    await page.getByRole('button', { name: 'Ajouter une règle', exact: true }).click()
    await formulaire.getByLabel('Entité originale / alias').fill('Lyon / Lyons')
    await formulaire.getByLabel('Pseudonymes', { exact: true }).fill('Ville')
    await formulaire.getByRole('button', { name: 'Créer la définition' }).click()
    await expect(formulaire).not.toBeVisible()
    await expect(page.locator('.pseudo-table tbody tr', { hasText: 'Lyon / Lyons' })).toHaveClass(/todo/)
    const apres = await page.evaluate(() => window.sonal.corpus.lireEntretien('e1'))
    expect(apres).toEqual(avant)
    await page.getByRole('button', { name: 'Ajouter une règle', exact: true }).click()
    await formulaire.getByLabel('Entité originale / alias').fill('Nouvelle entité')
    await formulaire.getByLabel('Pseudonymes', { exact: true }).fill('Remplacement')
    await formulaire.getByRole('button', { name: 'Annuler', exact: true }).click()
    expect(await page.evaluate(() => window.sonal.corpus.reglesAnon())).toHaveLength(1)
  } finally { await app.close() }
})

test('ajout de variante local : annulation, définition périmée refusée puis choix existants inchangés', async ({}, info) => {
  const { app, page } = await ouvrirSurCorpus('sonal-anon-variante-')
  try {
    const fixture = fixtureRenommageAnon()
    fixture.corpus.reglesAnon.personne.pseudos = ['Claire']
    for (const s of fixture.sources) for (const a of s.data.annotations) if (a.regle === 'personne' && a.pseudo === 'Rebecca') a.pseudo = 'Claire'
    const ids = await page.evaluate(async ({ corpus, sources }) => {
      const ids: string[] = []
      for (const s of sources) ids.push((await window.sonal.corpus.importer(s.titre, s.data, [], [], Object.values(corpus.reglesAnon))).id)
      return ids
    }, fixture)
    const avant = await page.evaluate(async (ids) => Promise.all(ids.map((id) => window.sonal.corpus.lireEntretien(id))), ids)
    await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
    const ouvrirAjout = () => page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true }).click()
    await ouvrirAjout()
    const modal = page.getByRole('dialog', { name: 'Modifier les pseudonymes', exact: true })
    await expect(modal.getByLabel('Pseudonymes', { exact: true })).toHaveValue('Claire')
    await expect(page.locator('.pseudo-table')).not.toContainText('+ Variante')
    await modal.getByLabel('Pseudonymes', { exact: true }).fill('Claire / Rebecca')
    await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
    expect((await page.evaluate(() => window.sonal.corpus.reglesAnon())).find((r) => r.id === 'personne')!.pseudos).toEqual(['Claire'])
    await ouvrirAjout(); await modal.getByLabel('Pseudonymes', { exact: true }).fill('Claire / claire')
    await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(modal.getByRole('alert')).toContainText('différents')
    await modal.getByLabel('Pseudonymes', { exact: true }).fill('Claire / Rebecca')
    await page.evaluate(() => window.sonal.corpus.regleAnonCategoriser('personne', 'Catégorie concurrente'))
    await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(modal.getByRole('alert')).toContainText('n’a pas pu être confirmé')
    await expect(modal.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled()
    await modal.getByRole('button', { name: 'Fermer', exact: true }).click()
    await page.locator('.actualiser-pseudo').click(); await ouvrirAjout()
    await modal.getByLabel('Pseudonymes', { exact: true }).fill('Claire / Rebecca')
    await page.screenshot({ path: info.outputPath('ajout-variante-normal.png') })
    await page.setViewportSize({ width: 760, height: 700 })
    await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(modal).toBeHidden()
    await expect(page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true })).toHaveText('Claire / Rebecca')
    await ouvrirAjout()
    await expect(modal.getByLabel('Pseudonymes', { exact: true })).toHaveValue('Claire / Rebecca')
    await page.screenshot({ path: info.outputPath('ajout-variante-reduit.png') })
    await modal.getByLabel('Pseudonymes', { exact: true }).fill('Claire')
    await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    const retrait = page.getByRole('dialog', { name: 'Retirer une variante', exact: true })
    await expect(retrait).toBeVisible()
    await expect(retrait.getByRole('button', { name: 'Remplacer les choix et retirer la variante', exact: true })).toBeDisabled()
    await retrait.getByRole('button', { name: 'Annuler', exact: true }).click()
    const regle = (await page.evaluate(() => window.sonal.corpus.reglesAnon())).find((r) => r.id === 'personne')!
    expect(regle).toMatchObject({ pseudos: ['Claire', 'Rebecca'], categorie: 'Catégorie concurrente' })
    expect(await page.evaluate(async (ids) => Promise.all(ids.map((id) => window.sonal.corpus.lireEntretien(id))), ids)).toEqual(avant)
  } finally { await app.close() }
})

test('ajout de variante local : erreur après écriture reconnue par actualisation sans deuxième ajout', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-anon-variante-incertaine-')
  try {
    await page.evaluate(() => window.sonal.corpus.regleAnonCreer('Karine', ['Claire']))
    const dir = (await page.evaluate(() => window.sonal.corpus.dossierCourant())).dir
    const avant = await page.evaluate(() => window.sonal.corpus.lireEntretien('e1'))
    await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
    await page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Modifier les pseudonymes', exact: true })
    await modal.getByLabel('Pseudonymes', { exact: true }).fill('Claire / Rebecca')
    await app.evaluate((_electron, cible) => {
      const fs = process.getBuiltinModule('fs') as typeof import('node:fs'), original = fs.renameSync
      let interrompt = true
      fs.renameSync = (...args: Parameters<typeof fs.renameSync>) => {
        original(...args)
        if (interrompt && String(args[1]) === cible) { interrompt = false; throw new Error('Interruption synthétique après remplacement.') }
      }
    }, join(dir, 'corpus.json'))
    await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(modal.getByRole('alert')).toContainText('n’a pas pu être confirmé')
    await expect(modal.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled()
    expect((await page.evaluate(() => window.sonal.corpus.reglesAnon())).find((r) => r.entite[0] === 'Karine')!.pseudos).toEqual(['Claire', 'Rebecca'])
    await modal.getByRole('button', { name: 'Fermer', exact: true }).click()
    await page.locator('.actualiser-pseudo').click()
    await expect(page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true })).toHaveText('Claire / Rebecca')
    expect(await page.evaluate(() => window.sonal.corpus.lireEntretien('e1'))).toEqual(avant)
  } finally { await app.close() }
})

test('tables de correspondance : aperçu, annulation, import seul et export V2/V1', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-anon-echanges-')
  const dir = mkdtempSync(join(tmpdir(), 'sonal-tables-export-'))
  const destination = join(dir, 'correspondances.json')
  try {
    const avant = await page.evaluate(() => window.sonal.corpus.lireEntretien('e1'))
    await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
    await page.getByRole('button', { name: 'Import règles', exact: true }).click()
    const modalImport = page.getByRole('dialog', { name: 'Importer les correspondances', exact: true })
    const fichier = { name: 'regles-synthetiques.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([
      { entite_init: 'Lyon / Lyons', entite_pseudo: 'Ville', thematique: 'LOC' },
      { entite_init: 'Karine', entite_pseudo: 'Claire', entite_pseudo_alt: 'Rebecca' },
      { entite_init: 'Paris / Pariss', entite_pseudo: 'Capitale', entite_pseudo_alt: 'Cité' },
    ])) }
    await modalImport.getByLabel('Fichiers JSON').setInputFiles(fichier)
    await expect(modalImport.locator('tbody tr')).toHaveCount(3)
    await expect(modalImport.getByText('Choisissez plusieurs alias', { exact: false })).toBeVisible()
    expect(await page.evaluate(() => window.sonal.corpus.reglesAnon())).toEqual([])
    await modalImport.getByRole('button', { name: 'Fermer les échanges' }).click()
    expect(await page.evaluate(() => window.sonal.corpus.reglesAnon())).toEqual([])
    await page.getByRole('button', { name: 'Import règles', exact: true }).click()
    await modalImport.getByLabel('Fichiers JSON').setInputFiles(fichier)
    await expect(modalImport.locator('tbody tr')).toHaveCount(3)
    await modalImport.getByRole('button', { name: 'Confirmer l’import des définitions' }).click()
    await expect(modalImport).not.toBeVisible()
    await expect(page.locator('.pseudo-table tbody tr')).toHaveCount(2)
    const regles = await page.evaluate(() => window.sonal.corpus.reglesAnon())
    expect(regles).toHaveLength(2)
    expect(await page.evaluate(() => window.sonal.corpus.lireEntretien('e1'))).toEqual(avant)
    await page.getByRole('button', { name: 'Import règles', exact: true }).click()
    await modalImport.getByLabel('Fichiers JSON').setInputFiles(fichier)
    await expect(modalImport.locator('tbody tr')).toHaveCount(3)
    await modalImport.getByLabel('Pseudos (séparés par /)', { exact: true }).nth(2).fill('Capitale')
    await expect(modalImport.getByRole('button', { name: 'Confirmer l’import des définitions' })).toBeDisabled()
    await modalImport.getByRole('button', { name: 'Recalculer l’aperçu' }).click()
    await expect(modalImport.getByLabel('Pseudos (séparés par /)', { exact: true }).nth(2)).toHaveValue('Capitale')
    await modalImport.getByRole('button', { name: 'Recalculer l’aperçu' }).click()
    await expect(modalImport.getByLabel('Pseudos (séparés par /)', { exact: true }).nth(2)).toHaveValue('Capitale')
    await modalImport.getByRole('button', { name: 'Fermer les échanges' }).click()
    expect(await page.evaluate(() => window.sonal.corpus.reglesAnon())).toEqual(regles)
    await app.evaluate(({ dialog }, chemin) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: chemin }) }, destination)
    await page.getByRole('button', { name: 'Export règles', exact: true }).click()
    const modalExport = page.getByRole('dialog', { name: 'Exporter les correspondances', exact: true })
    await expect(modalExport.getByRole('button', { name: 'Exporter V2', exact: true })).toBeDisabled()
    await modalExport.getByLabel('Règles', { exact: false }).selectOption('toutes')
    await expect(modalExport.locator('tbody tr')).toHaveCount(2)
    await modalExport.getByLabel('Je comprends que le fichier contient les identités originales.').check()
    await modalExport.getByRole('button', { name: 'Exporter V2', exact: true }).click()
    await expect(modalExport.getByText('Table exportée.', { exact: false })).toBeVisible()
    const exportV2 = JSON.parse(readFileSync(destination, 'utf8'))
    expect(exportV2).toMatchObject({ format: 'sonalpi-correspondances', version: 2 })
    expect(exportV2.correspondances).toHaveLength(2)
    await modalExport.getByText('Export compatible V1 — limites', { exact: true }).click()
    await modalExport.getByLabel('J’accepte les pertes et ambiguïtés du format V1.').check()
    await modalExport.getByRole('button', { name: 'Export compatible V1', exact: true }).click()
    await expect(modalExport.getByText('Table exportée.', { exact: false })).toBeVisible()
    expect(JSON.parse(readFileSync(destination, 'utf8'))).toEqual(expect.arrayContaining([
      expect.objectContaining({ entite_init: 'Lyon / Lyons', entite_pseudo: 'Ville', thematique: 'LOC' }),
      expect.objectContaining({ entite_init: 'Karine', entite_pseudo: 'Claire', entite_pseudo_alt: 'Rebecca' }),
    ]))
    expect(await page.evaluate(() => window.sonal.corpus.reglesAnon())).toEqual(regles)
    expect(await page.evaluate(() => window.sonal.corpus.lireEntretien('e1'))).toEqual(avant)
    await modalExport.getByRole('button', { name: 'Fermer les échanges' }).click()
    await page.getByRole('button', { name: 'Import règles', exact: true }).click()
    await modalImport.getByLabel('Fichiers JSON').setInputFiles({ name: 'retour-v2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exportV2)) })
    await expect(modalImport.locator('tbody tr')).toHaveCount(2)
    await expect(modalImport.getByRole('button', { name: 'Confirmer l’import des définitions' })).toBeDisabled()
    await expect(modalImport.locator('tbody tr').first()).toContainText('identique')
  } finally { await app.close() }
})

test('import ciblé local : confirmation, identité du locuteur et mémoire sans occurrence', async ({}, testInfo) => {
  const { app, page } = await ouvrirSurCorpus('sonal-anon-import-local-')
  try {
    const avant = await page.evaluate(() => window.sonal.corpus.lireEntretien('e1'))
    await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
    await page.getByRole('button', { name: 'Import règles', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Importer les correspondances', exact: true })
    await modal.getByLabel('Fichiers JSON').setInputFiles({ name: 'cibles-locales.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'sonalpi-correspondances', version: 2, correspondances: [
      { nature: 'texte', portee: 'texte-local', entite: ['Alias sans occurrence', 'Autre graphie'], pseudos: ['Ville témoin'], categorie: 'LOC', etatLocal: 'declaration', entretienId: 'id-etranger' },
      { nature: 'texte', portee: 'texte-local', entite: ['Nom sans occurrence'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER', etatLocal: 'declaration' },
      { nature: 'locuteur', nom: 'Karine', pseudo: 'Voix témoin', origines: [{ entretienId: 'id-etranger', locuteurIndex: 99, personneRef: 'identite-etrangere', pseudoEtat: 'confirme' }] },
    ] })) })
    const cibles = modal.locator('table').nth(1).locator('tbody tr')
    await expect(cibles).toHaveCount(3)
    await page.screenshot({ path: testInfo.outputPath('import-cible-normal.png') })
    await page.setViewportSize({ width: 760, height: 700 })
    await page.screenshot({ path: testInfo.outputPath('import-cible-reduit.png') })
    await page.setViewportSize({ width: 1280, height: 900 })
    const confirmer = modal.getByRole('button', { name: /Confirmer l’import/ })
    const confirmation = modal.getByLabel('Je confirme ces seuls entretiens et décisions.', { exact: false })
    await expect(confirmer).toBeDisabled()
    await cibles.nth(0).getByRole('checkbox').check()
    await confirmation.check()
    await cibles.nth(1).getByRole('checkbox').check()
    await expect(confirmation).not.toBeChecked()
    await cibles.nth(2).getByRole('checkbox').check()
    await cibles.nth(2).getByLabel('Décision du locuteur').selectOption('confirme')
    await expect(confirmer).toBeDisabled()
    await confirmation.check()
    await confirmer.click()
    await expect(modal).not.toBeVisible()
    const apres = await page.evaluate(() => window.sonal.corpus.lireEntretien('e1'))
    expect(avant.ok && apres.ok).toBe(true)
    if (!avant.ok || !apres.ok) throw new Error('Fixture illisible.')
    expect(apres.data.corpsTexte).toEqual(avant.data.corpsTexte)
    expect(apres.data.annotations).toEqual(avant.data.annotations)
    expect(apres.data.locuteurs[1]).toEqual({ ...avant.data.locuteurs[1], pseudo: 'Voix témoin', pseudoEtat: 'confirme' })
    expect(apres.data.definitionsAnonLocales).toHaveLength(2)
    expect(apres.data.definitionsAnonLocales![1].pseudos).toEqual(['Claire', 'Rebecca'])
    expect(await page.evaluate(() => window.sonal.corpus.reglesAnon())).toEqual([])
    await retourCorpus(page)
    await page.locator('.carte-ent', { hasText: 'Entretien Karine' }).locator('.crayon').click()
    await expect(page.locator('.editeur')).toBeVisible()
    await page.locator('[data-onglet="anon"]').click()
    const declaration = page.locator('.ligne-anon.etat-entretien', { hasText: 'Nom sans occurrence' })
    await expect(declaration).toBeVisible()
    await expect(declaration.locator('.pseudo-anon')).toHaveValue('Claire / Rebecca')
    await retourCorpus(page)
    await expect.poll(async () => page.evaluate(async () => {
      const data = await window.sonal.corpus.lireEntretien('e1')
      return data.ok ? data.data.definitionsAnonLocales?.length : -1
    })).toBe(2)
  } finally { await app.close() }
})

test('la sélection alimente une ligne et le brouillon survit au changement d’onglet', async () => {
  const { app, page } = await ouvrir('sonal-anon-brouillon-')

  await page.locator('[data-onglet="anon"]').click()
  await selectionner(page, 'Lyon')
  await page.locator('.editeur').dispatchEvent('mouseup')

  const saisie = page.locator('.ligne-anon.saisie-anon').first()
  await expect(saisie.locator('.nom-saisie')).toHaveValue('Lyon')
  await saisie.locator('.pseudo-anon').fill('Ville témoin')

  await page.locator('[data-onglet="notes"]').click()
  await page.locator('[data-onglet="anon"]').click()
  const brouillon = page.locator('.ligne-anon.etat-brouillon', { hasText: 'Lyon' })
  await expect(brouillon).toBeVisible()
  await expect(brouillon.locator('.pseudo-anon')).toHaveValue('Ville témoin')

  await app.close()
})

test('la bascule Original / Comparer / Pseudonymisé n’apparaît qu’après une validation', async () => {
  const { app, page } = await ouvrir('sonal-anon-bascule-')
  const bascule = page.locator('.groupe-affichage-noms')

  // Avant toute validation, la pseudonymisation n'a rien à montrer : la bascule
  // des vues du texte reste masquée dans la barre d'outils.
  await expect(bascule).toHaveCount(0)

  // Valider une ligne (« Lyon » → « Ville témoin ») : les occurrences sont posées
  // au modèle, la bascule apparaît (vue « Comparer » par défaut).
  await page.locator('[data-onglet="anon"]').click()
  await selectionner(page, 'Lyon')
  await page.locator('.editeur').dispatchEvent('mouseup')
  const saisie = page.locator('.ligne-anon.saisie-anon').first()
  await expect(saisie.locator('.nom-saisie')).toHaveValue('Lyon')
  await saisie.locator('.pseudo-anon').fill('Ville témoin')
  await saisie.locator('.pseudo-anon').press('Enter')
  await expect(bascule).toBeVisible()
  await expect(bascule.locator('button', { hasText: 'Comparer' })).toHaveClass(/actif/)

  await app.close()
})

test('les pseudos des locuteurs rendent la bascule disponible même sans annotation du texte', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-anon-bascule-locuteurs-')
  try {
    await page.evaluate(() => localStorage.setItem('sonalpi.entretien.affichageNoms', 'original'))
    await page.reload()
    await entrerCorpus(page)
    await entrerEntretien(page)
    const bascule = page.locator('.groupe-affichage-noms')
    await expect(bascule).toHaveCount(0)
    await page.locator('[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    const pseudo = page.locator('.liste-loc .pseudo-loc').nth(1)
    await pseudo.fill('Nadia')
    await pseudo.press('Tab')
    await page.getByRole('button', { name: 'Fermer la gestion des locuteurs', exact: true }).click()
    await expect(bascule).toBeVisible()
    const pseudoAffiche = page.locator('.editeur .loc-pseudo').first()
    await expect(pseudoAffiche).toBeHidden()
    await bascule.getByRole('button', { name: 'Comparer', exact: true }).click()
    await expect(pseudoAffiche).toBeVisible()
    await expect(pseudoAffiche).toHaveText('[Nadia]')
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    await pseudo.fill('')
    await pseudo.press('Tab')
    await expect(bascule).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('l’avis Original attend une application effective du pseudo', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-anon-avis-original-')
  try {
    await page.evaluate(() => localStorage.setItem('sonalpi.entretien.affichageNoms', 'original'))
    await page.reload()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await expect(page.locator('.colonne-droite')).toHaveClass(/noms-original/)
    await page.locator('[data-onglet="anon"]').click()
    const saisie = page.locator('.ligne-anon.saisie-anon').first()
    const avis = page.getByRole('dialog', { name: 'Pseudonymisation posée', exact: true })
    await saisie.locator('.nom-saisie').fill('Entité absente de cet entretien')
    await saisie.locator('.pseudo-anon').fill('Pseudo absent')
    await saisie.locator('.pseudo-anon').press('Enter')
    await expect.poll(() => page.evaluate(async () =>
      (await window.sonal.corpus.reglesAnon()).some((regle) => regle.entite.includes('Entité absente de cet entretien')),
    )).toBe(true)
    await expect(avis).toHaveCount(0)
    await saisie.locator('.nom-saisie').fill('Lyon')
    await saisie.locator('.pseudo-anon').fill('Ville témoin')
    await saisie.locator('.pseudo-anon').press('Enter')
    await expect(avis).toBeVisible()
    await avis.getByRole('button', { name: 'Passer en « Comparer »', exact: true }).click()
    await expect(page.locator('.groupe-affichage-noms button.actif')).toHaveText('Comparer')
    await expect(avis).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('la sélection ne remplit une ligne que si l’option est activée', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-anon-selection-option-'))
  let app = await lancer(dir)
  try {
    let page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await page.locator('[data-onglet="anon"]').click()
    let option = page.getByRole('switch', { name: 'Ajouter automatiquement le texte sélectionné' })
    let etat = page.locator('.selection-option-etat')
    await expect(option).toBeChecked()
    await expect(etat).toHaveText('Activé')
    await option.uncheck()
    await expect(etat).toHaveText('Désactivé')
    let editeur = page.locator('.colonne-droite .editeur')
    await expect(page.locator('.colonne-droite')).not.toHaveClass(/selection-pseudo-active/)
    expect(await editeur.evaluate((el) => getComputedStyle(el).cursor)).toBe('auto')

    await app.close()
    app = await lancer(dir, { preserverSettings: true })
    page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await page.locator('[data-onglet="anon"]').click()
    option = page.getByRole('switch', { name: 'Ajouter automatiquement le texte sélectionné' })
    etat = page.locator('.selection-option-etat')
    editeur = page.locator('.colonne-droite .editeur')
    await expect(option).not.toBeChecked()
    await expect(etat).toHaveText('Désactivé')
    await expect(page.locator('.colonne-droite')).not.toHaveClass(/selection-pseudo-active/)

    await selectionner(page, 'Lyon')
    await page.locator('.editeur').dispatchEvent('mouseup')
    const nom = page.locator('.ligne-anon.saisie-anon .nom-saisie').first()
    await expect(nom).toHaveValue('')

    await option.check()
    await expect(page.locator('.colonne-droite')).toHaveClass(/selection-pseudo-active/)
    expect(await editeur.evaluate((el) => getComputedStyle(el).cursor)).toContain('url(')
    await selectionner(page, 'Lyon')
    await page.locator('.editeur').dispatchEvent('mouseup')
    await expect(nom).toHaveValue('Lyon')
  } finally {
    if (app) await app.close()
  }
})

test('round-trip anonymisation : import → export → ré-import, règles corpus préservées sans doublon', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-anon-'))
  const out1 = join(dir, 'anon-1.sonal')
  const out2 = join(dir, 'anon-2.sonal')

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  // Dialogs — ÉTAPE 1 : import → fixture, export → out1.
  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.fixture] })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: args.out })
  }, { fixture: FIXTURE, out: out1 })

  // --- IMPORT de la fixture anonymisée ---
  await ajouterParModale(page, ['texte'])
  await expect(page.locator('.editeur')).toContainText('accepté cet entretien', { timeout: 10_000 })
  // Les occurrences anon (barrées) et l'exception sont décorées dans le texte.
  await expect(page.locator('.editeur .anon').first()).toBeVisible()
  await expect(page.locator('.editeur .anon-exception').first()).toBeVisible()

  // --- EXPORT --- (l'entretien est ouvert → bouton « Exporter .sonal »)
  await page.locator('.exporter').click()
  // Fenêtre d'export en deux étapes : format `.sonal`, puis bouton Exporter.
  await page.locator('.ligne-format', { hasText: '.sonal' }).click()
  await page.locator('.actions .exporter').click()
  await expect.poll(() => existsSync(out1), { timeout: 10_000 }).toBe(true)
  const exporte = readFileSync(out1, 'utf8')
  expect(exporte).toContain('contenuText')
  expect(exporte).toContain('class="anon') // le span barré est re-sérialisé
  expect(exporte).toContain('anon-exception') // l'exception survit
  expect(exporte).toContain('"portee":"corpus"') // la règle corpus est ré-émise

  // --- Compte des règles après le 1ᵉʳ import (référence anti-doublon) ---
  await retourCorpus(page)
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
  await expect(page.locator('.pseudo-panneau')).toBeVisible()
  const nbAvant = await page.locator('.pseudo-table tbody tr').count()
  expect(nbAvant).toBeGreaterThanOrEqual(1)
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Accueil' }).click()

  // --- RÉ-IMPORT du .sonal exporté (2ᵉ entretien, même corpus) ---
  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.fixture] })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: args.out })
  }, { fixture: out1, out: out2 })
  await ajouterParModale(page, ['texte'])
  await expect(page.locator('.editeur')).toContainText('accepté cet entretien', { timeout: 10_000 })
  await expect(page.locator('.editeur .anon').first()).toBeVisible()

  // --- VÉRIF d'absence de doublon : onglet Pseudonymisation → même nombre de lignes ---
  await retourCorpus(page)
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
  await expect(page.locator('.pseudo-panneau')).toBeVisible()
  await expect
    .poll(async () => page.locator('.pseudo-table tbody tr').count(), { timeout: 10_000 })
    .toBe(nbAvant)
  // L'entité « Karine » (règle de la fixture) n'apparaît qu'une seule fois.
  await expect(page.locator('.pseudo-table tbody tr', { hasText: 'Karine' })).toHaveCount(1)

  await app.close()
})
