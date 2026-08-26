import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  lancer,
  entrerCorpus,
  ouvrirSurCorpus,
  entrerEntretien,
  entrerDonnees,
  retourCorpus,
  ouvrirEditionVariables,
  fermerEditionVariables,
} from './util'
import { ecrireSeedDemo } from '../test/seedDemo'

/**
 *  La Table de données éditable. La matrice devient éditable : changer
 *  une cellule écrit la valeur chez son propriétaire dans l'entretien visé (écriture
 *  ciblée, jamais un cache). Entrer dans la table FERME (et sauvegarde) l'entretien
 *  ouvert dans l'éditeur → la table n'écrit jamais dans un entretien ouvert ; un
 *  point de reprise (bouton « Reprendre ») le rouvre d'un clic.
 */

/** Crée une variable de portée entretien avec une modalité (fenêtre d'édition des variables,
 *  crayon de la table de données), puis revient au Corpus. */
async function creerVarEntretien(page: import('@playwright/test').Page, libMod: string) {
  await entrerDonnees(page)
  await ouvrirEditionVariables(page)
  await page.locator('.modale-vars .corpus-tete .mini', { hasText: "+ var. d'entretien" }).click()
  const li = page.locator('.modale-vars .liste-var > li').first()
  await li.locator('.mini', { hasText: '+ modalité' }).click()
  const mod = li.locator('.lib-mod').first()
  await mod.fill(libMod)
  await mod.press('Tab')
  await fermerEditionVariables(page)
  await retourCorpus(page)
}

test('éditer une cellule dans la table écrit la valeur chez son propriétaire', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-table-'))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await creerVarEntretien(page, 'Lyon') // crée sur la table, revient au Corpus

  // Ouvrir la table (toutes lignes éditables).
  await entrerDonnees(page)

  // Une seule cellule éditable (la variable est de portée entretien →
  // sur la ligne entretien uniquement) : y choisir « Lyon ».
  await page.locator('.matrice.editable select').first().selectOption({ label: 'Lyon' })

  // Persisté sur disque, chez le propriétaire (meta.valeursGen du seed e1).
  const f = join(dir, 'corpus', 'entretiens', 'e1.json')
  await expect
    .poll(() => Object.keys(JSON.parse(readFileSync(f, 'utf8')).meta.valeursGen).length, { timeout: 5000 })
    .toBe(1)

  await app.close()
})

test('sortir d’un entretien le ferme ; « Reprendre » (Corpus et table) le rouvre', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-table-')
  await creerVarEntretien(page, 'Lyon')

  // Ouvrir l'entretien puis en SORTIR : il est fermé,
  // le point de reprise est proposé dès l'écran Corpus.
  await entrerEntretien(page)
  await retourCorpus(page)
  await expect(page.locator('.corpus-ecran .btn-reprise')).toBeVisible()
  await expect(page.locator('.corpus-ecran .btn-reprise')).toContainText('Reprendre')

  // Dans la table : aucune ligne verrouillée, et la reprise est là aussi.
  await entrerDonnees(page)
  await expect(page.locator('.matrice.editable select').first()).toBeEnabled()
  const reprise = page.locator('.donnees-ecran .btn-reprise')
  await expect(reprise).toBeVisible()

  // Reprendre rouvre l'entretien dans l'éditeur.
  await reprise.click()
  await expect(page.locator('.editeur')).toBeVisible()

  await app.close()
})

test('« Saisir… » n’apparaît qu’en corpus distant (local : grille directement éditable)', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-saisie-')
  await creerVarEntretien(page, 'Lyon')

  await entrerDonnees(page)

  // En corpus local, la grille est directement éditable :
  // le bouton de ligne (uniquement pour les corpus distants) ne doit pas exister.
  await expect(page.locator('.matrice .aller-saisie')).toHaveCount(0)
  await expect(page.locator('.matrice.editable select').first()).toBeEnabled()

  await app.close()
})

