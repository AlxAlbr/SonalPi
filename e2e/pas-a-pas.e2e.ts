import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, attendreCorpus, ajouterParModale, retourCorpus, selectionner, spotlightSur } from './util'

/**
 * Pas-à-pas (plan-tutoriel §14, plan-reference-audio §7.4) : depuis l'Accueil,
 * « Découverte pas à pas » passe par la modale à deux dossiers puis démarre sur
 * un corpus vide + active l'onglet « Pas à pas » avec un spotlight. Les 5 étapes
 * se valident en observant le modèle réactif.
 *
 * L'étape 1 pointe le VRAI bouton « + Ajouter un entretien » (data-tour posé en
 * J2) : la bulle se cale à côté. Le geste RÉEL passe par la vraie modale à deux
 * zones (srt puis audio) — il valide le prédicat (membership non vide).
 */

/** Stub des DEUX dialogues de la modale démo : 1er = sources, 2e = dossier du
 *  corpus de CE mode (un dossier = un corpus — choisi directement). */
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
  parent: string,
): Promise<void> {
  await stuberDeuxDossiers(app, sources, parent)
  await page.locator('.carte-demo.pas-a-pas').click()
  await expect(page.locator('.modale-demo')).toBeVisible()
  await page.locator('.modale-demo .choisir-dossier').first().click()
  await page.locator('.modale-demo .choisir-dossier').nth(1).click()
  await page.locator('.modale-demo .valider').click()
  await attendreCorpus(page)
  await expect(page.locator('.panneau.pas-a-pas')).toBeVisible()
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/actif/)
}

