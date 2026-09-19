import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CorpusFichier } from '../src/shared/format'
import { lancer, entrerCorpus } from './util'
import { ecrireSeedDemo } from '../test/seedDemo'

// Démarrage à froid d'Electron : les trois scénarios tournent l'un après
// l'autre pour ne pas multiplier les lancements concurrents.
test.describe.configure({ mode: 'serial' })

/**
 *  Export au niveau du CORPUS, dans la vraie app : bouton de la barre des
 *  onglets → modale en 4 étapes (sélection, formats/options, traitement,
 *  résumé). Les dialogs natifs sont STUBBÉS via electronApp.evaluate (le
 *  showSaveDialog renvoie le dossier de destination). Vérifications disque :
 *  un fichier par entretien, index récapitulatif, DOCX combiné, succès
 *  partiel avec raison expliquée, rapport détaillé.
 *  (La granularité du lot — annulation, médias, échec d'écriture — et le PDF
 *  combiné sont couverts en unitaires sur le service et les générateurs.)
 */

/** Entretien valide minimal pour le lot (texte simple, pas d'audio). */
function entretienDeux(): unknown {
  return {
    formatVersion: 3,
    lastModified: new Date().toISOString(),
    corpsTexte: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Deuxième entretien de test.' }] }],
    },
    annotations: [],
    ancres: [],
    locuteurs: [{ index: 1, nom: 'Enquêteur', valeursLoc: {}, personneRef: null }],
    meta: { valeursGen: {}, audioRef: null },
  }
}

/** Ajoute un deuxième entretien au corpus seedé, valide ou cassé (version
 *  non prise en charge → échec typé « version » à l'export du lot). */
function ajouterEntretien(dirCorpus: string, id: string, titre: string, casse = false): void {
  const chemin = join(dirCorpus, 'corpus.json')
  const corpus = JSON.parse(readFileSync(chemin, 'utf8')) as CorpusFichier
  corpus.membership[id] = { titre, date: null, lastModified: new Date().toISOString() }
  writeFileSync(chemin, JSON.stringify(corpus, null, 2))
  mkdirSync(join(dirCorpus, 'entretiens'), { recursive: true })
  const contenu = casse ? JSON.stringify({ formatVersion: 99 }) : JSON.stringify(entretienDeux())
  writeFileSync(join(dirCorpus, 'entretiens', `${id}.json`), contenu, 'utf8')
}

/** Liste triée du dossier (l'ordre de readdir est indéterminé). */
function lister(d: string): string[] {
  return readdirSync(d).sort()
}

test('export complet : fichier par entretien + index + DOCX combiné', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-exp-'))
  const destination = join(dir, 'sortie')
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await app.evaluate(({ dialog }, args) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: args.destination })
  }, { destination })

  // Bouton de la barre des onglets → modale dédiée, étape sélection.
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Exporter ce corpus' }).click()
  const modale = page.locator('.modale-export-corpus')
  await expect(modale).toBeVisible()
  await expect(modale.locator('.option', { hasText: 'Tous les entretiens' })).toBeChecked()
  await expect(modale.locator('.ligne-entretien')).toHaveCount(1)

  // Étape 2 : TXT déjà coché ; on ajoute le DOCX combiné.
  await modale.getByRole('button', { name: /Suivant/ }).click()
  await expect(modale.locator('.etape')).toContainText('Formats et éléments')
  await modale.locator('.option', { hasText: 'Document combiné (.docx)' }).click()
  await modale.locator('.actions .exporter').click()

  // Résumé final : export terminé, entretien suivi.
  await expect(modale.locator('.etape', { hasText: 'Export terminé' })).toBeVisible({ timeout: 20_000 })
  await expect(modale.locator('.resume-ligne', { hasText: 'Entretien Karine' })).toBeVisible()

  // Sur disque : un fichier par entretien, l'index, le DOCX combiné (ZIP).
  expect(lister(destination)).toEqual(['Entretien Karine_pseudonymise.txt', '_index.txt', 'corpus.docx'])
  const txt = readFileSync(join(destination, 'Entretien Karine_pseudonymise.txt'), 'utf8')
  expect(txt).toContain('Karine habite Lyon')
  const index = readFileSync(join(destination, '_index.txt'), 'utf8')
  expect(index).toContain('Nom du corpus : corpus')
  expect(index).toContain('1 entretien exporté.')
  expect(index).toContain('- Entretien Karine — 17 mots')
  const docx = readFileSync(join(destination, 'corpus.docx'))
  expect(docx.subarray(0, 2).toString('ascii')).toBe('PK') // archive zip valide

  await app.close()
})

