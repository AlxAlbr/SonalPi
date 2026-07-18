import { describe, test, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { EditorState, type Transaction } from '@tiptap/pm/state'
import { Schema } from '@tiptap/pm/model'
import { history, undo, redo } from '@tiptap/pm/history'
import { estOrpheline, type Annotation } from '../src/shared/entretien/annotation'
import { ajouterCodage, type Entretien } from '../src/shared/entretien/entretien'
import { pluginRemap } from '../src/renderer/editor/remap'

/**
 * MOTEUR VENDORÉ DU POC3 — vérification du risque central (annexe de robustesse
 * de SonalAsynchro : le remapping doit tenir avant qu'on empile l'UI dessus). Headless.
 * Identique aux 12 tests POC3, chemins adaptés (src/renderer/…).
 */

/** Schéma minimal — la vérification ne dépend d'aucun schéma riche. */
const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*' },
    text: {},
  },
})

function creerSession(texte: string) {
  const entretien: Entretien = { annotations: [], ancres: [] }
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(texte)])])
  let state = EditorState.create({ doc, plugins: [history(), pluginRemap(entretien)] })

  return {
    entretien,
    get doc() {
      return state.doc
    },
    editer(fn: (tr: Transaction) => void) {
      const tr = state.tr
      fn(tr)
      state = state.apply(tr)
    },
    annuler() {
      return undo(state, (tr) => (state = state.apply(tr)))
    },
    refaire() {
      return redo(state, (tr) => (state = state.apply(tr)))
    },
    texteAnnote(a: Annotation) {
      return state.doc.textBetween(a.from, a.to)
    },
    /** Pose un codage sur la 1re occurrence de `fragment` (doc mono-paragraphe initial). */
    coder(fragment: string, id = 'a1') {
      const from = state.doc.textContent.indexOf(fragment) + 1
      return ajouterCodage(
        entretien,
        { from, to: from + fragment.length, code: 'cat_001', auteur: 'max' },
        () => id,
      )!
    },
  }
}

const TEXTE = 'Bonjour Pierre Lemaitre, agriculteur.'

describe('remapping — les plages du modèle suivent les éditions', () => {
  test('insertion AVANT la plage → la plage se décale, le texte annoté est identique', () => {
    const s = creerSession(TEXTE)
    const a = s.coder('Pierre Lemaitre')
    s.editer((tr) => tr.insertText('Oh. ', 1))
    expect(s.texteAnnote(a)).toBe('Pierre Lemaitre')
    expect(a.from).toBe(9 + 4)
  })

  test("insertion À L'INTÉRIEUR → la plage s'étend et englobe l'insertion", () => {
    const s = creerSession(TEXTE)
    const a = s.coder('Pierre Lemaitre')
    s.editer((tr) => tr.insertText('-Marie', a.from + 'Pierre'.length))
    expect(s.texteAnnote(a)).toBe('Pierre-Marie Lemaitre')
  })

  test('insertion APRÈS la plage → rien ne bouge', () => {
    const s = creerSession(TEXTE)
    const a = s.coder('Pierre Lemaitre')
    const avant = { from: a.from, to: a.to }
    s.editer((tr) => tr.insertText(' Au revoir.', s.doc.content.size - 1))
    expect({ from: a.from, to: a.to }).toEqual(avant)
    expect(s.texteAnnote(a)).toBe('Pierre Lemaitre')
  })

  test('insertion EXACTEMENT sur la borne de début → le texte inséré reste HORS de la plage', () => {
    const s = creerSession(TEXTE)
    const a = s.coder('Pierre Lemaitre')
    s.editer((tr) => tr.insertText('M. ', a.from))
    expect(s.texteAnnote(a)).toBe('Pierre Lemaitre') // pas « M. Pierre Lemaitre »
  })

  test('insertion EXACTEMENT sur la borne de fin → le texte inséré reste HORS de la plage', () => {
    const s = creerSession(TEXTE)
    const a = s.coder('Pierre Lemaitre')
    s.editer((tr) => tr.insertText(' fils', a.to))
    expect(s.texteAnnote(a)).toBe('Pierre Lemaitre') // pas « Pierre Lemaitre fils »
  })

  test('suppression chevauchant le début de la plage → la plage se referme sur ce qui reste', () => {
    const s = creerSession(TEXTE)
    const a = s.coder('Pierre Lemaitre')
    // supprime « our Pierre » (de l'extérieur jusqu'au milieu de la plage)
    s.editer((tr) => tr.delete(5, 16))
    expect(s.texteAnnote(a)).toBe('Lemaitre')
    expect(estOrpheline(a)).toBe(false)
  })

  test('suppression TOTALE de la plage → annotation orpheline (conservée, pas supprimée)', () => {
    const s = creerSession(TEXTE)
    const a = s.coder('Pierre Lemaitre')
    s.editer((tr) => tr.delete(a.from, a.to))
    expect(estOrpheline(a)).toBe(true)
    expect(s.entretien.annotations).toHaveLength(1) // pas de perte silencieuse
  })
})

