import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer, ouvrirPreparation } from './util'

/** Grille du tableau de bord : clic sur une case → fiche modale → Appliquer.
 *  Le changement d'un badge déjà posé traverse l'IPC avec la garde « attendu » :
 *  l'objet envoyé doit être brut, pas un proxy réactif (non clonable). */

test('poser un badge sur une case vide, puis le changer', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'tableaubord-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await ouvrirPreparation(page)
  await expect(page.locator('.espace-preparation')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.aide-tableau')).toContainText('Clique sur une cellule pour éditer son contenu.')
  const cases = page.locator('.tableau-bord td.case')

  // Case vide → « OK ».
  await cases.first().click()
  await expect(page.locator('.voile-case .modale-case')).toBeVisible()
  await page.locator('.modale-case .statuts button', { hasText: 'OK' }).click()
  await page.locator('.modale-case .valider').click()
  await expect(page.locator('.voile-case')).toHaveCount(0)
  await expect(page.locator('.tableau-bord td.case .badge', { hasText: 'OK' }).first()).toBeVisible()

  // Même case → badge remplacé par « En cours ».
  await cases.first().click()
  await expect(page.locator('.modale-case .statuts button.actif', { hasText: 'OK' })).toBeVisible()
  await page.locator('.modale-case .statuts button', { hasText: 'En cours' }).click()
  await page.locator('.modale-case .valider').click()
  await expect(page.locator('.voile-case')).toHaveCount(0)
  await expect(page.locator('.tableau-bord td.case .badge', { hasText: 'En cours' }).first()).toBeVisible()
  await expect(page.locator('.tableau-bord td.case .badge', { hasText: 'OK' })).toHaveCount(0)

  await app.close()
})

test('date du jour pré-remplie, visibilité de la date et du responsable dans la case', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'tableaubord-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await ouvrirPreparation(page)
  const cases = page.locator('.tableau-bord td.case')

  // La date du jour est déjà dans le champ à l'ouverture de la fiche.
  await cases.first().click()
  const aujourdhui = new Date()
  const iso = `${aujourdhui.getFullYear()}-${String(aujourdhui.getMonth() + 1).padStart(2, '0')}-${String(aujourdhui.getDate()).padStart(2, '0')}`
  await expect(page.locator('.modale-case input[type=date]')).toHaveValue(iso)

  // Date + responsable cochés visibles → affichés dans la case, pas dans l'info-bulle.
  await page.locator('.modale-case .statuts button', { hasText: 'OK' }).click()
  await page.locator('.modale-case input[type=date]').fill('2026-02-10')
  await page.locator('.modale-case .rang-case:has(input[type=date]) .visibilite input').check()
  await page.locator('.modale-case input[placeholder="Qui s\'en occupe ?"]').fill('Amina')
  await page.locator('.modale-case .rang-case:has(input[placeholder="Qui s\'en occupe ?"]) .visibilite input').check()
  await page.locator('.modale-case .valider').click()
  await expect(page.locator('.voile-case')).toHaveCount(0)
  const caseUne = cases.first()
  await expect(caseUne.locator('.badge')).toHaveText('OK')
  await expect(caseUne.locator('.details-case')).toHaveText(/Amina\s*10\/02\/26/)
  // Date et responsable visibles dans la case → l'info-bulle ne les répète pas.
  await expect(caseUne).not.toHaveAttribute('title', /Amina|10\/02\/26/)

  // Réouverture : les cases de visibilité restent cochées, la date est conservée.
  await caseUne.click()
  await expect(page.locator('.modale-case input[type=date]')).toHaveValue('2026-02-10')
  await expect(page.locator('.modale-case .rang-case:has(input[type=date]) .visibilite input')).toBeChecked()
  await expect(page.locator('.modale-case .rang-case:has(input[placeholder="Qui s\'en occupe ?"]) .visibilite input')).toBeChecked()

  await app.close()
})

test('info-bulle : la note d’abord, puis date et responsable chacun sur sa ligne', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'tableaubord-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await ouvrirPreparation(page)
  const cases = page.locator('.tableau-bord td.case')

  await cases.first().click()
  await page.locator('.modale-case .saisie-note').fill('Relire le début')
  await page.locator('.modale-case input[type=date]').fill('2026-02-10')
  await page.locator('.modale-case input[placeholder="Qui s\'en occupe ?"]').fill('Amina')
  // Rien n'est coché visible : tout passe dans l'info-bulle.
  await page.locator('.modale-case .valider').click()
  await expect(page.locator('.voile-case')).toHaveCount(0)

  const caseUne = cases.first()
  await expect(caseUne.locator('.details-case')).toHaveCount(0)
  expect(await caseUne.getAttribute('title')).toBe('Relire le début\nDate : 10/02/26\nResponsable : Amina')

  await app.close()
})

