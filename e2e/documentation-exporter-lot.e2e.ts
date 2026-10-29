import { test, expect, chromium, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import { ecrireSeedDemo, entrerCorpus, lancer, ouvrirOrganisation } from './util'

function ajouterEntretien(dossier: string, id: string, titre: string, texte: string) {
  const chemin = join(dossier, 'corpus.json')
  const corpus = JSON.parse(readFileSync(chemin, 'utf8')) as CorpusFichier
  corpus.membership[id] = { titre, date: null, lastModified: new Date().toISOString() }
  writeFileSync(chemin, JSON.stringify(corpus, null, 2), 'utf8')
  const entretien: EntretienFichier = {
    formatVersion: 3,
    lastModified: new Date().toISOString(),
    corpsTexte: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: texte }] }],
    },
    annotations: [],
    ancres: [],
    locuteurs: [{ index: 1, nom: 'Enquêteur', valeursLoc: {}, personneRef: null }],
    meta: { valeursGen: {}, audioRef: null },
  }
  mkdirSync(join(dossier, 'entretiens'), { recursive: true })
  writeFileSync(join(dossier, 'entretiens', `${id}.json`), JSON.stringify(entretien, null, 2), 'utf8')
}

function pseudonymiserKarine(dossier: string) {
  const chemin = join(dossier, 'entretiens', 'e1.json')
  const entretien = JSON.parse(readFileSync(chemin, 'utf8')) as EntretienFichier
  entretien.locuteurs[1].pseudo = 'Nadia'
  entretien.locuteurs[1].pseudoEtat = 'confirme'
  entretien.annotations = [
    { id: 'anon-karine', type: 'anon', from: 1, to: 7, auteur: 'Documentation', etat: 'anonymise', pseudo: 'Nadia' },
  ]
  writeFileSync(chemin, JSON.stringify(entretien, null, 2), 'utf8')
}

function lister(dossier: string): string[] {
  return readdirSync(dossier).sort()
}

async function destination(app: ElectronApplication, dossier: string) {
  await app.evaluate(({ dialog }, sortie) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: sortie })
  }, dossier)
}

async function attendreResume(page: Page, texte: RegExp) {
  await expect(page.locator('.export-corpus .etape', { hasText: texte })).toBeVisible({ timeout: 25_000 })
}

function ecrireSilence(chemin: string) {
  const wav = Buffer.alloc(44 + 16000)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8000, 24)
  wav.writeUInt32LE(16000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(16000, 40)
  writeFileSync(chemin, wav)
}

