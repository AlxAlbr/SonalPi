import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { nomDeLocuteur } from '../../shared/entretien/locuteurs'
import type { Locuteur } from '../../shared/format'

export const gouttierePluginKey = new PluginKey('sonal-locuteurs-gutter')

/** Teinte très pâle par locuteur (index → angle d'or) — repère discret. */
function tinte(index: number): string {
  return `hsl(${(index * 137.5) % 360} 55% 96%)`
}

/** Élément de gouttière : nom du locuteur, cliquable (place le curseur dans le bloc). */
function elementGouttiere(view: EditorView, pos: number, label: string, vide: boolean): HTMLElement {
  const el = document.createElement('span')
  el.className = 'gouttiere-loc' + (vide ? ' vide' : '')
  el.textContent = label
  el.contentEditable = 'false'
  el.title = 'Cliquer pour se placer dans ce tour de parole'
  el.addEventListener('mousedown', (e) => {
    e.preventDefault()
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, pos))
    view.dispatch(tr.scrollIntoView())
    view.focus()
  })
  return el
}

function construire(state: EditorState, locuteurs: Locuteur[]): DecorationSet {
  const decos: Decoration[] = []
  let precedent: number | null | undefined = undefined
  state.doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph') {
      precedent = undefined
      return
    }
    const loc = node.attrs.loc as number | null
    // Tour de parole = DÉRIVÉ (run de blocs consécutifs de même loc) : on n'affiche
    // le nom que sur le 1er bloc du tour ; rien n'est stocké (MODELE_OBJET2 §4).
    const premierDuTour = loc !== precedent
    precedent = loc
    const label = premierDuTour ? nomDeLocuteur(locuteurs, loc) : ''
    const contentStart = offset + 1

    decos.push(
      Decoration.widget(contentStart, (view) => elementGouttiere(view, contentStart, label, loc == null), {
        side: -1,
        key: `g:${offset}:${loc}:${label}`,
      }),
    )
    if (loc != null) {
      decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'bloc-loc', style: `background:${tinte(loc)};` }))
    }
  })
  return DecorationSet.create(state.doc, decos)
}

/**
 * Gouttière des locuteurs. Se reconstruit quand le doc change (attribution d'un
 * loc, scission de bloc) OU quand la liste des locuteurs change (méta 'refresh',
 * émise à un renommage/ajout — les blocs référencent l'index, donc renommer ne
 * touche AUCUN bloc, seul le rendu se rafraîchit).
 */
export function pluginGouttiere(getLocuteurs: () => Locuteur[]): Plugin {
  return new Plugin({
    key: gouttierePluginKey,
    state: {
      init: (_config, state) => construire(state, getLocuteurs()),
      apply(tr, value, _old, newState) {
        if (tr.docChanged || tr.getMeta(gouttierePluginKey) === 'refresh') {
          return construire(newState, getLocuteurs())
        }
        return value.map(tr.mapping, tr.doc)
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)
      },
    },
  })
}
