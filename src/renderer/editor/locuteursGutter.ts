import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { nomDeLocuteur } from '../../shared/entretien/locuteurs'
import type { Locuteur } from '../../shared/format'

export const gouttierePluginKey = new PluginKey('sonal-locuteurs-gutter')

/** Élément de gouttière : nom du locuteur, cliquable (place le curseur dans le
 *  bloc ; si un audio est chargé, cale AUSSI le lecteur au début du tour — S6). */
function elementGouttiere(
  view: EditorView,
  pos: number,
  label: string,
  vide: boolean,
  onClicTour?: (posBloc: number) => void,
): HTMLElement {
  const el = document.createElement('span')
  el.className = 'gouttiere-loc' + (vide ? ' vide' : '')
  el.textContent = label
  el.contentEditable = 'false'
  el.title = 'Cliquer pour se placer dans ce tour de parole (audio : seek au début du tour)'
  el.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation() // le clic-tour ne doit pas AUSSI déclencher le clic-texte (seek précis S7)
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, pos))
    view.dispatch(tr.scrollIntoView())
    view.focus()
    onClicTour?.(pos - 1) // pos = début du CONTENU → -1 = position du bloc
  })
  return el
}

function construire(state: EditorState, locuteurs: Locuteur[], onClicTour?: (pos: number) => void): DecorationSet {
  const decos: Decoration[] = []
  // Interviewers (ceux qui posent les questions) : leurs tours passent en
  // italique — le pendant du « ? » SonalPi, sans teinte de fond (choix S7+).
  const interviewers = new Set(locuteurs.filter((l) => l.interviewer).map((l) => l.index))
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
    const nom = premierDuTour ? nomDeLocuteur(locuteurs, loc) : ''
    // Le label reprend la convention SonalPi : « Nom ? » pour l'interviewer.
    const label = nom && loc != null && interviewers.has(loc) ? `${nom} ?` : nom
    const contentStart = offset + 1

    decos.push(
      Decoration.widget(
        contentStart,
        (view) => elementGouttiere(view, contentStart, label, loc == null, onClicTour),
        {
          side: -1,
          key: `g:${offset}:${loc}:${label}`,
        },
      ),
    )
    if (loc != null && interviewers.has(loc)) {
      decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'bloc-interviewer' }))
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
export function pluginGouttiere(
  getLocuteurs: () => Locuteur[],
  onClicTour?: (pos: number) => void,
): Plugin {
  return new Plugin({
    key: gouttierePluginKey,
    state: {
      init: (_config, state) => construire(state, getLocuteurs(), onClicTour),
      apply(tr, value, _old, newState) {
        if (tr.docChanged || tr.getMeta(gouttierePluginKey) === 'refresh') {
          return construire(newState, getLocuteurs(), onClicTour)
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
