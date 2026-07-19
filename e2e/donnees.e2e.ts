import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  lancer,
  ouvrirSurCorpus,
  entrerCorpus,
  entrerEntretien,
  entrerDonnees,
  retourCorpus,
  ouvrirEditionVariables,
  fermerEditionVariables,
} from './util'

/**
 * ÉTAPE 6 + S2 — données (EAV) à DEUX NIVEAUX d'écran : les DÉFINITIONS de
 * variables/modalités et la MATRICE vivent sur la TABLE DE DONNÉES ; la SAISIE des
 * valeurs (portée entretien + portée locuteur) vit à l'écran Entretien. Invariants
 * inchangés : (1) matrice = requête juste après réouverture ; (2) valeur de portée
 * locuteur chez SON locuteur (pas de sentinelle l="all") ; (3) supprimer une
 * modalité utilisée = refus + compteur.
 */

/** Crée une variable (fenêtre d'édition des variables, crayon de la table de
 *  données) avec une modalité `libMod`, puis revient au Corpus (pour enchaîner
 *  l'ouverture d'un entretien). */
async function creerVariable(
  page: Page,
  bouton: "+ var. d'entretien" | '+ var. de locuteur',
  libMod: string,
) {
  await entrerDonnees(page)
  await ouvrirEditionVariables(page)
  await page.locator('.modale-vars .corpus-tete .mini', { hasText: bouton }).click()
  const li = page.locator('.modale-vars .liste-var > li').first()
  await li.locator('.actions-mod .mini').click() // + modalité
  const modInput = li.locator('.lib-mod').first()
  await modInput.fill(libMod)
  await modInput.press('Tab') // @change → renomme la modalité
  await fermerEditionVariables(page)
  await retourCorpus(page)
}

/** Ouvre l'onglet Données (saisie des valeurs) à l'écran Entretien. */
async function ongletDonnees(page: Page) {
  await page.locator('.onglets button', { hasText: 'Données' }).click()
}

test('saisir une valeur (entretien) → persistée et reflétée par la matrice après réouverture', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-eav-'))

  const app1 = await lancer(dir)
  const page1 = await app1.firstWindow()
  await entrerCorpus(page1)
  await creerVariable(page1, "+ var. d'entretien", 'Lyon')
  await entrerEntretien(page1) // saisie = écran Entretien
  await ongletDonnees(page1)
  await page1.locator('.saisie-sel').first().selectOption({ label: 'Lyon' })
  await expect(page1.locator('.etat')).toHaveText('à jour')
  await app1.close()

  // Réouverture, MÊME dossier : la valeur est là et la matrice (requête) la montre.
  const app2 = await lancer(dir)
  const page2 = await app2.firstWindow()
  await entrerCorpus(page2)
  await entrerEntretien(page2)
  await ongletDonnees(page2)
  await expect(page2.locator('.saisie-sel option:checked').first()).toHaveText('Lyon')
  // La matrice vit sur la table de données.
  await retourCorpus(page2)
  await entrerDonnees(page2)
  await expect(page2.locator('.matrice')).toContainText('Lyon')
  await app2.close()
})

test('une valeur de portée locuteur vit chez SON locuteur (aucun sentinelle "all")', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-eav-'))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await creerVariable(page, '+ var. de locuteur', 'Femme')
  await entrerEntretien(page)
  await ongletDonnees(page)
  // Fiche du 1er locuteur → choisir « Femme ».
  await page.locator('.fiche-loc').first().locator('.saisie-sel').first().selectOption({ label: 'Femme' })
  await expect(page.locator('.etat')).toHaveText('à jour')

  // Le fichier entretien : la valeur est sous le locuteur, PAS au niveau entretien.
  const brut = readFileSync(join(dir, 'corpus', 'entretiens', 'e1.json'), 'utf8')
  const data = JSON.parse(brut)
  const loc1 = data.locuteurs.find((l: { index: number }) => l.index === 1)
  expect(Object.keys(loc1.valeursLoc)).toHaveLength(1) // valeur chez le locuteur
  expect(Object.keys(data.meta.valeursGen)).toHaveLength(0) // rien au niveau entretien
  expect(brut).not.toContain('"all"') // pas de sentinelle
  await app.close()
})

test('supprimer une modalité utilisée est refusé (avec compteur)', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-eav-')
  await creerVariable(page, "+ var. d'entretien", 'Lyon')
  await entrerEntretien(page)
  await ongletDonnees(page)
  await page.locator('.saisie-sel').first().selectOption({ label: 'Lyon' })
  await expect(page.locator('.etat')).toHaveText('à jour')

  // Fenêtre d'édition des variables : tenter de supprimer la modalité « Lyon »
  // (utilisée) → refus.
  await retourCorpus(page)
  await entrerDonnees(page)
  await ouvrirEditionVariables(page)
  await page.locator('.modale-vars .liste-var > li').first().locator('.x-mod').first().click()
  await expect(page.locator('.modale-vars .msg-thm')).toContainText('utilisée 1')
  await expect(page.locator('.modale-vars .liste-var > li').first().locator('.lig-mod')).toHaveCount(1)
  await app.close()
})
