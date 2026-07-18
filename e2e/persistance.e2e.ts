import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, entrerEntretien, coderTheme } from './util'

/**
 * ÉTAPE 2 + S2 — persistance en dossier de corpus, à travers la navigation
 * Corpus → Entretien. Critères DEMARRAGE : (1) round-trip coder/éditer → fermer →
 * rouvrir, tout intact ; (4) version inconnue refusée, entretien plus ancien que le
 * membership signalé (fraîcheur, D6). NB : la LECTURE d'un entretien (donc le refus
 * de version / le signal de fraîcheur) ne se déclenche qu'à l'ENTRÉE dans l'entretien.
 */

/** Les fichiers du corpus vivent sous <userDataDir>/corpus/… (cf. main/index.ts). */
function fichierEntretien(dir: string, id: string) {
  return join(dir, 'corpus', 'entretiens', `${id}.json`)
}

/** Pose un caret au début (snap → « Karine ») et code via l'onglet Thématique (S3). */
async function coderKarine(page: Page, nomTheme: string) {
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, nomTheme)
}

test('round-trip : coder + éditer → fermer → rouvrir, tout est conservé', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-persist-'))

  // 1er lancement : entrer, coder « Karine », ajouter du texte, enregistrer.
  const app1 = await lancer(dir)
  const page1 = await app1.firstWindow()
  await entrerCorpus(page1)
  await entrerEntretien(page1)
  await coderKarine(page1, 'Lieu')
  await expect(page1.locator('.editeur .annot')).toHaveText('Karine')

  const ed1 = page1.locator('.editeur')
  await ed1.click({ position: { x: 40, y: 260 } })
  await page1.keyboard.type(' MODIF-PERSISTEE')

  await page1.locator('.sauver').click()
  await expect(page1.locator('.etat')).toHaveText('à jour')
  await app1.close()

  // 2e lancement, MÊME dossier : annotation ET texte sont là.
  const app2 = await lancer(dir)
  const page2 = await app2.firstWindow()
  await entrerCorpus(page2)
  await entrerEntretien(page2)
  await expect(page2.locator('.editeur')).toContainText('MODIF-PERSISTEE')
  await expect(page2.locator('.editeur .annot')).toHaveText('Karine')
  await app2.close()
})

test('un entretien de format inconnu est refusé poliment (bannière, pas d’écrasement)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-ver-'))

  // 1er lancement : amorce les fichiers (le seed e1), puis on ferme.
  const app1 = await lancer(dir)
  const page1 = await app1.firstWindow()
  await entrerCorpus(page1)
  await app1.close()

  // Corrompt la version du fichier entretien.
  const f = fichierEntretien(dir, 'e1')
  const data = JSON.parse(readFileSync(f, 'utf8'))
  data.formatVersion = 999
  writeFileSync(f, JSON.stringify(data), 'utf8')

  // 2e lancement : ENTRER dans l'entretien déclenche la lecture → refus affiché,
  // on reste sur l'écran Corpus, éditeur non peuplé (aucune lecture partielle).
  const app2 = await lancer(dir)
  const page2 = await app2.firstWindow()
  await entrerCorpus(page2)
  await page2.locator('.carte-ent .crayon').first().click()
  await expect(page2.locator('.banniere.refus')).toBeVisible({ timeout: 20_000 })
  await expect(page2.locator('.editeur')).not.toContainText('Karine')
  await app2.close()
})

test('un entretien plus ancien que le membership est signalé périmé (fraîcheur D6)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-frais-'))

  // 1er lancement : entrer, coder + enregistrer (fait avancer membership.lastModified).
  const app1 = await lancer(dir)
  const page1 = await app1.firstWindow()
  await entrerCorpus(page1)
  await entrerEntretien(page1)
  await coderKarine(page1, 'Famille')
  await page1.locator('.sauver').click()
  await expect(page1.locator('.etat')).toHaveText('à jour')
  await app1.close()

  // Simule un fichier restauré d'une vieille sauvegarde (lastModified ancien).
  const f = fichierEntretien(dir, 'e1')
  const data = JSON.parse(readFileSync(f, 'utf8'))
  data.lastModified = '2000-01-01T00:00:00.000Z'
  writeFileSync(f, JSON.stringify(data), 'utf8')

  // 2e lancement : entrer → la bannière « périmé » apparaît (pas d'écrasement silencieux).
  const app2 = await lancer(dir)
  const page2 = await app2.firstWindow()
  await entrerCorpus(page2)
  await entrerEntretien(page2)
  await expect(page2.locator('.banniere.perime')).toBeVisible()
  await app2.close()
})
