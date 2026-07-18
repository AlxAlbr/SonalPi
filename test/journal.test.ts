// @vitest-environment happy-dom
import { describe, test, expect, afterEach } from 'vitest'
import { Editor, Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BlocAttributs } from '../src/renderer/editor/schema'
import { pluginRemap } from '../src/renderer/editor/remap'
import { pluginRemapJournal } from '../src/renderer/editor/journalRemap'
import { attribuerSelectionTr } from '../src/renderer/editor/attribution'
import { ajouterCodage, retirerAnnotation, type Entretien } from '../src/shared/entretien/entretien'
import type { Locuteur } from '../src/shared/format'
import {
  CAP_JOURNAL,
  enregistrer,
  annuler,
  estApplicable,
  appliquerInverse,
  type CtxInverse,
  type Journal,
} from '../src/shared/entretien/journal'

/**
 * S5 — journal d'actions annulables. Partie 1 : les INVERSES purs (headless strict,
 * aucun éditeur). Partie 2 : le REMAP du journal sur le vrai éditeur TipTap —
 * les inverses en attente suivent les éditions comme le modèle (annotation
 * fantôme re-posée au bon endroit, loc restauré au bon bloc, cible disparue → grisée).
 */

const genId = (() => {
  let n = 0
  return () => `j-${++n}`
})()

function ctxPur(over: Partial<CtxInverse> = {}): CtxInverse {
  return {
    entretien: { annotations: [], ancres: [] },
    locuteurs: [],
    valeursGen: {},
    ...over,
  }
}

function locuteur(index: number, nom: string): Locuteur {
  return { index, nom, valeursLoc: {}, personneRef: null }
}

describe('journal — enregistrer (cap, ordre)', () => {
  test('la plus récente en tête ; au-delà de 10, la plus ancienne sort', () => {
    const j: Journal = { entrees: [] }
    for (let i = 1; i <= 12; i++)
      enregistrer(j, `action ${i}`, { type: 'poserValeurGen', idVar: 'v1', idMod: null }, genId)
    expect(j.entrees).toHaveLength(CAP_JOURNAL)
    expect(j.entrees[0].libelle).toBe('action 12') // la plus récente en tête
    expect(j.entrees.at(-1)!.libelle).toBe('action 3') // 1 et 2 sont sorties
  })
})

