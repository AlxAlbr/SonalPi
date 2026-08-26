import { describe, expect, it } from 'vitest'
import { rechercherDansCorpsTexte } from '../src/renderer/editor/rechercheCorpus'

const corps = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { loc: 1 },
      content: [{ type: 'text', text: 'Karine habite Lyon depuis sa retraite.' }],
    },
    {
      type: 'paragraph',
      attrs: { loc: 2 },
      content: [{ type: 'text', text: 'Elle parle souvent de son travail passe.' }],
    },
  ],
}

describe('rechercherDansCorpsTexte', () => {
  it('trouve une occurrence unique avec sa position PM', () => {
    const occ = rechercherDansCorpsTexte(corps, 'habite')
    expect(occ).toHaveLength(1)
    // « Karine habite » : h est l'offset 7 du 1er bloc, dont le contenu commence à la position PM 1.
    expect(occ[0].pos).toBe(1 + 7)
    expect(occ[0].match).toBe('habite')
    expect(occ[0].pre).toContain('Karine')
  })

  it('est insensible à la casse', () => {
    const occ = rechercherDansCorpsTexte(corps, 'KARINE')
    expect(occ).toHaveLength(1)
    expect(occ[0].match).toBe('Karine')
    expect(occ[0].pos).toBe(1) // 1er caractère du 1er bloc
    expect(occ[0].pourcent).toBe(0) // tout début du texte
  })

  it('calcule un pourcentage sur l\'axe caractères (0..100)', () => {
    const un = { type: 'doc', content: [
      { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Debut mot fin.' }] },
    ] }
    const debut = rechercherDansCorpsTexte(un, 'Debut')
    expect(debut[0].pourcent).toBe(0) // tout début du texte
    const fin = rechercherDansCorpsTexte(un, 'fin')
    expect(fin[0].pourcent).toBeGreaterThan(70)
    expect(fin[0].pourcent).toBeLessThanOrEqual(100)
  })

  it('trouve dans plusieurs paragraphes', () => {
    const occ = rechercherDansCorpsTexte(corps, 'elle')
    // « Karine... » contient « elle » dans... non. Seul le 2e paragraphe.
    expect(occ.length).toBeGreaterThanOrEqual(1)
    // pos du 2e paragraphe : debutBloc(1) = 1 + (2 + len1) = 3 + len1
    const len1 = 'Karine habite Lyon depuis sa retraite.'.length
    expect(occ[0].pos).toBe(3 + len1) // blockStart du 2e bloc = debutBloc(1)
  })

  it('ne trouve rien pour une requête absente', () => {
    expect(rechercherDansCorpsTexte(corps, 'xyz')).toEqual([])
  })

  it('motEntier : trouve « le » mais pas « parle »', () => {
    const sub = { type: 'doc', content: [
      { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Elle parle de le long de la cote.' }] },
    ] }
    const complet = rechercherDansCorpsTexte(sub, 'le', { motEntier: true })
    // Seul le « le » autonome (borne par des espaces) doit matcher — et non
    // « Elle », « parle », « long ».
    expect(complet.map((o) => o.match)).toEqual(['le'])
    // En mode sous-chaîne, on trouve en revanche « Elle », « parle » et « le ».
    const sous = rechercherDansCorpsTexte(sub, 'le').map((o) => o.match)
    expect(sous).toContain('Elle')
    expect(sous).toContain('parle')
    expect(sous).toContain('le')
  })

  it('motEntier : respecte les bornes de phrase', () => {
    const sub = { type: 'doc', content: [
      { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Le mot en debut.' }] },
    ] }
    const occ = rechercherDansCorpsTexte(sub, 'le', { motEntier: true })
    expect(occ.map((o) => o.match)).toEqual(['Le'])
  })

  it('résiste à un corps illisible', () => {
    expect(rechercherDansCorpsTexte(null, 'karine')).toEqual([])
    expect(rechercherDansCorpsTexte({ type: 'doc', content: 'nope' }, 'a')).toEqual([])
  })
})
