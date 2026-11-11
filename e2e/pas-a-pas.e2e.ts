import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, attendreCorpus, ajouterParModale, retourCorpus, selectionner, spotlightSur } from './util'

import { preparerApprentissage } from './exemples-util'

/** Les exercices utilisent les vrais gestes et valident leurs résultats enregistrés. */

async function ouvrirCatalogueParcours(page: import('@playwright/test').Page): Promise<void> {
  if (await page.locator('.voile-catalogue-parcours').isVisible()) return
  const suivi = page.getByTestId('resume-parcours-global')
  if (await suivi.isVisible()) {
    await suivi.getByRole('button', { name: 'Voir les étapes ou changer de parcours' }).click()
  } else {
    await page.locator('.carte-demo.parcours').click()
  }
  await expect(page.locator('.voile-catalogue-parcours')).toBeVisible()
}

/** Choisit Traitement avant de préparer le corpus d'exercice. */
async function preparerPasAPas(
  app: import('@playwright/test').ElectronApplication,
  page: import('@playwright/test').Page,
  sources: string,
  parent: string,
): Promise<void> {
  await preparerApprentissage(app, page, sources, parent, 'traitement')
  await attendreCorpus(page)
  await expect(page.locator('.carte-parcours')).toHaveCount(4)
  await expect(page.locator('.voile-catalogue-parcours')).not.toBeVisible()
  await expect(page.locator('.liste-pp li')).toHaveCount(6)
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/actif/)
  await expect(page.getByRole('button', { name: 'Voir les fichiers d’exercice', exact: true })).toHaveCount(0)
}