test('ajout de colonnes et de lignes à l’emplacement choisi', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'tableaubord-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await ouvrirPreparation(page)
  const emplacementColonne = page.getByLabel('Emplacement de la nouvelle colonne')
  const emplacementLigne = page.getByLabel('Emplacement de la nouvelle ligne')
  const carteColonne = page.locator('.panneau-tableau-bord .carte')
    .filter({ has: page.locator('h3', { hasText: 'Colonne' }) })
  const carteLigne = page.locator('.panneau-tableau-bord .carte')
    .filter({ has: page.locator('h3', { hasText: 'Ligne' }) })
  const entetesColonnes = page.locator('.grille thead .entete-colonne .nom')
  const entetesLignes = page.locator('.grille tbody .entete-ligne .nom')

  // Par défaut, l'ajout suit le dernier intitulé de la liste.
  await expect(emplacementColonne.locator('option:checked')).toHaveText('Thématisation')
  await expect(emplacementLigne.locator('option:checked')).toHaveText('Entretien 2')

  await carteColonne.getByPlaceholder('Nom de la colonne…').fill('Relance')
  await carteColonne.getByRole('button', { name: '+ Ajouter' }).click()
  await expect(entetesColonnes.last()).toHaveText('Relance')
  // Après l'ajout, l'emplacement revient au défaut (désormais la nouvelle dernière).
  await expect(emplacementColonne.locator('option:checked')).toHaveText('Relance')

  // « En premier » place la colonne avant toutes les autres.
  await emplacementColonne.selectOption({ label: '— En premier —' })
  await carteColonne.getByPlaceholder('Nom de la colonne…').fill('Prélude')
  await carteColonne.getByRole('button', { name: '+ Ajouter' }).click()
  await expect(entetesColonnes.first()).toHaveText('Prélude')

  // « Après … » place la colonne juste derrière l'intitulé choisi.
  await emplacementColonne.selectOption({ label: 'Prise de contact' })
  await carteColonne.getByPlaceholder('Nom de la colonne…').fill('Suite contact')
  await carteColonne.getByRole('button', { name: '+ Ajouter' }).click()
  const nomsColonnes = await entetesColonnes.allTextContents()
  expect(nomsColonnes.indexOf('Suite contact')).toBe(nomsColonnes.indexOf('Prise de contact') + 1)

  // Même logique pour les lignes.
  await carteLigne.getByPlaceholder('Nom de la ligne…').fill('Entretien 3')
  await carteLigne.getByRole('button', { name: '+ Ajouter' }).click()
  await expect(entetesLignes.last()).toHaveText('Entretien 3')

  await emplacementLigne.selectOption({ label: '— En premier —' })
  await carteLigne.getByPlaceholder('Nom de la ligne…').fill('Avant tout')
  await carteLigne.getByRole('button', { name: '+ Ajouter' }).click()
  await expect(entetesLignes.first()).toHaveText('Avant tout')

  await emplacementLigne.selectOption({ label: 'Entretien 1' })
  await carteLigne.getByPlaceholder('Nom de la ligne…').fill('Après le premier')
  await carteLigne.getByRole('button', { name: '+ Ajouter' }).click()
  const nomsLignes = await entetesLignes.allTextContents()
  expect(nomsLignes.indexOf('Après le premier')).toBe(nomsLignes.indexOf('Entretien 1') + 1)

  await app.close()
})

