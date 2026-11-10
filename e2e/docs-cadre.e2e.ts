import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  await expect(fenetre.getByRole('navigation', { name: 'Dossier des documents' })).toHaveCount(0)
  await expect(fenetre.locator('.cote-preparation')).toContainText(/Ce dossier est vide\.|Vous n’avez pas encore de dossier de documents\./)
  await expect(fenetre.locator('[data-tour="documents-exemples"]')).toBeHidden()
  const cote = fenetre.locator('.cote-docs')
  const titre = await cote.locator('.corpus-tete').boundingBox()
  const ajouter = await cote.getByRole('button', { name: /Ajouter un fichier/ }).boundingBox()
  for (const nom of ['Nouveau dossier', 'Ouvrir ce dossier']) {
    const bouton = await cote.getByRole('button', { name: nom, exact: true }).boundingBox()
    expect(bouton!.y).toBeGreaterThanOrEqual(titre!.y + titre!.height + 12)
    expect(bouton!.y + bouton!.height).toBeLessThan(ajouter!.y)
  }

  // Le dossier documentaire reste accessible même sans document sélectionné.
  await app.evaluate(({ shell }) => {
    shell.openPath = async (chemin) => {
      process.env.SONAL_TEST_DOSSIER_OUVERT = chemin
      return ''
    }
  })
  await expect(fenetre.locator('.cote-preparation').getByRole('button', { name: 'Ouvrir ce dossier' })).toBeVisible()
  await fenetre.locator('.cote-preparation').getByRole('button', { name: 'Ouvrir ce dossier' }).click()
  await expect.poll(() => app.evaluate(() => process.env.SONAL_TEST_DOSSIER_OUVERT)).toContain('DocsPrepaProjet')
  await expect(fenetre.locator('.message-action')).toContainText('gestionnaire de fichiers')

  // Les exemples disposent de leur propre onglet et conservent leur ordre défini.
  await ouvrirPreparation(page, 'documents-exemples')
  await expect(page.locator('[data-tour="ouvrir-documents-exemples"]')).toHaveAttribute('aria-current', 'page')
  await expect(fenetre.locator('.cote-docs .corpus-tete h3')).toHaveText('Documents exemples')
  await expect(cote).not.toContainText('Ces modèles sont fournis avec SonalPi.')
  const titreExemples = await cote.locator('.corpus-tete').boundingBox()
  const actualiser = await cote.getByRole('button', { name: /Actualiser/ }).boundingBox()
  expect(actualiser!.y).toBeGreaterThanOrEqual(titreExemples!.y + titreExemples!.height + 12)
  await expect(fenetre.getByRole('navigation', { name: 'Dossier des documents' })).toHaveCount(0)
  await expect(fenetre.locator('[data-tour="documents-exemples"] .document .nom')).toHaveText([
    'DPO',
    'Guide de correction.txt',
    'Guide de pseudonymisation.txt',
  ])
  await expect(fenetre.getByRole('button', { name: /Ajouter un fichier/ })).toHaveCount(0)

  await fenetre.locator('.document', { hasText: 'DPO' }).click()
  await expect(fenetre.locator('[data-tour="documents-exemples"] .document .nom')).toHaveText([
    'Déclaration traitement DPO.txt', 'Notice de consentement DPO.txt',
  ])
  await fenetre.locator('.document', { hasText: 'Notice de consentement DPO.txt' }).click()
  await expect(fenetre.locator('.texte-echappe')).toContainText('À venir.')
  await expect(fenetre.getByRole('button', { name: 'Afficher dans le dossier' })).toHaveCount(0)
  await fenetre.getByRole('navigation', { name: 'Dossier des documents' }).getByRole('button', { name: 'Documents exemples', exact: true }).click()
  await expect(fenetre.getByRole('navigation', { name: 'Dossier des documents' })).toHaveCount(0)
  await expect(fenetre.locator('.cote-docs .corpus-tete h3')).toBeFocused()

  // Aperçu d'un exemple embarqué : texte affiché tel quel.
  await fenetre.locator('.document', { hasText: 'Guide de correction.txt' }).click()
  await expect(fenetre.locator('.fiche-zone')).toContainText('Guide de correction.txt')
  await expect(fenetre.locator('.texte-echappe')).toContainText('À venir.')
  // Les exemples sont immuables : aucune mutation proposée.
  await expect(fenetre.locator('.fiche-zone')).not.toContainText('Renommer')
  await expect(fenetre.locator('.fiche-zone')).not.toContainText('Supprimer')
  await expect(fenetre.locator('.fiche-zone')).toContainText('Enregistrer une copie')

  // Un autre espace reprend la main : on quitte « Préparer et suivre ».
  await page.locator('.barre-outils').getByRole('button', { name: 'Importer & Traiter' }).click()
  await expect(fenetre).toBeHidden()
  await app.close()
})

