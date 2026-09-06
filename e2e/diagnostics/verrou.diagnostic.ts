import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil } from '../util'
import { ClientWebDAV } from '../../src/main/webdav/client'

/**
 *  Diagnostic manuel destructif : il réinitialise `MonCorpus` sur la pile
 *  Nextcloud locale avant d'observer son verrou natif.
 */
const ID = 'ent-demo-multi'
test('diagnostic du verrou natif avec le compte max', async () => {
  const c = new ClientWebDAV({ baseUrl: 'http://localhost:8080/remote.php/dav/files/max/MonCorpus', identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
  await c.putTexte('corpus.json', JSON.stringify({ formatVersion: 3, nom: 'Démo', codebook: {}, variables: {}, reglesAnon: {}, personnes: {}, membership: { [ID]: { titre: 'Entretien partagé', date: null, lastModified: '2026-01-01T00:00:00Z' } } }))
  await c.putTexte(`entretiens/${ID}.json`, JSON.stringify({ formatVersion: 3, lastModified: '2026-01-01T00:00:00Z', corpsTexte: { type: 'doc', content: [] }, annotations: [], ancres: [], locuteurs: [], brouillonsAnon: [], meta: { valeursGen: {}, audioRef: null } }))

  const app = await lancer(mkdtempSync(join(tmpdir(), 'diagV-')))
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await page.locator('.carte-demo.distant-corpus').click()
    await expect(page.locator('.modale-distant')).toBeVisible()
    await page.locator('.modale-distant input.champ').nth(0)
      .fill('http://localhost:8080/remote.php/dav/files/max/MonCorpus')
    await page.locator('.modale-distant input.champ').nth(1).fill('max')
    await page.locator('.modale-distant input[type=password]').fill('max-max-1234')
    await page.locator('.modale-distant .valider').click()
    await expect(page.locator('.modale-distant .comptes')).toBeVisible({ timeout: 15_000 })
    await page.locator('.modale-distant .mini.ouvrir').first().click()
    await expect(page.locator('.corpus-ecran')).toBeVisible({ timeout: 20_000 })
    await page.locator('.carte-ent .crayon').first().click()
    await expect(page.locator('.editeur')).toBeVisible({ timeout: 20_000 })
    const banniere = await page.locator('.banniere-ro').count()
    console.log('BANNIÈRE_RO :', banniere)
    await page.waitForTimeout(3_000)
    const etat = await c.etatVerrouNatif(`entretiens/${ID}.json`)
    console.log('VERROU_NATIF :', JSON.stringify(etat))
    const propfind = await c.propfind('verrous').catch((erreur) => `ERREUR ${erreur.message}`)
    console.log('DOSSIER_VERROUS :', JSON.stringify(propfind))
  } finally {
    await app.close()
  }
})
