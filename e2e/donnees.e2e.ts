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
 *  Données (EAV) à DEUX NIVEAUX d'écran : les DÉFINITIONS de
 *  variables/modalités et la MATRICE vivent sur la TABLE DE DONNÉES ; la SAISIE des
 *  valeurs (portée entretien + portée locuteur) vit à l'écran Entretien. Invariants
 *  inchangés : (1) matrice = requête juste après réouverture ; (2) valeur de portée
 *  locuteur chez SON locuteur (pas de sentinelle l="all") ; (3) supprimer une
 *  modalité utilisée = refus + compteur.
 */

/** Crée une variable via la fenêtre d'édition des variables (crayon de la table de données),
 *  avec une modalité `libMod`, puis revient au Corpus (pour enchaîner l'ouverture d'un entretien). */
async function creerVariable(
  page: Page,
  bouton: "+ var. d'entretien" | '+ var. de locuteur',
  libMod: string,
) {
  await entrerDonnees(page)
  await ouvrirEditionVariables(page)
  await page.locator('.modale-vars .corpus-tete .mini', { hasText: bouton }).click()
  const li = page.locator('.modale-vars .liste-var > li').first()
  await li.locator('.mini', { hasText: '+ modalité' }).click() // + modalité
  const modInput = li.locator('.lib-mod').first()
  await modInput.fill(libMod)
  await modInput.press('Tab') // @change → renomme la modalité
  await fermerEditionVariables(page)
  await retourCorpus(page)
}

/** Ouvre l'onglet Données (saisie des valeurs) à l'écran Entretien. */
async function ongletDonnees(page: Page) {
  await page.locator('.onglets button[data-onglet="donnees"]').click()
}

test('Notes et Données partagent le volet droit et se replient au second clic', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-volet-donnees-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await creerVariable(page, "+ var. d'entretien", 'Lyon')
    await entrerEntretien(page)

    const volet = page.locator('.volet-notes')
    const notes = volet.locator('[data-onglet="notes"]')
    const donnees = volet.locator('[data-onglet="donnees"]')
    const panneauNotes = volet.locator('.panneau.notes')
    const panneauDonnees = volet.locator('.panneau.donnees')
    const titreNote = panneauNotes.locator('.champ-titre-note input')
    await expect(page.locator('.colonne-gauche [data-onglet="donnees"]')).toHaveCount(0)

    await notes.click()
    await titreNote.fill('Brouillon conservé')
    await donnees.click()
    await expect(donnees).toHaveAttribute('aria-expanded', 'true')
    await expect(notes).toHaveAttribute('aria-expanded', 'false')
    await expect(panneauNotes).toBeHidden()
    await panneauDonnees.locator('.saisie-eav-sel').first().selectOption({ label: 'Lyon' })
    await expect(page.locator('.colonne-gauche .panneau.locuteurs-coder')).toBeVisible()

    await notes.click()
    await expect(panneauDonnees).toBeHidden()
    await expect(titreNote).toHaveValue('Brouillon conservé')
    await notes.click()
    await expect(volet).not.toHaveClass(/ouvert/)
    await expect(notes).toHaveAttribute('aria-expanded', 'false')

    await donnees.click()
    await expect(panneauDonnees.locator('.saisie-eav-sel option:checked').first()).toHaveText('Lyon')
    await donnees.click()
    await expect(volet).not.toHaveClass(/ouvert/)
    await expect(donnees).toHaveAttribute('aria-expanded', 'false')
    await donnees.focus()
    await page.keyboard.press('Enter')
    await expect(donnees).toHaveAttribute('aria-expanded', 'true')
  } finally {
    await app.close()
  }
})

test('saisir une valeur (entretien) → persistée et reflétée par la matrice après réouverture', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-eav-'))

  const app1 = await lancer(dir)
  const page1 = await app1.firstWindow()
  await entrerCorpus(page1)
  await creerVariable(page1, "+ var. d'entretien", 'Lyon')
  await entrerEntretien(page1) // saisie = écran Entretien
  await ongletDonnees(page1)
  await page1.locator('.saisie-eav-sel').first().selectOption({ label: 'Lyon' })
  await expect(page1.locator('.tete .etat')).toHaveText('à jour')
  await app1.close()

  // Réouverture, MÊME dossier : la valeur est là et la matrice (requête) la montre.
  const app2 = await lancer(dir)
  const page2 = await app2.firstWindow()
  await entrerCorpus(page2)
  await entrerEntretien(page2)
  await ongletDonnees(page2)
  await expect(page2.locator('.saisie-eav-sel option:checked').first()).toHaveText('Lyon')
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
  await page.locator('.fiche-loc').first().locator('.saisie-eav-sel').first().selectOption({ label: 'Femme' })
  await expect(page.locator('.tete .etat')).toHaveText('à jour')

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
  await page.locator('.saisie-eav-sel').first().selectOption({ label: 'Lyon' })
  await expect(page.locator('.tete .etat')).toHaveText('à jour')

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

test('sous-onglets « Locuteur » / « Entretien » : le crayon ouvre l’édition bornée à la portée affichée', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-eav-onglets-')
  await entrerEntretien(page)
  await ongletDonnees(page)
  const panneau = page.locator('.volet-notes .panneau.donnees')

  // Corpus sans variables : « Locuteur » est actif par défaut.
  await expect(panneau.locator('.sous-onglet-bouton.actif')).toHaveText('Locuteur')
  await expect(panneau.locator('.vide')).toHaveText('Aucune variable de locuteur — ✏️ pour en créer.')

  // Le crayon ouvre l’édition SANS créer rien d’emblée, bornée à la portée
  // affichée : seul « + var. de locuteur » est proposé.
  await panneau.locator('.crayon').click()
  await expect(page.locator('.modale-vars')).toBeVisible()
  await expect(page.locator('.modale-vars .liste-var > li')).toHaveCount(0)
  await expect(page.locator('.modale-vars .corpus-tete .mini', { hasText: '+ var. de locuteur' })).toHaveCount(1)
  await expect(page.locator('.modale-vars .corpus-tete .mini', { hasText: "+ var. d'entretien" })).toHaveCount(0)

  // La création reste possible DEPUIS la fenêtre, et reste de portée locuteur.
  await page.locator('.modale-vars .corpus-tete .mini', { hasText: '+ var. de locuteur' }).click()
  await expect(page.locator('.modale-vars .liste-var > li')).toHaveCount(1)
  await expect(page.locator('.modale-vars .portee.locuteur')).toHaveCount(1)
  await expect(page.locator('.modale-vars .nom-var')).toBeFocused()
  await fermerEditionVariables(page)

  // La variable créée est de portée locuteur : fiche du premier locuteur.
  await expect(panneau.locator('.fiche-loc').first()).toBeVisible()

  // La bascule manuelle vers « Entretien » vide ce sous-onglet.
  await panneau.locator('.sous-onglet-bouton', { hasText: 'Entretien' }).click()
  await expect(panneau.locator('.sous-onglet-bouton.actif')).toHaveText('Entretien')
  await expect(panneau.locator('.fiche-loc')).toHaveCount(0)
  await expect(panneau.locator('.vide')).toHaveText('Aucune variable d’entretien — ✏️ pour en créer.')
  await app.close()
})