describe('remapping — undo/redo (les transactions d’historique portent leur mapping)', () => {
  test('undo puis redo d’une insertion → les positions font l’aller-retour exact', () => {
    const s = creerSession(TEXTE)
    const a = s.coder('Pierre Lemaitre')
    s.editer((tr) => tr.insertText('Oh. ', 1))
    expect(a.from).toBe(13)

    expect(s.annuler()).toBe(true)
    expect({ from: a.from, to: a.to }).toEqual({ from: 9, to: 24 })
    expect(s.texteAnnote(a)).toBe('Pierre Lemaitre')

    expect(s.refaire()).toBe(true)
    expect(a.from).toBe(13)
    expect(s.texteAnnote(a)).toBe('Pierre Lemaitre')
  })

  test('LIMITE DOCUMENTÉE — undo d’une suppression totale : le texte revient, la plage reste orpheline', () => {
    // Une plage refermée (from === to) ne peut plus distinguer ses bornes :
    // le mapping de l'undo ne la ré-ouvre pas. Même limite de principe que les
    // RelativePosition Yjs sur du contenu supprimé/recréé. L'annotation reste
    // listée comme orpheline → restaurable à la main, pas de perte silencieuse.
    const s = creerSession(TEXTE)
    const a = s.coder('Pierre Lemaitre')
    s.editer((tr) => tr.delete(a.from, a.to))
    expect(s.annuler()).toBe(true)
    expect(s.doc.textContent).toBe(TEXTE) // le texte est bien revenu
    expect(estOrpheline(a)).toBe(true) // ...mais la plage ne se ré-ouvre pas
  })
})

describe('remapping — structure de blocs', () => {
  test('scission du paragraphe au milieu de la plage → l’annotation enjambe les deux blocs', () => {
    const s = creerSession(TEXTE)
    const a = s.coder('Pierre Lemaitre')
    s.editer((tr) => tr.split(a.from + 'Pierre '.length)) // Entrée entre « Pierre » et « Lemaitre »
    expect(s.doc.childCount).toBe(2)
    expect(s.texteAnnote(a)).toBe('Pierre Lemaitre') // invariant v2 : le codage enjambe
  })

  test('deux annotations remappées indépendamment', () => {
    const s = creerSession('Alpha Bravo Charlie')
    const a1 = s.coder('Alpha', 'a1')
    const a2 = s.coder('Charlie', 'a2')
    s.editer((tr) => tr.insertText('X', 1 + 'Alpha B'.length)) // au milieu de « Bravo »
    expect(s.texteAnnote(a1)).toBe('Alpha')
    expect(s.texteAnnote(a2)).toBe('Charlie')
  })
})

describe('discipline d’architecture (DEMARRAGE garde-fou n°1 : entretien/ sans DOM)', () => {
  test('src/shared/entretien/ n’importe que du local ou des types shared (jamais DOM/ProseMirror/Yjs)', () => {
    const dossier = fileURLToPath(new URL('../src/shared/entretien', import.meta.url))
    for (const fichier of readdirSync(dossier)) {
      const source = readFileSync(`${dossier}/${fichier}`, 'utf8')
      const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
      // Autorisé : même dossier (./) ou un cran vers shared (../format, ../corpus) ;
      // JAMAIS s'échapper de shared/ (../../) ni un package (DOM, ProseMirror, Yjs, Vue…).
      for (const spec of imports) {
        expect(spec, `${fichier} importe ${spec}`).toMatch(/^(\.\/|\.\.\/[^.])/)
      }
      expect(source).not.toMatch(/\b(document|window)\./)
    }
  })
})
