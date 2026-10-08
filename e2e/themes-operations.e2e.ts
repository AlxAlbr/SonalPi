import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import type {} from '../src/renderer/env'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ouvrirSurCorpus, ouvrirEditionThemes, fermerEditionThemes, retourCorpus, attendreCorpus } from './util'

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  const banc = await ouvrirSurCorpus('sonal-themes-ops-')
  app = banc.app
  page = banc.page
  await page.evaluate(async () => {
    const lecture = await window.sonal.corpus.lireEntretien('e1')
    if (!lecture.ok) throw new Error('Entretien du banc absent')
    const { formatVersion: _version, lastModified: _date, ...payload } = lecture.data
    await window.sonal.corpus.ecrireEntretien('e1', {
      ...payload,
      annotations: [
        { id: 'a', type: 'codage', code: 'cat_001', from: 1, to: 7, auteur: 'test' },
        { id: 'orphelin', type: 'codage', code: 'cat_001', from: 8, to: 8, auteur: 'test' },
        { id: 'existant', type: 'codage', code: 'cat_002', from: 1, to: 7, auteur: 'test' },
        { id: 'anon', type: 'anon', pseudo: 'Martin', etat: 'anonymise', from: 1, to: 7, auteur: 'test' },
        { id: 'commentaire', type: 'commentaire', texte: 'Mémo conservé', from: 1, to: 7, auteur: 'test' },
      ],
    })
  })
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Thèmes', exact: true }).click()
  await expect(page.locator('.themes-ops-corpus')).toBeVisible()
})

test.afterEach(async () => { await app?.close() })

function modale() { return page.getByRole('dialog', { name: /thématique/ }) }
async function lire() {
  return page.evaluate(async () => {
    const c = await window.sonal.corpus.ouvrir()
    const e = await window.sonal.corpus.lireEntretien('e1')
    if (!e.ok) throw new Error('Entretien absent')
    return { corpus: c, annotations: e.data.annotations }
  })
}

async function ouvrirDivision(effacer: boolean) {
  await page.getByRole('button', { name: 'Diviser…', exact: true }).click()
  await modale().getByRole('combobox', { name: 'Thématique source', exact: true }).selectOption('cat_001')
  await modale().getByLabel('Nom de la destination 1').fill('Vie familiale')
  await modale().getByLabel('Nom de la destination 2').fill('Famille élargie')
  if (effacer) await modale().getByLabel('Supprimer la source après répartition complète').check()
  await modale().getByRole('button', { name: 'Préparer la répartition' }).click()
  await modale().getByRole('button', { name: /▸ Entretien Karine/ }).click()
  await expect(modale().getByRole('button', { name: 'Consulter l’entretien', exact: true })).toBeVisible()
}

test('l’atelier remplace les cartes dans Thèmes ; transfert dédupliqué et projections rafraîchies', async () => {
  await expect(page.locator('.colonne-d-corpus')).toBeHidden()
  await expect(page.locator('.liste-thm-lecture')).toBeVisible()
  const avant = await lire()
  await page.getByRole('button', { name: 'Transférer…', exact: true }).click()
  await modale().getByRole('combobox', { name: 'Thématique source', exact: true }).selectOption('cat_001')
  await modale().getByRole('combobox', { name: 'Thématique cible', exact: true }).selectOption('cat_002')
  await expect(modale().getByLabel('Conserver la thématique source')).toBeChecked()
  await modale().getByRole('button', { name: 'Voir l’aperçu', exact: true }).click()
  await expect(modale().locator('.compteurs dd')).toHaveText(['2', '1', '1', '1'])
  expect((await lire()).annotations).toEqual(avant.annotations)
  await expect(page.locator('.entretien-ecran')).toBeHidden()
  await modale().getByRole('button', { name: 'Confirmer et appliquer' }).click()
  await expect(modale()).toContainText('Opération appliquée')
  await expect(modale()).toContainText('1 codage(s) réaffecté(s), 1 doublon(s) retiré(s)')
  const apres = await lire()
  expect(apres.corpus.codebook.cat_001).toBeDefined()
  expect(apres.annotations.filter((a) => a.type === 'codage').map((a) => a.code)).toEqual(['cat_002', 'cat_002'])
  expect(apres.annotations.filter((a) => a.type !== 'codage')).toEqual(avant.annotations.filter((a) => a.type !== 'codage'))
  await modale().getByRole('button', { name: 'Fermer le bilan' }).click()
  await expect(page.locator('.liste-thm-lecture li', { hasText: 'Travail' }).locator('.usage')).toHaveText('2')
  await retourCorpus(page)
  await expect(page.locator('.colonne-d-corpus')).toBeVisible()
  await expect(page.locator('.carte-ent .xtr-graph').first()).toHaveAttribute('title', 'Travail')
})

