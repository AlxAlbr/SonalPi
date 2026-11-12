import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, entrerEntretien, lancer, ouvrirAnalyse, ouvrirOrganisation, retourCorpus } from './util'

/**
 *  Navigation par espaces : « Préparer et suivre » (tableau de bord, documents
 *  cadre), « Analyser et interpréter » (tri et synthèse, Lexico, analyses croisées) et
 *  « Importer et traiter » (corpus, entretien). Changer d'espace ne ferme pas
 *  l'entretien : on le retrouve tel qu'on l'a laissé.
 */
test('les deux espaces de préparation, leurs onglets et le retour au traitement', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-espaces-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)

  const barre = page.locator('.barre-outils')
  await expect(barre.getByRole('button', { name: 'Préparer & Suivre' })).toBeVisible()
  const traitement = barre.getByRole('button', { name: 'Importer & Traiter' })
  await expect(traitement).toHaveAttribute('aria-current', 'page')
  // Les deux anciens lanceurs de fenêtres ne sont plus dans la barre.
  await expect(barre.getByRole('button', { name: 'Tableau de bord' })).toHaveCount(0)
  await expect(barre.getByRole('button', { name: 'Docs cadre projet' })).toHaveCount(0)

  // L’accueil présente les outils et une introduction, sans afficher la grille.
  await barre.getByRole('button', { name: 'Préparer & Suivre' }).click()
  const espace = page.locator('.espace-preparation')
  await expect(espace).toBeVisible()
  await expect(page.locator('.corpus-ecran')).toBeHidden()
  await expect(barre.getByRole('button', { name: 'Préparer & Suivre' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.fil')).toContainText('Corpus')
  await expect(page.locator('.fil')).not.toContainText('Préparer et suivre')
  // Déjà au niveau corpus : le lien n'est pas cliquable.
  await expect(page.locator('.fil .lien-nav', { hasText: 'Corpus' })).toBeDisabled()
  await expect(page.locator('[data-tour="ouvrir-accueil-preparation"]')).toHaveAttribute('aria-current', 'page')
  const cote = espace.locator('.cote-preparation')
  await expect(cote).toContainText('Préparation')
  await expect(cote).toContainText('Tableau de bord')
  await expect(cote).toContainText('Documents du projet')
  await expect(cote).toContainText('Documents exemples')
  await expect(espace.locator('.principal td.case').first()).toBeHidden()
  await expect(espace.locator('.presentation-preparation')).toBeVisible()

  // Les quatre onglets partagent le fond et la taille de titre des panneaux de l'entretien.
  const accueil = cote.locator('.accueil-preparation')
  const fondPanneau = await accueil.evaluate((el) => getComputedStyle(el).backgroundColor)
  const tailleTitre = await accueil.locator('.corpus-tete h3').evaluate((el) => getComputedStyle(el).fontSize)

  // Onglet Tableau de bord : ses cartes à gauche, la grille à droite.
  await accueil.getByRole('button', { name: /^Tableau de bord/ }).click()
  await expect(page.locator('[data-tour="ouvrir-tableau-bord"]')).toHaveAttribute('aria-current', 'page')
  const panneauTableau = cote.locator('.panneau-tableau-bord')
  await expect(panneauTableau).toHaveCSS('background-color', fondPanneau)
  await expect(panneauTableau.locator('.corpus-tete h3')).toHaveCSS('font-size', tailleTitre)
  await expect(panneauTableau.locator('.corpus-tete h3')).toHaveText('Tableau de bord')
  await expect(panneauTableau.locator('.carte h3')).toHaveText(['Ajouter une colonne', 'Ajouter une ligne', 'Ajouter un badge'])
  await expect(espace.locator('.principal td.case').first()).toBeVisible()

  // Onglet Documents du projet : liste à gauche, aperçu à droite.
  await page.locator('[data-tour="ouvrir-docs-cadre"]').click()
  await expect(page.locator('[data-tour="ouvrir-docs-cadre"]')).toHaveAttribute('aria-current', 'page')
  const panneauDocs = cote.locator('.cote-docs')
  await expect(panneauDocs).toHaveCSS('background-color', fondPanneau)
  await expect(panneauDocs.locator('.corpus-tete h3')).toHaveCSS('font-size', tailleTitre)
  await expect(panneauDocs.locator('.corpus-tete h3')).toHaveText('Documents du projet')
  await expect(espace.locator('.principal')).toContainText('Choisissez un document du projet dans la liste.')

  // Onglet Documents exemples : seuls les modèles embarqués sont proposés.
  await page.locator('[data-tour="ouvrir-documents-exemples"]').click()
  await expect(page.locator('[data-tour="ouvrir-documents-exemples"]')).toHaveAttribute('aria-current', 'page')
  await expect(panneauDocs.locator('.corpus-tete h3')).toHaveText('Documents exemples')
  await expect(cote).toContainText('Guide de correction.txt')
  await expect(espace.locator('.principal')).toContainText('Choisissez un document d’exemple dans la liste.')

  // Retour au traitement : on retrouve le corpus, puis l'onglet est mémorisé.
  await traitement.click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(espace).toBeHidden()
  await barre.getByRole('button', { name: 'Préparer & Suivre' }).click()
  await expect(page.locator('[data-tour="ouvrir-documents-exemples"]')).toHaveAttribute('aria-current', 'page')
  await expect(espace.locator('.principal')).toContainText('Choisissez un document d’exemple dans la liste.')

  await traitement.click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await app.close()
})

test('depuis un entretien, le retour au corpus permet de changer d’espace puis de reprendre', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-espaces-ent-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)
  await entrerEntretien(page)
  await expect(page.locator('.editeur')).toContainText('Karine')
  await expect(page.locator('.barre-outils')).toBeHidden()
  await retourCorpus(page)

  await page.locator('.barre-outils').getByRole('button', { name: 'Préparer & Suivre' }).click()
  await expect(page.locator('.espace-preparation')).toBeVisible()
  await expect(page.locator('.entretien-ecran')).toBeHidden()
  await expect(page.locator('.fil')).toContainText('Corpus')
  await expect(page.locator('.fil')).not.toContainText('Préparer et suivre')
  await expect(page.locator('.fil .lien-nav', { hasText: 'Corpus' })).toBeDisabled()

  // Le traitement revient au corpus ; Reprendre rouvre le dernier entretien.
  await page.locator('.barre-outils').getByRole('button', { name: 'Importer & Traiter' }).click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await page.locator('.tete .btn-reprise').click()
  await expect(page.locator('.entretien-ecran')).toBeVisible()
  await expect(page.locator('.editeur')).toContainText('Karine')
  await expect(page.locator('.fil .lien-nav.courant')).toContainText('Entretien')
  // Au niveau entretien, le retour au corpus reste proposé.
  await expect(page.locator('.fil .lien-nav', { hasText: 'Corpus' })).toBeEnabled()

  await app.close()
})

