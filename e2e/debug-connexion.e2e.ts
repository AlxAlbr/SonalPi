import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ecrireSeedDemo } from '../test/seedDemo'
import { lancer } from './util'

test('debug A - lancer() partagé', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'dbgA-')))
  const p = await app.firstWindow()
  await attendreEtRemplir(p)
  try { await expect(p.locator('.modale-distant .comptes')).toBeVisible({ timeout: 10000 }); console.log('RESULTAT: OK') }
  catch { console.log('RESULTAT: ECHEC'); console.log('MODALE:', JSON.stringify((await p.locator('.modale-distant').innerText()).slice(-200))) }
  await app.close()
})

test('debug B - lancement direct', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dbgB-'))
  ecrireSeedDemo(join(dir, 'corpus'))
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ recents: [join(dir, 'corpus')] }))
  const app = await electron.launch({
    args: ['.', '--no-sandbox', `--user-data-dir=${dir}`, '--password-store=basic'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } as Record<string, string>,
  })
  const p = await app.firstWindow()
  await attendreEtRemplir(p)
  try { await expect(p.locator('.modale-distant .comptes')).toBeVisible({ timeout: 10000 }); console.log('RESULTAT: OK') }
  catch { console.log('RESULTAT: ECHEC'); console.log('MODALE:', JSON.stringify((await p.locator('.modale-distant').innerText()).slice(-200))) }
  await app.close()
})

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
