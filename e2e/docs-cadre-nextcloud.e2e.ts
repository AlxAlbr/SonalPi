import { test, expect, type ElectronApplication } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../src/main/webdav/client'
import { corpusDistantValide } from '../test/webdav/fixturesCorpusDistant'
import { attendreAccueil, lancer, ouvrirPreparation } from './util'

type SondeDocs = { horsLigne: boolean; methodes: string[]; urlOuverte: string }
for (const port of [8080, 8081]) {
  test(`documents Nextcloud :${port}, navigation en lecture seule et exemples hors ligne`, async () => {
    test.setTimeout(120_000)
    const base = `http://localhost:${port}`
    const pret = await fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
    test.skip(!pret, 'Banc Nextcloud absent.')
    const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
    const dossier = `sonde/docs-electron-${randomUUID()}`
    await parent.creerDossier('sonde')
    await parent.creerDossier(dossier)
    const client = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` })
    const profil = mkdtempSync(join(tmpdir(), 'sonal-docs-nc-e2e-'))
    let app: ElectronApplication | undefined
    try {
      for (const d of ['entretiens', 'verrous', 'DocsPrepaProjet', 'DocsPrepaProjet/DPO', 'DocsPrepaProjet/DPO/École 2']) await client.creerDossier(d)
      await client.putTexte('corpus.crp', corpusDistantValide([]), { ifNoneMatch: '*' })
      await client.putTexte('DocsPrepaProjet/DPO/École 2/Notice é.txt', 'Texte distant exact.', { ifNoneMatch: '*' })
      app = await lancer(profil)
      await app.evaluate(({ shell }, racine) => {
        const g = globalThis as typeof globalThis & { sondeDocs: SondeDocs }
        const original = g.fetch
        g.sondeDocs = { horsLigne: false, methodes: [], urlOuverte: '' }
        g.fetch = async (input, init) => {
          const url = input instanceof Request ? input.url : String(input)
          if (url.startsWith(`${racine}/DocsPrepaProjet`)) {
            g.sondeDocs.methodes.push(init?.method ?? (input instanceof Request ? input.method : 'GET'))
            if (g.sondeDocs.horsLigne) throw new Error('Connexion documentaire coupée pour le test')
          }
          return original(input, init)
        }
        shell.openExternal = async (url) => { g.sondeDocs.urlOuverte = url }
      }, client.config.baseUrl)
      const page = await app.firstWindow()
      await attendreAccueil(page)
      await page.locator('.carte-demo.distant-corpus').click()
      await page.locator('.modale-distant input.champ').nth(0).fill(client.config.baseUrl)
      await page.locator('.modale-distant input.champ').nth(1).fill('max')
      await page.locator('.modale-distant input[type=password]').fill('max-max-1234')
      await page.locator('.modale-distant .valider').click()
      await expect(page.locator('.modale-distant .comptes')).toBeVisible({ timeout: 30_000 })
      const secrets = page.locator('.modale-distant .secret-compte')
      for (let i = 0; i < await secrets.count(); i++) await secrets.nth(i).fill('max-max-1234')
      await page.locator('.modale-distant .mini.ouvrir').first().click()
      await expect(page.locator('.modale-distant')).toBeHidden({ timeout: 30_000 })
      await ouvrirPreparation(page, 'docs-cadre')
      const cote = page.locator('.cote-docs')
      await expect(cote.getByRole('button', { name: /Ajouter un fichier|Nouveau dossier|Ouvrir ce dossier/ })).toHaveCount(0)
      await cote.getByRole('button', { name: 'Dossier : DPO', exact: true }).click()
      await cote.getByRole('button', { name: 'Dossier : École 2', exact: true }).click()
      await cote.locator('.document', { hasText: 'Notice é.txt' }).click()
      await expect(page.locator('.texte-echappe')).toContainText('Texte distant exact.')
      await expect(page.locator('.fiche-zone').getByRole('button', { name: 'Ouvrir', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Afficher dans le dossier' })).toHaveCount(0)
      await cote.getByRole('button', { name: 'Organiser ce dossier dans Nextcloud' }).click()
      await expect.poll(() => app!.evaluate(() => (globalThis as unknown as { sondeDocs: SondeDocs }).sondeDocs.urlOuverte)).toContain('/DocsPrepaProjet/DPO/%C3%89cole%202')

      await app.evaluate(() => { (globalThis as unknown as { sondeDocs: SondeDocs }).sondeDocs.horsLigne = true })
      await cote.getByRole('button', { name: /Actualiser/ }).click()
      await expect(cote.getByRole('alert')).toContainText('Vérifiez la connexion')
      await expect(cote.locator('[aria-current="location"]')).toHaveText('École 2')
      await expect(cote.locator('.document .nom')).toHaveText(['Notice é.txt'])
      await ouvrirPreparation(page, 'documents-exemples')
      await cote.getByRole('button', { name: 'Dossier : DPO', exact: true }).click()
      await cote.locator('.document', { hasText: 'Notice de consentement DPO.txt' }).click()
      await expect(page.locator('.texte-echappe')).toContainText('À venir.')
      expect(await app.evaluate(() => (globalThis as unknown as { sondeDocs: SondeDocs }).sondeDocs.methodes.every((m) => ['GET', 'PROPFIND'].includes(m)))).toBe(true)
    } finally {
      await app?.close()
      await parent.supprimer(dossier)
      rmSync(profil, { recursive: true, force: true })
    }
  })
}
