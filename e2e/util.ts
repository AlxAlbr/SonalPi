/// <reference lib="dom" />
// (le DOM n'est pas dans `lib` du tsconfig node ; `selectionner` s'exécute en contexte navigateur via page.evaluate →
//  on tire les types DOM pour CE fichier.)
import { expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ecrireSeedDemo } from '../test/seedDemo'

export { ecrireSeedDemo } // les specs qui pré-peuplent un dossier pické (multi-corpus)

function launchEnv() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return env as Record<string, string>
}

export async function lancer(
  userDataDir: string,
  opts?: { preserverSettings?: boolean; executablePath?: string; repertoireApplication?: string; env?: Record<string, string> },
): Promise<ElectronApplication> {
  // Un corpus neuf naît VIDE (S8 rév.) ; les specs reposent sur la baseline de démo « Karine »,
  // écrite dans le corpus par défaut du profil AVANT le lancement (un dossier pické par un test reste vierge,
  // sauf s'il la pose).
  ecrireSeedDemo(join(userDataDir, 'corpus'))
  // Nouveau flux Accueil : le démarrage charge le 1er récent, et la carte « Corpus courant » a disparu.
  // On pré-inscrit donc le corpus par défaut (seedé) comme récent — comme un utilisateur qui a déjà ouvert ce corpus —
  // pour que les tests puissent y entrer depuis l'Accueil (1er récent).
  // `preserverSettings` : ne pas réécrire le fichier (tests de persistance de la mémoire démo —
  // settings.json porte aussi `demo`).
  if (!opts?.preserverSettings) {
    writeFileSync(
      join(userDataDir, 'settings.json'),
      JSON.stringify({
        recents: [join(userDataDir, 'corpus')],
        navigationProjets: {
          [`local:${join(userDataDir, 'corpus')}`]: { vue: 'corpus', onglet: 'accueil' },
        },
      }, null, 2),
      'utf8',
    )
  }
  return electron.launch({
    executablePath: opts?.executablePath,
    args: [
      ...(opts?.executablePath ? [] : [opts?.repertoireApplication ?? '.']),
      '--no-sandbox',
      `--user-data-dir=${userDataDir}`,
      '--password-store=basic',
    ],
    env: { ...launchEnv(), ...opts?.env },
  })
}

/** L'app atterrit sur l'ACCUEIL (flux SonalPi2). */
export async function attendreAccueil(page: Page): Promise<void> {
  await expect(page.locator('.ecran.accueil')).toBeVisible({ timeout: 20_000 })
}
/** Déplie la rubrique de migration avant de choisir son assistant. */
export async function ouvrirMigration(page: Page, fournisseur: 'local' | 'gitlab' = 'local'): Promise<void> {
  const rubrique = page.locator('.migration-bloc')
  if (await rubrique.getAttribute('open') === null) await rubrique.locator('summary').click()
  await rubrique.locator(fournisseur === 'gitlab' ? '.migrer-gitlab' : '.migrer-corpus').click()
}

/** Attend que l'écran Corpus soit affiché (pur wait, sans navigation). */
export async function attendreCorpus(page: Page): Promise<void> {
  await expect(page.locator('.corpus-ecran')).toBeVisible({ timeout: 20_000 })
}
/** Depuis l'ACCUEIL (au démarrage), entre dans le corpus courant (1er récent)
 *  → écran Corpus. */
export async function entrerCorpus(page: Page): Promise<void> {
  await attendreAccueil(page)
  await page.locator('.recents .recent').first().click()
  await attendreCorpus(page)
}

/** Ouvre la préparation sans recliquer sur l'onglet déjà repris par la barre. */
export async function ouvrirPreparation(
  page: Page,
  onglet: 'tableau-bord' | 'docs-cadre' | 'documents-exemples' = 'tableau-bord',
): Promise<void> {
  if (!(await page.locator('.espace-preparation').isVisible())) {
    await page.locator('[data-tour="ouvrir-preparer"]').click()
  }
  await expect(page.locator('.espace-preparation')).toBeVisible({ timeout: 20_000 })
  const cible = onglet === 'tableau-bord'
    ? 'ouvrir-tableau-bord'
    : onglet === 'docs-cadre' ? 'ouvrir-docs-cadre' : 'ouvrir-documents-exemples'
  const bouton = page.locator(`[data-tour="${cible}"]`)
  if (await bouton.getAttribute('aria-current') !== 'page') await bouton.click()
}

