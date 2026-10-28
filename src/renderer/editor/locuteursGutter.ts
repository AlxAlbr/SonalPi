import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { libelleGouttiere, type LibelleGouttiere } from '../../shared/entretien/locuteurs'
import type { Locuteur } from '../../shared/format'

export const gouttierePluginKey = new PluginKey('sonal-locuteurs-gutter')

/**
 *  Élément de gouttière : le libellé passe AU-DESSUS du
 *  bloc (layout SonalPi1 `.ligloc`) — c'est ce qui permet de barrer le nom et
 *  d'afficher `[pseudo]` SANS décaler le texte du tour, qui démarre pleine
 *  largeur dessous. Le widget reste UNE DÉCORATION dans le contenu du paragraphe
 *  (`display:block` = sa propre ligne) : le schéma n'est pas touché, la
 *  géométrie des positions n'est pas modifiée (le remap des ancres/annotations
 *  est sans conséquence).
 *
 *  Libellé : nom réel (avec « ? » interviewer) ; pseudonymisé → nom BARRÉ +
 *  [pseudo] (le pseudo vit dans un span SŒUR du nom : le line-through du nom ne
 *  se propage pas — même astuce d'atomicité que `.anon::after`) ; refus explicite
 *  → nom en clair + ⊘. Le clic-tour (placer le curseur + seek audio au début du
 *  tour) reste porté par le libellé.
 *
 *  Placement (comme SonalPi1, header du segment « deb » seulement) :
 *  - 1er bloc d'un tour AVEC locuteur → libellé ; pseudonymisé, le nom est
 *  barré + [pseudo] sur la même ligne (le texte du tour n'est pas décalé) ;
 *  - 1er bloc d'un tour SANS locuteur (loc null) → gouttière vide cliquable ;
 *  - blocs de CONTINUATION du même tour → RIEN (pas de ligne vide entre
 *  paragraphes d'un même tour).
 */
/**
 *  Construit le DOM du libellé de gouttière (sans le clic, branché par
 *  `elementGouttiere`) — exportée pour être testable headless (happy-dom) :
 *  c'est ici que vit la regle « sans pseudo, RIEN n'est barré ».
 */
export function construireLibelleGouttiere(lib: LibelleGouttiere, vide: boolean): HTMLElement {
  const el = document.createElement('span')
  el.className = 'gouttiere-loc' + (vide ? ' vide' : '')
  el.contentEditable = 'false'
  el.title = 'Cliquer pour se placer dans ce tour de parole (audio : seek au début du tour)'
  if (!vide) {
    // Les textes sont posés dans des SPANS SŒURS :
    // la concaténation du widget reste « Enquêteur » / « Enquêteur ? » sans pseudo —
    // les sélecteurs e2e existants (text-is) et le clic-tour ne bougent pas.
    const nom = document.createElement('span')
    nom.className = 'loc-nom'
    nom.textContent = lib.nom
    // Le NOM s'écrit dans la couleur du locuteur, choisie dans la palette (tableau)
    // ou auto par index — l'identité visuelle suit partout.
    nom.style.color = lib.couleur
    el.appendChild(nom)
    if (lib.pseudo) {
      // Classe de pseudonymisation (parité SonalPi1 `loc-anon`) : elle seule active le BARRÉ du nom dans le CSS —
      // sans pseudo posé, le libellé reste en clair (aucune décoration de texte).
      el.classList.add('loc-anon')
      el.appendChild(document.createTextNode(' '))
      const pseudo = document.createElement('span')
      pseudo.className = 'loc-pseudo'
      pseudo.textContent = `[${lib.pseudo}]`
      // Le PSEUDO s'écrit AUSSI dans la couleur du locuteur (même identité visuelle que le nom) :
      // « Alain » barre vert + « [Paul] » vert.
      pseudo.style.color = lib.couleur
      el.appendChild(pseudo)
    } else if (lib.refuse) {
      el.appendChild(document.createTextNode(' '))
      const refus = document.createElement('span')
      refus.className = 'loc-refus'
      refus.textContent = '⊘'
      refus.title = 'Pseudonymisation refusée pour ce libellé'
      el.appendChild(refus)
    }
  }
  return el
}

/**
 *  Élément de gouttière complet : DOM du libellé + gestion du clic-tour
 *  (place le curseur dans le bloc ; si un audio est chargé, cale AUSSI le
 *  lecteur au début du tour).
 */
function elementGouttiere(
  view: EditorView,
  pos: number,
  lib: LibelleGouttiere,
  vide: boolean,
  onClicTour?: (posBloc: number) => void,
): HTMLElement {
  const el = construireLibelleGouttiere(lib, vide)
  el.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation() // le clic-tour ne doit pas AUSSI déclencher le clic-texte (seek précis)
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, pos))
    view.dispatch(tr.scrollIntoView())
    view.focus()
    onClicTour?.(pos - 1) // pos = début du CONTENU → -1 = position du bloc
  })
  return el
}

function construire(state: EditorState, locuteurs: Locuteur[], onClicTour?: (pos: number) => void): DecorationSet {
  const decos: Decoration[] = []
  // Interviewers (ceux qui posent les questions) : leurs tours passent en italique —
  // le pendant du « ? » SonalPi1, sans teinte de fond (rendu neutre).
  const interviewers = new Set(locuteurs.filter((l) => l.interviewer).map((l) => l.index))
  let precedent: number | null | undefined = undefined
  state.doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph') {
      precedent = undefined
      return
    }
    const loc = node.attrs.loc as number | null
    // Tour de parole = DÉRIVÉ (run de blocs consécutifs de même loc) : on n'affiche le nom que sur le 1er bloc du tour ;
    // rien n'est stocké.
    const premierDuTour = loc !== precedent
    precedent = loc
    const bordereau = premierDuTour
      ? { lib: libelleGouttiere(locuteurs, loc, loc != null && interviewers.has(loc)), vide: loc == null }
      : null
    const contentStart = offset + 1

    if (bordereau) {
      decos.push(
        Decoration.widget(
          contentStart,
          (view) => elementGouttiere(view, contentStart, bordereau.lib, bordereau.vide, onClicTour),
          {
            side: -1,
            key: `g:${offset}:${loc}:${bordereau.lib.nom}:${bordereau.lib.pseudo ?? ''}:${bordereau.lib.couleur}`,
          },
        ),
      )
    }
    // TOUT bloc d'un locuteur nommé garde le retrait du texte (lbl-tour) :
    // un retour à la ligne (Entrée = scission) ou un enchaînement de blocs du même tour ne réaligne jamais le texte à gauche —
    // seul le 1er bloc porte le libellé (le widget, posé ci-dessus).
    // Les classes sont fusionnées en UNE décoration de nœud (deux décorations sur le même nœud s'écraseraient sur l'attribut class).
    // Un tour SANS locuteur (loc null) reste à pleine largeur.
    if (loc != null) {
      const classes = 'lbl-tour' + (interviewers.has(loc) ? ' bloc-interviewer' : '')
      decos.push(Decoration.node(offset, offset + node.nodeSize, { class: classes }))
    }
  })
  return DecorationSet.create(state.doc, decos)
}

/**
 *  Gouttière des locuteurs. Se reconstruit quand le doc change (attribution d'un
 *  loc, scission de bloc) OU quand la liste des locuteurs change OU qu'un pseudo
 *  est posé/refusé (méta 'refresh') — les blocs référencent l'index, donc ces
 *  changements ne touchent AUCUN bloc, seul le rendu se rafraîchit.
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