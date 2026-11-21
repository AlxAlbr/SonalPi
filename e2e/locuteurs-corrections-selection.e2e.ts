import { expect, test, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import { creerLocuteurFixture } from '../test/fixtures/identitesLocuteurs'
import { entrerCorpus, lancer } from './util'

async function preparer(page: Page) {
  const { dir } = await page.evaluate(() => window.sonal.corpus.dossierCourant())
  const alpha = creerLocuteurFixture(dir, 'Alpha'), beta = creerLocuteurFixture(dir, 'Beta'), gamma = creerLocuteurFixture(dir, 'Gamma')
  return page.evaluate(async ({ alpha, beta, gamma }) => {
    const api = window.sonal.corpus
    const variable = await api.ajouterVariable('Donnée locale conservée', 'participation')
    const corpus = await api.ajouterModalite(variable.id, 'Valeur locale')
    const modalite = corpus.variables[variable.id].modalites[0].id
    const ids: string[] = []
    for (const [titre, nom, locuteurRef] of [
      ['Alpha A', 'Alpha locale', alpha], ['Alpha B masqué', 'Autre nom Alpha', alpha],
      ['Beta C', 'Beta local', beta], ['Gamma D', 'Gamma locale', gamma],
    ]) {
      const { id } = await api.creerEntretienVide(titre)
      const lecture = await api.lireEntretien(id)
      if (!lecture.ok) throw new Error('Entretien de test indisponible')
      const payload = lecture.data
      payload.participations = [{ id: 'local', index: 0, nom, locuteurRef, interviewer: ids.length === 0,
        pseudo: `Pseudo ${ids.length}`, couleur: '#123456', valeursLoc: { [variable.id]: modalite } }]
      payload.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: `Paroles conservées de ${titre}.` }] }] }
      payload.notes = [{ id: 'note-locale', categorieId: 'ncat_generale', titre: `Note ${titre}`, corps: 'Contenu conservé', date: null,
        statut: 'prive', rang: 0, creeLe: '2026-01-01T00:00:00.000Z', modifieLe: null, participationIds: ['local'] }]
      await api.ecrireEntretien(id, payload)
      ids.push(id)
    }
    await api.casCommander({ type: 'creer', cas: { id: 'cas-beta', nom: 'Cas Beta', memo: '', creeLe: '2026-01-01T00:00:00.000Z', modifieLe: '2026-01-01T00:00:00.000Z',
      regles: [{ type: 'locuteur', locuteurId: beta, inclureEnqueteurs: true }], rattachements: [] } })
    return { ids, alpha, beta, gamma }
  }, { alpha, beta, gamma })
}
function lire(dir: string, id: string): EntretienFichier {
  return JSON.parse(readFileSync(join(dir, 'corpus/entretiens', `${id}.json`), 'utf8'))
}
function fichiers(dir: string, ids: string[]) {
  return [join(dir, 'corpus/corpus.crp'), ...ids.map((id) => join(dir, 'corpus/entretiens', `${id}.json`))]
    .map((chemin) => readFileSync(chemin, 'utf8'))
}
async function onglet(page: Page) {
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Locuteurs', exact: true }).click()
  return page.locator('.locuteurs-corpus')
}