test('les espaces principaux sont verticaux dans un panneau à gauche et affichent leur page entière', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-espaces-vertical-')))
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.setViewportSize({ width: 900, height: 800 })

    const barre = page.locator('.barre-outils')
    const ongletsEspaces = barre.locator('button.espace')
    await expect(ongletsEspaces).toHaveCount(4)
    await expect(ongletsEspaces.nth(0)).toHaveAttribute('aria-label', 'Préparer & Suivre')
    await expect(ongletsEspaces.nth(1)).toHaveAttribute('aria-label', 'Importer & Traiter')
    await expect(ongletsEspaces.nth(2)).toHaveAttribute('aria-label', 'Analyser & Interpréter')
    await expect(ongletsEspaces.nth(3)).toHaveAttribute('aria-label', 'Organiser & Exporter')
    await expect(barre.locator('button.espace img')).toHaveCount(4)
    const hautContenu = await page.locator('.contenu-app').evaluate((el) => {
      const { top } = el.getBoundingClientRect()
      return top
    })
    const geometrieEntete = await page.locator('main.app > header').evaluate((el) => {
      const { top, height } = el.getBoundingClientRect()
      return { top, bottom: top + height }
    })
    expect(geometrieEntete.top).toBeLessThan(await barre.evaluate((el) => el.getBoundingClientRect().top))
    expect(geometrieEntete.bottom).toBeLessThanOrEqual(hautContenu)
    const positions = await barre.locator('button.espace').evaluateAll((boutons) =>
      boutons.map((bouton) => {
        const { top, left, width, height } = bouton.getBoundingClientRect()
        return { top, bottom: top + height, left, right: left + width, centerX: left + width / 2, centerY: top + height / 2 }
      }),
    )
    const panneau = await barre.evaluate((el) => {
      const { top, left, width, height } = el.getBoundingClientRect()
      return { top, left, right: left + width, centerY: top + height / 2 }
    })
    expect(panneau.right - panneau.left).toBeLessThan(100)
    expect(positions.every(({ left, right }) => left >= panneau.left && right <= panneau.right)).toBe(true)
    expect(new Set(positions.map(({ top }) => top)).size).toBe(4)
    expect(new Set(positions.map(({ centerX }) => Math.round(centerX))).size).toBe(1)
    expect(positions[0].centerY).toBeLessThan(positions[1].centerY)
    expect(positions[1].centerY).toBeLessThan(positions[2].centerY)
    expect(positions[2].centerY).toBeLessThan(positions[3].centerY)
    // Les espaces s'empilent depuis le haut du panneau, qui occupe toute la hauteur sous l'en-tête.
    expect(positions[0].top - panneau.top).toBeLessThan(1)
    expect(await barre.evaluate((el) => el.getBoundingClientRect().left)).toBeLessThan(
      await page.locator('.contenu-app').evaluate((el) => el.getBoundingClientRect().left),
    )

    await barre.getByRole('button', { name: 'Analyser & Interpréter' }).click()
    await expect(page.locator('.espace-analyse')).toBeVisible()
    await expect(page.locator('.corpus-ecran')).toBeHidden()
    await expect(page.locator('.espace-preparation')).toBeHidden()
  } finally {
    await app.close()
  }
})

