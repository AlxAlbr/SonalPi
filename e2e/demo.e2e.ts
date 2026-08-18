import { test, expect } from '@playwright/test'
import { mkdtempSync, readdirSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, attendreCorpus } from './util'

/**
 * Mini Corpus Test (plan-tutoriel §11-12, plan-reference-audio §7, J7) : depuis
 * l'Accueil, les cartes passent par la MODALE ADAPTATIVE puis construisent le
 * corpus de test via le vrai pipeline d'import. Chaque mode a son PROPRE dossier
 * de corpus, choisi DIRECTEMENT par l'utilisateur (un dossier = un corpus) :
 *   carte « En autonomie » → le corpus de test « autonomie » (4 entretiens + audio) ;
 *   carte « Découverte pas à pas » → le corpus de test « pas-a-pas » (VIDE au
 *   départ, les étapes remplissent).
 * Les deux corpus ne se mélangent JAMAIS (gardes de la modale : pas déjà un
 * corpus, pas le dossier de l'autre mode, pas les sources) ; seules les SOURCES
 * sont partagées (copiées une fois). Le marqueur `corpus.json: { demo: { mode,
 * racineSources, validees } }` identifie un corpus de test (absent = corpus normal).
 *
 * Modèle par RÉFÉRENCE (§4) : les sources sont copiées UNE fois dans le dossier
 * choisi (demo:copierSources) ; le corpus RÉFÉRENCE leurs fichiers — aucune
 * copie d'audio dans le corpus (seuls les PNG d'onde dans png/).
 */

/** Stub des dialogues de la modale démo : 1er = sources, 2e = dossier du corpus. */
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

/** Stub d'UN SEUL dialogue (modale adaptative : une seule question posée). */
async function stuberUnDossier(
  app: import('@playwright/test').ElectronApplication,
  dir: string,
): Promise<void> {
  await app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
  }, dir)
}

/** Remplit la modale (les deux questions posées, choisit les deux, valide). */
async function preparerParModale(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('.modale-demo')).toBeVisible()
  await page.locator('.modale-demo .choisir-dossier').first().click()
  await page.locator('.modale-demo .choisir-dossier').nth(1).click()
  await page.locator('.modale-demo .valider').click()
}

/** Lit le marqueur `demo` du corpus.json d'un corpus de test. */
function marqueurDemo(dirCorpus: string): Record<string, unknown> | null {
  const f = join(dirCorpus, 'corpus.json')
  return existsSync(f)
    ? ((JSON.parse(readFileSync(f, 'utf8')).demo ?? null) as Record<string, unknown>)
    : null
}

test('« En autonomie » : corpus créé dans le dossier choisi, sources copiées, audio RÉFÉRENCÉ (zéro copie)', async () => {
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

  // (iv) Le corpus de test est MARQUÉ (mode 'autonomie' + sources).
  const marqueur = marqueurDemo(dirCorpus)
  expect(marqueur?.mode).toBe('autonomie')
  expect(marqueur?.racineSources).toBe(dirSources)

  await app.close()
})

test('« Découverte pas à pas » démarre sur un corpus VIDE, marqué pas-a-pas', async () => {
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
  // Marqué pas-a-pas (le panneau sera restauré à la réouverture).
  const marqueur = marqueurDemo(dirCorpus)
  expect(marqueur?.mode).toBe('pas-a-pas')
  expect(marqueur?.racineSources).toBe(dirSources)

  await app.close()
})

