// @vitest-environment happy-dom
import { describe, test, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BlocAttributs } from '../src/renderer/editor/schema'
import { importerSonal } from '../src/renderer/import/importSonal'
import type { Annotation } from '../src/shared/entretien/annotation'

function parse(html: string): Document {
  // happy-dom tente de FETCH les <link>/<script src> externes (bootstrap CDN…) —
  // ce qu'un vrai DOMParser de navigateur ne fait pas. On les retire en test.
  const inerte = html
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, '')
  return new DOMParser().parseFromString(inerte, 'text/html')
}
function fixture(nom: string): string {
  return readFileSync(join(process.cwd(), 'test/fixtures', nom), 'utf8')
}
function comptesCodage(anns: Annotation[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const a of anns) if (a.type === 'codage' && a.code) c[a.code] = (c[a.code] ?? 0) + 1
  return c
}

const html1 = fixture('entretien1.sonal')

describe('import .sonal — invariants (golden)', () => {
  test('le texte est chargé dans les blocs', () => {
    const { payload } = importerSonal(html1, parse(html1))
    const s = JSON.stringify(payload.corpsTexte)
    expect(s).toContain('Karine')
    expect(s).toContain('retraite')
  })

  test('un bloc par segment (attr loc) ; les timecodes deviennent des ANCRES', () => {
    const { payload } = importerSonal(html1, parse(html1))
    const doc = payload.corpsTexte as { content: Array<{ attrs: Record<string, unknown> }> }
    expect(doc.content.length).toBeGreaterThan(3)
    // au moins un bloc porte un locuteur ; les blocs n'ont PLUS de deb/fin.
    expect(doc.content.some((b) => b.attrs.loc !== null)).toBe(true)
    expect(doc.content.every((b) => !('deb' in b.attrs) && !('fin' in b.attrs))).toBe(true)
    // ...et les timecodes mesurés sont là, en ancres {pos, t} triées par pos.
    expect(payload.ancres.length).toBeGreaterThan(0)
    for (let i = 1; i < payload.ancres.length; i++)
      expect(payload.ancres[i].pos).toBeGreaterThanOrEqual(payload.ancres[i - 1].pos)
  })

  test('les codages cat_XXX deviennent des annotations (cat_005 présent)', () => {
    const { payload } = importerSonal(html1, parse(html1))
    const c = comptesCodage(payload.annotations)
    expect(c['cat_005']).toBeGreaterThan(0)
  })

  test('les anonymisations deviennent des annotations anon', () => {
    const { payload } = importerSonal(html1, parse(html1))
    expect(payload.annotations.filter((a) => a.type === 'anon').length).toBeGreaterThan(0)
  })

  test('les locuteurs viennent de loc-json (index + nom)', () => {
    const { payload } = importerSonal(html1, parse(html1))
    const noms = payload.locuteurs.map((l) => l.nom)
    expect(noms).toContain('Interwiever1')
    expect(noms).toContain('Interwievé1')
    // l'index 0 (vide) est exclu
    expect(payload.locuteurs.every((l) => l.index > 0)).toBe(true)
  })

  test('le codebook est extrait de cat-json (cat_005 = « Cat1 »)', () => {
    const { codebook } = importerSonal(html1, parse(html1))
    const cat5 = codebook.find((c) => c.id === 'cat_005')
    expect(cat5?.nom).toBe('Cat1')
    expect(cat5?.codeExport).toBe('cat_005')
  })

  test('la taille de police SonalPi est importée (nombre nu ; "" → absente)', () => {
    const { codebook } = importerSonal(html1, parse(html1))
    // entretien1 : cat_002 porte taille 24 ; cat_005 porte '' (pas de taille).
    expect(codebook.find((c) => c.id === 'cat_002')?.taille).toBe(24)
    expect(codebook.find((c) => c.id === 'cat_005')?.taille).toBeUndefined()
  })

  test('anon et notes restent en pass-through legacy (SUITE S1)', () => {
    const { legacy } = importerSonal(html1, parse(html1))
    // entretien1 porte des règles d'anon → tabAnon non vide.
    expect(legacy.tabAnon).not.toBeNull()
  })

  test('les variables var/dic-json entrent dans le modèle (fin du pass-through EAV)', () => {
    const { variables } = importerSonal(html1, parse(html1))
    // entretien1 : v1 Lieu (gen), v2 sexe (loc) + modalités.
    const v1 = variables.find((v) => v.id === 'v1')
    expect(v1?.lib).toBe('Lieu')
    expect(v1?.portee).toBe('entretien')
    expect(v1?.vExport).toBe(1)
    const v2 = variables.find((v) => v.id === 'v2')
    expect(v2?.portee).toBe('locuteur')
    // modalités (v,m) → ids déterministes v2m1/v2m2…
    expect(v2?.modalites.map((m) => m.lib)).toContain('Homme')
    expect(v2?.modalites.find((m) => m.lib === 'Femme')?.id).toBe('v2m2')
  })
})

describe('import .sonal — CORRECTION DES POSITIONS (le point dur char→PM)', () => {
  let editor: Editor | null = null
  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  test('les positions d’annotation résolvent EXACTEMENT le texte marqué', () => {
    const { payload } = importerSonal(html1, parse(html1))
    editor = new Editor({
      content: payload.corpsTexte as Record<string, unknown>,
      extensions: [StarterKit, BlocAttributs],
    })
    const doc = editor.state.doc

    // Toutes les annotations résolvent une plage non vide DANS les bornes du doc.
    for (const a of payload.annotations) {
      expect(a.to).toBeLessThanOrEqual(doc.content.size)
      expect(doc.textBetween(a.from, a.to).length).toBeGreaterThan(0)
    }

    // Cible connue de la fixture : le 1er cat_005 marque « d'avoir ».
    const cat5 = payload.annotations.find((a) => a.code === 'cat_005')!
    expect(doc.textBetween(cat5.from, cat5.to)).toBe("d'avoir ")
  })
})
