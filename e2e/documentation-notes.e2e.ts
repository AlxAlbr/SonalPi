import { test, expect, type Page, type Locator, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import { lancer, attendreAccueil, entrerCorpus, entrerEntretien, ouvrirGestionLocuteurs, retourCorpus } from './util'
import { choisirDossierExemple, configurerSourcesExemples } from './exemples-util'

const titreResume = 'Résumé de l’entretien'
const titrePrive = 'Hypothèse à vérifier'
const corpsResume = 'Fatima décrit l’aide aux devoirs comme un accompagnement des familles. Distinguer le travail scolaire du soutien aux parents.'
const corpsPrive = 'Piste à vérifier : Fatima évoque des contraintes familiales. Ne pas diffuser cette hypothèse sans validation.'

async function selectionnerDans(zone: Locator, phrase: string) {
  await zone.evaluate((element, texte) => {
    ;(element as HTMLElement).focus()
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let noeud: Node | null
    while ((noeud = walker.nextNode())) {
      const debut = (noeud.textContent ?? '').indexOf(texte)
      if (debut < 0) continue
      const plage = document.createRange()
      plage.setStart(noeud, debut)
      plage.setEnd(noeud, debut + texte.length)
      const selection = document.getSelection()!
      selection.removeAllRanges()
      selection.addRange(plage)
      return
    }
    throw new Error(`Passage introuvable : ${texte}`)
  }, phrase)
}

async function nouvelleNote(page: Page, titre: string, corps: string) {
  await page.getByRole('button', { name: '+ Note', exact: true }).click()
  const fenetre = page.locator('.modale-note-fenetre')
  await fenetre.locator('.champ-titre-note input').fill(titre)
  await fenetre.locator('.zone-corps-note').fill(corps)
  return fenetre
}

async function exporter(app: ElectronApplication, page: Page, chemin: string): Promise<string> {
  await app.evaluate(({ session }, fichier) => {
    session.defaultSession.once('will-download', (_event, item) => { item.setSavePath(fichier) })
  }, chemin)
  await page.getByRole('button', { name: 'Exporter les notes filtrées en Markdown', exact: true }).click()
  await expect.poll(() => existsSync(chemin) ? readFileSync(chemin, 'utf8') : '').toContain('# Notes du corpus')
  return readFileSync(chemin, 'utf8')
}

test('manuel : créer, relire et exporter les notes du terrain fictif sans modifier la transcription', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-notes-'))
  const dossier = join(racine, 'exemple')
  const app = await lancer(join(racine, 'profil'), { executablePath: process.env.NOTES_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await attendreAccueil(page)
    await configurerSourcesExemples(app, join(racine, 'sources'))
    await choisirDossierExemple(app, dossier)
    await page.locator('.carte-demo.exemples').click()
    await page.locator('.exemple').filter({
      has: page.getByRole('heading', { name: 'Entretiens déjà importés', exact: true }),
    }).getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Modifier…', exact: true }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
    await expect(page.locator('.carte-ent')).toHaveCount(4)
    const corpus = JSON.parse(readFileSync(join(dossier, 'corpus.json'), 'utf8')) as CorpusFichier
    const id = Object.entries(corpus.membership).find(([, ref]) => ref.titre === '1Coordinatrice')![0]
    const fichier = join(dossier, 'entretiens', `${id}.json`)
    const lire = () => JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier
    const avant = lire()
    await page.locator('.carte-ent').filter({ hasText: '1Coordinatrice' }).locator('.crayon').click()
    await page.locator('[data-onglet="themes"]').click()
    await ouvrirGestionLocuteurs(page)
    await page.locator('.nom-loc').nth(1).fill('Fatima')
    await page.locator('.nom-loc').nth(1).press('Tab')
    await page.getByRole('tab', { name: 'Entretien' }).click()
    await page.locator('[data-onglet="notes"]').click()
    await nouvelleNote(page, 'Brouillon abandonné', 'Ce texte ne doit pas être enregistré.')
    await page.locator('.modale-note-pied').getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(page.locator('.carte-note')).toHaveCount(0)

    let modale = await nouvelleNote(page, titreResume, corpsResume)
    await expect(modale.locator('select').last()).toHaveValue('prive')
    await modale.getByLabel(/^Catégorie/).selectOption({ label: 'résumé' })
    await modale.locator('input[type="date"]').fill('2026-02-18')
    await modale.getByLabel(/^Statut/).selectOption('public')
    await modale.getByLabel('Fatima', { exact: true }).check()
    await selectionnerDans(modale.locator('.zone-corps-note'), 'un accompagnement des familles')
    await modale.getByRole('button', { name: '✏ Marquer comme important', exact: true }).click()
    await expect(modale.locator('mark')).toHaveText('un accompagnement des familles')
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await modale.getByRole('heading', { name: 'Nouvelle note', exact: true }).click()
      await modale.screenshot({ path: 'docs/user/medias/edition-note.png' })
    }
    await modale.getByRole('button', { name: 'Valider', exact: true }).click()
    modale = await nouvelleNote(page, titrePrive, corpsPrive)
    await modale.getByLabel(/^Catégorie/).selectOption({ label: 'réflexion' })
    await modale.locator('input[type="date"]').fill('2026-02-18')
    await modale.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(page.locator('.carte-note')).toHaveCount(2)
    await expect(page.locator('.carte-note').filter({ hasText: titreResume }).locator('.corps-note')).toHaveCount(0)

    await page.getByTitle('Vue feuille (toutes les notes à la suite, éditables)', { exact: true }).click()
    const blocPrive = page.locator('.bloc-notes-texte').filter({ hasText: 'Piste à vérifier' })
    await blocPrive.locator('.corps-notes-texte').fill(corpsPrive + ' Vérifier lors de la prochaine rencontre.')
    await blocPrive.locator('.titre-feuille').fill(titrePrive + ' — en cours')
    await blocPrive.locator('.titre-feuille').press('Tab')
    await expect.poll(() => lire().notes?.some((n) => n.titre === titrePrive + ' — en cours')).toBe(true)
    await blocPrive.locator('.titre-feuille').fill(titrePrive)
    await blocPrive.locator('.titre-feuille').press('Tab')
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await page.getByTitle('Vue cartes', { exact: true }).click()
    const cartePrivee = page.locator('.carte-note').filter({ hasText: titrePrive })
    const carteResume = page.locator('.carte-note').filter({ hasText: titreResume })
    await cartePrivee.dragTo(carteResume)
    await expect(page.locator('.carte-note .titre-note')).toHaveText([titrePrive, titreResume])
    await carteResume.getByTitle('Éditer', { exact: true }).click()
    await page.locator('.champ-titre-note input').fill('Titre abandonné')
    await page.locator('.modale-note-pied').getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(carteResume).toBeVisible()
    await page.getByTitle('Rechercher et filtrer les notes', { exact: true }).click()
    await page.getByPlaceholder('Rechercher dans les notes…', { exact: true }).fill('Hypothèse')
    await expect(page.locator('.carte-note')).toHaveCount(1)
    await page.getByTitle('Copier les notes affichées dans le presse-papier', { exact: true }).click()
    await expect(page.getByTitle('Copié !', { exact: true })).toBeVisible()
    const copie = await app.evaluate(({ clipboard }) => clipboard.readText())
    expect(copie).toContain(titrePrive)
    expect(copie).toContain('privé')
    expect(copie).not.toContain(titreResume)
    await page.getByTitle('Effacer la recherche et les filtres', { exact: true }).click()
    await expect(page.locator('.carte-note')).toHaveCount(2)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    const noteResume = lire().notes!.find((n) => n.titre === titreResume)!
    expect(noteResume.locuteurIds).toEqual([lire().locuteurs.find((l) => l.nom === 'Fatima')!.id])
    expect(noteResume.corps).toContain('<mark>un accompagnement des familles</mark>')
    expect(lire().notes!.find((n) => n.titre === titrePrive)!.corps).toContain('Vérifier lors de la prochaine rencontre.')
    expect(lire().notes!.slice().sort((a, b) => a.rang - b.rang).map((n) => n.titre)).toEqual([titrePrive, titreResume])

    await retourCorpus(page)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Notes', exact: true }).click()
    const notes = page.locator('.notes-corpus')
    await expect(notes.locator('.tableau-notes tbody tr')).toHaveCount(2)
    await notes.getByRole('button', { name: `Modifier la note ${titreResume}`, exact: true }).click()
    const edition = page.getByRole('dialog', { name: 'Modifier la note', exact: true })
    await edition.getByLabel('Titre', { exact: true }).fill('Résumé — aide aux devoirs')
    await edition.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(notes.locator('.tableau-notes')).toContainText('Résumé — aide aux devoirs')
    const noteModifiee = lire().notes!.find((n) => n.id === noteResume.id)!
    expect(noteModifiee.locuteurIds).toEqual(noteResume.locuteurIds)
    expect(noteModifiee.rang).toBe(noteResume.rang)
    await notes.getByRole('button', { name: 'Résumés', exact: true }).click()
    await expect(notes.locator('.tableau-notes tbody tr')).toHaveCount(1)
    await notes.getByRole('button', { name: 'Par entretien', exact: true }).click()
    await notes.getByRole('button', { name: 'Toutes les notes', exact: true }).click()
    await expect(notes.getByRole('button', { name: 'Par entretien', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await notes.getByRole('button', { name: '📄 Feuille', exact: true }).click()
    await expect(notes.locator('.corps-note-complet')).toHaveCount(2)
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await notes.screenshot({ path: 'docs/user/medias/notes-corpus.png' })
    }
    const avantConsultation = readFileSync(fichier, 'utf8')
    const toutes = await exporter(app, page, join(racine, 'toutes-notes.md'))
    expect(toutes).toContain(titrePrive)
    expect(toutes).toContain('**Statut** : prive')
    expect(toutes).toContain('**Statut** : public')
    expect(toutes).toContain('**un accompagnement des familles**')
    expect(toutes).toContain('Fatima')
    await notes.locator('.filtres-detailles > summary').click()
    await notes.getByRole('combobox', { name: /Statut/ }).selectOption('public')
    await expect(notes.locator('.bloc-feuille-note')).toHaveCount(1)
    const publiques = await exporter(app, page, join(racine, 'notes-publiques.md'))
    expect(publiques).toContain('Résumé — aide aux devoirs')
    expect(publiques).not.toContain(titrePrive)
    expect(publiques).not.toContain('Ne pas diffuser')
    expect(readFileSync(fichier, 'utf8')).toBe(avantConsultation)
    await notes.getByRole('button', { name: 'Toutes les notes', exact: true }).click()
    await notes.getByRole('button', { name: '📊 Tableau', exact: true }).click()
    await notes.locator('tbody tr').filter({ hasText: 'Résumé — aide aux devoirs' }).locator('.entretien').click()
    await expect(page.locator('.panneau.notes')).toBeVisible()
    await expect(page.locator('.carte-note')).toHaveCount(2)
    await cartePrivee.getByTitle('Supprimer', { exact: true }).click()
    await expect(page.locator('.carte-note')).toHaveCount(1)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await retourCorpus(page)
    const supprimer = notes.getByRole('button', { name: 'Supprimer la note Résumé — aide aux devoirs', exact: true })
    page.once('dialog', (dialog) => dialog.dismiss())
    await supprimer.click()
    await expect(notes.locator('tbody tr')).toHaveCount(1)
    page.once('dialog', (dialog) => dialog.accept())
    await supprimer.click()
    await expect(notes).toContainText('Aucune note dans ce corpus.')
    const apres = lire()
    expect(apres.notes).toEqual([])
    expect(apres.corpsTexte).toEqual(avant.corpsTexte)
    expect(apres.annotations).toEqual(avant.annotations)
    expect(apres.ancres).toEqual(avant.ancres)
  } finally {
    await app.close()
  }
})

test('manuel : créer une catégorie ou changer sa couleur est distinct de valider une note', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-categorie-note-'))
  const app = await lancer(racine, { executablePath: process.env.NOTES_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await page.locator('[data-onglet="notes"]').click()
    const fichierCorpus = join(racine, 'corpus/corpus.json')
    const categories = () => (JSON.parse(readFileSync(fichierCorpus, 'utf8')) as CorpusFichier).categoriesNote!
    let modale = await nouvelleNote(page, 'À annuler', 'Le brouillon ne sera pas conservé.')
    await modale.getByLabel(/^Catégorie/).selectOption({ label: 'autre…' })
    await modale.getByTitle('Nouvelle catégorie (nom + couleur)', { exact: true }).click()
    const creation = page.locator('.sous-modale-fenetre')
    await creation.getByLabel('Nom', { exact: true }).fill('Pistes de recherche')
    await creation.getByRole('button', { name: 'Créer', exact: true }).click()
    await expect.poll(() => categories().find((c) => c.nom === 'Pistes de recherche')?.id).toBeTruthy()
    const categorie = categories().find((c) => c.nom === 'Pistes de recherche')!
    await modale.getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(page.locator('.carte-note')).toHaveCount(0)
    expect(categories().find((c) => c.id === categorie.id)).toBeTruthy()
    modale = await nouvelleNote(page, 'Piste conservée', 'Une note de travail.')
    await modale.getByLabel(/^Catégorie/).selectOption(categorie.id)
    await modale.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    const fichier = join(racine, 'corpus/entretiens/e1.json')
    const avant = readFileSync(fichier, 'utf8')
    await page.locator('.carte-note').getByTitle('Éditer', { exact: true }).click()
    await page.locator('.modale-note-fenetre .carre-couleur').evaluate((champ: HTMLInputElement) => {
      champ.value = '#8658a5'
      champ.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect.poll(() => categories().find((c) => c.id === categorie.id)?.couleur).toBe('#8658a5')
    await page.locator('.modale-note-fenetre').getByRole('button', { name: 'Annuler', exact: true }).click()
    expect(readFileSync(fichier, 'utf8')).toBe(avant)
    await expect(page.locator('.carte-note .nom-cat')).toHaveCSS('color', 'rgb(134, 88, 165)')
  } finally {
    await app.close()
  }
})

test('manuel : une session annoncée en lecture seule laisse consulter et copier une note privée', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-notes-lecture-'))
  const app = await lancer(racine, { executablePath: process.env.NOTES_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await page.locator('[data-onglet="notes"]').click()
    const modale = await nouvelleNote(page, 'Note de travail privée', 'Une réflexion à relire avant diffusion.')
    await modale.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await retourCorpus(page)
    const fichier = join(racine, 'corpus/entretiens/e1.json')
    const avant = readFileSync(fichier, 'utf8')
    await app.evaluate(({ ipcMain }, data) => {
      ipcMain.removeHandler('corpus:ouvrirEntretienPourEdition')
      ipcMain.handle('corpus:ouvrirEntretienPourEdition', () => ({
        ok: true, acces: 'lecture-seule', verrouTenuParAutrui: null, data,
      }))
    }, JSON.parse(avant))
    await entrerEntretien(page)
    await page.locator('[data-onglet="notes"]').click()
    await expect(page.locator('.editeur')).toHaveAttribute('contenteditable', 'false')
    await expect(page.getByRole('button', { name: '+ Note', exact: true })).toHaveCount(0)
    await expect(page.locator('.carte-note-actions')).toHaveCount(0)
    await expect(page.locator('.carte-note')).toContainText('privé')
    await page.getByTitle('Vue feuille (toutes les notes à la suite, éditables)', { exact: true }).click()
    await expect(page.locator('.corps-notes-texte')).toHaveAttribute('contenteditable', 'false')
    await expect(page.locator('.corps-notes-texte')).toHaveText('Une réflexion à relire avant diffusion.')
    await page.getByTitle('Copier les notes affichées dans le presse-papier', { exact: true }).click()
    await expect(page.getByTitle('Copié !', { exact: true })).toBeVisible()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toContain('Une réflexion à relire avant diffusion.')
    expect(readFileSync(fichier, 'utf8')).toBe(avant)
  } finally {
    await app.close()
  }
})
