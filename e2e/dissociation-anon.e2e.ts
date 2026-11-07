import { test, expect, type Page } from '@playwright/test'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ouvrirSurCorpus, lancer } from './util'
import { fixtureDissociationAnon } from '../test/fixtures/dissociationAnon'

async function installer(page: Page, sourcesGardees?: number[]) {
  const fixture = fixtureDissociationAnon()
  const sources = sourcesGardees ? fixture.sources.filter((_source, index) => sourcesGardees.includes(index)) : fixture.sources
  const ids = await page.evaluate(async ({ corpus, sources }) => {
    const ids: string[] = []
    for (const s of sources) ids.push((await window.sonal.corpus.importer(s.titre, s.data, [], [], Object.values(corpus.reglesAnon))).id)
    return ids
  }, { corpus: fixture.corpus, sources })
  const regle = await page.evaluate(async () => (await window.sonal.corpus.reglesAnon()).find((r) => r.entite[0] === 'Karine')!)
  await page.reload()
  await page.getByRole('button', { name: 'corpus', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pseudonymisation', exact: true })).toBeVisible()
  return { ids, regle }
}
const lire = (page: Page, ids: string[]) => page.evaluate(async (ids) => Promise.all(ids.map((id) => window.sonal.corpus.lireEntretien(id))), ids)
async function dialogue(page: Page) {
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
  await page.getByRole('button', { name: 'Dissocier globalement Karine', exact: true }).click()
  return page.getByRole('dialog', { name: 'Dissocier une règle du corpus', exact: true })
}

test('dissociation locale : annuler, consentir, mémoire entière et seules références liées', async ({}, testInfo) => {
  const { app, page } = await ouvrirSurCorpus('sonal-dissociation-')
  try {
    const { ids, regle } = await installer(page), avant = await lire(page, ids)
    let modal = await dialogue(page)
    await expect(modal).toContainText('8 passage(s) concerné(s) dans 2 entretien(s)')
    await expect(modal.getByRole('button', { name: 'Préparer la dissociation globale', exact: true })).toHaveCount(0)
    await expect(modal).toContainText('Claire / Rebecca ; catégorie PER')
    await expect(modal.getByRole('button', { name: 'Confirmer la dissociation globale', exact: true })).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('dissociation-normale.png') })
    await page.setViewportSize({ width: 760, height: 700 })
    await page.screenshot({ path: testInfo.outputPath('dissociation-reduite.png') })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
    expect(await lire(page, ids)).toEqual(avant)
    await page.setViewportSize({ width: 1280, height: 900 })
    modal = await dialogue(page)
    await expect(modal.getByRole('checkbox')).toBeEnabled()
    await modal.getByRole('checkbox').check()
    await modal.getByRole('button', { name: 'Confirmer la dissociation globale', exact: true }).click()
    await expect(modal).toHaveCount(0)
    await expect(page.locator('.pseudo-panneau')).toContainText('Dissociation effectuée : 8 décision(s)')
    const apres = await lire(page, ids)
    for (let i = 0; i < ids.length; i++) {
      const a = avant[i], b = apres[i]
      if (!a.ok || !b.ok) throw new Error('Fixture illisible.')
      const attendu = structuredClone(a.data)
      if (i < 2) {
        attendu.definitionsAnonLocales!.push({ entite: regle.entite, pseudos: regle.pseudos, categorie: regle.categorie, etat: 'declaration' })
        for (const annotation of attendu.annotations) if (annotation.regle === regle.id) delete annotation.regle
      }
      expect({ ...b.data, lastModified: a.data.lastModified }).toEqual(attendu)
    }
    expect((await page.evaluate(() => window.sonal.corpus.reglesAnon())).some((r) => r.id === regle.id)).toBe(false)
  } finally { await app.close() }
})

test('dissociation locale : modification non ciblée refuse le lot ; nouvelle préparation sans écrasement', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-dissociation-perimee-')
  try {
    const { ids } = await installer(page), avant = await lire(page, ids.slice(0, 2))
    const modal = await dialogue(page)
    await expect(modal).toContainText('8 passage(s)')
    await page.evaluate(async (id) => {
      const l = await window.sonal.corpus.lireEntretien(id)
      if (!l.ok) throw new Error('Fixture illisible.')
      await window.sonal.corpus.ecrireEntretien(id, { ...l.data, meta: { ...l.data.meta, valeursGen: { ...l.data.meta.valeursGen, 'concurrence-synthetique': 'Édition indépendante conservée' } } })
    }, ids[2])
    const tiers = await lire(page, ids.slice(2))
    await modal.getByRole('checkbox').check()
    await modal.getByRole('button', { name: 'Confirmer la dissociation globale', exact: true }).click()
    await expect(modal.getByRole('alert')).toContainText('rouvrez le corpus')
    await modal.getByText('Informations pour l’assistance', { exact: true }).click()
    await expect(modal).toContainText('changé depuis l’inventaire')
    await expect(modal.getByRole('button', { name: 'Actualiser le bilan', exact: true })).toBeDisabled()
    expect(await lire(page, ids.slice(0, 2))).toEqual(avant)
    await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
    const frais = await dialogue(page)
    await expect(frais.getByRole('checkbox')).toBeEnabled()
    await frais.getByRole('checkbox').check()
    await frais.getByRole('button', { name: 'Confirmer la dissociation globale', exact: true }).click()
    await expect(frais).toHaveCount(0)
    expect(await lire(page, ids.slice(2))).toEqual(tiers)
  } finally { await app.close() }
})