test('pas-à-pas : charger, noter, lier le srt, renommer, coder, saisir une variable', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-pp-'))
  const dirSources = mkdtempSync(join(tmpdir(), 'sonal-pp-sources-'))
  const dirCorpus = mkdtempSync(join(tmpdir(), 'sonal-pp-corpus-'))
  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)

  await preparerPasAPas(app, page, dirSources, dirCorpus)

  // Étapes séquencées : 2a « Prendre des notes à chaud » est accessible,
  // l'étape 1 non requise ; 2b exige 2a ; les étapes 3+ exigent l'étape 1.
  await expect(page.locator('.liste-pp li').nth(1).locator('.ligne-pp')).toBeEnabled()
  await expect(page.locator('.liste-pp li').nth(2).locator('.ligne-pp')).toBeDisabled()
  await expect(page.locator('.liste-pp li').nth(3).locator('.ligne-pp')).toBeDisabled()
  await expect(page.locator('.liste-pp li').nth(4).locator('.ligne-pp')).toBeDisabled()
  await expect(page.locator('.liste-pp li').nth(5).locator('.ligne-pp')).toBeDisabled()

  // L'étape 1 encadre le VRAI bouton « + Ajouter un entretien ».
  // Le spotlight-trou chevauche le bouton, mais le geste réel est le vrai bouton.
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
  // Re-stuber les dialogues FICHIER (srt puis mp3, choisis dans les sources matérialisées).
  // Passer par la vraie modale à deux zones.
  await app.evaluate(({ dialog }, args) => {
    const fichiers = [args.srt, args.mp3]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fichiers[Math.min(i++, fichiers.length - 1)]],
    })
  }, { srt: join(dirSources, 'srt', '1Coordinatrice.srt'), mp3: join(dirSources, 'audio', '1Coordinatrice.mp3') })

  // Parcours séquentiel guidé : une fois la modale ouverte, le spotlight quitte le bouton.
  // Il pointe ensuite la zone FICHIER D'ENTRETIEN (SRT), puis la zone FICHIER SON (audio)
  // dès qu'un texte est chargé, puis « Valider » une fois l'audio choisi.
  await page.locator('.ajout-ent').click()
  await expect(page.locator('.modale-ajout')).toBeVisible()
  await app.evaluate(({ shell }) => {
    shell.openPath = async (chemin) => { process.env.SONAL_TEST_OUVERT = chemin; return '' }
  })
  await page.getByRole('button', { name: 'Ouvrir le dossier des transcriptions' }).click()
  await expect.poll(() => app.evaluate(() => process.env.SONAL_TEST_OUVERT)).toBe(join(dirSources, 'srt'))
  await spotlightSur(page, '[data-tour="zone-texte"]')
  await page.locator('.zone-texte').click()
  await expect(page.locator('.zone-texte .zone-fichier')).toBeVisible()
  await page.getByRole('button', { name: 'Ouvrir le dossier des fichiers audio' }).click()
  await expect.poll(() => app.evaluate(() => process.env.SONAL_TEST_OUVERT)).toBe(join(dirSources, 'audio'))
  await spotlightSur(page, '[data-tour="zone-audio"]')
  await page.locator('.zone-audio').click()
  await expect(page.locator('.zone-audio .zone-fichier')).toBeVisible()
  await spotlightSur(page, '[data-tour="valider"]')
  await page.locator('.modale-ajout .valider').click()
  // Le corpus 1Coordinatrice est chargé (membership non vide) ; l'étape 1 se coche,
  // le guidage s'ARRÊTE (pas d'enchaînement automatique).
  // Nouveau comportement (retour utilisateur) : l'import guidé n'ouvre PAS l'entretien ;
  // on reste au Corpus.
  // Le message « étape terminée ✓ » s'affiche dans le parcours.
  // L'étape 2 ouvrira l'entretien (elle commence par le crayon de la carte).
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(page.locator('.editeur')).not.toBeVisible()
  await expect(page.locator('.fini-pp')).toBeVisible()
  await expect(page.locator('.fini-pp .fini-pp-titre')).toContainText('terminé')
  await expect(page.locator('.fini-pp .fini-pp-btn').first()).toContainText(
    'Étape suivante : Prendre des notes à chaud',
  )
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)

  // --- Étape 2 : Prendre des notes à chaud (lancée AU CLIC) ---
  // Scénario du retour d'entretien : un SECOND entretien se crée sans transcription.
  // L'audio est seul, la zone texte reste vide ; même modale que l'étape 1.
  // On ouvre ensuite cet entretien pour écrire la note « à chaud ».
  // Vérification explicite : l'entretien chargé à l'étape 1 est bien 1Coordinatrice.
  // (Le titre de la carte = nom du fichier SRT choisi.)
  // Toute la suite du parcours est construite sur son contenu.
  await expect(page.locator('.carte-ent .ent-titre')).toHaveText('1Coordinatrice')
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await ouvrirCatalogueParcours(page)
  await page.locator('.liste-pp li').nth(1).locator('.ligne-pp').click()
  // Le spotlight guide d'abord vers le VRAI bouton « + Ajouter un entretien ».
  await spotlightSur(page, '[data-tour="ajouter-entretien"]')
  // Re-stuber les dialogues : AUDIO SEUL cette fois (2RetraiteAnticipee.mp3) —
  // aucun fichier de transcription.
  await app.evaluate(({ dialog }, arg) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [arg] })
  }, join(dirSources, 'audio', '2RetraiteAnticipee.mp3'))
  // La modale s'ouvre : le spotlight quitte le bouton puis pointe la zone SON.
  // (Le texte reste vide, la transcription n'est pas prête.) Puis « Valider ».
  await page.locator('.ajout-ent').click()
  await expect(page.locator('.modale-ajout')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ouvrir le dossier des fichiers audio' })).toBeVisible()
  await spotlightSur(page, '[data-tour="zone-audio"]')
  await page.locator('.zone-audio').click()
  await expect(page.locator('.zone-audio .zone-fichier')).toContainText('2RetraiteAnticipee.mp3')
  await spotlightSur(page, '[data-tour="valider"]')
  await page.locator('.modale-ajout .valider').click()
  // Le 2e entretien (audio seul, au texte vide) existe et s'OUVRE (contrairement à l'étape 1).
  // Ici, la note se crée DANS l'entretien. La consigne devient un PANNEAU sous les onglets,
  // et le TROU guide l'onglet Notes (pas de bulle qui masquerait la saisie).
  // Le panneau raconte le reste du scénario (lier le SRT plus tard).
  await expect(page.locator('.carte-ent')).toHaveCount(2)
  await expect(page.locator('.editeur')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.guide-pp')).toBeVisible()
  await expect(page.locator('.guide-pp')).toContainText('à chaud')
  await expect(page.locator('.guide-pp .details-pp')).toHaveAttribute('aria-expanded', 'false')
  await page.locator('.guide-pp .details-pp').click()
  await expect(page.locator('.guide-pp')).toContainText('transcription')
  await expect(page.locator('.guide-pp .details-pp')).toHaveAttribute('aria-expanded', 'true')
  await spotlightSur(page, '[data-tour="onglet-notes"]')
  // Le geste réel, guidé champ par champ : onglet Notes, titre, corps,
  // puis création — le trou suit chaque cible.
  await page.locator('.onglets button[data-onglet="notes"]').click()
  await spotlightSur(page, '[data-tour="note-titre"]')
  await page.locator('[data-tour="note-titre"]').fill('Impressions du retour d’entretien')
  await spotlightSur(page, '.nouvelle-note-inline .zone-corps-note')
  await page.locator('.nouvelle-note-inline .zone-corps-note').click()
  await page.keyboard.type('Le projet semble hésitant, à vérifier à la relecture.')
  await spotlightSur(page, '[data-tour="creer-note"]')
  await page.locator('[data-tour="creer-note"]').click()
  // Le second entretien est en place (audio référencé) et une note existe →
  // étape 2 cochée, la consigne-panneau disparaît. On RESTE dans l'entretien —
  // pas de retour automatique à l'écran Corpus : le message « terminé »
  // s'affiche sous les onglets, avec un bouton pour revoir le parcours dans le corpus.
  await expect(page.locator('.liste-pp li').nth(1)).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.guide-pp')).toHaveCount(0)
  await expect(page.locator('.fini-pp')).toBeVisible()
  await expect(page.locator('.corpus-ecran')).not.toBeVisible()
  // Le bouton « Revenir aux étapes du pas à pas » ramène à la liste, message effacé.
  // L'étape 3 se lance au clic, jamais d'enchaînement auto.
  await page.locator('.fini-pp .fini-pp-btn.revenir').click()
  await expect(page.locator('.voile-catalogue-parcours')).toBeVisible()
  await expect(page.locator('.fini-pp')).toHaveCount(0)

  // --- Étape 3 : Lier la transcription (SRT) (lancée AU CLIC) ---
  // La transcription de « 2RetraiteAnticipee » (créé audio seul à l'étape 2)
  // arrive : le trou guide la sélection de la carte → panneau métadonnées →
  // « Assigner un srt… » ; le dialogue est stubé sur srt/2RetraiteAnticipee.srt.
  await page.locator('.liste-pp li').nth(2).locator('.ligne-pp').click()
  await spotlightSur(page, '[data-tour="carte-2RetraiteAnticipee"]')
  await page.locator('[data-tour="carte-2RetraiteAnticipee"]').click()
  await spotlightSur(page, '.panneau.meta-ent .assigner-srt')
  await app.evaluate(({ dialog }, arg) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [arg] })
  }, join(dirSources, 'srt', '2RetraiteAnticipee.srt'))
  await page.locator('.panneau.meta-ent .assigner-srt').click()
  // Le SRT est importé (le panneau signale « Srt : lié ») → étape 3 cochée,
  // message de fin dans le parcours.
  await expect(page.locator('.liste-pp li').nth(2)).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)
  await expect(page.locator('.fini-pp')).toBeVisible()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(page.locator('.panneau.meta-ent')).toHaveCount(0)
  await expect(page.locator('.onglets-corpus button[aria-label="Accueil"]')).toHaveAttribute('aria-current', 'page')

  // --- Étape 4 : Renommer les locuteurs (lancée AU CLIC) ---
  // L'entretien s'ouvre sur l'ACCUEIL (vue d'ensemble + conseils).
  // La consigne devient un panneau sous les onglets, avant le panneau métier.
  // Aucun trou : les deux champs de nom restent accessibles.
  // Le geste commence par l'onglet Locuteurs (icone) : on le clique pour afficher la liste.
  await ouvrirCatalogueParcours(page)
  await page.locator('.liste-pp li').nth(3).locator('.ligne-pp').click()
  await spotlightSur(page, '[data-tour="carte-1Coordinatrice"] .crayon')
  await page.locator('.carte-ent .crayon').first().click()
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.guide-pp')).toBeVisible()
  await expect(page.locator('.guide-pp')).toContainText('Renommer les locuteurs')
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)

  // Le suivi global reste disponible dans l'entretien sans rappel en double.
  await expect(page.locator('.rappel-parcours')).toHaveCount(0)
  const suiviParcours = page.getByTestId('resume-parcours-global')
  await expect(suiviParcours).toContainText('Renommer les locuteurs')
  await suiviParcours.getByRole('button', { name: 'Voir les étapes ou changer de parcours' }).click()
  await expect(page.locator('.voile-catalogue-parcours')).toBeVisible()
  await expect(page.getByTestId('parcours-pas-a-pas')).toBeVisible()
  await expect(page.locator('.liste-pp li').nth(3)).toHaveClass(/actif/)
  await page.getByRole('button', { name: 'Fermer les parcours', exact: true }).click()
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.guide-pp')).toBeVisible()

  await page.locator('.onglets button[data-onglet="locuteurs"]').click()
  await expect(page.locator('.guide-pp')).toBeVisible()
  await page.getByRole('button', { name: 'Modifier les locuteurs' }).click()
  await expect(page.getByRole('dialog', { name: 'Gestion des locuteurs' })).toBeVisible()
  await expect(page.locator('.liste-loc')).toBeVisible()
  await expect.poll(async () =>
    page.locator('[data-tour="ancre-guide-pp"]').evaluate((ancre) => {
      const guide = ancre.querySelector('.guide-pp')
      const liste = document.querySelector('.liste-loc')
      return !!guide && !!liste && Boolean(guide.compareDocumentPosition(liste) & Node.DOCUMENT_POSITION_FOLLOWING)
    }),
  ).toBe(true)
  // Ordre d'affichage = ordre d'apparition dans le SRT : Speaker 1 (l'ingénieure,
  // qui pose les questions) est la 1re ligne, Speaker 0 (Fatima) la 2ᵉ.
  const champs = page.locator('.nom-loc')
  await champs.nth(0).fill('Enquêteur·rice')
  await champs.nth(0).blur() // blur → @change → renommerLoc
  await expect(page.locator('.tableau-loc p[role="status"]')).toContainText('Enquêteur·rice')
  await page.getByRole('button', { name: 'Fermer la gestion des locuteurs' }).click()
  await page.getByRole('button', { name: 'Modifier les locuteurs' }).click()
  await champs.nth(1).fill('Fatima')
  await champs.nth(1).blur()
  // Plus aucun « Speaker N » → étape 4 cochée (guidage de nouveau arrêté).
  // Retour automatique au parcours dans l'Accueil du corpus.
  await expect(page.locator('.liste-pp li').nth(3)).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)
  await expect(page.locator('.corpus-ecran')).toBeVisible()

  // --- Étape 5 : Créer une thématique et annoter (lancée AU CLIC) ---
  await ouvrirCatalogueParcours(page)
  await page.locator('.liste-pp li').nth(4).locator('.ligne-pp').click()
  await spotlightSur(page, '[data-tour="carte-1Coordinatrice"] .crayon')
  // Ouvrir l'entretien → le spotlight bascule (recalcul live) sur l'onglet Thématique.
  await page.locator('.carte-ent .crayon').first().click()
  await expect(page.locator('.editeur')).toBeVisible()
  await spotlightSur(page, '[data-tour="onglet-themes"]')
  // Sélectionner du texte réel du 1er bloc puis coder avec le 1er thème.
  // Un clic seul (curseur) peut tomber sur un espace où rien ne se code ;
  // la sélection garantit l'annotation (même helper que les tests audio).
  await selectionner(page, 'me recevoir')
  await page.locator('.onglets button[data-onglet="themes"]').click()
  await page.locator('.theme-coder').first().click()
  // Une annotation de codage existe → étape 5 cochée (guidage de nouveau arrêté)
  // et retour automatique au parcours dans l'Accueil du corpus.
  await expect(page.locator('.liste-pp li').nth(4)).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)
  await expect(page.locator('.corpus-ecran')).toBeVisible()

  // --- Étape 6 : Saisir une variable (lancée AU CLIC) ---
  await ouvrirCatalogueParcours(page)
  await page.locator('.liste-pp li').nth(5).locator('.ligne-pp').click()
  await spotlightSur(page, '[data-tour="carte-1Coordinatrice"] .crayon')
  await page.locator('.carte-ent .crayon').first().click()
  await expect(page.locator('.editeur')).toBeVisible()
  await spotlightSur(page, '[data-tour="onglet-donnees"]')
  // La cible = onglet Données. La variable « Ville » (portée locuteur,
  // saisie libre) est pré-créée par le mode pas-à-pas → champ texte par locuteur.
  await page.locator('.onglets button[data-onglet="donnees"]').click()
  const saisieLibre = page.locator('.panneau.donnees .saisie-eav-libre').first()
  await expect(saisieLibre).toBeVisible({ timeout: 5_000 })
  await saisieLibre.fill('Villebourg')
  await saisieLibre.press('Enter')
  await expect(page.locator('.liste-pp li').nth(5)).toHaveClass(/fait/, { timeout: 5_000 })

  // Re-test : une étape DÉJÀ validée peut être rouverte. L'étape 4 (renommer,
  // déjà faite) est recliquée ; le crayon OUVRE l'entretien et on y RESTE.
  // Pas de retour automatique : l'étape ne change pas d'état,
  // sinon l'entretien s'ouvrait et se refermait aussitôt (les locuteurs sont déjà renommés).
  // Le guidage s'éteint et un petit message « déjà réalisée » s'affiche,
  // avec un bouton pour revenir au Pas à pas.
  await ouvrirCatalogueParcours(page)
  await page.locator('.liste-pp li').nth(3).locator('.ligne-pp').click()
  await spotlightSur(page, '[data-tour="carte-1Coordinatrice"] .crayon')
  await page.locator('.carte-ent .crayon').first().click()
  await expect(page.locator('.editeur')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.editeur')).toContainText('Fatima')
  // On reste dans l'entretien : guidage éteint, écran Corpus non revenu.
  // Le message re-test est affiché avec le texte propre à l'étape (renommer).
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)
  await expect(page.locator('.corpus-ecran')).not.toBeVisible()
  await expect(page.locator('.guide-pp.retest')).toBeVisible()
  await expect(page.locator('.guide-pp.retest')).toContainText('déjà')
  await expect(page.locator('.guide-pp.retest')).toContainText('re-renommer les locuteurs')
  // Le bouton du message ramène au parcours dans le corpus et efface le message.
  await page.locator('.guide-pp.retest button').click()
  await expect(page.locator('.voile-catalogue-parcours')).toBeVisible()
  await expect(page.locator('.guide-pp.retest')).toHaveCount(0)

  // Re-test de « Prendre des notes à chaud » (étape 2, déjà faite).
  // Le spotlight guide vers le crayon du 2e entretien (2RetraiteAnticipee).
  // Le message « déjà réalisée » doit apparaître dès l'ouverture de l'entretien,
  // sans avoir à (re)créer une note.
  await page.locator('.liste-pp li').nth(1).locator('.ligne-pp').click()
  await spotlightSur(page, '[data-tour="carte-2RetraiteAnticipee"] .crayon')
  await page.locator('[data-tour="carte-2RetraiteAnticipee"] .crayon').click()
  await expect(page.locator('.editeur')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.guide-pp.retest')).toBeVisible()
  await expect(page.locator('.guide-pp.retest')).toContainText('notes à chaud')

  // Le parcours de préparation reste indépendant et propose son propre corpus vierge.
  await page.locator('.guide-pp.retest button').click()
  await page.locator('.carte-parcours').filter({ hasText: 'Préparer et suivre' }).click()
  await expect(page.locator('.progression-pp')).toHaveText('0 étape sur 4')
  await page.getByRole('button', { name: 'Commencer le parcours', exact: true }).click()
  await expect(page.locator('.installation-exemple')).toContainText('Préparer la démo « Préparer et suivre »')

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

  // Le geste RÉEL : re-stuber les dialogues FICHIER.
  // Les fichiers (srt puis mp3) sont choisis dans les sources matérialisées.
  // Passer par la vraie modale à deux zones.
  await app.evaluate(({ dialog }, args) => {
    const fichiers = [args.srt, args.mp3]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fichiers[Math.min(i++, fichiers.length - 1)]],
    })
  }, { srt: join(dirSources, 'srt', '1Coordinatrice.srt'), mp3: join(dirSources, 'audio', '1Coordinatrice.mp3') })
  await ajouterParModale(page, ['texte', 'audio'])

  // Même prédicat : entretien créé (titre = nom du fichier), étape 1 cochée.
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/fait/, { timeout: 5_000 })
  // On RESTE au Corpus (l'import guidé n'ouvre pas l'entretien).
  // C'est l'étape suivante qui l'ouvrira : le message « étape terminée ✓ »
  // s'affiche dans le parcours, avec un bouton pour enchaîner.
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(page.locator('.editeur')).not.toBeVisible()
  await expect(page.locator('.fini-pp')).toBeVisible()
  await expect(page.locator('.fini-pp .fini-pp-titre')).toContainText('terminé')
  await expect(page.locator('.fini-pp .fini-pp-btn').first()).toContainText(
    'Étape suivante : Prendre des notes à chaud',
  )

  // Le lecteur n'est PAS monté : l'entretien n'a pas été ouvert.
  await expect(page.locator('.lecteur-audio')).toHaveCount(0)

  await app.close()
})