test('le transfert peut retirer la thématique source', async () => {
  await page.getByRole('button', { name: 'Transférer…', exact: true }).click()
  await modale().getByRole('combobox', { name: 'Thématique source', exact: true }).selectOption('cat_001')
  await modale().getByRole('combobox', { name: 'Thématique cible', exact: true }).selectOption('cat_002')
  await modale().getByLabel('Conserver la thématique source').uncheck()
  await modale().getByRole('button', { name: 'Voir l’aperçu', exact: true }).click()
  await expect(modale()).toContainText('La source sera retirée après les réaffectations.')
  await modale().getByRole('button', { name: 'Confirmer et appliquer' }).click()
  await expect(modale()).toContainText('Opération appliquée')
  expect((await lire()).corpus.codebook.cat_001).toBeUndefined()
})

test('le focus reste dans la modale à chaque étape ; Échap revient au lanceur', async () => {
  const lanceur = page.getByRole('button', { name: 'Transférer…', exact: true })
  await lanceur.click()
  await modale().getByRole('combobox', { name: 'Thématique source', exact: true }).selectOption('cat_001')
  await modale().getByRole('combobox', { name: 'Thématique cible', exact: true }).selectOption('cat_002')
  const suivant = modale().getByRole('button', { name: 'Voir l’aperçu', exact: true })
  await suivant.focus()
  await suivant.press('Tab')
  await expect(modale().getByRole('button', { name: 'Fermer l’opération' })).toBeFocused()
  await modale().getByRole('button', { name: 'Fermer l’opération' }).press('Shift+Tab')
  await expect(suivant).toBeFocused()
  await suivant.click()
  await expect(modale().locator('.compteurs')).toBeVisible()
  await modale().press('Shift+Tab')
  await expect(modale().getByRole('button', { name: 'Confirmer et appliquer' })).toBeFocused()
  await modale().press('Escape')
  await expect(modale()).toHaveCount(0)
  await expect(lanceur).toBeFocused()
})

test('changer de corpus vide un ancien atelier conservé pendant la consultation', async () => {
  await ouvrirDivision(false)
  await modale().getByRole('radio', { name: 'Attribuer a à Vie familiale', exact: true }).check()
  await modale().getByRole('button', { name: 'Consulter l’entretien', exact: true }).click()
  await expect(page.locator('.entretien-ecran')).toBeVisible()
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  const dir = mkdtempSync(join(tmpdir(), 'sonal-themes-autre-'))
  await app.evaluate(({ dialog }, chemin) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chemin] })
  }, dir)
  await page.locator('.carte-demo.ouvrir-corpus').click()
  await attendreCorpus(page)
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Thèmes', exact: true }).click()
  await expect(page.locator('.liste-thm-lecture li')).toHaveCount(4)
  await expect(modale()).toHaveCount(0)
  await page.getByRole('button', { name: 'Diviser…', exact: true }).click()
  await expect(modale().getByRole('combobox', { name: 'Thématique source', exact: true })).toHaveValue('')
  await expect(modale().getByLabel('Nom de la destination 1')).toHaveValue('')
})

test('transfert vers une catégorie nouvelle : création au parent demandé et source conservée', async () => {
  await page.getByRole('button', { name: 'Transférer…', exact: true }).click()
  await modale().getByRole('combobox', { name: 'Thématique source', exact: true }).selectOption('cat_001')
  await modale().getByLabel('Créer une nouvelle thématique cible').check()
  await modale().getByLabel('Nom de la nouvelle thématique', { exact: true }).fill('Nouveau classement')
  await modale().getByRole('combobox', { name: 'Parent de la nouvelle thématique' }).selectOption('cat_003')
  await modale().getByRole('button', { name: 'Voir l’aperçu', exact: true }).click()
  await modale().getByRole('button', { name: 'Confirmer et appliquer' }).click()
  await expect(modale()).toContainText('Opération appliquée')
  const apres = await lire()
  const nouvelle = Object.values(apres.corpus.codebook).find((c) => c.nom === 'Nouveau classement')!
  expect(nouvelle.id).toMatch(/^cat-/)
  expect(nouvelle.parent).toBe('cat_003')
  expect(apres.corpus.codebook.cat_001).toBeDefined()
  expect(apres.annotations.filter((a) => a.code === nouvelle.id)).toHaveLength(2)
})

test('fusion : sous-thème descendant exclu, déplacement annoncé puis appliqué', async () => {
  await ouvrirEditionThemes(page)
  await page.locator('.liste-thm li[data-nom="Famille"] .mini-sous').click()
  const enfant = page.locator('.liste-thm li[data-nom="Nouveau sous-thème"] .nom-thm')
  await enfant.fill('Enfant de Famille')
  await enfant.press('Enter')
  await expect(page.locator('.liste-thm li[data-nom="Enfant de Famille"]')).toHaveCount(1)
  await fermerEditionThemes(page)
  await page.getByRole('button', { name: 'Fusionner…', exact: true }).click()
  await modale().getByRole('combobox', { name: 'Thématique source', exact: true }).selectOption('cat_001')
  await expect(modale().getByRole('combobox', { name: 'Thématique cible', exact: true }).locator('option', { hasText: 'Enfant de Famille' })).toHaveCount(0)
  await modale().getByRole('combobox', { name: 'Thématique cible', exact: true }).selectOption('cat_002')
  await modale().getByRole('button', { name: 'Voir l’aperçu', exact: true }).click()
  await expect(modale()).toContainText('1 sous-thème(s) direct(s) seront déplacés')
  await modale().getByRole('button', { name: 'Confirmer et appliquer' }).click()
  await expect(modale()).toContainText('Opération appliquée')
  const apres = await lire()
  expect(apres.corpus.codebook.cat_001).toBeUndefined()
  expect(Object.values(apres.corpus.codebook).find((c) => c.nom === 'Enfant de Famille')?.parent).toBe('cat_002')
})

