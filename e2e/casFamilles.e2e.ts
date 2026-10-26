import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer, ouvrirOrganisation } from './util'
import { corpusFamille, sourceFamille, dateFamille } from '../test/fixtures/casFamilles'

for (const portee of ['locuteur', 'entretien'] as const) {
  test(`famille de variable ${portee} : aperçu, opt-in, complément explicite, réouverture et dissolution`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-familles-e2e-'))
    let app = await lancer(dir)
    try {
      let page = await app.firstWindow()
      await entrerCorpus(page)
      await app.close()
      const fichier = join(dir, 'corpus', 'corpus.json')
      const corpus = corpusFamille(portee)
      writeFileSync(fichier, JSON.stringify(corpus))
      for (const id of ['e1', 'e2']) writeFileSync(join(dir, 'corpus', 'entretiens', `${id}.json`), JSON.stringify(sourceFamille(id === 'e2')))
      app = await lancer(dir)
      page = await app.firstWindow()
      await entrerCorpus(page)
      await ouvrirOrganisation(page)
      let modale = page.locator('#contenu-cas-organisation')
      const avant = readFileSync(fichier, 'utf8')
      await modale.getByRole('button', { name: 'Nouveau cas' }).click()
      await modale.getByRole('radio', { name: portee === 'locuteur' ? 'Variable de locuteur' : 'Variable d’entretien', exact: true }).check()
      await modale.getByLabel('Variable de regroupement').selectOption('v')
      await modale.getByRole('button', { name: 'Prévisualiser la famille' }).click()
      await expect(modale.locator('.modalite-famille')).toHaveCount(3)
      await expect(modale.locator('.modalite-famille').nth(2).getByRole('checkbox')).not.toBeChecked()
      if (portee === 'locuteur') {
        await expect(modale.locator('.creation-famille-cas')).toContainText('2 valeur(s) absente(s)')
        await expect(modale.locator('.creation-famille-cas')).toContainText('2 enquêteur(s) exclu(s)')
      }
      await modale.getByRole('button', { name: 'Annuler', exact: true }).click()
      expect(readFileSync(fichier, 'utf8')).toBe(avant)
      await modale.getByRole('button', { name: 'Nouveau cas' }).click()
      await modale.getByRole('radio', { name: portee === 'locuteur' ? 'Variable de locuteur' : 'Variable d’entretien', exact: true }).check()
      await modale.getByLabel('Variable de regroupement').selectOption('v')
      await modale.getByRole('button', { name: 'Prévisualiser la famille' }).click()
      await modale.getByRole('button', { name: 'Créer la famille', exact: true }).click()
      await expect(modale.locator('.carte-cas')).toHaveCount(2)
      await modale.locator('.carte-cas').filter({ has: page.locator('.nom-carte b').filter({ hasText: /^A$/ }) }).click()
      const textes = modale.locator('.passage-cas blockquote')
      if (portee === 'locuteur') {
        await expect(textes).toHaveCount(3)
        await expect(modale.locator('.fiche-cas')).not.toContainText('Question')
        await expect(modale.locator('.fiche-cas')).toContainText('5 membre(s) observé(s)')
      } else {
        await expect(textes).toHaveCount(1)
        await expect(textes).toContainText('Question')
        await expect(textes).toContainText('Sans locuteur')
      }
      const cree = JSON.parse(readFileSync(fichier, 'utf8'))
      const familleId = Object.keys(cree.famillesCas)[0]
      expect(Object.values(cree.cas).every((cas: any) => cas.familleId === familleId)).toBe(true)
      expect(Object.values(cree.cas).every((cas: any) => cas.rattachements.length === 0)).toBe(true)
      const casA: any = Object.values(cree.cas).find((cas: any) => cas.nom === 'A')
      await page.evaluate(async ({ casId, date }) => {
        await (window as any).sonal.corpus.casCommander({ type: 'ajouter-rattachements', casIds: [casId],
          rattachement: { id: 'manuel-famille', source: { entretienId: 'e1', repereId: 'r' }, provenance: 'manuel', creeLe: date } })
      }, { casId: casA.id, date: dateFamille })
      await app.close()
      const etendu = JSON.parse(readFileSync(fichier, 'utf8'))
      etendu.variables.v.modalites.push({ id: 'd', lib: 'D', mExport: 4 })
      etendu.variables.v.modalites[0].lib = 'A renommée'
      writeFileSync(fichier, JSON.stringify(etendu))
      app = await lancer(dir)
      page = await app.firstWindow()
      await entrerCorpus(page)
      await ouvrirOrganisation(page)
      modale = page.locator('#contenu-cas-organisation')
      await expect(modale.locator('.carte-cas')).toHaveCount(2)
      await modale.locator('.carte-cas').filter({ has: page.locator('.nom-carte b').filter({ hasText: /^A$/ }) }).click()
      await modale.getByRole('combobox', { name: /Matériaux affichés/ }).selectOption('manuels')
      await expect(modale.locator('.passage-cas blockquote')).toHaveCount(1)
      await expect(modale.locator('.passage-cas blockquote')).toContainText('Question')
      expect(JSON.parse(readFileSync(fichier, 'utf8')).cas[casA.id].nom).toBe('A')
      await modale.getByLabel('Filtrer les familles').selectOption(familleId)
      await modale.locator('.fiche-famille').getByRole('button', { name: 'Compléter la famille' }).click()
      await modale.getByRole('button', { name: 'Prévisualiser la famille' }).click()
      await expect(modale.locator('.modalite-famille')).toHaveCount(4)
      await expect(modale.locator('.modalite-famille').first().getByRole('checkbox')).toBeDisabled()
      await modale.locator('.modalite-famille').nth(2).getByRole('checkbox').check()
      await modale.locator('.modalite-famille').nth(3).getByRole('checkbox').check()
      await modale.locator('.creation-famille-cas').getByRole('button', { name: 'Compléter la famille', exact: true }).click()
      await expect(modale.locator('.carte-cas')).toHaveCount(4)
      expect(JSON.parse(readFileSync(fichier, 'utf8')).cas[casA.id].rattachements).toHaveLength(1)
      page.once('dialog', (dialog) => dialog.accept())
      await modale.getByRole('button', { name: 'Dissoudre la famille' }).click()
      await expect(modale.locator('.fiche-famille')).toHaveCount(0)
      await expect(modale.locator('.carte-cas')).toHaveCount(4)
      const dissous = JSON.parse(readFileSync(fichier, 'utf8'))
      expect(dissous.famillesCas).toEqual({})
      expect(Object.values(dissous.cas).every((cas: any) => !cas.familleId && cas.regles[0].type === 'modalite')).toBe(true)
      expect(dissous.cas[casA.id].rattachements).toHaveLength(1)
    } finally {
      await app.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
}