test('colonnes et lignes ajoutées font défiler le tableau sans le comprimer', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'tableaubord-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await ouvrirPreparation(page)
  const conteneur = page.locator('.tableau-bord .conteneur')
  const mesurer = () => conteneur.evaluate((el) => ({
    largeurVisible: el.clientWidth,
    largeurTotale: el.scrollWidth,
    hauteurVisible: el.clientHeight,
    hauteurTotale: el.scrollHeight,
  }))
  const avant = await mesurer()
  // Les colonnes par défaut occupent déjà plus large que la zone visible.
  expect(avant.largeurTotale).toBeGreaterThan(avant.largeurVisible)

  const carteColonne = page.locator('.panneau-tableau-bord .carte')
    .filter({ has: page.locator('h3', { hasText: 'Colonne' }) })
  const largeurPremiereColonne = (await page.locator('.entete-colonne').first().boundingBox())!.width
  await carteColonne.getByPlaceholder('Nom de la colonne…').fill('Relance')
  await carteColonne.getByRole('button', { name: '+ Ajouter' }).click()

  // La nouvelle colonne allonge la table : les autres ne sont pas comprimées.
  const apres = await mesurer()
  expect(apres.largeurTotale).toBeGreaterThan(avant.largeurTotale)
  expect((await page.locator('.entete-colonne').first().boundingBox())!.width).toBe(largeurPremiereColonne)
  await expect(page.locator('.entete-colonne', { hasText: 'Relance' })).toHaveCount(1)

  // Les lignes ajoutées font défiler verticalement la grille.
  const carteLigne = page.locator('.panneau-tableau-bord .carte')
    .filter({ has: page.locator('h3', { hasText: 'Ligne' }) })
  for (let i = 1; i <= 25; i += 1) {
    await carteLigne.getByPlaceholder('Nom de la ligne…').fill(`Ligne ${i}`)
    await carteLigne.getByRole('button', { name: '+ Ajouter' }).click()
  }
  const avecLignes = await mesurer()
  expect(avecLignes.hauteurTotale).toBeGreaterThan(avecLignes.hauteurVisible)

  await app.close()
})

test('largeurs des colonnes et hauteurs des lignes réglables et mémorisées', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tableaubord-'))
  let app = await lancer(dir)
  let page = await app.firstWindow()
  await entrerCorpus(page)

  await ouvrirPreparation(page)
  const premiereColonne = page.locator('.entete-colonne').first()
  await premiereColonne.locator('.poignee-colonne').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  expect(Math.round((await premiereColonne.boundingBox())!.width)).toBe(140)

  const premiereLigne = page.locator('tbody tr').first()
  await page.locator('.entete-ligne .poignee-ligne').first().focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  expect(Math.round((await premiereLigne.boundingBox())!.height)).toBe(40)

  // Le glisser à la souris règle aussi les deux dimensions.
  const poigneeColonne = premiereColonne.locator('.poignee-colonne')
  const boiteColonne = (await poigneeColonne.boundingBox())!
  await page.mouse.move(boiteColonne.x + 3, boiteColonne.y + 20)
  await page.mouse.down()
  await page.mouse.move(boiteColonne.x + 43, boiteColonne.y + 20, { steps: 5 })
  await page.mouse.up()
  const largeurReglee = Math.round((await premiereColonne.boundingBox())!.width)
  expect(largeurReglee).toBeGreaterThanOrEqual(175)

  const poigneeLigne = page.locator('.entete-ligne .poignee-ligne').first()
  const boiteLigne = (await poigneeLigne.boundingBox())!
  await page.mouse.move(boiteLigne.x + 20, boiteLigne.y + 3)
  await page.mouse.down()
  await page.mouse.move(boiteLigne.x + 20, boiteLigne.y + 23, { steps: 5 })
  await page.mouse.up()
  const hauteurReglee = Math.round((await premiereLigne.boundingBox())!.height)
  expect(hauteurReglee).toBeGreaterThanOrEqual(55)

  // Relance sur le même profil : les tailles choisies sont retrouvées.
  await app.close()
  app = await lancer(dir)
  page = await app.firstWindow()
  await entrerCorpus(page)
  await ouvrirPreparation(page)
  expect(Math.round((await page.locator('.entete-colonne').first().boundingBox())!.width)).toBe(largeurReglee)
  expect(Math.round((await page.locator('tbody tr').first().boundingBox())!.height)).toBe(hauteurReglee)

  // Double-clic sur une poignée : retour à la taille par défaut.
  await page.locator('.entete-colonne .poignee-colonne').first().dblclick()
  expect(Math.round((await page.locator('.entete-colonne').first().boundingBox())!.width)).toBe(120)
  await page.locator('.entete-ligne .poignee-ligne').first().dblclick()
  expect(Math.round((await page.locator('tbody tr').first().boundingBox())!.height)).toBe(30)

  await app.close()
})
