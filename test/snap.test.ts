// @vitest-environment happy-dom
import { describe, test, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { snapToWord } from '../src/renderer/editor/snap'
import { BlocAttributs } from '../src/renderer/editor/schema'

let editor: Editor | null = null
afterEach(() => {
  editor?.destroy()
  editor = null
})
function ed(text: string): Editor {
  editor = new Editor({ content: `<p>${text}</p>`, extensions: [StarterKit, BlocAttributs] })
  return editor
}
function texteDe(from: number, to: number, editor: Editor): string {
  return editor.state.doc.textBetween(from, to, ' ')
}

describe('snapToWord — la sélection « mot + espace » ne doit pas avaler le mot suivant', () => {
  test('sélection « Thomas » + espace de fin → juste « Thomas » (pas « Bonjour »)', () => {
    const e = ed('Thomas Bonjour.')
    const sel = snapToWord(e.state, 1, 8)
    expect(texteDe(sel.from, sel.to, e)).toBe('Thomas')
  })
  test('sélection exacte du mot seul → « Thomas »', () => {
    const e = ed('Thomas Bonjour.')
    const sel = snapToWord(e.state, 1, 7)
    expect(texteDe(sel.from, sel.to, e)).toBe('Thomas')
  })
  test('sélection partielle « omas » (+espace) → tout « Thomas » (snap arrière) mais pas le suivant', () => {
    const e = ed('Thomas Bonjour.')
    const sel = snapToWord(e.state, 3, 8)
    expect(texteDe(sel.from, sel.to, e)).toBe('Thomas')
  })
  test('sélection de « Thomas Bonjour » + espace → les deux mots (pas « tout »)', () => {
    const e = ed('Thomas Bonjour tout.')
    const sel = snapToWord(e.state, 1, 15)
    expect(texteDe(sel.from, sel.to, e)).toBe('Thomas Bonjour')
  })
  test('curseur vide dans un mot → le mot entier', () => {
    const e = ed('Thomas Bonjour.')
    const sel = snapToWord(e.state, 4, 4)
    expect(texteDe(sel.from, sel.to, e)).toBe('Thomas')
  })
})
