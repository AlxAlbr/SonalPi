import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import {
  lancer, attendreAccueil, entrerCorpus, retourCorpus, entrerDonnees,
  ouvrirEditionVariables, fermerEditionVariables,
} from './util'
import { choisirDossierExemple, configurerSourcesExemples } from './exemples-util'

const variable = (page: Page, nom: string) => page.locator('.liste-var > li')
  .filter({ has: page.getByTitle(nom, { exact: true }) })

/** Bascule le panneau Données de l’entretien sur le sous-onglet demandé. */
async function sousOngletDonnees(page: Page, portee: 'entretien' | 'locuteur') {
  await page.locator('.panneau.donnees .sous-onglet-bouton', { hasText: portee === 'entretien' ? 'Entretien' : 'Locuteur' }).click()
}

async function creerVariable(page: Page, nom: string, portee: 'entretien' | 'locuteur', modalites: string[] = []) {
  await page.locator('.modale-vars').getByRole('button', {
    name: portee === 'entretien' ? "+ var. d'entretien" : '+ var. de locuteur', exact: true,
  }).click()
  const champ = page.locator('.nom-var[title="Nouvelle variable"]')
  await champ.fill(nom)
  await champ.press('Enter')
  await expect(variable(page, nom)).toBeVisible()
  for (const [i, libelle] of modalites.entries()) {
    await variable(page, nom).getByRole('button', { name: '+ modalité', exact: true }).click()
    await expect(variable(page, nom).locator('.lig-mod')).toHaveCount(i + 1)
    const modalite = variable(page, nom).locator('.lib-mod').last()
    await modalite.fill(libelle)
    await modalite.press('Enter')
  }
}

