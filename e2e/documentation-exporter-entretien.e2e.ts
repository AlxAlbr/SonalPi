import { test, expect, chromium, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import { ecrireSeedDemo, entrerCorpus, entrerEntretien, lancer } from './util'

function preparerCorpus(dossier: string) {
  mkdirSync(dossier, { recursive: true })
  ecrireSeedDemo(dossier)
  const cheminCorpus = join(dossier, 'corpus.crp')
  const cheminEntretien = join(dossier, 'entretiens', 'e1.json')
  const corpus = JSON.parse(readFileSync(cheminCorpus, 'utf8')) as CorpusFichier
  const entretien = JSON.parse(readFileSync(cheminEntretien, 'utf8')) as EntretienFichier
  const blocs = (entretien.corpsTexte as { content: Array<{ content?: Array<{ text?: string }> }> }).content
  const texte1 = blocs[0].content?.map((n) => n.text ?? '').join('') ?? ''
  const texte2 = blocs[1].content?.map((n) => n.text ?? '').join('') ?? ''
  const debut1 = 1
  const debut2 = debut1 + texte1.length + 2
  const plage = (texte: string, debut: number, extrait: string) => {
    const offset = texte.indexOf(extrait)
    if (offset < 0) throw new Error(`Extrait absent : ${extrait}`)
    return { from: debut + offset, to: debut + offset + extrait.length }
  }

  corpus.categoriesNote = [{ id: 'ncat_terrain', nom: 'Terrain', couleur: '#548dc1' }]
  corpus.codebook.cat_003.couleur = '#f9c74f'
  corpus.variables = {
    v_contexte: {
      id: 'v_contexte', lib: 'Type d’entretien', portee: 'entretien', priv: false,
      ordre: 0, vExport: 1, modalites: [{ id: 'm_individuel', lib: 'Individuel', mExport: 1 }],
    },
    v_interne: {
      id: 'v_interne', lib: 'Code interne', portee: 'entretien', priv: true,
      ordre: 1, vExport: 2, modalites: [{ id: 'm_a17', lib: 'A-17', mExport: 1 }],
    },
  }
  entretien.meta.valeursGen = { v_contexte: 'm_individuel', v_interne: 'm_a17' }
  entretien.locuteurs[1].pseudo = 'Nadia'
  entretien.locuteurs[1].pseudoEtat = 'confirme'
  entretien.annotations = [
    {
      id: 'anon-karine', type: 'anon', auteur: 'Documentation', etat: 'anonymise', pseudo: 'Nadia',
      ...plage(texte1, debut1, 'Karine'),
    },
    {
      id: 'codage-lieu', type: 'codage', auteur: 'Documentation', code: 'cat_003',
      ...plage(texte1, debut1, 'Lyon'),
    },
    {
      id: 'commentaire-travail', type: 'commentaire', auteur: 'Karine D.',
      texte: 'Vérifier le métier avant diffusion.',
      ...plage(texte2, debut2, 'travail'),
    },
  ]
  entretien.ancres = [
    { pos: debut1, t: 10 },
    { pos: debut1 + texte1.length, t: 20 },
    { pos: debut2, t: 21 },
    { pos: debut2 + texte2.length, t: 32 },
  ]
  entretien.notes = [
    {
      id: 'note-publique', categorieId: 'ncat_terrain', titre: 'Contexte', date: null,
      statut: 'public', corps: 'Karine évoque son déménagement.', rang: 0,
      creeLe: '2024-01-01T10:00:00.000Z', modifieLe: null,
    },
    {
      id: 'note-privee', categorieId: 'ncat_terrain', titre: 'Coordonnées', date: null,
      statut: 'prive', corps: 'Adresse privée à ne pas diffuser.', rang: 1,
      creeLe: '2024-01-01T10:05:00.000Z', modifieLe: null,
    },
  ]
  writeFileSync(cheminCorpus, JSON.stringify(corpus, null, 2), 'utf8')
  writeFileSync(cheminEntretien, JSON.stringify(entretien, null, 2), 'utf8')
}

async function destination(app: ElectronApplication, chemin: string) {
  await app.evaluate(({ dialog }, sortie) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: sortie })
  }, chemin)
}

async function choisirFormat(page: Page, extension: string) {
  await page.getByRole('button', { name: 'Exporter cet entretien', exact: true }).click()
  await page.locator('.ligne-format', { has: page.locator('.ext', { hasText: extension }) }).click()
}

async function attendreFichier(chemin: string) {
  await expect.poll(() => existsSync(chemin), { timeout: 15_000 }).toBe(true)
}

