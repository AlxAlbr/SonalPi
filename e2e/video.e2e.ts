import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, copyFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, ajouterParModale, attendreAccueil, attendreCorpus } from './util'

/**
 *  Vidéo : import d'un entretien avec un média VIDÉO (webm) + son
 *  SRT → l'écran bascule en MODE VIDÉO (zone média épinglée : lecteur+waveform
 *  EMPILÉS à gauche ‖ panneau vidéo à droite, éditeur dessous), la synchro reste
 *  calée sur les ancres, le double-espace play/pause agit sur la vidéo, la
 *  largeur du panneau se règle par − / + et se MÉMORISE par corpus.
 *
 *  Fixture : `TestVideo/seance.webm` (générée avec ffmpeg : VP9+Opus, index Cues
 *  présent → seekable) + un SRT produit PAR LE TEST, aligné sur ses 8 s — même
 *  esprit que le WAV synthétisé des tests audio. Si le fichier est absent, le
 *  test est sauté (pas d'échec de la suite).
 */

const VIDEO = join(__dirname, '..', 'TestVideo', 'seance.webm')

/** SRT auto-écrit : 4 blocs de 2 s couvrant les 8 s de la vidéo. */
const SRT = `1
00:00:00,000 --> 00:00:02,000
Premier bloc vidéo.

2
00:00:02,000 --> 00:00:04,000
Deuxième bloc vidéo.

3
00:00:04,000 --> 00:00:06,000
Troisième bloc vidéo.

4
00:00:06,000 --> 00:00:08,000
Quatrième bloc vidéo.
`

/** Installe les fixtures (vidéo + srt) dans un dossier temporaire isolé. */
function installerFixtures(prefixe: string): { dir: string; srt: string; webm: string } {
  const dir = mkdtempSync(join(tmpdir(), prefixe))
  const srt = join(dir, 'mon-video.srt')
  const webm = join(dir, 'mon-video.webm')
  writeFileSync(srt, SRT)
  copyFileSync(VIDEO, webm)
  return { dir, srt, webm }
}

function largeurPanneau(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('.conteneur-video') as HTMLElement | null
    return el ? el.getBoundingClientRect().width : 0
  })
}

test.skip(!existsSync(VIDEO), 'fixture vidéo absente (TestVideo/seance.webm)')

test('vidéo : import SRT+webm → mode vidéo (zone média + panneau), synchro, double-espace, −/+, persistance', async () => {
  const { dir, srt, webm } = installerFixtures('sonal-video-')

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  // Modale à deux zones : 1er dialogue = SRT, 2e = la VIDÉO (filtre élargi).
  await app.evaluate(({ dialog }, args) => {
    const fichiers = [args.srt, args.webm]
    let i = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fichiers[Math.min(i++, fichiers.length - 1)]],
    })
  }, { srt, webm })
  await ajouterParModale(page, ['texte', 'audio'])

  // L'entretien s'ouvre ; l'écran est en MODE VIDÉO (colonne de gauche pleine hauteur conservée,
  // zone média vidéo à droite).
  await expect(page.locator('.editeur')).toContainText('Premier bloc vidéo', { timeout: 10_000 })
  await expect(page.locator('.colonne-gauche .onglets')).toBeVisible()
  await expect(page.locator('.zone-media')).toBeVisible()
  await expect(page.locator('.panneau-video')).toBeVisible()
  // Lecteur EMPILÉ (waveform sous la barre d'écoute) + panneau vidéo côte à côte.
  await expect(page.locator('.lecteur-audio.empile')).toBeVisible()

  // Le <video> du scope est l'horloge : la piste IMAGE charge (vraie vidéo)…
  await expect
    .poll(() =>
      page.evaluate(() => {
        const v = document.querySelector('video[data-sonal]') as HTMLVideoElement | null
        return v ? v.videoWidth : 0
      }),
    )
    .toBeGreaterThan(0)
  // … et l'élément est ADOPTÉ par le panneau (même nœud, une seule horloge).
  await expect(page.locator('.conteneur-video video[data-sonal]')).toHaveCount(1)

  // --- Synchro : attendre la durée (métadonnées chargées), caler à 2,5 s →
  // SON bloc (le 2ᵉ, 2–4 s) est surligné.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const v = document.querySelector('video[data-sonal]') as HTMLVideoElement | null
        return v ? v.duration : 0
      }),
    )
    .toBeGreaterThan(7)
  await page.evaluate(() => {
    const v = document.querySelector('video[data-sonal]') as HTMLVideoElement
    v.currentTime = 2.5
  })
  await expect(page.locator('.editeur .plage-lue')).toHaveCount(1, { timeout: 10_000 })
  await expect(page.locator('.editeur .plage-lue')).toContainText('Deuxième bloc vidéo')

  // --- Double-espace play/pause sur la VIDÉO (même scope média que l'audio).
  await page.locator('.editeur p').first().click()
  const avant = await page.locator('.editeur').innerText()
  await page.keyboard.type('  ', { delay: 0 })
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('video[data-sonal]') as HTMLVideoElement).paused))
    .toBe(false)
  expect(await page.locator('.editeur').innerText()).toBe(avant)

  // --- Redimensionnement : + agrandit le panneau, − le réduit (retour à la taille initiale).
  const w0 = await largeurPanneau(page)
  await page.locator('.panneau-video .controles-video button', { hasText: '+' }).click()
  await expect.poll(() => largeurPanneau(page)).toBeGreaterThan(w0)
  const w1 = await largeurPanneau(page)
  await page.locator('.panneau-video .controles-video button', { hasText: '−' }).click()
  await expect.poll(() => largeurPanneau(page)).toBeLessThan(w1)
  await expect.poll(() => largeurPanneau(page)).toBe(w0)

  // --- Ouvrir/fermer la vue vidéo (bouton sous la waveform) :
  // à la fermeture, le panneau disparaît (le lecteur prend la largeur),
  // l'élément vidéo reste monté ; à la réouverture, il est toujours là.
  // L'audio, lui, ne s'arrête pas.
  const boutonToggle = page.locator('.video-toggle')
  await boutonToggle.click()
  await expect(page.locator('.panneau-video')).toBeHidden()
  await expect(page.locator('.tele .bande')).toBeVisible()
  await boutonToggle.click()
  await expect(page.locator('.panneau-video')).toBeVisible()
  await expect(page.locator('.conteneur-video video[data-sonal]')).toHaveCount(1)
  await app.close()

  // --- Persistance PAR CORPUS : relance sur le même profil (settings conservés),
  // rouvre l'entretien vidéo → la largeur réglée est retrouvée.
  const app2 = await lancer(dir, { preserverSettings: true })
  const page2 = await app2.firstWindow()
  await attendreAccueil(page2)
  await page2.locator('.recents .recent').first().click()
  await attendreCorpus(page2)
  await page2.locator('.carte-ent', { hasText: 'mon-video' }).locator('.crayon').click()
  await expect(page2.locator('.zone-media')).toBeVisible({ timeout: 10_000 })
  await expect(page2.locator('.conteneur-video video[data-sonal]')).toHaveCount(1)
  await expect.poll(() => largeurPanneau(page2)).toBe(w0)
  await app2.close()
})