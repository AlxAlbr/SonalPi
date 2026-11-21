import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../src/main/webdav/client'
import { fixtureLocuteursDistants } from '../test/fixtures/locuteursDistants'
import { lancer, attendreAccueil, fermerAiguillage, retourCorpus } from './util'

type Sonde = { perdu: boolean; nomPerdu?: string; refuserB: boolean; publications: string[] }
async function perdreUneReponse(app: ElectronApplication, racine: string) {
  await app.evaluate((_electron, racine) => {
    const g = globalThis as typeof globalThis & { sondeLocuteurs: Sonde }
    const fetchOriginal = g.fetch
    g.sondeLocuteurs = { perdu: false, refuserB: false, publications: [] }
    g.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input), methode = init?.method ?? (input instanceof Request ? input.method : 'GET')
      if (g.sondeLocuteurs.refuserB && url.startsWith(`${racine}/`) && methode === 'PUT' && url.endsWith('/entretiens/B.json')) return new Response('Version modifiée', { status: 412 })
      const reponse = await fetchOriginal(input, init)
      if (url.startsWith(`${racine}/`) && methode === 'PUT' && reponse.ok && /\/(corpus\.crp|entretiens\/[ABC]\.json)$/.test(new URL(url).pathname)) {
        g.sondeLocuteurs.publications.push(new URL(url).pathname.split('/').at(-1)!)
        if (!g.sondeLocuteurs.perdu && url.endsWith('/entretiens/A.json')
          && (!g.sondeLocuteurs.nomPerdu || (typeof init?.body === 'string' && JSON.parse(init.body).participations[0].nom === g.sondeLocuteurs.nomPerdu))) {
          g.sondeLocuteurs.perdu = true; await reponse.body?.cancel(); throw new Error('Réponse perdue après acceptation')
        }
      }
      return reponse
    }
  }, racine)
}
async function connecter(page: Page, url: string) {
  await attendreAccueil(page); await page.locator('.carte-demo.distant-corpus').click()
  await page.locator('.modale-distant input.champ').nth(0).fill(url)
  await page.locator('.modale-distant input.champ').nth(1).fill('max')
  await page.locator('.modale-distant input[type=password]').fill('max-max-1234')
  await page.locator('.modale-distant .valider').click()
  await expect(page.locator('.modale-distant .comptes')).toBeVisible({ timeout: 30_000 })
  const secrets = page.locator('.modale-distant .secret-compte')
  for (let i = 0; i < await secrets.count(); i++) await secrets.nth(i).fill('max-max-1234')
  await page.locator('.modale-distant .mini.ouvrir').first().click()
  await fermerAiguillage(page, 'entretiens', 120_000)
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Locuteurs', exact: true }).click()
}

