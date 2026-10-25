import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, entrerEntretien, lancer, ouvrirAnalyse } from './util'

/**
 *  Navigation par espaces : « Préparer et suivre » (tableau de bord, documents
 *  cadre), « Analyser et interpréter » (synthèse, lexico, analyses croisées) et
 *  « Importer et traiter » (corpus, entretien). Changer d'espace ne ferme pas
 *  l'entretien : on le retrouve tel qu'on l'a laissé.
 */
test('les deux espaces de préparation, leurs onglets et le retour au traitement', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-espaces-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)

  const barre = page.locator('.barre-outils')
  await expect(barre.getByRole('button', { name: 'Préparer et suivre' })).toBeVisible()
  const traitement = barre.getByRole('button', { name: 'Importer et traiter' })
  await expect(traitement).toHaveAttribute('aria-current', 'page')
  // Les deux anciens lanceurs de fenêtres ne sont plus dans la barre.
  await expect(barre.getByRole('button', { name: 'Tableau de bord' })).toHaveCount(0)
  await expect(barre.getByRole('button', { name: 'Docs cadre projet' })).toHaveCount(0)

  // Ouverture de l'espace : l'Accueil présente les outils, le tableau reste à droite.
  await barre.getByRole('button', { name: 'Préparer et suivre' }).click()
  const espace = page.locator('.espace-preparation')
  await expect(espace).toBeVisible()
  await expect(page.locator('.corpus-ecran')).toBeHidden()
  await expect(barre.getByRole('button', { name: 'Préparer et suivre' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.fil')).toContainText('Corpus')
  await expect(page.locator('.fil')).not.toContainText('Préparer et suivre')
  // Déjà au niveau corpus : le lien n'est pas cliquable.
  await expect(page.locator('.fil .lien-nav', { hasText: 'Corpus' })).toBeDisabled()
  await expect(page.locator('[data-tour="ouvrir-accueil-preparation"]')).toHaveAttribute('aria-current', 'page')
  const cote = espace.locator('.cote-preparation')
  await expect(cote).toContainText('Préparation')
  await expect(cote).toContainText('Tableau de bord')
  await expect(cote).toContainText('Documents cadre')
  await expect(espace.locator('.principal td.case').first()).toBeVisible()

  // Les trois onglets partagent le fond et la taille de titre des panneaux de l'entretien.
  const accueil = cote.locator('.accueil-preparation')
  const fondPanneau = await accueil.evaluate((el) => getComputedStyle(el).backgroundColor)
  const tailleTitre = await accueil.locator('.corpus-tete h3').evaluate((el) => getComputedStyle(el).fontSize)

  // Onglet Tableau de bord : ses cartes à gauche, la grille à droite.
  await page.locator('[data-tour="ouvrir-tableau-bord"]').click()
  await expect(page.locator('[data-tour="ouvrir-tableau-bord"]')).toHaveAttribute('aria-current', 'page')
  const panneauTableau = cote.locator('.panneau-tableau-bord')
  await expect(panneauTableau).toHaveCSS('background-color', fondPanneau)
  await expect(panneauTableau.locator('.corpus-tete h3')).toHaveCSS('font-size', tailleTitre)
  await expect(panneauTableau.locator('.corpus-tete h3')).toHaveText('Tableau de bord')
  await expect(panneauTableau.locator('.carte h3')).toHaveText(['Colonne', 'Ligne', 'Badges'])
  await expect(espace.locator('.principal td.case').first()).toBeVisible()

  // Onglet Documents cadre : liste à gauche, aperçu à droite.
  await page.locator('[data-tour="ouvrir-docs-cadre"]').click()
  await expect(page.locator('[data-tour="ouvrir-docs-cadre"]')).toHaveAttribute('aria-current', 'page')
  const panneauDocs = cote.locator('.cote-docs')
  await expect(panneauDocs).toHaveCSS('background-color', fondPanneau)
  await expect(panneauDocs.locator('.corpus-tete h3')).toHaveCSS('font-size', tailleTitre)
  await expect(panneauDocs.locator('.corpus-tete h3')).toHaveText('Documents cadre')
  await expect(cote).toContainText('Documents exemples')
  await expect(espace.locator('.principal')).toContainText('Choisissez un document dans la liste.')

  // Retour au traitement : on retrouve le corpus, puis l'onglet est mémorisé.
  await traitement.click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(espace).toBeHidden()
  await barre.getByRole('button', { name: 'Préparer et suivre' }).click()
  await expect(page.locator('[data-tour="ouvrir-docs-cadre"]')).toHaveAttribute('aria-current', 'page')
  await expect(espace.locator('.principal')).toContainText('Choisissez un document dans la liste.')

  await traitement.click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await app.close()
})

test('depuis un entretien, l’espace ne ferme pas le travail en cours', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-espaces-ent-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)
  await entrerEntretien(page)
  await expect(page.locator('.editeur')).toContainText('Karine')

  await page.locator('.barre-outils').getByRole('button', { name: 'Préparer et suivre' }).click()
  await expect(page.locator('.espace-preparation')).toBeVisible()
  await expect(page.locator('.entretien-ecran')).toBeHidden()
  await expect(page.locator('.fil')).toContainText('Corpus')
  await expect(page.locator('.fil')).not.toContainText('Préparer et suivre')
  await expect(page.locator('.fil .lien-nav', { hasText: 'Corpus' })).toBeDisabled()

  // Importer et traiter ramène à l'entretien ouvert, intact.
  await page.locator('.barre-outils').getByRole('button', { name: 'Importer et traiter' }).click()
  await expect(page.locator('.entretien-ecran')).toBeVisible()
  await expect(page.locator('.editeur')).toContainText('Karine')
  await expect(page.locator('.fil .lien-nav.courant')).toContainText('Entretien')
  // Au niveau entretien, le retour au corpus reste proposé.
  await expect(page.locator('.fil .lien-nav', { hasText: 'Corpus' })).toBeEnabled()

  await app.close()
})

