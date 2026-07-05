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
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null, deb: null, fin: null }, content: [{ type: 'text', text: 'Karine habite Lyon.' }] }] },
    annotations: [{ id: 'a1', type: 'codage' as const, from: 15, to: 19, auteur: 'moi', code: 'cat_003' }],
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
    })
  }
})
