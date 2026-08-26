import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil } from './util'
import { ClientWebDAV } from '../src/main/webdav/client'

const ID = 'ent-demo-multi'
test('debug verrou max', async () => {
  const c = new ClientWebDAV({ baseUrl: 'http://localhost:8080/remote.php/dav/files/max/MonCorpus', identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
  await c.putTexte('corpus.json', JSON.stringify({ formatVersion: 3, nom: 'Démo', codebook: {}, variables: {}, reglesAnon: {}, personnes: {}, membership: { [ID]: { titre: 'Entretien partagé', date: null, lastModified: '2026-01-01T00:00:00Z' } } }))
  await c.putTexte(`entretiens/${ID}.json`, JSON.stringify({ formatVersion: 3, lastModified: '2026-01-01T00:00:00Z', corpsTexte: { type: 'doc', content: [] }, annotations: [], ancres: [], locuteurs: [], brouillonsAnon: [], meta: { valeursGen: {}, audioRef: null } }))

  const app = await lancer(mkdtempSync(join(tmpdir(), 'dbgV-')))
  const p = await app.firstWindow()
  await attendreAccueil(p)
  await p.locator('.carte-demo.distant-corpus').click()
  await expect(p.locator('.modale-distant')).toBeVisible()
  await p.locator('.modale-distant input.champ').nth(0).fill('http://localhost:8080/remote.php/dav/files/max/MonCorpus')
  await p.locator('.modale-distant input.champ').nth(1).fill('max')
  await p.locator('.modale-distant input[type=password]').fill('max-max-1234')
  await p.locator('.modale-distant .valider').click()
  await expect(p.locator('.modale-distant .comptes')).toBeVisible({ timeout: 15000 })
  await p.locator('.modale-distant .mini.ouvrir').first().click()
  await expect(p.locator('.corpus-ecran')).toBeVisible({ timeout: 20000 })
  // Ouvre l'entretien.
  await p.locator('.carte-ent .crayon').first().click()
  await expect(p.locator('.editeur')).toBeVisible({ timeout: 20000 })
  const banniere = await p.locator('.banniere-ro').count()
  console.log('BANNIERE_RO:', banniere)
  await p.waitForTimeout(3000)
  const etat = await c.etatVerrouNatif(`entretiens/${ID}.json`)
  console.log('VERROU_NATIF:', JSON.stringify(etat))
  const propfind = await c.propfind('verrous').catch((e) => 'ERR ' + e.message)
  console.log('VERROUS_DIR:', JSON.stringify(propfind))
  await app.close()
})
