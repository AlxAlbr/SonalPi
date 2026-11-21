import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerLocuteurFixture, installerIdentitesFixture } from '../test/fixtures/identitesLocuteurs'
import { entrerCorpus, lancer, ouvrirDetailsLocuteurs, regulariserDansEntretien } from './util'

function fichiers(dir: string, ids: string[]) { return [join(dir, 'corpus', 'corpus.crp'), ...ids.map((id) => join(dir, 'corpus', 'entretiens', `${id}.json`))].map((f) => readFileSync(f, 'utf8')) }

test('les détails restent secondaires et les notes de mêmes ids ne traversent pas les entretiens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-details-notes-')), app = await lancer(dir)
  try {
    const page = await app.firstWindow(); await entrerCorpus(page)
    const a = creerLocuteurFixture(join(dir, 'corpus'), 'Alice'), b = creerLocuteurFixture(join(dir, 'corpus'), 'Bob')
    const autre = await page.evaluate(async ({ a, b }) => {
      const api = window.sonal.corpus, variable = await api.ajouterVariable('Donnée locale', 'participation')
      const corpus = await api.ajouterModalite(variable.id, 'Valeur conservée'), mod = corpus.variables[variable.id].modalites[0].id
      const { id } = await api.creerEntretienVide('Autre entretien')
      for (const [entretienId, identite, titre] of [['e1', a, 'Note sélectionnée'], [id, b, 'Note étrangère']] as const) {
        const r = await api.lireEntretien(entretienId)
        if (!r.ok) throw new Error('Fixture absente')
        const { formatVersion: _v, lastModified: _d, ...payload } = r.data
        if (!payload.participations.length) payload.participations = [{ id: 'local', index: 0, nom: 'Autre voix', locuteurRef: null, valeursLoc: {} }]
        payload.participations[0].id = 'partage'; payload.participations[0].locuteurRef = identite
        payload.participations[0].pseudo = 'Pseudo conservé'; payload.participations[0].valeursLoc = { [variable.id]: mod }
        payload.notes = [{ id: 'note', categorieId: 'ncat_generale', titre, corps: 'Texte <em>conservé</em>', date: null, statut: 'prive', rang: 0, participationIds: ['partage'], creeLe: '', modifieLe: null }]
        await api.ecrireEntretien(entretienId, payload)
      }
      return id
    }, { a, b })
    const avant = fichiers(dir, ['e1', autre])
    await ouvrirDetailsLocuteurs(page)
    const panneau = page.locator('.locuteurs-corpus'), details = panneau.locator('.details-locuteurs')
    const alice = panneau.getByRole('option').filter({ has: page.getByText('Alice', { exact: true }) })
    await alice.click()
    await expect(details.getByRole('heading', { name: 'Note sélectionnée · Entretien Karine', exact: true })).toBeVisible()
    await expect(details).not.toContainText('Note étrangère')
    await expect(details.getByText('Donnée locale', { exact: true })).toBeVisible()
    await expect(details.getByText('Valeur conservée', { exact: true })).toBeVisible()
    await expect(details).toContainText('Pseudo conservé')
    await expect(panneau.getByRole('listbox', { name: 'Locuteurs', exact: true })).toBeVisible()
    await expect(panneau.locator('.personnes-corpus')).toHaveCount(0)
    for (const width of [1280, 760]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(panneau.getByRole('listbox', { name: 'Locuteurs', exact: true })).toBeVisible()
      await expect(details.getByRole('heading', { name: 'Informations dans les entretiens' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    }
    await details.getByRole('button', { name: 'Fermer les détails' }).focus()
    await page.keyboard.press('Enter')
    await expect(alice).toHaveAttribute('aria-selected', 'true')
    await panneau.getByRole('button', { name: 'Détails et vérifications…', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(details.getByRole('heading', { name: 'Note sélectionnée · Entretien Karine', exact: true })).toBeVisible()
    expect(fichiers(dir, ['e1', autre])).toEqual(avant)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('suppression d’une définition vide : annulation, suppression libre et refus si un usage subsiste', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-details-vides-')), app = await lancer(dir)
  try {
    const page = await app.firstWindow(); await entrerCorpus(page)
    creerLocuteurFixture(join(dir, 'corpus'), 'Vide libre')
    const utilise = creerLocuteurFixture(join(dir, 'corpus'), 'Vide utilisé')
    await page.evaluate(async (id) => {
      const api = window.sonal.corpus
      const r = await api.lireEntretien('e1'); if (!r.ok) throw new Error('Fixture absente')
      const { formatVersion: _v, lastModified: _d, ...payload } = r.data
      payload.participations[0].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: id }]
      await api.ecrireEntretien('e1', payload)
    }, utilise)
    await ouvrirDetailsLocuteurs(page)
    const details = page.locator('.details-locuteurs')
    await details.locator('summary').filter({ hasText: 'Locuteurs sans entretien (2)' }).click()
    const libres = details.getByRole('region', { name: 'Locuteurs sans entretien', exact: true })
    const libre = libres.locator('article').filter({ hasText: 'Vide libre' }).getByRole('button', { name: 'Supprimer ce locuteur…' })
    await libre.click()
    const dialogue = page.getByRole('dialog', { name: 'Supprimer ce locuteur sans entretien' })
    await expect(dialogue.getByRole('button', { name: 'Annuler', exact: true })).toBeFocused()
    await page.keyboard.press('Escape'); await expect(dialogue).toHaveCount(0)
    expect((await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())).locuteurs).toHaveLength(2)
    await libre.click(); await dialogue.getByRole('button', { name: 'Supprimer ce locuteur', exact: true }).click(); await expect(dialogue).toHaveCount(0)
    await expect(libres).not.toContainText('Vide libre')
    await libres.locator('article').filter({ hasText: 'Vide utilisé' }).getByRole('button', { name: 'Supprimer ce locuteur…' }).click()
    await dialogue.getByRole('button', { name: 'Supprimer ce locuteur', exact: true }).click()
    await expect(dialogue.getByRole('alert')).toContainText('rapprochements refusés')
    expect((await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())).locuteurs.map((l) => l.nom)).toEqual(['Vide utilisé'])
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('un changement après l’aperçu refuse la suppression sans écriture supplémentaire', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-details-perime-')), app = await lancer(dir)
  try {
    const page = await app.firstWindow(); await entrerCorpus(page)
    const id = creerLocuteurFixture(join(dir, 'corpus'), 'Vide initial')
    await ouvrirDetailsLocuteurs(page)
    const details = page.locator('.details-locuteurs')
    await details.locator('summary').filter({ hasText: 'Locuteurs sans entretien (1)' }).click()
    await details.getByRole('button', { name: 'Supprimer ce locuteur…' }).click()
    installerIdentitesFixture(join(dir, 'corpus'), { locuteurs: [{ id, nom: 'Nom changé ailleurs' }] })
    const avant = fichiers(dir, ['e1'])
    const dialogue = page.getByRole('dialog', { name: 'Supprimer ce locuteur sans entretien' })
    await dialogue.getByRole('button', { name: 'Supprimer ce locuteur', exact: true }).click()
    await expect(dialogue.getByRole('alert')).toContainText('ont changé')
    expect(fichiers(dir, ['e1'])).toEqual(avant)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('régulariser un retrait ou un lien absent est explicite et conserve séparément les homonymes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-details-regulariser-')), app = await lancer(dir)
  try {
    const page = await app.firstWindow(); await entrerCorpus(page)
    const autre = await page.evaluate(async () => {
      const api = window.sonal.corpus, { id } = await api.creerEntretienVide('Lien absent')
      for (const entretienId of ['e1', id]) {
        const r = await api.lireEntretien(entretienId); if (!r.ok) throw new Error('Fixture absente')
        const { formatVersion: _v, lastModified: _d, ...payload } = r.data
        if (!payload.participations.length) payload.participations = [{ id: 'local', index: 0, nom: 'X', locuteurRef: null, valeursLoc: {} }]
        payload.participations[0].nom = 'X'
        if (entretienId === 'e1') { payload.participations[0].locuteurRef = null; payload.participations[0].associationRetiree = true }
        else payload.participations[0].locuteurRef = 'ancien-locuteur-absent'
        await api.ecrireEntretien(entretienId, payload)
      }
      return id
    })
    await ouvrirDetailsLocuteurs(page)
    const panneau = page.locator('.locuteurs-corpus'), lignes = panneau.getByRole('option').filter({ has: page.getByText('X', { exact: true }) })
    await expect(lignes).toHaveCount(0)
    const avant = fichiers(dir, ['e1', autre])
    await expect(panneau.locator('.verification-locuteurs')).toBeVisible()
    await expect(panneau.getByRole('button', { name: 'Conserver séparément…' })).toHaveCount(0)
    expect(fichiers(dir, ['e1', autre])).toEqual(avant)
    await regulariserDansEntretien(page, 'Entretien Karine', 'X')
    await regulariserDansEntretien(page, 'Lien absent', 'X')
    const inv = await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs()), voix = inv.participations.filter((p) => p.nom === 'X')
    expect(inv.locuteurs).toHaveLength(2); expect(new Set(voix.map((p) => p.locuteurRef)).size).toBe(2)
    expect(voix.every((p) => !!p.locuteurRef && !p.associationRetiree)).toBe(true)
    await expect(lignes).toHaveCount(2)
    await expect(panneau.locator('.personnes-corpus')).toHaveCount(0)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})
