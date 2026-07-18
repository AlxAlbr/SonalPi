// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importerSonal } from '../src/renderer/import/importSonal'
import { exporterSonal } from '../src/renderer/import/exportSonal'
import type { Annotation } from '../src/shared/entretien/annotation'

function parse(html: string): Document {
  const inerte = html
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, '')
  return new DOMParser().parseFromString(inerte, 'text/html')
}
function fixture(nom: string): string {
  return readFileSync(join(process.cwd(), 'test/fixtures', nom), 'utf8')
}
function texteDe(corpsTexte: unknown): string {
  const doc = corpsTexte as { content: Array<{ content?: Array<{ text?: string }> }> }
  return doc.content.map((b) => (b.content ?? []).map((n) => n.text ?? '').join('')).join('\n')
}
function comptesCodage(anns: Annotation[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const a of anns) if (a.type === 'codage' && a.code) c[a.code] = (c[a.code] ?? 0) + 1
  return c
}
function anonCount(anns: Annotation[]): number {
  return anns.filter((a) => a.type === 'anon').length
}

const fixtures = ['entretien1.sonal', 'entretien2.sonal', 'entretien3.sonal']

describe('export .sonal — structure', () => {
  test('produit un HTML parsable avec #contenuText et des .lblseg', () => {
    const html = fixture('entretien1.sonal')
    const { payload, codebook, variables, legacy } = importerSonal(html, parse(html))
    const out = exporterSonal({ ...payload, codebook, variables, legacy })
    expect(out).toContain('contenuText')
    expect(out).toContain('lblseg')
    expect(parse(out).getElementById('contenuText')).not.toBeNull()
  })
})

describe('export .sonal — couleur des codages (visibilité dans SonalPi)', () => {
  const base = {
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Karine habite Lyon.' }] }] },
    annotations: [{ id: 'a1', type: 'codage' as const, from: 15, to: 19, auteur: 'moi', code: 'cat_003' }],
    ancres: [],
    locuteurs: [],
    variables: [],
    meta: { valeursGen: {} },
    legacy: { tabAnon: null, notes: '' },
  }

  test('une catégorie SANS couleur stockée → couleur synthétisée dans le CSS (codage visible)', () => {
    const out = exporterSonal({
      ...base,
      codebook: [{ id: 'cat_003', nom: 'Lieu', ordre: 0, parent: null, actif: true, codeExport: 'cat_003' }],
    })
    expect(out).toContain('<span class="cat_003"') // le codage est là
    const css = out.match(/\.cat_003\s*\{[\s\S]*?\}/)?.[0] ?? ''
    expect(css).toContain('linear-gradient') // ...et coloré (pas .cat_003{})
    expect(css).toMatch(/#[0-9a-f]{6}/i)
  })

  test('une catégorie AVEC couleur stockée garde la sienne', () => {
    const out = exporterSonal({
      ...base,
      codebook: [{ id: 'cat_003', nom: 'Lieu', couleur: '#0331ff', ordre: 0, parent: null, actif: true, codeExport: 'cat_003' }],
    })
    expect(out.match(/\.cat_003\s*\{[\s\S]*?\}/)?.[0]).toContain('#0331ff')
  })

  test('la taille de police sort en nombre nu SonalPi ; absente → "" (cat-json)', () => {
    const out = exporterSonal({
      ...base,
      codebook: [
        { id: 'cat_003', nom: 'Lieu', taille: 18, ordre: 0, parent: null, actif: true, codeExport: 'cat_003' },
        { id: 'cat_004', nom: 'Autre', ordre: 1, parent: null, actif: true, codeExport: 'cat_004' },
      ],
    })
    const catJson = out.match(/<script[^>]*id="cat-json"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? ''
    expect(catJson).toContain('"taille":18')
    expect(catJson).toMatch(/"cat_004"[^\]]*"taille":""/)
  })
})

describe('export .sonal — un lblseg par intervalle d’ancres (S7, D-S15)', () => {
  test('un tour fusionné ressort re-découpé en cues ; le ré-import re-fusionne (stable)', () => {
    // Un tour (loc 1) né de la fusion de 2 cues : « Un deux. » [0→2] puis
    // « Trois quatre. » [3→5] — la frontière interne vit à la pos 10 (2 ancres).
    const entree = {
      corpsTexte: {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Un deux. Trois quatre.' }] },
        ],
      },
      annotations: [],
      ancres: [
        { pos: 1, t: 0 },
        { pos: 10, t: 2 },
        { pos: 10, t: 3 },
        { pos: 23, t: 5 },
      ],
      locuteurs: [{ index: 1, nom: 'Speaker 3', valeursLoc: {}, personneRef: null }],
      codebook: [],
      variables: [],
      meta: { valeursGen: {} },
      legacy: { tabAnon: null, notes: '' },
    }
    const out = exporterSonal(entree)

    // SonalPi garde sa granularité : 2 segments, chacun avec SES timecodes
    // (la 1re ancre de la frontière ferme le cue 1, la dernière ouvre le cue 2).
    const segs = Array.from(parse(out).querySelectorAll('.lblseg')) as HTMLElement[]
    expect(segs.map((s) => [s.dataset.deb, s.dataset.fin, s.dataset.loc])).toEqual([
      ['0', '2', '1'],
      ['3', '5', '1'],
    ])

    // Ré-import : les 2 cues de même loc se RE-fusionnent — texte, bloc unique
    // et ancres identiques (round-trip canonique).
    const r = importerSonal(out, parse(out))
    const doc = r.payload.corpsTexte as { content: Array<{ attrs: { loc: number | null } }> }
    expect(doc.content.length).toBe(1)
    expect(doc.content[0].attrs.loc).toBe(1)
    expect(texteDe(r.payload.corpsTexte)).toBe('Un deux. Trois quatre.')
    expect(r.payload.ancres).toEqual(entree.ancres)
  })
})

