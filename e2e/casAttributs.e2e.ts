import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer, ouvrirOrganisation } from './util'
import {
  casModalite,
  corpusFamille,
  familleCas,
  sourceFamille,
} from '../test/fixtures/casFamilles'
import type { EntretienFichier, Variable } from '../src/shared/format'

function variableTaille(): Variable {
  return {
    id: 'taille', lib: 'Taille de l’établissement', portee: 'locuteur', priv: true,
    ordre: 1, vExport: 2,
    modalites: [
      { id: 'petit', lib: 'Moins de 10', mExport: 1 },
      { id: 'grand', lib: '10 à 100', mExport: 2 },
    ],
  }
}

function poserTailles(source: EntretienFichier, valeurs: Record<number, string>): EntretienFichier {
  for (const [index, valeur] of Object.entries(valeurs)) {
    const locuteur = source.locuteurs.find((candidat) => candidat.index === Number(index))
    if (locuteur) locuteur.valeursLoc.taille = valeur
  }
  return source
}

test('attributs saisis et dérivés : confidentialité, suspension familiale et recalcul visible', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-attributs-cas-e2e-'))
  let app = await lancer(dir)
  try {
    let page = await app.firstWindow()
    await entrerCorpus(page)
    await app.close()

    const corpusFile = join(dir, 'corpus', 'corpus.crp')
    const entretienFile = (id: string) => join(dir, 'corpus', 'entretiens', `${id}.json`)
    const corpus = corpusFamille()
    corpus.variables.taille = variableTaille()
    const famille = familleCas()
    corpus.famillesCas = { f: famille }
    corpus.cas = {
      'cas-f-a': { ...casModalite('a', famille), nom: 'A' },
      'cas-f-b': { ...casModalite('b', famille), nom: 'B' },
    }
    corpus.attributsCas = {}
    const e1 = poserTailles(sourceFamille(), { 2: 'petit', 3: 'petit', 4: 'grand', 6: 'petit' })
    const e2 = poserTailles(sourceFamille(true), { 2: 'grand', 3: 'petit', 4: 'grand', 6: 'petit' })
    writeFileSync(corpusFile, JSON.stringify(corpus))
    writeFileSync(entretienFile('e1'), JSON.stringify(e1))
    writeFileSync(entretienFile('e2'), JSON.stringify(e2))

    app = await lancer(dir)
    page = await app.firstWindow()
    await entrerCorpus(page)
    await ouvrirOrganisation(page)
    const modale = page.locator('#contenu-cas-organisation')

    await modale.locator('.tete-repertoire').getByRole('button', { name: 'Attributs', exact: true }).click()
    const registre = modale.locator('.definitions-attributs')
    await registre.getByLabel('Libellé').fill('Statut de suivi')
    await registre.getByRole('radio', { name: 'Texte libre' }).check()
    await registre.getByRole('button', { name: 'Créer l’attribut' }).click()
    await expect(registre.locator('.definition-attribut')).toContainText('Statut de suivi')
    await registre.getByRole('button', { name: 'Retour aux cas' }).click()

    await modale.getByLabel('Filtrer les familles').selectOption('f')
    await modale.locator('.fiche-famille').getByRole('button', { name: 'Attributs de la famille' }).click()
    const ficheFamille = modale.locator('.fiche-famille-derivation')
    await expect(ficheFamille.locator('.table-candidates')).toBeVisible()
    await ficheFamille.getByRole('radio', { name: /Taille de l’établissement/ }).check()
    await expect(ficheFamille.getByText('Aperçu cas par cas')).toBeVisible()
    await expect(ficheFamille.getByRole('checkbox', { name: /Attribut privé/ })).toBeChecked()
    await ficheFamille.getByRole('button', { name: 'Ajouter la recette à la famille' }).click()
    await expect(ficheFamille.locator('.table-recettes')).toContainText('Taille de l’établissement')
    await expect(ficheFamille.locator('.table-valeurs')).toContainText('Moins de 10')
    await expect(ficheFamille.locator('.table-valeurs')).toContainText('10 à 100')
    await ficheFamille.getByRole('button', { name: 'Retour aux cas' }).click()

    await modale.locator('.carte-cas').filter({
      has: page.locator('.nom-carte b').filter({ hasText: /^A$/ }),
    }).click()
    const ficheCas = modale.locator('.fiche-cas')
    await expect(ficheCas.locator('.attributs-cas')).toContainText('Taille de l’établissement')
    await expect(ficheCas.locator('.attributs-cas')).toContainText('privé')
    await ficheCas.locator('.ajout-attribut').filter({ hasText: 'Saisir un attribut' }).locator('summary').click()
    const saisie = ficheCas.locator('.ajout-attribut').filter({ hasText: 'Saisir un attribut' })
    await saisie.getByLabel('Attribut').selectOption({ label: 'Statut de suivi' })
    await saisie.getByLabel('Valeur — texte libre').fill('À revoir')
    await saisie.getByRole('button', { name: 'Enregistrer la valeur' }).click()
    const ligneStatut = ficheCas.locator('.table-attributs tbody tr').filter({ hasText: 'Statut de suivi' })
    await expect(ligneStatut.getByLabel('Valeur saisie')).toHaveValue('À revoir')

    const conflit = JSON.parse(readFileSync(entretienFile('e1'), 'utf8')) as EntretienFichier
    conflit.locuteurs.find((locuteur) => locuteur.index === 3)!.valeursLoc.taille = 'grand'
    writeFileSync(entretienFile('e1'), JSON.stringify(conflit))
    await ficheCas.getByRole('button', { name: /Actualiser/ }).click()
    await expect(ficheCas.locator('.table-attributs')).toContainText('Incohérent')

    await modale.locator('.carte-cas').filter({
      has: page.locator('.nom-carte b').filter({ hasText: /^B$/ }),
    }).click()
    const ligneTailleB = ficheCas.locator('.table-attributs tbody tr').filter({ hasText: 'Taille de l’établissement' })
    await expect(ligneTailleB).toContainText('Suspendu pour toute la famille')
    await expect(ligneTailleB.locator('td').nth(2)).toHaveText('—')

    conflit.locuteurs.find((locuteur) => locuteur.index === 3)!.valeursLoc.taille = 'petit'
    writeFileSync(entretienFile('e1'), JSON.stringify(conflit))
    await ficheCas.getByRole('button', { name: /Actualiser/ }).click()
    await expect(ficheCas.locator('.table-attributs')).toContainText('10 à 100')
    await expect(ficheCas.locator('.table-attributs')).not.toContainText('Suspendu pour toute la famille')

    const persiste = JSON.parse(readFileSync(corpusFile, 'utf8'))
    expect(Object.values(persiste.attributsCas).map((definition: any) => [definition.lib, definition.priv]))
      .toEqual(expect.arrayContaining([
        ['Statut de suivi', false],
        ['Taille de l’établissement', true],
      ]))
    expect(persiste.cas['cas-f-a'].valeursAttributsSaisis).toBeTruthy()
    expect(persiste.famillesCas.f.derivationsAttributs).toHaveLength(1)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
