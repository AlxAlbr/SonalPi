// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importerSonal } from '../src/renderer/formatSonal/importSonal'
import { exporterSonal } from '../src/renderer/formatSonal/exportSonal'
import type { EntreeExport } from '../src/shared/export/types'
import type { Annotation } from '../src/shared/entretien/annotation'
import type { BrouillonAnon } from '../src/shared/format'

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

describe('brouillons d’anonymisation — round-trip', () => {
  test('les brouillons sont sérialisés dans l’anon-json en portee « brouillon » (occurrences:0)', () => {
    const html = fixture('entretien1.sonal')
    const r = importerSonal(parse(html))
    const avecBrouillons: EntreeExport & { brouillonsAnon: BrouillonAnon[] } = {
      ...r.payload,
      brouillonsAnon: [
        { entite: 'Karine', pseudo: 'Marie' },
        { entite: 'Lyon' },
      ],
      codebook: r.codebook,
      variables: r.variables,
      legacy: r.legacy,
    }
    const out = exporterSonal(avecBrouillons)
    expect(out).toContain('"portee":"brouillon"')
    expect(out).toContain('"entite":"Karine"')
    expect(out).toContain('"remplacement":"Marie"')
    expect(out).toContain('"occurrences":0')
  })
  test('sans brouillons ni règle appliquée → anon-json vide', () => {
    const html = fixture('entretien1.sonal')
    const r = importerSonal(parse(html))
    const out = exporterSonal({ ...r.payload, codebook: r.codebook, variables: r.variables, legacy: r.legacy })
    expect(out).toContain('<script id="anon-json" type="application/json">')
    expect(out).not.toContain('"portee":"brouillon"')
  })
})

describe('export .sonal — règles corpus (portée corpus)', () => {
  test('une occurrence liée à une règle corpus → entrée portee « corpus » dans l’anon-json', () => {
    const html = fixture('entretien1.sonal')
    const r = importerSonal(parse(html))
    const regle = { id: 'reg-1', entite: ['Karine'], pseudos: ['Claire', 'Rebecca'] }
    const out = exporterSonal({
      ...r.payload,
      annotations: [
        { id: 'a', type: 'anon' as const, from: 1, to: 7, auteur: 'moi', etat: 'anonymise' as const, pseudo: 'Claire', regle: 'reg-1' },
      ],
      reglesAnon: [regle],
      codebook: r.codebook,
      variables: r.variables,
      legacy: r.legacy,
    })
    expect(out).toContain('"entite":"Karine"')
    expect(out).toContain('"remplacement":"Claire"')
    expect(out).toContain('"remplacementAlt":"Rebecca"')
    expect(out).toContain('"portee":"corpus"')
  })
  test('une règle non appliquée dans l’entretien → absente de son anon-json', () => {
    const html = fixture('entretien1.sonal')
    const r = importerSonal(parse(html))
    const out = exporterSonal({
      ...r.payload,
      reglesAnon: [{ id: 'reg-x', entite: ['Autre'], pseudos: ['A'] }],
      codebook: r.codebook,
      variables: r.variables,
      legacy: r.legacy,
    })
    expect(out).not.toContain('"entite":"Autre"')
  })
})

const fixtures = ['entretien1.sonal', 'entretien2.sonal', 'entretien3.sonal']

describe('export .sonal — structure', () => {
  test('produit un HTML parsable avec #contenuText et des .lblseg', () => {
    const html = fixture('entretien1.sonal')
    const { payload, codebook, variables, legacy } = importerSonal(parse(html))
    const out = exporterSonal({ ...payload, codebook, variables, legacy })
    expect(out).toContain('contenuText')
    expect(out).toContain('lblseg')
    expect(parse(out).getElementById('contenuText')).not.toBeNull()
  })
})

