import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CorpusFichier } from '../src/shared/format'
import {
  lancer, attendreAccueil, selectionner, retourCorpus, ouvrir,
  ouvrirEditionThemes, fermerEditionThemes, coderTheme,
} from './util'
import { choisirDossierExemple, configurerSourcesExemples } from './exemples-util'

const ligne = (page: Page, nom: string) => page.locator(`.liste-thm li[data-nom="${nom}"]`)

async function nommerNouveau(page: Page, nom: string, enfant = false) {
  const champ = ligne(page, enfant ? 'Nouveau sous-thème' : 'Nouveau thème').locator('.nom-thm')
  await champ.fill(nom)
  await champ.press('Enter')
  await expect(ligne(page, nom)).toBeVisible()
}

test('manuel : décrire, organiser et désactiver les thèmes sans modifier les codages existants', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-themes-'))
  const dossier = join(racine, 'exemple')
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await attendreAccueil(page)
    await configurerSourcesExemples(app, join(racine, 'sources'))
    await choisirDossierExemple(app, dossier)
    await page.locator('.carte-demo.exemples').click()
    await page.locator('.exemple').filter({
      has: page.getByRole('heading', { name: 'Entretiens déjà importés', exact: true }),
    }).getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Modifier…', exact: true }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
    await expect(page.locator('.carte-ent')).toHaveCount(4)
    await page.locator('.carte-ent').filter({ hasText: '1Coordinatrice' }).locator('.crayon').click()
    await page.locator('[data-onglet="themes"]').click()
    await ouvrirEditionThemes(page)
    await page.locator('.modale-themes').getByRole('button', { name: '+ Thème', exact: true }).click()
    await nommerNouveau(page, 'Engagement bénévole')
    for (const nom of ['Motivations', 'Parcours']) {
      await ligne(page, 'Engagement bénévole').locator('.mini-sous').click()
      await nommerNouveau(page, nom, true)
    }
    await ligne(page, 'Motivations').getByRole('button', { name: 'Ajouter une description à Motivations' }).click()
    const description = 'Coder les raisons de devenir bénévole. Exclure les tâches réalisées.'
    await ligne(page, 'Motivations').locator('.description-thm').fill(description)
    await ligne(page, 'Motivations').locator('.description-thm').press('Tab')
    await expect(ligne(page, 'Motivations').getByRole('button', { name: 'Modifier la description de Motivations' })).toBeVisible()
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.modale-themes').screenshot({ path: 'docs/user/medias/edition-themes.png' })
    }

    const noms = () => page.locator('.liste-thm li').evaluateAll((elements) => elements.map((e) => e.getAttribute('data-nom')))
    await ligne(page, 'Parcours').getByTitle('Monter', { exact: true }).click()
    await expect.poll(async () => (await noms()).indexOf('Parcours') < (await noms()).indexOf('Motivations')).toBe(true)
    await ligne(page, 'Parcours').getByTitle('Descendre', { exact: true }).click()
    await expect.poll(async () => (await noms()).indexOf('Parcours') > (await noms()).indexOf('Motivations')).toBe(true)
    await ligne(page, 'Engagement bénévole').locator('.depliant').click()
    await expect(ligne(page, 'Motivations')).toHaveCount(0)
    await ligne(page, 'Engagement bénévole').locator('.depliant').click()
    await expect(ligne(page, 'Motivations')).toBeVisible()

    await page.locator('.modale-themes').getByRole('button', { name: '+ Thème', exact: true }).click()
    await nommerNouveau(page, 'Vie associative')
    await ligne(page, 'Engagement bénévole').locator('.migrer').click()
    for (const nom of ['Motivations', 'Parcours', 'Engagement bénévole']) {
      await expect(page.locator('.dest-migration').getByRole('option', { name: nom, exact: true })).toHaveCount(0)
    }
    await page.locator('.confirm-actions').getByRole('button', { name: 'Annuler', exact: true }).click()
    await ligne(page, 'Engagement bénévole').locator('.migrer').click()
    await page.locator('.dest-migration').selectOption({ label: 'Vie associative' })
    await page.locator('.confirm-actions').getByRole('button', { name: 'Déplacer', exact: true }).click()
    await expect(ligne(page, 'Engagement bénévole')).toHaveAttribute('style', /padding-left:\s*1\.1rem/)
    await expect(ligne(page, 'Motivations')).toHaveAttribute('style', /padding-left:\s*2\.2rem/)
    await ligne(page, 'Engagement bénévole').locator('.migrer').click()
    await page.locator('.dest-migration').selectOption('')
    await page.locator('.confirm-actions').getByRole('button', { name: 'Déplacer', exact: true }).click()
    await expect(ligne(page, 'Motivations')).toHaveAttribute('style', /padding-left:\s*1\.1rem/)
    await fermerEditionThemes(page)

    await page.getByRole('button', { name: 'Afficher la description de Motivations', exact: true }).click()
    await expect(page.locator('.description-theme')).toHaveText(description)
    await expect(page.locator('.editeur .annot')).toHaveCount(0)
    await page.getByRole('button', { name: 'Masquer toutes les descriptions', exact: true }).click()
    await expect(page.locator('.description-theme')).toHaveCount(0)
    await page.getByRole('button', { name: 'Afficher toutes les descriptions', exact: true }).click()
    await expect(page.locator('.description-theme')).toHaveText(description)
    await selectionner(page, "Je suis bénévole à la Maison des Habitants, surtout pour l'aide aux devoirs")
    await coderTheme(page, 'Motivations')
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await expect(page.locator('.editeur .annot')).toHaveAttribute('title', 'Motivations')

    const lireCorpus = () => JSON.parse(readFileSync(join(dossier, 'corpus.json'), 'utf8')) as CorpusFichier
    const id = Object.entries(lireCorpus().membership).find(([, ref]) => ref.titre === '1Coordinatrice')![0]
    const fichier = join(dossier, 'entretiens', `${id}.json`)
    const avant = readFileSync(fichier, 'utf8')
    await ouvrirEditionThemes(page)
    await expect(ligne(page, 'Engagement bénévole').locator('.usage')).toHaveText('0')
    await expect(ligne(page, 'Motivations').locator('.usage')).toHaveText('1')
    await ligne(page, 'Motivations').locator('.nom-thm').fill('Raisons')
    await ligne(page, 'Motivations').locator('.nom-thm').press('Enter')
    await ligne(page, 'Raisons').locator('.swatch').fill('#21805a')
    await ligne(page, 'Raisons').locator('.taille-thm').selectOption('24')
    await fermerEditionThemes(page)
    await expect(page.locator('.editeur .annot')).toHaveAttribute('title', 'Raisons')
    await expect(page.locator('.editeur .annot')).toHaveAttribute('style', /font-size:\s*24px/)
    await expect(page.locator('.editeur .annot')).toHaveAttribute('style', /rgb\(33, 128, 90\)/)
    expect(readFileSync(fichier, 'utf8')).toBe(avant)

    await ouvrirEditionThemes(page)
    await ligne(page, 'Raisons').locator('.taille-thm').selectOption('')
    await ligne(page, 'Engagement bénévole').locator('.actif input').uncheck()
    await fermerEditionThemes(page)
    await expect(page.locator('.editeur .annot')).toHaveAttribute('title', 'Raisons')
    await expect(page.locator('.editeur .annot')).not.toHaveAttribute('style', /font-size/)
    const bouton = page.locator('.theme-coder', { hasText: 'Raisons' })
    await bouton.click({ button: 'right' })
    await page.getByRole('menuitem', { name: /Passer en passif/ }).click()
    await expect(page.locator('.editeur .annot')).toHaveCount(0)
    await selectionner(page, 'Maison des Habitants')
    await bouton.click()
    await expect(page.locator('.hint-codage')).toContainText('Thème inactif')
    await bouton.click({ button: 'right' })
    await page.getByRole('menuitem', { name: /Passer en actif/ }).click()
    await expect(page.locator('.editeur .annot')).toHaveAttribute('title', 'Raisons')
    expect(readFileSync(fichier, 'utf8')).toBe(avant)
    await page.getByRole('button', { name: 'Masquer la description de Raisons', exact: true }).click()

    await retourCorpus(page)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Thèmes', exact: true }).click()
    await ouvrirEditionThemes(page)
    await expect(ligne(page, 'Engagement bénévole').locator('.actif input')).not.toBeChecked()
    await expect(ligne(page, 'Raisons').locator('.usage')).toHaveText('1')
    await expect(ligne(page, 'Raisons')).toHaveAttribute('style', /padding-left:\s*1\.1rem/)
    await fermerEditionThemes(page)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Accueil', exact: true }).click()
    await page.locator('.carte-ent').filter({ hasText: '2RetraiteAnticipee' }).locator('.crayon').click()
    await page.locator('[data-onglet="themes"]').click()
    await page.getByRole('button', { name: 'Afficher la description de Raisons', exact: true }).click()
    await expect(page.locator('.description-theme')).toHaveText(description)
    await expect(page.locator('.editeur .annot')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('manuel : supprimer un parent conserve ses enfants et leurs codages', async () => {
  const { app, page } = await ouvrir('sonal-doc-themes-suppression-')
  try {
    await page.locator('[data-onglet="themes"]').click()
    await ouvrirEditionThemes(page)
    await page.locator('.modale-themes').getByRole('button', { name: '+ Thème', exact: true }).click()
    await nommerNouveau(page, 'Cadre associatif')
    await ligne(page, 'Cadre associatif').locator('.mini-sous').click()
    await nommerNouveau(page, 'Ressources', true)
    await fermerEditionThemes(page)
    await selectionner(page, 'Lyon')
    await coderTheme(page, 'Ressources')
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await retourCorpus(page)
    await ouvrirEditionThemes(page)
    await ligne(page, 'Ressources').locator('.x').click()
    await expect(page.locator('.msg-thm')).toContainText('utilisé 1')
    await expect(ligne(page, 'Ressources')).toBeVisible()
    await ligne(page, 'Cadre associatif').locator('.x').click()
    await expect(ligne(page, 'Cadre associatif')).toHaveCount(0)
    await expect(ligne(page, 'Ressources')).toHaveAttribute('style', /padding-left:\s*0rem/)
    await expect(ligne(page, 'Ressources').locator('.usage')).toHaveText('1')
    await fermerEditionThemes(page)
    await retourCorpus(page)
    await page.locator('.carte-ent .crayon').first().click()
    await page.locator('[data-onglet="themes"]').click()
    await expect(page.locator('.editeur .annot')).toHaveAttribute('title', 'Ressources')
    await ouvrirEditionThemes(page)
    await ligne(page, 'Ressources').locator('.x').click()
    await expect(page.locator('.confirm-suppr')).toContainText('1 codage(s)')
    await page.locator('.confirm-actions').getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(ligne(page, 'Ressources')).toBeVisible()
    await ligne(page, 'Ressources').locator('.x').click()
    await page.locator('.confirm-actions').getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(ligne(page, 'Ressources')).toHaveCount(0)
    await fermerEditionThemes(page)
    await expect(page.locator('.editeur .annot')).toHaveCount(0)
    await expect(page.locator('.editeur')).toContainText('Lyon')
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await retourCorpus(page)
    await page.locator('.carte-ent .crayon').first().click()
    await expect(page.locator('.editeur .annot')).toHaveCount(0)
    await expect(page.locator('.editeur')).toContainText('Lyon')
  } finally {
    await app.close()
  }
})
