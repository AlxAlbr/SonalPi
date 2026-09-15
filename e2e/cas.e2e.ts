import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, entrerEntretien, lancer, selectionner } from './util'

async function clicDroitSelection(page: Page) {
  const centre = await page.evaluate(() => {
    const plage = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
    return { x: plage.x + plage.width / 2, y: plage.y + plage.height / 2 }
  })
  await page.mouse.click(centre.x, centre.y, { button: 'right' })
}

test('cas manuel vide créé sans personne ni repère, relu après redémarrage puis complété', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'sonal-cas-vide-e2e-'))
  let app = await lancer(userDataDir)
  try {
    let page = await app.firstWindow()
    await entrerCorpus(page)
    const cheminCorpus = join(userDataDir, 'corpus', 'corpus.json')
    const cheminEntretien = join(userDataDir, 'corpus', 'entretiens', 'e1.json')
    const avant = readFileSync(cheminCorpus, 'utf8')
    const entretienAvant = readFileSync(cheminEntretien, 'utf8')
    await page.locator('.btn-cas').click()
    let modale = page.locator('.modale-cas')
    await modale.getByRole('button', { name: 'Nouveau cas' }).click()
    await modale.getByRole('radio', { name: 'Cas manuel vide' }).check()
    await modale.getByLabel('Nom du cas *').fill('Brouillon annulé')
    await modale.locator('.creation-cas').getByRole('button', { name: 'Annuler' }).last().click()
    expect(readFileSync(cheminCorpus, 'utf8')).toBe(avant)

    await modale.getByRole('button', { name: 'Nouveau cas' }).click()
    await modale.getByRole('radio', { name: 'Cas manuel vide' }).check()
    await expect(modale.getByRole('button', { name: 'Créer le cas' })).toBeDisabled()
    await modale.getByLabel('Nom du cas *').fill('Établissement A')
    await modale.getByLabel('Mémo — facultatif').fill('Dossier à documenter.')
    await modale.getByRole('button', { name: 'Créer le cas' }).click()
    await expect(modale.getByLabel('Nom du cas')).toHaveValue('Établissement A')
    await expect(modale.locator('.mode-cas')).toContainText('Manuel')
    await expect(modale).toContainText('Ce cas ne contient actuellement aucun passage.')
    await expect(modale.locator('.metriques')).toContainText('0 rattachement(s)')
    const cree = JSON.parse(readFileSync(cheminCorpus, 'utf8'))
    expect(Object.values(cree.cas)).toHaveLength(1)
    expect(Object.values(cree.cas)[0]).toMatchObject({
      nom: 'Établissement A', memo: 'Dossier à documenter.', regles: [], rattachements: [],
    })
    expect(readFileSync(cheminEntretien, 'utf8')).toBe(entretienAvant)
    await modale.getByRole('combobox', { name: /Matériaux affichés/ }).selectOption('regles')
    await expect(modale).toContainText('Aucun passage issu des règles dans cette vue.')

    await app.close()
    app = await lancer(userDataDir)
    page = await app.firstWindow()
    await entrerCorpus(page)
    await page.locator('.btn-cas').click()
    modale = page.locator('.modale-cas')
    await modale.locator('.carte-cas').filter({ hasText: 'Établissement A' }).click()
    await expect(modale.getByLabel('Mémo')).toHaveValue('Dossier à documenter.')
    await expect(modale.getByRole('combobox', { name: /Matériaux affichés/ })).toHaveValue('tous')
    expect(JSON.parse(readFileSync(cheminCorpus, 'utf8')).cas).toEqual(cree.cas)
    await page.getByTitle('Fermer les cas').click()
    await entrerEntretien(page)
    await selectionner(page, 'travail passé')
    await clicDroitSelection(page)
    await page.getByRole('menuitem', { name: '🗂 Associer à un cas…' }).click()
    await modale.getByRole('checkbox', { name: 'Établissement A' }).check()
    await modale.getByRole('button', { name: 'Associer la sélection', exact: true }).click()
    await expect(modale.locator('.passage-cas blockquote')).toHaveText('travail passé')
    expect((Object.values(JSON.parse(readFileSync(cheminCorpus, 'utf8')).cas)[0] as any).rattachements).toHaveLength(1)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('cas dynamique créé depuis une personne, relu et ouvert dans sa source', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'sonal-cas-e2e-'))
  const app = await lancer(userDataDir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const personneId = await api.personnesCommander({ type: 'creerDefinition', nom: 'Karine Dupont' }, true)
      const inventaire = await api.personnesInventaire()
      const locuteur = inventaire.locuteurs.find((courant: any) => courant.nom === 'Karine')
      await api.personnesCommander({
        type: 'lier',
        entretienId: locuteur.entretienId,
        locuteurId: locuteur.locuteurId,
        personneId,
      }, true)
    })

    await expect(page.locator('.btn-cas')).toBeVisible()
    await page.locator('.btn-recueils').click()
    await expect(page.locator('.modale-recueils')).toBeVisible()
    await page.getByTitle('Fermer les recueils').click()
    await page.locator('.btn-cas').click()
    await expect(page.locator('.modale-recueils')).toBeHidden()
    const modale = page.locator('.modale-cas')
    await expect(modale).toBeVisible()

    await modale.getByRole('button', { name: 'Nouveau cas' }).click()
    await expect(modale.getByRole('heading', { name: 'Créer depuis une personne' })).toBeVisible()
    const creer = modale.getByRole('button', { name: 'Créer le cas' })
    await expect(creer).toBeDisabled()
    await modale.getByLabel('Personne *').selectOption({ label: 'Karine Dupont' })
    await expect(modale.locator('.apercu')).toContainText('intervention(s)')
    await modale.getByLabel('Nom du cas *').fill('Karine — trajectoire')
    await modale.getByLabel('Mémo — facultatif').fill('Mémo analytique.')
    await creer.click()

    await expect(modale.getByLabel('Nom du cas')).toHaveValue('Karine — trajectoire')
    await expect(modale.getByLabel('Mémo')).toHaveValue('Mémo analytique.')
    await expect(modale.locator('.passage-cas blockquote').first()).toContainText('Elle parle souvent')
    await modale.getByLabel('Nom du cas').fill('Karine — suivi')
    await modale.getByLabel('Nom du cas').press('Tab')
    await modale.getByLabel('Mémo').fill('Mémo mis à jour.')
    await modale.getByLabel('Mémo').press('Tab')
    await expect(modale.locator('.etat-enregistrement')).toHaveText('à jour')

    const avantMode = JSON.parse(readFileSync(join(userDataDir, 'corpus', 'corpus.json'), 'utf8'))
    const casAvantMode = Object.values(avantMode.cas)[0] as any
    await modale.getByLabel('Mode du texte des cas').selectOption('original')
    await expect(modale.getByLabel('Mode du texte des cas')).toHaveValue('original')
    const apresMode = JSON.parse(readFileSync(join(userDataDir, 'corpus', 'corpus.json'), 'utf8'))
    expect((Object.values(apresMode.cas)[0] as any).modifieLe).toBe(casAvantMode.modifieLe)

    await page.getByTitle('Fermer les cas').click()
    await page.locator('.btn-cas').click()
    await expect(modale.getByLabel('Nom du cas')).toHaveValue('Karine — suivi')
    await expect(modale.getByLabel('Mémo')).toHaveValue('Mémo mis à jour.')
    await modale.getByRole('button', { name: 'Voir dans l’entretien' }).first().click()
    await expect(page.locator('.editeur')).toBeVisible()
    await expect(page.locator('.modale-cas')).toBeHidden()

    await selectionner(page, 'travail passé')
    await clicDroitSelection(page)
    await page.getByRole('menuitem', { name: '🗂 Associer à un cas…' }).click()
    await expect(modale.getByRole('heading', { name: 'Associer cette sélection à un ou plusieurs cas' })).toBeVisible()
    await expect(modale.locator('.association-cas blockquote')).toContainText('travail passé')
    const avantAnnulation = JSON.parse(readFileSync(join(userDataDir, 'corpus', 'entretiens', 'e1.json'), 'utf8'))
    await modale.locator('.association-cas').getByRole('button', { name: 'Annuler' }).last().click()
    const apresAnnulation = JSON.parse(readFileSync(join(userDataDir, 'corpus', 'entretiens', 'e1.json'), 'utf8'))
    expect(apresAnnulation.reperesPassages).toEqual(avantAnnulation.reperesPassages)

    await selectionner(page, 'travail passé')
    await clicDroitSelection(page)
    await page.getByRole('menuitem', { name: '🗂 Associer à un cas…' }).click()
    await modale.locator('.association-cas').getByRole('checkbox', { name: 'Karine — suivi' }).check()
    await modale.getByRole('button', { name: '+ Créer un nouveau cas' }).click()
    await modale.getByLabel('Nom du nouveau cas *').fill('Travail passé')
    await modale.locator('.nouveau-cas-manuel').getByLabel('Mémo — facultatif').fill('Passage manuel.')
    await modale.getByRole('button', { name: 'Créer et associer' }).click()
    await expect(modale.getByLabel('Nom du cas')).toHaveValue('Travail passé')
    await expect(modale.locator('.passage-cas blockquote')).toContainText('travail passé')

    await modale.locator('.carte-cas').filter({ hasText: 'Karine — suivi' }).click()
    await expect(modale.locator('.mode-cas')).toContainText('Avec règle')
    const avantFiltres = readFileSync(join(userDataDir, 'corpus', 'corpus.json'), 'utf8')
    await modale.getByRole('combobox', { name: /Matériaux affichés/ }).selectOption('manuels')
    await expect(modale.locator('.passage-cas')).toHaveCount(1)
    await expect(modale.locator('.passage-cas .provenance')).toContainText('Ajout manuel')
    await expect(modale.locator('.metriques')).toContainText('1 rattachement(s)')
    await modale.getByRole('combobox', { name: /Matériaux affichés/ }).selectOption('regles')
    await expect(modale.getByRole('button', { name: 'Retirer du cas' })).toHaveCount(0)
    await expect(modale.locator('.passage-cas blockquote').first()).toContainText('travail passé')
    const nbPassagesRegle = await modale.locator('.passage-cas').count()
    await expect(modale.locator('.metriques')).toContainText('0 rattachement(s)')
    expect(readFileSync(join(userDataDir, 'corpus', 'corpus.json'), 'utf8')).toBe(avantFiltres)
    await modale.getByRole('combobox', { name: /Matériaux affichés/ }).selectOption('tous')
    await expect(modale.locator('.passage-cas')).toHaveCount(nbPassagesRegle + 1)
    await expect(modale.locator('.chevauchements')).toBeVisible()
    await modale.getByRole('button', { name: 'Retirer du cas' }).click()
    await expect(modale.locator('.passage-cas')).toHaveCount(nbPassagesRegle)
    await expect(modale.locator('.passage-cas blockquote').first()).toContainText('travail passé')
    await modale.getByRole('combobox', { name: /Matériaux affichés/ }).selectOption('manuels')
    await expect(modale).toContainText('Aucun ajout manuel dans ce cas.')

    await modale.locator('.carte-cas').filter({ hasText: 'Travail passé' }).click()
    await expect(modale.getByRole('combobox', { name: /Matériaux affichés/ })).toHaveValue('tous')
    await modale.getByRole('button', { name: 'Retirer du cas' }).click()
    await expect(modale).toContainText('Ce cas ne contient actuellement aucun passage.')

    await page.getByTitle('Fermer les cas').click()
    const corpusFinal = JSON.parse(readFileSync(join(userDataDir, 'corpus', 'corpus.json'), 'utf8'))
    expect(Object.values(corpusFinal.cas)).toHaveLength(2)
    expect(Object.values(corpusFinal.cas).map((courant: any) => courant.rattachements.length)).toEqual([0, 0])
    const entretienFinal = JSON.parse(readFileSync(join(userDataDir, 'corpus', 'entretiens', 'e1.json'), 'utf8'))
    expect(JSON.stringify(entretienFinal.corpsTexte)).toContain('travail passé')
    expect(entretienFinal.reperesPassages).toHaveLength(1)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