test('sous-dossiers : clavier, création, ajout, dépôt, actions externes et disparition', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-docs-dossiers-')
  try {
    const userData = await app.evaluate(({ app: application }) => application.getPath('userData'))
    const racine = join(userData, 'corpus', 'DocsPrepaProjet')
    mkdirSync(join(racine, 'DPO'), { recursive: true })
    writeFileSync(join(racine, 'Ancien.txt'), 'Corpus plat compatible.')
    writeFileSync(join(racine, 'DPO', 'Notice.txt'), 'Texte imbriqué.')
    await app.evaluate(({ shell }) => {
      shell.openPath = async (chemin) => { process.env.SONAL_TEST_OUVERT = chemin; return '' }
      shell.showItemInFolder = (chemin) => { process.env.SONAL_TEST_AFFICHE = chemin }
    })
    await ouvrirPreparation(page, 'docs-cadre')
    const fenetre = page.locator('.espace-preparation')
    const cote = fenetre.locator('.cote-docs')
    await expect(cote.locator('.document .nom')).toHaveText(['DPO', 'Ancien.txt'])
    await cote.getByRole('button', { name: 'Dossier : DPO' }).focus()
    await page.keyboard.press('Enter')
    await expect(cote.locator('[aria-current="location"]')).toHaveText('DPO')
    await expect(cote.locator('span[aria-current="location"]')).toBeFocused()
    await expect(cote.getByRole('navigation', { name: 'Dossier des documents' }).getByRole('button', { name: 'DPO', exact: true })).toHaveCount(0)
    await expect(cote.locator('.fil-ariane button')).toHaveCSS('border-top-style', 'none')
    await cote.locator('.document', { hasText: 'Notice.txt' }).click()
    await expect(fenetre.locator('.texte-echappe')).toContainText('Texte imbriqué.')
    await fenetre.getByRole('button', { name: 'Ouvrir', exact: true }).click()
    await expect.poll(() => app.evaluate(() => process.env.SONAL_TEST_OUVERT)).toBe(join(racine, 'DPO', 'Notice.txt'))
    await fenetre.getByRole('button', { name: 'Afficher dans le dossier' }).click()
    await expect.poll(() => app.evaluate(() => process.env.SONAL_TEST_AFFICHE)).toBe(join(racine, 'DPO', 'Notice.txt'))
    await cote.getByRole('button', { name: 'Ouvrir ce dossier' }).click()
    await expect.poll(() => app.evaluate(() => process.env.SONAL_TEST_OUVERT)).toBe(join(racine, 'DPO'))

    const copie = join(userData, 'copie-notice.txt')
    await app.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination })
    }, copie)
    await fenetre.getByRole('button', { name: 'Enregistrer une copie' }).click()
    await expect.poll(() => existsSync(copie)).toBe(true)
    expect(readFileSync(copie, 'utf8')).toBe('Texte imbriqué.')

    await cote.getByRole('button', { name: 'Nouveau dossier', exact: true }).click()
    await cote.getByLabel('Nom du nouveau dossier').fill('École 2')
    await cote.getByRole('button', { name: 'Créer le dossier' }).click()
    await cote.getByRole('button', { name: 'Dossier : École 2' }).click()
    await expect(cote).toContainText('Ce dossier est vide.')
    const source = join(userData, 'Ajout.txt')
    writeFileSync(source, 'Ajout dans le dossier courant.')
    await app.evaluate(({ dialog }, fichier) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fichier] })
    }, source)
    await cote.getByRole('button', { name: /Ajouter un fichier/ }).click()
    await expect(cote.locator('.document .nom')).toHaveText(['Ajout.txt'])
    expect(readFileSync(join(racine, 'DPO', 'École 2', 'Ajout.txt'), 'utf8')).toBe('Ajout dans le dossier courant.')

    const depose = join(userData, 'Déposé.txt')
    writeFileSync(depose, 'Dépôt ciblé.')
    // Le pont du dépôt reçoit le chemin fourni par Electron pour un fichier natif.
    await page.evaluate(async (chemin) => {
      await window.sonal.docsCadre.deposer(chemin, 'DPO/École 2')
    }, depose)
    await cote.getByRole('button', { name: /Actualiser/ }).click()
    await expect(cote.locator('.document .nom')).toHaveText(['Ajout.txt', 'Déposé.txt'])
    expect(readFileSync(join(racine, 'DPO', 'École 2', 'Déposé.txt'), 'utf8')).toBe('Dépôt ciblé.')

    await ouvrirPreparation(page, 'documents-exemples')
    await cote.getByRole('button', { name: 'Dossier : DPO' }).click()
    await ouvrirPreparation(page, 'docs-cadre')
    await expect(cote.locator('[aria-current="location"]')).toHaveText('École 2')
    rmSync(join(racine, 'DPO'), { recursive: true })
    await cote.getByRole('button', { name: /Actualiser/ }).click()
    await expect(cote.getByRole('navigation', { name: 'Dossier des documents' })).toHaveCount(0)
    await expect(cote.locator('.document .nom')).toHaveText(['Ancien.txt'])
    await expect(fenetre.locator('.fiche-zone')).toHaveCount(0)
  } finally { await app.close() }
})

