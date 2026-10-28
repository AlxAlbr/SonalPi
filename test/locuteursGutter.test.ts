// @vitest-environment happy-dom
import { expect, test } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
import { gouttierePluginKey, pluginGouttiere } from '../src/renderer/editor/locuteursGutter'
import type { Locuteur } from '../src/shared/format'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', attrs: { loc: { default: null } }, toDOM: () => ['p', 0] },
    text: {},
  },
})

test.each([undefined, 'Nadia'])('changer la couleur rafraîchit les libellés déjà affichés (pseudo : %s)', (pseudo) => {
  const locuteurs: Locuteur[] = [{ index: 1, nom: 'Fatima', pseudo, couleur: '#64b5f6', valeursLoc: {}, personneRef: null }]
  const hote = document.body.appendChild(document.createElement('div'))
  const vue = new EditorView(hote, {
    state: EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph', { loc: 1 }, [schema.text('Bonjour.')])]),
      plugins: [pluginGouttiere(() => locuteurs)],
    }),
  })
  try {
    const couleur = (classe: string) => hote.querySelector<HTMLElement>(classe)?.style.color
    expect(couleur('.loc-nom')).toBe('#64b5f6')
    const texteAvant = hote.textContent
    const documentAvant = vue.state.doc
    locuteurs[0].couleur = '#21805a'
    vue.dispatch(vue.state.tr.setMeta(gouttierePluginKey, 'refresh'))
    expect(couleur('.loc-nom')).toBe('#21805a')
    if (pseudo) expect(couleur('.loc-pseudo')).toBe('#21805a')
    expect(hote.textContent).toBe(texteAvant)
    expect(vue.state.doc).toBe(documentAvant)
  } finally {
    vue.destroy()
    hote.remove()
  }
})
