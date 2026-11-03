import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import { lancer, attendreAccueil, selectionner, retourCorpus } from './util'
import { choisirDossierExemple, configurerSourcesExemples } from './exemples-util'

async function ouvrirCopieExemple(page: Page, dossier: string, app: Awaited<ReturnType<typeof lancer>>) {
  await attendreAccueil(page)
  await configurerSourcesExemples(app, join(dossier, '..', 'sources'))
  await choisirDossierExemple(app, dossier)
  await page.locator('.carte-demo.exemples').click()
  await page.locator('.exemple').filter({
    has: page.getByRole('heading', { name: 'Entretiens déjà importés', exact: true }),
  }).getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
  await page.locator('.installation-exemple').getByRole('button', { name: 'Modifier…', exact: true }).click()
  await page.locator('.installation-exemple').getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
}

async function clicDroit(page: Page, cible: ReturnType<Page['locator']>) {
  await cible.scrollIntoViewIfNeeded()
  const boite = await cible.boundingBox()
  if (!boite) throw new Error('Occurrence sans position visible.')
  // Le pseudo est rendu après le texte par CSS ; viser le début garde le clic
  // sur les caractères réellement couverts par l’annotation.
  await page.mouse.click(boite.x + Math.min(boite.width / 4, 4), boite.y + boite.height / 2, { button: 'right' })
}

test('manuel : pseudonymiser Fatima, poser une exception et contrôler la règle dans le corpus', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-pseudonymisation-'))
  const dossier = join(racine, 'exemple')
  const app = await lancer(join(racine, 'profil'), { executablePath: process.env.PSEUDONYMISATION_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await ouvrirCopieExemple(page, dossier, app)

    const corpus = JSON.parse(readFileSync(join(dossier, 'corpus.json'), 'utf8')) as CorpusFichier
    const id = Object.entries(corpus.membership).find(([, ref]) => ref.titre === '1Coordinatrice')![0]
    const fichier = join(dossier, 'entretiens', `${id}.json`)
    const lire = () => JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier
    const avant = lire()

    await page.locator('.carte-ent').filter({ hasText: '1Coordinatrice' }).locator('.crayon').click()
    await page.locator('[data-onglet="anon"]').click()
    await selectionner(page, 'Fatima')
    await page.locator('.editeur').dispatchEvent('mouseup')
    const saisie = page.locator('.ligne-anon.saisie-anon').first()
    await expect(saisie.locator('.nom-saisie')).toHaveValue('Fatima')
    await saisie.locator('.pseudo-anon').fill('Nadia')
    await saisie.getByTitle('Anonymiser toutes les occurrences').click()

    const ligne = page.locator('.ligne-anon', { hasText: 'Fatima' }).first()
    await expect(page.locator('.editeur .anon')).toHaveCount(2)
    await expect(ligne.locator('.cpt-anon')).toHaveText('2')
    await ligne.getByTitle('Corpus — règle d’anonymisation partagée du corpus').click()
    await expect(ligne.locator('.portee-corpus')).toHaveClass(/portee-corpus/)
    await expect(ligne.locator('.portee-cran.corpus')).toHaveClass(/actif/)

    await clicDroit(page, page.locator('.editeur .anon').last())
    await page.getByRole('menuitem', { name: 'Laisser en clair (exception)', exact: true }).click()
    await expect(page.locator('.editeur .anon')).toHaveCount(1)
    await expect(page.locator('.editeur .anon-exception')).toHaveCount(1)
    await expect(ligne.locator('.cpt-anon')).toHaveText('1')
    await expect(ligne.locator('.cpt-exc')).toHaveText('1')
    await expect(page.locator('.tete .etat')).toHaveText('à jour')

    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.editeur .anon').scrollIntoViewIfNeeded()
      await page.screenshot({ path: 'docs/user/medias/pseudonymisation-entretien.png' })
    }

    const apresEntretien = lire()
    expect(apresEntretien.corpsTexte).toEqual(avant.corpsTexte)
    expect(apresEntretien.ancres).toEqual(avant.ancres)
    expect(apresEntretien.locuteurs).toEqual(avant.locuteurs)
    expect(apresEntretien.annotations.filter((annotation) => annotation.type === 'anon')).toEqual([
      expect.objectContaining({ pseudo: 'Nadia', etat: 'anonymise', regle: expect.any(String) }),
      expect.objectContaining({ pseudo: 'Nadia', etat: 'exception', regle: expect.any(String) }),
    ])

    await retourCorpus(page)
    await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
    await expect(page.locator('.pseudo-table tbody tr', { hasText: 'Fatima' })).toBeVisible()
    const regle = page.locator('.pseudo-table tbody tr', { hasText: 'Fatima' })
    await regle.getByRole('button', { name: 'Voir les entretiens pour Fatima', exact: true }).click()
    await page.locator('.acc-tete').filter({ hasText: '1Coordinatrice' }).getByRole('button').click()
    await expect(page.locator('.occ-list .occ')).toHaveCount(2)
    await expect(page.locator('.occ-list .occ-anon')).toHaveCount(1)
    await expect(page.locator('.occ-list .occ-exc')).toHaveCount(1)
    await expect(page.locator('.occ-pseudo')).toHaveText('[Nadia]')

    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.pseudo-panneau').screenshot({ path: 'docs/user/medias/verification-pseudonymisation.png' })
    }

    let exception = page.locator('.occ-list .occ').last()
    await exception.getByRole('button', { name: /Retirer l’exception/ }).click()
    await expect(exception).toHaveClass(/occ-non/)
    await page.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(page.locator('.pseudo-message')).toContainText('changement(s) enregistré(s)')
    await expect(page.locator('.occ-list .occ-non')).toHaveCount(1)

    exception = page.locator('.occ-list .occ-non')
    await exception.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(page.locator('.occ-list .occ-anon')).toHaveCount(2)

    exception = page.locator('.occ-list .occ').last()
    await exception.getByTitle('Marquer comme exception (ne pas anonymiser)').click()
    await page.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(page.locator('.occ-list .occ-exc')).toHaveCount(1)

    const apresControle = lire()
    expect(apresControle.corpsTexte).toEqual(avant.corpsTexte)
    expect(apresControle.annotations.filter((annotation) => annotation.type === 'anon')).toHaveLength(2)
    expect(JSON.parse(readFileSync(join(dossier, 'corpus.json'), 'utf8')).reglesAnon).toBeTruthy()
  } finally {
    await app.close()
  }
})