describe('journal — inverses purs (applicabilité + application)', () => {
  test('retirerAnnotation : applicable tant que l’annotation existe, puis grisée', () => {
    const entretien: Entretien = { annotations: [], ancres: [] }
    const a = ajouterCodage(entretien, { from: 1, to: 5, code: 'c1', auteur: 'moi' }, () => 'a1')!
    const ctx = ctxPur({ entretien })
    const inv = { type: 'retirerAnnotation' as const, annotationId: a.id }
    expect(estApplicable(inv, ctx)).toBe(true)
    expect(appliquerInverse(inv, ctx)).toBe(true)
    expect(entretien.annotations).toHaveLength(0)
    expect(estApplicable(inv, ctx)).toBe(false) // cible disparue
  })

  test('reposerAnnotation : ré-insère ; refuse si orpheline ou déjà présente', () => {
    const entretien: Entretien = { annotations: [], ancres: [] }
    const a = ajouterCodage(entretien, { from: 1, to: 5, code: 'c1', auteur: 'moi' }, () => 'a1')!
    retirerAnnotation(entretien, a.id)
    const ctx = ctxPur({ entretien })
    const inv = { type: 'reposerAnnotation' as const, annotation: a }
    expect(estApplicable(inv, ctx)).toBe(true)
    expect(appliquerInverse(inv, ctx)).toBe(true)
    expect(entretien.annotations).toHaveLength(1)
    expect(estApplicable(inv, ctx)).toBe(false) // déjà revenue

    const orpheline = { ...a, id: 'a2', from: 3, to: 3 }
    expect(estApplicable({ type: 'reposerAnnotation', annotation: orpheline }, ctx)).toBe(false)
  })

  test('renommerLocuteur : restaure l’ancien nom ; locuteur absent → grisée', () => {
    const locs = [locuteur(1, 'Chercheur')]
    const ctx = ctxPur({ locuteurs: locs })
    expect(appliquerInverse({ type: 'renommerLocuteur', index: 1, nom: 'Enquêteur' }, ctx)).toBe(true)
    expect(locs[0].nom).toBe('Enquêteur')
    expect(estApplicable({ type: 'renommerLocuteur', index: 9, nom: 'X' }, ctx)).toBe(false)
  })

  test('poserValeurGen : repose l’ancienne valeur, null = efface', () => {
    const valeursGen: Record<string, string> = { v1: 'v1m2' }
    const ctx = ctxPur({ valeursGen })
    expect(appliquerInverse({ type: 'poserValeurGen', idVar: 'v1', idMod: 'v1m1' }, ctx)).toBe(true)
    expect(valeursGen.v1).toBe('v1m1')
    expect(appliquerInverse({ type: 'poserValeurGen', idVar: 'v1', idMod: null }, ctx)).toBe(true)
    expect('v1' in valeursGen).toBe(false)
  })

  test('poserValeurLoc : chez SON locuteur ; locuteur absent → grisée', () => {
    const locs = [locuteur(1, 'Karine')]
    locs[0].valeursLoc.v1 = 'v1m2'
    const ctx = ctxPur({ locuteurs: locs })
    expect(appliquerInverse({ type: 'poserValeurLoc', index: 1, idVar: 'v1', idMod: null }, ctx)).toBe(true)
    expect('v1' in locs[0].valeursLoc).toBe(false)
    expect(estApplicable({ type: 'poserValeurLoc', index: 2, idVar: 'v1', idMod: 'x' }, ctx)).toBe(false)
  })

  test('restaurerLocs : sans accès aux blocs → grisée ; avec → applique', () => {
    const inv = { type: 'restaurerLocs' as const, blocs: [{ pos: 0, loc: 1 }] }
    expect(estApplicable(inv, ctxPur())).toBe(false) // pas de ctx.blocs
    const poses: Array<[number, number | null]> = []
    const ctx = ctxPur({
      blocs: { locDe: () => 2, poserLoc: (pos, loc) => poses.push([pos, loc]) },
    })
    expect(appliquerInverse(inv, ctx)).toBe(true)
    expect(poses).toEqual([[0, 1]])
    // Un bloc disparu (locDe → undefined) grise l'entrée entière (jamais à moitié).
    const ctxMort = ctxPur({ blocs: { locDe: () => undefined, poserLoc: () => {} } })
    expect(estApplicable(inv, ctxMort)).toBe(false)
  })

  test('annuler : applique et retire l’entrée ; cible disparue → entrée conservée', () => {
    const entretien: Entretien = { annotations: [], ancres: [] }
    const a = ajouterCodage(entretien, { from: 1, to: 5, code: 'c1', auteur: 'moi' }, () => 'a1')!
    const j: Journal = { entrees: [] }
    const e = enregistrer(j, 'Codage posé', { type: 'retirerAnnotation', annotationId: a.id }, genId)
    const ctx = ctxPur({ entretien })
    expect(annuler(j, e.id, ctx)).toBe(true)
    expect(j.entrees).toHaveLength(0)
    expect(entretien.annotations).toHaveLength(0)
    // Une seconde entrée sur la même cible (disparue) : refus, entrée conservée.
    const e2 = enregistrer(j, 'Codage posé (bis)', { type: 'retirerAnnotation', annotationId: a.id }, genId)
    expect(annuler(j, e2.id, ctx)).toBe(false)
    expect(j.entrees).toHaveLength(1)
  })
})

// --- Partie 2 : le remap du journal sur le vrai éditeur ---

function creerEditeur(entretien: Entretien, journal: Journal, content: string): Editor {
  const Moteur = Extension.create({
    name: 'moteurTest',
    addProseMirrorPlugins: () => [pluginRemap(entretien), pluginRemapJournal(journal)],
  })
  return new Editor({ content, extensions: [StarterKit, BlocAttributs, Moteur] })
}

let editor: Editor | null = null
afterEach(() => {
  editor?.destroy()
  editor = null
})