describe('export .sonal — couleur des codages (visibilité dans SonalPi1)', () => {
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

  test('la taille de police sort en nombre nu SonalPi1 ; absente → "" (cat-json)', () => {
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

describe('export .sonal — un lblseg par intervalle d’ancres', () => {
  test('un tour fusionné ressort re-découpé en cues ; le ré-import re-fusionne (stable)', () => {
    // Un tour (loc 1) né de la fusion de 2 cues : « Un deux. » [0→2] puis « Trois quatre. » [3→5] —
    // la frontière interne vit à la pos 10 (2 ancres).
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

    // SonalPi1 garde sa granularité : 2 segments, chacun avec SES timecodes (la 1re ancre de la frontière ferme le cue 1,
    // la dernière ouvre le cue 2).
    const segs = Array.from(parse(out).querySelectorAll('.lblseg')) as HTMLElement[]
    expect(segs.map((s) => [s.dataset.deb, s.dataset.fin, s.dataset.loc])).toEqual([
      ['0', '2', '1'],
      ['3', '5', '1'],
    ])

    // Ré-import : les 2 cues de même loc se RE-fusionnent — texte, bloc unique et ancres identiques (round-trip canonique).
    const r = importerSonal(parse(out))
    const doc = r.payload.corpsTexte as { content: Array<{ attrs: { loc: number | null } }> }
    expect(doc.content.length).toBe(1)
    expect(doc.content[0].attrs.loc).toBe(1)
    expect(texteDe(r.payload.corpsTexte)).toBe('Un deux. Trois quatre.')
    expect(r.payload.ancres).toEqual(entree.ancres)
  })
})

describe('interviewer — le « ? » SonalPi1 est un artefact d’export (drapeau au modèle)', () => {
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
    expect(out).toContain('Enquêteur?') // la convention SonalPi1, dans loc-json

    const r = importerSonal(parse(out))
    expect(r.payload.locuteurs).toEqual([
      { index: 1, nom: 'Enquêteur', interviewer: true, valeursLoc: {}, personneRef: null },
      { index: 2, nom: 'Karine', interviewer: false, valeursLoc: {}, personneRef: null },
    ])
  })
})

describe('round-trip anon — spans .anon, data-pseudo et exception préservés', () => {
  test('entretien1 : pseudos « Marie » et « test », une exception, restitués à l’export puis au ré-import', () => {
    const html = fixture('entretien1.sonal')
    const r = importerSonal(parse(html))
    const anns = r.payload.annotations.filter((a) => a.type === 'anon')
    // à l’import : les pseudos lus sur les data-pseudo des spans.
    const pseudos = new Set(anns.map((a) => a.pseudo ?? ''))
    expect(pseudos.has('Marie')).toBe(true)
    expect(pseudos.has('test')).toBe(true)
    expect(anns.filter((a) => a.etat === 'exception')).toHaveLength(1)

    const out = exporterSonal({ ...r.payload, codebook: r.codebook, variables: r.variables, legacy: r.legacy })
    // à l’export : les spans .anon ré-émettent data-pseudo ; l’exception sa classe.
    expect(out).toContain('data-pseudo="Marie"')
    expect(out).toContain('data-pseudo="test"')
    expect(out).toContain('anon-exception')

    // ré-import : pseudos (triés, multi-occurrences) et états préservés.
    const r2 = importerSonal(parse(out))
    const anns2 = r2.payload.annotations.filter((a) => a.type === 'anon')
    expect(anns2.map((a) => a.pseudo ?? '').sort()).toEqual(anns.map((a) => a.pseudo ?? '').sort())
    expect(anns2.filter((a) => a.etat === 'exception')).toHaveLength(1)
    expect(anns2).toHaveLength(anns.length)
  })

  test('une exception ne re-sérialise JAMAIS de data-pseudo, même avec une mémoire de modèle', () => {
    const html = fixture('entretien1.sonal')
    const r = importerSonal(parse(html))
    const exc = r.payload.annotations.find((a) => a.etat === 'exception')
    expect(exc).toBeDefined()
    // Le menu contextuel (basculerException) conserve le pseudo en MÉMOIRE de modèle —
    // il ne doit JAMAIS fuir dans le .sonal.
    if (exc) exc.pseudo = 'Souvenir'
    const out = exporterSonal({
      ...r.payload,
      codebook: r.codebook,
      variables: r.variables,
      legacy: r.legacy,
    })
    // la classe est re-sérialisée…
    expect(out).toContain('anon-exception')
    // …jamais le pseudo.
    expect(out).not.toContain('data-pseudo="Souvenir"')
  })

  test('libellé de tour pseudonymisé : round-trip loc-anon + data-locpseudo sans perte', () => {
    const html = fixture('entretien1.sonal')
    const r = importerSonal(parse(html))
    const l = r.payload.locuteurs.find((x) => x.index === 1)!
    l.pseudo = 'Chercheur'
    l.pseudoEtat = 'confirme'
    const out = exporterSonal({
      ...r.payload,
      codebook: r.codebook,
      variables: r.variables,
      legacy: r.legacy,
    })
    // à l'export : le 1er segment du tour porte ligloc + loc-anon + data-locpseudo.
    expect(out).toContain('class="lblseg sautlig ligloc loc-anon"')
    expect(out).toContain('data-locpseudo="Chercheur"')
    // ré-import : pseudo + état retrouvés.
    const r2 = importerSonal(parse(out))
    const l2 = r2.payload.locuteurs.find((x) => x.index === 1)
    expect(l2?.pseudo).toBe('Chercheur')
    expect(l2?.pseudoEtat).toBe('confirme')
    // les autres marqueurs subsistent (ligloc nu sur les autres tours)
    expect(out).toContain('class="lblseg sautlig ligloc"')
  })

  test('refus de libellé : loc-suggere-refuse à l\u2019export, JAMAIS de data-locpseudo', () => {
    const html = fixture('entretien1.sonal')
    const r = importerSonal(parse(html))
    const l = r.payload.locuteurs.find((x) => x.index === 1)!
    l.pseudo = 'Chercheur' // mémoire conservée (pseudo maintenu)…
    l.pseudoEtat = 'refuse' // …mais refus explicite : le nom reste en clair
    const out = exporterSonal({
      ...r.payload,
      codebook: r.codebook,
      variables: r.variables,
      legacy: r.legacy,
    })
    expect(out).toContain('class="lblseg sautlig ligloc loc-suggere-refuse"')
    expect(out).not.toContain('data-locpseudo')
    const r2 = importerSonal(parse(out))
    const l2 = r2.payload.locuteurs.find((x) => x.index === 1)
    expect(l2?.pseudoEtat).toBe('refuse')
    expect(l2?.pseudo ?? '').toBe('') // la mémoire ne traverse pas le .sonal d'un refus
  })
})

describe('round-trip import → export → ré-import (golden : rien ne se perd)', () => {
  for (const nom of fixtures) {
    test(`${nom} : texte, codages, anon et locuteurs préservés`, () => {
      const html = fixture(nom)
      const r1 = importerSonal(parse(html))
      const out = exporterSonal({ ...r1.payload, codebook: r1.codebook, variables: r1.variables, legacy: r1.legacy })
      const r2 = importerSonal(parse(out))

      expect(texteDe(r2.payload.corpsTexte)).toBe(texteDe(r1.payload.corpsTexte))
      expect(comptesCodage(r2.payload.annotations)).toEqual(comptesCodage(r1.payload.annotations))
      expect(anonCount(r2.payload.annotations)).toBe(anonCount(r1.payload.annotations))
      expect(r2.payload.locuteurs).toEqual(r1.payload.locuteurs)
      // Ancres : re-dérivées en data-deb/data-fin à l'export, relues à l'import —
      // les timecodes mesurés survivent au round-trip.
      expect(r2.payload.ancres).toEqual(r1.payload.ancres)
    })
  }
})

describe('export .sonal — round-trip anon-json (règle corpus + brouillon survivent)', () => {
  test('export → ré-import : une règle corpus redevient reglesAnon, un brouillon redevient brouillonAnon', () => {
    const html = fixture('entretien1.sonal')
    const r = importerSonal(parse(html))
    const regle = [{ id: 'reg-RT', entite: ['Karine'], pseudos: ['Claire', 'Rebecca'] }]
    const out = exporterSonal({
      ...r.payload,
      annotations: [
        { id: 'a', type: 'anon' as const, from: 1, to: 7, auteur: 'moi', etat: 'anonymise' as const, pseudo: 'Claire', regle: 'reg-RT' },
      ],
      reglesAnon: regle,
      brouillonsAnon: [{ entite: 'Lyon' }],
      codebook: r.codebook,
      variables: r.variables,
      legacy: r.legacy,
    })
    const r2 = importerSonal(parse(out))
    expect(r2.reglesAnon).toHaveLength(1)
    expect(r2.reglesAnon[0].pseudos).toEqual(['Claire', 'Rebecca'])
    expect(r2.reglesAnon[0].entite).toEqual(['Karine'])
    expect(r2.payload.brouillonsAnon).toEqual([{ entite: 'Lyon' }])
    // Le pass-through legacy est consommé sur l'import (tabAnon null).
    expect(r2.legacy.tabAnon).toBeNull()
  })
})

describe('export .sonal — round-trip RÉEL via la fixture (règles liées à l’import)', () => {
  test('importer entretien1 → ses occurrences anon sont liées → l’export ré-émet la règle corpus', () => {
    const html = fixture('entretien1.sonal')
    const r = importerSonal(parse(html))
    // La fixture porte un anon-json de règles (portee corpus) : les occurrences anon issues des spans sont donc liées à une règle → l'export les ré-émet.
    const regles = r.reglesAnon
    expect(regles.length).toBeGreaterThan(0)
    // Au moins une annotation anon est liée à une règle (round-trip).
    expect(r.payload.annotations.some((a) => a.type === 'anon' && a.regle)).toBe(true)
    const out = exporterSonal({
      ...r.payload,
      reglesAnon: regles,
      codebook: r.codebook,
      variables: r.variables,
      legacy: r.legacy,
    })
    expect(out).toContain('"portee":"corpus"')
    // Ré-import de l'export → la règle redevient reglesAnon (sans perte).
    const r2 = importerSonal(parse(out))
    expect(r2.reglesAnon.length).toBeGreaterThan(0)
    expect(r2.payload.annotations.some((a) => a.type === 'anon' && a.regle)).toBe(true)
  })
})
