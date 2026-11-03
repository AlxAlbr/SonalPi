import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, retourCorpus, selectionner } from './util'
import { choisirDossierExemple, configurerSourcesExemples } from './exemples-util'

async function texteTranscription(page: Page): Promise<string> {
  return page.locator('.editeur').evaluate((editeur) => {
    const copie = editeur.cloneNode(true) as HTMLElement
    copie.querySelectorAll('.gouttiere-loc').forEach((libelle) => libelle.remove())
    return (copie.textContent ?? '').replace(/\s+/g, ' ').trim()
  })
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
    const liste = page.locator('.liste-loc li')
    await expect(liste).toHaveCount(2)
    await expect(page.locator('.nom-loc').nth(0)).toHaveValue('Speaker 1')
    await expect(page.locator('.nom-loc').nth(1)).toHaveValue('Speaker 0')
    const texteInitial = await texteTranscription(page)

    await liste.nth(0).locator('.nom-loc').fill('Enquêteur')
    await liste.nth(0).locator('.nom-loc').press('Tab')
    await expect(liste.nth(0).locator('.interv input')).not.toBeChecked()
    await liste.nth(0).locator('.interv').click()
    await expect(liste.nth(0).locator('.interv input')).toBeChecked()
    await expect(page.locator('.editeur .bloc-interviewer').first()).toContainText('merci beaucoup de me recevoir')
    await expect(page.locator('.editeur .loc-nom').first()).toHaveText('Enquêteur ?')
    await liste.nth(0).locator('.interv').click()
    await expect(page.locator('.editeur .bloc-interviewer')).toHaveCount(0)
    await liste.nth(0).locator('.interv').click()

    await liste.nth(1).locator('.nom-loc').fill('Fatima')
    await liste.nth(1).locator('.nom-loc').press('Tab')
    await expect(page.getByRole('status').filter({ hasText: 'Personne « Fatima » créée' })).toBeVisible()
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
      await page.locator('.entretien-ecran .panneau:visible').screenshot({ path: 'docs/user/medias/locuteurs-entretien.png' })
    }

    const statistiques = page.getByRole('button', { name: '📊 Statistiques', exact: true })
    await statistiques.click()
    await expect(page.locator('.stats-locuteurs .liste-stats-loc li')).toHaveCount(2)
    await expect(page.locator('.stats-locuteurs')).toContainText('Fatima')
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.stats-locuteurs').screenshot({ path: 'docs/user/medias/statistiques-locuteurs.png' })
    }
    await statistiques.click()
    await expect(page.locator('.stats-locuteurs')).toHaveCount(0)

    await page.getByRole('button', { name: '+ Locuteur', exact: true }).click()
    await expect(liste).toHaveCount(3)
    await liste.nth(2).locator('.x-loc').click()
    await expect(liste).toHaveCount(2)
    await expect(page.locator('.confirm-suppr')).toHaveCount(0)
    await page.getByRole('button', { name: '+ Locuteur', exact: true }).click()
    await liste.nth(2).locator('.nom-loc').fill('Autre bénévole')
    await liste.nth(2).locator('.nom-loc').press('Tab')
    await expect(page.getByRole('status').filter({ hasText: 'Personne « Autre bénévole » créée' })).toBeVisible()
    const personneAvant = await page.evaluate(async () =>
      (await window.sonal.corpus.personnesInventaire()).personnes.find((p) => p.nom === 'Autre bénévole')?.id)
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
    await expect(liste).toHaveCount(3)
    await page.locator('.boutons-loc').getByRole('button', { name: 'Autre bénévole', exact: true }).click()
    await expect(attribue).toContainText(phrase)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await retourCorpus(page)
    await carte.locator('.crayon').click()
    await page.locator('[data-onglet="locuteurs"]').click()
    await expect(attribue).toContainText(phrase)
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
    await retourCorpus(page)
    expect(await page.evaluate(async (id) =>
      (await window.sonal.corpus.personnesInventaire()).personnes.some((p) => p.id === id), personneAvant)).toBe(true)
    await carte.locator('.crayon').click()
    await page.locator('[data-onglet="locuteurs"]').click()
    await expect(liste).toHaveCount(2)
    await expect(page.locator('.editeur p[data-loc="3"]')).toHaveCount(0)
    expect(await texteTranscription(page)).toBe(texteInitial)
  } finally {
    await app.close()
  }
})
