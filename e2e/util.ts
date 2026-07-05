import { expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function launchEnv() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return env as Record<string, string>
}

export async function lancer(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.', '--no-sandbox', `--user-data-dir=${userDataDir}`],
    env: launchEnv(),
  })
}

/** L'app atterrit sur l'ACCUEIL (flux SonalPi). */
export async function attendreAccueil(page: Page): Promise<void> {
  await expect(page.locator('.ecran.accueil')).toBeVisible({ timeout: 20_000 })
}
/** Attend que l'écran Corpus soit affiché (pur wait, sans navigation). */
export async function attendreCorpus(page: Page): Promise<void> {
  await expect(page.locator('.corpus-ecran')).toBeVisible({ timeout: 20_000 })
}
/** Depuis l'ACCUEIL (au démarrage), entre dans le corpus courant → écran Corpus. */
export async function entrerCorpus(page: Page): Promise<void> {
  await attendreAccueil(page)
  await page.locator('.carte.ouvrir-corpus').click()
  await attendreCorpus(page)
}

/** Depuis l'écran Corpus, entre dans le n-ième entretien de la liste (0 = 1er)
 *  et attend que l'éditeur soit monté (écran Entretien). */
export async function entrerEntretien(page: Page, nth = 0): Promise<void> {
  await page.locator('.ents li .open').nth(nth).click()
  await expect(page.locator('.editeur')).toBeVisible({ timeout: 20_000 })
}

/** Retourne à l'écran Corpus depuis l'entretien (fil d'Ariane). */
export async function retourCorpus(page: Page): Promise<void> {
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
  await attendreCorpus(page)
}

/** Pose une VRAIE sélection sur la 1re occurrence de `phrase` dans l'éditeur
 *  (Range DOM → ProseMirror synchronise son état sur `selectionchange`). Plus
 *  fiable que dblclick pour viser un mot précis dans un bloc. */
export async function selectionner(page: Page, phrase: string): Promise<void> {
  await page.evaluate((p) => {
    const ed = document.querySelector('.editeur') as HTMLElement | null
    if (!ed) throw new Error('éditeur absent')
    ed.focus()
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT)
    let node: Node | null
    let idx = -1
    while ((node = walker.nextNode())) {
      idx = (node.textContent ?? '').indexOf(p)
      if (idx >= 0) break
    }
    if (!node || idx < 0) throw new Error(`texte « ${p} » introuvable`)
    const range = document.createRange()
    range.setStart(node, idx)
    range.setEnd(node, idx + p.length)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
  }, phrase)
}

/** S3 : code la sélection courante avec un thème, en cliquant dessus dans l'onglet
 *  Thématique (le geste « clic = coder »). La sélection doit être posée AVANT. */
export async function coderTheme(page: Page, nomTheme: string): Promise<void> {
  await page.locator('.onglets button', { hasText: 'Thématique' }).click()
  await page.locator('.theme-coder', { hasText: nomTheme }).click()
}

/** Lance sur un profil neuf et ENTRE dans le 1er entretien (seed « Karine ») —
 *  pour les tests centrés éditeur (marquage, locuteurs, smoke…). */
export async function ouvrir(prefixe = 'sonal-'): Promise<{ app: ElectronApplication; page: Page }> {
  const { app, page } = await ouvrirSurCorpus(prefixe)
  await entrerEntretien(page)
  await expect(page.locator('.editeur')).toContainText('Karine', { timeout: 20_000 })
  return { app, page }
}

/** Lance sur un profil neuf et RESTE sur l'écran Corpus — pour les tests centrés
 *  corpus (thèmes CRUD, variables, matrice). */
export async function ouvrirSurCorpus(
  prefixe = 'sonal-',
): Promise<{ app: ElectronApplication; page: Page }> {
  const dir = mkdtempSync(join(tmpdir(), prefixe))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page) // Accueil → Corpus
  return { app, page }
}
