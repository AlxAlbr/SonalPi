import { test, expect, type Page, type Locator } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, retourCorpus, selectionner, ouvrirDetailsLocuteurs } from './util'
import { choisirDossierExemple, configurerSourcesExemples } from './exemples-util'

async function texteTranscription(page: Page): Promise<string> {
  return page.locator('.editeur').evaluate((editeur) => {
    const copie = editeur.cloneNode(true) as HTMLElement
    copie.querySelectorAll('.gouttiere-loc').forEach((libelle) => libelle.remove())
    return (copie.textContent ?? '').replace(/\s+/g, ' ').trim()
  })
}

async function nommer(page: Page, champ: Locator, nom: string) {
  await champ.fill(nom); await champ.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: `Locuteur « ${nom} » créé` })).toBeVisible()
  await expect(champ).toHaveValue(nom)
}

test('manuel : identifier les voix, attribuer une sélection puis supprimer sans effacer les paroles', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-locuteurs-'))
  const app = await lancer(join(racine, 'profil'), { executablePath: process.env.STATS_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await attendreAccueil(page)
    await configurerSourcesExemples(app, join(racine, 'sources'))
    await choisirDossierExemple(app, join(racine, 'exemple'))
    await page.locator('.carte-demo.exemples').click()
    await page.locator('.exemple').filter({
      has: page.getByRole('heading', { name: 'Entretiens déjà importés', exact: true }),
    }).getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Modifier…', exact: true }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
    await expect(page.locator('.carte-ent')).toHaveCount(4)
    const carte = page.locator('.carte-ent').filter({ hasText: '1Coordinatrice' })
    await carte.locator('.crayon').click()
    await page.locator('[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs' }).click()
    await expect(page.getByRole('dialog', { name: 'Gestion des locuteurs' })).toBeVisible()
    const liste = page.locator('.liste-loc li')
    await expect(liste).toHaveCount(2)
    await expect(page.locator('.nom-loc').nth(0)).toHaveValue('Speaker 1')
    await expect(page.locator('.nom-loc').nth(1)).toHaveValue('Speaker 0')
    const texteInitial = await texteTranscription(page)

    await nommer(page, liste.nth(0).locator('.nom-loc'), 'Enquêteur')
    await expect(liste.nth(0).locator('.interv input')).not.toBeChecked()
    await liste.nth(0).locator('.interv').click()
    await expect(liste.nth(0).locator('.interv input')).toBeChecked()
    await expect(page.locator('.editeur .bloc-interviewer').first()).toContainText('merci beaucoup de me recevoir')
    await expect(page.locator('.editeur .loc-nom').first()).toHaveText('Enquêteur ?')
    await liste.nth(0).locator('.interv').click()
    await expect(page.locator('.editeur .bloc-interviewer')).toHaveCount(0)
    await liste.nth(0).locator('.interv').click()

    await nommer(page, liste.nth(1).locator('.nom-loc'), 'Fatima')
    const pseudo = liste.nth(1).locator('.pseudo-loc')
    await pseudo.fill('Nadia')
    await pseudo.press('Tab')
    await expect(page.locator('.editeur .loc-pseudo').first()).toHaveText('[Nadia]')
    await expect(page.locator('.editeur .loc-anon .loc-nom').first()).toHaveText('Fatima')
    await expect(page.locator('.editeur')).toContainText("moi c'est Fatima")
    await pseudo.fill('')
    await pseudo.press('Tab')
    await expect(page.locator('.editeur .loc-pseudo')).toHaveCount(0)
    await pseudo.fill('Nadia')
    await pseudo.press('Tab')
    await liste.nth(1).locator('.carre-couleur').evaluate((champ: HTMLInputElement) => {
      champ.value = '#21805a'
      champ.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.locator('.editeur .loc-anon .loc-nom').first()).toHaveCSS('color', 'rgb(33, 128, 90)')
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    expect(await texteTranscription(page)).toBe(texteInitial)
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.modale-locuteurs').screenshot({ path: 'docs/user/medias/locuteurs-entretien.png' })
    }

    await page.getByRole('button', { name: 'Fermer la gestion des locuteurs' }).click()
    const statistiques = page.locator('.statistiques-locuteurs > summary')
    await statistiques.click()
    await expect(page.locator('.stats-locuteurs .liste-stats-loc li')).toHaveCount(2)
    await expect(page.locator('.stats-locuteurs')).toContainText('Fatima')
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.stats-locuteurs').screenshot({ path: 'docs/user/medias/statistiques-locuteurs.png' })
    }
    await statistiques.click()
    await expect(page.locator('.stats-locuteurs')).toHaveCount(0)

    await page.getByRole('button', { name: 'Modifier les locuteurs' }).click()
    await page.getByRole('button', { name: '+ Locuteur', exact: true }).click()
    await expect(liste).toHaveCount(3)
    await liste.nth(2).locator('.x-loc').click()
    await expect(liste).toHaveCount(2)
    await expect(page.locator('.confirm-suppr')).toHaveCount(0)
    await page.getByRole('button', { name: '+ Locuteur', exact: true }).click()
    await liste.nth(2).locator('.nom-loc').fill('Autre bénévole')
    await liste.nth(2).locator('.nom-loc').press('Tab')
    await expect(page.getByRole('status').filter({ hasText: 'Locuteur « Autre bénévole » créé' })).toBeVisible()
    await page.getByRole('button', { name: 'Fermer la gestion des locuteurs' }).click()
    const personneAvant = await page.evaluate(async () =>
      (await window.sonal.corpus.personnesInventaire()).locuteurs.find((p) => p.nom === 'Autre bénévole')?.id)
    expect(personneAvant).toBeTruthy()

    const phrase = "surtout pour l'aide aux devoirs"
    await selectionner(page, phrase)
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(phrase)
    await page.locator('.boutons-loc').getByRole('button', { name: 'Autre bénévole', exact: true }).click()
    const attribue = page.locator('.editeur p[data-loc="3"]')
    await expect(attribue).toContainText(phrase)
    await expect(attribue).not.toContainText('Je suis bénévole')
    expect(await texteTranscription(page)).toBe(texteInitial)

    await attribue.locator('.gouttiere-loc').click()
    await page.locator('.boutons-loc').getByRole('button', { name: 'aucun', exact: true }).click()
    await expect(page.locator('.editeur p[data-loc="3"]')).toHaveCount(0)
    await expect(page.locator('.boutons-loc .choix-loc')).toHaveCount(3)
    await page.locator('.boutons-loc').getByRole('button', { name: 'Autre bénévole', exact: true }).click()
    await expect(attribue).toContainText(phrase)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await retourCorpus(page)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Locuteurs', exact: true }).click()
    const corpus = page.locator('.locuteurs-corpus')
    await corpus.getByRole('option').filter({ has: page.getByText('Fatima', { exact: true }) }).click()
    if (process.env.SONAL_DOC_CAPTURES === '1') await corpus.screenshot({ path: 'docs/user/medias/locuteurs-corpus.png' })
    await ouvrirDetailsLocuteurs(page)
    await expect(corpus.locator('.details-locuteurs')).toContainText('Fatima')
    if (process.env.SONAL_DOC_CAPTURES === '1') await corpus.locator('.details-locuteurs').screenshot({ path: 'docs/user/medias/locuteurs-details.png' })
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Entretiens', exact: true }).click()
    await carte.locator('.crayon').click()
    await page.locator('[data-onglet="locuteurs"]').click()
    await expect(attribue).toContainText(phrase)
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    await expect(liste.nth(0).locator('.nom-loc')).toHaveValue('Enquêteur')
    await expect(liste.nth(0).locator('.interv input')).toBeChecked()
    await expect(liste.nth(1).locator('.pseudo-loc')).toHaveValue('Nadia')
    await expect(liste.nth(1).locator('.carre-couleur')).toHaveValue('#21805a')

    await liste.nth(2).locator('.x-loc').click()
    const confirmation = page.locator('.confirm-suppr')
    await expect(confirmation).toContainText('1 bloc(s)')
    await confirmation.getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(liste).toHaveCount(3)
    await expect(attribue).toContainText(phrase)
    await liste.nth(2).locator('.x-loc').click()
    await confirmation.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(liste).toHaveCount(2)
    await expect(page.locator('.editeur p[data-loc="3"]')).toHaveCount(0)
    expect(await texteTranscription(page)).toBe(texteInitial)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await page.getByRole('button', { name: 'Fermer la gestion des locuteurs', exact: true }).click()
    await retourCorpus(page)
    expect(await page.evaluate(async (id) =>
      (await window.sonal.corpus.personnesInventaire()).locuteurs.some((p) => p.id === id), personneAvant)).toBe(true)
    await carte.locator('.crayon').click()
    await page.locator('[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    await expect(liste).toHaveCount(2)
    await expect(page.locator('.editeur p[data-loc="3"]')).toHaveCount(0)
    expect(await texteTranscription(page)).toBe(texteInitial)
  } finally {
    await app.close()
  }
})
