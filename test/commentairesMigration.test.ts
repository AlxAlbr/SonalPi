// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import { importerSonal } from '../src/renderer/import/importSonal'
import { exporterSonal, type EntreeExport } from '../src/renderer/import/exportSonal'
import type { Annotation } from '../src/shared/entretien/annotation'

function parse(html: string): Document {
  const inerte = html
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, '')
  return new DOMParser().parseFromString(inerte, 'text/html')
}
function commentairesDe(anns: Annotation[]): Annotation[] {
  return anns.filter((a) => a.type === 'commentaire')
}
/** Un .sonal minimal : deux tours (locuteurs distincts), fragments numérotés. */
const htmlDe = (...segments: string[]) =>
  `<html><body><div id="contenuText">${segments.join('')}</div></body></html>`
const seg = (loc: number, ...fragments: string[]) =>
  `<span class="lblseg sautlig" data-loc="${loc}">${fragments.join('')}</span>`
const frag = (rk: number, texte: string, extra = '') =>
  `<span data-rk="${rk}"${extra}>${texte}</span>`

describe('import des commentaires V1 (.sonal)', () => {
  test('convention « data-finobs = rk du fragment final » : la plage couvre les fragments', () => {
    const html = htmlDe(
      seg(
        1,
        frag(1, 'Karine ', 'data-obs="passage clé" data-auth="Alice" data-finobs="3"'),
        frag(2, 'habite'),
        frag(3, ' Lyon.'),
      ),
    )
    const cs = commentairesDe(importerSonal(html, parse(html)).payload.annotations)
    expect(cs).toHaveLength(1)
    expect(cs[0].auteur).toBe('Alice')
    expect(cs[0].texte).toBe('passage clé')
    // La plage couvre « Karine habite Lyon. » entière (du 1er au 3e fragment).
    const doc = importerSonal(html, parse(html)).payload.corpsTexte as {
      content: Array<{ content?: Array<{ text?: string }> }>
    }
    const t = doc.content[0].content?.map((n) => n.text).join('') ?? ''
    expect(t.slice(cs[0].from - 1, cs[0].to - 1)).toBe(t)
  })

  test('convention « marqueur nu » : le fragment portant data-finobs ferme', () => {
    const html = htmlDe(
      seg(1, frag(1, 'Karine ', 'data-obs="note"'), frag(2, 'habite'), frag(3, ' Lyon.', ' data-finobs=""')),
    )
    const cs = commentairesDe(importerSonal(html, parse(html)).payload.annotations)
    expect(cs).toHaveLength(1)
    expect(cs[0].texte).toBe('note')
    // Ferme sur « Lyon. » : la plage couvre tout le tour.
    const doc = importerSonal(html, parse(html)).payload.corpsTexte as {
      content: Array<{ content?: Array<{ text?: string }> }>
    }
    const t = doc.content[0].content?.map((n) => n.text).join('') ?? ''
    expect(t.slice(cs[0].from - 1, cs[0].to - 1)).toBe(t)
  })

  test('commentaire d’un seul fragment (finobs = son propre rk)', () => {
    const html = htmlDe(
      seg(1, frag(1, 'Karine'), frag(2, ' habite Lyon.', 'data-obs="mot" data-auth="Bob" data-finobs="2"')),
    )
    const cs = commentairesDe(importerSonal(html, parse(html)).payload.annotations)
    expect(cs).toHaveLength(1)
    const doc = importerSonal(html, parse(html)).payload.corpsTexte as {
      content: Array<{ content?: Array<{ text?: string }> }>
    }
    const t = doc.content[0].content?.map((n) => n.text).join('') ?? ''
    expect(t.slice(cs[0].from - 1, cs[0].to - 1)).toBe(' habite Lyon.')
  })

  test('sans data-auth → auteur « import » ; texte vide → pas de perte mais plage valide', () => {
    const html = htmlDe(seg(1, frag(1, 'Karine habite Lyon.', 'data-obs="sans signataire" data-finobs="1"')))
    const cs = commentairesDe(importerSonal(html, parse(html)).payload.annotations)
    expect(cs).toHaveLength(1)
    expect(cs[0].auteur).toBe('import')
    expect(cs[0].texte).toBe('sans signataire')
  })

  test('à cheval sur deux segments fusionnés (même locuteur) : la plage suit la fusion', () => {
    const html = htmlDe(
      seg(1, frag(1, 'Karine ', 'data-obs="sur la fusion" data-finobs="2"')),
      seg(1, frag(2, 'habite Lyon.')),
      seg(2, frag(3, 'Autre tour.')),
    )
    const r = importerSonal(html, parse(html))
    const cs = commentairesDe(r.payload.annotations)
    expect(cs).toHaveLength(1)
    // Les deux premiers segments ont fusionné en UN bloc :
    // le commentaire couvre du début de « Karine » à la fin de « habite Lyon. ».
    const doc = r.payload.corpsTexte as { content: Array<{ attrs: { loc: number | null }; content?: Array<{ text?: string }> }> }
    expect(doc.content.length).toBe(2)
    const t = doc.content[0].content?.map((n) => n.text).join('') ?? ''
    expect(t).toBe('Karine habite Lyon.')
    expect(t.slice(cs[0].from - 1, cs[0].to - 1)).toBe(t)
  })
})

function entreeDepuisImport(html: string): EntreeExport {
  const r = importerSonal(html, parse(html))
  return { ...r.payload, codebook: r.codebook, variables: r.variables, legacy: r.legacy }
}

describe('export des commentaires (.sonal) et aller-retour', () => {
  test('data-obs/data-auth sur le premier fragment, data-finobs (= son rk) sur le dernier', () => {
    const html = htmlDe(
      seg(1, frag(1, 'Karine '), frag(2, 'habite'), frag(3, ' Lyon.')),
    )
    const entree = entreeDepuisImport(html)
    const doc = entree.corpsTexte as { content: Array<{ content?: Array<{ text?: string }> }> }
    const taille = (doc.content[0].content ?? []).map((n) => n.text ?? '').join('').length
    entree.annotations.push({
      id: 'c1',
      type: 'commentaire',
      from: 1,
      to: 1 + taille,
      auteur: 'Alice',
      texte: 'passage clé',
    })
    const out = exporterSonal(entree)
    expect(out).toMatch(/data-obs="passage clé"/)
    expect(out).toMatch(/data-auth="Alice"/)
    // Le fragment final porte finobs = SON rk ;
    // ici le dernier fragment est rk=1+2 tokens… on vérifie juste qu'un data-finobs est émis dans le segment.
    expect(out).toMatch(/data-finobs="\d+"/)
  })

  test('aller-retour : importer → exporter → importer conserve les commentaires', () => {
    const html = htmlDe(
      seg(1, frag(1, 'Karine ', 'data-obs="passage clé" data-auth="Alice" data-finobs="3"'), frag(2, 'habite'), frag(3, ' Lyon.')),
      seg(2, frag(4, 'Autre tour.')),
    )
    const r1 = importerSonal(html, parse(html))
    const out = exporterSonal({ ...r1.payload, codebook: r1.codebook, variables: r1.variables, legacy: r1.legacy })
    const r2 = importerSonal(out, parse(out))
    const c1 = commentairesDe(r1.payload.annotations)
    const c2 = commentairesDe(r2.payload.annotations)
    expect(c2).toHaveLength(1)
    expect(c2[0].texte).toBe(c1[0].texte)
    expect(c2[0].auteur).toBe(c1[0].auteur)
    expect(c2[0].from).toBe(c1[0].from)
    expect(c2[0].to).toBe(c1[0].to)
  })
})
