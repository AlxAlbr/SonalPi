// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { Editor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { redoDepth, undoDepth } from '@tiptap/pm/history'
import { reinitialiserHistoriqueFrappe, traiterRaccourciAnnulation } from '../src/renderer/editor/historiqueFrappe'

const editeurs: Editor[] = []
afterEach(() => { for (const editeur of editeurs.splice(0)) editeur.destroy(); document.body.replaceChildren() })
function creer(historique = true) {
  const editeur = new Editor({ element: document.body.appendChild(document.createElement('div')),
    extensions: [StarterKit.configure({ undoRedo: historique ? {} : false })], content: '<p>Texte chargé</p>' })
  editeurs.push(editeur)
  return editeur
}
function raccourci(key = 'z', shiftKey = false) {
  return { key, shiftKey, ctrlKey: true, metaKey: false, altKey: false, preventDefault: vi.fn() }
}

test('sans historique de frappe, l’état est conservé tel quel', () => {
  const editeur = creer(false), avant = editeur.state
  reinitialiserHistoriqueFrappe(editeur)
  expect(editeur.state).toBe(avant)
})

test('le chargement ne reste pas annulable et les autres états de plugins sont conservés', () => {
  const editeur = creer()
  const temoin = new Plugin({ state: { init: () => ({ compteur: 0 }), apply: (_tr, ancien) => ({ compteur: ancien.compteur + 1 }) } })
  editeur.registerPlugin(temoin)
  editeur.commands.insertContent('Saisie ')
  editeur.view.dispatch(editeur.state.tr.setSelection(TextSelection.create(editeur.state.doc, 3)))
  const avant = editeur.state
  expect(undoDepth(avant)).toBe(1)
  reinitialiserHistoriqueFrappe(editeur)
  expect(editeur.state).toBe(editeur.view.state)
  expect(editeur.state.doc.eq(avant.doc)).toBe(true)
  expect(editeur.state.selection.eq(avant.selection)).toBe(true)
  expect(editeur.state.plugins).toEqual(avant.plugins)
  expect(temoin.getState(editeur.state)).toBe(temoin.getState(avant))
  expect(undoDepth(editeur.state)).toBe(0)
  expect(redoDepth(editeur.state)).toBe(0)
})

test('les anciennes saisies ne sont plus rétablissables, mais les nouvelles restent annulables', () => {
  const editeur = creer()
  editeur.commands.insertContent('Ancienne saisie ')
  editeur.commands.undo()
  expect(redoDepth(editeur.state)).toBe(1)
  reinitialiserHistoriqueFrappe(editeur)
  expect(redoDepth(editeur.state)).toBe(0)
  editeur.commands.insertContent('Nouvelle saisie ')
  expect(undoDepth(editeur.state)).toBe(1)
  editeur.commands.undo()
  expect(editeur.state.doc.textContent).toBe('Texte chargé')
})

test('sans action annulable, Ctrl+Z est consommé sans modifier le document', () => {
  const editeur = creer(), evenement = raccourci()
  expect(traiterRaccourciAnnulation(editeur.view, evenement)).toBe(true)
  expect(evenement.preventDefault).toHaveBeenCalledOnce()
  expect(editeur.state.doc.textContent).toBe('Texte chargé')
})

test.each(['z', 'y'])('le raccourci %s annule ou rétablit la frappe dans l’éditeur', (touche) => {
  const editeur = creer()
  editeur.commands.insertContent('Saisie ')
  traiterRaccourciAnnulation(editeur.view, raccourci())
  expect(editeur.state.doc.textContent).toBe('Texte chargé')
  traiterRaccourciAnnulation(editeur.view, raccourci(touche, touche === 'z'))
  expect(editeur.state.doc.textContent).toBe('Saisie Texte chargé')
})

test('la lecture seule interdit l’annulation et les autres raccourcis restent disponibles', () => {
  const editeur = creer()
  editeur.commands.insertContent('Saisie ')
  editeur.setEditable(false)
  const evenement = raccourci()
  expect(traiterRaccourciAnnulation(editeur.view, evenement)).toBe(true)
  expect(editeur.state.doc.textContent).toBe('Saisie Texte chargé')
  const copier = raccourci('c')
  expect(traiterRaccourciAnnulation(editeur.view, copier)).toBe(false)
  expect(copier.preventDefault).not.toHaveBeenCalled()
})
