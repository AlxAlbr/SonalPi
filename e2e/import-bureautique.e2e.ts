import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, ajouterParModale, retourCorpus } from './util'
import { docxTexte, pdfTexte } from '../test/fixtures/transcriptionsBureautiques'

const lignes = [
  'Enquêteur : Depuis quand êtes-vous bénévole ?',
  'Bénévole : Depuis cinq ans.',
]

async function deposer(page: Page, nom: string, octets: Buffer): Promise<void> {
  const donnees = await page.evaluateHandle(({ nom, octets }) => {
    const transfert = new DataTransfer()
    transfert.items.add(new File([new Uint8Array(octets)], nom))
    return transfert
  }, { nom, octets: [...octets] })
  try {
    await page.locator('.zone-texte').dispatchEvent('drop', { dataTransfer: donnees })
  } finally {
    await donnees.dispose()
  }
}

for (const extension of ['docx', 'pdf']) {
  for (const entree of ['sélecteur', 'glisser-déposer']) {
    test(`Word/PDF : ${extension} par ${entree}, texte et locuteurs conservés`, async () => {
      const racine = mkdtempSync(join(tmpdir(), 'sonal-import-bureau-'))
      const profil = join(racine, 'profil')
      const nom = `Entretien.${extension}`
      const octets = extension === 'docx' ? await docxTexte(lignes) : pdfTexte(lignes.map((l) => [l]))
      const source = join(racine, nom)
      writeFileSync(source, octets)
      const app = await lancer(profil, { executablePath: process.env.IMPORT_E2E_EXECUTABLE })
      try {
        const page = await app.firstWindow()
        await entrerCorpus(page)
        if (entree === 'sélecteur') {
          await app.evaluate(({ dialog }, { source, extension }) => {
            dialog.showOpenDialog = async (...args: unknown[]) => {
              const options = args.at(-1) as Electron.OpenDialogOptions
              if (!options.filters?.some((f) => f.extensions.includes(extension))) throw new Error('Format absent du sélecteur')
              return { canceled: false, filePaths: [source] }
            }
          }, { source, extension })
          await ajouterParModale(page, ['texte'])
        } else {
          await page.locator('.ajout-ent').click()
          await deposer(page, nom, octets)
          await expect(page.locator('.zone-texte .zone-fichier')).toHaveText(nom)
          await page.locator('.modale-ajout .valider').click()
        }
        await expect(page.locator('.entretien-ecran')).toBeVisible()
        await expect(page.locator('.editeur')).toContainText('Depuis quand êtes-vous bénévole')
        await expect(page.locator('.editeur')).toContainText('Depuis cinq ans')
        await expect(page.locator('.tete .etat')).toHaveText('à jour')
        expect(readFileSync(source)).toEqual(octets)
        const corpus = JSON.parse(readFileSync(join(profil, 'corpus/corpus.json'), 'utf8'))
        const id = Object.keys(corpus.membership).find((id) => corpus.membership[id].titre === 'Entretien')!
        const sauvegarde = JSON.parse(readFileSync(join(profil, 'corpus/entretiens', `${id}.json`), 'utf8'))
        expect(sauvegarde.locuteurs.map((l: { nom: string }) => l.nom)).toEqual(['Enquêteur', 'Bénévole'])
        await retourCorpus(page)
        await expect(page.locator('.carte-ent')).toHaveCount(2)
        await page.locator('.carte-ent').filter({ hasText: 'Entretien' }).nth(1).locator('.crayon').click()
        await expect(page.locator('.editeur')).toContainText('Depuis cinq ans')
        if (process.env.IMPORT_E2E_EXECUTABLE) {
          expect(await app.evaluate(({ app: application }) => application.isPackaged)).toBe(true)
        }
      } finally {
        await app.close()
      }
    })
  }
}

test('une erreur de lecture ne crée pas d’entretien et un autre document peut être choisi', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-import-bureau-erreur-'))
  const app = await lancer(join(racine, 'profil'), { executablePath: process.env.IMPORT_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.locator('.ajout-ent').click()
    for (const extension of ['docx', 'pdf']) {
      await deposer(page, `Invalide.${extension}`, Buffer.from('Document invalide'))
      await expect(page.locator('.msg-ajout')).toContainText('Impossible de lire ce document')
      await expect(page.locator('.msg-ajout')).not.toContainText('Error invoking')
      await expect(page.locator('.modale-ajout .valider')).toBeDisabled()
      await expect(page.locator('.carte-ent')).toHaveCount(1)
    }
    await deposer(page, 'Vide.pdf', pdfTexte([[]]))
    await expect(page.locator('.msg-ajout')).toContainText('ne contient pas de texte')
    await expect(page.locator('.modale-ajout .valider')).toBeDisabled()
    await deposer(page, 'Valide.docx', await docxTexte(lignes))
    await expect(page.locator('.zone-texte .zone-fichier')).toHaveText('Valide.docx')
    await expect(page.locator('.msg-ajout')).not.toBeVisible()
    await page.locator('.modale-ajout .valider').click()
    await expect(page.locator('.editeur')).toContainText('Depuis cinq ans')
    await expect(page.locator('.carte-ent')).toHaveCount(2)
  } finally {
    await app.close()
  }
})