/** Le ctx qu'useEntretien construit : accès aux blocs via l'éditeur. */
function ctxEditeur(ed: Editor, entretien: Entretien): CtxInverse {
  return {
    entretien,
    locuteurs: [],
    valeursGen: {},
    blocs: {
      locDe: (pos) => {
        const n = ed.state.doc.nodeAt(pos)
        return n?.type.name === 'paragraph' ? ((n.attrs.loc ?? null) as number | null) : undefined
      },
      poserLoc: (pos, loc) => {
        const n = ed.state.doc.nodeAt(pos)
        if (n) ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, loc }))
      },
    },
  }
}

describe('journal — les inverses en attente suivent les éditions (remap)', () => {
  test('annotation retirée puis texte édité AVANT → re-posée au bon endroit', () => {
    const entretien: Entretien = { annotations: [], ancres: [] }
    const j: Journal = { entrees: [] }
    editor = creerEditeur(entretien, j, '<p>AAAA BBBB CCCC</p>')
    const from = 1 + 'AAAA '.length
    const a = ajouterCodage(entretien, { from, to: from + 4, code: 'c1', auteur: 'moi' }, () => 'a1')!

    retirerAnnotation(entretien, a.id)
    const e = enregistrer(j, 'Codage retiré', { type: 'reposerAnnotation', annotation: a }, genId)

    // Le texte bouge : insertion en tête → l'annotation fantôme doit suivre.
    editor.view.dispatch(editor.state.tr.insertText('Oh. ', 1))

    expect(annuler(j, e.id, ctxEditeur(editor, entretien))).toBe(true)
    expect(editor.state.doc.textBetween(a.from, a.to)).toBe('BBBB')
  })

  test('texte annoté SUPPRIMÉ → l’entrée « re-poser » devient non annulable (grisée)', () => {
    const entretien: Entretien = { annotations: [], ancres: [] }
    const j: Journal = { entrees: [] }
    editor = creerEditeur(entretien, j, '<p>AAAA BBBB CCCC</p>')
    const from = 1 + 'AAAA '.length
    const a = ajouterCodage(entretien, { from, to: from + 4, code: 'c1', auteur: 'moi' }, () => 'a1')!

    retirerAnnotation(entretien, a.id)
    const e = enregistrer(j, 'Codage retiré', { type: 'reposerAnnotation', annotation: a }, genId)

    // La cible disparaît : suppression de « BBBB » → fantôme refermé (orphelin).
    editor.view.dispatch(editor.state.tr.delete(from, from + 4))

    const ctx = ctxEditeur(editor, entretien)
    expect(estApplicable(e.inverse, ctx)).toBe(false)
    expect(annuler(j, e.id, ctx)).toBe(false)
    expect(j.entrees).toHaveLength(1) // conservée, grisée
  })

  test('attribution annulée après édition → l’ancien loc revient au BON bloc (scission conservée, D-S2)', () => {
    const entretien: Entretien = { annotations: [], ancres: [] }
    const j: Journal = { entrees: [] }
    editor = creerEditeur(entretien, j, '<p data-loc="1" data-deb="0" data-fin="10">AAAA BBBB CCCC</p>')

    // Attribuer « BBBB » à loc 2 (scinde en 3), comme useEntretien.
    const from = 1 + 'AAAA '.length
    const r = attribuerSelectionTr(editor.state, from, from + 4, 2)!
    editor.view.dispatch(r.tr)
    const e = enregistrer(
      j,
      'Locuteur attribué',
      { type: 'restaurerLocs', blocs: r.blocs.map((b) => ({ pos: b.pos, loc: b.ancien })) },
      genId,
    )

    // Édition AVANT le bloc visé : les positions de l'inverse doivent suivre.
    editor.view.dispatch(editor.state.tr.insertText('Préambule. ', 1))

    expect(annuler(j, e.id, ctxEditeur(editor, entretien))).toBe(true)
    const locs: Array<number | null> = []
    editor.state.doc.forEach((n) => locs.push(n.attrs.loc))
    expect(locs).toEqual([1, 1, 1]) // l'ancien loc restauré…
    expect(editor.state.doc.childCount).toBe(3) // …la scission demeure (D-S2)
  })
})
