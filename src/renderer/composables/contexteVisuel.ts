import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'

/** Suit la sélection dans les corrections du texte, sans créer de repère métier. */
export function capturerSelection(editeur: Editor | null, sourceCourante: () => boolean) {
  const selection = editeur ? { from: editeur.state.selection.from, to: editeur.state.selection.to } : null
  const etatSelection = { supprimee: false }
  function suivre({ transaction }: { transaction: Transaction }) {
    if (!selection || !sourceCourante() || !transaction.docChanged || transaction.getMeta('preventUpdate')) return
    const passage = selection.from < selection.to
    selection.from = transaction.mapping.map(selection.from, 1)
    selection.to = Math.max(selection.from, transaction.mapping.map(selection.to, -1))
    if (passage && selection.from === selection.to) etatSelection.supprimee = true
  }
  editeur?.on('transaction', suivre)
  return { selection, etatSelection, liberer: () => { editeur?.off('transaction', suivre) } }
}

/** Retient seulement le focus et le défilement des panneaux déjà montés. */
export function capturerAffichage(selecteur: string): () => void {
  const racine = document.querySelector<HTMLElement>(selecteur)
  const focus = document.activeElement instanceof HTMLElement && racine?.contains(document.activeElement)
    ? document.activeElement : null
  const fenetre = { x: window.scrollX, y: window.scrollY }
  const elements = racine ? [racine, ...racine.querySelectorAll<HTMLElement>('*')]
    .filter((element) => element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)
    .map((element) => ({ element, x: element.scrollLeft, y: element.scrollTop })) : []
  return () => {
    if (focus?.isConnected) focus.focus({ preventScroll: true })
    for (const { element, x, y } of elements) {
      if (!element.isConnected) continue
      element.scrollLeft = x
      element.scrollTop = y
    }
    window.scrollTo(fenetre.x, fenetre.y)
  }
}
