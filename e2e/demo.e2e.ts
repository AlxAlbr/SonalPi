import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, ecrireSeedDemo } from './util'
import { choisirDossierExemple, configurerSourcesExemples, preparerApprentissage } from './exemples-util'

const catalogue = (page: Page) => page.getByRole('dialog', { name: 'Choisir un parcours pas à pas' })
function lireCorpus(dir: string) { return JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8')) }
async function ouvrirLibre(app: ElectronApplication, page: Page, dir: string, annote = false) {
  await choisirDossierExemple(app, dir)
  await page.locator('.carte-demo.exemples').click()
  const carte = page.locator('.exemple').filter({ has: page.getByRole('heading', { name: annote ? 'Corpus annoté' : 'Entretiens déjà importés', exact: true }) })
  await carte.getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
  const installation = page.locator('.installation-exemple')
  await expect(installation.locator('#emplacement-exemple')).toHaveValue(
    annote ? /[\\/]Corpus_annote$/ : /[\\/]Entretiens_transcrits$/,
  )
  await installation.getByRole('button', { name: 'Modifier…', exact: true }).click()
  await installation.getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
  await expect(installation).toHaveCount(0)
}

test('le catalogue se consulte sans créer de fichier ni changer le corpus courant', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-catalogue-'))
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    const avant = await page.evaluate(() => window.sonal.corpus.dossierCourant())
    await page.locator('.carte-demo.parcours').click()
    await expect(catalogue(page)).toBeVisible()
    await expect(catalogue(page).locator('.liste-pp li')).toHaveCount(4)
    await catalogue(page).getByRole('button', { name: /^Importer et traiter/ }).click()
    await expect(catalogue(page).locator('.liste-pp li')).toHaveCount(6)
    await expect(catalogue(page).locator('.liste-pp')).toHaveCSS('list-style-type', 'none')
    await expect(catalogue(page).locator('.liste-pp .num')).toHaveText(['1', '2', '3', '4', '5', '6'])
    await expect(page.locator('.modale-nouveau')).toHaveCount(0)
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toEqual(avant)
    expect((await page.evaluate(() => window.sonal.exemples.etat())).travaux).toHaveLength(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('.carte-demo.parcours')).toBeFocused()
  } finally { await app.close(); rmSync(profil, { recursive: true, force: true }) }
})

test('les quatre cartes partagent une ligne et s’adaptent aux petites fenêtres', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-catalogue-cartes-'))
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await page.setViewportSize({ width: 1100, height: 800 })
    await page.locator('.carte-demo.parcours').click()
    const cartes = catalogue(page).locator('.carte-parcours')
    await expect(cartes).toHaveCount(4)
    await expect(cartes.locator('strong')).toHaveText([
      'Préparer et suivre', 'Importer et traiter', 'Analyser et interpréter', 'Organiser et exporter',
    ])
    await expect(cartes.locator('span:first-of-type')).toHaveText([
      'Tableau de bord et documents du projet.', 'Import, notes et codage.', 'Thèmes, mots et comparaisons.', 'Cas, recueils et exports.',
    ])
    for (const [largeur, colonnes] of [[1100, 4], [740, 2], [360, 1]]) {
      await page.setViewportSize({ width: largeur, height: 800 })
      const positions = await cartes.evaluateAll((elements) => elements.map((e) => {
        const rect = e.getBoundingClientRect()
        return { haut: Math.round(rect.top), hauteur: Math.round(rect.height) }
      }))
      expect(new Set(positions.map((p) => p.haut)).size).toBe(4 / colonnes)
      expect(positions.slice(0, colonnes).every((p) => p.haut === positions[0].haut && p.hauteur === positions[0].hauteur)).toBe(true)
      expect(await catalogue(page).evaluate((d) => d.scrollWidth > d.clientWidth)).toBe(false)
    }
    await cartes.last().click()
    await expect(catalogue(page).locator('#detail-parcours h3')).toHaveText('Organiser et exporter')
    await expect(catalogue(page).locator('.liste-pp li')).toHaveCount(4)
  } finally { await app.close(); rmSync(profil, { recursive: true, force: true }) }
})

