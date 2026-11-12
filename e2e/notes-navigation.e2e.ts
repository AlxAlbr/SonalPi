import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CorpusFichier, EntretienFichier, Note } from '../src/shared/format'
import { ecrireSeedDemo, entrerCorpus, lancer } from './util'

function preparerNotes(sansResume = false): string {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-notes-navigation-'))
  const corpusDir = join(dir, 'corpus')
  ecrireSeedDemo(corpusDir)
  const corpus: CorpusFichier = JSON.parse(readFileSync(join(corpusDir, 'corpus.crp'), 'utf8'))
  const entretien: EntretienFichier = JSON.parse(readFileSync(join(corpusDir, 'entretiens/e1.json'), 'utf8'))
  const note = (id: string, annee: number, date: string, resume: boolean, rang: number): Note => ({
    id, titre: id, categorieId: resume ? 'ncat_resume' : 'ncat_generale', date,
    statut: 'public', corps: '<p>Note de test</p>', locuteurIds: [], rang,
    creeLe: `${annee}-01-01T12:00:00.000Z`, modifieLe: null,
  })
  entretien.notes = [
    note('Ancienne', 2024, '2030-01-01', true, 0),
    note('Récente', 2026, '2000-01-01', false, 1),
  ]
  const autre: EntretienFichier = { ...entretien, notes: [note('Intermédiaire', 2025, '2028-01-01', true, 0)] }
  corpus.membership.e2 = { ...corpus.membership.e1!, titre: 'Autre entretien' }
  if (sansResume) corpus.categoriesNote = [{ id: 'ncat_generale', nom: 'générale', couleur: '#81c784' }]
  writeFileSync(join(corpusDir, 'corpus.crp'), JSON.stringify(corpus))
  writeFileSync(join(corpusDir, 'entretiens/e1.json'), JSON.stringify(entretien))
  writeFileSync(join(corpusDir, 'entretiens/e2.json'), JSON.stringify(autre))
  return dir
}

test('Notes : accès rapides visibles, filtres et ordre indépendants', async () => {
  const app = await lancer(preparerNotes())
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Notes', exact: true }).click()
    const notes = page.locator('.notes-corpus')
    const panneau = notes.locator('.filtres-notes')
    const titres = notes.locator('.tableau-notes tbody tr td:first-child')
    const toutes = panneau.getByRole('button', { name: 'Toutes les notes', exact: true })
    const resumes = panneau.getByRole('button', { name: 'Résumés', exact: true })
    const recentes = panneau.getByRole('button', { name: 'Plus récentes d’abord', exact: true })
    const parEntretien = panneau.getByRole('button', { name: 'Par entretien', exact: true })
    await expect(toutes).toHaveAttribute('aria-pressed', 'true')
    await expect(recentes).toHaveAttribute('aria-pressed', 'true')
    await expect(titres).toHaveText(['Récente', 'Intermédiaire', 'Ancienne'])
    await expect(panneau.locator('.aide-notes')).toHaveText('Date de création · Plus récentes d’abord.')
    await expect(panneau.locator('.filtres-detailles')).not.toHaveAttribute('open', '')
    const visibleSansDefiler = await resumes.evaluate((el) => {
      const panneau = el.closest('.filtres-notes')!
      return el.getBoundingClientRect().bottom <= panneau.getBoundingClientRect().bottom
    })
    expect(visibleSansDefiler).toBe(true)

    await resumes.click()
    await expect(resumes).toHaveAttribute('aria-pressed', 'true')
    await expect(toutes).toHaveAttribute('aria-pressed', 'false')
    await expect(titres).toHaveText(['Intermédiaire', 'Ancienne'])
    await expect(panneau.locator('.filtres-detailles > summary')).toHaveText('Filtres détaillés (1)')
    await parEntretien.click()
    await expect(resumes).toHaveAttribute('aria-pressed', 'true')
    await expect(parEntretien).toHaveAttribute('aria-pressed', 'true')
    await toutes.click()
    await expect(parEntretien).toHaveAttribute('aria-pressed', 'true')
    await expect(titres).toHaveText(['Intermédiaire', 'Ancienne', 'Récente'])

    await panneau.getByPlaceholder('Titre, corps, catégorie…').fill('Ancienne')
    await recentes.click()
    await expect(titres).toHaveText(['Ancienne'])
    await expect(toutes).toHaveAttribute('aria-pressed', 'false')
    await toutes.click()
    await expect(titres).toHaveText(['Récente', 'Intermédiaire', 'Ancienne'])

    await panneau.locator('.autre-tri > summary').click()
    await panneau.getByLabel('Trier par', { exact: true }).selectOption('date')
    await panneau.getByLabel('Sens', { exact: true }).selectOption('asc')
    await expect(titres).toHaveText(['Récente', 'Intermédiaire', 'Ancienne'])
    await expect(recentes).toHaveAttribute('aria-pressed', 'false')
    await expect(panneau.locator('.aide-notes')).toHaveText('Date de la note · Plus anciennes d’abord.')

    await panneau.locator('.filtres-detailles > summary').click()
    await panneau.getByLabel('Passages importants', { exact: true }).check()
    await expect(titres).toHaveCount(0)
    await panneau.locator('.filtres-detailles > summary').click()
    await expect(panneau.locator('.filtres-detailles > summary')).toHaveText('Filtres détaillés (1)')
    await toutes.click()
    await expect(titres).toHaveCount(3)
    await notes.getByRole('button', { name: 'Masquer les filtres', exact: true }).click()
    await expect(notes.locator('.barre-onglet h2')).toHaveText('Notes')
    await notes.getByRole('button', { name: 'Afficher les filtres', exact: true }).click()
    await expect(toutes).toHaveAttribute('aria-pressed', 'true')
  } finally {
    await app.close()
  }
})

test('Notes : le raccourci Résumés est désactivé sans catégorie résumé', async () => {
  const app = await lancer(preparerNotes(true))
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Notes', exact: true }).click()
    await expect(page.locator('.notes-corpus').getByRole('button', { name: 'Résumés', exact: true })).toBeDisabled()
  } finally {
    await app.close()
  }
})