test('manuel : choisir un format, contrôler les contenus et exporter les sept formats', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-export-entretien-'))
  const profil = join(racine, 'profil')
  preparerCorpus(join(profil, 'corpus'))
  const app = await lancer(profil, { executablePath: process.env.EXPORT_ENTRETIEN_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await entrerCorpus(page)
    await entrerEntretien(page)

    const html = join(racine, 'Entretien-Karine-pseudonymise.html')
    await choisirFormat(page, '.html')
    await page.getByLabel(/En-tête/).check()
    await expect(page.getByLabel('Appliquer la pseudonymisation')).toBeChecked()
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.modale-export').screenshot({ path: 'docs/user/medias/options-export-entretien.png' })
    }
    await destination(app, html)
    await page.locator('.actions .exporter').click()
    await attendreFichier(html)
    const contenuHtml = readFileSync(html, 'utf8')
    expect(contenuHtml).toContain('>[Nadia]</span>')
    expect(contenuHtml).toContain('> habite </span>')
    expect(contenuHtml).not.toContain('>Karine habite')
    expect(contenuHtml).toContain('[Terrain]')
    expect(contenuHtml).toContain('Karine évoque son déménagement.')
    expect(contenuHtml).not.toContain('Adresse privée à ne pas diffuser.')
    expect(contenuHtml).toContain('Type d’entretien')
    expect(contenuHtml).not.toContain('Code interne')
    expect(contenuHtml).toContain('data-obs="Vérifier le métier avant diffusion."')
    expect(contenuHtml).toContain('data-auth="Karine D."')
    expect(contenuHtml).not.toContain('<audio')

    const navigateur = await chromium.launch()
    try {
      const contexte = await navigateur.newContext({ offline: true, javaScriptEnabled: false })
      const sortie = await contexte.newPage()
      await sortie.setViewportSize({ width: 1000, height: 800 })
      await sortie.goto(pathToFileURL(html).href)
      await expect(sortie.getByRole('heading', { level: 1 })).toHaveText('Entretien Karine')
      await expect(sortie.locator('.section-notes')).toContainText('Contexte')
      await expect(sortie.locator('#ent-contenu')).toContainText('[Nadia] habite Lyon')
      if (process.env.SONAL_DOC_CAPTURES === '1') {
        await sortie.screenshot({ path: 'docs/user/medias/export-entretien-html.png', fullPage: true })
      }
    } finally {
      await navigateur.close()
    }

    const rapport = join(racine, 'rapport-pseudonymisation.txt')
    const txt = join(racine, 'entretien-pseudonymise.txt')
    await choisirFormat(page, '.txt')
    await page.getByLabel('Locuteurs', { exact: true }).check()
    await page.getByLabel('Catégories thématiques', { exact: true }).check()
    await page.getByLabel(/Consulter le rapport de pseudonymisation/).check()
    await page.locator('.actions .exporter').click()
    const apercu = page.locator('.rapport-contenu')
    await expect(apercu).toContainText('Pseudonymisation appliquée')
    await expect(apercu).toContainText('Éléments conservés')
    await expect(apercu).toContainText('Éléments à vérifier manuellement')
    await destination(app, rapport)
    await page.getByRole('button', { name: 'Enregistrer le rapport', exact: true }).click()
    await attendreFichier(rapport)
    await destination(app, txt)
    await page.getByRole('button', { name: /Lancer l’export/ }).click()
    await attendreFichier(txt)
    const contenuTxt = readFileSync(txt, 'utf8')
    expect(contenuTxt).toContain('[Terrain]')
    expect(contenuTxt).toContain('[Nadia] habite')
    expect(contenuTxt).toContain('[Lieu] Lyon')
    expect(contenuTxt).not.toContain('Adresse privée')
    expect(readFileSync(rapport, 'utf8')).toContain("ne constitue pas une garantie d'anonymat")

    const sonal = join(racine, 'entretien.sonal')
    await choisirFormat(page, '.sonal')
    await destination(app, sonal)
    await page.locator('.actions .exporter').click()
    await attendreFichier(sonal)
    const contenuSonal = readFileSync(sonal, 'utf8')
    expect(contenuSonal).toContain('Code interne')
    expect(contenuSonal).toContain('A-17')
    expect(contenuSonal).toContain('data-obs="Vérifier le métier avant diffusion."')
    expect(contenuSonal).not.toContain('Karine évoque son déménagement.')

    const srt = join(racine, 'entretien.srt')
    await choisirFormat(page, '.srt')
    await destination(app, srt)
    await page.locator('.actions .exporter').click()
    await attendreFichier(srt)
    const contenuSrt = readFileSync(srt, 'utf8')
    expect(contenuSrt).toContain('00:00:10,000 --> 00:00:20,000')
    expect(contenuSrt).toContain('Enquêteur: Karine habite Lyon')
    expect(contenuSrt).toContain('Karine: Elle parle souvent')

    const vtt = join(racine, 'entretien.vtt')
    await choisirFormat(page, '.vtt')
    await destination(app, vtt)
    await page.locator('.actions .exporter').click()
    await attendreFichier(vtt)
    const contenuVtt = readFileSync(vtt, 'utf8')
    expect(contenuVtt).toContain('WEBVTT')
    expect(contenuVtt).toContain('[Terrain]')
    expect(contenuVtt).toContain('Karine évoque son déménagement.')
    expect(contenuVtt).not.toContain('Adresse privée')

    const docx = join(racine, 'entretien.docx')
    await choisirFormat(page, '.docx')
    await destination(app, docx)
    await page.locator('.actions .exporter').click()
    await attendreFichier(docx)
    const archiveDocx = await JSZip.loadAsync(readFileSync(docx))
    const xmlDocx = await archiveDocx.file('word/document.xml')!.async('string')
    expect(xmlDocx).toContain('Nadia')
    expect(xmlDocx).toContain('Terrain')
    expect(xmlDocx).toContain('Karine évoque son déménagement.')
    expect(xmlDocx).not.toContain('Adresse privée')
    expect(xmlDocx).not.toContain('Code interne')

    const pdf = join(racine, 'entretien.pdf')
    await choisirFormat(page, '.pdf')
    await destination(app, pdf)
    await page.locator('.actions .exporter').click()
    await attendreFichier(pdf)
    const contenuPdf = readFileSync(pdf)
    expect(contenuPdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(contenuPdf.length).toBeGreaterThan(5_000)
  } finally {
    await app.close()
  }
})
