// @vitest-environment happy-dom
import { describe, test, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BlocAttributs } from '../src/renderer/editor/schema'
import { pluginRemap, remapPluginKey } from '../src/renderer/editor/remap'
import { Extension } from '@tiptap/core'
import { ajouterCodage, type Entretien } from '../src/shared/entretien/entretien'

/**
 *  Vérifie le CONTRAT DE SCHÉMA (gelé : toute évolution = migration explicite)
 *  sur le VRAI éditeur TipTap (pas le schéma minimal des tests moteur) : le
 *  paragraphe = « bloc » porte `loc`, et le remapping tient avec ce schéma-là.
 */
function creerEditeur(entretien: Entretien, content: string): Editor {
  const Remap = Extension.create({
    name: 'remapTest',
    addProseMirrorPlugins: () => [pluginRemap(entretien)],
  })
  return new Editor({
    content,
    extensions: [StarterKit, BlocAttributs, Remap],
  })
}

let editor: Editor | null = null
afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('schéma — le bloc porte loc, et lui seul', () => {
  test('le nœud paragraph déclare loc — les timecodes sont des ancres, plus des attrs', () => {
    const entretien: Entretien = { annotations: [], ancres: [], reperesPassages: [] }
    editor = creerEditeur(entretien, '<p>Bonjour</p>')
    const attrs = editor.schema.nodes.paragraph.spec.attrs ?? {}
    expect(Object.keys(attrs)).toEqual(['loc'])
  })

  test('data-loc est parsé en attribut de bloc, et re-sérialisé', () => {
    const entretien: Entretien = { annotations: [], ancres: [], reperesPassages: [] }
    editor = creerEditeur(entretien, '<p data-loc="2">Salut</p>')
    expect(editor.state.doc.firstChild?.attrs.loc).toBe(2)
    expect(editor.getHTML()).toContain('data-loc="2"')
  })

  test('le plugin de remapping est bien monté dans l’éditeur réel', () => {
    const entretien: Entretien = { annotations: [], ancres: [], reperesPassages: [] }
    editor = creerEditeur(entretien, '<p>Bonjour</p>')
    expect(remapPluginKey.getState(editor.state)).not.toBeUndefined()
  })
})

describe('schéma — le remapping tient avec le vrai schéma', () => {
  test('une insertion avant la plage décale l’annotation, l’extrait est stable', () => {
    const entretien: Entretien = { annotations: [], ancres: [], reperesPassages: [] }
    editor = creerEditeur(entretien, '<p>Karine habite Lyon.</p>')
    const from = editor.state.doc.textContent.indexOf('Lyon') + 1
    const a = ajouterCodage(
      entretien,
      { from, to: from + 'Lyon'.length, code: 'cat_003', auteur: 'moi' },
      () => 'a1',
    )!
    expect(editor.state.doc.textBetween(a.from, a.to)).toBe('Lyon')

    editor.chain().focus().setTextSelection(1).insertContent('Oh. ').run()
    expect(editor.state.doc.textBetween(a.from, a.to)).toBe('Lyon') // suit le texte
  })
})
