import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CorpusFichier } from '../src/shared/format'
import { lancer, entrerCorpus, entrerEntretien, ajouterParModale, retourCorpus, selectionner } from './util'

const srt = `1
00:00:00,000 --> 00:00:01,000
Alice: Bonjour tout le monde.

2
00:00:01,500 --> 00:00:02,500
Alice: Je suis bénévole.

3
00:00:03,000 --> 00:00:05,000
Bob: Merci pour votre aide.

4
00:00:06,000 --> 00:00:07,000
None: Un passage sans attribution.

5
00:00:08,000 --> 00:00:09,000
Alice: À bientôt.
`

function ecrireWav(chemin: string) {
  const n = 10 * 8000
  const octets = Buffer.alloc(44 + 2 * n)
  octets.write('RIFF', 0); octets.writeUInt32LE(36 + 2 * n, 4); octets.write('WAVE', 8)
  octets.write('fmt ', 12); octets.writeUInt32LE(16, 16); octets.writeUInt16LE(1, 20)
  octets.writeUInt16LE(1, 22); octets.writeUInt32LE(8000, 24); octets.writeUInt32LE(16000, 28)
  octets.writeUInt16LE(2, 32); octets.writeUInt16LE(16, 34); octets.write('data', 36)
  octets.writeUInt32LE(2 * n, 40)
  writeFileSync(chemin, octets)
}

test('statistiques : tours, mots, silences exclus, navigation cyclique et actualisation pendant l’édition', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-stats-loc-'))
  const profil = join(racine, 'profil')
  const fichierSrt = join(racine, 'Paroles.srt')
  const wav = join(racine, 'Paroles.wav')
  writeFileSync(fichierSrt, srt)
  ecrireWav(wav)
  const app = await lancer(profil, { executablePath: process.env.STATS_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await app.evaluate(({ dialog }, fichiers) => {
      let i = 0
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fichiers[Math.min(i++, 1)]] })
    }, [fichierSrt, wav])
    await ajouterParModale(page, ['texte', 'audio'])
    await expect(page.locator('.editeur')).toContainText('Bonjour tout le monde')
    await expect.poll(() => page.locator('audio[data-sonal]').evaluate((el: HTMLAudioElement) => el.duration)).toBeGreaterThan(9)
    await page.locator('[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs' }).click()
    await expect(page.getByRole('dialog', { name: 'Gestion des locuteurs' })).toBeVisible()
    await page.locator('.liste-loc .interv').first().click()
    await page.getByRole('button', { name: 'Fermer la gestion des locuteurs' }).click()
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    const corpus = JSON.parse(readFileSync(join(profil, 'corpus/corpus.crp'), 'utf8')) as CorpusFichier
    const id = Object.entries(corpus.membership).find(([, ref]) => ref.titre === 'Paroles')![0]
    const chemin = join(profil, 'corpus/entretiens', `${id}.json`)
    const avant = readFileSync(chemin, 'utf8')
    const toggle = page.locator('.statistiques-locuteurs > summary')
    const volet = page.locator('.statistiques-locuteurs')
    await expect(toggle).toHaveText('Statistiques des locuteurs')
    await expect(volet).not.toHaveAttribute('open', '')
    await toggle.click()
    await expect(volet).toHaveAttribute('open', '')
    const stats = page.locator('.stats-locuteurs')
    const alice = stats.locator('li[data-loc="1"]')
    const bob = stats.locator('li[data-loc="2"]')
    await expect(stats.locator('.total-mots')).toContainText('17 mots')
    await expect(stats.locator('.part-enqueteurs')).toContainText('9 mots')
    await expect(alice).toContainText('2 tour(s) · 9 mots')
    await expect(alice.locator('.duree-stat')).toHaveText('Durée estimée : 0 min 03 s')
    await expect(bob).toContainText('1 tour(s) · 4 mots')
    await expect(bob.locator('.duree-stat')).toHaveText('Durée estimée : 0 min 02 s')
    await expect(stats.locator('li[data-loc="aucun"]')).toContainText('1 tour(s) · 4 mots')
    const suivante = stats.getByRole('button', { name: 'Prise de parole suivante de Alice', exact: true })
    for (const [i, temps] of [0, 8, 0].entries()) {
      await suivante.click()
      await expect(alice.locator('.compteur-tour')).toHaveText(`${i === 1 ? 2 : 1} / 2`)
      await expect.poll(() => page.locator('audio[data-sonal]').evaluate((el: HTMLAudioElement) => el.currentTime)).toBeCloseTo(temps, 1)
      expect(await page.locator('audio[data-sonal]').evaluate((el: HTMLAudioElement) => el.paused)).toBe(true)
    }
    expect(readFileSync(chemin, 'utf8')).toBe(avant)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await selectionner(page, 'À bientôt.')
    await page.locator('.boutons-loc').getByRole('button', { name: 'Bob', exact: true }).click()
    await expect(alice).toContainText('1 tour(s) · 7 mots')
    await expect(bob).toContainText('2 tour(s) · 6 mots')
    await page.locator('.editeur p[data-loc="2"]').filter({ hasText: 'À bientôt.' }).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Merci encore.')
    await expect(stats.locator('.total-mots')).toContainText('19 mots')
    await expect(bob).toContainText('2 tour(s) · 8 mots')
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await retourCorpus(page)
    await page.locator('.carte-ent').filter({ hasText: 'Paroles' }).locator('.crayon').click()
    await page.locator('[data-onglet="locuteurs"]').click()
    await expect(stats).toHaveCount(0)
    await toggle.click()
    await expect(stats.locator('.total-mots')).toContainText('19 mots')
    await toggle.click()
    await expect(stats).toHaveCount(0)
    await expect(volet).not.toHaveAttribute('open', '')
  } finally {
    await app.close()
  }
})

