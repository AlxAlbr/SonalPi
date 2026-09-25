// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  importerVariables,
  distribuerValeurs,
  exporterVariables,
  exporterValeurs,
} from '../src/renderer/formatSonal/eav'
import { importerSonal } from '../src/renderer/formatSonal/importSonal'
import { exporterSonal } from '../src/renderer/formatSonal/exportSonal'
import { extractFichierSonal } from '../src/renderer/formatSonal/legacy/conversions.mjs'
import type { Locuteur } from '../src/renderer/../shared/format'

function parse(html: string): Document {
  const inerte = html
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, '')
  return new DOMParser().parseFromString(inerte, 'text/html')
}
function fixture(nom: string): string {
  return readFileSync(join(process.cwd(), 'test/fixtures', nom), 'utf8')
}
function loc(index: number): Locuteur {
  return { index, nom: `L${index}`, valeursLoc: {}, personneRef: null }
}

describe('EAV — importerVariables (tabVar/tabDic → modèle, ids déterministes)', () => {
  const tabVar = [
    { v: 1, lib: 'Lieu', champ: 'gen', priv: 'false' },
    { v: 2, lib: 'sexe', champ: 'loc', priv: 'true' },
  ]
  const tabDic = [
    { v: 1, m: 0, lib: '' },
    { v: 1, m: 1, lib: 'Lyon' },
    { v: 2, m: 1, lib: 'Homme' },
    { v: 2, m: 2, lib: 'Femme' },
    { v: 9, m: 1, lib: 'orpheline' }, // variable absente de tabVar → ignorée
  ]

  test('ids déterministes v{n} / v{n}m{m} et portée déduite du champ', () => {
    const vars = importerVariables(tabVar, tabDic)
    expect(vars.map((v) => v.id)).toEqual(['v1', 'v2'])
    expect(vars[0].portee).toBe('entretien') // champ "gen"
    expect(vars[1].portee).toBe('locuteur') // champ "loc"
    expect(vars[0].vExport).toBe(1)
    expect(vars[1].priv).toBe(true) // "true" → booléen
    expect(vars[0].priv).toBe(false)
  })

  test('modalités rattachées à leur variable ; orpheline ignorée', () => {
    const vars = importerVariables(tabVar, tabDic)
    expect(vars[0].modalites.map((m) => m.id)).toEqual(['v1m0', 'v1m1'])
    expect(vars[1].modalites.find((m) => m.lib === 'Femme')?.mExport).toBe(2)
    // pas de variable v9 créée par une modalité orpheline.
    expect(vars.find((v) => v.id === 'v9')).toBeUndefined()
  })

  test('entrées absentes → tableaux vides (robuste au null)', () => {
    expect(importerVariables(null, null)).toEqual([])
  })
})

describe('EAV — distribuerValeurs (tabDat → propriétaires)', () => {
  test('l="all" → valeursGen ; l=index → valeursLoc du locuteur', () => {
    const locuteurs = [loc(1), loc(2)]
    const dat = [
      { e: '2', v: 1, l: 'all', m: 1 },
      { e: '2', v: 2, l: 1, m: 0 },
      { e: '2', v: 2, l: 2, m: 1 },
    ]
    const valeursGen = distribuerValeurs(dat, locuteurs)
    expect(valeursGen).toEqual({ v1: 'v1m1' })
    expect(locuteurs[0].valeursLoc).toEqual({ v2: 'v2m0' })
    expect(locuteurs[1].valeursLoc).toEqual({ v2: 'v2m1' })
  })

  test('valeur pointant un locuteur inexistant → ignorée (pas de fantôme)', () => {
    const locuteurs = [loc(1)]
    const valeursGen = distribuerValeurs([{ v: 2, l: 7, m: 1 }], locuteurs)
    expect(valeursGen).toEqual({})
    expect(locuteurs[0].valeursLoc).toEqual({})
  })
})