test('le catalogue réel reste utilisable au clavier dans une fenêtre étroite', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-catalogue-clavier-'))
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await page.setViewportSize({ width: 360, height: 640 })
    await page.locator('.carte-demo.parcours').click()
    await expect(catalogue(page)).toBeVisible()
    await expect(catalogue(page).getByRole('button', { name: 'Fermer les parcours', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(catalogue(page).locator('.carte-parcours').first()).toBeFocused()
    const deborde = await catalogue(page).evaluate((d) => d.scrollWidth > d.clientWidth)
    expect(deborde).toBe(false)
    await page.keyboard.press('Escape')
    await expect(page.locator('.carte-demo.parcours')).toBeFocused()
  } finally { await app.close(); rmSync(profil, { recursive: true, force: true }) }
})

test('Préparation laisse choisir l’emplacement de sa démo et ne l’inscrit jamais dans les Récents', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-creation-guide-'))
  const profil = join(racine, 'profil'), dir = join(racine, 'exercice'), sources = join(racine, 'sources')
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await configurerSourcesExemples(app, sources)
    await page.locator('.carte-demo.parcours').click()
    await catalogue(page).getByRole('button', { name: 'Commencer le parcours', exact: true }).click()
    await expect(page.locator('.installation-exemple')).toContainText('Préparer la démo « Préparer et suivre »')
    expect(existsSync(dir)).toBe(false)
    expect(existsSync(sources)).toBe(false)
    await page.locator('.installation-exemple').getByRole('button', { name: 'Retour aux parcours' }).click()
    await expect(catalogue(page).locator('.progression-pp')).toHaveText('0 étape sur 4')
    await choisirDossierExemple(app, dir)
    await catalogue(page).locator('.liste-pp').getByRole('button', { name: /Organiser le suivi/ }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Modifier…' }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Préparer et commencer' }).click()
    await expect(page.locator('.installation-exemple')).toHaveCount(0)
    await expect(page.locator('.spotlight-bulle')).toContainText('Organiser le suivi')
    const corpus = lireCorpus(dir)
    expect(corpus.nom).toBe('Préparer et suivre')
    expect(corpus.demo.usage).toBe('apprentissage')
    expect(corpus.demo.parcours.preparation.validees).toEqual([])
    expect(Object.keys(corpus.membership)).toHaveLength(0)
    const recents = await page.evaluate(() => window.sonal.corpus.recents())
    expect(recents.some((r) => r.type === 'local' && r.dir === dir)).toBe(false)
    await page.getByRole('button', { name: 'Revenir aux parcours', exact: true }).first().click()
    await expect(catalogue(page).locator('.progression-pp')).toHaveText('0 étape sur 4')
    await expect(catalogue(page).locator('select')).toHaveCount(0)
    await expect(catalogue(page).getByRole('button', { name: 'Retrouver mon dossier…', exact: true })).toHaveCount(0)
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})

test('une étape de Préparation choisie directement est rejointe après préparation de la démo', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-etape-preparation-'))
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await configurerSourcesExemples(app, join(racine, 'sources'))
    await choisirDossierExemple(app, join(racine, 'exercice'))
    await page.locator('.carte-demo.parcours').click()
    await catalogue(page).locator('.liste-pp').getByRole('button', { name: /Ajouter les documents du projet/ }).click()
    await expect(page.locator('.installation-exemple')).toContainText('Préparer la démo « Préparer et suivre »')
    await page.locator('.installation-exemple').getByRole('button', { name: 'Modifier…' }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Préparer et commencer' }).click()
    await expect(page.locator('.spotlight-bulle')).toContainText('Ajouter les documents du projet')
    expect(lireCorpus(join(racine, 'exercice')).demo.parcours.preparation.validees).toEqual([])
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})

test('l’entrée directe par Traitement prépare le corpus puis garde l’étape choisie', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-traitement-direct-'))
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await configurerSourcesExemples(app, join(racine, 'sources'))
    await choisirDossierExemple(app, join(racine, 'corpus'))
    await page.locator('.carte-demo.parcours').click()
    await catalogue(page).getByRole('button', { name: /^Importer et traiter/ }).click()
    await catalogue(page).getByRole('button', { name: /Prendre des notes à chaud/ }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Modifier…', exact: true }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Préparer et commencer', exact: true }).click()
    await expect(page.locator('.spotlight-bulle')).toContainText('Prendre des notes à chaud')
    await page.getByRole('button', { name: 'Revenir aux parcours', exact: true }).first().click()
    await catalogue(page).getByRole('button', { name: /^Préparer et suivre/ }).click()
    await expect(catalogue(page).locator('.progression-pp')).toHaveText('0 étape sur 4')
    await catalogue(page).locator('.liste-pp').getByRole('button', { name: /Organiser le suivi/ }).click()
    await expect(page.locator('.installation-exemple')).toBeVisible()
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})