describe('interviewer — le « ? » SonalPi est un artefact d’export (drapeau au modèle)', () => {
  test('export : « Nom? » dans tabLoc ; ré-import : drapeau posé, nom nettoyé', () => {
    const out = exporterSonal({
      corpsTexte: {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Une question.' }] }],
      },
      annotations: [],
      ancres: [],
      locuteurs: [
        { index: 1, nom: 'Enquêteur', interviewer: true, valeursLoc: {}, personneRef: null },
        { index: 2, nom: 'Karine', interviewer: false, valeursLoc: {}, personneRef: null },
      ],
      codebook: [],
      variables: [],
      meta: { valeursGen: {} },
      legacy: { tabAnon: null, notes: '' },
    })
    expect(out).toContain('Enquêteur?') // la convention SonalPi, dans loc-json

    const r = importerSonal(out, parse(out))
    expect(r.payload.locuteurs).toEqual([
      { index: 1, nom: 'Enquêteur', interviewer: true, valeursLoc: {}, personneRef: null },
      { index: 2, nom: 'Karine', interviewer: false, valeursLoc: {}, personneRef: null },
    ])
  })
})

describe('round-trip import → export → ré-import (golden : rien ne se perd)', () => {
  for (const nom of fixtures) {
    test(`${nom} : texte, codages, anon et locuteurs préservés`, () => {
      const html = fixture(nom)
      const r1 = importerSonal(html, parse(html))
      const out = exporterSonal({ ...r1.payload, codebook: r1.codebook, variables: r1.variables, legacy: r1.legacy })
      const r2 = importerSonal(out, parse(out))

      expect(texteDe(r2.payload.corpsTexte)).toBe(texteDe(r1.payload.corpsTexte))
      expect(comptesCodage(r2.payload.annotations)).toEqual(comptesCodage(r1.payload.annotations))
      expect(anonCount(r2.payload.annotations)).toBe(anonCount(r1.payload.annotations))
      expect(r2.payload.locuteurs).toEqual(r1.payload.locuteurs)
      // Ancres (D-S14) : re-dérivées en data-deb/data-fin à l'export, relues à
      // l'import — les timecodes mesurés survivent au round-trip.
      expect(r2.payload.ancres).toEqual(r1.payload.ancres)
    })
  }
})