test('manuel : deux pseudonymes se choisissent occurrence par occurrence dans l’entretien', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-variantes-'))
  const dossier = join(racine, 'exemple')
  const app = await lancer(join(racine, 'profil'), { executablePath: process.env.PSEUDONYMISATION_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await ouvrirCopieExemple(page, dossier, app)
    await page.locator('.carte-ent').filter({ hasText: '1Coordinatrice' }).locator('.crayon').click()
    await page.locator('[data-onglet="anon"]').click()
    await selectionner(page, 'Fatima')
    await page.locator('.editeur').dispatchEvent('mouseup')
    const saisie = page.locator('.ligne-anon.saisie-anon').first()
    await expect(saisie.locator('.nom-saisie')).toHaveValue('Fatima')
    await saisie.locator('.pseudo-anon').fill('Nadia / Amina')
    await saisie.getByTitle('Anonymiser toutes les occurrences').click()
    await expect(page.locator('.editeur .anon')).toHaveCount(2)

    await clicDroit(page, page.locator('.editeur .anon').last())
    await page.getByRole('menuitem', { name: '↺ Anonymiser plutôt comme « Amina »', exact: true }).click()
    await expect(page.locator('.editeur .anon[data-pseudo="Nadia"]')).toHaveCount(1)
    await expect(page.locator('.editeur .anon[data-pseudo="Amina"]')).toHaveCount(1)
    const ligne = page.locator('.ligne-anon', { hasText: 'Fatima' }).first()
    await expect(ligne.locator('.cpt-variante', { hasText: 'Nadia' }).locator('.cpt-anon')).toHaveText('1')
    await expect(ligne.locator('.cpt-variante', { hasText: 'Amina' }).locator('.cpt-anon')).toHaveText('1')
  } finally {
    await app.close()
  }
})
