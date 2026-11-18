import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, entrerDonnees, lancer } from './util'
import { ecrireSeedDemo as ecrireSeedHistorique } from '../test/seedDemo'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import type { JSONContent } from '@tiptap/core'

test('la table garde la même participation après un changement extérieur des index', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-table-ids-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const initial = await page.evaluate(async () => {
      const api = window.sonal.corpus
      const { id: idVar } = await api.ajouterVariable('Réponse locale', 'locuteur')
      const c = await api.ajouterModalite(idVar, 'Oui')
      const lecture = await api.lireEntretien('e1')
      if (!lecture.ok) throw new Error('Entretien absent')
      const data = lecture.data
      for (const p of data.locuteurs) p.nom = 'Même nom'
      const ids = data.locuteurs.map((p) => p.id!)
      const date = new Date().toISOString()
      data.notes = [{ id: 'note-locale', categorieId: 'ncat_generale', titre: 'À conserver', corps: '<p>Note</p>',
        date: null, statut: 'prive', rang: 0, creeLe: date, modifieLe: date, locuteurIds: [ids[1]] }]
      await api.ecrireEntretien('e1', data)
      return { ids, idVar, idMod: c.variables[idVar].modalites[0].id }
    })
    await page.reload()
    await entrerCorpus(page)
    await entrerDonnees(page)
    const cellules = page.locator('.ligne-loc select')
    await expect(cellules).toHaveCount(2)
    await expect(cellules.nth(1)).toBeEnabled()

    const fichier = join(dir, 'corpus/entretiens/e1.json')
    const data = JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier
    const avant = structuredClone(data)
    data.locuteurs[0].index = 2
    data.locuteurs[1].index = 1
    for (const bloc of (data.corpsTexte as JSONContent).content ?? []) {
      if (bloc.attrs?.loc === 1) bloc.attrs.loc = 2
      else if (bloc.attrs?.loc === 2) bloc.attrs.loc = 1
    }
    writeFileSync(fichier, JSON.stringify(data))
    await cellules.nth(1).selectOption(initial.idMod)
    const lire = () => JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier
    await expect.poll(() => lire().locuteurs[1].valeursLoc[initial.idVar]).toBe(initial.idMod)
    const apres = lire()
    expect(apres.locuteurs.map((p) => p.id)).toEqual(initial.ids)
    expect(apres.locuteurs.map((p) => p.index)).toEqual([2, 1])
    expect(apres.locuteurs[0].valeursLoc).toEqual(avant.locuteurs[0].valeursLoc)
    expect(apres.notes).toEqual(avant.notes)
    expect(apres.corpsTexte).toEqual(data.corpsTexte)

    await cellules.nth(0).selectOption({ label: 'autre…' })
    const libre = page.locator('.ligne-loc .cell-libre')
    await libre.fill('Réponse libre')
    await libre.press('Tab')
    await expect.poll(() => lire().locuteurs[0].valeursLoc[initial.idVar]).toBeTruthy()
    const corpus = JSON.parse(readFileSync(join(dir, 'corpus/corpus.crp'), 'utf8')) as CorpusFichier
    const modalite = corpus.variables[initial.idVar].modalites.find((m) => m.lib === 'Réponse libre')!
    const apresLibre = lire()
    expect(apresLibre.locuteurs[0].valeursLoc[initial.idVar]).toBe(modalite.id)
    expect(apresLibre.locuteurs[1].valeursLoc[initial.idVar]).toBe(initial.idMod)
    expect(apresLibre.locuteurs.map((p) => p.id)).toEqual(initial.ids)
    expect(apresLibre.notes).toEqual(avant.notes)

    const contenuAvant = readFileSync(fichier, 'utf8')
    const ancienRefuse = await page.evaluate(async ({ idVar, idMod }) => {
      try {
        await window.sonal.corpus.poserValeurLot(JSON.parse(JSON.stringify([
          { entretienId: 'e1', cible: { type: 'locuteur', index: 1 }, idVar, idMod },
        ])))
        return false
      } catch (e) { return String(e).includes('destination') }
    }, initial)
    expect(ancienRefuse).toBe(true)
    expect(readFileSync(fichier, 'utf8')).toBe(contenuAvant)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('consulter les anciennes lignes sans id ne les complète pas et bloque leur saisie', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-table-historique-'))
  ecrireSeedHistorique(join(dir, 'corpus'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.evaluate(async () => {
      const { id } = await window.sonal.corpus.ajouterVariable('Réponse locale', 'locuteur')
      await window.sonal.corpus.ajouterModalite(id, 'Oui')
    })
    const fichier = join(dir, 'corpus/entretiens/e1.json')
    const avant = readFileSync(fichier, 'utf8')
    await page.reload()
    await entrerCorpus(page)
    await entrerDonnees(page)
    const cellules = page.locator('.ligne-loc select')
    await expect(cellules).toHaveCount(2)
    await expect(cellules.nth(0)).toBeDisabled()
    await expect(cellules.nth(1)).toBeDisabled()
    await expect(page.locator('.ligne-loc small')).toHaveCount(2)
    expect(readFileSync(fichier, 'utf8')).toBe(avant)
    expect((JSON.parse(avant) as EntretienFichier).locuteurs.every((p) => !p.id)).toBe(true)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})