/** Ouvre l'analyse sans recliquer sur l'onglet déjà repris par la barre. */
export async function ouvrirAnalyse(
  page: Page,
  onglet: 'synthese' | 'lexico' | 'analyses-croisees' = 'synthese',
): Promise<void> {
  if (!(await page.locator('.espace-analyse').isVisible())) {
    await page.locator('[data-tour="ouvrir-analyser"]').click()
  }
  await expect(page.locator('.espace-analyse')).toBeVisible({ timeout: 20_000 })
  const bouton = page.locator(`[data-tour="ouvrir-${onglet}"]`)
  if (await bouton.getAttribute('aria-current') !== 'page') await bouton.click()
}

/** Ouvre un outil d'organisation par les commandes communes de navigation. */
export async function ouvrirOrganisation(
  page: Page,
  onglet: 'cas' | 'recueils' | 'export' = 'cas',
): Promise<void> {
  if (!(await page.locator('.organisation-ecran').isVisible())) {
    await page.getByRole('button', { name: 'Organiser et exporter', exact: true }).click()
  }
  const nom = { cas: 'Cas', recueils: 'Recueils', export: 'Exporter le corpus' }[onglet]
  const bouton = page.locator('.onglets-organisation').getByRole('button', { name: nom, exact: true })
  if (await bouton.getAttribute('aria-current') !== 'page') await bouton.click()
}

/** Depuis l'ACCUEIL, entre dans le n-ième entretien de la liste (0 = 1er)
 *  via le CRAYON de sa carte, et attend que l'éditeur soit monté (écran Entretien). */
export async function entrerEntretien(page: Page, nth = 0): Promise<void> {
  await page.locator('.carte-ent .crayon').nth(nth).click()
  await expect(page.locator('.editeur')).toBeVisible({ timeout: 20_000 })
}

/** Depuis la modale « Ouvrir un corpus distant » déjà connectée : ouvre le
 *  premier compte. Sans trousseau OS, le compte n'a pas de mot de passe
 *  conservé → un champ « Mot de passe pour cette session » apparaît sous le
 *  compte ; on le remplit avant « Ouvrir ». Sur un poste avec trousseau, le
 *  champ n'existe pas et le bouton est directement actif. */
export async function ouvrirPremierCompteDistant(page: Page, motDePasse: string): Promise<void> {
  await expect(page.locator('.modale-distant .comptes')).toBeVisible({ timeout: 20_000 })
  const secrets = page.locator('.modale-distant .secret-compte')
  for (let i = 0; i < (await secrets.count()); i++) {
    await secrets.nth(i).fill(motDePasse)
  }
  await page.locator('.modale-distant .mini.ouvrir').first().click()
  await fermerAiguillage(page, 'entretiens', 120_000)
  await attendreCorpus(page)
}

/** Première ouverture d'un corpus sur ce poste : une fenêtre d'aiguillage
 *  s'affiche par-dessus l'accueil de « Préparer et suivre » (corriger un entretien
 *  ou gérer le projet). Les scénarios qui ne l'étudient pas la referment ici.
 *  Elle arrive peu après l'ouverture (lecture des réglages), d'où l'attente. */
export async function fermerAiguillage(
  page: Page,
  choix: 'entretiens' | 'projet' = 'projet',
  delai = 2_000,
): Promise<void> {
  const modale = page.locator('.modale-aiguillage')
  try {
    await modale.waitFor({ state: 'visible', timeout: delai })
  } catch {
    return
  }
  const libelle = choix === 'entretiens'
    ? 'Télécharger un entretien pour le corriger'
    : "Aller vers l'interface de gestion de projet"
  await modale.getByRole('button', { name: libelle }).click()
  await expect(modale).toHaveCount(0)
  // Corpus encore vide : ce choix ouvre l'ajout d'entretien, qu'on referme pour
  //  laisser le scénario sur la liste.
  const ajout = page.locator('.modale-ajout')
  if (choix === 'entretiens' && await ajout.isVisible()) {
    await ajout.getByRole('button', { name: 'Annuler' }).click()
    await expect(ajout).toHaveCount(0)
  }
}

/** Depuis l'écran Corpus, ouvre l'onglet Données. */
export async function entrerDonnees(page: Page): Promise<void> {
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Données' }).click()
  await expect(page.locator('.donnees-ecran')).toBeVisible({ timeout: 20_000 })
}

/** Revient au Corpus depuis l'entretien, ou à ses cartes depuis un outil plein écran. */
export async function retourCorpus(page: Page): Promise<void> {
  if (await page.locator('.entretien-ecran').isVisible()) {
    await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
  } else {
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Accueil' }).click()
  }
  await attendreCorpus(page)
}

/** Pose une VRAIE sélection sur la 1re occurrence de `phrase`,
 *  dans l'éditeur (Range DOM → ProseMirror synchronise son état sur `selectionchange`).
 *  Plus fiable que dblclick pour viser un mot précis dans un bloc. */
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

