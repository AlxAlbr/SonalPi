// @vitest-environment happy-dom
import { describe, test, expect, afterEach } from 'vitest'
import { Editor, Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BlocAttributs } from '../src/renderer/editor/schema'
import { pluginRemap } from '../src/renderer/editor/remap'
import { snapBornes } from '../src/renderer/editor/snap'
import { attribuerSelectionTr } from '../src/renderer/editor/attribution'
import { ajouterCodage, type Entretien } from '../src/shared/entretien/entretien'

/**
 * S4 — « Attribuer la sélection » (commande headless). On monte le VRAI éditeur
 * TipTap (paragraph porte loc/deb/fin) + pluginRemap, on applique la transaction,
 * et on vérifie : scission aux bornes, `loc` sur les blocs couverts, invariant
 * timecodes D-S5/D-S13 (deb à gauche, fin à droite, null aux coupes), et que les
 * annotations enjambent la coupe (remap prouvé).
 */
function creerEditeur(entretien: Entretien, content: string): Editor {
  const Remap = Extension.create({
    name: 'remapTest',
    addProseMirrorPlugins: () => [pluginRemap(entretien)],
  })
  return new Editor({ content, extensions: [StarterKit, BlocAttributs, Remap] })
}

let editor: Editor | null = null
afterEach(() => {
  editor?.destroy()
  editor = null
})

type Bloc = { texte: string; loc: number | null; deb: number | null; fin: number | null }
function blocs(ed: Editor): Bloc[] {
  const out: Bloc[] = []
  ed.state.doc.forEach((n) =>
    out.push({ texte: n.textContent, loc: n.attrs.loc, deb: n.attrs.deb, fin: n.attrs.fin }),
  )
  return out
}
/** Position DOC du début de `fragment` (gère les frontières de bloc, contrairement
 *  à textContent.indexOf qui ignore les tokens de bloc). -1 si absent. */
function posDe(ed: Editor, fragment: string): number {
  let found = -1
  ed.state.doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.isText && node.text) {
      const i = node.text.indexOf(fragment)
      if (i >= 0) found = pos + i
    }
    return found < 0
  })
  return found
}
/** Applique l'attribution sur la 1re occurrence de `fragment`. */
function attribuer(ed: Editor, fragment: string, loc: number | null): void {
  const from = posDe(ed, fragment)
  const tr = attribuerSelectionTr(ed.state, from, from + fragment.length, loc)
  if (tr) ed.view.dispatch(tr)
}