test('sélection corpus : annuler, renommer, réunir trois identités, puis dissocier deux entretiens et rouvrir', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-locuteurs-actions-'))
  let app = await lancer(dir)
  try {
    let page = await app.firstWindow()
    await entrerCorpus(page)
    const { ids, alpha } = await preparer(page)
    const avant = ids.map((id) => lire(dir, id))
    const octets = fichiers(dir, ids)
    const panneau = await onglet(page)
    const liste = panneau.getByRole('listbox', { name: 'Locuteurs', exact: true })
    await liste.getByRole('option').filter({ has: page.getByText('Alpha', { exact: true }) }).click()
    await panneau.getByRole('searchbox').fill('Alpha A')
    await panneau.getByRole('button', { name: 'Renommer…', exact: true }).click()
    let dialogue = page.getByRole('dialog', { name: 'Renommer ce locuteur', exact: true })
    await expect(dialogue).toContainText('Alpha B masqué')
    await expect(dialogue.getByRole('button', { name: 'Annuler', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialogue).not.toBeVisible()
    expect(fichiers(dir, ids)).toEqual(octets)
    await panneau.getByRole('button', { name: 'Renommer…', exact: true }).click()
    await dialogue.getByRole('textbox', { name: 'Nouveau nom', exact: true }).fill('Alpha renommé')
    await dialogue.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true }).click()
    await expect(dialogue).not.toBeVisible()
    await expect(liste.locator('[aria-selected=true]')).toHaveCount(1)
    await expect(liste.locator('[aria-selected=true]')).toContainText('Alpha renommé')
    await liste.getByRole('option').filter({ has: page.getByText('Beta', { exact: true }) }).click({ modifiers: ['Control'] })
    await liste.getByRole('option').filter({ has: page.getByText('Gamma', { exact: true }) }).click({ modifiers: ['Control'] })
    await panneau.getByRole('button', { name: 'C’est le même locuteur…', exact: true }).click()
    dialogue = page.getByRole('dialog', { name: 'Réunir les locuteurs sélectionnés', exact: true })
    await expect(dialogue).toContainText('3 locuteurs seront réunis dans 4 entretiens')
    await expect(dialogue.getByRole('button', { name: 'Réunir les locuteurs', exact: true })).toBeDisabled()
    await dialogue.getByRole('textbox', { name: 'Nom commun', exact: true }).fill('Nom commun')
    await dialogue.getByRole('radio', { name: 'Conserver les noms actuels', exact: true }).check()
    await dialogue.getByRole('button', { name: 'Réunir les locuteurs', exact: true }).click()
    await expect(dialogue).not.toBeVisible()
    await expect(liste.locator('[aria-selected=true]')).toHaveCount(1)
    await expect(liste.locator('[aria-selected=true]')).toContainText('Nom commun')
    expect(ids.map((id) => lire(dir, id).participations[0].nom)).toEqual(['Alpha renommé', 'Alpha renommé', 'Beta local', 'Gamma locale'])
    await panneau.getByRole('button', { name: 'Renommer…', exact: true }).click()
    dialogue = page.getByRole('dialog', { name: 'Renommer ce locuteur', exact: true })
    await dialogue.getByRole('textbox', { name: 'Nouveau nom', exact: true }).fill('Nom final')
    await dialogue.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true }).click()
    await expect(liste.locator('[aria-selected=true]')).toContainText('Nom final')
    await panneau.getByRole('button', { name: 'Dissocier…', exact: true }).click()
    dialogue = page.getByRole('dialog', { name: 'Dissocier ce locuteur', exact: true })
    await expect(dialogue.getByRole('textbox')).toHaveCount(0)
    await dialogue.getByRole('checkbox', { name: 'Beta C · Nom final', exact: true }).check()
    await dialogue.getByRole('checkbox', { name: 'Gamma D · Nom final', exact: true }).check()
    await dialogue.getByRole('button', { name: 'Dissocier les entretiens cochés', exact: true }).click()
    await expect(dialogue).not.toBeVisible()
    await expect(liste.locator('[aria-selected=true]')).toHaveCount(3)
    const apres = ids.map((id) => lire(dir, id))
    expect(apres[0].participations[0].locuteurRef).toBe(alpha)
    expect(apres[1].participations[0].locuteurRef).toBe(alpha)
    expect(new Set(apres.map((e) => e.participations[0].locuteurRef)).size).toBe(3)
    for (const [index, entretien] of apres.entries()) {
      expect(entretien.participations[0].nom).toBe('Nom final')
      for (const champ of ['corpsTexte', 'annotations', 'ancres', 'notes', 'meta'] as const) expect(entretien[champ]).toEqual(avant[index][champ])
      const { nom: _nom, locuteurRef: _lien, rapprochementsRefuses: _refus, ...donnees } = entretien.participations[0]
      const { nom: _ancienNom, locuteurRef: _ancienLien, ...anciennes } = avant[index].participations[0]
      expect(donnees).toEqual(anciennes)
    }
    const corpus = JSON.parse(readFileSync(join(dir, 'corpus/corpus.crp'), 'utf8')) as CorpusFichier
    expect(corpus.cas?.['cas-beta'].regles).toEqual([{ type: 'locuteurs', membres: [{ locuteurId: alpha, inclureEnqueteurs: true }] }])
    await app.close()
    app = await lancer(dir)
    page = await app.firstWindow()
    await entrerCorpus(page)
    const rouvert = await onglet(page)
    await expect(rouvert.getByRole('option').filter({ has: page.getByText('Nom final', { exact: true }) })).toHaveCount(3)
    expect(ids.map((id) => lire(dir, id))).toEqual(apres)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('un changement après aperçu refuse la correction sans autre écriture', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-locuteurs-apercu-perime-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const { ids } = await preparer(page)
    const panneau = await onglet(page)
    await panneau.getByRole('option').filter({ has: page.getByText('Alpha', { exact: true }) }).click()
    await panneau.getByRole('button', { name: 'Renommer…', exact: true }).click()
    const dialogue = page.getByRole('dialog', { name: 'Renommer ce locuteur', exact: true })
    await dialogue.getByRole('textbox', { name: 'Nouveau nom', exact: true }).fill('Nom refusé')
    const modifie = lire(dir, ids[1])
    modifie.participations[0].pseudo = 'Modification extérieure'
    writeFileSync(join(dir, 'corpus/entretiens', `${ids[1]}.json`), JSON.stringify(modifie))
    const avant = fichiers(dir, ids)
    await dialogue.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true }).click()
    await expect(dialogue.getByRole('alert')).toContainText('ont changé')
    await expect(dialogue.getByRole('button', { name: 'Renommer dans tous les entretiens', exact: true })).toBeDisabled()
    expect(fichiers(dir, ids)).toEqual(avant)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('un regroupement dans le même entretien est expliqué et ne modifie aucun fichier', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-locuteurs-conflit-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const { ids, beta } = await preparer(page)
    const data = lire(dir, ids[0])
    data.participations.push({ id: 'second-local', index: 1, nom: 'Beta dans Alpha A', locuteurRef: beta, valeursLoc: {} })
    writeFileSync(join(dir, 'corpus/entretiens', `${ids[0]}.json`), JSON.stringify(data))
    const avant = fichiers(dir, ids)
    const panneau = await onglet(page)
    await panneau.getByRole('option').filter({ has: page.getByText('Alpha', { exact: true }) }).click()
    await panneau.getByRole('option').filter({ has: page.getByText('Beta', { exact: true }) }).click({ modifiers: ['Control'] })
    await panneau.getByRole('button', { name: 'C’est le même locuteur…', exact: true }).click()
    const dialogue = page.getByRole('dialog', { name: 'Réunir les locuteurs sélectionnés', exact: true })
    await expect(dialogue.getByRole('alert')).toContainText('même entretien')
    await expect(dialogue.getByRole('button', { name: 'Ouvrir Alpha A', exact: true })).toBeVisible()
    await dialogue.getByRole('radio', { name: 'Conserver les noms actuels', exact: true }).check()
    await expect(dialogue.getByRole('button', { name: 'Réunir les locuteurs', exact: true })).toBeDisabled()
    await dialogue.getByRole('button', { name: 'Annuler', exact: true }).click()
    expect(fichiers(dir, ids)).toEqual(avant)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})
