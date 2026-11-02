import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, ajouterParModale, selectionner, coderTheme, attendreAccueil, attendreCorpus, retourCorpus } from './util'

/**
 *  Audio : import « un geste » (SRT + audio ensemble), copie dans le corpus
 *  (un dossier = un corpus), forme d'onde dérivée (PNG), lecteur en haut, synchro (plage lue
 *  surligné), seek par clic-tour (gouttière) et par clic sur la bande. Fixtures
 *  SYNTHÉTISÉES : un WAV PCM de 4 s (décodable par Chromium) + un SRT à 3 cues
 *  alignés dessus.
 */

const SRT = `1
00:00:00,000 --> 00:00:01,000
Premier segment de parole.

2
00:00:01,000 --> 00:00:02,500
Deuxième segment un peu plus long.

3
00:00:02,500 --> 00:00:04,000
Troisième et dernier segment.
`

/** WAV PCM 16 bits mono 8 kHz : un la 440 Hz dont l'amplitude ondule (la forme
 *  d'onde dérivée n'est pas plate). */
function ecrireWav(chemin: string, secondes = 4, freqEch = 8000): void {
  const n = secondes * freqEch
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(freqEch, 24)
  buf.writeUInt32LE(freqEch * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const t = i / freqEch
    const amp = 0.2 + 0.6 * Math.abs(Math.sin(Math.PI * t))
    buf.writeInt16LE(Math.round(amp * 32767 * Math.sin(2 * Math.PI * 440 * t)), 44 + i * 2)
  }
  writeFileSync(chemin, buf)
}

function fichiersPngDuCorpus(profil: string): string {
  const pngDir = join(profil, 'corpus', 'png')
  return existsSync(pngDir) ? readdirSync(pngDir).join(',') : ''
}
/** Vérifie qu'aucun fichier audio n'a été copié dans le corpus (modèle par référence). */
function fichiersAudioDansCorpus(profil: string): string {
  const audioDir = join(profil, 'corpus', 'audio')
  return existsSync(audioDir) ? readdirSync(audioDir).join(',') : ''
}

test('import SRT+audio en un geste → copie dans le corpus, forme d’onde, lecture qui suit les blocs, seeks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-audio-'))
  const srt = join(dir, 'entretien-audio.srt')
  const wav = join(dir, 'entretien-audio.wav')
  writeFileSync(srt, SRT)
  ecrireWav(wav)

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  // Modale à deux zones : chaque clic de zone consomme UN dialogue stubbé
  // (1er = zone texte → SRT, 2e = zone son → WAV).
  await app.evaluate(({ dialog }, args) => {
    const fichiers = [args.srt, args.wav]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fichiers[Math.min(i++, fichiers.length - 1)]],
    })
  }, { srt, wav })
  await ajouterParModale(page, ['texte', 'audio'])

  // L'entretien s'ouvre, le LECTEUR est en haut (audio assigné à l'import).
  await expect(page.locator('.editeur')).toContainText('Premier segment', { timeout: 10_000 })
  await expect(page.locator('.lecteur-audio')).toBeVisible()

  // Pas de copie d'audio dans le corpus (modèle par référence) ; le PNG dérivé
  // est dans `png/`.
  await expect.poll(() => fichiersAudioDansCorpus(dir), { timeout: 10_000 }).toBe('')
  await expect.poll(() => fichiersPngDuCorpus(dir), { timeout: 10_000 }).toContain('.png')
  await expect(page.locator('.lecteur-audio img.onde')).toBeVisible()

  // L'audio est chargé (métadonnées lues → durée connue).
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).duration))
    .toBeGreaterThan(3)

  // --- Synchro (itération 1) : caler la lecture au milieu du cue 2 → SON bloc est surligné.
  await page.evaluate(() => {
    ;(document.querySelector('audio') as HTMLAudioElement).currentTime = 1.8
  })
  await expect(page.locator('.editeur .plage-lue')).toHaveCount(1)
  await expect(page.locator('.editeur .plage-lue')).toContainText('Deuxième segment')

  // --- S7 : CLIC dans le texte → la tête de lecture se cale au temps interpolé
  // à cet endroit (comme SonalPi1) — cliquer DANS LE TEXTE du cue 2 (pas au
  // centre de la boîte : au-delà de la fin de ligne, ProseMirror résout la
  // position sur la frontière suivante → seek au deb du cue 3, invariant voulu).
  await page.locator('.editeur p').nth(1).click({ position: { x: 30, y: 14 } })
  const tClic = await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).currentTime)
  expect(tClic).toBeGreaterThanOrEqual(1)
  expect(tClic).toBeLessThanOrEqual(2.5)
  await expect(page.locator('.editeur .plage-lue')).toContainText('Deuxième segment')

  // --- S7 : ÉDITER pendant la lecture — les ancres sont remappées comme les
  //  annotations, le surlignage reste sur le MÊME texte (une seule décoration).
