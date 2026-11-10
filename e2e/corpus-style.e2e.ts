import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer } from './util'

test('les panneaux du corpus reprennent le style de la préparation', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-corpus-style-')))
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.evaluate(() => window.sonal.corpus.regleAnonCreer('Karine', ['Claire']))

    await page.getByRole('button', { name: 'Préparer & Suivre', exact: true }).click()
    const reference = page.locator('.accueil-preparation')
    await expect(reference).toBeVisible()
    const panneau = await reference.evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        fond: style.backgroundColor,
        bordure: style.borderTopColor,
        arrondi: style.borderRadius,
        espacement: style.padding,
      }
    })
    const titre = await reference.locator('h3').evaluate((el) => {
      const style = getComputedStyle(el)
      return { taille: style.fontSize, police: style.fontFamily, graisse: style.fontWeight }
    })
    await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()

    const onglets = [
      { nom: 'Notes', panneau: '.filtres-notes', titre: '.corpus-tete h2' },
      { nom: 'Personnes', panneau: '.repertoire', titre: '.corpus-tete h2' },
      { nom: 'Pseudonymisation', panneau: '.pseudo-gauche', titre: '.corpus-tete h3' },
      { nom: 'Thèmes', panneau: '.themes-corpus', titre: '.corpus-tete h3' },
      { nom: 'Données', panneau: '.donnees-gauche', titre: '.variables-tete h2' },
    ]
    for (const largeur of [1280, 720]) {
      await page.setViewportSize({ width: largeur, height: 900 })
      for (const onglet of onglets) {
        await test.step(`${onglet.nom} à ${largeur}px`, async () => {
          await page.locator('.onglets-corpus').getByRole('button', { name: onglet.nom, exact: true }).click()
          await expect(page.getByRole('button', { name: 'Historique des actions…', exact: true })).toHaveCount(0)
          const cote = page.locator(onglet.panneau)
          await expect(cote).toBeVisible()
          await expect(cote).toHaveCSS('background-color', panneau.fond)
          await expect(cote).toHaveCSS('border-top-color', panneau.bordure)
          await expect(cote).toHaveCSS('border-radius', panneau.arrondi)
          await expect(cote).toHaveCSS('padding', panneau.espacement)
          const entete = cote.locator(onglet.titre)
          await expect(entete).toBeVisible()
          await expect(entete).toHaveCSS('font-size', titre.taille)
          await expect(entete).toHaveCSS('font-family', titre.police)
          await expect(entete).toHaveCSS('font-weight', titre.graisse)
          if (onglet.nom === 'Notes' || onglet.nom === 'Personnes') {
            const tailles = await cote.locator('h3, h4, summary').evaluateAll((elements) =>
              elements.map((el) => parseFloat(getComputedStyle(el).fontSize)),
            )
            for (const taille of tailles) expect(taille).toBeLessThan(parseFloat(titre.taille))
            const sections = cote.locator(onglet.nom === 'Notes' ? '.section-notes' : '.carte-repertoire')
            const retraits = await sections.evaluateAll((elements) => elements.flatMap((section) => {
              const titre = section.querySelector(':scope > h3, :scope > summary')!
              const cadreTitre = titre.getBoundingClientRect()
              return Array.from(section.children)
                .filter((el) => el !== titre && el.getBoundingClientRect().width > 0)
                .map((el) => ({
                  retrait: el.getBoundingClientRect().left - cadreTitre.left,
                  debordement: el.getBoundingClientRect().right - section.getBoundingClientRect().right,
                }))
            }))
            expect(retraits.length).toBeGreaterThan(0)
            for (const contenu of retraits) {
              expect(contenu.retrait).toBeCloseTo(12, 1)
              expect(contenu.debordement).toBeLessThanOrEqual(1)
            }
          }
          if (onglet.nom === 'Notes') {
            const recherche = cote.locator('.recherche-notes')
            await expect(recherche).toHaveCSS('margin-inline-start', '12px')
            const cadreLabel = await recherche.boundingBox()
            const cadreChamp = await recherche.locator('input').boundingBox()
            const cadreRaccourcis = await cote.locator('.raccourcis').first().boundingBox()
            expect(cadreLabel!.x).toBeCloseTo(cadreRaccourcis!.x, 1)
            expect(cadreChamp!.x).toBeCloseTo(cadreLabel!.x, 1)
            expect(cadreChamp!.x + cadreChamp!.width).toBeLessThanOrEqual(cadreLabel!.x + cadreLabel!.width + 1)
          }
          if (onglet.nom === 'Personnes') {
            await expect(cote.locator('.carte-repertoire > h3, .carte-repertoire > summary')).toHaveText([
              'Rechercher', 'Personnes identifiées (0)', 'Locuteurs à associer (2)', 'Rapprochements à vérifier',
            ])
            const tailleFiche = await page.locator('.personnes-corpus .fiche h3').evaluate((el) =>
              parseFloat(getComputedStyle(el).fontSize),
            )
            expect(tailleFiche).toBeLessThan(parseFloat(titre.taille))
          }
          const cadre = await cote.boundingBox()
          expect(cadre!.x).toBeGreaterThanOrEqual(0)
          expect(cadre!.x + cadre!.width).toBeLessThanOrEqual(largeur)
          await page.screenshot({ path: test.info().outputPath(`${onglet.nom}-${largeur}.png`) })
        })
      }
    }
  } finally {
    await app.close()
  }
})