test('l’exploration transcrite importe quatre entretiens et référence leurs audios', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-libre-'))
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    const sources = join(racine, 'sources'), dir = join(racine, 'corpus')
    await configurerSourcesExemples(app, sources)
    await ouvrirLibre(app, page, dir)
    await expect(page.locator('.corpus-ecran')).toBeVisible()
    await expect(page.locator('.carte-ent')).toHaveCount(4)
    const corpus = lireCorpus(dir)
    expect(corpus.demo).toMatchObject({ exemple: 'synth', usage: 'libre', racineSources: sources })
    expect(existsSync(join(dir, 'audio'))).toBe(false)
    for (const id of Object.keys(corpus.membership)) {
      const entretien = JSON.parse(readFileSync(join(dir, 'entretiens', `${id}.json`), 'utf8'))
      expect(entretien.meta.audioRef).toBe(join(sources, 'audio', `${corpus.membership[id].titre}.mp3`))
    }
    expect((await page.evaluate(() => window.sonal.corpus.recents())).some((r) => r.type === 'local' && r.dir === dir)).toBe(true)
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})

test('l’exemple annoté ouvre Synthèse sans guide et conserve les 324 annotations', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-annote-'))
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    const sources = join(racine, 'sources'), dir = join(racine, 'corpus')
    await configurerSourcesExemples(app, sources)
    await ouvrirLibre(app, page, dir, true)
    await expect(page.locator('.espace-analyse')).toBeVisible()
    await expect(page.locator('.spotlight-bulle')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Masquer le repère du corpus exemple' })).toBeVisible()
    const corpus = lireCorpus(dir)
    expect(corpus.demo.exemple).toBe('synth-annote')
    const entretiens = Object.keys(corpus.membership).map((id) => JSON.parse(readFileSync(join(dir, 'entretiens', `${id}.json`), 'utf8')))
    expect(entretiens.reduce((n, e) => n + e.annotations.length, 0)).toBe(324)
    expect(entretiens.every((e) => existsSync(e.meta.audioRef) && e.meta.audioRef.startsWith(sources))).toBe(true)
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})

test('reprendre une exploration ne réimporte pas les entretiens renommés ou supprimés', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-reprise-exemple-'))
  const profil = join(racine, 'profil'), dir = join(racine, 'corpus')
  let app = await lancer(profil)
  try {
    let page = await app.firstWindow()
    await attendreAccueil(page)
    await configurerSourcesExemples(app, join(racine, 'sources'))
    await ouvrirLibre(app, page, dir)
    await app.close()
    const corpus = lireCorpus(dir)
    const [premier, retire] = Object.keys(corpus.membership)
    corpus.membership[premier].titre = 'Mon titre conservé'
    delete corpus.membership[retire]
    corpus.ordreEntretiens = corpus.ordreEntretiens.filter((id: string) => id !== retire)
    writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(corpus))
    rmSync(join(dir, 'entretiens', `${retire}.json`))
    app = await lancer(profil, { preserverSettings: true })
    page = await app.firstWindow()
    await attendreAccueil(page)
    await page.locator('.carte-demo.exemples').click()
    await page.locator('.exemple').filter({ has: page.getByRole('heading', { name: 'Entretiens déjà importés', exact: true }) }).getByRole('button', { name: 'Reprendre mon corpus', exact: true }).click()
    await expect(page.locator('.carte-ent')).toHaveCount(3)
    expect(Object.values(lireCorpus(dir).membership).map((m: any) => m.titre)).toContain('Mon titre conservé')
    await expect(page.locator('.installation-exemple')).toHaveCount(0)
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})

test('une nouvelle session retrouve les démos enregistrées et leurs acquis sans lancer le guide', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-reprise-exercice-'))
  const profil = join(racine, 'profil'), dir = join(racine, 'exercice'), sources = join(racine, 'sources')
  ecrireSeedDemo(dir)
  const corpus = lireCorpus(dir)
  corpus.demo = { id: 'exercice-traitement', exemple: 'synth', usage: 'apprentissage',
    racineSources: sources, parcoursApprentissage: 'traitement', dernierParcoursId: 'traitement',
    parcours: { traitement: { validees: ['coder'] } } }
  writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(corpus))
  ecrireSeedDemo(join(profil, 'corpus'))
  writeFileSync(join(profil, 'settings.json'), JSON.stringify({
    recents: [join(profil, 'corpus')],
    exemples: { sources, travaux: [{ id: corpus.demo.id, dir, nom: 'Exercice',
      exemple: 'synth', usage: 'apprentissage', parcoursApprentissage: 'traitement' }],
    apprentissages: { traitement: corpus.demo.id }, libres: {} },
  }))
  const app = await lancer(profil, { preserverSettings: true })
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    expect((await page.evaluate(() => window.sonal.corpus.recents())).some((r) => r.type === 'local' && r.dir === dir)).toBe(false)
    await page.locator('.carte-demo.parcours').click()
    await catalogue(page).getByRole('button', { name: /^Importer et traiter/ }).click()
    await expect(catalogue(page).locator('.progression-pp')).toHaveText('1 étape sur 6')
    await expect(catalogue(page).getByRole('button', { name: 'Recommencer cette démo' })).toBeVisible()
    expect(lireCorpus(dir).demo.parcours.traitement.validees).toEqual(['coder'])
    await expect(page.locator('.spotlight-bulle')).toHaveCount(0)
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})