//  Le caret va en FIN de ligne avant la frappe (le clic ci-dessus l'a posé
//  au milieu d'un mot) — l'insertion reste DANS le cue surligné.
  await page.keyboard.press('End')
  await page.keyboard.type('Ajout en cours de lecture. ')
  await expect(page.locator('.editeur')).toContainText('Ajout en cours de lecture.')
  await expect(page.locator('.editeur .plage-lue')).toHaveCount(1)
  await expect(page.locator('.editeur .plage-lue')).toContainText('Deuxième segment')

  // Avancer dans le cue 3 → le surlignage suit.
  await page.evaluate(() => {
    ;(document.querySelector('audio') as HTMLAudioElement).currentTime = 3.0
  })
  await expect(page.locator('.editeur .plage-lue')).toContainText('Troisième')

  // --- Clic-tour : la gouttière du 1er bloc cale le lecteur au deb du tour (0 s).
  await page.locator('.editeur .gouttiere-loc').first().click()
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).currentTime))
    .toBeLessThan(0.1)

  // --- Clic sur la BANDE : seek TEMPOREL proportionnel (au milieu ≈ durée/2).
  const bande = page.locator('.lecteur-audio .bande')
  const box = (await bande.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const t = await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).currentTime)
  expect(t).toBeGreaterThan(1.5)
  expect(t).toBeLessThan(2.5)

  // --- S8 : coder un passage → le calque thématique apparaît sur la BANDE du
  // lecteur, calé sur l'axe TEMPS via les ancres : « Premier segment » couvre
  // 0 → ~0,56 s (≈ 15/27 du cue 1) sur 4 s → left 0 %, width ≈ 13-14 %.
  await selectionner(page, 'Premier segment')
  await coderTheme(page, 'Famille')
  const segBande = page.locator('.bande .xtr-bande')
  await expect(segBande).toHaveCount(1)
  await expect(segBande).toHaveAttribute('style', /left:\s*0%/)
  await expect(segBande).toHaveAttribute('style', /width:\s*1[34]\./)
  await expect(segBande).toHaveAttribute('style', /linear-gradient/)

  await app.close()
})

test('S6+ : double-espace dans le texte = play/pause (parité SonalPi1), sans insérer d’espaces', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-audio-'))
  const srt = join(dir, 'entretien-audio.srt')
  const wav = join(dir, 'entretien-audio.wav')
  writeFileSync(srt, SRT)
  ecrireWav(wav)

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await app.evaluate(({ dialog }, args) => {
    const fichiers = [args.srt, args.wav]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fichiers[Math.min(i++, fichiers.length - 1)]],
    })
  }, { srt, wav })
  await ajouterParModale(page, ['texte', 'audio'])

  // Entretien ouvert, audio chargé (durée connue).
  await expect(page.locator('.editeur')).toContainText('Premier segment', { timeout: 10_000 })
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).duration))
    .toBeGreaterThan(3)

  const estEnPause = () =>
    page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused)

  // Curseur dans le texte ; on mémorise le contenu (le double-espace ne doit rien
  // y ajouter — la 1ʳᵉ espace insérée est retirée, la 2ᵉ est consommée).
  await page.locator('.editeur p').first().click()
  const avant = await page.locator('.editeur').innerText()
  expect(await estEnPause()).toBe(true)

  // Double-espace rapproché → LECTURE, et AUCUNE espace ajoutée au texte.
  await page.keyboard.type('  ', { delay: 0 })
  await expect.poll(estEnPause).toBe(false)
  expect(await page.locator('.editeur').innerText()).toBe(avant)

  // Nouveau double-espace → PAUSE, toujours sans altérer le texte.
  await page.keyboard.type('  ', { delay: 0 })
  await expect.poll(estEnPause).toBe(true)
  expect(await page.locator('.editeur').innerText()).toBe(avant)

  await app.close()
})

test('S6 rev. : AUDIO SEUL dans la modale → entretien au texte vide (à taper) + lecteur', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-audio-'))
  const wav = join(dir, 'a-transcrire.wav')
  ecrireWav(wav, 2)

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.wav] })
  }, { wav })

  // L'audio seul suffit et masque le titre proposé pour un entretien sans fichier.
  await page.locator('.ajout-ent').click()
  await expect(page.locator('.modale-ajout .valider')).toBeEnabled()
  await page.locator('.zone-audio').click()
  await expect(page.locator('.zone-audio .zone-fichier')).toContainText('a-transcrire.wav')
  await page.locator('.modale-ajout .valider').click()

  // Entretien créé (titre = nom du fichier son), ouvert, lecteur présent. Le fil
  // d'Ariane affiche « Entretien (titre) » : on vérifie que le TITRE y figure.
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.lecteur-audio')).toBeVisible()
  await expect(page.locator('.fil .lien-nav.courant')).toContainText('a-transcrire')

  // On peut TAPER la transcription directement (c'est un document ordinaire).
  await page.locator('.editeur').click()
  await page.keyboard.type('Début de transcription.')
  await expect(page.locator('.editeur')).toContainText('Début de transcription.')

  await app.close()
})

