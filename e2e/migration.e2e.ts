import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, attendreAccueil, attendreCorpus } from './util'

/**
 *  Migration v2→v3 SILENCIEUSE à l'ouverture :
 *  un corpus v2 (copies relatives : `audioRef: 'audio/e1.wav'` + PNG waveform
 *  dans `audio/`) est écrit sur disque AVANT le lancement. À l'ouverture, le
 *  store résout chaque `audioRef` relatif en ABSOLU (vers l'emplacement legacy),
 *  déplace les PNG `audio/` → `png/` et bumpe corpus + entretiens à v3 — sans
 *  aucune copie ni recopie. Couvert en unitaire (`corpusStore.test.ts`) ; ici on
 *  vérifie le geste RÉEL : l'app ouvre un corpus v2 sans broncher et le lecteur
 *  joue l'audio référencé (whitelist `cheminMediaAbs` sur le chemin migré).
 */

/** WAV PCM 16 bits mono 8 kHz (décodable par Chromium) — 1 s. */
function ecrireWav(chemin: string, secondes = 1, freqEch = 8000): void {
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

/** PNG 1×1 (waveform legacy : la migration le déplace, elle ne valide pas son contenu). */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test('J5 : corpus v2 (copies relatives) → migration v3 silencieuse à l’ouverture, audio jouable', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-migr-e2e-'))
  const dirCorpus = join(profil, 'corpus') // le corpus par défaut du profil (lancer le charge en 1er récent)
  const now = new Date().toISOString()

  // Corpus v2 écrit AVANT le lancement — l'écriture du seed démo est idempotente
  // (elle ne touche pas à un corpus.json existant), le profil démarre donc dessus.
  mkdirSync(join(dirCorpus, 'entretiens'), { recursive: true })
  mkdirSync(join(dirCorpus, 'audio'), { recursive: true })
  writeFileSync(
    join(dirCorpus, 'corpus.json'),
    JSON.stringify(
      {
        formatVersion: 2,
        codebook: {},
        variables: {},
        reglesAnon: {},
        personnes: {},
        membership: { e1: { titre: 'Entretien Legacy', date: null, lastModified: now } },
      },
      null,
      2,
    ),
    'utf8',
  )
  writeFileSync(
    join(dirCorpus, 'entretiens', 'e1.json'),
    JSON.stringify(
      {
        formatVersion: 2,
        lastModified: now,
        corpsTexte: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              attrs: { loc: 1 },
              content: [{ type: 'text', text: 'Un entretien v2 à migrer.' }],
            },
          ],
        },
        annotations: [],
        ancres: [],
        locuteurs: [{ index: 1, nom: 'Enquêteur', valeursLoc: {}, personneRef: null }],
        meta: { valeursGen: {}, audioRef: 'audio/e1.wav' }, // RÉFÉRENCE RELATIVE (legacy)
      },
      null,
      2,
    ),
    'utf8',
  )
  ecrireWav(join(dirCorpus, 'audio', 'e1.wav'))
  writeFileSync(join(dirCorpus, 'audio', 'e1.png'), PNG_1PX)

  const app = await lancer(profil)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  // L'app a ouvert le corpus v2 sans broncher : la carte du legacy est là.
  await expect(page.locator('.carte-ent .ent-titre')).toContainText('Entretien Legacy')

  // --- Migration vérifiée SUR DISQUE (silencieuse, une fois) ---
  const corpusJson = JSON.parse(readFileSync(join(dirCorpus, 'corpus.json'), 'utf8'))
  expect(corpusJson.formatVersion).toBe(3)
  const e1 = JSON.parse(readFileSync(join(dirCorpus, 'entretiens', 'e1.json'), 'utf8'))
  expect(e1.formatVersion).toBe(3)
  // audioRef RELATIF résolu en ABSOLU vers l'emplacement legacy (aucune recopie).
  expect(e1.meta.audioRef).toBe(join(dirCorpus, 'audio', 'e1.wav'))
  // Le mp3/wav legacy reste dans audio/ (référencé en absolu) ; le PNG a déménagé.
  expect(existsSync(join(dirCorpus, 'audio', 'e1.wav'))).toBe(true)
  expect(existsSync(join(dirCorpus, 'audio', 'e1.png'))).toBe(false)
  expect(existsSync(join(dirCorpus, 'png', 'e1.png'))).toBe(true)
  expect(readdirSync(join(dirCorpus, 'png'))).toEqual(['e1.png'])

  // --- Le modèle v3 est COHÉRENT côté app : l'entretien s'ouvre, le lecteur
  // charge l'audio référencé (whitelist cheminMediaAbs sur le chemin migré) et
  // la forme d'onde (png/) est servie. ---
  await page.locator('.carte-ent .crayon').click()
  await expect(page.locator('.editeur')).toBeVisible()
  await expect(page.locator('.editeur')).toContainText('Un entretien v2 à migrer.')
  await expect(page.locator('.lecteur-audio')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).duration))
    .toBeGreaterThan(0.5)
  await expect(page.locator('.lecteur-audio img.onde')).toBeVisible()

  // --- Idempotence : ré-ouvrir le corpus (Accueil → récent) ne recasse rien. ---
  await page.locator('.lien-nav', { hasText: 'Accueil' }).click()
  await attendreAccueil(page)
  await page.locator('.recents .recent').first().click()
  await attendreCorpus(page)
  await expect(page.locator('.carte-ent .ent-titre')).toContainText('Entretien Legacy')
  expect(JSON.parse(readFileSync(join(dirCorpus, 'corpus.json'), 'utf8')).formatVersion).toBe(3)

  await app.close()
})