for (const port of [8080, 8081]) test.describe(`locuteurs WebDAV :${port}`, () => {
  test('vue commune, corrections et trois gestes depuis l’entretien ouvert, avec reprise sans renvoi du succès', async () => {
    test.setTimeout(420_000)
    const pret = await fetch(`http://localhost:${port}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
    test.skip(!pret, 'Banc Nextcloud absent.')
    const parent = new ClientWebDAV({ baseUrl: `http://localhost:${port}/remote.php/dav/files/max/MonCorpus`, identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
    const dossier = `sonde/locuteurs-electron-${randomUUID()}`
    await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
    const client = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` }), f = fixtureLocuteursDistants()
    await client.creerDossier('entretiens'); await client.creerDossier('verrous')
    await client.putTexte('corpus.crp', JSON.stringify(f.corpus), { ifNoneMatch: '*' })
    for (const s of f.sources()) await client.putTexte(`entretiens/${s.id}.json`, s.contenu, { ifNoneMatch: '*' })
    const profil = mkdtempSync(join(tmpdir(), 'sonal-e2e-locuteurs-webdav-')), app = await lancer(profil)
    try {
      await perdreUneReponse(app, client.config.baseUrl)
      const page = await app.firstWindow(); await connecter(page, client.config.baseUrl)
      const panneau = page.locator('.locuteurs-corpus')
      await expect(panneau.locator('.personnes-corpus')).toHaveCount(0)
      await panneau.getByRole('option').filter({ has: page.getByText('Alice', { exact: true }) }).click()
      await panneau.getByRole('button', { name: 'Détails et vérifications…', exact: true }).click()
      const details = panneau.locator('.details-locuteurs')
      await expect(details).toContainText('Note A'); await expect(details).toContainText('Note B'); await expect(details).not.toContainText('Note C')
      const renommer = panneau.getByRole('button', { name: 'Renommer…', exact: true })
      await expect(renommer).toBeEnabled(); await renommer.click()
      const dialogue = page.getByRole('dialog', { name: 'Renommer ce locuteur', exact: true })
      await dialogue.getByLabel('Nouveau nom', { exact: true }).fill('Alice publiée')
      await dialogue.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true }).click()
      const suivi = panneau.getByRole('region', { name: 'Correction des locuteurs à terminer', exact: true })
      await expect(suivi.getByRole('button', { name: 'Vérifier le résultat', exact: true })).toBeVisible({ timeout: 60_000 })
      await expect(dialogue).toHaveCount(0)
      await expect(renommer).toBeDisabled()
      await suivi.getByRole('button', { name: 'Vérifier le résultat', exact: true }).click()
      await expect(suivi.getByRole('button', { name: 'Reprendre la correction', exact: true })).toBeVisible({ timeout: 60_000 })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeLocuteurs: Sonde }).sondeLocuteurs.publications)).toEqual(['A.json'])
      await suivi.getByRole('button', { name: 'Reprendre la correction', exact: true }).click()
      await expect(suivi).toContainText('La correction est terminée', { timeout: 90_000 })
      await expect(panneau.getByRole('option').filter({ has: page.getByText('Alice publiée', { exact: true }) })).toBeVisible()
      const publications = await app.evaluate(() => (globalThis as unknown as { sondeLocuteurs: Sonde }).sondeLocuteurs.publications)
      expect(publications).toEqual(['A.json', 'B.json', 'corpus.crp'])
      for (const e of f.entretiens) {
        const apres = JSON.parse(await client.getTexte(`entretiens/${e.id}.json`))
        expect(apres).toEqual(e.id === 'C' ? e.data : { ...e.data, lastModified: expect.any(String), participations: [{ ...e.data.participations[0], nom: 'Alice publiée' }] })
      }
      await app.evaluate(() => { (globalThis as unknown as { sondeLocuteurs: Sonde }).sondeLocuteurs.refuserB = true })
      await expect(renommer).toBeEnabled(); await renommer.click()
      await dialogue.getByLabel('Nouveau nom', { exact: true }).fill('Alice conservée')
      await dialogue.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true }).click()
      const arreter = suivi.getByRole('button', { name: 'Arrêter cette correction…', exact: true })
      await expect(arreter).toBeVisible({ timeout: 60_000 }); await expect(dialogue).toHaveCount(0)
      await expect(suivi.getByRole('button', { name: 'Vérifier le résultat', exact: true })).toHaveCount(0)
      await arreter.click()
      const arret = page.getByRole('dialog', { name: 'Arrêter cette correction', exact: true })
      await expect(arret).toContainText('ne rétablit pas les anciens noms')
      await arret.getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(arreter).toBeVisible()
      await arreter.click()
      await arret.getByRole('button', { name: 'Conserver les étapes enregistrées et arrêter', exact: true }).click()
      await expect(suivi).toContainText('La correction est arrêtée', { timeout: 30_000 })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeLocuteurs: Sonde }).sondeLocuteurs.publications)).toEqual(['A.json', 'B.json', 'corpus.crp', 'A.json'])
      expect(JSON.parse(await client.getTexte('entretiens/A.json')).participations[0].nom).toBe('Alice conservée')
      expect(JSON.parse(await client.getTexte('entretiens/B.json')).participations[0].nom).toBe('Alice publiée')
      expect(JSON.parse(await client.getTexte('corpus.crp')).locuteurs.a.nom).toBe('Alice publiée')
      await app.evaluate(() => { (globalThis as unknown as { sondeLocuteurs: Sonde }).sondeLocuteurs.refuserB = false })
      await details.getByRole('button', { name: 'Ouvrir les locuteurs de Entretien A', exact: true }).click()
      await expect(page.locator('.entretien-ecran')).toBeVisible()
      await page.locator('.editeur').click(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('SAISIES RÉCENTES ')
      await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
      const gestion = page.getByRole('dialog', { name: 'Gestion des locuteurs', exact: true }), nom = gestion.locator('.nom-loc').first()
      await expect(nom).toHaveValue('Alice conservée')
      await nom.fill('Alice en session'); await nom.press('Enter')
      const ouvert = page.getByRole('dialog', { name: 'Renommer ce locuteur dans les entretiens', exact: true })
      await expect(ouvert).toContainText('Entretien B', { timeout: 60_000 })
      const avant = JSON.parse(await client.getTexte('entretiens/A.json'))
      const avantLocal = await page.evaluate(async () => { const r = await window.sonal.corpus.lireEntretien('A'); if (!r.ok) throw new Error('Entretien absent'); return r.data })
      expect(JSON.stringify(avant.corpsTexte)).not.toContain('SAISIES RÉCENTES')
      await page.keyboard.press('Escape'); await expect(ouvert).toHaveCount(0)
      await expect(nom).toHaveValue('Alice conservée'); await expect(nom).toBeFocused()
      expect(JSON.parse(await client.getTexte('entretiens/A.json'))).toEqual(avant)
      await nom.fill('Alice en session'); await nom.press('Enter')
      await ouvert.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true }).click()
      await expect(ouvert).toHaveCount(0, { timeout: 90_000 }); await expect(nom).toHaveValue('Alice en session')
      const suite = JSON.parse(await client.getTexte('entretiens/A.json'))
      expect(JSON.stringify(suite.corpsTexte)).toContain('SAISIES RÉCENTES')
      expect(suite).toEqual({ ...avantLocal, lastModified: expect.any(String), participations: [{ ...avantLocal.participations[0], nom: 'Alice en session' }] })
      await gestion.getByRole('button', { name: '+ Locuteur', exact: true }).click()
      const nouveau = gestion.locator('.nom-loc').last(); await nouveau.fill('Bob'); await nouveau.press('Enter')
      const propositions = page.getByRole('dialog', { name: 'Est-ce le même locuteur ?', exact: true })
      await expect(propositions).toBeVisible({ timeout: 60_000 })
      const nomme = JSON.parse(await client.getTexte('entretiens/A.json')), voix = nomme.participations.at(-1)
      expect(voix.nom).toBe('Bob'); expect(voix.locuteurRef).toBeTruthy(); expect(voix.locuteurRef).not.toBe('b')
      expect(nomme.corpsTexte).toEqual(suite.corpsTexte); expect(nomme.participations[0]).toEqual(suite.participations[0])
      await propositions.getByRole('radio').check()
      await propositions.getByRole('checkbox', { name: /Reprendre les informations disponibles/ }).uncheck()
      await propositions.getByRole('button', { name: 'Confirmer', exact: true }).click()
      await expect(propositions).toHaveCount(0, { timeout: 90_000 })
      const reuni = JSON.parse(await client.getTexte('entretiens/A.json'))
      expect(reuni.participations.at(-1)).toEqual({ ...voix, locuteurRef: 'b' })
      expect(reuni.participations[0]).toEqual(suite.participations[0]); expect(reuni.corpsTexte).toEqual(suite.corpsTexte)
      expect(JSON.parse(await client.getTexte('corpus.crp')).locuteurs[voix.locuteurRef]).toBeUndefined()
      await gestion.getByRole('button', { name: 'Fermer la gestion des locuteurs', exact: true }).click()
      await page.locator('.editeur').click(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('APRÈS RAPPROCHEMENT ')
      await expect.poll(() => page.evaluate(async () => { const r = await window.sonal.corpus.lireEntretien('A'); return r.ok && JSON.stringify(r.data.corpsTexte).includes('APRÈS RAPPROCHEMENT') })).toBe(true)
      expect(await page.evaluate(() => window.sonal.corpus.publierEntretien('A'))).toEqual({ ok: true })
      await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
      await app.evaluate(() => { const s = (globalThis as unknown as { sondeLocuteurs: Sonde }).sondeLocuteurs; s.perdu = false; s.nomPerdu = 'Alice après interruption' })
      await nom.fill('Alice après interruption'); await nom.press('Enter')
      await ouvert.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true }).click()
      await expect(ouvert).toContainText('doit être vérifié', { timeout: 90_000 })
      await ouvert.getByRole('button', { name: 'Fermer', exact: true }).click()
      await gestion.getByRole('button', { name: 'Fermer la gestion des locuteurs', exact: true }).click()
      await retourCorpus(page)
      await page.locator('.onglets-corpus').getByRole('button', { name: 'Locuteurs', exact: true }).click()
      await expect(suivi.getByRole('button', { name: 'Vérifier le résultat', exact: true })).toBeVisible({ timeout: 60_000 })
      const envois = await app.evaluate(() => (globalThis as unknown as { sondeLocuteurs: Sonde }).sondeLocuteurs.publications.filter((p) => p === 'A.json').length)
      await suivi.getByRole('button', { name: 'Vérifier le résultat', exact: true }).click()
      await expect(suivi.getByRole('button', { name: 'Reprendre la correction', exact: true })).toBeVisible({ timeout: 60_000 })
      await suivi.getByRole('button', { name: 'Reprendre la correction', exact: true }).click()
      await expect(suivi).toContainText('La correction est terminée', { timeout: 90_000 })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeLocuteurs: Sonde }).sondeLocuteurs.publications.filter((p) => p === 'A.json').length)).toBe(envois)
      expect(JSON.stringify(JSON.parse(await client.getTexte('entretiens/A.json')).corpsTexte)).toContain('APRÈS RAPPROCHEMENT SAISIES RÉCENTES')
    } finally {
      await app.close(); await parent.supprimer(dossier).catch(() => {}); rmSync(profil, { recursive: true, force: true })
    }
  })
})
