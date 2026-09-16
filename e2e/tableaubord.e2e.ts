import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer } from './util'

/** Grille du tableau de bord : clic sur une case → fiche modale → Appliquer.
 *  Le changement d'un badge déjà posé traverse l'IPC avec la garde « attendu » :
 *  l'objet envoyé doit être brut, pas un proxy réactif (non clonable). */

test('poser un badge sur une case vide, puis le changer', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'tableaubord-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await page.locator('.btn-tableau').click()
  await expect(page.locator('.fond-tableau')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.aide-tableau')).toContainText('Clique sur une cellule pour éditer son contenu.')
  const cases = page.locator('.fond-tableau td.case')

  // Case vide → « OK ».
  await cases.first().click()
  await expect(page.locator('.voile-case .modale-case')).toBeVisible()
  await page.locator('.modale-case .statuts button', { hasText: 'OK' }).click()
  await page.locator('.modale-case .valider').click()
  await expect(page.locator('.voile-case')).toHaveCount(0)
  await expect(page.locator('.fond-tableau td.case .badge', { hasText: 'OK' }).first()).toBeVisible()

  // Même case → badge remplacé par « En cours ».
  await cases.first().click()
  await expect(page.locator('.modale-case .statuts button.actif', { hasText: 'OK' })).toBeVisible()
  await page.locator('.modale-case .statuts button', { hasText: 'En cours' }).click()
  await page.locator('.modale-case .valider').click()
  await expect(page.locator('.voile-case')).toHaveCount(0)
  await expect(page.locator('.fond-tableau td.case .badge', { hasText: 'En cours' }).first()).toBeVisible()
  await expect(page.locator('.fond-tableau td.case .badge', { hasText: 'OK' })).toHaveCount(0)

  await app.close()
})

test('date du jour pré-remplie, visibilité de la date et du responsable dans la case', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'tableaubord-')))
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await page.locator('.btn-tableau').click()
  const cases = page.locator('.fond-tableau td.case')

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

  await page.locator('.btn-tableau').click()
  const cases = page.locator('.fond-tableau td.case')

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
