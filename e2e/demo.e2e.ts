import { test, expect } from '@playwright/test'
import { mkdtempSync, readdirSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, attendreCorpus } from './util'

/**
 * Mini Corpus Test (plan-tutoriel §11-12, plan-reference-audio §7) : depuis
 * l'Accueil, les deux cartes passent par la MODALE À DEUX DOSSIERS (sources à
 * matérialiser + corpus de travail) puis construisent le corpus de démo via le
 * vrai pipeline d'import. « En autonomie » = 4 entretiens + audio d'un coup ;
 * « pas à pas » = corpus VIDE de départ (les étapes remplissent ensuite).
 *
 * Modèle par RÉFÉRENCE (§4) : les sources sont copiées UNE fois dans le dossier
 * choisi (demo:copierSources) ; le corpus RÉFÉRENCE leurs fichiers — aucune
 * copie d'audio dans le corpus (seuls les PNG d'onde dans png/).
 *
 * Gardien contre la dérive builder/importeur (§16) : la démo est produite par le
 * même code qu'un corpus utilisateur → les invariants sont ceux de n'importe quel
 * corpus (membership, audio lié).
 */

/** Stub des DEUX dialogues de la modale démo : 1er = sources, 2e = corpus. */
async function stuberDeuxDossiers(
  app: import('@playwright/test').ElectronApplication,
  sources: string,
  corpus: string,
): Promise<void> {
  await app.evaluate(({ dialog }, args) => {
    const dossiers = [args.sources, args.corpus]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [dossiers[Math.min(i++, dossiers.length - 1)]],
    })
  }, { sources, corpus })
}

/** Remplit la modale à deux dossiers (choisit les deux, valide). */
async function preparerParModale(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('.modale-demo')).toBeVisible()
  await page.locator('.modale-demo .choisir-dossier').first().click()
  await page.locator('.modale-demo .choisir-dossier').nth(1).click()
  await page.locator('.modale-demo .valider').click()
}

test('« En autonomie » : deux dossiers choisis, sources copiées, audio RÉFÉRENCÉ (zéro copie)', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-demo-a-'))
  const dirSources = mkdtempSync(join(tmpdir(), 'sonal-demo-sources-a-'))
  const dirCorpus = mkdtempSync(join(tmpdir(), 'sonal-demo-corpus-a-'))
  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)

  await stuberDeuxDossiers(app, dirSources, dirCorpus)
  await page.locator('.carte-demo.autonomie').click()
  await preparerParModale(page)
  await attendreCorpus(page)

  // 4 entretiens importés (E1..E4), avec les titres du plan §10.
  await expect(page.locator('.carte-ent')).toHaveCount(4)
  await expect(page.locator('.carte-ent .ent-titre')).toContainText([
    'Fatima',
    'Sylvie',
    'Marc',
    'Thomas & Yanis',
  ])

  // (i) Les sources sont COPIÉES dans le dossier choisi (srt/ + audio/ intacts).
  await expect
    .poll(() => readdirSync(join(dirSources, 'srt')).sort())
    .toEqual(['E1.srt', 'E2.srt', 'E3.srt', 'E4.srt'])
  await expect
    .poll(() => readdirSync(join(dirSources, 'audio')).sort())
    .toEqual(['E1.mp3', 'E2.mp3', 'E3.mp3', 'E4.mp3'])

  // (ii) AUCUNE copie d'audio dans le corpus — seuls les PNG d'onde dans png/.
  const audioDuCorpus = () =>
    existsSync(join(dirCorpus, 'audio')) ? readdirSync(join(dirCorpus, 'audio')) : []
  const pngsDuCorpus = () =>
    existsSync(join(dirCorpus, 'png')) ? readdirSync(join(dirCorpus, 'png')) : []
  await expect.poll(audioDuCorpus).toEqual([])
  // Les ondes sont régénérées en fond (regenererOndesManquantes) → poll.
  await expect.poll(() => pngsDuCorpus().length).toBe(4)

  // (iii) Les audioRef = chemins ABSOLUS dans le dossier sources choisi.
  const refs = readdirSync(join(dirCorpus, 'entretiens'))
    .filter((n) => n.endsWith('.json'))
    .map((n) => JSON.parse(readFileSync(join(dirCorpus, 'entretiens', n), 'utf8')).meta.audioRef)
    .sort()
  expect(refs).toEqual(
    ['E1', 'E2', 'E3', 'E4'].map((k) => join(dirSources, 'audio', `${k}.mp3`)).sort(),
  )

  await app.close()
})

test('« Découverte pas à pas » démarre sur un corpus vide', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-demo-p-'))
  const dirSources = mkdtempSync(join(tmpdir(), 'sonal-demo-sources-p-'))
  const dirCorpus = mkdtempSync(join(tmpdir(), 'sonal-demo-corpus-p-'))
  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)

  await stuberDeuxDossiers(app, dirSources, dirCorpus)
  await page.locator('.carte-demo.pas-a-pas').click()
  await preparerParModale(page)
  await attendreCorpus(page)

  // Mode pas-à-pas : corpus amorcé VIDE (les étapes rempliront) — 0 entretien.
  await expect(page.locator('.carte-ent')).toHaveCount(0)

  await app.close()
})