test('statistiques : sans repères temporels, compter et naviguer ne modifie pas le texte', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-stats-sans-temps-'))
  const app = await lancer(racine, { executablePath: process.env.STATS_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await page.locator('[data-onglet="locuteurs"]').click()
    const texte = await page.locator('.editeur').innerText()
    await page.locator('.statistiques-locuteurs > summary').click()
    await expect(page.locator('.stats-locuteurs .limite-durees')).toContainText('Durées indisponibles')
    await page.getByRole('button', { name: 'Prise de parole suivante de Karine', exact: true }).click()
    expect(await page.locator('.editeur').innerText()).toBe(texte)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
  } finally {
    await app.close()
  }
})

test('statistiques : clavier et consultation dans une session annoncée en lecture seule', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-stats-lecture-seule-'))
  const app = await lancer(racine, { executablePath: process.env.STATS_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const fichier = join(racine, 'corpus/entretiens/e1.json')
    const avant = readFileSync(fichier, 'utf8')
    await app.evaluate(({ ipcMain }, data) => {
      ipcMain.removeHandler('corpus:ouvrirEntretienPourEdition')
      ipcMain.handle('corpus:ouvrirEntretienPourEdition', () => ({
        ok: true, acces: 'lecture-seule', verrouTenuParAutrui: null, data,
      }))
    }, JSON.parse(avant))
    await entrerEntretien(page)
    await expect(page.locator('.editeur')).toHaveAttribute('contenteditable', 'false')
    await page.locator('[data-onglet="locuteurs"]').click()
    await expect(page.getByRole('button', { name: 'Modifier les locuteurs' })).toHaveCount(0)
    await expect(page.locator('.boutons-loc .attr').first()).toBeDisabled()
    const toggle = page.locator('.statistiques-locuteurs > summary')
    await toggle.focus()
    await toggle.press('Enter')
    await expect(page.locator('.statistiques-locuteurs')).toHaveAttribute('open', '')
    await expect(page.locator('.stats-locuteurs')).toBeVisible()
    const suivante = page.getByRole('button', { name: 'Prise de parole suivante de Karine', exact: true })
    await suivante.focus()
    await suivante.press('Enter')
    await expect(page.locator('.stats-locuteurs li[data-loc="2"] .compteur-tour')).toHaveText('1 / 1')
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    expect(readFileSync(fichier, 'utf8')).toBe(avant)
  } finally {
    await app.close()
  }
})
