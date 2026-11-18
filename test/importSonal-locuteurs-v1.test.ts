// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importerSonal } from '../src/renderer/formatSonal/importSonal'
import type { PayloadEntretien } from '../src/shared/format'

function importer(locuteurs: string[], indices: Array<number | string | null>, valeurs: unknown[] = []) {
  const segments = indices.map((index, i) => `
    <div class="lblseg"${index === null ? '' : ` data-loc="${index}"`}>
      <span data-rk="${i + 1}">Passage ${i + 1}.</span>
    </div>`).join('')
  const table = `<script id="loc-json" type="application/json">${JSON.stringify(locuteurs)}</script>`
  const html = `<html><body>
    <div id="contenuText">${segments}</div>
    ${table}
    <script id="dat-json" type="application/json">${JSON.stringify(valeurs)}</script>
  </body></html>`
  return importerSonal(new DOMParser().parseFromString(html, 'text/html')).payload
}

function blocs(payload: PayloadEntretien) {
  const doc = payload.corpsTexte as {
    content: Array<{ attrs: { loc: number | null }; content: Array<{ text: string }> }>
  }
  return doc.content.map((bloc) => ({
    loc: bloc.attrs.loc,
    texte: bloc.content.map((fragment) => fragment.text).join(''),
  }))
}

describe('locuteurs V1 — données à conserver pendant l’unification', () => {
  test.each(['entretien1.sonal', 'entretien2.sonal', 'entretien3.sonal'])(
    '%s : les attributions correspondent aux locuteurs du fichier V1', (nom) => {
      const html = readFileSync(join(process.cwd(), 'test/fixtures', nom), 'utf8')
        .replace(/<link\b[^>]*>/gi, '')
        .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, '')
      const payload = importerSonal(new DOMParser().parseFromString(html, 'text/html')).payload
      const indices = new Set(payload.locuteurs.map((locuteur) => locuteur.index))
      expect(payload.locuteurs.length).toBeGreaterThan(0)
      expect(indices.size).toBe(payload.locuteurs.length)
      for (const bloc of blocs(payload)) {
        if (bloc.loc !== null) expect(indices.has(bloc.loc)).toBe(true)
      }
    },
  )

  test('l’index zéro et une attribution absente ne créent aucun locuteur', () => {
    const payload = importer([''], [0, null])
    expect(payload.locuteurs).toEqual([])
    expect(blocs(payload)).toEqual([
      { loc: null, texte: 'Passage 1.' },
      { loc: null, texte: 'Passage 2.' },
    ])
  })

  test('les index non consécutifs conservent leurs paroles et leurs valeurs locales', () => {
    const payload = importer(['', 'Alice', '', 'Bob'], [1, 3], [
      { v: 1, l: 3, m: 2 },
      { v: 2, l: 'all', m: 1 },
    ])
    expect(payload.locuteurs.map(({ index, nom }) => ({ index, nom }))).toEqual([
      { index: 1, nom: 'Alice' },
      { index: 3, nom: 'Bob' },
    ])
    expect(payload.locuteurs[1].valeursLoc).toEqual({ v1: 'v1m2' })
    expect(payload.meta.valeursGen).toEqual({ v2: 'v2m1' })
    expect(blocs(payload)).toEqual([
      { loc: 1, texte: 'Passage 1.' },
      { loc: 3, texte: 'Passage 2.' },
    ])
  })

  test('deux homonymes du même entretien restent deux entrées distinctes', () => {
    const payload = importer(['', 'Alex', 'Alex'], [1, 2])
    expect(payload.locuteurs.map(({ index, nom }) => ({ index, nom }))).toEqual([
      { index: 1, nom: 'Alex' },
      { index: 2, nom: 'Alex' },
    ])
    expect(blocs(payload).map((bloc) => bloc.loc)).toEqual([1, 2])
  })

  test('les noms de rôle ou génériques et un nom d’un caractère sont importés', () => {
    const payload = importer(['', '?Enquêteur', 'Question', 'Inconnu', 'X'], [1, 2, 3, 4])
    expect(payload.locuteurs.map(({ index, nom, interviewer }) => ({ index, nom, interviewer }))).toEqual([
      { index: 1, nom: 'Enquêteur', interviewer: true },
      { index: 2, nom: 'Question', interviewer: false },
      { index: 3, nom: 'Inconnu', interviewer: false },
      { index: 4, nom: 'X', interviewer: false },
    ])
    expect(payload.locuteurs.every((locuteur) => locuteur.personneRef === null)).toBe(true)
  })

  test('un locuteur sans intervention reste présent avec ses valeurs locales', () => {
    const payload = importer(['', 'Alice', 'Bob'], [1], [{ v: 1, l: 2, m: 3 }])
    expect(payload.locuteurs.map((locuteur) => locuteur.nom)).toEqual(['Alice', 'Bob'])
    expect(payload.locuteurs[1].valeursLoc).toEqual({ v1: 'v1m3' })
    expect(blocs(payload).map((bloc) => bloc.loc)).toEqual([1])
  })

  test('les index numériques écrits en chaînes retrouvent les mêmes propriétaires', () => {
    const payload = importer(['', 'Alice', '', 'Bob'], ['3'], [{ v: 1, l: '3', m: 2 }])
    expect(payload.locuteurs[1]).toMatchObject({ index: 3, nom: 'Bob', valeursLoc: { v1: 'v1m2' } })
    expect(blocs(payload)).toEqual([{ loc: 3, texte: 'Passage 1.' }])
  })

  test('deux homonymes gardent séparément leurs rôles et leurs valeurs', () => {
    const payload = importer(['', '?Alex', 'Alex'], [1, 2], [
      { v: 1, l: 1, m: 2 },
      { v: 1, l: 2, m: 3 },
    ])
    expect(payload.locuteurs.map(({ index, nom, interviewer, valeursLoc }) => ({
      index, nom, interviewer, valeursLoc,
    }))).toEqual([
      { index: 1, nom: 'Alex', interviewer: true, valeursLoc: { v1: 'v1m2' } },
      { index: 2, nom: 'Alex', interviewer: false, valeursLoc: { v1: 'v1m3' } },
    ])
  })
})