test('sortie du corpus utilisée seulement ici : portée entretien appliquée sans dialogue puis entretien rouvert', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-dissociation-directe-entretien-')
  try {
    const { ids, regle } = await installer(page, [0, 2])
    await page.locator(`.carte-ent[data-entretien-id="${ids[0]}"] .crayon`).click()
    await expect(page.locator('.editeur')).toBeVisible()
    await page.locator('[data-onglet="anon"]').click()
    const ligne = page.locator('.ligne-anon.etat-corpus', { hasText: 'Karine' }).first()
    let dialogues = 0
    page.on('dialog', async (dialogue) => { dialogues++; await dialogue.dismiss() })
    await ligne.locator('.portee-cran').nth(1).click()
    await expect(page.locator('.editeur')).toBeVisible()
    await expect(page.locator('.ligne-anon.etat-entretien', { hasText: 'Karine' }).first()).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Dissocier une règle du corpus', exact: true })).toHaveCount(0)
    expect(dialogues).toBe(0)
    expect((await page.evaluate(() => window.sonal.corpus.reglesAnon())).some((r) => r.id === regle.id)).toBe(false)
    const lus = await lire(page, ids)
    if (!lus[0].ok || !lus[1].ok) throw new Error('Fixture illisible.')
    expect(lus[0].data.annotations.some((a) => a.regle === regle.id)).toBe(false)
    expect(lus[0].data.definitionsAnonLocales?.at(-1)).toMatchObject({ entite: regle.entite, pseudos: regle.pseudos, etat: 'declaration' })
    expect(lus[1].data.definitionsAnonLocales).toEqual(fixtureDissociationAnon().sources[2].data.definitionsAnonLocales)
  } finally { await app.close() }
})

test('sortie du corpus utilisée seulement ici : retour en chantier direct et occurrences à anonymiser', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-dissociation-directe-brouillon-')
  try {
    const { ids, regle } = await installer(page, [0, 2])
    await page.locator(`.carte-ent[data-entretien-id="${ids[0]}"] .crayon`).click()
    await expect(page.locator('.editeur')).toBeVisible()
    await page.locator('[data-onglet="anon"]').click()
    const ligne = page.locator('.ligne-anon.etat-corpus', { hasText: 'Karine' }).first()
    let dialogues = 0
    page.on('dialog', async (dialogue) => { dialogues++; await dialogue.dismiss() })
    await ligne.locator('.portee-cran').first().click()
    await expect(page.locator('.editeur')).toBeVisible()
    const chantier = page.locator('.ligne-anon.etat-brouillon', { hasText: 'Karine' }).first()
    await expect(chantier).toBeVisible()
    await expect(chantier.locator('.cpt-aanon')).toContainText('À ')
    await expect(page.getByRole('dialog', { name: 'Dissocier une règle du corpus', exact: true })).toHaveCount(0)
    expect(dialogues).toBe(0)
    expect((await page.evaluate(() => window.sonal.corpus.reglesAnon())).some((r) => r.id === regle.id)).toBe(false)
    const lus = await lire(page, ids)
    if (!lus[0].ok) throw new Error('Fixture illisible.')
    expect(lus[0].data.annotations.some((a) => a.regle === regle.id)).toBe(false)
    expect(lus[0].data.annotations.filter((a) => a.type === 'anon').map((a) => a.id).sort()).toEqual(['a3', 'englobante'])
    expect(lus[0].data.brouillonsAnon).toContainEqual({ entite: 'Karine', pseudo: 'Claire / Rebecca' })
    expect(lus[0].data.definitionsAnonLocales?.at(-1)).toMatchObject({ entite: regle.entite, pseudos: regle.pseudos, etat: 'brouillon' })
  } finally { await app.close() }
})