test('sélection partielle + rapport détaillé enregistré', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-exp2-'))
  const dirCorpus = join(dir, 'corpus')
  // Seed « Karine » (un entretien), puis un deuxième valide.
  ecrireSeedDemo(dirCorpus)
  ajouterEntretien(dirCorpus, 'e2', 'Entretien deux')

  const destination = join(dir, 'sortie')
  const cheminRapport = join(dir, 'rapport-corpus.txt')
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await app.evaluate(({ dialog }, args) => {
    let appel = 0
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: appel++ === 0 ? args.cheminRapport : args.destination,
    })
  }, { destination, cheminRapport })

  await page.locator('.onglets-corpus').getByRole('button', { name: 'Exporter ce corpus' }).click()
  const modale = page.locator('.modale-export-corpus')
  await expect(modale).toBeVisible()
  await expect(modale.locator('.ligne-entretien')).toHaveCount(2)

  // On décoche le deuxième entretien de la grille.
  await modale.locator('.ligne-entretien', { hasText: 'Entretien deux' }).locator('input').uncheck()
  await modale.getByRole('button', { name: /Suivant/ }).click()
  await modale.locator('.option', { hasText: 'Consulter le rapport de pseudonymisation' }).click()
  await modale.locator('.actions .exporter').click()

  await expect(modale.locator('.etape', { hasText: 'Rapport de pseudonymisation avant' })).toBeVisible()
  await expect(modale.locator('.rapport-contenu')).toContainText('Entretien Karine')
  await modale.getByRole('button', { name: 'Enregistrer le rapport' }).click()
  await expect(modale.locator('.message-information')).toContainText('Rapport enregistré')
  await modale.getByRole('button', { name: /Lancer l’export/ }).click()

  await expect(modale.locator('.etape', { hasText: 'Export terminé' })).toBeVisible({ timeout: 20_000 })

  expect(lister(destination)).toEqual(['Entretien Karine_pseudonymise.txt', '_index.txt'])
  const index = readFileSync(join(destination, '_index.txt'), 'utf8')
  expect(index).toContain('1 entretien exporté.')
  expect(index).not.toContain('Entretien deux')
  const rapport = readFileSync(cheminRapport, 'utf8')
  expect(rapport).toContain('Entretien : Entretien Karine')
  expect(rapport).toContain('Rapport de pseudonymisation')

  await app.close()
})

test('succès partiel : entretien cassé sauté, expliqué, absent de l’index', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-exp3-'))
  const dirCorpus = join(dir, 'corpus')
  ecrireSeedDemo(dirCorpus)
  ajouterEntretien(dirCorpus, 'e2', 'Entretien deux')

  const destination = join(dir, 'sortie')
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  // Le fichier est cassé APRÈS le lancement (corrompre avant le démarrage
  // ferait échouer l'ouverture du corpus elle-même, hors périmètre de l'export).
  writeFileSync(join(dirCorpus, 'entretiens', 'e2.json'), JSON.stringify({ formatVersion: 99 }))

  await app.evaluate(({ dialog }, args) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: args.destination })
  }, { destination })

  await page.locator('.onglets-corpus').getByRole('button', { name: 'Exporter ce corpus' }).click()
  const modale = page.locator('.modale-export-corpus')
  await expect(modale).toBeVisible()
  await modale.getByRole('button', { name: /Suivant/ }).click()
  await modale.locator('.actions .exporter').click()

  await expect(modale.locator('.etape', { hasText: 'Export terminé' })).toBeVisible({ timeout: 20_000 })

  // Le lot continue : e1 réussit, e2 échoue avec la raison affichée.
  await expect(modale.locator('.resume-ligne.succes', { hasText: 'Entretien Karine' })).toBeVisible()
  await expect(modale.locator('.resume-ligne.echec', { hasText: 'Entretien deux' })).toBeVisible()
  await expect(modale.locator('.resume-ligne.echec')).toContainText('version')

  const index = readFileSync(join(destination, '_index.txt'), 'utf8')
  expect(index).toContain('1 entretien exporté.')
  expect(index).not.toContain('Entretien deux')

  await app.close()
})