test('l’organisation reprend son onglet depuis les autres espaces et conserve l’entretien', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-espaces-outil-')))
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await retourCorpus(page)
    await page.locator('.barre-outils').getByRole('button', { name: 'Préparer & Suivre' }).click()
    await ouvrirOrganisation(page, 'recueils')
    await expect(page.locator('#contenu-recueils-organisation')).toBeVisible()
    await expect(page.locator('.modale-recueils')).toBeHidden()
    await expect(page.locator('.espace-preparation')).toBeHidden()
    await expect(page.locator('.corpus-ecran')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Organiser & Exporter', exact: true })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('button', { name: 'Analyser & Interpréter', exact: true }).click()
    await page.getByRole('button', { name: 'Organiser & Exporter', exact: true }).click()
    await expect(page.locator('.onglets-organisation').getByRole('button', { name: 'Recueils', exact: true })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()
    await expect(page.locator('.corpus-ecran')).toBeVisible()
    await page.locator('.tete .btn-reprise').click()
    await expect(page.locator('.entretien-ecran')).toBeVisible()
    await expect(page.locator('.editeur')).toContainText('Karine')
    await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
    await ouvrirOrganisation(page, 'cas')
    await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()
    await expect(page.locator('.corpus-ecran')).toBeVisible()
    await expect(page.locator('.entretien-ecran')).toBeHidden()
  } finally {
    await app.close()
  }
})