test('manuel : choisir les entretiens, vérifier le rapport et exporter un lot', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-lot-'))
  const dossierCorpus = join(racine, 'corpus')
  ecrireSeedDemo(dossierCorpus)
  pseudonymiserKarine(dossierCorpus)
  ajouterEntretien(dossierCorpus, 'e2', 'Entretien deux', 'Deuxième entretien de démonstration.')
  const destinationDossier = join(racine, 'export-corpus')
  const rapport = join(racine, 'rapport-du-lot.txt')
  const app = await lancer(racine, { executablePath: process.env.EXPORT_LOT_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1440, 1000))
    await entrerCorpus(page)
    await ouvrirOrganisation(page, 'export')
    const espace = page.locator('.export-corpus')
    await expect(espace.locator('.ligne-entretien')).toHaveCount(2)
    await expect(espace.getByLabel('Tous les entretiens')).toBeChecked()
    await espace.locator('.ligne-entretien', { hasText: 'Entretien deux' }).locator('input').uncheck()
    await expect(espace.locator('.recapitulatif-export')).toContainText('1 entretien sélectionné sur 2')
    await espace.getByLabel('Tous les entretiens').check()

    await espace.getByLabel('Page web autonome (.html)', { exact: false }).check()
    await espace.getByLabel('Document combiné (.docx)', { exact: false }).check()
    await expect(espace.locator('.resultats-export')).toContainText('Page web autonome (.html)')
    await expect(espace.locator('.resultats-export')).toContainText('Un index récapitulatif accompagnera les fichiers.')
    await expect(espace.locator('.resultats-export')).toContainText('Les médias accessibles seront copiés')
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.export-corpus').screenshot({ path: 'docs/user/medias/export-corpus-reglages.png' })
    }

    await espace.getByLabel('Consulter le rapport de pseudonymisation', { exact: false }).check()
    await espace.locator('.actions .exporter').click()
    const apercu = espace.locator('.rapport-contenu')
    await expect(apercu).toContainText('Entretien Karine')
    await expect(apercu).toContainText('Pseudonymisation appliquée')
    await expect(apercu).toContainText('Éléments à vérifier manuellement')
    await destination(app, rapport)
    await espace.getByRole('button', { name: 'Enregistrer le rapport' }).click()
    await expect(espace.locator('.message-information')).toContainText('Rapport enregistré')

    await destination(app, destinationDossier)
    await espace.getByRole('button', { name: /Lancer l’export/ }).click()
    await attendreResume(page, /Export terminé/)
    await expect(espace.locator('.resume-ligne.succes')).toHaveCount(2)
    await expect(espace.locator('.dossier')).toContainText(destinationDossier)
    await expect(espace.locator('.resume-ligne', { hasText: 'Entretien Karine' })).toBeVisible()
    await expect(espace.locator('.resume-ligne', { hasText: 'Entretien deux' })).toBeVisible()
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.resultats-export > .corps').screenshot({ path: 'docs/user/medias/export-corpus-resultat.png' })
    }

    expect(lister(destinationDossier)).toEqual([
      'Entretien Karine_pseudonymise.html',
      'Entretien Karine_pseudonymise.txt',
      'Entretien deux_pseudonymise.html',
      'Entretien deux_pseudonymise.txt',
      '_index.txt',
      'corpus.docx',
    ])
    const karine = readFileSync(join(destinationDossier, 'Entretien Karine_pseudonymise.txt'), 'utf8')
    expect(karine).toContain('[Nadia]')
    expect(karine).not.toContain('Karine habite')
    const index = readFileSync(join(destinationDossier, '_index.txt'), 'utf8')
    expect(index).toContain('Nom du corpus : corpus')
    expect(index).toContain('2 entretiens exportés.')
    expect(index).toContain('- Entretien Karine — ')
    expect(index).toContain('- Entretien deux — 4 mots')
    const archive = await JSZip.loadAsync(readFileSync(join(destinationDossier, 'corpus.docx')))
    const xml = await archive.file('word/document.xml')!.async('string')
    expect(xml).toContain('Entretien Karine')
    expect(xml).toContain('Entretien deux')
    expect(xml).toContain('Nadia')
    const rapportTexte = readFileSync(rapport, 'utf8')
    expect(rapportTexte).toContain('Rapport de pseudonymisation')
    expect(rapportTexte).toContain('Entretien deux')
    expect(rapportTexte).toContain("ne constitue pas une garantie d'anonymat")

    await espace.getByRole('button', { name: 'Préparer un autre export' }).click()
    await espace.getByLabel('Tous les entretiens').uncheck()
    await espace.locator('.ligne-entretien', { hasText: 'Entretien deux' }).locator('input').check()
    await espace.getByLabel('Consulter le rapport de pseudonymisation', { exact: false }).uncheck()
    await espace.getByLabel('PDF combiné', { exact: false }).check()
    const partiel = join(racine, 'selection-partielle')
    await destination(app, partiel)
    await espace.locator('.actions .exporter').click()
    await attendreResume(page, /Export terminé/)
    await expect(espace.locator('.resume-ligne.succes')).toHaveCount(1)
    expect(readFileSync(join(partiel, '_index.txt'), 'utf8')).not.toContain('Entretien Karine')
    expect(readFileSync(join(partiel, 'corpus.pdf')).subarray(0, 5).toString()).toBe('%PDF-')
  } finally {
    await app.close()
  }
})