test('manuel : saisir les deux portées, retrouver les mêmes valeurs et protéger les définitions utilisées', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-donnees-'))
  const dossier = join(racine, 'exemple')
  const app = await lancer(join(racine, 'profil'), { executablePath: process.env.DONNEES_E2E_EXECUTABLE })
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
    const lireCorpus = () => JSON.parse(readFileSync(join(dossier, 'corpus.crp'), 'utf8')) as CorpusFichier
    const id = Object.entries(lireCorpus().membership).find(([, ref]) => ref.titre === '1Coordinatrice')![0]
    const lireEntretien = () => JSON.parse(readFileSync(join(dossier, 'entretiens', `${id}.json`), 'utf8')) as EntretienFichier
    const avant = lireEntretien()
    await entrerDonnees(page)
    await ouvrirEditionVariables(page)
    await creerVariable(page, 'Lieu de rencontre', 'entretien', ['En association', 'À domicile'])
    await creerVariable(page, 'Ancienneté', 'locuteur')
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.modale-vars').screenshot({ path: 'docs/user/medias/edition-variables.png' })
    }
    await fermerEditionVariables(page)
    const lieu = Object.values(lireCorpus().variables).find((v) => v.lib === 'Lieu de rencontre')!
    const anciennete = Object.values(lireCorpus().variables).find((v) => v.lib === 'Ancienneté')!
    expect(lireEntretien().meta.valeursGen[lieu.id]).toBeUndefined()
    expect(lireEntretien().locuteurs.every((l) => !l.valeursLoc[anciennete.id])).toBe(true)
    await retourCorpus(page)
    const carte = page.locator('.carte-ent').filter({ hasText: '1Coordinatrice' })
    await carte.locator('.crayon').click()
    await page.locator('[data-onglet="donnees"]').click()
    await sousOngletDonnees(page, 'entretien')
    const site = page.locator('.panneau.donnees > .saisie-eav').filter({ hasText: 'Lieu de rencontre' })
    await site.locator('select').selectOption({ label: 'En association' })
    await sousOngletDonnees(page, 'locuteur')
    const fatima = page.locator('.fiche-loc').filter({ has: page.locator('.fiche-loc-nom', { hasText: 'Speaker 0' }) })
    await fatima.locator('.saisie-eav-libre').fill('Depuis 2012')
    await fatima.locator('.saisie-eav-libre').press('Enter')
    await expect(fatima.locator('select option:checked')).toHaveText('Depuis 2012')
    await expect(page.locator('.fiche-loc').first().locator('select')).toHaveValue('')
    await fatima.locator('select').selectOption({ label: 'autre…' })
    await fatima.locator('.saisie-eav-libre').fill('Depuis 2013')
    await fatima.locator('.saisie-eav-libre').press('Enter')
    await expect(fatima.locator('select option:checked')).toHaveText('Depuis 2013')
    await fatima.locator('select').selectOption('')
    await expect(fatima.locator('select')).toHaveValue('')
    await fatima.locator('select').selectOption({ label: 'Depuis 2012' })
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    expect(Object.values(lireCorpus().variables).find((v) => v.id === anciennete.id)!.modalites.map((m) => m.lib))
      .toEqual(['Depuis 2012', 'Depuis 2013'])
    expect(lireEntretien().meta.valeursGen[anciennete.id]).toBeUndefined()
    expect(lireEntretien().locuteurs.find((l) => l.nom === 'Speaker 0')!.valeursLoc[anciennete.id]).toBeTruthy()

    await retourCorpus(page)
    await entrerDonnees(page)
    const ligneEnt = (titre: string) => page.locator('.matrice tbody tr')
      .filter({ has: page.locator('.ligne-ent', { hasText: titre }) })
    await expect(ligneEnt('1Coordinatrice').locator('select option:checked')).toHaveText('En association')
    await expect(page.locator('.matrice .ligne-loc').nth(1).locator('select option:checked')).toHaveText('Depuis 2012')
    await ligneEnt('2RetraiteAnticipee').locator('select').selectOption({ label: 'À domicile' })
    await expect(ligneEnt('2RetraiteAnticipee').locator('select option:checked')).toHaveText('À domicile')
    await expect(ligneEnt('3Cuisinier').locator('select')).toHaveValue('')
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      const zone = (await page.locator('.donnees-ecran').boundingBox())!
      await page.screenshot({
        path: 'docs/user/medias/table-donnees.png',
        clip: { ...zone, width: Math.min(zone.width, 800), height: Math.min(zone.height, 480) },
      })
    }
    await page.locator('.ligne-variable').filter({ hasText: 'Ancienneté' }).locator('input').uncheck()
    await expect(page.locator('.titre-var')).toHaveCount(1)
    await page.getByRole('button', { name: 'Tout afficher', exact: true }).click()
    await expect(page.locator('.titre-var')).toHaveCount(2)

    await ouvrirEditionVariables(page)
    // Supprimer une variable ou une modalité qui a des valeurs : la confirmation les signale, Annuler ne change rien.
    const confirmation = page.locator('dialog.dialogue-suppression')
    await variable(page, 'Lieu de rencontre').locator('.var-tete > .x').click()
    await expect(confirmation.locator('.alerte-usage')).toContainText('valeur(s) saisie(s)')
    await confirmation.getByRole('button', { name: 'Annuler', exact: true }).click()
    await variable(page, 'Lieu de rencontre').locator('.lig-mod').first().locator('.x-mod').click()
    await expect(confirmation.locator('.alerte-usage')).toContainText('valeur(s) saisie(s)')
    await confirmation.getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(variable(page, 'Lieu de rencontre')).toHaveCount(1)
    await variable(page, 'Lieu de rencontre').locator('.lib-mod').first().fill('Dans l’association')
    await variable(page, 'Lieu de rencontre').locator('.lib-mod').first().press('Enter')
    await variable(page, 'Lieu de rencontre').locator('.nom-var').fill('Lieu')
    await variable(page, 'Lieu de rencontre').locator('.nom-var').press('Enter')
    await variable(page, 'Lieu').locator('.statut').click()
    await expect(variable(page, 'Lieu').locator('.statut')).toContainText('privée')
    await fermerEditionVariables(page)
    await expect(page.locator('.ligne-variable').filter({ hasText: 'Lieu' })).toContainText('privée')
    await expect(ligneEnt('1Coordinatrice').locator('select option:checked')).toHaveText('Dans l’association')
    await expect(ligneEnt('2RetraiteAnticipee').locator('select option:checked')).toHaveText('À domicile')
    await retourCorpus(page)
    await carte.locator('.crayon').click()
    // L’écran entretien (et son volet Données) reste monté : ne pas recliquer la
    // languette si elle est déjà ouverte, cela la refermerait.
    const languetteDonnees = page.locator('[data-onglet="donnees"]')
    if ((await languetteDonnees.getAttribute('aria-expanded')) !== 'true') await languetteDonnees.click()
    await sousOngletDonnees(page, 'entretien')
    await expect(page.locator('.panneau.donnees > .saisie-eav').filter({ hasText: 'Lieu' }).locator('select option:checked'))
      .toHaveText('Dans l’association')
    await sousOngletDonnees(page, 'locuteur')
    await expect(fatima.locator('select option:checked')).toHaveText('Depuis 2012')
    const apres = lireEntretien()
    expect(apres.corpsTexte).toEqual(avant.corpsTexte)
    expect(apres.annotations).toEqual(avant.annotations)
    expect(apres.ancres).toEqual(avant.ancres)
  } finally {
    await app.close()
  }
})

