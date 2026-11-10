import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { CorpusFichier } from '../src/shared/format'
import { lancer, entrerCorpus, ouvrirOrganisation } from './util'
import { ecrireSeedDemo } from '../test/seedDemo'

test.describe.configure({ mode: 'serial' })

/** Ajoute une source valide pour vérifier la sélection et les exports partiels. */
function ajouterEntretien(dirCorpus: string): void {
  const chemin = join(dirCorpus, 'corpus.json')
  const corpus = JSON.parse(readFileSync(chemin, 'utf8')) as CorpusFichier
  corpus.membership.e2 = { titre: 'Entretien deux', date: null, lastModified: new Date().toISOString() }
  writeFileSync(chemin, JSON.stringify(corpus, null, 2))
  mkdirSync(join(dirCorpus, 'entretiens'), { recursive: true })
  writeFileSync(join(dirCorpus, 'entretiens', 'e2.json'), JSON.stringify({
    formatVersion: 3,
    lastModified: new Date().toISOString(),
    corpsTexte: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Deuxième entretien de test.' }] }],
    },
    annotations: [], ancres: [],
    locuteurs: [{ index: 1, nom: 'Enquêteur', valeursLoc: {}, personneRef: null }],
    meta: { valeursGen: {}, audioRef: null },
  }), 'utf8')
}

function lister(dossier: string): string[] {
  return readdirSync(dossier).sort()
}

test('accueil harmonisé, réglages persistants et sélection vide sans modale', async ({}, testInfo) => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-org-')))
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.getByRole('button', { name: 'Organiser & Exporter', exact: true }).click()
    const nav = page.locator('.onglets-organisation')
    await expect(nav.getByRole('button', { name: 'Accueil', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(nav.locator('button img')).toHaveCount(4)
    await expect(page.locator('.accueil-organisation')).toBeVisible()
    await expect(page.locator('.cas-corpus')).toHaveCount(0)
    await page.locator('.accueil-organisation').getByRole('button', { name: /Exporter le corpus/ }).click()
    const espace = page.locator('.export-corpus')
    await expect(espace).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Exporter le corpus' })).toHaveCount(0)
    await espace.getByLabel('Tous les entretiens').uncheck()
    await expect(espace.locator('.actions .exporter')).toBeDisabled()
    await expect(espace.locator('.resultats-export')).toContainText('Cochez au moins un entretien')
    await espace.getByLabel('Tous les entretiens').check()
    await espace.getByLabel('Document combiné (.docx)', { exact: false }).check()
    await ouvrirOrganisation(page, 'recueils')
    await expect(page.locator('.liste-recueils')).toHaveCSS('background-color', 'rgb(250, 250, 254)')
    await ouvrirOrganisation(page, 'cas')
    await expect(page.locator('.repertoire-cas')).toHaveCSS('background-color', 'rgb(250, 250, 254)')
    await ouvrirOrganisation(page, 'export')
    await expect(espace.getByLabel('Document combiné (.docx)', { exact: false })).toBeChecked()
    const gauche = await espace.locator('.reglages-export').boundingBox()
    const droite = await espace.locator('.resultats-export').boundingBox()
    expect(gauche!.x + gauche!.width).toBeLessThan(droite!.x)
    await page.screenshot({ path: testInfo.outputPath('export-gauche-droite.png') })
    await page.setViewportSize({ width: 760, height: 700 })
    const haut = await espace.locator('.reglages-export').boundingBox()
    const bas = await espace.locator('.resultats-export').boundingBox()
    expect(haut!.y + haut!.height).toBeLessThanOrEqual(bas!.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  } finally {
    await app.close()
  }
})

test('export complet : fichier par entretien + index + DOCX combiné', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-exp-'))
  const destination = join(dir, 'sortie')
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await app.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination })
    }, destination)
    await ouvrirOrganisation(page, 'export')
    const espace = page.locator('.export-corpus')
    await expect(espace.getByLabel('Tous les entretiens')).toBeChecked()
    await expect(espace.locator('.ligne-entretien')).toHaveCount(1)
    await espace.getByLabel('Document combiné (.docx)', { exact: false }).check()
    await expect(espace.locator('.resultats-export')).toContainText('Document combiné (.docx)')
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.etape', { hasText: 'Export terminé' })).toBeVisible({ timeout: 20_000 })
    await expect(espace.locator('.resume-ligne', { hasText: 'Entretien Karine' })).toBeVisible()
    expect(lister(destination)).toEqual(['Entretien Karine_pseudonymise.txt', '_index.txt', 'corpus.docx'])
    expect(readFileSync(join(destination, 'Entretien Karine_pseudonymise.txt'), 'utf8')).toContain('Karine habite Lyon')
    const index = readFileSync(join(destination, '_index.txt'), 'utf8')
    expect(index).toContain('Nom du corpus : corpus')
    expect(index).toContain('1 entretien exporté.')
    expect(index).toContain('- Entretien Karine — 17 mots')
    expect(readFileSync(join(destination, 'corpus.docx')).subarray(0, 2).toString('ascii')).toBe('PK')
    await espace.getByRole('button', { name: 'Préparer un autre export' }).click()
    await expect(espace.getByLabel('Document combiné (.docx)', { exact: false })).toBeChecked()
    await expect(espace.locator('.recapitulatif-export')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('export QualCoder : projet .qda créé sans assistant modal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-qda-'))
  const destination = join(dir, 'projet.qda')
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await app.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination })
    }, destination)
    await ouvrirOrganisation(page, 'export')
    const espace = page.locator('.export-corpus')
    await espace.getByRole('radio', { name: 'Projet QualCoder (.qda)' }).check()
    await expect(espace.getByText('Aucun cas dans ce corpus.')).toBeVisible()
    await expect(espace.locator('.resultats-export')).toContainText('sans pseudonymisation')
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.etape', { hasText: 'Projet QualCoder créé' })).toBeVisible({ timeout: 20_000 })
    const base = new DatabaseSync(join(destination, 'data.qda'))
    try {
      expect(base.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
      expect(base.prepare('SELECT name FROM source').get()).toMatchObject({ name: 'Entretien Karine.txt' })
    } finally {
      base.close()
    }
  } finally {
    await app.close()
  }
})

