import type { Editor } from '@tiptap/core'
import { history, redo, undo } from '@tiptap/pm/history'
import type { EditorView } from '@tiptap/pm/view'

const cleHistorique = history().spec.key!

/** Même sans action à annuler, le navigateur ne doit pas modifier lui-même le document. */
export function traiterRaccourciAnnulation(
  vue: Pick<EditorView, 'state' | 'dispatch' | 'editable'>,
  evenement: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'preventDefault'>,
): boolean {
  const touche = evenement.key.toLowerCase()
  if (!(evenement.ctrlKey || evenement.metaKey) || evenement.altKey || !['z', 'y'].includes(touche)) return false
  evenement.preventDefault()
  if (vue.editable) {
    const commande = touche === 'y' || evenement.shiftKey ? redo : undo
    commande(vue.state, vue.dispatch)
  }
  return true
}

/** Un entretien ouvert ne doit pas pouvoir annuler son chargement ou le texte de l’entretien précédent. */
export function reinitialiserHistoriqueFrappe(editeur: Editor): void {
  const plugins = [...editeur.state.plugins]
  const historique = cleHistorique.get(editeur.state)
  if (!historique) return
  editeur.unregisterPlugin(cleHistorique)
  editeur.registerPlugin(historique, () => plugins)
}