test('réouverture depuis les parcours : l’historique est conservé sans lancement automatique', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-pp-recent-'))
  const dirSources = mkdtempSync(join(tmpdir(), 'sonal-pp-recent-sources-'))
  const dirCorpus = mkdtempSync(join(tmpdir(), 'sonal-pp-recent-corpus-'))
  const corpusDir = dirCorpus

  // 1re session : préparation pas-à-pas + ÉTAPE 1 faite.
  // (1Coordinatrice importée via la vraie modale — les dialogues FICHIER pointent vers les sources.)
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
  }, { srt: join(dirSources, 'srt', '1Coordinatrice.srt'), mp3: join(dirSources, 'audio', '1Coordinatrice.mp3') })
  await ajouterParModale(page, ['texte', 'audio'])
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/fait/, { timeout: 10_000 })
  // Attendre que l'historique soit écrit dans le MARQUEUR du corpus (watch →
  // corpus:marquerDemo) avant de fermer — sinon le test pourrait lire trop tôt.
  await expect
    .poll(() => JSON.parse(readFileSync(join(corpusDir, 'corpus.json'), 'utf8')).demo?.parcours?.traitement?.validees ?? [])
    .toContain('charger')
  await app.close()

  // L'historique est PERSISTÉ dans le marqueur du corpus :
  // L’étape « charger » est mémorisée dans la progression du traitement.
  const marqueur = JSON.parse(readFileSync(join(corpusDir, 'corpus.json'), 'utf8')).demo
  expect(marqueur.usage).toBe('apprentissage')
  expect(marqueur.parcours.traitement.validees).toContain('charger')
  expect(marqueur.dernierParcoursId).toBe('traitement')

  // La reprise passe par le catalogue, sans ouvrir le corpus ni lancer une étape à sa consultation.
  app = await lancer(profil, { preserverSettings: true })
  page = await app.firstWindow()
  await attendreAccueil(page)
  await page.locator('.carte-demo.parcours').click()
  await page.locator('.carte-parcours').filter({ hasText: 'Importer et traiter' }).click()
  await expect(page.locator('.panneau.pas-a-pas')).toBeVisible()
  await expect(page.locator('.onglets-corpus button[aria-label="Pas à pas"]')).toHaveCount(0)
  await expect(page.locator('.liste-pp li')).toHaveCount(6)
  await expect(page.getByRole('button', { name: 'Continuer le parcours', exact: true })).toBeVisible()
  // Étape 1 cochée (mémorisée + re-dérivée du modèle — un entretien existe) ;
  // les étapes 2 à 6 ne sont pas faites. Le spotlight reste inactif.
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.liste-pp li').nth(1)).not.toHaveClass(/fait/)
  await expect(page.locator('.liste-pp li').nth(2)).not.toHaveClass(/fait/)
  await expect(page.locator('.liste-pp li').nth(3)).not.toHaveClass(/fait/)
  await expect(page.locator('.liste-pp li').nth(4)).not.toHaveClass(/fait/)
  await expect(page.locator('.liste-pp li').nth(5)).not.toHaveClass(/fait/)
  // Séquence : 2b reste verrouillée (2a non faite).
  // 3+ sont déverrouillées (l'étape 1 est faite) ; 2a est accessible directement.
  await expect(page.locator('.liste-pp li').nth(2).locator('.ligne-pp')).toBeDisabled()
  await expect(page.locator('.liste-pp li').nth(1).locator('.ligne-pp')).toBeEnabled()
  await expect(page.locator('.liste-pp li').nth(3).locator('.ligne-pp')).toBeEnabled()
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)

  await app.close()
})