test('ouvrir manuellement un corpus d’apprentissage le rattache sans bascule ni guide automatique', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-rattachement-'))
  const dir = join(racine, 'exercice')
  ecrireSeedDemo(dir)
  const corpus = lireCorpus(dir)
  corpus.demo = { id: 'exercice-traitement', exemple: 'synth', usage: 'apprentissage',
    racineSources: join(racine, 'sources'), parcoursApprentissage: 'traitement',
    parcours: { traitement: { validees: ['coder'] } } }
  writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(corpus))
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    const avant = await page.evaluate(() => window.sonal.corpus.dossierCourant())
    await choisirDossierExemple(app, dir)
    await page.locator('.ouvrir-corpus').click()
    await expect(catalogue(page)).toBeVisible()
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toEqual(avant)
    await expect(page.locator('.spotlight-bulle')).toHaveCount(0)
    await catalogue(page).getByRole('button', { name: /^Importer et traiter/ }).click()
    await expect(catalogue(page).getByRole('button', { name: 'Recommencer cette démo' })).toBeVisible()
    expect((await page.evaluate(() => window.sonal.corpus.recents())).some((r) => r.type === 'local' && r.dir === dir)).toBe(false)
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})

test('un corpus déplacé se retrouve sans préparation et sans modifier le corpus actif avant reprise', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-exercice-deplace-'))
  const profil = join(racine, 'profil'), dir = join(racine, 'ancien'), nouveau = join(racine, 'deplace')
  let app = await lancer(profil)
  try {
    let page = await app.firstWindow()
    await attendreAccueil(page)
    await preparerApprentissage(app, page, join(racine, 'sources'), dir, 'preparation')
    await app.close()
    const id = lireCorpus(dir).demo.id
    renameSync(dir, nouveau)
    app = await lancer(profil, { preserverSettings: true })
    page = await app.firstWindow()
    await attendreAccueil(page)
    const avant = await page.evaluate(() => window.sonal.corpus.dossierCourant())
    await page.locator('.carte-demo.parcours').click()
    await expect(catalogue(page)).toContainText('Nous ne retrouvons plus cette démo')
    await choisirDossierExemple(app, nouveau)
    await catalogue(page).getByRole('button', { name: 'Retrouver mon dossier…', exact: true }).click()
    await expect(catalogue(page).getByRole('button', { name: 'Recommencer cette démo' })).toBeVisible()
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toEqual(avant)
    await catalogue(page).getByRole('button', { name: 'Commencer le parcours', exact: true }).click()
    await expect(page.locator('.spotlight-bulle')).toContainText('Organiser le suivi')
    expect(lireCorpus(nouveau).demo.id).toBe(id)
    await expect(page.locator('.installation-exemple')).toHaveCount(0)
    await expect(page.locator('.modale-nouveau')).toHaveCount(0)
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})