test('manuel : les médias copiés restent des originaux même avec un texte pseudonymisé', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-lot-medias-'))
  const dossierCorpus = join(racine, 'corpus')
  ecrireSeedDemo(dossierCorpus)
  pseudonymiserKarine(dossierCorpus)
  const media = join(racine, 'enregistrement.wav')
  ecrireSilence(media)
  const chemin = join(dossierCorpus, 'entretiens', 'e1.json')
  const entretien = JSON.parse(readFileSync(chemin, 'utf8')) as EntretienFichier
  entretien.meta.audioRef = media
  writeFileSync(chemin, JSON.stringify(entretien, null, 2))
  const app = await lancer(racine, { executablePath: process.env.EXPORT_LOT_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await ouvrirOrganisation(page, 'export')
    const espace = page.locator('.export-corpus')
    await espace.getByLabel('Page web autonome (.html)', { exact: false }).check()
    await expect(espace).toContainText('Les enregistrements seront copiés à l’identique')
    for (const pseudonymise of [true, false]) {
      const dossier = join(racine, pseudonymise ? 'copie-pseudonymisee' : 'copie-claire')
      await espace.getByLabel('Appliquer la pseudonymisation').setChecked(pseudonymise)
      await destination(app, dossier)
      await espace.locator('.actions .exporter').click()
      await attendreResume(page, /Export terminé/)
      expect(readFileSync(join(dossier, 'medias', 'enregistrement.wav'))).toEqual(readFileSync(media))
      const html = join(dossier, `Entretien Karine${pseudonymise ? '_pseudonymise' : ''}.html`)
      const contenu = readFileSync(html, 'utf8')
      if (pseudonymise) {
        expect(contenu).not.toContain('<audio')
      } else {
        expect(contenu).toContain('src="medias/enregistrement.wav"')
        const navigateur = await chromium.launch()
        try {
          const contexte = await navigateur.newContext({ offline: true })
          const lecture = await contexte.newPage()
          await lecture.goto(pathToFileURL(html).href)
          await expect.poll(() => lecture.locator('audio').evaluate((el: HTMLAudioElement) => el.readyState)).toBeGreaterThanOrEqual(1)
        } finally {
          await navigateur.close()
        }
      }
      await espace.getByRole('button', { name: 'Préparer un autre export' }).click()
    }
  } finally {
    await app.close()
  }
})

test('manuel : poursuivre après un entretien en échec et reprendre après annulation', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-lot-echec-'))
  const dossierCorpus = join(racine, 'corpus')
  ecrireSeedDemo(dossierCorpus)
  ajouterEntretien(dossierCorpus, 'e2', 'Entretien deux', 'Deuxième entretien de démonstration.')
  const destinationDossier = join(racine, 'export-partiel')
  const app = await lancer(racine, { executablePath: process.env.EXPORT_LOT_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    writeFileSync(join(dossierCorpus, 'entretiens', 'e2.json'), JSON.stringify({ formatVersion: 99 }))
    await destination(app, destinationDossier)
    await ouvrirOrganisation(page, 'export')
    const espace = page.locator('.export-corpus')
    await expect(espace.getByLabel('Tous les entretiens')).toBeChecked()
    await espace.locator('.actions .exporter').click()
    await attendreResume(page, /Export terminé/)
    await expect(espace.locator('.resume-ligne.succes', { hasText: 'Entretien Karine' })).toBeVisible()
    await expect(espace.locator('.resume-ligne.echec', { hasText: 'Entretien deux' })).toBeVisible()
    await expect(espace.locator('.resume-ligne.echec')).toContainText('version')
    const index = readFileSync(join(destinationDossier, '_index.txt'), 'utf8')
    expect(index).toContain('1 entretien exporté.')
    expect(index).not.toContain('Entretien deux')

    await espace.getByRole('button', { name: 'Préparer un autre export' }).click()
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' })
    })
    await espace.getByLabel('Page web autonome (.html)', { exact: false }).check()
    await espace.locator('.actions .exporter').click()
    await attendreResume(page, /Export arrêté/)
    await expect(espace.locator('.dossier')).toHaveCount(0)
    await espace.getByRole('button', { name: 'Préparer un autre export' }).click()
    await expect(espace.getByLabel('Page web autonome (.html)', { exact: false })).toBeChecked()
    await expect(espace.getByLabel('Tous les entretiens')).toBeChecked()
    await expect(espace.locator('.actions .exporter')).toBeEnabled()
  } finally {
    await app.close()
  }
})