test('le guide exige les fichiers de l’exercice mais sa pause libère les imports ordinaires', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-pp-audio-'))
  const dirSources = mkdtempSync(join(tmpdir(), 'sonal-pp-audio-sources-'))
  const dirCorpus = mkdtempSync(join(tmpdir(), 'sonal-pp-audio-corpus-'))
  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)

  await preparerPasAPas(app, page, dirSources, dirCorpus)

  // 1er essai : 1Coordinatrice.srt SEUL (aucun audio choisi), la garde exige les DEUX fichiers.
  // Refus dans la modale, aucun entretien créé, étape pas cochée.
  await app.evaluate(({ dialog }, arg) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [arg] })
  }, join(dirSources, 'srt', '1Coordinatrice.srt'))
  await page.locator('.ajout-ent').click()
  await page.locator('.zone-texte').click()
  await expect(page.locator('.zone-texte .zone-fichier')).toContainText('1Coordinatrice.srt')
  await page.locator('.modale-ajout .valider').click()
  await expect(page.locator('.modale-ajout')).toBeVisible()
  await expect(page.locator('.msg-ajout')).toContainText('1Coordinatrice.mp3')
  await expect(page.locator('.carte-ent')).toHaveCount(0)
  await expect(page.locator('.liste-pp li').first()).not.toHaveClass(/fait/)
  await page.locator('.modale-ajout .annuler').click()

  // La pause conserve la progression, mais ne verrouille pas les outils ordinaires.
  await page.locator('.bulle-btn.arreter').click()
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)
  await page.locator('.ajout-ent').click()
  await page.locator('.zone-texte').click()
  await page.locator('.modale-ajout .valider').click()
  await expect(page.locator('.modale-ajout')).toHaveCount(0)
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await expect(page.locator('.editeur')).toBeVisible()
  await retourCorpus(page)
  await ouvrirCatalogueParcours(page)
  await expect(page.locator('.liste-pp li').first()).not.toHaveClass(/fait/)

  await app.close()
})

