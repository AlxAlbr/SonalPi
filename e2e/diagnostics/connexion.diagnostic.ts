import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ecrireSeedDemo } from '../../test/seedDemo'
import { lancer } from '../util'

test('diagnostic A - lancer() partagé', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'diagA-')))
  try {
    const page = await app.firstWindow()
    await attendreEtRemplir(page)
    await verifierConnexion(page)
  } finally {
    await app.close()
  }
})

test('diagnostic B - lancement direct', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'diagB-'))
  ecrireSeedDemo(join(dir, 'corpus'))
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ recents: [join(dir, 'corpus')] }))
  const app = await electron.launch({
    args: ['.', '--no-sandbox', `--user-data-dir=${dir}`, '--password-store=basic'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } as Record<string, string>,
  })
  try {
    const page = await app.firstWindow()
    await attendreEtRemplir(page)
    await verifierConnexion(page)
  } finally {
    await app.close()
  }
})

async function verifierConnexion(page: import('@playwright/test').Page): Promise<void> {
  try {
    await expect(page.locator('.modale-distant .comptes')).toBeVisible({ timeout: 10_000 })
    console.log('RÉSULTAT : connexion réussie.')
  } catch (erreur) {
    console.error('RÉSULTAT : échec de connexion.')
    console.error(
      'MODALE :',
      JSON.stringify((await page.locator('.modale-distant').innerText()).slice(-200)),
    )
    throw erreur
  }
}

async function attendreEtRemplir(p: import('@playwright/test').Page) {
  await expect(p.locator('.ecran.accueil')).toBeVisible({ timeout: 20000 })
  await p.locator('.carte-demo.distant-corpus').click()
  await expect(p.locator('.modale-distant')).toBeVisible()
  await p.locator('.modale-distant input.champ').nth(0).fill('http://localhost:8080/remote.php/dav/files/max/MonCorpus')
  await p.locator('.modale-distant input.champ').nth(1).fill('max')
  await p.locator('.modale-distant input[type=password]').fill('max-max-1234')
  await p.locator('.modale-distant .valider').click()
  await p.waitForTimeout(6000)
}
