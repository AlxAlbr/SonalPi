import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import { join } from 'node:path'
import { performance as nodePerformance } from 'node:perf_hooks'
import { attendreAccueil, attendreCorpus, entrerEntretien, lancer } from '../util'
import { ecrireProfilCharge, type ProfilCharge } from './donneesCharge'

interface Scenario {
  tailleVisee: number
  annotationsVisees: number
  profil?: ProfilCharge
  lancementMs?: number
  entreeCorpusMs?: number
  ouvertureEntretienMs?: number
  correctionsMs?: number[]
  correctionP50Ms?: number
  correctionP95Ms?: number
  correctionMaxMs?: number
  sauvegardeMs?: number
  rechercheMs?: number
  defilementP95Ms?: number
  imagesLentesPct?: number
  memoireRenduMo?: number
  memoireProcessusMo?: number
  erreur?: string
}

interface Rapport {
  format: 1
  creeLe: string
  configuration: {
    tailles: number[]
    annotations: number[]
    correctionsMesurees: number
    seuilDelicatMs: number
    seuilOuvertureMs: number
  }
  machine: Record<string, unknown>
  source: {
    version: string
    revision: string
    modificationsLocales: boolean
  }
  runtime?: Record<string, string>
  scenarios: Scenario[]
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim()
  } catch {
    return 'inconnu'
  }
}

function listeEntiers(nom: string, valeurParDefaut: number[], zeroPermis = false): number[] {
  const brut = process.env[nom]
  if (!brut) return valeurParDefaut
  const valeurs = brut.split(',').map((valeur) => Number.parseInt(valeur.trim(), 10))
  const minimum = zeroPermis ? 0 : 1
  if (valeurs.some((valeur) => !Number.isFinite(valeur) || valeur < minimum)) {
    throw new Error(`${nom} doit être une liste d'entiers ${zeroPermis ? 'positifs ou nuls' : 'strictement positifs'} séparés par des virgules.`)
  }
  return [...new Set(valeurs)].sort((a, b) => a - b)
}

function entier(nom: string, valeurParDefaut: number): number {
  const valeur = Number.parseInt(process.env[nom] ?? String(valeurParDefaut), 10)
  if (!Number.isFinite(valeur) || valeur <= 0) throw new Error(`${nom} doit être un entier strictement positif.`)
  return valeur
}

function percentile(valeurs: number[], ratio: number): number {
  if (valeurs.length === 0) return 0
  const triees = [...valeurs].sort((a, b) => a - b)
  return triees[Math.max(0, Math.ceil(triees.length * ratio) - 1)]
}

function arrondir(valeur: number | undefined): number | undefined {
  return valeur == null ? undefined : Math.round(valeur * 10) / 10
}

