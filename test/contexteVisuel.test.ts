import { describe, expect, test, vi } from 'vitest'
import type { Editor } from '@tiptap/core'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import { capturerSelection } from '../src/renderer/composables/contexteVisuel'

const schema = new Schema({ nodes: {
  doc: { content: 'paragraph+' }, paragraph: { content: 'text*' }, text: {},
} })
function creer() {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('Avant le passage après.'))])
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 10, 17) })
  let handler!: (evt: { transaction: Transaction }) => void
  const editeur = { state, on: vi.fn((_evt: string, fn: typeof handler) => { handler = fn }), off: vi.fn() }
  let courant = true
  const snapshot = capturerSelection(editeur as unknown as Editor, () => courant)
  const appliquer = (tr: Transaction) => { editeur.state = editeur.state.apply(tr); handler({ transaction: tr }) }
  return { editeur, snapshot, appliquer, changerSource: () => { courant = false } }
}

describe('sélection de retour', () => {
  test('les corrections précédant le passage déplacent sa sélection, sans repère persistant', () => {
    const { editeur, snapshot, appliquer } = creer()
    appliquer(editeur.state.tr.insertText('Préambule. ', 1))
    expect(snapshot.selection).toEqual({ from: 21, to: 28 })
    snapshot.liberer()
    expect(editeur.off).toHaveBeenCalledWith('transaction', editeur.on.mock.calls[0][1])
  })
  test('un passage entièrement supprimé est signalé au retour', () => {
    const { editeur, snapshot, appliquer } = creer()
    appliquer(editeur.state.tr.delete(10, 17))
    expect(snapshot.etatSelection.supprimee).toBe(true)
    expect(snapshot.selection?.from).toBe(snapshot.selection?.to)
    snapshot.liberer()
  })
  test('charger un document ou modifier une autre source ne remappe pas le passage', () => {
    const { editeur, snapshot, appliquer, changerSource } = creer()
    appliquer(editeur.state.tr.insertText('Chargement ', 1).setMeta('preventUpdate', true))
    expect(snapshot.selection).toEqual({ from: 10, to: 17 })
    changerSource()
    appliquer(editeur.state.tr.insertText('Autre source ', 1))
    expect(snapshot.selection).toEqual({ from: 10, to: 17 })
    snapshot.liberer()
  })
})
