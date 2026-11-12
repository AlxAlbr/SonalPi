import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, ecrireSeedDemo } from './util'

/**
 *  Panneau métadonnées — gestes AUDIO de la vue Corpus :
 *  - avec un audio : DEUX boutons côte à côte — « Effacer l'audio » (rouge,
 *  détache le média, le texte reste) et « Remplacer l'audio » ;
 *  - sans SRT : bouton « Assigner un srt… » — si l'éditeur porte déjà du
 *  texte, une bannière demande confirmation (jamais d'écrasement silencieux).
 */

/** SRT minimalist à assigner (2 cues — produit des ancres temporelles). */
const SRT = `1
00:00:00,000 --> 00:00:01,000
Premier segment de parole.

2
00:00:01,000 --> 00:00:02,000
Deuxième segment de parole.
`

/** WAV PCM 16 bits mono 8 kHz — décoable (la forme d'onde dérivée se génère). */
function ecrireWav(chemin: string): void {
  const secondes = 2
  const freqEch = 8000
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
    buf.writeInt16LE(Math.round(16000 * Math.sin(2 * Math.PI * 440 * (i / freqEch))), 44 + i * 2)
  }
  writeFileSync(chemin, buf)
}

/** Un entretien au TEXTE VIDE (créé « audio seul », sans transcription). */
function ecrireEntretienVide(dir: string, id: string): void {
  const now = new Date().toISOString()
  const fc = JSON.parse(readFileSync(join(dir, 'corpus', 'corpus.crp'), 'utf8'))
  fc.membership[id] = { titre: 'Entretien vierge', date: null, lastModified: now }
  writeFileSync(join(dir, 'corpus', 'corpus.crp'), JSON.stringify(fc), 'utf8')
  writeFileSync(
    join(dir, 'corpus', 'entretiens', `${id}.json`),
    JSON.stringify(
      {
        formatVersion: 3,
        lastModified: now,
        corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] },
        annotations: [],
        ancres: [],
        locuteurs: [],
        meta: { valeursGen: {}, audioRef: null },
      },
      null,
      2,
    ),
    'utf8',
  )
}

test('audio : « Effacer l’audio » (rouge) détache le média — le texte reste', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-meta-effacer-'))
  const wav = join(dir, 'karine.wav')
  ecrireWav(wav)

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.wav] })
  }, { wav })

  // Sélectionner le premier entretien (Karine) : sans audio, un seul bouton
  // « Assigner un audio… ».
  await page.locator('.carte-ent').first().click()
  await expect(page.locator('.meta-ent')).toBeVisible()
  const boutonAudio = page.locator('.meta-ent .assigner-audio').first()
  await expect(boutonAudio).toContainText('Assigner un audio…')

  // Assigner → le méta passe à « lié », et les DEUX boutons côte à côte
  // apparaissent : « Effacer l'audio » (rouge) + « Remplacer l'audio ».
  await boutonAudio.click()
  await expect(page.locator('.meta-infos li', { hasText: 'Audio' })).toContainText('lié', { timeout: 10_000 })
  await expect(page.locator('.meta-ent .audio-actions')).toBeVisible()
  const effacer = page.locator('.meta-ent .audio-effacer')
  await expect(effacer).toContainText("Effacer l'audio")
  await expect(page.locator('.meta-ent .audio-actions .assigner-audio')).toContainText("Remplacer l'audio…")

  // Effacer → le média est détaché : « — » dans le méta, la carte repasse au
  // placeholder, le bouton unique « Assigner un audio… » revient.
  await effacer.click()
  await expect(page.locator('.meta-infos li', { hasText: 'Audio' })).toContainText('—', { timeout: 10_000 })
  await expect(page.locator('.meta-ent .audio-actions')).toHaveCount(0)
  await expect(page.locator('.carte-ent img.spectro').first()).toHaveCount(0)
  await expect(page.locator('.carte-ent .spectro-vide').first()).toContainText("pas d'audio")
  await expect(page.locator('.meta-ent .assigner-audio').first()).toContainText('Assigner un audio…')

  // Le TEXTE n'a pas bougé : ouvrir l'entretien, la transcription est intacte.
  await page.locator('.carte-ent .crayon').first().click()
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.editeur')).toContainText('Karine', { timeout: 10_000 })

  await app.close()
})

test('« Assigner un srt… » : bannière si du texte existe, import direct sur un entretien vide', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-meta-srt-'))
  const srt = join(dir, 'transcription.srt')
  writeFileSync(srt, SRT)
  // Poser la baseline AVANT « lancer » (qui écrit le seed par défaut, sans
  // écraser) puis un 2e entretien au TEXTE VIDE (audio seul, jamais transcrit).
  ecrireSeedDemo(join(dir, 'corpus'))
  ecrireEntretienVide(dir, 'ent-vide')

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  // — Entretien avec du texte (Karine) : le bouton est là, cliquer demande
  //   confirmation avant d'écraser le contenu existant.
  await page.locator('.carte-ent', { hasText: 'Entretien Karine' }).click()
  await expect(page.locator('.meta-ent')).toBeVisible()
  // Sans SRT chargé : la ligne méta « Srt » marque « non lié ».
  await expect(page.locator('.meta-infos li', { hasText: 'Srt' })).toContainText('—')
  const boutonSrt = page.locator('.meta-ent .assigner-srt')
  await expect(boutonSrt).toBeVisible()
  await boutonSrt.click()
  await expect(page.locator('.meta-ent .srt-confirm')).toBeVisible()
  // Annuler referme la bannière sans toucher au contenu.
  await page.locator('.meta-ent .srt-confirm button', { hasText: 'Annuler' }).click()
  await expect(page.locator('.meta-ent .srt-confirm')).toHaveCount(0)

  // Recommencer, confirmer → le dialogue (stubbé) rend le SRT.
  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.srt] })
  }, { srt })
  await boutonSrt.click()
  await page.locator('.meta-ent .srt-confirm button', { hasText: 'Remplacer le contenu' }).click()
  // La transcription remplace le texte existant ; l'entretien a maintenant des
  // ancres → la ligne méta passe à « lié » et le bouton disparaît.
  await expect(page.locator('.meta-infos li', { hasText: 'Srt' })).toContainText('lié', { timeout: 10_000 })
  await expect(boutonSrt).toHaveCount(0, { timeout: 10_000 })

  // — Entretien VIDE : import DIRECT, sans bannière.
  await page.locator('.carte-ent', { hasText: 'Entretien vierge' }).click()
  await expect(page.locator('.meta-ent')).toBeVisible()
  const boutonSrtVide = page.locator('.meta-ent .assigner-srt')
  await expect(boutonSrtVide).toBeVisible()
  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.srt] })
  }, { srt })
  await boutonSrtVide.click()
  await expect(page.locator('.meta-ent .srt-confirm')).toHaveCount(0) // pas de contenu → pas de garde
  await expect(page.locator('.meta-infos li', { hasText: 'Srt' })).toContainText('lié', { timeout: 10_000 })
  await expect(boutonSrtVide).toHaveCount(0, { timeout: 10_000 })

  // Ouvrir l'entretien : le contenu du SRT est bien dans l'éditeur.
  await page.locator('.carte-ent', { hasText: 'Entretien vierge' }).locator('.crayon').click()
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.editeur')).toContainText('Premier segment de parole.', { timeout: 10_000 })
  await expect(page.locator('.editeur')).toContainText('Deuxième segment de parole.')

  await app.close()
})