test('entretien sans fichier : création immédiate pour prendre des notes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-vide-'))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await page.locator('.ajout-ent').click()
  const titre = page.locator('.titre-vide input')
  await expect(titre).toHaveValue('Nouvel entretien')
  await titre.fill('Notes avant collecte')
  await expect(page.locator('.modale-ajout .valider')).toBeEnabled()
  await page.locator('.modale-ajout .valider').click()

  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.fil .lien-nav.courant')).toContainText('Notes avant collecte')
  await page.locator('[data-onglet="notes"]').click()
  await expect(page.locator('[data-tour="creer-note"]')).toBeVisible()

  await retourCorpus(page)
  await page.locator('.carte-ent', { hasText: 'Notes avant collecte' }).click()
  await expect(page.locator('.meta-infos li', { hasText: 'Audio' })).toContainText('—')
  await expect(page.locator('.meta-infos li', { hasText: 'Srt' })).toContainText('—')
  await expect(page.getByRole('button', { name: 'Assigner un audio…', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Assigner un srt…', exact: true })).toBeVisible()

  await app.close()
})

test('J3 : audio référencé supprimé après assignation → bandeau d’intégrité à l’ouverture, app fonctionnelle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-integrity-'))
  const wav = join(dir, 'integrity.wav')
  ecrireWav(wav, 2)

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  // Assigner l'audio au premier entretien (Entretien Karine) — RÉFÉRENCE, pas copie.
  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.wav] })
  }, { wav })
  await page.locator('.carte-ent').first().click()
  await expect(page.locator('.meta-ent')).toBeVisible()
  await page.locator('.meta-ent').getByRole('button', { name: 'Assigner un audio…', exact: true }).click()
  await expect(page.locator('.meta-infos li', { hasText: 'Audio' })).toContainText('lié', { timeout: 10_000 })

  // Supprimer le fichier SOURCE — le geste qui casse la référence.
  rmSync(wav)

  // Ré-ouvrir le corpus (Accueil → récent) → le bandeau d'intégrité apparaît.
  await page.locator('.lien-nav', { hasText: 'Accueil' }).click()
  await attendreAccueil(page)
  await page.locator('.recents .recent').first().click()
  await attendreCorpus(page)
  await expect(page.locator('.bandeau-audio')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.bandeau-audio')).toContainText('fichier(s) média introuvable')
  await expect(page.locator('.bandeau-audio')).toContainText('Entretien Karine')

  // L'app reste FONCTIONNELLE : clic sur l'entretien du bandeau → le lecteur
  // affiche « Audio introuvable » + ré-assignation, le texte reste utilisable.
  await page.locator('.bandeau-audio-ent').first().click()
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.editeur')).toContainText('Karine', { timeout: 10_000 })
  await expect(page.locator('.lecteur-erreur')).toBeVisible()
  await expect(page.locator('.lecteur-erreur')).toContainText('Audio introuvable')
  await expect(page.locator('.lecteur-erreur', { hasText: 'Assigner un audio' })).toBeVisible()

  // L'édition reste possible (on ne crash jamais pour un média manquant).
  await page.locator('.editeur').click()
  await page.keyboard.type('La transcription reste utilisable.')
  await expect(page.locator('.editeur')).toContainText('La transcription reste utilisable.')

  await app.close()
})

test('S6 : « Assigner un audio » à un entretien existant → audio lié + forme d’onde sur la carte', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-audio-'))
  const wav = join(dir, 'karine.wav')
  ecrireWav(wav, 2)

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.wav] })
  }, { wav })

  // Sélectionner la carte du seed (Karine) → panneau méta → assigner.
  await page.locator('.carte-ent').first().click()
  await expect(page.locator('.meta-ent')).toBeVisible()
  await page.locator('.meta-ent').getByRole('button', { name: 'Assigner un audio…', exact: true }).click()

  // Le méta passe à « lié », la carte affiche la forme d'onde, les fichiers sont là.
  await expect(page.locator('.meta-infos li', { hasText: 'Audio' })).toContainText('lié', { timeout: 10_000 })
  await expect(page.locator('.carte-ent img.spectro').first()).toBeVisible()
  await expect.poll(() => fichiersPngDuCorpus(dir)).toContain('.png')

  // Ouvrir l'entretien : le lecteur est présent ; texte SANS timecodes → aucun
  // surlignage (indexBlocCourant sans ancre → null), pas d'erreur.
  await page.locator('.carte-ent .crayon').first().click()
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.lecteur-audio')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).duration))
    .toBeGreaterThan(1)
  await page.evaluate(() => {
    ;(document.querySelector('audio') as HTMLAudioElement).currentTime = 1.0
  })
  await expect(page.locator('.editeur .plage-lue')).toHaveCount(0)

  await app.close()
})
