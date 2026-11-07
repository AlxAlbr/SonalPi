import { test, expect } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import { ecrireSeedDemo, entrerCorpus, entrerDonnees, lancer } from './util'
import { lireCsvDonnees } from '../test/fixtures/lireCsvDonnees'

function preparer() {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-export-csv-'))
  const profil = join(racine, 'profil')
  const dossier = join(profil, 'corpus')
  ecrireSeedDemo(dossier)
  const corpusFile = join(dossier, 'corpus.crp')
  const premierFile = join(dossier, 'entretiens/e1.json')
  const secondFile = join(dossier, 'entretiens/e2.json')
  const corpus = JSON.parse(readFileSync(corpusFile, 'utf8')) as CorpusFichier
  corpus.variables = {
    v1: { id: 'v1', lib: 'Lieu', portee: 'entretien', priv: false, ordre: 0, vExport: 1, modalites: [{ id: 'm1', lib: 'À Lyon; "Centre"\nassociation', mExport: 1 }] },
    v2: { id: 'v2', lib: 'Ancienneté', portee: 'locuteur', priv: false, ordre: 1, vExport: 2, modalites: [{ id: 'm2', lib: 'Depuis 2012', mExport: 1 }] },
    v3: { id: 'v3', lib: 'Contact privé', portee: 'entretien', priv: true, ordre: 2, vExport: 3, modalites: [{ id: 'm3', lib: 'secret@example.test', mExport: 1 }] },
    v4: { id: 'v4', lib: 'À masquer', portee: 'entretien', priv: false, ordre: 3, vExport: 4, modalites: [{ id: 'm4', lib: 'Ne pas exporter', mExport: 1 }] },
  }
  const premier = JSON.parse(readFileSync(premierFile, 'utf8')) as EntretienFichier
  premier.meta.valeursGen = { v1: 'm1', v3: 'm3', v4: 'm4' }
  premier.locuteurs[1].valeursLoc = { v2: 'm2' }
  const second = structuredClone(premier)
  second.meta.valeursGen = {}
  second.locuteurs = []
  corpus.membership.e2 = { titre: '=1+1', date: null, lastModified: second.lastModified }
  corpus.ordreEntretiens = ['e1', 'e2']
  writeFileSync(corpusFile, JSON.stringify(corpus))
  writeFileSync(premierFile, JSON.stringify(premier))
  writeFileSync(secondFile, JSON.stringify(second))
  return { racine, profil, corpusFile, premierFile, secondFile }
}