test('pas-à-pas : charger, corriger, coder, saisir une variable', async () => {
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
  // La bulle est calée à côté (pas centrée).
  await expect(page.locator('.spotlight-bulle')).toBeVisible()

  // --- Étape 1 : le geste réel — la vraie modale « + Ajouter un entretien » ---
  // Re-stuber les dialogues FICHIER (srt puis mp3 — choisis dans les sources
  // matérialisées) et passer par la vraie modale à deux zones.
  await app.evaluate(({ dialog }, args) => {
    const fichiers = [args.srt, args.mp3]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fichiers[Math.min(i++, fichiers.length - 1)]],
    })
  }, { srt: join(dirSources, 'srt', 'E1.srt'), mp3: join(dirSources, 'audio', 'E1.mp3') })

  // Parcours séquentiel guidé : une fois la modale ouverte, le spotlight quitte
  // le bouton puis pointe successivement la zone FICHIER D'ENTRETIEN (SRT), la
  // zone FICHIER SON (audio) dès qu'un texte est chargé, puis « Valider » une
  // fois l'audio choisi.
  await page.locator('.ajout-ent').click()
  await expect(page.locator('.modale-ajout')).toBeVisible()
  await spotlightSur(page, '[data-tour="zone-texte"]')
  await page.locator('.zone-texte').click()
  await expect(page.locator('.zone-texte .zone-fichier')).toBeVisible()
  await spotlightSur(page, '[data-tour="zone-audio"]')
  await page.locator('.zone-audio').click()
  await expect(page.locator('.zone-audio .zone-fichier')).toBeVisible()
  await spotlightSur(page, '[data-tour="valider"]')
  await page.locator('.modale-ajout .valider').click()
  // Fatima est chargée (membership non vide), l'entretien s'ouvre avec son audio
  // (la vraie modale ouvre l'entretien automatiquement → on est déjà dans l'éditeur).
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.lecteur-audio')).toBeVisible()
  // L'étape 1 est cochée, mais le guidage s'ARRÊTE — PAS d'enchaînement
  // automatique : l'utilisateur clique l'étape 2 dans la liste pour la lancer.
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)

  // --- Étape 2 : Écouter et corriger la transcription (lancée AU CLIC) ---
  // La liste vit sur l'écran Corpus : on y revient, on clique l'étape 2 → le
  // spotlight guide d'abord vers le crayon de la carte de Fatima.
  await retourCorpus(page)
  await page.locator('.liste-pp li').nth(1).locator('.ligne-pp').click()
  await spotlightSur(page, '[data-tour="crayon-entretien"]')
  // Ouvrir l'entretien → la consigne devient un PANNEAU sous les onglets (plus
  // de bulle flottante ni de trou qui cacheraient le texte). PAS de bouton
  // « Lancer la lecture » : l'utilisateur fait le geste lui-même ; la consigne
  // cite le raccourci double-espace.
  await page.locator('.carte-ent .crayon').first().click()
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.guide-pp')).toBeVisible()
  await expect(page.locator('.guide-pp')).toContainText('DEUX FOIS sur la touche Espace')
  await expect(page.locator('.guide-pp .action')).toHaveCount(0)
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)
  // Le geste réel : clic sur le ▶ du lecteur (l'audio E1 est chargé), puis
  // correction — l'ASR a doublé le point d'interrogation de la 1re ligne
  // (« Maison des Habitants? ? ») — on retire le « ? » fautif.
  await page.locator('.lecteur-audio .play').click()
  await selectionner(page, 'Habitants?')
  await page.keyboard.type('Habitants')
  // Le texte a été édité → étape 2 cochée, le panneau disparaît. Retour
  // AUTOMATIQUE à la liste « Pas à pas » (écran Corpus) — l'étape 3 se lance au
  // clic (jamais d'enchaînement automatique).
  await expect(page.locator('.liste-pp li').nth(1)).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.guide-pp')).toHaveCount(0)
  await expect(page.locator('.corpus-ecran')).toBeVisible()

  // --- Étape 3 : Renommer les locuteurs (lancée AU CLIC) ---
  // L'entretien s'ouvre sur l'onglet LOCUTEURS par défaut. La consigne est un
  // PANNEAU en bas de la colonne (la bulle flottante recouvrait le 2ᵉ champ) :
  // aucun trou, les deux champs de nom restent accessibles.
  await page.locator('.liste-pp li').nth(2).locator('.ligne-pp').click()
  await spotlightSur(page, '[data-tour="crayon-entretien"]')
  await page.locator('.carte-ent .crayon').first().click()
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.guide-pp')).toBeVisible()
  await expect(page.locator('.guide-pp')).toContainText('Renommer les locuteurs')
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)
  // Ordre d'affichage = ordre d'apparition dans le SRT : Speaker 1 (l'ingénieure,
  // qui pose les questions) est la 1re ligne, Speaker 0 (Fatima) la 2ᵉ.
  const champs = page.locator('.nom-loc')
  await champs.nth(0).fill('Enquêteur·rice')
  await champs.nth(0).blur() // blur → @change → renommerLoc
  await champs.nth(1).fill('Fatima')
  await champs.nth(1).blur()
  // Plus aucun « Speaker N » → étape 3 cochée (guidage de nouveau arrêté) et
  // retour AUTOMATIQUE à la liste « Pas à pas ».
  await expect(page.locator('.liste-pp li').nth(2)).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)
  await expect(page.locator('.corpus-ecran')).toBeVisible()

  // --- Étape 4 : Créer une thématique et annoter (lancée AU CLIC) ---
  await page.locator('.liste-pp li').nth(3).locator('.ligne-pp').click()
  await spotlightSur(page, '[data-tour="crayon-entretien"]')
  // Ouvrir l'entretien → le spotlight bascule (recalcul live) sur l'onglet Thématique.
  await page.locator('.carte-ent .crayon').first().click()
  await expect(page.locator('.editeur')).toBeVisible()
  await spotlightSur(page, '[data-tour="onglet-themes"]')
  // Sélectionner du texte réel du 1er bloc puis coder avec le 1er thème — un
  // clic seul (curseur) peut tomber sur un espace où rien ne se code ; la
  // sélection garantit l'annotation (même helper que les tests audio).
  await selectionner(page, 'me recevoir')
  await page.locator('.onglets button', { hasText: 'Thèmes' }).click()
  await page.locator('.theme-coder').first().click()
  // Une annotation de codage existe → étape 4 cochée (guidage de nouveau arrêté)
  // et retour AUTOMATIQUE à la liste « Pas à pas ».
  await expect(page.locator('.liste-pp li').nth(3)).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)
  await expect(page.locator('.corpus-ecran')).toBeVisible()

  // --- Étape 5 : Saisir une variable (lancée AU CLIC) ---
  await page.locator('.liste-pp li').nth(4).locator('.ligne-pp').click()
  await spotlightSur(page, '[data-tour="crayon-entretien"]')
  await page.locator('.carte-ent .crayon').first().click()
  await expect(page.locator('.editeur')).toBeVisible()
  await spotlightSur(page, '[data-tour="onglet-donnees"]')
  // La cible = onglet Données. La variable « Ville » (portée locuteur, saisie
  // libre) est pré-créée par le mode pas-à-pas → champ texte par locuteur.
  await page.locator('.onglets button', { hasText: 'Données' }).click()
  const saisieLibre = page.locator('.panneau.donnees .saisie-libre').first()
  await expect(saisieLibre).toBeVisible({ timeout: 5_000 })
  await saisieLibre.fill('Villebourg')
  await saisieLibre.press('Enter')
  await expect(page.locator('.liste-pp li').nth(4)).toHaveClass(/fait/, { timeout: 5_000 })

  // Re-test : une étape DÉJÀ validée peut être rouverte — cliquer l'étape 3
  // (renommer, déjà faite) puis le crayon OUVRE l'entretien et on y RESTE
  // (pas de retour automatique : l'étape ne change pas d'état — sinon
  // l'entretien s'ouvrait et se refermait aussitôt car les locuteurs sont déjà
  // renommés). Le guidage s'éteint et un petit message « déjà réalisée »
  // s'affiche, avec un bouton pour revenir au Pas à pas.
  await page.locator('.liste-pp li').nth(2).locator('.ligne-pp').click()
  await spotlightSur(page, '[data-tour="crayon-entretien"]')
  await page.locator('.carte-ent .crayon').first().click()
  await expect(page.locator('.editeur')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.editeur')).toContainText('Fatima')
  // On reste dans l'entretien : guidage éteint, écran Corpus non revenu, et le
  // message re-test est affiché avec le texte propre à l'étape (renommer).
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)
  await expect(page.locator('.corpus-ecran')).not.toBeVisible()
  await expect(page.locator('.guide-pp.retest')).toBeVisible()
  await expect(page.locator('.guide-pp.retest')).toContainText('déjà')
  await expect(page.locator('.guide-pp.retest')).toContainText('re-renommer les locuteurs')
  // Le bouton du message ramène à la liste « Pas à pas » (et l'efface).
  await page.locator('.guide-pp.retest button').click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(page.locator('.guide-pp.retest')).toHaveCount(0)

  // Re-test d'« Écouter et corriger » (étape 2, déjà faite) : son prédicat
  // (`texteModifie`) repart à FAUX à chaque ouverture — le message « déjà
  // réalisée » doit quand même apparaître dès l'ouverture de l'entretien, sans
  // avoir à retoucher le texte.
  await page.locator('.liste-pp li').nth(1).locator('.ligne-pp').click()
  await spotlightSur(page, '[data-tour="crayon-entretien"]')
  await page.locator('.carte-ent .crayon').first().click()
  await expect(page.locator('.editeur')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.guide-pp.retest')).toBeVisible()
  await expect(page.locator('.guide-pp.retest')).toContainText('continuer à écouter')

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
  // les sources matérialisées) et passer par la vraie modale à deux zones.
  await app.evaluate(({ dialog }, args) => {
    const fichiers = [args.srt, args.mp3]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fichiers[Math.min(i++, fichiers.length - 1)]],
    })
  }, { srt: join(dirSources, 'srt', 'E1.srt'), mp3: join(dirSources, 'audio', 'E1.mp3') })
  await ajouterParModale(page, ['texte', 'audio'])

  // Même prédicat : entretien créé (titre = nom du fichier), étape 1 cochée.
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/fait/, { timeout: 5_000 })
  // L'entretien s'ouvre (la vraie modale) avec son lecteur (audio RÉFÉRENCÉ).
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.lecteur-audio')).toBeVisible()

  await app.close()
})

