import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus } from './util'

/**
 * Panneau MÉTADONNÉES de l'entretien sélectionné (parité SonalPi1) :
 *  - les variables du corpus (générales + par locuteur) s'affichent en
 *    LECTURE SEULE avec les valeurs de l'entretien ;
 *  - la suppression vit dans le panneau (« ❌ Supprimer cet entretien »),
 *    plus sur les cartes.
 */

/** Fichiers du corpus par défaut du profil. */
function fichierCorpus(dir: string) {
  return join(dir, 'corpus', 'corpus.json')
}
function fichierEntretien(dir: string, id: string) {
  return join(dir, 'corpus', 'entretiens', `${id}.json`)
}

test('le panneau méta affiche les variables résolues et porte la suppression', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-meta-'))

  // 1er lancement : amorce le corpus de démo, puis on ferme pour l'enrichir.
  const app1 = await lancer(dir)
  const page1 = await app1.firstWindow()
  await entrerCorpus(page1)
  await app1.close()

  // Ajoute deux variables au corpus (« Lieu » entretien, « Sexe » locuteur)
  // et des valeurs côté entretien e1 : Karine = F, lieu = Paris.
  const fc = JSON.parse(readFileSync(fichierCorpus(dir), 'utf8'))
  fc.variables = {
    v1: { id: 'v1', lib: 'Lieu', portee: 'entretien', priv: false, ordre: 0, vExport: 1,
      modalites: [{ id: 'v1m1', lib: 'Lyon', mExport: 1 }, { id: 'v1m2', lib: 'Paris', mExport: 2 }] },
    v2: { id: 'v2', lib: 'Sexe', portee: 'locuteur', priv: false, ordre: 1, vExport: 2,
      modalites: [{ id: 'v2m1', lib: 'H', mExport: 1 }, { id: 'v2m2', lib: 'F', mExport: 2 }] },
  }
  writeFileSync(fichierCorpus(dir), JSON.stringify(fc), 'utf8')

  const fe = JSON.parse(readFileSync(fichierEntretien(dir, 'e1'), 'utf8'))
  fe.meta.valeursGen = { v1: 'v1m2' }
  const karine = fe.locuteurs.find((l: { nom: string }) => l.nom === 'Karine')
  karine.valeursLoc = { v2: 'v2m2' }
  writeFileSync(fichierEntretien(dir, 'e1'), JSON.stringify(fe), 'utf8')

  // 2e lancement : sélectionner la carte → le panneau montre les valeurs.
  const app2 = await lancer(dir)
  const page2 = await app2.firstWindow()
  await entrerCorpus(page2)
  await page2.locator('.carte-ent').first().click()
  await expect(page2.locator('.meta-ent')).toBeVisible()

  // Variables générales : « Lieu » résolu à Paris.
  const sectionGen = page2.locator('.meta-vars h4', { hasText: 'Variables générales' })
  await expect(sectionGen).toBeVisible()
  const ligneLieu = page2.locator('.meta-vars .ligne-var', { hasText: 'Lieu' })
  await expect(ligneLieu.locator('.val-var')).toHaveText('Paris')

  // Variables par locuteur : un bloc « Karine » (Sexe = F) ; l'enquêteur du
  // seed (ni flaggé interviewer ni « ? ») a AUSSI un bloc, aux valeurs vides
  // (parité SonalPi1 : seuls les interviewers marqués sont exclus).
  await expect(page2.locator('.meta-vars h4', { hasText: 'Karine' })).toBeVisible()
  const blocKarine = page2.locator('.meta-vars .bloc-loc', { hasText: 'Karine' })
  await expect(blocKarine.locator('.ligne-var', { hasText: 'Sexe' }).locator('.val-var')).toHaveText('F')
  const blocEnq = page2.locator('.meta-vars .bloc-loc', { hasText: 'Enquêteur' })
  await expect(blocEnq.locator('.ligne-var', { hasText: 'Sexe' }).locator('.val-var')).toHaveText('—')

  // Les champs sont en lecture seule (pas d'input dans la section).
  await expect(page2.locator('.meta-vars input')).toHaveCount(0)

  // La suppression a migré dans le panneau ; les cartes n'ont plus de ✕.
  await expect(page2.locator('.meta-ent .suppr-meta')).toContainText('Supprimer cet entretien')
  await expect(page2.locator('.carte-ent .suppr')).toHaveCount(0)

  // Le geste supprime vraiment (confirmation commune, mise en corbeille).
  await page2.locator('.meta-ent .suppr-meta').click()
  await expect(page2.locator('.confirm-suppr')).toBeVisible()
  await page2.locator('.confirm-suppr .danger').click()
  await expect(page2.locator('.carte-ent')).toHaveCount(0)

  await app2.close()
})