test('« modifier en lot » applique UNE valeur à tous les entretiens (corpus local)', async () => {
  // Deux entretiens dans le corpus (le seed n'en a qu'un) : le second est posé AVANT le lancement —
  // le seed est idempotent, il ne touchera à rien.
  const dir = mkdtempSync(join(tmpdir(), 'sonal-lot-'))
  ecrireSeedDemo(join(dir, 'corpus'))
  const c = JSON.parse(readFileSync(join(dir, 'corpus', 'corpus.json'), 'utf8')) as {
    membership: Record<string, unknown>
  }
  c.membership.e2 = { titre: 'Second entretien', date: null, lastModified: new Date().toISOString() }
  writeFileSync(join(dir, 'corpus', 'corpus.json'), JSON.stringify(c, null, 2))
  writeFileSync(
    join(dir, 'corpus', 'entretiens', 'e2.json'),
    JSON.stringify({
      formatVersion: 3,
      lastModified: new Date().toISOString(),
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] },
      annotations: [],
      ancres: [],
      locuteurs: [],
      brouillonsAnon: [],
      meta: { valeursGen: {}, audioRef: null },
    }),
  )

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)
  await creerVarEntretien(page, 'Lyon') // variable + modalité, puis retour Corpus
  await entrerDonnees(page)

  // Le bouton de COLONNE ouvre la modale : les DEUX lignes sont ciblées.
  await page.locator('.matrice th .lot-var').first().click()
  const modale = page.locator('.modale-lot')
  await expect(modale).toBeVisible()
  await expect(modale.locator('.liste-cibles li')).toHaveCount(2)

  // Choisir « Lyon » et appliquer.
  await modale.locator('select').selectOption({ label: 'Lyon' })
  await modale.locator('.valider').click()
  await expect(modale.locator('.recap-ok')).toContainText('2 entretien(s) modifié(s)')

  // Persisté sur disque CHEZ CHAQUE PROPRIÉTAIRE.
  for (const id of ['e1', 'e2']) {
    const f = join(dir, 'corpus', 'entretiens', `${id}.json`)
    await expect
      .poll(() => Object.keys(JSON.parse(readFileSync(f, 'utf8')).meta.valeursGen).length)
      .toBe(1)
  }

  // Fermer → la matrice montre les deux valeurs.
  await modale.locator('.valider').click() // bouton « Fermer » du récapitulatif
  await expect(modale).toHaveCount(0)
  const sel = page.locator('.matrice.editable td.cell-val select') // 2 lignes × 1 variable
  await expect(sel).toHaveCount(2)
  const labels = await sel.evaluateAll((els) =>
    els.map((e) => (e as HTMLSelectElement).selectedOptions[0]?.textContent?.trim()),
  )
  expect(labels).toEqual(['Lyon', 'Lyon'])

  // Filtre « lignes sans valeur » : réouverture de la modale —
  // les DEUX lignes portent désormais une valeur, donc le filtre ne cible plus personne ; décoché,
  // tout redevient ciblable.
  await page.locator('.matrice th .lot-var').first().click()
  const m2 = page.locator('.modale-lot')
  await expect(m2).toBeVisible()
  await m2.locator('.filtre-sans-valeur input').check()
  await expect(m2.locator('.liste-cibles li:not(.aucune-cible)')).toHaveCount(0)
  await expect(m2.locator('.liste-ignores li')).toHaveCount(2)
  await expect(m2.locator('.aucune-cible')).toBeVisible()
  await expect(m2.locator('button.valider')).toBeDisabled()
  await m2.locator('.filtre-sans-valeur input').uncheck()
  await expect(m2.locator('.liste-cibles li:not(.aucune-cible)')).toHaveCount(2)
  await expect(m2.locator('.liste-ignores li')).toHaveCount(0)
  await m2.locator('.fermer').click()
  await expect(page.locator('.modale-lot')).toHaveCount(0)

  await app.close()
})

/** Pose un SECOND entretien (e2) dans le corpus AVANT lancement —
 *  le seed est idempotent et n'en contient qu'un (parité du test lot ci-dessus). */
function poserSecondEntretien(dir: string) {
  ecrireSeedDemo(join(dir, 'corpus'))
  const c = JSON.parse(readFileSync(join(dir, 'corpus', 'corpus.json'), 'utf8')) as {
    membership: Record<string, unknown>
  }
  c.membership.e2 = { titre: 'Second entretien', date: null, lastModified: new Date().toISOString() }
  writeFileSync(join(dir, 'corpus', 'corpus.json'), JSON.stringify(c, null, 2))
  writeFileSync(
    join(dir, 'corpus', 'entretiens', 'e2.json'),
    JSON.stringify({
      formatVersion: 3,
      lastModified: new Date().toISOString(),
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] },
      annotations: [],
      ancres: [],
      locuteurs: [],
      brouillonsAnon: [],
      meta: { valeursGen: {}, audioRef: null },
    }),
  )
}

test('navigation clavier : Entrée descend la colonne en sautant les lignes locuteur ; Shift+Entrée remonte', async () => {
  // Deux entretiens ; le seed e1 porte DEUX locuteurs (index 1 et 2) →
  // entre les deux lignes entretien s'intercalent deux lignes SANS cellule dans la colonne « Ville »
  // : la descente doit les TRAVERSER.
  const dir = mkdtempSync(join(tmpdir(), 'sonal-nav-'))
  poserSecondEntretien(dir)

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)
  await creerVarEntretien(page, 'Lyon')
  await entrerDonnees(page)

  const sel = page.locator('.matrice.editable td.cell-val select') // e1 puis e2
  await expect(sel).toHaveCount(2)
  // La légende clavier est affichée au-dessus de la grille (une seule ligne).
  await expect(page.locator('.aide-clavier')).toBeVisible()
  await expect(page.locator('.aide-clavier kbd')).toHaveCount(5)

  // Saisie sur e1 PUIS Entrée : le commit part ET le focus descend sur e2.
  await sel.nth(0).selectOption({ label: 'Lyon' })
  await sel.nth(0).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  const indiceFocus = () =>
    sel.evaluateAll((els) => els.findIndex((e) => e === document.activeElement))
  expect(await indiceFocus()).toBe(1)

  // Shift+Entrée : remontée symétrique.
  await page.keyboard.press('Shift+Enter')
  expect(await indiceFocus()).toBe(0)

  // Le commit n'a pas été perdu pour autant (écrit chez le propriétaire).
  const f = join(dir, 'corpus', 'entretiens', 'e1.json')
  await expect
    .poll(() => Object.keys(JSON.parse(readFileSync(f, 'utf8')).meta.valeursGen).length)
    .toBe(1)

  await app.close()
})