test('dissociation depuis l’entretien : édition sauvée, session fermée, aperçu global sans déliage implicite', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-dissociation-portee-')
  try {
    const { ids, regle } = await installer(page)
    await page.locator('.carte-ent', { hasText: 'Entretien e1' }).locator('.crayon').click()
    await expect(page.locator('.editeur')).toBeVisible()
    await page.locator('.editeur').press('Control+End')
    await page.locator('.editeur').press('End')
    await page.keyboard.insertText(' Ajout édité avant dissociation.')
    await page.locator('[data-onglet="anon"]').click()
    const ligne = page.locator('.ligne-anon.etat-corpus', { hasText: 'Karine' }).first()
    const bouton = ligne.locator('.portee-cran').nth(1)
    await expect(bouton).toBeEnabled()
    page.once('dialog', (d) => d.accept())
    await bouton.click()
    const modal = page.getByRole('dialog', { name: 'Dissocier une règle du corpus', exact: true })
    await expect(modal).toBeVisible()
    const ferme = await lire(page, ids)
    if (!ferme[0].ok) throw new Error('Fixture illisible.')
    expect(JSON.stringify(ferme[0].data.corpsTexte)).toContain('Ajout édité avant dissociation.')
    expect(ferme[0].data.annotations.some((a) => a.regle === regle.id)).toBe(true)
    await expect(modal.getByRole('checkbox')).toBeEnabled()
    await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
    expect(await lire(page, ids)).toEqual(ferme)
    await page.getByRole('button', { name: 'Dissocier globalement Karine', exact: true }).click()
    await expect(modal.getByRole('checkbox')).toBeEnabled()
    await modal.getByRole('checkbox').check()
    await modal.getByRole('button', { name: 'Confirmer la dissociation globale', exact: true }).click()
    await expect(modal).toHaveCount(0)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Accueil', exact: true }).click()
    await page.locator('.carte-ent', { hasText: 'Entretien e1' }).locator('.crayon').click()
    await page.locator('[data-onglet="anon"]').click()
    const locale = page.locator('.ligne-anon.etat-entretien', { hasText: 'Karine' }).first()
    await expect(locale.locator('.pseudo-anon')).toHaveValue('Claire / Rebecca')
  } finally { await app.close() }
})

test('dissociation interrompue : journal privé, fermeture et relance sans réécriture du premier acquis', async () => {
  let { app, page } = await ouvrirSurCorpus('sonal-dissociation-reprise-')
  try {
    const { ids, regle } = await installer(page)
    const dir = (await page.evaluate(() => window.sonal.corpus.dossierCourant())).dir
    const profil = await app.evaluate(({ app }) => app.getPath('userData'))
    const modal = await dialogue(page)
    await expect(modal.getByRole('checkbox')).toBeEnabled()
    await app.evaluate((_electron, cible) => {
      const fs = process.getBuiltinModule('fs') as typeof import('node:fs'), original = fs.renameSync
      fs.renameSync = (...args: Parameters<typeof fs.renameSync>) => {
        if (String(args[1]) === cible) throw new Error('Interruption synthétique de la dissociation.')
        return original(...args)
      }
    }, join(dir, 'entretiens', `${ids[1]}.json`))
    await modal.getByRole('checkbox').check()
    await modal.getByRole('button', { name: 'Confirmer la dissociation globale', exact: true }).click()
    await expect(modal.getByRole('alert')).toContainText('rouvrez le corpus')
    await modal.getByText('Informations pour l’assistance', { exact: true }).click()
    await expect(modal).toContainText('Interruption synthétique')
    const cheminAcquis = join(dir, 'entretiens', `${ids[0]}.json`), acquis = readFileSync(cheminAcquis, 'utf8'), mtime = statSync(cheminAcquis).mtimeMs
    expect(JSON.parse(acquis).annotations.some((a: { regle?: string }) => a.regle === regle.id)).toBe(false)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8')).reglesAnon[regle.id]).toBeDefined()
    expect(statSync(join(dir, '.transaction-fichiers.json')).mode & 0o777).toBe(0o600)
    await app.close()
    app = await lancer(profil); page = await app.firstWindow()
    await page.getByRole('button', { name: 'corpus', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pseudonymisation', exact: true })).toBeVisible({ timeout: 20_000 })
    expect(readFileSync(cheminAcquis, 'utf8')).toBe(acquis)
    expect(statSync(cheminAcquis).mtimeMs).toBe(mtime)
    expect((await page.evaluate(() => window.sonal.corpus.reglesAnon())).some((r) => r.id === regle.id)).toBe(false)
    const restants = await lire(page, ids)
    for (const l of restants.slice(0, 2)) { if (!l.ok) throw new Error('Fixture illisible.'); expect(l.data.annotations.some((a) => a.regle === regle.id)).toBe(false) }
  } finally { await app.close() }
})