test('manuel : modèles sans réponses, lot limité aux lignes vides et suppression d’une définition inutilisée', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-modele-fichier-'))
  const app = await lancer(join(racine, 'profil'), { executablePath: process.env.DONNEES_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.locator('.ajout-ent').click()
    await page.locator('[data-tour="titre-entretien-vide"]').fill('Autre entretien')
    await page.locator('.modale-ajout .valider').click()
    await expect(page.locator('.editeur')).toBeVisible()
    await retourCorpus(page)
    await entrerDonnees(page)
    await ouvrirEditionVariables(page)
    await creerVariable(page, 'Relecture', 'entretien', ['À relire', 'Relu'])
    const fichier = join(racine, 'Relecture.json')
    await app.evaluate(({ dialog }, chemin) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: chemin })
    }, fichier)
    await variable(page, 'Relecture').locator('.export').click()
    await page.locator('.export-form').getByRole('button', { name: 'Exporter', exact: true }).click()
    await expect.poll(() => {
      try { return JSON.parse(readFileSync(fichier, 'utf8')) } catch { return null }
    }).toEqual({ nom: 'Relecture', modalites: ['À relire', 'Relu'] })
    await app.evaluate(({ dialog }, chemin) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chemin] })
    }, fichier)
    await page.locator('.modale-vars').getByRole('button', { name: /Importer un modèle/ }).click()
    await expect(page.locator('.modale-vars .msg-thm')).toContainText('Modèle « Relecture » importé')
    await expect(page.locator('.liste-var > li')).toHaveCount(1)
    await creerVariable(page, 'Essai de modèle', 'locuteur')
    await variable(page, 'Essai de modèle').locator('.modeles').selectOption('user:Relecture')
    await expect(variable(page, 'Essai de modèle').locator('.lib-mod')).toHaveCount(2)
    await variable(page, 'Essai de modèle').locator('.var-tete > .x').click()
    await page.locator('dialog.dialogue-suppression').getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(variable(page, 'Essai de modèle')).toHaveCount(0)
    await page.locator('.modale-vars').getByRole('button', { name: '+ var. de locuteur', exact: true }).click()
    await variable(page, 'Nouvelle variable').locator('.modeles').selectOption('statut')
    await expect(variable(page, "Statut d'activité").locator('.lib-mod')).toHaveCount(6)
    await variable(page, "Statut d'activité").locator('.var-tete > .x').click()
    await page.locator('dialog.dialogue-suppression').getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(variable(page, "Statut d'activité")).toHaveCount(0)
    await fermerEditionVariables(page)

    const ligne = (titre: string) => page.locator('.matrice tbody tr')
      .filter({ has: page.locator('.ligne-ent', { hasText: titre }) })
    const seed = page.locator('.matrice tbody tr').filter({ has: page.locator('.ligne-ent') }).first()
    await expect(seed.locator('select')).toHaveValue('')
    await expect(ligne('Autre entretien').locator('select')).toHaveValue('')
    await seed.locator('select').selectOption({ label: 'Relu' })
    await expect(seed.locator('select option:checked')).toHaveText('Relu')
    await page.locator('.lot-var').click()
    await expect(page.locator('.liste-cibles li')).toHaveCount(2)
    await page.locator('.filtre-sans-valeur input').check()
    await expect(page.locator('.liste-cibles li')).toHaveCount(1)
    await expect(page.locator('.liste-ignores li')).toHaveCount(1)
    await page.locator('.modale-lot select').selectOption({ label: 'À relire' })
    await page.locator('.modale-lot .valider').click()
    await expect(page.locator('.recap-ok')).toContainText('1 entretien(s) modifié(s)')
    await page.locator('.modale-lot .valider').click()
    await expect(seed.locator('select option:checked')).toHaveText('Relu')
    await expect(ligne('Autre entretien').locator('select option:checked')).toHaveText('À relire')
    await page.locator('.lot-var').click()
    await page.locator('.modale-lot select').selectOption('')
    await page.locator('.modale-lot .valider').click()
    await expect(page.locator('.recap-ok')).toContainText('2 entretien(s) modifié(s)')
    await page.locator('.modale-lot .valider').click()
    await expect(seed.locator('select')).toHaveValue('')
    await expect(ligne('Autre entretien').locator('select')).toHaveValue('')
    await ouvrirEditionVariables(page)
    await variable(page, 'Relecture').locator('.x-mod').first().click()
    await page.locator('dialog.dialogue-suppression').getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(variable(page, 'Relecture').locator('.lib-mod')).toHaveCount(1)
    await variable(page, 'Relecture').locator('.var-tete > .x').click()
    await page.locator('dialog.dialogue-suppression').getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(variable(page, 'Relecture')).toHaveCount(0)
    await fermerEditionVariables(page)
    await expect(page.locator('.donnees-ecran')).toContainText('Aucune variable')
  } finally {
    await app.close()
  }
})
