import { test, expect, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import { ecrireSeedDemo, entrerCorpus, lancer, ouvrirOrganisation } from './util'

function preparerCorpus(racine: string) {
  const dossier = join(racine, 'corpus')
  ecrireSeedDemo(dossier)
  const chemin = join(dossier, 'corpus.json')
  const corpus = JSON.parse(readFileSync(chemin, 'utf8')) as CorpusFichier
  const maintenant = new Date().toISOString()
  corpus.membership.e2 = { titre: 'Entretien association', date: null, lastModified: maintenant }
  corpus.codebook.cat_001.description = 'Liens familiaux et entraide.'
  corpus.variables = {
    public: { id: 'public', lib: 'Association', portee: 'entretien', priv: false, ordre: 1, vExport: 1, modalites: [{ id: 'm1', lib: 'Entraide', mExport: 1 }] },
    prive: { id: 'prive', lib: 'Adresse privée', portee: 'entretien', priv: true, ordre: 2, vExport: 1, modalites: [{ id: 'm2', lib: 'Adresse confidentielle', mExport: 1 }] },
  }
  corpus.attributsCas = {
    public: { id: 'public', lib: 'Statut', type: 'texte', priv: false, ordre: 1, modalites: [] },
    prive: { id: 'prive', lib: 'Identité privée', type: 'texte', priv: true, ordre: 2, modalites: [] },
  }
  corpus.cas = {
    regle: {
      id: 'regle', nom: 'Association Entraide', memo: 'Comparer les deux entretiens.',
      creeLe: maintenant, modifieLe: maintenant,
      regles: [{ type: 'entretiens', entretienIds: ['e1', 'e2'] }], rattachements: [],
      valeursAttributsSaisis: { public: 'Active', prive: 'Identité confidentielle' },
    },
    manuel: {
      id: 'manuel', nom: 'Parcours de Karine', memo: 'Mémo du cas manuel.',
      creeLe: maintenant, modifieLe: maintenant, regles: [],
      rattachements: [{ id: 'rattachement', source: { entretienId: 'e1', repereId: 'repere' }, provenance: 'manuel', creeLe: maintenant }],
    },
  }
  writeFileSync(chemin, JSON.stringify(corpus, null, 2))
  const fichier = join(dossier, 'entretiens', 'e1.json')
  const entretien = JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier
  entretien.meta.valeursGen = { public: 'm1', prive: 'm2' }
  entretien.meta.audioRef = join(racine, 'enregistrement.wav')
  writeFileSync(entretien.meta.audioRef, 'Média fictif, à ne pas copier.')
  entretien.annotations = [
    { id: 'codage', type: 'codage', from: 1, to: 7, auteur: 'Documentation', code: 'cat_001' },
    { id: 'commentaire', type: 'commentaire', from: 8, to: 14, auteur: 'Documentation', texte: 'Commentaire sur Karine.' },
    { id: 'pseudo', type: 'anon', from: 1, to: 7, auteur: 'Documentation', etat: 'anonymise', pseudo: 'Nadia' },
  ]
  entretien.reperesPassages = [{ id: 'repere', from: 1, to: 7 }]
  entretien.locuteurs[1].pseudo = 'Nadia'
  entretien.locuteurs[1].pseudoEtat = 'confirme'
  writeFileSync(fichier, JSON.stringify(entretien, null, 2))
  writeFileSync(join(dossier, 'entretiens', 'e2.json'), JSON.stringify({
    ...entretien,
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Une association accueille les bénévoles.' }] }] },
    annotations: [], reperesPassages: [],
  }))
}

async function destination(app: ElectronApplication, dossier: string | null) {
  await app.evaluate(({ dialog }, sortie) => {
    dialog.showSaveDialog = async () => ({ canceled: sortie === null, filePath: sortie ?? '' })
  }, dossier)
}

function avecBase(dossier: string, verifier: (base: DatabaseSync) => void) {
  const base = new DatabaseSync(join(dossier, 'data.qda'), { readOnly: true })
  try {
    expect(base.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    verifier(base)
  } finally {
    base.close()
  }
}

test('manuel : transférer les textes originaux, codages, commentaires, cas et attributs publics', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-qualcoder-'))
  preparerCorpus(racine)
  const app = await lancer(racine, { executablePath: process.env.QUALCODER_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1440, 1000))
    await entrerCorpus(page)
    const avant = readFileSync(join(racine, 'corpus', 'corpus.json'), 'utf8')
    await ouvrirOrganisation(page, 'export')
    const espace = page.locator('.export-corpus')
    await espace.getByRole('radio', { name: 'Projet QualCoder (.qda)' }).check()
    await expect(espace.locator('.cas-export')).toHaveCount(2)
    await expect(espace.getByLabel('Tous les cas')).toBeChecked()
    await expect(espace.locator('.resultats-export')).toContainText('avec 2 cas')
    await expect(espace.locator('.resultats-export')).toContainText('sans pseudonymisation')
    await expect(espace.getByLabel('Appliquer la pseudonymisation')).toHaveCount(0)
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await espace.screenshot({ path: 'docs/user/medias/qualcoder-reglages.png' })
    }
    const complet = join(racine, 'associations.qda')
    await destination(app, complet)
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.etape')).not.toContainText('Export en cours', { timeout: 25_000 })
    expect(await espace.locator('.resultats-export').innerText()).not.toContain('en échec')
    await expect(espace.locator('.etape')).toContainText('Projet QualCoder créé')
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await espace.locator('.resultats-export > .corps').screenshot({ path: 'docs/user/medias/qualcoder-resultat.png' })
    }
    expect(readdirSync(complet).sort()).toEqual(['audio', 'data.qda', 'documents', 'images', 'video'])
    for (const nom of ['audio', 'documents', 'images', 'video']) expect(readdirSync(join(complet, nom))).toEqual([])
    avecBase(complet, (base) => {
      expect(base.prepare('SELECT name FROM source ORDER BY id').all()).toEqual([
        { name: 'Entretien Karine.txt' }, { name: 'Entretien association.txt' },
      ])
      const texte = base.prepare('SELECT fulltext FROM source WHERE id = 1').get()!.fulltext as string
      expect(texte).toContain('Karine habite Lyon')
      expect(texte).not.toContain('Nadia')
      expect(base.prepare('SELECT seltext, pos0, pos1 FROM code_text').get()).toEqual({ seltext: 'Karine', pos0: 0, pos1: 6 })
      expect(base.prepare('SELECT memo, owner FROM annotation').get()).toEqual({ memo: 'Commentaire sur Karine.', owner: 'Documentation' })
      expect(base.prepare("SELECT memo FROM code_name WHERE name = 'Famille'").get()).toEqual({ memo: 'Liens familiaux et entraide.' })
      expect(base.prepare('SELECT name FROM cases ORDER BY caseid').all()).toEqual([{ name: 'Association Entraide' }, { name: 'Parcours de Karine' }])
      expect(base.prepare('SELECT caseid, fid FROM case_text ORDER BY caseid, fid').all()).toEqual([
        { caseid: 1, fid: 1 }, { caseid: 1, fid: 2 }, { caseid: 2, fid: 1 },
      ])
      expect(base.prepare('SELECT name, value FROM attribute ORDER BY attrid').all()).toEqual([
        { name: 'Association', value: 'Entraide' }, { name: 'Association', value: 'Entraide' }, { name: 'Cas — Statut', value: 'Active' },
      ])
      const definitions = base.prepare('SELECT name FROM attribute_type').all().map((ligne) => ligne.name)
      expect(definitions).not.toContain('Adresse privée')
      expect(definitions).not.toContain('Cas — Identité privée')
    })
    await espace.getByRole('button', { name: 'Préparer un autre export' }).click()
    await espace.locator('.ligne-entretien', { hasText: 'Entretien association' }).locator('input').uncheck()
    await espace.locator('.cas-export', { hasText: 'Parcours de Karine' }).locator('input').uncheck()
    const partiel = join(racine, 'selection.qda')
    await destination(app, partiel)
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.etape')).toContainText('Projet QualCoder créé')
    avecBase(partiel, (base) => {
      expect(base.prepare('SELECT name FROM source').all()).toHaveLength(1)
      expect(base.prepare('SELECT name FROM cases').all()).toEqual([{ name: 'Association Entraide' }])
      expect(base.prepare('SELECT fid FROM case_text').all()).toEqual([{ fid: 1 }])
    })
    expect(readFileSync(join(racine, 'corpus', 'corpus.json'), 'utf8')).toBe(avant)
  } finally {
    await app.close()
  }
})

