/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, entrerEntretien, lancer } from './util'

test('un corps de note hostile reste inerte dans un renderer isolé', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-securite-'))
  const application = await lancer(profil)
  const page = await application.firstWindow()

  try {
    const fichier = join(profil, 'corpus', 'entretiens', 'e1.json')
    const entretien = JSON.parse(readFileSync(fichier, 'utf8'))
    entretien.notes = [
      {
        id: 'n-xss',
        categorieId: 'ncat_generale',
        titre: '',
        date: null,
        statut: 'prive',
        corps:
          '<img src="invalide" onerror="window.__xssCorpus=1">' +
          '<svg onload="window.__xssCorpus=2">dessin</svg>' +
          '<mark onclick="window.__xssCorpus=3">passage sûr</mark>' +
          '<a href="javascript:window.__xssCorpus=4">lien</a>',
        rang: 0,
        creeLe: '2026-01-01T00:00:00.000Z',
        modifieLe: null,
      },
    ]
    writeFileSync(fichier, JSON.stringify(entretien, null, 2), 'utf8')

    await page.evaluate(() => {
      ;(window as Window & { __xssCorpus?: number }).__xssCorpus = 0
    })
    await entrerCorpus(page)
    await entrerEntretien(page)
    await page.locator('[data-onglet="notes"]').click()

    const corps = page.locator('.notes .corps-note')
    await expect(corps).toContainText('dessinpassage sûrlien')
    await expect(corps.locator('mark')).toHaveText('passage sûr')
    await expect(corps.locator('img, svg, script, a')).toHaveCount(0)
    expect(
      await page.evaluate(() => (window as Window & { __xssCorpus?: number }).__xssCorpus),
    ).toBe(0)

    await page.evaluate(() => {
      const cible = window as Window & { __scriptInline?: number }
      cible.__scriptInline = 0
      const script = document.createElement('script')
      script.textContent = 'window.__scriptInline=1'
      document.body.appendChild(script)
    })
    await page.waitForTimeout(50)
    expect(
      await page.evaluate(() => (window as Window & { __scriptInline?: number }).__scriptInline),
    ).toBe(0)

    const urlInitiale = page.url()
    expect(await page.evaluate(() => window.open('https://example.com') === null)).toBe(true)
    expect(application.windows()).toHaveLength(1)
    await page.evaluate(() => {
      const lien = document.createElement('a')
      lien.href = 'https://example.com'
      document.body.appendChild(lien)
      lien.click()
    })
    await page.waitForTimeout(100)
    expect(page.url()).toBe(urlInitiale)
  } finally {
    await application.close()
  }
})
