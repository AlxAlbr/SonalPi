import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CorpusFichier } from '../src/shared/format'
import { lancer, entrerCorpus, retourCorpus } from './util'
import { ecrireSeedDemo } from '../test/seedDemo'

/** Ajoute un deuxième entretien au corpus de démonstration, avant le lancement. */
function ajouterEntretien(dirCorpus: string): void {
  const chemin = join(dirCorpus, 'corpus.crp')
  const corpus = JSON.parse(readFileSync(chemin, 'utf8')) as CorpusFichier
  corpus.membership.e2 = { titre: 'Deuxième entretien', date: null, lastModified: new Date().toISOString() }
  writeFileSync(chemin, JSON.stringify(corpus, null, 2))
  mkdirSync(join(dirCorpus, 'entretiens'), { recursive: true })
  writeFileSync(join(dirCorpus, 'entretiens', 'e2.json'), JSON.stringify({
    formatVersion: 3,
    lastModified: new Date().toISOString(),
    corpsTexte: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Deuxième entretien de test.' }] }],
    },
    annotations: [], ancres: [],
    locuteurs: [{ index: 1, nom: 'Enquêteur', valeursLoc: {}, personneRef: null }],
    meta: { valeursGen: {}, audioRef: null },
  }), 'utf8')
}

test('un entretien est toujours sélectionné ; double-clic, Entrée et flèches pour naviguer et ouvrir', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-liste-entretiens-'))
  ecrireSeedDemo(join(dir, 'corpus'))
  ajouterEntretien(join(dir, 'corpus'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const cartes = page.locator('.carte-ent')
    const nom = page.locator('.colonne-g-corpus .meta-ent .titre-meta')
    await expect(cartes).toHaveCount(2)

    // Le premier entretien est sélectionné d'office et sa fiche est affichée à gauche.
    await expect(cartes.nth(0)).toHaveClass(/selection/)
    await expect(nom).toHaveValue('Entretien Karine')

    // Les flèches changent d'entretien et déplacent le focus.
    await cartes.nth(0).focus()
    await page.keyboard.press('ArrowDown')
    await expect(cartes.nth(1)).toHaveClass(/selection/)
    await expect(cartes.nth(1)).toBeFocused()
    await expect(nom).toHaveValue('Deuxième entretien')
    await page.keyboard.press('Home')
    await expect(cartes.nth(0)).toHaveClass(/selection/)
    await page.keyboard.press('End')
    await expect(cartes.nth(1)).toHaveClass(/selection/)

    // Entrée ouvre l'entretien sélectionné.
    await page.keyboard.press('Enter')
    await expect(page.locator('.editeur')).toContainText('Deuxième entretien de test.')

    // Au retour, le choix est conservé ; un double-clic ouvre un autre entretien.
    await retourCorpus(page)
    await expect(cartes.nth(1)).toHaveClass(/selection/)
    await cartes.nth(0).locator('.ent-titre').dblclick()
    await expect(page.locator('.editeur')).toContainText('Karine')
  } finally {
    await app.close()
  }
})