test('un outil encore en modale ramène au traitement avant de s’ouvrir', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-espaces-outil-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await page.locator('.barre-outils').getByRole('button', { name: 'Préparer et suivre' }).click()
  await expect(page.locator('.espace-preparation')).toBeVisible()

  await page.locator('.btn-cas').click()
  await expect(page.locator('.modale-cas')).toBeVisible()
  await expect(page.locator('.espace-preparation')).toBeHidden()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(page.locator('.barre-outils').getByRole('button', { name: 'Importer et traiter' }))
    .toHaveAttribute('aria-current', 'page')
  await page.locator('.modale-cas').getByRole('button', { name: 'Quitter ✕' }).click()
  await expect(page.locator('.modale-cas')).toBeHidden()

  // Même règle depuis l'espace d'analyse : la fenêtre ne s'ouvre pas par-dessus.
  await page.locator('.barre-outils').getByRole('button', { name: 'Analyser et interpréter' }).click()
  await expect(page.locator('.espace-analyse')).toBeVisible()
  await page.locator('.btn-recueils').click()
  await expect(page.locator('.modale-recueils')).toBeVisible()
  await expect(page.locator('.espace-analyse')).toBeHidden()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(page.locator('.barre-outils').getByRole('button', { name: 'Importer et traiter' }))
    .toHaveAttribute('aria-current', 'page')

  await app.close()
})