describe('EAV — export (modèle → legacy, sentinelle réintroduite ici seulement)', () => {
  const variables = importerVariables(
    [
      { v: 1, lib: 'Lieu', champ: 'gen', priv: 'false' },
      { v: 2, lib: 'sexe', champ: 'loc', priv: 'false' },
    ],
    [
      { v: 1, m: 1, lib: 'Lyon' },
      { v: 2, m: 1, lib: 'Homme' },
    ],
  )

  test('exporterVariables → tabVar (champ) + tabDic (codes)', () => {
    const { tabVar, tabDic } = exporterVariables(variables)
    expect(tabVar).toEqual([
      { v: 1, lib: 'Lieu', champ: 'gen', priv: 'false' },
      { v: 2, lib: 'sexe', champ: 'loc', priv: 'false' },
    ])
    expect(tabDic).toEqual([
      { v: 1, m: 1, lib: 'Lyon' },
      { v: 2, m: 1, lib: 'Homme' },
    ])
  })

  test('exporterValeurs réintroduit l="all" + e, ignore les valeurs inconnues', () => {
    const locuteurs = [loc(1)]
    locuteurs[0].valeursLoc = { v2: 'v2m1', vX: 'vXmY' } // vX inconnue → ignorée
    const dat = exporterValeurs({ v1: 'v1m1' }, locuteurs, variables)
    expect(dat).toContainEqual({ e: '1', v: 1, l: 'all', m: 1 })
    expect(dat).toContainEqual({ e: '1', v: 2, l: 1, m: 1 })
    expect(dat).toHaveLength(2) // vX/vXmY écartée
  })
})

describe('EAV — round-trip GOLDEN sur les fixtures (SUITE S1 : rien ne se perd)', () => {
  for (const nom of ['entretien1.sonal', 'entretien2.sonal', 'entretien3.sonal']) {
    test(`${nom} : variables + valeurs identiques après export → ré-import`, () => {
      const html = fixture(nom)
      const r1 = importerSonal(parse(html))
      const out = exporterSonal({
        ...r1.payload,
        codebook: r1.codebook,
        variables: r1.variables,
        legacy: r1.legacy,
      })
      const r2 = importerSonal(parse(out))

      // Définitions de variables (ids, portée, modalités) préservées.
      expect(r2.variables).toEqual(r1.variables)
      // Valeurs de portée entretien.
      expect(r2.payload.meta.valeursGen).toEqual(r1.payload.meta.valeursGen)
      // Valeurs de portée locuteur (par index).
      const parIndex = (ls: typeof r1.payload.locuteurs) =>
        Object.fromEntries(ls.map((l) => [l.index, l.valeursLoc]))
      expect(parIndex(r2.payload.locuteurs)).toEqual(parIndex(r1.payload.locuteurs))
    })
  }

  test('entretien2 porte de vraies valeurs (le golden n’est pas vide)', () => {
    const html = fixture('entretien2.sonal')
    const r = importerSonal(parse(html))
    expect(Object.keys(r.payload.meta.valeursGen).length).toBeGreaterThan(0)
    expect(r.payload.locuteurs.some((l) => Object.keys(l.valeursLoc).length > 0)).toBe(true)
  })

  test('hiérarchie des thèmes : parent reconstruit à l’import + round-trip sans perte', () => {
    const html = fixture('entretien1.sonal')
    const r1 = importerSonal(parse(html))
    const parents = Object.fromEntries(r1.codebook.map((c) => [c.id, c.parent]))
    // entretien1 : cat_001 (Pondérations) racine ; cat_002/003/004 ses enfants ;
    // cat_005 (Cat1) racine ; cat_006/007 ses enfants ; cat_008 (Cat2) racine.
    expect(parents['cat_001']).toBeNull()
    expect(parents['cat_002']).toBe('cat_001')
    expect(parents['cat_006']).toBe('cat_005')
    expect(parents['cat_008']).toBeNull()
    // export (rang=profondeur, pré-ordre) → ré-import : mêmes parents.
    const out = exporterSonal({ ...r1.payload, codebook: r1.codebook, variables: r1.variables, legacy: r1.legacy })
    const r2 = importerSonal(parse(out))
    expect(Object.fromEntries(r2.codebook.map((c) => [c.id, c.parent]))).toEqual(parents)
  })

  test('le tabDat exporté est relu par le parseur SonalPi1 (extractFichierSonal)', () => {
    const html = fixture('entretien2.sonal')
    const r1 = importerSonal(parse(html))
    const out = exporterSonal({
      ...r1.payload,
      codebook: r1.codebook,
      variables: r1.variables,
      legacy: r1.legacy,
    })
    // Le juge de paix : le parseur d'origine SonalPi1 lit notre export.
    const relu = extractFichierSonal(out, parse(out))
    const dat = relu.tabDat as Array<{ v: number; l: string | number; m: number }>
    // la valeur de portée entretien (Lieu=MonTest → v1,l="all",m1) ressort.
    expect(dat.some((d) => d.v === 1 && d.l === 'all' && d.m === 1)).toBe(true)
    // et une valeur de portée locuteur (l=index numérique).
    expect(dat.some((d) => typeof d.l === 'number')).toBe(true)
  })
})