for (const parcours of ['preparation', 'traitement'] as const) {
  test(`recommencer ${parcours} présente le bilan avant de lancer la première étape`, async () => {
    const racine = mkdtempSync(join(tmpdir(), 'sonal-recommencer-exercice-'))
    const profil = join(racine, 'profil'), sources = join(racine, 'sources'), dir = join(racine, parcours)
    const app = await lancer(profil)
    try {
      const page = await app.firstWindow()
      await attendreAccueil(page)
      const autreCorpus = readFileSync(join(profil, 'corpus', 'corpus.crp'), 'utf8')
      await preparerApprentissage(app, page, sources, dir, parcours)
      const id = lireCorpus(dir).demo.id
      if (parcours === 'preparation') {
        await page.locator('[data-tour="ouvrir-tableau-bord"]').click()
        await page.locator('[data-tour="cellule-problematique"]').click()
        await page.locator('[data-tour="note-cellule-tableau"]').fill('Une question à effacer au redémarrage.')
        await page.locator('[data-tour="appliquer-cellule-tableau"]').click()
      } else {
        await app.evaluate(({ dialog }, fichiers) => {
          let index = 0
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fichiers[index++]] })
        }, [join(sources, 'srt', '1Coordinatrice.srt'), join(sources, 'audio', '1Coordinatrice.mp3')])
        await page.locator('[data-tour="ajouter-entretien"]').click()
        await page.locator('[data-tour="zone-texte"]').click()
        await page.locator('[data-tour="zone-audio"]').click()
        await page.locator('.modale-ajout [data-tour="valider"]').click()
      }
      await expect(page.locator('.fini-pp')).toBeVisible()
      await page.getByTestId('resume-parcours-global').getByRole('button', { name: 'Voir les étapes ou changer de parcours' }).click()
      await expect(catalogue(page).locator('.progression-pp')).toContainText('1 étape')
      const avant = readFileSync(join(dir, 'corpus.crp'), 'utf8')
      page.once('dialog', (dialogue) => dialogue.dismiss())
      await catalogue(page).getByRole('button', { name: 'Recommencer cette démo', exact: true }).click()
      await expect(catalogue(page)).toBeVisible()
      expect(readFileSync(join(dir, 'corpus.crp'), 'utf8')).toBe(avant)
      page.once('dialog', (dialogue) => dialogue.accept())
      await catalogue(page).getByRole('button', { name: 'Recommencer cette démo', exact: true }).click()
      const bilan = page.getByRole('dialog', { name: 'La démo a été remise à zéro' })
      await expect(bilan).toBeVisible()
      await expect(bilan.getByRole('heading')).toBeFocused()
      await expect(bilan).toContainText(dir)
      await expect(bilan).toContainText('Toutes ses étapes sont à refaire.')
      await expect(page.locator('.spotlight-bulle')).not.toBeVisible()
      expect(lireCorpus(dir).demo.id).toBe(id)
      expect(lireCorpus(dir).demo.parcours[parcours].validees).toEqual([])
      expect(Object.keys(lireCorpus(dir).membership)).toHaveLength(0)
      expect(JSON.stringify(lireCorpus(dir))).not.toContain('Une question à effacer')
      expect(readFileSync(join(profil, 'corpus', 'corpus.crp'), 'utf8')).toBe(autreCorpus)
      if (parcours === 'preparation') {
        await bilan.getByRole('button', { name: 'Commencer la première étape', exact: true }).click()
      } else {
        await bilan.getByRole('button', { name: 'Revenir aux parcours', exact: true }).click()
        await expect(catalogue(page).locator('.progression-pp')).toHaveText('0 étape sur 6')
        await page.keyboard.press('Escape')
        await expect(page.locator('.spotlight-bulle')).not.toBeVisible()
        await page.getByTestId('resume-parcours-global').getByRole('button', { name: 'Voir les étapes ou changer de parcours' }).click()
        await catalogue(page).getByRole('button', { name: 'Commencer le parcours', exact: true }).click()
      }
      await expect(bilan).not.toBeVisible()
      await expect(page.locator('.spotlight-bulle')).toContainText(parcours === 'preparation' ? 'Organiser le suivi' : 'Charger un entretien')
    } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
  })
}

test('un dossier contenant des données est refusé, sans créer de corpus ni valider d’étape', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-refus-exercice-'))
  const dir = mkdtempSync(join(racine, 'travail-')), sources = join(racine, 'sources')
  writeFileSync(join(dir, 'questions.txt'), 'Mon travail')
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await configurerSourcesExemples(app, sources)
    await choisirDossierExemple(app, dir)
    await page.locator('.carte-demo.parcours').click()
    await catalogue(page).getByRole('button', { name: 'Commencer le parcours', exact: true }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Modifier…' }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Préparer et commencer' }).click()
    await expect(page.locator('.installation-exemple').getByRole('alert')).toContainText('dossier vide')
    expect(existsSync(join(dir, 'corpus.crp'))).toBe(false)
    expect(existsSync(sources)).toBe(false)
    expect((await page.evaluate(() => window.sonal.exemples.etat())).travaux).toHaveLength(0)
    expect(readFileSync(join(dir, 'questions.txt'), 'utf8')).toBe('Mon travail')
  } finally { await app.close(); rmSync(racine, { recursive: true, force: true }) }
})