describe('attribuerSelectionTr — scission + loc + timecodes', () => {
  test('sélection au milieu d’un bloc → 3 fragments ; loc au milieu ; timecodes D-S5', () => {
    const entretien: Entretien = { annotations: [] }
    editor = creerEditeur(entretien, '<p data-loc="1" data-deb="0" data-fin="10">AAAA BBBB CCCC</p>')
    attribuer(editor, 'BBBB', 2)

    expect(blocs(editor)).toEqual([
      { texte: 'AAAA ', loc: 1, deb: 0, fin: null }, // tête : garde deb, perd fin
      { texte: 'BBBB', loc: 2, deb: null, fin: null }, // couvert : borné par deux coupes
      { texte: ' CCCC', loc: 1, deb: null, fin: 10 }, // queue : perd deb, garde fin
    ])
  })

  test('sélection couvrant un bloc ENTIER → aucune scission, loc posé, timecodes intacts', () => {
    const entretien: Entretien = { annotations: [] }
    editor = creerEditeur(entretien, '<p data-loc="1" data-deb="3" data-fin="9">AAAA BBBB</p>')
    attribuer(editor, 'AAAA BBBB', 2)

    expect(blocs(editor)).toEqual([{ texte: 'AAAA BBBB', loc: 2, deb: 3, fin: 9 }])
  })

  test('sélection multi-blocs → extrémités scindées, cue intérieur garde ses timecodes mesurés', () => {
    const entretien: Entretien = { annotations: [] }
    editor = creerEditeur(
      entretien,
      '<p data-loc="1" data-deb="0" data-fin="5">un deux</p>' +
        '<p data-loc="1" data-deb="5" data-fin="9">trois</p>' +
        '<p data-loc="1" data-deb="9" data-fin="14">quatre cinq</p>',
    )
    // De « deux » (fin du bloc 1) à « quatre » (début du bloc 3).
    const from = posDe(editor, 'deux')
    const to = posDe(editor, 'quatre') + 'quatre'.length
    const tr = attribuerSelectionTr(editor.state, from, to, 2)!
    editor.view.dispatch(tr)

    expect(blocs(editor)).toEqual([
      { texte: 'un ', loc: 1, deb: 0, fin: null }, // tête bloc 1
      { texte: 'deux', loc: 2, deb: null, fin: 5 }, // couvert (fin mesurée du cue 1)
      { texte: 'trois', loc: 2, deb: 5, fin: 9 }, // cue INTÉRIEUR entier : timecodes intacts
      { texte: 'quatre', loc: 2, deb: 9, fin: null }, // couvert (deb mesuré du cue 3)
      { texte: ' cinq', loc: 1, deb: null, fin: 14 }, // queue bloc 3
    ])
  })

  test('loc=null (désattribution) sur une sous-partie', () => {
    const entretien: Entretien = { annotations: [] }
    editor = creerEditeur(entretien, '<p data-loc="1" data-deb="0" data-fin="10">AAAA BBBB CCCC</p>')
    attribuer(editor, 'BBBB', null)
    expect(blocs(editor)[1]).toEqual({ texte: 'BBBB', loc: null, deb: null, fin: null })
  })

  test('borne au tout début du bloc → pas de tête vide (le bloc démarre couvert)', () => {
    const entretien: Entretien = { annotations: [] }
    editor = creerEditeur(entretien, '<p data-loc="1" data-deb="0" data-fin="10">AAAA BBBB CCCC</p>')
    attribuer(editor, 'AAAA BBBB', 2) // from au tout début
    expect(blocs(editor)).toEqual([
      { texte: 'AAAA BBBB', loc: 2, deb: 0, fin: null }, // garde deb, perd fin (coupe à droite)
      { texte: ' CCCC', loc: 1, deb: null, fin: 10 },
    ])
  })

  test('sélection vide (from===to) → aucune transaction', () => {
    const entretien: Entretien = { annotations: [] }
    editor = creerEditeur(entretien, '<p>AAAA</p>')
    expect(attribuerSelectionTr(editor.state, 3, 3, 2)).toBeNull()
  })
})

describe('attribuerSelectionTr — les annotations enjambent la coupe (remap)', () => {
  test('annotation exactement sur le fragment attribué → conservée', () => {
    const entretien: Entretien = { annotations: [] }
    editor = creerEditeur(entretien, '<p data-loc="1">AAAA BBBB CCCC</p>')
    const from = editor.state.doc.textContent.indexOf('BBBB') + 1
    const a = ajouterCodage(entretien, { from, to: from + 4, code: 'c1', auteur: 'moi' }, () => 'a1')!

    attribuer(editor, 'BBBB', 2) // scinde autour de « BBBB »
    expect(editor.state.doc.textBetween(a.from, a.to)).toBe('BBBB')
  })

  test('annotation à cheval sur une coupe → texte annoté préservé (enjambe le bloc)', () => {
    const entretien: Entretien = { annotations: [] }
    editor = creerEditeur(entretien, '<p data-loc="1">AAAA BBBB CCCC</p>')
    // Annote « AAAA BBBB », puis attribue « BBBB » → coupe DANS l'annotation.
    const a = ajouterCodage(entretien, { from: 1, to: 1 + 'AAAA BBBB'.length, code: 'c1', auteur: 'moi' }, () => 'a1')!

    attribuer(editor, 'BBBB', 2)
    const texte = editor.state.doc.textBetween(a.from, a.to, '|')
    expect(texte).toContain('AAAA')
    expect(texte).toContain('BBBB')
    expect(texte).not.toContain('CCCC')
  })
})

describe('snapBornes — ne jamais couper un mot en deux', () => {
  test('bornes en milieu de mot → élargies aux frontières de mot', () => {
    const entretien: Entretien = { annotations: [] }
    editor = creerEditeur(entretien, '<p>Bonjour Pierre Lemaitre</p>')
    const t = editor.state.doc.textContent
    const from = t.indexOf('ierre') + 1 // milieu de « Pierre »
    const to = t.indexOf('Lema') + 1 + 4 // milieu de « Lemaitre »
    const snap = snapBornes(editor.state, from, to)
    expect(editor.state.doc.textBetween(snap.from, snap.to)).toBe('Pierre Lemaitre')
  })
})