/** Nombre d'ANNOTATIONS observables = ids UNIQUES portés par les décorations (`data-annot-ids`) ;
 *  plusieurs segments `.annot` peuvent porter la même annotation (à cheval sur des blocs, chevauchements).
 *  Les orphelines ne sont pas décorées (couvertes par les unitaires remap).
 *  Remplace le panneau debug comme fenêtre d'observation du modèle (retiré après S5). */
export async function compterAnnotations(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ids = new Set<string>()
    document.querySelectorAll('.editeur .annot').forEach((el) => {
      ;(el.getAttribute('data-annot-ids') ?? '')
        .split(' ')
        .filter(Boolean)
        .forEach((id) => ids.add(id))
    })
    return ids.size
  })
}

/** Vérifie que le trou du spotlight chevauche réellement l'élément ciblé (poll sur la position recalculée à chaque frame). */
export async function spotlightSur(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector)).toBeVisible()
  await expect
    .poll(async () => {
      const t = await page.locator('.spotlight-trou').boundingBox()
      const b = await page.locator(selector).boundingBox()
      return !!t && !!b && !(
        t.x + t.width < b.x ||
        t.x > b.x + b.width ||
        t.y + t.height < b.y ||
        t.y > b.y + b.height
      )
    })
    .toBe(true)
}

/** S6 rev. : ajoute un entretien via la MODALE « + Ajouter un entretien »
 *  (`dialog.showOpenDialog` doit être stubbé AVANT — chaque clic de zone
 *  consomme un dialogue). Remplit les zones demandées dans l'ordre, puis Valider. */
export async function ajouterParModale(page: Page, zones: Array<'texte' | 'audio'>): Promise<void> {
  await page.locator('.ajout-ent').click()
  for (const z of zones) {
    await page.locator(`.zone-${z}`).click()
    await expect(page.locator(`.zone-${z} .zone-fichier`)).toBeVisible()
  }
  await page.locator('.modale-ajout .valider').click()
}

/** S3 : code la sélection courante avec un thème, en cliquant dessus dans l'onglet Thématique (le geste « clic = coder »). La sélection doit être posée AVANT.
 *  */
export async function coderTheme(page: Page, nomTheme: string): Promise<void> {
  await page.locator('.onglets button[data-onglet="themes"]').click()
  await page.locator('.theme-coder', { hasText: nomTheme }).click()
}

/** S8 : ouvre la fenêtre d'ÉDITION des thèmes (crayon du panneau thèmes — écran Corpus ou onglet Thématique de l'Entretien,
 *  selon l'écran affiché). */
export async function ouvrirEditionThemes(page: Page): Promise<void> {
  const crayonVisible = page.locator('.panneau .crayon:visible').first()
  if ((await crayonVisible.count()) === 0) {
    const ongletThemes = page.locator('.onglets-corpus').getByRole('button', { name: 'Thèmes' })
    if (await ongletThemes.isVisible()) await ongletThemes.click()
  }
  await page.locator('.panneau .crayon:visible').first().click()
  await expect(page.locator('.modale-themes')).toBeVisible()
}

/** Ferme la fenêtre d'édition des thèmes. */
export async function fermerEditionThemes(page: Page): Promise<void> {
  await page.locator('.modale-themes .fermer').click()
  await expect(page.locator('.modale-themes')).toHaveCount(0)
}

/** Ouvre la fenêtre d'édition des variables depuis le panneau de l'onglet Données. */
export async function ouvrirEditionVariables(page: Page): Promise<void> {
  await page.locator('.variables-tete .crayon').click()
  await expect(page.locator('.modale-vars')).toBeVisible()
}

/** Ferme la fenêtre d'édition des variables. */
export async function fermerEditionVariables(page: Page): Promise<void> {
  await page.locator('.modale-vars .fermer').click()
  await expect(page.locator('.modale-vars')).toHaveCount(0)
}

/** Lance sur un profil neuf et ENTRE dans le 1er entretien (seed « Karine ») —
 *  pour les tests centrés éditeur (marquage, locuteurs, smoke…). */
export async function ouvrir(prefixe = 'sonal-'): Promise<{ app: ElectronApplication; page: Page }> {
  const { app, page } = await ouvrirSurCorpus(prefixe)
  await entrerEntretien(page)
  await expect(page.locator('.editeur')).toContainText('Karine', { timeout: 20_000 })
  return { app, page }
}

/** Lance sur un profil neuf et RESTE sur l'écran Corpus — pour les tests centrés corpus (thèmes CRUD, variables,
 *  matrice). */
export async function ouvrirSurCorpus(
  prefixe = 'sonal-',
): Promise<{ app: ElectronApplication; page: Page }> {
  const dir = mkdtempSync(join(tmpdir(), prefixe))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page) // Accueil → Corpus
  return { app, page }
}