test('CSV : colonnes visibles, privé sur choix explicite, annulation et corpus intact', async () => {
  const b = preparer()
  const app = await lancer(b.profil, { executablePath: process.env.DONNEES_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerDonnees(page)
    const sources = [b.corpusFile, b.premierFile, b.secondFile].map((f) => readFileSync(f, 'utf8'))
    await page.locator('.ligne-variable').filter({ hasText: 'À masquer' }).locator('input').uncheck()
    await page.locator('.recherche-variable input').fill('Lieu')
    await page.getByRole('button', { name: 'Exporter CSV…', exact: true }).click()
    const dialogue = page.getByRole('dialog', { name: 'Exporter la table en CSV' })
    await expect(dialogue.getByRole('checkbox')).not.toBeChecked()
    await expect(dialogue).toContainText('2 variable(s) à exporter')
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await dialogue.screenshot({ path: 'docs/user/medias/export-donnees.png' })
    }
    await dialogue.getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(dialogue).toHaveCount(0)

    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' })
    })
    await page.getByRole('button', { name: 'Exporter CSV…', exact: true }).click()
    await dialogue.getByRole('button', { name: 'Exporter CSV', exact: true }).click()
    await expect(dialogue.getByRole('button', { name: 'Exporter CSV', exact: true })).toBeEnabled()
    await expect(page.locator('.message-export')).toHaveCount(0)
    const fichier = join(b.racine, 'public.csv')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, fichier)
    await dialogue.getByRole('button', { name: 'Exporter CSV', exact: true }).click()
    await expect(page.locator('.message-export')).toHaveText('Fichier CSV enregistré.')
    const csv = readFileSync(fichier, 'utf8')
    const lignes = lireCsvDonnees(csv)
    expect(lignes[0]).toEqual(['Entretien', 'Type de ligne', 'Locuteur', 'Lieu (entretien)', 'Ancienneté (locuteur)'])
    expect(lignes).toHaveLength(5)
    expect(lignes[1][3]).toBe('À Lyon; "Centre"\nassociation')
    expect(lignes.some((l) => l[4] === 'Depuis 2012' && l[2] === 'Karine')).toBe(true)
    expect(lignes.at(-1)?.[0]).toBe("'=1+1")
    for (const secret of ['Contact privé', 'secret@example.test', 'À masquer', 'Ne pas exporter']) expect(csv).not.toContain(secret)

    await page.locator('.recherche-variable input').fill('')
    await page.getByRole('button', { name: 'Tout masquer', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Exporter CSV…', exact: true })).toBeDisabled()
    await page.locator('.ligne-variable').filter({ hasText: 'Contact privé' }).locator('input').check()
    await page.getByRole('button', { name: 'Exporter CSV…', exact: true }).click()
    await expect(dialogue.getByRole('button', { name: 'Exporter CSV', exact: true })).toBeDisabled()
    await dialogue.getByRole('checkbox').check()
    await expect(dialogue).toContainText('Ce fichier contiendra les réponses des variables privées')
    const prive = join(b.racine, 'prive.csv')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, prive)
    await dialogue.getByRole('button', { name: 'Exporter CSV', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    expect(readFileSync(prive, 'utf8')).toContain('secret@example.test')

    await page.locator('.filtre-portee').getByRole('button', { name: 'entretien', exact: true }).click()
    await page.locator('.ligne-variable').filter({ hasText: 'Lieu' }).locator('input').check()
    await page.getByRole('button', { name: 'Exporter CSV…', exact: true }).click()
    await expect(dialogue.getByRole('checkbox')).not.toBeChecked()
    await dialogue.getByRole('button', { name: 'Exporter CSV', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    const entretiens = lireCsvDonnees(readFileSync(prive, 'utf8'))
    expect(entretiens).toHaveLength(3)
    expect(entretiens.slice(1).every((l) => l[1] === 'Entretien')).toBe(true)
    expect(readFileSync(prive, 'utf8')).not.toContain('secret@example.test')
    expect([b.corpusFile, b.premierFile, b.secondFile].map((f) => readFileSync(f, 'utf8'))).toEqual(sources)
  } finally {
    await app.close()
  }
})

test('CSV : la saisie libre juste avant l’export est enregistrée et reprise dans le fichier', async () => {
  const b = preparer()
  const app = await lancer(b.profil, { executablePath: process.env.DONNEES_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerDonnees(page)
    const ligne = page.locator('.matrice tbody tr').filter({ has: page.locator('.ligne-ent') }).first()
    await ligne.locator('select').first().selectOption({ label: 'autre…' })
    await ligne.locator('.cell-libre').fill('Nouvelle réponse avant export')
    const fichier = join(b.racine, 'saisie.csv')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, fichier)
    await page.getByRole('button', { name: 'Exporter CSV…', exact: true }).click()
    const dialogue = page.getByRole('dialog', { name: 'Exporter la table en CSV' })
    await dialogue.getByRole('button', { name: 'Exporter CSV', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    expect(lireCsvDonnees(readFileSync(fichier, 'utf8'))[1][3]).toBe('Nouvelle réponse avant export')
  } finally {
    await app.close()
  }
})

test('CSV : une source absente, une réponse inconnue ou une lecture en échec bloquent le fichier', async () => {
  const b = preparer()
  const original = readFileSync(b.secondFile, 'utf8')
  const app = await lancer(b.profil, { executablePath: process.env.DONNEES_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerDonnees(page)
    const fichier = join(b.racine, 'bloque.csv')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, fichier)
    unlinkSync(b.secondFile)
    await page.getByRole('button', { name: 'Exporter CSV…', exact: true }).click()
    const dialogue = page.getByRole('dialog', { name: 'Exporter la table en CSV' })
    const bouton = dialogue.getByRole('button', { name: 'Exporter CSV', exact: true })
    await bouton.click()
    await expect(dialogue.getByRole('alert')).toContainText('Certains entretiens sont indisponibles')
    expect(existsSync(fichier)).toBe(false)
    const invalide = JSON.parse(original) as EntretienFichier
    invalide.meta.valeursGen.v1 = 'inconnue'
    writeFileSync(b.secondFile, JSON.stringify(invalide))
    await bouton.click()
    await expect(dialogue.getByRole('alert')).toContainText('modalités disponibles')
    expect(existsSync(fichier)).toBe(false)
    writeFileSync(b.secondFile, '{invalide')
    await bouton.click()
    await expect(dialogue.getByRole('alert')).toContainText('Impossible d’actualiser les données')
    expect(existsSync(fichier)).toBe(false)
    writeFileSync(b.secondFile, original)
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, b.racine)
    await bouton.click()
    await expect(dialogue.getByRole('alert')).toHaveText('Impossible d’enregistrer le fichier CSV. Choisissez un autre emplacement.')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, fichier)
    await bouton.click()
    await expect(dialogue).toHaveCount(0)
    expect(lireCsvDonnees(readFileSync(fichier, 'utf8'))).toHaveLength(5)
  } finally {
    await app.close()
  }
})