test('sélection partielle, rapport invalidé après modification puis enregistré', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-exp2-'))
  ecrireSeedDemo(join(dir, 'corpus'))
  ajouterEntretien(join(dir, 'corpus'))
  const destination = join(dir, 'sortie')
  const cheminRapport = join(dir, 'rapport-corpus.txt')
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await app.evaluate(({ dialog }, args) => {
      let appel = 0
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: appel++ === 0 ? args.cheminRapport : args.destination })
    }, { destination, cheminRapport })
    await ouvrirOrganisation(page, 'export')
    const espace = page.locator('.export-corpus')
    await expect(espace.locator('.ligne-entretien')).toHaveCount(2)
    await espace.locator('.ligne-entretien', { hasText: 'Entretien deux' }).locator('input').uncheck()
    await espace.getByLabel('Consulter le rapport de pseudonymisation', { exact: false }).check()
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.rapport-contenu')).toContainText('Entretien Karine')
    await espace.getByLabel('Document combiné (.docx)', { exact: false }).check()
    await expect(espace.locator('.rapport-contenu')).toHaveCount(0)
    await expect(espace.locator('.recapitulatif-export')).toBeVisible()
    await espace.getByLabel('Document combiné (.docx)', { exact: false }).uncheck()
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.rapport-contenu')).toContainText('Entretien Karine')
    await ouvrirOrganisation(page, 'recueils')
    await ouvrirOrganisation(page, 'export')
    await expect(espace.locator('.rapport-contenu')).toHaveCount(0)
    await expect(espace.getByLabel('Consulter le rapport de pseudonymisation', { exact: false })).toBeChecked()
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.rapport-contenu')).toContainText('Entretien Karine')
    await espace.getByRole('button', { name: 'Enregistrer le rapport' }).click()
    await expect(espace.locator('.message-information')).toContainText('Rapport enregistré')
    await espace.getByRole('button', { name: /Lancer l’export/ }).click()
    await expect(espace.locator('.etape', { hasText: 'Export terminé' })).toBeVisible({ timeout: 20_000 })
    expect(lister(destination)).toEqual(['Entretien Karine_pseudonymise.txt', '_index.txt'])
    const index = readFileSync(join(destination, '_index.txt'), 'utf8')
    expect(index).toContain('1 entretien exporté.')
    expect(index).not.toContain('Entretien deux')
    const rapport = readFileSync(cheminRapport, 'utf8')
    expect(rapport).toContain('Entretien : Entretien Karine')
    expect(rapport).toContain('Rapport de pseudonymisation')
  } finally {
    await app.close()
  }
})

test('le menu ouvre l’outil et une destination annulée permet de reprendre les choix', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-exp-annule-')))
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await app.evaluate(({ app, BrowserWindow, dialog }) => {
      dialog.showSaveDialog = () => new Promise((resoudre) => {
        Object.assign(app, { annulerChoixExport: () => resoudre({ canceled: true, filePath: '' }) })
      })
      BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'exporter-corpus')
    })
    const espace = page.locator('.export-corpus')
    await expect(espace).toBeVisible()
    await expect(page.locator('.onglets-organisation button.actif')).toHaveAttribute('aria-label', 'Exporter le corpus')
    await espace.locator('.actions .exporter').click()
    await expect(page.locator('.app > header')).toHaveAttribute('inert', '')
    await expect(page.locator('.onglets-organisation')).toHaveAttribute('inert', '')
    await app.evaluate(({ app, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'nouveau-corpus')
      ;(app as typeof app & { annulerChoixExport: () => void }).annulerChoixExport()
    })
    await expect(espace.locator('.etape', { hasText: 'Export arrêté' })).toBeVisible()
    await expect(page.locator('.app > header')).not.toHaveAttribute('inert', '')
    await espace.getByRole('button', { name: 'Préparer un autre export' }).click()
    await expect(espace.getByLabel('Tous les entretiens')).toBeChecked()
    await expect(espace.locator('.actions .exporter')).toBeEnabled()
  } finally {
    await app.close()
  }
})

test('succès partiel : entretien cassé sauté, expliqué, absent de l’index', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-exp3-'))
  const dirCorpus = join(dir, 'corpus')
  ecrireSeedDemo(dirCorpus)
  ajouterEntretien(dirCorpus)
  const destination = join(dir, 'sortie')
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    // La source devient illisible après l'ouverture du corpus.
    writeFileSync(join(dirCorpus, 'entretiens', 'e2.json'), JSON.stringify({ formatVersion: 99 }))
    await app.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination })
    }, destination)
    await ouvrirOrganisation(page, 'export')
    const espace = page.locator('.export-corpus')
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.etape', { hasText: 'Export terminé' })).toBeVisible({ timeout: 20_000 })
    await expect(espace.locator('.resume-ligne.succes', { hasText: 'Entretien Karine' })).toBeVisible()
    await expect(espace.locator('.resume-ligne.echec', { hasText: 'Entretien deux' })).toBeVisible()
    await expect(espace.locator('.resume-ligne.echec')).toContainText('version')
    const index = readFileSync(join(destination, '_index.txt'), 'utf8')
    expect(index).toContain('1 entretien exporté.')
    expect(index).not.toContain('Entretien deux')
  } finally {
    await app.close()
  }
})
