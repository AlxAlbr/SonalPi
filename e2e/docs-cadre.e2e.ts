import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ouvrirPreparation, ouvrirSurCorpus } from './util'

function pdfMinimal(): Buffer {
  const contenu1 = 'BT /F1 18 Tf 40 120 Td (Apercu PDF page 1) Tj ET'
  const contenu2 = 'BT /F1 18 Tf 40 120 Td (Apercu PDF page 2) Tj ET'
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 180] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 180] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    `<< /Length ${contenu1.length} >>\nstream\n${contenu1}\nendstream`,
    `<< /Length ${contenu2.length} >>\nstream\n${contenu2}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const positions = [0]
  objets.forEach((objet, index) => {
    positions.push(Buffer.byteLength(pdf, 'ascii'))
    pdf += `${index + 1} 0 obj\n${objet}\nendobj\n`
  })
  const positionXref = Buffer.byteLength(pdf, 'ascii')
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`
  for (const position of positions.slice(1)) {
    pdf += `${String(position).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${positionXref}\n%%EOF\n`
  return Buffer.from(pdf, 'ascii')
}

/**
 *  Les documents du projet et les exemples occupent deux onglets distincts
 *  dans « Préparer et suivre ». Les aperçus restent fiables (texte brut),
 *  les actions locales toujours accessibles, et les exemples en lecture seule.
 */

test('onglets séparés, état vide et aperçu d’un exemple', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-docs-')

  // Les documents propres au corpus disposent de leur onglet et de leurs actions.
  await ouvrirPreparation(page, 'docs-cadre')
  const fenetre = page.locator('.espace-preparation')
  await expect(fenetre).toBeVisible()
  await expect(page.locator('[data-tour="ouvrir-docs-cadre"]')).toHaveAttribute('aria-current', 'page')
  await expect(fenetre.locator('.cote-docs .corpus-tete h3')).toHaveText('Documents du projet')
  await expect(fenetre.locator('.cote-preparation')).toContainText('Vous n’avez pas encore de document.')
  await expect(fenetre.locator('[data-tour="documents-exemples"]')).toBeHidden()


  // L'action ouvre directement le sous-dossier DocsCadre du corpus, et elle
  // est accessible dès l'état vide (défaut corrigé : elle vivait dans le
  // panneau droit, donc seulement avec une sélection).
  await app.evaluate(({ shell }) => {
    shell.openPath = async (chemin) => {
      process.env.SONAL_TEST_DOSSIER_OUVERT = chemin
      return ''
    }
  })
  await expect(fenetre.locator('.cote-preparation').getByRole('button', { name: 'Ouvrir le dossier' })).toBeVisible()
  await fenetre.locator('.cote-preparation').getByRole('button', { name: 'Ouvrir le dossier' }).click()
  await expect.poll(() => app.evaluate(() => process.env.SONAL_TEST_DOSSIER_OUVERT)).toContain('DocsCadre')
  await expect(fenetre.locator('.message-action')).toContainText('gestionnaire de fichiers')

  // Les exemples disposent de leur propre onglet et conservent leur ordre défini.
  await ouvrirPreparation(page, 'documents-exemples')
  await expect(page.locator('[data-tour="ouvrir-documents-exemples"]')).toHaveAttribute('aria-current', 'page')
  await expect(fenetre.locator('.cote-docs .corpus-tete h3')).toHaveText('Documents exemples')
  await expect(fenetre.locator('[data-tour="documents-exemples"] .document .nom')).toHaveText([
    'Déclaration traitement DPO.txt',
    'Notice de consentement DPO.txt',
    'Guide de correction.txt',
    'Guide de pseudonymisation.txt',
  ])
  await expect(fenetre.getByRole('button', { name: /Ajouter un fichier/ })).toHaveCount(0)

  // Aperçu d'un exemple embarqué : texte affiché tel quel.
  await fenetre.locator('.document', { hasText: 'Guide de correction.txt' }).click()
  await expect(fenetre.locator('.fiche-zone')).toContainText('Guide de correction.txt')
  await expect(fenetre.locator('.texte-echappe')).toContainText('À venir.')
  // Les exemples sont immuables : aucune mutation proposée.
  await expect(fenetre.locator('.fiche-zone')).not.toContainText('Renommer')
  await expect(fenetre.locator('.fiche-zone')).not.toContainText('Supprimer')
  await expect(fenetre.locator('.fiche-zone')).toContainText('Enregistrer une copie')

  // Un autre espace reprend la main : on quitte « Préparer et suivre ».
  await page.locator('.barre-outils').getByRole('button', { name: 'Importer et traiter' }).click()
  await expect(fenetre).toBeHidden()
  await app.close()
})