test('les noms longs restent lisibles dans une fenêtre étroite', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-docs-noms-')
  try {
    const userData = await app.evaluate(({ app: application }) => application.getPath('userData'))
    const dir = join(userData, 'corpus', 'DocsPrepaProjet')
    mkdirSync(dir, { recursive: true })
    const nom = `${'Consignes-école-'.repeat(14)}.txt`
    writeFileSync(join(dir, nom), 'Document au nom long.')
    await page.setViewportSize({ width: 900, height: 700 })
    await ouvrirPreparation(page, 'docs-cadre')
    await page.locator('.cote-docs .document', { hasText: nom }).click()
    await expect(page.locator('.texte-echappe')).toContainText('Document au nom long.')
    const debordement = await page.locator('.espace-preparation').evaluate((e) => e.scrollWidth - e.clientWidth)
    expect(debordement).toBeLessThanOrEqual(1)
  } finally { await app.close() }
})

test('aperçu PDF intégré avec navigation et zoom', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-docs-pdf-')
  const userDataDir = await app.evaluate(({ app: application }) => application.getPath('userData'))
  const cheminDocs = join(userDataDir, 'corpus', 'DocsPrepaProjet')
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
  await expect(fenetre.locator('.fiche-zone').getByRole('button', { name: 'Ouvrir', exact: true })).toBeVisible()

  // Sortie de l'espace puis retour : le document est toujours là
  // (aucune suppression implicite), et la liste est relue.
  await page.locator('.barre-outils').getByRole('button', { name: 'Importer & Traiter' }).click()
  await expect(fenetre).toBeHidden()
  await ouvrirPreparation(page, 'docs-cadre')
  await expect(fenetre.locator('.cote-preparation .document', { hasText: 'Consignes internes.txt' })).toBeVisible()
  await app.close()
})

test('fichier déposé à la main dans DocsPrepaProjet/ est découvert à l’actualisation', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-docs-c-')
  const fenetre = page.locator('.espace-preparation')
  await ouvrirPreparation(page, 'docs-cadre')
  await expect(fenetre).toBeVisible()
  // Un fichier ajouté hors de SonalPi est découvert à l’actualisation.
  const userDataDir = await app.evaluate(({ app: application }) => application.getPath('userData'))
  const cheminDocs = join(userDataDir, 'corpus', 'DocsPrepaProjet')
  mkdirSync(cheminDocs, { recursive: true })
  writeFileSync(join(cheminDocs, 'Depose manuelle.txt'), 'Déposé à la main.')
  await fenetre.locator('.cote-preparation').getByRole('button', { name: /Actualiser/ }).click()
  await expect(fenetre.locator('.cote-preparation .document', { hasText: 'Depose manuelle.txt' })).toBeVisible()
  await app.close()
})