async function deuxImages(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

async function mesurerCorrections(page: Page, nombre: number): Promise<number[]> {
  const editeur = page.locator('.editeur')
  await editeur.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.insertText('x')
  await deuxImages(page)
  const mesures: number[] = []
  for (let i = 0; i < nombre; i++) {
    const debut = nodePerformance.now()
    await page.keyboard.insertText(String.fromCharCode(97 + (i % 26)))
    await deuxImages(page)
    mesures.push(nodePerformance.now() - debut)
  }
  return mesures
}

async function mesurerRecherche(page: Page): Promise<number> {
  await page.keyboard.press('ControlOrMeta+f')
  const champ = page.locator('#champ-recherche')
  await expect(champ).toBeVisible()
  const debut = nodePerformance.now()
  await champ.fill('personne interrogée')
  await deuxImages(page)
  const duree = nodePerformance.now() - debut
  await champ.press('Escape')
  return duree
}

async function mesurerDefilement(page: Page): Promise<{ p95: number; lentesPct: number }> {
  const intervalles = await page.evaluate(async () => {
    const mesures: number[] = []
    const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    let precedent = performance.now()
    for (let i = 0; i <= 40; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const maintenant = performance.now()
      if (i > 0) mesures.push(maintenant - precedent)
      precedent = maintenant
      window.scrollTo(0, maximum * (i / 40))
    }
    window.scrollTo(0, 0)
    return mesures
  })
  return {
    p95: percentile(intervalles, 0.95),
    lentesPct: intervalles.filter((valeur) => valeur > 34).length * 100 / intervalles.length,
  }
}

async function memoireRendu(page: Page): Promise<number | undefined> {
  return page.evaluate(() => {
    const memoire = (performance as unknown as {
      memory?: { usedJSHeapSize: number }
    }).memory
    return memoire ? memoire.usedJSHeapSize / 1024 / 1024 : undefined
  })
}

async function memoireProcessus(app: ElectronApplication): Promise<number | undefined> {
  return app.evaluate(({ app }) => {
    const totalKo = app.getAppMetrics().reduce((total, processus) => {
      return total + (processus.memory?.workingSetSize ?? 0)
    }, 0)
    return totalKo ? totalKo / 1024 : undefined
  })
}

function estDelicat(scenario: Scenario, rapport: Rapport): boolean {
  return (scenario.correctionP95Ms ?? 0) > rapport.configuration.seuilDelicatMs ||
    (scenario.ouvertureEntretienMs ?? 0) > rapport.configuration.seuilOuvertureMs ||
    (scenario.defilementP95Ms ?? 0) > 34
}

function statut(scenario: Scenario, rapport: Rapport): string {
  if (scenario.erreur) return 'ERREUR'
  if (estDelicat(scenario, rapport)) return 'DÉLICAT'
  if ((scenario.correctionP95Ms ?? 0) > 100 || (scenario.ouvertureEntretienMs ?? 0) > 1_000) {
    return 'PERCEPTIBLE'
  }
  return 'FLUIDE'
}

function formater(valeur: number | undefined): string {
  return valeur == null ? '—' : valeur.toFixed(1)
}

function markdown(rapport: Rapport): string {
  const lignes = [
    '# Rapport du test de charge',
    '',
    `Exécuté le ${rapport.creeLe}.`,
    '',
    `Seuil « délicat » : p95 d’une correction > ${rapport.configuration.seuilDelicatMs} ms.`,
    `Seuil d’ouverture indicative : ${rapport.configuration.seuilOuvertureMs} ms.`,
    '',
    '## Machine',
    '',
    `- Système : ${rapport.machine.platform} ${rapport.machine.release} (${rapport.machine.arch}).`,
    `- Processeur : ${rapport.machine.cpu}.`,
    `- Cœurs logiques : ${rapport.machine.cpus}.`,
    `- Mémoire : ${rapport.machine.memoireGo} Gio.`,
    `- Electron : ${rapport.runtime?.electron ?? '—'} ; Chromium : ${rapport.runtime?.chrome ?? '—'} ; Node : ${rapport.runtime?.node ?? process.versions.node}.`,
    `- Application : ${rapport.source.version}, révision ${rapport.source.revision}${rapport.source.modificationsLocales ? ' avec modifications locales' : ''}.`,
    '',
    '## Résultats',
    '',
    '| Caractères | Mots | Annotations | Ouverture (ms) | Correction p50 (ms) | Correction p95 (ms) | Recherche (ms) | Défilement p95 (ms) | RAM (Mo) | État |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |',
  ]
  for (const scenario of rapport.scenarios) {
    lignes.push(`| ${scenario.profil?.caracteres ?? scenario.tailleVisee} | ${scenario.profil?.mots ?? '—'} | ${scenario.profil?.annotations ?? scenario.annotationsVisees} | ${formater(scenario.ouvertureEntretienMs)} | ${formater(scenario.correctionP50Ms)} | ${formater(scenario.correctionP95Ms)} | ${formater(scenario.rechercheMs)} | ${formater(scenario.defilementP95Ms)} | ${formater(scenario.memoireProcessusMo)} | ${statut(scenario, rapport)} |`)
    if (scenario.erreur) lignes.push(`\nErreur pour ce scénario : ${scenario.erreur}\n`)
  }
  lignes.push('', '## Première zone délicate', '')
  let trouve = false
  for (const taille of rapport.configuration.tailles) {
    const premier = rapport.scenarios.find((scenario) =>
      scenario.tailleVisee === taille &&
      !scenario.erreur &&
      estDelicat(scenario, rapport))
    if (premier) {
      lignes.push(`- À ${taille.toLocaleString('fr-FR')} caractères : dès ${premier.annotationsVisees.toLocaleString('fr-FR')} annotations dans cette matrice.`)
      trouve = true
    }
  }
  if (!trouve) lignes.push('- Aucun scénario testé ne dépasse le seuil. Augmentez les tailles ou le nombre d’annotations.')
  lignes.push(
    '',
    '## Lecture des mesures',
    '',
    '- La correction mesure une frappe réelle, le remappage des annotations, le recalcul des projections et deux images de rendu.',
    '- Le p95 est la mesure principale : il représente les interactions lentes plutôt que la meilleure mesure.',
    '- Un scénario est délicat si la correction, l’ouverture ou le défilement dépasse son seuil.',
    '- Le défilement est préoccupant lorsque son p95 dépasse environ 34 ms, soit moins de 30 images par seconde.',
    '- La sauvegarde inclut volontairement le délai automatique de 600 ms.',
    '- Comparez surtout deux rapports avec la même matrice et la même version de l’application.',
    '',
  )
  return lignes.join('\n')
}

function sauverRapport(rapport: Rapport): { json: string; md: string } {
  const dossier = join(process.cwd(), 'test-results', 'charge-reports')
  mkdirSync(dossier, { recursive: true })
  const horodatage = rapport.creeLe.replaceAll(':', '-').replaceAll('.', '-')
  const json = join(dossier, `charge-${horodatage}.json`)
  const md = join(dossier, `charge-${horodatage}.md`)
  const jsonTexte = JSON.stringify(rapport, null, 2) + '\n'
  const mdTexte = markdown(rapport)
  writeFileSync(json, jsonTexte, 'utf8')
  writeFileSync(md, mdTexte, 'utf8')
  writeFileSync(join(dossier, 'dernier.json'), jsonTexte, 'utf8')
  writeFileSync(join(dossier, 'dernier.md'), mdTexte, 'utf8')
  return { json, md }
}

const tailles = listeEntiers('CHARGE_TAILLES', [20_000, 80_000, 200_000])
const nombresAnnotations = listeEntiers('CHARGE_ANNOTATIONS', [0, 250, 1_000], true)
const correctionsMesurees = entier('CHARGE_CORRECTIONS', 9)
const seuilDelicatMs = entier('CHARGE_SEUIL_MS', 200)
const seuilOuvertureMs = entier('CHARGE_SEUIL_OUVERTURE_MS', 3_000)

test('mesure la réactivité de l’éditeur selon la taille et les annotations', async ({}, testInfo) => {
  test.setTimeout(60 * 60 * 1000)
  const rapport: Rapport = {
    format: 1,
    creeLe: new Date().toISOString(),
    configuration: { tailles, annotations: nombresAnnotations, correctionsMesurees, seuilDelicatMs, seuilOuvertureMs },
    machine: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpu: os.cpus()[0]?.model ?? 'inconnu',
      cpus: os.cpus().length,
      memoireGo: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
    },
    source: {
      version: (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version,
      revision: git(['rev-parse', '--short', 'HEAD']),
      modificationsLocales: git(['status', '--porcelain']) !== '',
    },
    scenarios: [],
  }

  for (const tailleVisee of tailles) {
    for (const annotationsVisees of nombresAnnotations) {
      const scenario: Scenario = { tailleVisee, annotationsVisees }
      rapport.scenarios.push(scenario)
      const profilDir = mkdtempSync(join(os.tmpdir(), 'sonal-charge-'))
      let app: ElectronApplication | undefined
      try {
        scenario.profil = ecrireProfilCharge(profilDir, tailleVisee, annotationsVisees)
        const debutLancement = nodePerformance.now()
        app = await lancer(profilDir, { preserverSettings: true })
        const page = await app.firstWindow()
        await attendreAccueil(page)
        scenario.lancementMs = arrondir(nodePerformance.now() - debutLancement)
        if (!rapport.runtime) {
          rapport.runtime = await app.evaluate(() => ({
            electron: process.versions.electron,
            chrome: process.versions.chrome,
            node: process.versions.node,
          }))
        }

        const debutCorpus = nodePerformance.now()
        await page.locator('.recents .recent').first().click()
        await attendreCorpus(page)
        await deuxImages(page)
        scenario.entreeCorpusMs = arrondir(nodePerformance.now() - debutCorpus)

        const debutOuverture = nodePerformance.now()
        await entrerEntretien(page)
        await deuxImages(page)
        scenario.ouvertureEntretienMs = arrondir(nodePerformance.now() - debutOuverture)

        scenario.correctionsMs = (await mesurerCorrections(page, correctionsMesurees)).map((valeur) => arrondir(valeur)!)
        scenario.correctionP50Ms = arrondir(percentile(scenario.correctionsMs, 0.5))
        scenario.correctionP95Ms = arrondir(percentile(scenario.correctionsMs, 0.95))
        scenario.correctionMaxMs = arrondir(Math.max(...scenario.correctionsMs))

        const debutSauvegarde = nodePerformance.now()
        await expect(page.locator('.tete .etat')).toHaveText(/modifié|sauvegarde…/, { timeout: 5_000 })
        await expect(page.locator('.tete .etat')).toHaveText('à jour', { timeout: 120_000 })
        scenario.sauvegardeMs = arrondir(nodePerformance.now() - debutSauvegarde)
        scenario.rechercheMs = arrondir(await mesurerRecherche(page))
        const defilement = await mesurerDefilement(page)
        scenario.defilementP95Ms = arrondir(defilement.p95)
        scenario.imagesLentesPct = arrondir(defilement.lentesPct)
        scenario.memoireRenduMo = arrondir(await memoireRendu(page))
        scenario.memoireProcessusMo = arrondir(await memoireProcessus(app))
      } catch (erreur) {
        scenario.erreur = erreur instanceof Error ? erreur.stack ?? erreur.message : String(erreur)
      } finally {
        if (app) await app.close().catch(() => {})
        rmSync(profilDir, { recursive: true, force: true })
        sauverRapport(rapport)
      }
    }
  }

  const chemins = sauverRapport(rapport)
  await testInfo.attach('rapport-charge-json', { path: chemins.json, contentType: 'application/json' })
  await testInfo.attach('rapport-charge-markdown', { path: chemins.md, contentType: 'text/markdown' })
  console.log(`\nRapports de charge :\n- ${chemins.md}\n- ${chemins.json}\n`)
  expect(rapport.scenarios.filter((scenario) => scenario.erreur), 'Scénarios en erreur').toEqual([])
})
