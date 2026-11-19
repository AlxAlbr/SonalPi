import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer } from './util'

test('les définitions passent par le noyau commun sans contourner les usages des cas', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-definitions-variables-'))
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const resultat = await page.evaluate(async () => {
      const api = window.sonal.corpus
      const { id } = await api.ajouterVariable('Locale', 'participation')
      const corpus = await api.ajouterModalite(id, 'Adulte')
      const initiale = corpus.variables[id]
      let remplacementRefuse = false
      try {
        await api.modifierVariable(id, JSON.parse(JSON.stringify({ id: 'autre', modalites: [], vExport: 99 })))
      } catch (e) { remplacementRefuse = String(e).includes('invalides') }
      const renommee = (await api.modifierVariable(id, { lib: 'Locale renommée', priv: true })).variables[id]
      const date = new Date().toISOString()
      await api.casCommander({ type: 'creer', cas: {
        id: 'cas-variable', nom: 'Cas Adulte', memo: '', creeLe: date, modifieLe: date,
        regles: [{ type: 'modalite', variableId: id, modaliteId: initiale.modalites[0].id, portee: "participation", inclureEnqueteurs: false }], rattachements: [],
      } })
      let porteeRefusee = false
      try { await api.modifierVariable(id, { portee: 'entretien' }) }
      catch (e) { porteeRefusee = String(e).includes('utilisée') }
      const suppressionVariable = await api.supprimerVariable(id)
      const suppressionModalite = await api.supprimerModalite(id, initiale.modalites[0].id)
      return { initiale, renommee, remplacementRefuse, porteeRefusee, suppressionVariable, suppressionModalite }
    })
    expect(resultat.remplacementRefuse).toBe(true)
    expect(resultat.renommee).toEqual({ ...resultat.initiale, lib: 'Locale renommée', priv: true })
    expect(resultat.renommee.portee).toBe('participation')
    expect(resultat.porteeRefusee).toBe(true)
    expect(resultat.suppressionVariable).toEqual({ ok: false, usages: 1 })
    expect(resultat.suppressionModalite).toEqual({ ok: false, usages: 1 })
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})