test('aperçu PDF intégré avec navigation et zoom', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-docs-pdf-')
  const userDataDir = await app.evaluate(({ app: application }) => application.getPath('userData'))
  const cheminDocs = join(userDataDir, 'corpus', 'DocsCadre')
  mkdirSync(cheminDocs, { recursive: true })
  writeFileSync(join(cheminDocs, 'Protocole.pdf'), pdfMinimal())

  const fenetre = page.locator('.espace-preparation')
  await ouvrirPreparation(page, 'docs-cadre')
  await fenetre.locator('.document', { hasText: 'Protocole.pdf' }).click()
  await expect(fenetre.locator('.apercu-pdf')).toBeVisible()
  await expect(fenetre.locator('.barre-pdf')).toContainText('Page 1 / 2')
  await expect.poll(() =>
    fenetre.locator('.page-pdf canvas').evaluate((element) => (element as HTMLCanvasElement).width),
  ).toBeGreaterThan(0)

  await fenetre.locator('.barre-pdf').getByRole('button', { name: 'Page suivante' }).click()
  await expect(fenetre.locator('.barre-pdf')).toContainText('Page 2 / 2')
  await fenetre.locator('.barre-pdf').getByRole('button', { name: 'Agrandir' }).click()
  await expect(fenetre.locator('.barre-pdf')).toContainText('125 %')
  await app.close()
})

test('ajout, lecture seule et persistance d’un document du corpus', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-docs-b-')
  const source = join(mkdtempSync(join(tmpdir(), 'sonal-docs-src-')), 'Consignes internes.txt')
  writeFileSync(source, 'Texte des consignes <non interprété>')

  // Stub du dialogue natif d'ouverture : le main copie le fichier choisi.
  await app.evaluate(({ dialog }, fichier) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fichier] })
  }, source)

  const fenetre = page.locator('.espace-preparation')
  await ouvrirPreparation(page, 'docs-cadre')
  await expect(fenetre).toBeVisible()
  await fenetre.locator('.cote-preparation').getByRole('button', { name: /Ajouter un fichier/ }).click()

  // Le document apparaît dans Vos Documents, avec un aperçu TEXTE ÉCHAPPÉ :
  // ses balises ne sont jamais rendues.
  await expect(fenetre.locator('.cote-preparation .document', { hasText: 'Consignes internes.txt' })).toBeVisible()
  await expect(fenetre.locator('.texte-echappe')).toContainText('Texte des consignes <non interprété>')
  await expect(fenetre.locator('.texte-echappe b')).toHaveCount(0)

  // Gestion retirée de l'interface : renommer et supprimer se font hors
  // SonalPi (gestionnaire de fichiers ou Nextcloud).
  await fenetre.locator('.cote-preparation .document', { hasText: 'Consignes internes.txt' }).click()
  await expect(fenetre.locator('.fiche-zone')).not.toContainText('Renommer')
  await expect(fenetre.locator('.fiche-zone')).not.toContainText('Supprimer')
  await expect(fenetre.locator('.fiche-zone')).toContainText('Ouvrir avec l’application')

  // Sortie de l'espace puis retour : le document est toujours là
  // (aucune suppression implicite), et la liste est relue.
  await page.locator('.barre-outils').getByRole('button', { name: 'Importer et traiter' }).click()
  await expect(fenetre).toBeHidden()
  await ouvrirPreparation(page, 'docs-cadre')
  await expect(fenetre.locator('.cote-preparation .document', { hasText: 'Consignes internes.txt' })).toBeVisible()
  await app.close()
})

test('fichier déposé à la main dans DocsCadre/ est découvert à l’actualisation', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-docs-c-')
  const fenetre = page.locator('.espace-preparation')
  await ouvrirPreparation(page, 'docs-cadre')
  await expect(fenetre).toBeVisible()
  // L'ouverture de la fenêtre avec action « Ouvrir le dossier » crée DocsCadre/ ;
  // ici l'utilisateur dépose un fichier à la main puis actualise.
  const userDataDir = await app.evaluate(({ app: application }) => application.getPath('userData'))
  const cheminDocs = join(userDataDir, 'corpus', 'DocsCadre')
  mkdirSync(cheminDocs, { recursive: true })
  writeFileSync(join(cheminDocs, 'Depose manuelle.txt'), 'Déposé à la main.')
  await fenetre.locator('.cote-preparation').getByRole('button', { name: /Actualiser/ }).click()
  await expect(fenetre.locator('.cote-preparation .document', { hasText: 'Depose manuelle.txt' })).toBeVisible()
  await app.close()
})