test('réouverture par « Récents » : le panneau ET l\'historique des étapes sont restaurés', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-pp-recent-'))
  const dirSources = mkdtempSync(join(tmpdir(), 'sonal-pp-recent-sources-'))
  const dirCorpus = mkdtempSync(join(tmpdir(), 'sonal-pp-recent-corpus-'))
  const corpusDir = dirCorpus

  // 1re session : préparation pas-à-pas + ÉTAPE 1 faite (Fatima importée via la
  // vraie modale — les dialogues FICHIER pointent vers les sources).
  let app = await lancer(profil)
  let page = await app.firstWindow()
  await attendreAccueil(page)
  await preparerPasAPas(app, page, dirSources, dirCorpus)
  await app.evaluate(({ dialog }, args) => {
    const fichiers = [args.srt, args.mp3]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fichiers[Math.min(i++, fichiers.length - 1)]],
    })
  }, { srt: join(dirSources, 'srt', 'E1.srt'), mp3: join(dirSources, 'audio', 'E1.mp3') })
  await ajouterParModale(page, ['texte', 'audio'])
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/fait/, { timeout: 5_000 })
  // Attendre que l'historique soit écrit dans le MARQUEUR du corpus (watch →
  // corpus:marquerDemo) avant de fermer — sinon le test pourrait lire trop tôt.
  await expect
    .poll(() => JSON.parse(readFileSync(join(corpusDir, 'corpus.json'), 'utf8')).demo?.validees ?? [])
    .toContain('charger')
  await app.close()

  // L'historique est PERSISTÉ dans le marqueur du corpus (J6) : l'étape
  // « charger » est mémorisée avec le mode pas-a-pas.
  const marqueur = JSON.parse(readFileSync(join(corpusDir, 'corpus.json'), 'utf8')).demo
  expect(marqueur.mode).toBe('pas-a-pas')
  expect(marqueur.validees).toContain('charger')

  // 2e session (même profil, settings PRÉSERVÉS) : rouvrir le corpus démo par
  // « Récents » → le panneau réapparaît AVEC l'historique (étape 1 cochée).
  app = await lancer(profil, { preserverSettings: true })
  page = await app.firstWindow()
  await attendreAccueil(page)
  // Le 1er récent est le corpus démo (ouvrirDossier l'a mis en tête en session 1).
  await page.locator('.recents .recent').first().click()
  await attendreCorpus(page)
  await expect(page.locator('.panneau.pas-a-pas')).toBeVisible()
  await expect(page.locator('.onglets-corpus')).toBeVisible()
  await expect(page.locator('.liste-pp li')).toHaveCount(5)
  // Étape 1 cochée (mémorisée + re-dérivée du modèle — un entretien existe) ;
  // les étapes 2 à 5 ne sont pas faites. Le spotlight reste inactif.
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.liste-pp li').nth(1)).not.toHaveClass(/fait/)
  await expect(page.locator('.liste-pp li').nth(2)).not.toHaveClass(/fait/)
  await expect(page.locator('.liste-pp li').nth(3)).not.toHaveClass(/fait/)
  await expect(page.locator('.liste-pp li').nth(4)).not.toHaveClass(/fait/)
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)

  await app.close()
})
