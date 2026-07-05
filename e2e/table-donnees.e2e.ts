import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, ouvrirSurCorpus, entrerEntretien, retourCorpus } from './util'

/**
 * D-S11 — la Table de données éditable. La matrice devient éditable : changer une
 * cellule écrit la valeur chez son propriétaire dans l'entretien visé (écriture
 * ciblée, jamais un cache). La ligne d'un entretien TENU (ouvert dans l'éditeur)
 * est verrouillée → la table n'écrit jamais dans un entretien ouvert.
 */

/** Crée une variable de portée entretien avec une modalité (écran Corpus). */
async function creerVarEntretien(page: import('@playwright/test').Page, libMod: string) {
  await page.locator('.donnees-corpus .corpus-tete .mini', { hasText: '+ entretien' }).click()
  const li = page.locator('.donnees-corpus .liste-var > li').first()
  await li.locator('.modalites .mini').click()
  const mod = li.locator('.nom-mod').first()
  await mod.fill(libMod)
  await mod.press('Tab')
}

test('éditer une cellule dans la table écrit la valeur chez son propriétaire', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-table-'))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await creerVarEntretien(page, 'Lyon')

  // Ouvrir la table (aucun entretien tenu → toutes lignes éditables).
  await page.locator('.btn-table').click()
  await expect(page.locator('.donnees-ecran')).toBeVisible()

  // Une seule cellule éditable (la variable est de portée entretien → sur la
  // ligne entretien uniquement) : y choisir « Lyon ».
  await page.locator('.matrice.editable select').first().selectOption({ label: 'Lyon' })

  // Persisté sur disque, chez le propriétaire (meta.valeursGen du seed e1).
  const f = join(dir, 'corpus', 'entretiens', 'e1.json')
  await expect
    .poll(() => Object.keys(JSON.parse(readFileSync(f, 'utf8')).meta.valeursGen).length, { timeout: 5000 })
    .toBe(1)

  await app.close()
})

test('la ligne d’un entretien ouvert est verrouillée (🔒, selects désactivés)', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-table-')
  await creerVarEntretien(page, 'Lyon')

  // Ouvrir l'entretien (le « tient ») puis revenir au corpus.
  await entrerEntretien(page)
  await retourCorpus(page)

  // Table : la ligne du seed (entretien + ses 2 locuteurs) est marquée tenue,
  // avec cadenas, et son select est désactivé.
  await page.locator('.btn-table').click()
  await expect(page.locator('.matrice.editable tr.tenu')).toHaveCount(3)
  await expect(page.locator('.matrice.editable .cadenas')).toBeVisible()
  await expect(page.locator('.matrice.editable select').first()).toBeDisabled()

  await app.close()
})
