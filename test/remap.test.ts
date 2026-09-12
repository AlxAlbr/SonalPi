import { describe, test, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, normalize } from 'node:path'
import { EditorState, type Transaction } from '@tiptap/pm/state'
import { Schema } from '@tiptap/pm/model'
import { history, undo, redo } from '@tiptap/pm/history'
import { estOrpheline, type Annotation } from '../src/shared/entretien/annotation'
import { ajouterCodage, type Entretien } from '../src/shared/entretien/entretien'
import { pluginRemap } from '../src/renderer/editor/remap'

/**
 *  MOTEUR DE REMAP — vérification du risque central de l'architecture (le
 *  remapping des positions doit tenir avant qu'on empile l'UI dessus). Headless.
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
  const entretien: Entretien = { annotations: [], ancres: [], reperesPassages: [] }
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
    /** Pose un repère de recueil sur la première occurrence du fragment. */
    reperer(fragment: string, id = 'p1') {
      const from = state.doc.textContent.indexOf(fragment) + 1
      const repere = { id, from, to: from + fragment.length }
      entretien.reperesPassages.push(repere)
      return repere
    },
    /** Pose une occurrence anon (pseudo) sur la 1re occurrence de `fragment`. */
    anonymiser(fragment: string, pseudo: string, id = 'o1') {
      const from = state.doc.textContent.indexOf(fragment) + 1
      const a: Annotation = {
        id,
        type: 'anon',
        from,
        to: from + fragment.length,
        auteur: 'max',
        pseudo,
        etat: 'anonymise',
      }
      entretien.annotations.push(a)
      return a
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
    expect(s.texteAnnote(a)).toBe('Pierre Lemaitre') // invariant SonalPi2 : le codage enjambe
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

describe('remapping — repères autonomes des recueils', () => {
  test('le repère suit les corrections sans dépendre des annotations', () => {
    const s = creerSession(TEXTE)
    const repere = s.reperer('Pierre Lemaitre')
    const codage = s.coder('Pierre Lemaitre')
    s.editer((tr) => tr.insertText('-Marie', repere.from + 'Pierre'.length))
    s.entretien.annotations.splice(s.entretien.annotations.indexOf(codage), 1)
    expect(s.doc.textBetween(repere.from, repere.to)).toBe('Pierre-Marie Lemaitre')
    expect(s.entretien.reperesPassages).toEqual([repere])
  })

  test('une suppression totale conserve un repère orphelin', () => {
    const s = creerSession(TEXTE)
    const repere = s.reperer('Pierre Lemaitre')
    s.editer((tr) => tr.delete(repere.from, repere.to))
    expect(repere.from).toBe(repere.to)
    expect(s.entretien.reperesPassages).toHaveLength(1)
  })
})

describe('remapping — occurrences anon (même canal que les codages)', () => {
  test('insertion AVANT une occurrence anon → elle se décale, texte et pseudo intacts', () => {
    const s = creerSession(TEXTE)
    const a = s.anonymiser('Pierre', 'Pseudo1')
    s.editer((tr) => tr.insertText('Oh. ', 1))
    expect(s.texteAnnote(a)).toBe('Pierre')
    expect(a.pseudo).toBe('Pseudo1')
    expect(a.from).toBe(9 + 4)
  })

  test('insertion APRÈS l’occurrence → rien ne bouge (le pseudo survit)', () => {
    const s = creerSession(TEXTE)
    const a = s.anonymiser('Pierre', 'Pseudo1')
    const avant = { from: a.from, to: a.to, pseudo: a.pseudo }
    s.editer((tr) => tr.insertText(' fils', a.to))
    expect({ from: a.from, to: a.to, pseudo: a.pseudo }).toEqual(avant)
    expect(s.texteAnnote(a)).toBe('Pierre')
  })

  test('suppression chevauchant le début → l’occurrence se referme sur le reste', () => {
    const s = creerSession(TEXTE)
    const a = s.anonymiser('Pierre Lemaitre', 'PL')
    s.editer((tr) => tr.delete(5, 16)) // supprime « our Pierre »
    expect(s.texteAnnote(a)).toBe('Lemaitre')
    expect(estOrpheline(a)).toBe(false)
  })

  test('une EXCEPTION survit au remap : état et pseudo-mémoire intacts', () => {
    const s = creerSession(TEXTE)
    const a = s.anonymiser('Pierre', 'P')
    a.etat = 'exception' // bascule faite via le menu (le pseudo reste posé)
    s.editer((tr) => tr.insertText('Oh. ', 1)) // décale l'occurrence
    expect(s.texteAnnote(a)).toBe('Pierre')
    expect(a.etat).toBe('exception')
    expect(a.pseudo).toBe('P') // la mémoire de restauration est conservée
  })
})

describe('discipline d’architecture (garde-fou : entretien/ sans DOM)', () => {
  test('src/shared/entretien/ n’importe que du local (récursif) ou des types shared — jamais DOM/ProseMirror/Yjs', () => {
    const racine = fileURLToPath(new URL('../src/shared', import.meta.url))
    const dossier = join(racine, 'entretien')
    // Parcourt le dossier RÉCURSIVEMENT (depuis le sous-dossier anon/, un import
    // '../../format' reste DANS src/shared — la règle est « ne jamais sortir du
    // package shared », pas « interdire ../.. »).
    const fichiers: string[] = []
    const parcourir = (d: string) => {
      for (const f of readdirSync(d)) {
        const abs = join(d, f)
        if (statSync(abs).isDirectory()) parcourir(abs)
        else if (f.endsWith('.ts')) fichiers.push(abs)
      }
    }
    parcourir(dossier)
    for (const sourcePath of fichiers) {
      const source = readFileSync(sourcePath, 'utf8')
      const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
      for (const spec of imports) {
        // Résout l'import contre le fichier qui le porte et vérifie que le
        // résultat reste DANS src/shared/ (jamais un package ni ailleurs).
        const cible = spec.startsWith('.')
          ? normalize(join(dirname(sourcePath), spec))
          : spec
        expect(spec, `${sourcePath} importe ${spec}`).toMatch(/^\./)
        expect(
          cible.startsWith(racine),
          `${sourcePath} s'échappe de src/shared via ${spec} → ${cible}`,
        ).toBe(true)
      }
      expect(source).not.toMatch(/\b(document|window)\./)
    }
  })
})