test('manuel : annuler, refuser une destination occupée puis créer un projet sans cas', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-qualcoder-reprise-'))
  preparerCorpus(racine)
  const app = await lancer(racine, { executablePath: process.env.QUALCODER_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await ouvrirOrganisation(page, 'export')
    const espace = page.locator('.export-corpus')
    await espace.getByRole('radio', { name: 'Projet QualCoder (.qda)' }).check()
    await espace.getByLabel('Tous les entretiens').uncheck()
    await expect(espace.locator('.actions .exporter')).toBeDisabled()
    await espace.getByLabel('Tous les entretiens').check()
    await espace.getByLabel('Tous les cas').uncheck()
    await destination(app, null)
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.etape')).toContainText('Export QualCoder annulé')
    await espace.getByRole('button', { name: 'Préparer un autre export' }).click()
    const protege = join(racine, 'corpus')
    const original = readFileSync(join(protege, 'corpus.json'), 'utf8')
    await destination(app, protege)
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.etape')).toContainText('Export QualCoder en échec')
    await expect(espace.getByRole('alert')).toContainText('contient déjà des fichiers')
    expect(readFileSync(join(protege, 'corpus.json'), 'utf8')).toBe(original)
    expect(existsSync(join(protege, 'data.qda'))).toBe(false)
    await espace.getByRole('button', { name: 'Préparer un autre export' }).click()
    const sortie = join(racine, 'sans-cas.qda')
    await destination(app, sortie)
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.etape')).toContainText('Projet QualCoder créé')
    avecBase(sortie, (base) => {
      expect(base.prepare('SELECT name FROM cases').all()).toEqual([])
      expect(base.prepare('SELECT name FROM source').all()).toHaveLength(2)
    })
  } finally {
    await app.close()
  }
})

test('manuel : une source illisible empêche le transfert QualCoder', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-qualcoder-source-'))
  preparerCorpus(racine)
  const sortie = join(racine, 'incomplet.qda')
  const app = await lancer(racine, { executablePath: process.env.QUALCODER_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    writeFileSync(join(racine, 'corpus', 'entretiens', 'e2.json'), JSON.stringify({ formatVersion: 99 }))
    await ouvrirOrganisation(page, 'export')
    const espace = page.locator('.export-corpus')
    await espace.getByRole('radio', { name: 'Projet QualCoder (.qda)' }).check()
    await destination(app, sortie)
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.etape')).toContainText('Export QualCoder en échec')
    await expect(espace.getByRole('alert')).toContainText('version')
    expect(existsSync(sortie)).toBe(false)
  } finally {
    await app.close()
  }
})