test('deux corpus INDÉPENDANTS : « En autonomie » crée le sien, refuse le dossier du pas-a-pas, aucun mélange', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-demo-memo-'))
  const dirSources = mkdtempSync(join(tmpdir(), 'sonal-demo-sources-memo-'))
  const corpusPasAPas = mkdtempSync(join(tmpdir(), 'sonal-demo-corpus-pap-'))
  const corpusAutonomie = mkdtempSync(join(tmpdir(), 'sonal-demo-corpus-auto-'))

  // 1re session : préparation « pas à pas » via la modale (sources + son corpus).
  let app = await lancer(profil)
  let page = await app.firstWindow()
  await attendreAccueil(page)
  await stuberDeuxDossiers(app, dirSources, corpusPasAPas)
  await page.locator('.carte-demo.pas-a-pas').click()
  await preparerParModale(page)
  await attendreCorpus(page)
  await expect(page.locator('.carte-ent')).toHaveCount(0)
  // Attendre que la MÉMOIRE démo soit écrite dans settings.json (demo:memoriser
  // est la DERNIÈRE étape de la préparation, après l'affichage du Corpus — un
  // close() trop tôt laisserait le fichier sans `demo` : poll avant de fermer).
  await expect
    .poll(() =>
      JSON.parse(readFileSync(join(profil, 'settings.json'), 'utf8')).demo?.corpusPasAPas,
    )
    .toBe(corpusPasAPas)
  await app.close()

  // La mémoire démo est PERSISTÉE (settings.json) : sources + corpus pas-a-pas.
  const settings = JSON.parse(readFileSync(join(profil, 'settings.json'), 'utf8'))
  expect(settings.demo).toEqual({ racineSources: dirSources, corpusPasAPas: corpusPasAPas })

  // 2e session (même profil, settings PRÉSERVÉS) : « En autonomie » — les
  // sources sont déjà en place (question 1 sautée) mais le corpus autonomie n'a
  // PAS encore été choisi → la modale n'a qu'UNE question.
  app = await lancer(profil, { preserverSettings: true })
  page = await app.firstWindow()
  await attendreAccueil(page)
  await page.locator('.carte-demo.autonomie').click()
  await expect(page.locator('.modale-demo')).toBeVisible()
  await expect(page.locator('.modale-demo .choisir-dossier')).toHaveCount(1)
  await expect(page.locator('.modale-demo .deja-place').first()).toContainText('Sources déjà en place')

  // GARDE : on refuse le dossier du corpus pas-a-pas (déjà un corpus).
  await stuberUnDossier(app, corpusPasAPas)
  await page.locator('.modale-demo .choisir-dossier').click()
  await page.locator('.modale-demo .valider').click()
  await expect(page.locator('.modale-demo .msg-demo')).toBeVisible()
  await expect(page.locator('.modale-demo')).toBeVisible() // toujours ouverte
  // Aucun corpus n'a été créé dans le dossier du pas-a-pas (toujours 0 entretien).
  expect(
    Object.keys(JSON.parse(readFileSync(join(corpusPasAPas, 'corpus.json'), 'utf8')).membership),
  ).toHaveLength(0)

  // On choisit un dossier VIDE → le corpus autonomie est créé (4 entretiens).
  await stuberUnDossier(app, corpusAutonomie)
  await page.locator('.modale-demo .choisir-dossier').click()
  await page.locator('.modale-demo .valider').click()
  await attendreCorpus(page)
  await expect(page.locator('.carte-ent')).toHaveCount(4)

  // PAS DE MÉLANGE : le corpus pas-a-pas est toujours vide, les deux sont marqués
  // de leur mode respectif.
  const membershipPasAPas = () =>
    Object.keys(
      JSON.parse(readFileSync(join(corpusPasAPas, 'corpus.json'), 'utf8')).membership,
    ).length
  await expect.poll(membershipPasAPas).toBe(0)
  expect(marqueurDemo(corpusPasAPas)?.mode).toBe('pas-a-pas')
  expect(marqueurDemo(corpusAutonomie)?.mode).toBe('autonomie')
  // La mémoire démo a mémorisé les DEUX corpus (l'ancien est préservé).
  const settings2 = JSON.parse(readFileSync(join(profil, 'settings.json'), 'utf8'))
  expect(settings2.demo).toEqual({
    racineSources: dirSources,
    corpusPasAPas: corpusPasAPas,
    corpusAutonomie: corpusAutonomie,
  })

  await app.close()
})
