import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, attendreCorpus, ajouterParModale } from './util'

/**
 * Pas-à-pas (plan-tutoriel §14, plan-reference-audio §7.4) : depuis l'Accueil,
 * « Découverte pas à pas » passe par la modale à deux dossiers puis démarre sur
 * un corpus vide + active l'onglet « Pas à pas » avec un spotlight. Les 3 étapes
 * se valident en observant le modèle réactif.
 *
 * L'étape 1 pointe le VRAI bouton « + Ajouter un entretien » (data-tour posé en
 * J2) : la bulle se cale à côté, et le one-click renommé « Faire à ma place »
 * n'est qu'une commodité — le geste RÉEL passe par la vraie modale à deux zones.
 * Les deux gestes valident le même prédicat (membership non vide).
 */

/** Stub des DEUX dialogues de la modale démo : 1er = sources, 2e = corpus. */
async function stuberDeuxDossiers(
  app: import('@playwright/test').ElectronApplication,
  sources: string,
  corpus: string,
): Promise<void> {
  await app.evaluate(({ dialog }, args) => {
    const dossiers = [args.sources, args.corpus]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [dossiers[Math.min(i++, dossiers.length - 1)]],
    })
  }, { sources, corpus })
}

/** Ouvre la modale démo depuis la carte pas-à-pas et la valide. */
async function preparerPasAPas(
  app: import('@playwright/test').ElectronApplication,
  page: import('@playwright/test').Page,
  sources: string,
  corpus: string,
): Promise<void> {
  await stuberDeuxDossiers(app, sources, corpus)
  await page.locator('.carte-demo.pas-a-pas').click()
  await expect(page.locator('.modale-demo')).toBeVisible()
  await page.locator('.modale-demo .choisir-dossier').first().click()
  await page.locator('.modale-demo .choisir-dossier').nth(1).click()
  await page.locator('.modale-demo .valider').click()
  await attendreCorpus(page)
  await expect(page.locator('.panneau.pas-a-pas')).toBeVisible()
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/actif/)
}

test('pas-à-pas : charger, coder, saisir une variable', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-pp-'))
  const dirSources = mkdtempSync(join(tmpdir(), 'sonal-pp-sources-'))
  const dirCorpus = mkdtempSync(join(tmpdir(), 'sonal-pp-corpus-'))
  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)

  await preparerPasAPas(app, page, dirSources, dirCorpus)

  // L'étape 1 encadre le VRAI bouton « + Ajouter un entretien » (spotlight-trou
  // qui chevauche le bouton — §7.4 : le geste réel est le vrai bouton).
  await expect(page.locator('.spotlight-trou')).toBeVisible()
  await expect(page.locator('[data-tour="ajouter-entretien"]')).toBeVisible()
  // Poll : la position du trou est recalculée à chaque frame (transition 0,12 s) —
  // on attend qu'il chevauche réellement le bouton.
  await expect
    .poll(async () => {
      const t = await page.locator('.spotlight-trou').boundingBox()
      const b = await page.locator('[data-tour="ajouter-entretien"]').boundingBox()
      return !!t && !!b && !(
        t.x + t.width < b.x ||
        t.x > b.x + b.width ||
        t.y + t.height < b.y ||
        t.y > b.y + b.height
      )
    })
    .toBe(true)
  // La bulle est calée à côté (pas centrée) et le one-click est renommé.
  await expect(page.locator('.spotlight-bulle')).toBeVisible()
  await expect(page.locator('.spotlight-bulle .bulle-btn.primaire')).toContainText('Faire à ma place')

  // --- Étape 1 : one-click « Faire à ma place : importer Sylvie » ---
  await page.locator('.spotlight-bulle .bulle-btn.primaire').click()
  // Sylvie est chargée (membership non vide).
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await expect(page.locator('.carte-ent .ent-titre')).toContainText('Sylvie')
  // L'étape 1 est cochée, l'étape 2 (coder) devient active.
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/fait/)

  // --- Étape 2 : Créer une thématique et annoter ---
  // La cible est le crayon de la carte (aucun entretien ouvert). Spotlight dessus.
  await expect(page.locator('.spotlight-trou')).toBeVisible()
  // Ouvrir l'entretien (cliquer le crayon) — la cible bascule sur l'onglet Thèmes.
  await page.locator('.carte-ent .crayon').click()
  await expect(page.locator('.editeur')).toBeVisible()
  // Maintenant dans l'entretien : la cible = onglet Thématique.
  await expect(page.locator('.spotlight-trou')).toBeVisible()
  // Sélectionner du texte et coder avec le 1er thème.
  await page.locator('.editeur').click({ position: { x: 20, y: 20 } })
  await page.locator('.onglets button', { hasText: 'Thèmes' }).click()
  await page.locator('.theme-coder').first().click()
  // Une annotation de codage existe → étape 2 cochée.
  await expect(page.locator('.liste-pp li').nth(1)).toHaveClass(/fait/, { timeout: 5_000 })

  // --- Étape 3 : Saisir une variable ---
  // La cible = onglet Données. La variable « Ville » (portée locuteur, saisie
  // libre) est pré-créée par le mode pas-à-pas → champ texte par locuteur.
  await page.locator('.onglets button', { hasText: 'Données' }).click()
  const saisieLibre = page.locator('.panneau.donnees .saisie-libre').first()
  await expect(saisieLibre).toBeVisible({ timeout: 5_000 })
  await saisieLibre.fill('Villebourg')
  await saisieLibre.press('Enter')
  await expect(page.locator('.liste-pp li').nth(2)).toHaveClass(/fait/, { timeout: 5_000 })

  await app.close()
})

test('pas-à-pas : l’étape 1 par le geste RÉEL — la vraie modale « + Ajouter un entretien »', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-pp-reel-'))
  const dirSources = mkdtempSync(join(tmpdir(), 'sonal-pp-reel-sources-'))
  const dirCorpus = mkdtempSync(join(tmpdir(), 'sonal-pp-reel-corpus-'))
  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)

  await preparerPasAPas(app, page, dirSources, dirCorpus)
  await expect(page.locator('.spotlight-trou')).toBeVisible()

  // Le geste RÉEL : re-stuber les dialogues FICHIER (srt puis mp3 — choisis dans
  // les sources matérialisées) et passer par la vraie modale à deux zones. Le
  // prédicat de l'étape 1 (membership non vide) est le même que pour le one-click.
  await app.evaluate(({ dialog }, args) => {
    const fichiers = [args.srt, args.mp3]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fichiers[Math.min(i++, fichiers.length - 1)]],
    })
  }, { srt: join(dirSources, 'srt', 'E2.srt'), mp3: join(dirSources, 'audio', 'E2.mp3') })
  await ajouterParModale(page, ['texte', 'audio'])

  // Même prédicat : entretien créé (titre = nom du fichier), étape 1 cochée.
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/fait/, { timeout: 5_000 })
  // L'entretien s'ouvre (la vraie modale) avec son lecteur (audio RÉFÉRENCÉ).
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.lecteur-audio')).toBeVisible()

  await app.close()
})
