import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { entrerEntretien, fermerAiguillage, ouvrirAnalyse, ouvrirPreparation, ouvrirSurCorpus } from './util'

/** Les changements d'espace conservent le travail ; ceux de corpus le réinitialisent. */
test('les brouillons du tableau survivent aux changements d’onglet et d’espace', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-espaces-brouillons-')
  try {
    await ouvrirPreparation(page)
    const ligne = page.getByPlaceholder('Nom de la ligne…')
    const colonne = page.getByPlaceholder('Nom de la colonne…')
    const badge = page.getByPlaceholder('Nom du badge…')
    await ligne.fill('À planifier')
    await colonne.fill('À vérifier')
    await badge.fill('À discuter')
    await page.locator('.choix-traversante input').check()

    await page.locator('[data-tour="ouvrir-docs-cadre"]').click()
    await page.locator('[data-tour="ouvrir-tableau-bord"]').click()
    await expect(ligne).toHaveValue('À planifier')
    await expect(colonne).toHaveValue('À vérifier')
    await expect(badge).toHaveValue('À discuter')
    await expect(page.locator('.choix-traversante input')).toBeChecked()

    await page.locator('[data-tour="ouvrir-analyser"]').click()
    await page.locator('[data-tour="ouvrir-preparer"]').click()
    await expect(ligne).toHaveValue('À planifier')
    await expect(colonne).toHaveValue('À vérifier')
    await expect(badge).toHaveValue('À discuter')
    await expect(page.locator('.choix-traversante input')).toBeChecked()
  } finally {
    await app.close()
  }
})

test('le retour par la barre relit les documents et conserve la sélection entre outils', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-espaces-documents-')
  try {
    await ouvrirPreparation(page, 'docs-cadre')
    const userDataDir = await app.evaluate(({ app: application }) => application.getPath('userData'))
    const dossier = join(userDataDir, 'corpus', 'DocsPrepaProjet')
    mkdirSync(dossier, { recursive: true })
    await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()
    writeFileSync(join(dossier, 'Suivi.txt'), 'Document de suivi')

    // L'entrée principale seule doit découvrir le fichier ajouté pendant l'absence.
    await page.locator('[data-tour="ouvrir-preparer"]').click()
    const document = page.locator('.cote-docs .document', { hasText: 'Suivi.txt' })
    await expect(document).toBeVisible()
    await document.click()
    await expect(page.locator('.panneau-docs .texte-echappe')).toContainText('Document de suivi')

    for (const outil of ['synthese', 'lexico', 'analyses-croisees'] as const) {
      await ouvrirAnalyse(page, outil)
      await page.locator('[data-tour="ouvrir-preparer"]').click()
      await expect(document).toHaveClass(/choisi/)
      await expect(page.locator('.panneau-docs .texte-echappe')).toContainText('Document de suivi')
    }

    await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()
    writeFileSync(join(dossier, 'Suivi.txt'), 'Document actualisé')
    await page.locator('[data-tour="ouvrir-preparer"]').click()
    await expect(document).toHaveClass(/choisi/)
    await expect(page.locator('.panneau-docs .texte-echappe')).toContainText('Document actualisé')

    await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()
    rmSync(join(dossier, 'Suivi.txt'))
    await page.locator('[data-tour="ouvrir-preparer"]').click()
    await expect(document).toHaveCount(0)
    await expect(page.locator('.panneau-docs')).toContainText('Choisissez un document du projet dans la liste.')
  } finally {
    await app.close()
  }
})

test('reprendre Lexico par la barre actualise l’index devenu périmé', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-espaces-index-')
  try {
    await entrerEntretien(page)
    await ouvrirAnalyse(page, 'lexico')
    const panneau = page.locator('.panneau-lexico')
    await expect(panneau.locator('.table-wrap tbody tr').first()).toBeVisible()
    await page.locator('.cote-lexico').getByRole('checkbox', { name: 'Inclure les paroles des enquêteurs' }).check()
    await panneau.getByLabel('Rechercher une forme').fill('motnavigationtest')
    await expect(panneau.locator('.table-wrap tbody tr')).toHaveCount(0)

    await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()
    await page.locator('.editeur').press('Control+End')
    await page.keyboard.insertText(' motnavigationtest ')
    await expect(page.locator('.editeur')).toContainText('motnavigationtest')
    await expect(page.locator('h1 .etat')).toHaveText('à jour')

    await page.locator('[data-tour="ouvrir-analyser"]').click()
    await expect(panneau.getByLabel('Rechercher une forme')).toHaveValue('motnavigationtest')
    await expect(panneau.locator('.table-wrap tbody tr')).toContainText('motnavigationtest')
  } finally {
    await app.close()
  }
})

test('un autre corpus ne reprend ni brouillon du tableau ni sélection ou édition Lexico', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-espaces-corpus-')
  try {
    await ouvrirPreparation(page)
    await page.getByPlaceholder('Nom de la ligne…').fill('Ligne du corpus précédent')
    await ouvrirAnalyse(page, 'lexico')
    const panneau = page.locator('.panneau-lexico')
    await expect(panneau.locator('.table-wrap tbody tr').first()).toBeVisible()
    await panneau.locator('.table-wrap tbody tr input[type="checkbox"]').first().check()
    await panneau.getByRole('button', { name: 'Regrouper / lemmatiser', exact: true }).click()
    await panneau.getByLabel('Forme de regroupement').fill('Brouillon du premier corpus')
    await panneau.getByLabel('Rechercher une forme').fill('recherche précédente')

    // Une simple consultation garde bien le formulaire et sa sélection.
    await page.locator('[data-tour="ouvrir-preparer"]').click()
    await page.locator('[data-tour="ouvrir-analyser"]').click()
    await expect(panneau.getByLabel('Forme de regroupement')).toHaveValue('Brouillon du premier corpus')
    await expect(panneau.locator('.barre-selection')).toContainText('1 forme(s) sélectionnée(s)')

    const autreCorpus = mkdtempSync(join(tmpdir(), 'sonal-espaces-autre-'))
    new CorpusStore(autreCorpus).ouvrir()
    await app.evaluate(({ dialog }, dossier) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dossier] })
    }, join(autreCorpus, 'corpus.crp'))
    await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
    await page.locator('.ouvrir-corpus').click()
    await fermerAiguillage(page)
    await expect(page.locator('.espace-preparation')).toBeVisible()
    await page.locator('.barre-outils').getByRole('button', { name: 'Importer & Traiter', exact: true }).click()
    await expect(page.locator('.corpus-ecran')).toBeVisible()
    await expect(page.locator('.barre-outils').getByRole('button', { name: 'Importer & Traiter', exact: true }))
      .toHaveAttribute('aria-current', 'page')

    await page.locator('[data-tour="ouvrir-analyser"]').click()
    await expect(page.locator('.espace-analyse').getByRole('button', { name: 'Accueil', exact: true })).toHaveAttribute('aria-current', 'page')
    await ouvrirAnalyse(page, 'lexico')
    await expect(panneau.getByLabel('Rechercher une forme')).toHaveValue('')
    await expect(panneau.locator('.edition-regroupement')).toHaveCount(0)
    await expect(panneau.locator('.barre-selection')).toHaveCount(0)
    await ouvrirPreparation(page)
    await expect(page.getByPlaceholder('Nom de la ligne…')).toHaveValue('')
  } finally {
    await app.close()
  }
})