test('l’espace d’analyse : accueil, onglets à icônes, filtres à gauche et résultats à droite', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-espaces-analyse-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)

  const barre = page.locator('.barre-outils')
  // Les trois outils ne sont plus des lanceurs de fenêtres dans la barre.
  await expect(barre.getByRole('button', { name: 'Tri et synthèse' })).toHaveCount(0)
  await expect(barre.getByRole('button', { name: 'Lexico' })).toHaveCount(0)
  await expect(barre.getByRole('button', { name: 'Analyses croisées' })).toHaveCount(0)

  await barre.getByRole('button', { name: 'Analyser & Interpréter' }).click()
  const espace = page.locator('.espace-analyse')
  await expect(espace).toBeVisible()
  await expect(page.locator('.corpus-ecran')).toBeHidden()
  await expect(barre.getByRole('button', { name: 'Analyser & Interpréter' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.fil')).toContainText('Corpus')
  await expect(page.locator('.fil')).not.toContainText('Analyser et interpréter')
  await expect(page.locator('.fil .lien-nav', { hasText: 'Corpus' })).toBeDisabled()

  // Ouverture par défaut : l'Accueil présente les trois outils.
  const cote = espace.locator('.cote-analyse')
  const accueil = cote.locator('.accueil-analyse')
  await expect(espace.locator('[data-tour="ouvrir-accueil-analyse"]')).toHaveAttribute('aria-current', 'page')
  await expect(accueil).toContainText('Analyse et interprétation')
  await expect(accueil).toContainText('Tri et synthèse')
  await expect(accueil).toContainText('Lexico')
  await expect(accueil).toContainText('Analyses croisées')
  await expect(espace.locator('.accueil-principal')).toContainText('Choisissez un outil')

  // Les onglets sont en haut de l'espace, soulignés, avec icône et libellé comme dans les autres espaces.
  const ongletAccueil = espace.locator('[data-tour="ouvrir-accueil-analyse"]')
  await expect(ongletAccueil).toHaveText('Accueil')
  await expect(ongletAccueil).toHaveCSS('border-bottom-width', '3px')
  await expect(ongletAccueil.locator('img')).toBeVisible()
  await expect(cote.locator('.onglet')).toHaveCount(0)
  const fondPanneau = await accueil.evaluate((el) => getComputedStyle(el).backgroundColor)

  // Tri et synthèse : critères à gauche, calcul à droite, sur le fond partagé des panneaux.
  await accueil.getByRole('button', { name: /^Tri et synthèse/ }).click()
  const synthese = espace.locator('.cote-synthese')
  const panneauSynthese = espace.locator('.panneau-synthese')
  await expect(espace.locator('[data-tour="ouvrir-synthese"]')).toHaveAttribute('aria-current', 'page')
  await expect(synthese).toBeVisible()
  await expect(synthese).toHaveCSS('background-color', fondPanneau)
  await expect(synthese).toContainText('Comment les choix se combinent')
  await expect(panneauSynthese).toBeVisible()
  await expect(panneauSynthese).toContainText('Calculer la synthèse')

  // Lexico : mêmes onglets à gauche, ses filtres dessous, l'index à droite.
  await espace.locator('[data-tour="ouvrir-lexico"]').click()
  await expect(espace.locator('[data-tour="ouvrir-lexico"]')).toHaveAttribute('aria-current', 'page')
  await expect(synthese).toBeHidden()
  await expect(espace.locator('.cote-lexico')).toBeVisible()
  await expect(espace.locator('.cote-lexico')).toContainText('Retirer ce filtre')
  await expect(espace.locator('.panneau-lexico')).toContainText('Index lexical')
  // Les trois outils ne s'ouvrent plus en fenêtre.
  await expect(page.getByRole('dialog', { name: 'Lexico' })).toHaveCount(0)

  // Analyses croisées : sélection à gauche, matrice à droite.
  await espace.locator('[data-tour="ouvrir-analyses-croisees"]').click()
  await expect(espace.locator('.cote-analyses')).toContainText('Tout sélectionner')
  await expect(espace.locator('.panneau-analyses')).toContainText('Calculer l’analyse')

  // Masquer la sélection libère toute la largeur ; les onglets restent en haut.
  await espace.locator('.panneau-analyses').getByRole('button', { name: 'Masquer la sélection' }).click()
  await expect(espace).toHaveClass(/panneau-masque/)
  await expect(espace.locator('[data-tour="ouvrir-synthese"]')).toBeVisible()
  await espace.locator('.panneau-analyses').getByRole('button', { name: 'Afficher la sélection' }).click()
  await expect(espace).not.toHaveClass(/panneau-masque/)

  // Retour au traitement, puis reprise sur le dernier onglet visité.
  await barre.getByRole('button', { name: 'Importer & Traiter' }).click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await barre.getByRole('button', { name: 'Analyser & Interpréter' }).click()
  await expect(espace.locator('[data-tour="ouvrir-analyses-croisees"]')).toHaveAttribute('aria-current', 'page')
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

  // Le retour contextuel retrouve Lexico et son index, sans recalcul.
  await page.getByRole('button', { name: '← Revenir à Lexico', exact: true }).click()
  await expect(page.locator('.espace-analyse .panneau-lexico')).toContainText('Index lexical')
  await expect(page.locator('[data-tour="ouvrir-lexico"]')).toHaveAttribute('aria-current', 'page')
  await expect(principal.locator('.table-wrap tbody tr').first()).toBeVisible()
  await app.close()
})