test('division destructive : raccourci de ligne, orphelin obligatoire et parents finaux valides', async () => {
  await ouvrirDivision(true)
  await expect(modale().getByRole('button', { name: 'Voir l’aperçu final' })).toBeDisabled()
  const passage = modale().locator('.passage').filter({ hasText: 'Karine' })
  await passage.focus()
  await passage.press('1')
  await expect(modale().getByRole('radio', { name: 'Attribuer a à Vie familiale', exact: true })).toBeChecked()
  await expect(modale().getByRole('button', { name: 'Voir l’aperçu final' })).toBeDisabled()
  await expect(modale()).toContainText('codage orphelin')
  await modale().getByRole('radio', { name: 'Attribuer orphelin à Famille élargie', exact: true }).check()
  await modale().getByRole('button', { name: 'Voir l’aperçu final' }).click()
  await expect(modale().getByRole('button', { name: 'Confirmer et appliquer' })).toBeEnabled()
  await modale().getByRole('button', { name: 'Confirmer et appliquer' }).click()
  await expect(modale()).toContainText('Opération appliquée')
  const apres = await lire()
  expect(apres.corpus.codebook.cat_001).toBeUndefined()
  const nouvelles = Object.values(apres.corpus.codebook).filter((c) => ['Vie familiale', 'Famille élargie'].includes(c.nom))
  expect(nouvelles).toHaveLength(2)
  expect(nouvelles.every((c) => c.parent === null)).toBe(true)
  expect(apres.annotations.find((a) => a.id === 'orphelin')?.code).toBe(nouvelles.find((c) => c.nom === 'Famille élargie')!.id)
})

test('division avec source conservée : codages non répartis conservés et nouvelles catégories enfants', async () => {
  await ouvrirDivision(false)
  await modale().getByRole('radio', { name: 'Attribuer a à Vie familiale', exact: true }).check()
  await modale().getByRole('button', { name: 'Voir l’aperçu final' }).click()
  await expect(modale()).toContainText('1 codage(s) resteront sur la source')
  await modale().getByRole('button', { name: 'Confirmer et appliquer' }).click()
  await expect(modale()).toContainText('Opération appliquée')
  const apres = await lire()
  expect(apres.corpus.codebook.cat_001).toBeDefined()
  expect(apres.annotations.find((a) => a.id === 'orphelin')?.code).toBe('cat_001')
  const nouvelles = Object.values(apres.corpus.codebook).filter((c) => ['Vie familiale', 'Famille élargie'].includes(c.nom))
  expect(nouvelles).toHaveLength(2)
  expect(nouvelles.every((c) => c.parent === 'cat_001')).toBe(true)
})

test('la consultation conserve l’atelier mais invalide l’aperçu ; aucun choix obsolète n’est réinventé', async () => {
  await ouvrirDivision(false)
  await modale().getByRole('radio', { name: 'Attribuer a à Vie familiale', exact: true }).check()
  await modale().getByRole('button', { name: 'Consulter l’entretien', exact: true }).click()
  await expect(page.locator('.entretien-ecran')).toBeVisible()
  await retourCorpus(page)
  await page.evaluate(async () => {
    const lecture = await window.sonal.corpus.lireEntretien('e1')
    if (!lecture.ok) throw new Error('Entretien absent')
    const { formatVersion: _version, lastModified: _date, ...payload } = lecture.data
    await window.sonal.corpus.ecrireEntretien('e1', { ...payload,
      annotations: [...payload.annotations, { id: 'nouveau', type: 'codage', code: 'cat_001', from: 2, to: 4, auteur: 'test' }],
    })
  })
  await expect(modale()).toBeVisible()
  await expect(modale()).toContainText('L’aperçu doit être recalculé')
  await expect(modale().getByRole('button', { name: 'Voir l’aperçu final' })).toBeDisabled()
  await modale().getByRole('button', { name: 'Recalculer avec les choix' }).click()
  await expect(modale().getByRole('alert')).toContainText('a changé')
  await modale().getByRole('button', { name: 'Repartir de l’état actuel' }).click()
  await expect(modale()).toContainText('3 codage(s) sans destination sur 3')
  await modale().getByRole('button', { name: /▸ Entretien Karine/ }).click()
  await expect(modale().getByRole('radio', { name: 'Conserver a sur la source', exact: true })).toBeChecked()
})