test('pas-à-pas : l’étape 1 REFUSE un fichier autre que 1Coordinatrice (garde), puis 1Coordinatrice passe', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-pp-garde-'))
  const dirSources = mkdtempSync(join(tmpdir(), 'sonal-pp-garde-sources-'))
  const dirCorpus = mkdtempSync(join(tmpdir(), 'sonal-pp-garde-corpus-'))
  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)

  await preparerPasAPas(app, page, dirSources, dirCorpus)
  await expect(page.locator('.spotlight-trou')).toBeVisible()

  // 1er essai : on « se trompe » de fichier. La modale renvoie un AUTRE entretien.
  // (2RetraiteAnticipee, pas 1Coordinatrice.)
  // L'ajout doit être REFUSÉ : message dans la modale, aucun entretien créé,
  // étape 1 toujours pas cochée.
  // La suite du parcours est construite sur le contenu d'1Coordinatrice.
  await app.evaluate(({ dialog }, args) => {
    const fichiers = [args.srt, args.mp3]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fichiers[Math.min(i++, fichiers.length - 1)]],
    })
  }, { srt: join(dirSources, 'srt', '2RetraiteAnticipee.srt'), mp3: join(dirSources, 'audio', '2RetraiteAnticipee.mp3') })
  await page.locator('.ajout-ent').click()
  await page.locator('.zone-texte').click()
  await expect(page.locator('.zone-texte .zone-fichier')).toContainText('2RetraiteAnticipee.srt')
  await page.locator('.zone-audio').click()
  await expect(page.locator('.zone-audio .zone-fichier')).toContainText('2RetraiteAnticipee.mp3')
  await page.locator('.modale-ajout .valider').click()
  await expect(page.locator('.modale-ajout')).toBeVisible()
  await expect(page.locator('.msg-ajout')).toContainText('1Coordinatrice.srt')
  await expect(page.locator('.msg-ajout')).toContainText('1Coordinatrice.mp3')
  await expect(page.locator('.carte-ent')).toHaveCount(0)
  await expect(page.locator('.liste-pp li').first()).not.toHaveClass(/fait/)

  // 2e essai : 1Coordinatrice cette fois (re-stub des dialogues) ; la modale est restée ouverte,
  // on re-clique les zones pour remplacer les fichiers choisis.
  await app.evaluate(({ dialog }, args) => {
    const fichiers = [args.srt, args.mp3]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fichiers[Math.min(i++, fichiers.length - 1)]],
    })
  }, { srt: join(dirSources, 'srt', '1Coordinatrice.srt'), mp3: join(dirSources, 'audio', '1Coordinatrice.mp3') })
  await page.locator('.zone-texte').click()
  await expect(page.locator('.zone-texte .zone-fichier')).toContainText('1Coordinatrice.srt')
  await page.locator('.zone-audio').click()
  await expect(page.locator('.zone-audio .zone-fichier')).toContainText('1Coordinatrice.mp3')
  await page.locator('.modale-ajout .valider').click()

  // 1Coordinatrice est chargé : entretien créé (titre de la carte = « 1Coordinatrice »,
  // nom du fichier SRT choisi), l'étape 1 se coche.
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await expect(page.locator('.carte-ent .ent-titre')).toHaveText('1Coordinatrice')
  await expect(page.locator('.liste-pp li').first()).toHaveClass(/fait/, { timeout: 5_000 })

  await app.close()
})