test('l’espace d’analyse : trois onglets, filtres à gauche et résultats à droite', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-espaces-analyse-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)

  const barre = page.locator('.barre-outils')
  // Les trois outils ne sont plus des lanceurs de fenêtres dans la barre.
  await expect(barre.getByRole('button', { name: 'Synthèse' })).toHaveCount(0)
  await expect(barre.getByRole('button', { name: 'Lexico' })).toHaveCount(0)
  await expect(barre.getByRole('button', { name: 'Analyses croisées' })).toHaveCount(0)

  await barre.getByRole('button', { name: 'Analyser et interpréter' }).click()
  const espace = page.locator('.espace-analyse')
  await expect(espace).toBeVisible()
  await expect(page.locator('.corpus-ecran')).toBeHidden()
  await expect(barre.getByRole('button', { name: 'Analyser et interpréter' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.fil')).toContainText('Corpus')
  await expect(page.locator('.fil')).not.toContainText('Analyser et interpréter')
  await expect(page.locator('.fil .lien-nav', { hasText: 'Corpus' })).toBeDisabled()

  // Ouverture par défaut : Synthèse, critères à gauche, calcul à droite.
  const cote = espace.locator('.cote-analyse')
  const synthese = espace.locator('.cote-synthese')
  const panneauSynthese = espace.locator('.panneau-synthese')
  await expect(cote.locator('[data-tour="ouvrir-synthese"]')).toHaveAttribute('aria-current', 'page')
  await expect(synthese).toBeVisible()
  await expect(synthese).toContainText('Comment les choix se combinent')
  await expect(panneauSynthese).toBeVisible()
  await expect(panneauSynthese).toContainText('Calculer la synthèse')

  // Lexico : mêmes onglets à gauche, ses filtres dessous, l'index à droite.
  await cote.locator('[data-tour="ouvrir-lexico"]').click()
  await expect(cote.locator('[data-tour="ouvrir-lexico"]')).toHaveAttribute('aria-current', 'page')
  await expect(synthese).toBeHidden()
  await expect(espace.locator('.cote-lexico')).toBeVisible()
  await expect(espace.locator('.cote-lexico')).toContainText('Retirer ce filtre')
  await expect(espace.locator('.panneau-lexico')).toContainText('Index lexical')
  // Les trois outils ne s'ouvrent plus en fenêtre.
  await expect(page.getByRole('dialog', { name: 'Lexico' })).toHaveCount(0)

  // Analyses croisées : sélection à gauche, matrice à droite.
  await cote.locator('[data-tour="ouvrir-analyses-croisees"]').click()
  await expect(espace.locator('.cote-analyses')).toContainText('Tout sélectionner')
  await expect(espace.locator('.panneau-analyses')).toContainText('Calculer l’analyse')

  // Masquer la sélection réduit la colonne à ses onglets, sans les perdre.
  await espace.locator('.panneau-analyses').getByRole('button', { name: 'Masquer la sélection' }).click()
  await expect(espace).toHaveClass(/panneau-masque/)
  await expect(cote.locator('[data-tour="ouvrir-synthese"]')).toBeVisible()
  await espace.locator('.panneau-analyses').getByRole('button', { name: 'Afficher la sélection' }).click()
  await expect(espace).not.toHaveClass(/panneau-masque/)

  // Retour au traitement, puis reprise sur le dernier onglet visité.
  await barre.getByRole('button', { name: 'Importer et traiter' }).click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await barre.getByRole('button', { name: 'Analyser et interpréter' }).click()
  await expect(cote.locator('[data-tour="ouvrir-analyses-croisees"]')).toHaveAttribute('aria-current', 'page')
  await app.close()
})

test('depuis Lexico, une concordance ouvre l’entretien et l’espace reprend son onglet', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-espaces-lexico-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)
  await ouvrirAnalyse(page, 'lexico')

  const principal = page.locator('.espace-analyse .panneau-lexico')
  await expect(principal.locator('.table-wrap tbody tr').first()).toBeVisible({ timeout: 30_000 })
  await principal.locator('.table-wrap tbody tr').first().click()
  const concordance = principal.locator('.concordances .concordance').first()
  await expect(concordance).toBeVisible()
  await concordance.click()

  // La source s'ouvre dans le traitement, à sa position.
  await expect(page.locator('.entretien-ecran')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.fil .lien-nav.courant')).toContainText('Entretien')

  // Le retour dans l'espace retrouve Lexico et son index, sans recalcul.
  await page.locator('.barre-outils').getByRole('button', { name: 'Analyser et interpréter' }).click()
  await expect(page.locator('.espace-analyse .panneau-lexico')).toContainText('Index lexical')
  await expect(page.locator('[data-tour="ouvrir-lexico"]')).toHaveAttribute('aria-current', 'page')
  await expect(principal.locator('.table-wrap tbody tr').first()).toBeVisible()
  await app.close()
})
