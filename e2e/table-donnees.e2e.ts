import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, ouvrirSurCorpus, entrerEntretien, entrerDonnees, retourCorpus } from './util'

/**
 * D-S11 (rév.) — la Table de données éditable. La matrice devient éditable : changer
 * une cellule écrit la valeur chez son propriétaire dans l'entretien visé (écriture
 * ciblée, jamais un cache). Entrer dans la table FERME (et sauvegarde) l'entretien
 * ouvert dans l'éditeur → la table n'écrit jamais dans un entretien ouvert ; un
 * point de reprise (bouton « Reprendre ») le rouvre d'un clic.
 */

/** Crée une variable de portée entretien avec une modalité (sur la table de
 *  données), puis revient au Corpus. */
async function creerVarEntretien(page: import('@playwright/test').Page, libMod: string) {
  await entrerDonnees(page)
  await page.locator('.variables-def .corpus-tete .mini', { hasText: '+ entretien' }).click()
  const li = page.locator('.variables-def .liste-var > li').first()
  await li.locator('.modalites .mini').click()
  const mod = li.locator('.nom-mod').first()
  await mod.fill(libMod)
  await mod.press('Tab')
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

test('sortir d’un entretien le ferme ; « Reprendre » (Corpus et table) le rouvre', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-table-')
  await creerVarEntretien(page, 'Lyon')

  // Ouvrir l'entretien puis en SORTIR : il est fermé, le point de reprise est
  // proposé dès l'écran Corpus.
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
