import { test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { intercepterOuvertureUrl, pathAvecShim, sessionQualification } from './qualification/connexionOAuth'
import { attendreAccueil, lancer } from './util'

test('debug consentement', async ({ browser }) => {
  test.setTimeout(120_000)
  const shim = intercepterOuvertureUrl()
  const profil = mkdtempSync(join(tmpdir(), 'sonal-debug-'))
  const app = await lancer(profil, {
    env: { PATH: pathAvecShim(shim.repertoire), SONAL_URL_OUVRTE: shim.fichierUrl },
  })
  const session = await sessionQualification(browser, true)
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await page.locator('.carte-demo.distant-corpus').click()
    await page.getByRole('tab', { name: 'GitLab' }).click()
    await page.locator('.url-projet-gitlab').fill('https://127.0.0.1.nip.io/user1/sonal-v2-qualification-lfs')
    await page.getByRole('button', { name: 'Charger le projet' }).click()
    await page.locator('.client-id-gitlab').waitFor({ timeout: 30_000 })
    await page.locator('.client-id-gitlab').fill(process.env.GITLAB_OAUTH_CLIENT_ID ?? '')
    await page.getByRole('button', { name: 'Se connecter à GitLab' }).click()
    const { readFileSync } = await import('node:fs')
    let url = ''
    for (let i = 0; i < 200 && !url; i += 1) {
      await new Promise((r) => setTimeout(r, 100))
      try { url = readFileSync(shim.fichierUrl, 'utf8').split('\n').find(Boolean) ?? '' } catch { /* pas encore */ }
    }
    const nav = await session.newPage()
    await nav.goto(url)
    console.log('PAGE 1:', nav.url())
    console.log('TITRE 1:', await nav.title())
    const login = nav.locator('#user_login')
    if (await login.isVisible().catch(() => false)) {
      console.log('formulaire de connexion détecté')
      await login.fill(process.env.GITLAB_OAUTH_USER1 ?? 'user1')
      await nav.locator('#user_password').fill(process.env.GITLAB_OAUTH_PASSWORD1 ?? '')
      await nav.getByRole('button', { name: /sign in|se connecter/i }).first().click()
      await nav.waitForLoadState('domcontentloaded')
    }
    console.log('PAGE 2:', nav.url())
    console.log('TITRE 2:', await nav.title())
    const boutons = await nav.locator('button, input[type=submit]').allTextContents()
    console.log('BOUTONS:', JSON.stringify(boutons))
    const autoriser = nav.getByRole('button', { name: /authorize|autoriser/i })
    console.log('nb bouton autoriser:', await autoriser.count())
    if (await autoriser.count()) {
      await autoriser.first().click()
    }
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 500))
      if (nav.url().includes('127.0.0.1:7474')) break
    }
    console.log('PAGE 3:', nav.url())
    const direct = await fetch('http://127.0.0.1:7474/callback?code=x&state=y').catch((e) => e)
    console.log('APPEL DIRECT:', direct instanceof Error ? `erreur ${direct.message}` : `HTTP ${direct.status}`)
    console.log('TITRE 3:', await nav.title())
    console.log('TEXTE 3:', (await nav.locator('body').innerText()).slice(0, 300))
    await nav.waitForTimeout(2000)
    console.log('MSG APP:', await page.locator('.msg').textContent().catch(() => '(aucun)'))
  } finally {
    await app.close().catch(() => undefined)
    await session.fermer().catch(() => undefined)
    shim.nettoyer()
    rmSync(profil, { recursive: true, force: true })
  }
})
