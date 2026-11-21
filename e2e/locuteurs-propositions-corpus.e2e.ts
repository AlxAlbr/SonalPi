import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerLocuteurFixture } from '../test/fixtures/identitesLocuteurs'
import { entrerCorpus, lancer, ouvrirDetailsLocuteurs } from './util'

test('propositions secondaires : distinction révocable, regroupement explicite puis reprise depuis la source choisie', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-propositions-')), app = await lancer(dir)
  try {
    const page = await app.firstWindow(); await entrerCorpus(page)
    const ids = await page.evaluate(async () => {
      const api = window.sonal.corpus, ids: string[] = []
      for (const [titre, nom, pseudo, interviewer] of [['Source A', 'Marie Dupont', 'Alice', true], ['Source B', 'Mme Dupont', 'Lou', false], ['Cible', 'Marie Dupont', '', false]] as const) {
        const { id } = await api.creerEntretienVide(titre), r = await api.lireEntretien(id)
        if (!r.ok) throw new Error('Fixture absente')
        const { formatVersion: _v, lastModified: _d, ...payload } = r.data
        payload.participations = [{ id: 'local', index: 0, nom, pseudo, interviewer, valeursLoc: {}, locuteurRef: null }]
        await api.ecrireEntretien(id, payload); ids.push(id)
      }
      return ids
    })
    creerLocuteurFixture(join(dir, 'corpus'), 'Marie Dupont', ids.slice(0, 2).map((entretienId) => ({ entretienId, participationId: 'local' })))
    creerLocuteurFixture(join(dir, 'corpus'), 'Marie Dupont', [{ entretienId: ids[2], participationId: 'local' }])
    await ouvrirDetailsLocuteurs(page)
    const panneau = page.locator('.locuteurs-corpus'), details = panneau.locator('.details-locuteurs')
    await details.locator('summary').filter({ hasText: 'Propositions présentées' }).click()
    const suggestions = details.getByRole('region', { name: 'Suggestions à vérifier', exact: true })
    await expect(suggestions.locator('article')).toHaveCount(1)
    await expect(suggestions).toContainText('Source A, Source B')
    await suggestions.getByRole('button', { name: 'Garder distincts…' }).click()
    const distincts = page.getByRole('dialog', { name: 'Garder ces locuteurs distincts', exact: true })
    await expect(distincts.getByRole('button', { name: 'Annuler', exact: true })).toBeFocused()
    await distincts.getByRole('button', { name: 'Garder distincts', exact: true }).click(); await expect(distincts).toHaveCount(0)
    await expect(suggestions.locator('article')).toHaveCount(0)
    expect((await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())).locuteurs).toHaveLength(2)
    await details.locator('summary').filter({ hasText: 'Distinctions enregistrées (1)' }).click()
    await details.getByRole('button', { name: 'Réexaminer cette distinction…' }).click()
    const revoir = page.getByRole('dialog', { name: 'Réexaminer cette distinction' })
    await expect(revoir).toContainText('aucun regroupement')
    await revoir.getByRole('button', { name: 'Réexaminer la distinction' }).click(); await expect(revoir).toHaveCount(0)
    await expect(suggestions.locator('article')).toHaveCount(1)
    await suggestions.getByRole('button', { name: 'Comparer ces locuteurs' }).click()
    await panneau.getByRole('button', { name: 'C’est le même locuteur…' }).click()
    const reunir = page.getByRole('dialog', { name: 'Réunir les locuteurs sélectionnés' })
    await expect(reunir).toContainText('3 entretiens')
    await reunir.getByLabel('Nom commun', { exact: true }).fill('Marie Dupont')
    await reunir.getByRole('radio', { name: 'Conserver les noms actuels', exact: true }).check()
    await reunir.getByRole('button', { name: 'Réunir les locuteurs', exact: true }).click(); await expect(reunir).toHaveCount(0)
    const avant = await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs()), cible = avant.participations.find((p) => p.entretienTitre === 'Cible')!
    expect(avant.locuteurs).toHaveLength(1); expect(cible.pseudo).toBe(''); expect(cible.interviewer).toBe(false)
    const article = details.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Marie Dupont · Cible', exact: true }) })
    await article.getByRole('button', { name: 'Reprendre des informations…' }).click()
    const reprise = page.getByRole('dialog', { name: 'Reprendre des informations locales' }), select = reprise.getByLabel('Entretien source', { exact: true })
    await expect(select.locator('option').filter({ hasText: /Source A.*Alice.*pose les questions/ })).toHaveCount(1)
    const option = select.locator('option').filter({ hasText: /Source B.*Lou.*répond aux questions/ })
    await expect(option).toHaveCount(1)
    await expect(reprise.getByRole('button', { name: 'Reprendre les informations' })).toBeDisabled()
    await select.selectOption((await option.getAttribute('value'))!)
    await reprise.getByRole('button', { name: 'Reprendre les informations' }).click(); await expect(reprise).toHaveCount(0)
    const apres = await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())
    expect(apres.participations.find((p) => p.entretienTitre === 'Cible')).toMatchObject({ nom: 'Marie Dupont', pseudo: 'Lou', pseudoEtat: 'confirme', interviewer: false, locuteurRef: cible.locuteurRef })
    expect(apres.participations.filter((p) => p.entretienTitre.startsWith('Source'))).toEqual(avant.participations.filter((p) => p.entretienTitre.startsWith('Source')))
    expect(apres.locuteurs).toHaveLength(1)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('écarter une paire conserve les propositions avec le troisième locuteur valide', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-propositions-trois-')), app = await lancer(dir)
  try {
    const page = await app.firstWindow(); await entrerCorpus(page)
    await page.evaluate(async () => {
      const api = window.sonal.corpus
      for (const titre of ['Entretien A', 'Entretien B', 'Entretien C']) {
        const { id } = await api.creerEntretienVide(titre), r = await api.lireEntretien(id)
        if (!r.ok) throw new Error('Fixture absente')
        const { formatVersion: _v, lastModified: _d, ...payload } = r.data
        payload.participations = [{ id: 'local', index: 0, nom: 'Marie Dupont', valeursLoc: {}, locuteurRef: null }]
        await api.ecrireEntretien(id, payload)
        await api.ouvrirEntretienPourEdition(id)
        await api.identifierParticipationAuNommage({ entretienId: id, participationId: 'local', nom: 'Marie Dupont' })
        await api.fermerEntretien(id)
      }
    })
    await ouvrirDetailsLocuteurs(page)
    const details = page.locator('.details-locuteurs')
    await details.locator('summary').filter({ hasText: 'Propositions présentées (3)' }).click()
    const suggestions = details.getByRole('region', { name: 'Suggestions à vérifier', exact: true })
    await expect(suggestions.locator('article')).toHaveCount(3)
    const ab = suggestions.locator('article').filter({ hasText: /Entretien A.*Entretien B/ })
    await ab.getByRole('button', { name: 'Garder distincts…' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Garder distincts', exact: true }).click()
    await expect(suggestions.locator('article')).toHaveCount(2)
    await expect(suggestions).toContainText('Entretien C')
    const inv = await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())
    expect(inv.locuteurs).toHaveLength(3)
    expect(inv.participations.filter((p) => p.rapprochementsRefuses?.length)).toHaveLength(2)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})
