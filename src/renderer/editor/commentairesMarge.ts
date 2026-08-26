import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { estOrpheline } from '../../shared/entretien/annotation'
import type { Annotation } from '../../shared/entretien/annotation'
import type { Entretien } from '../../shared/entretien/entretien'
import { decorationsPluginKey } from './decorations'

export const commentairesPluginKey = new PluginKey('sonal-commentaires-marge')

/**
 *  Marge des commentaires : chaque PARAGRAPHE intersectant au moins un
 *  commentaire reçoit une colonne de cartes (décoration de nœud `p-commente` +
 *  UN widget par tour), empilées dans l'ordre du texte. Alignement AU TOUR PRÈS,
 *  pas au passage près : zéro mesure DOM, zéro collision — l'empilement est le
 *  flux normal de la colonne (même idiome que la gouttière locuteurs).
 *
 *  Survol croisé carte ↔ plage : l'état (« quels commentaires sont survolés »)
 *  passe par une MÉTA de transaction et se lit À LA CONSTRUCTION des
 *  décorations — JAMAIS par mutation directe du DOM généré (une classe posée en
 *  dehors de PM serait une « mutation inattendue » : PM redessinerait le
 *  widget, ce qui re-déclencherait le survol… boucle infinie de redraws).
 *
 *  Le clic sur une carte ouvre l'édition (callback `editer`, branché par la
 *  couche Vue). Les cartes sont `contenteditable=false` : jamais de curseur
 *  dans un widget ProseMirror.
 */

/** Commentaires visibles d'un entretien (les orphelines ne s'affichent pas). */
function commentairesVisibles(entretien: Entretien): Annotation[] {
  return entretien.annotations.filter((a) => a.type === 'commentaire' && !estOrpheline(a))
}

/** Carte d'un commentaire : auteur + extrait ;
 *  clic = éditer, survol = surligner la plage dans le texte (via la méta, pas le DOM direct).
 *  Exportée pour être testable headless. */
export function construireCarteCommentaire(
  a: Pick<Annotation, 'id' | 'auteur' | 'texte'>,
  editer: (id: string) => void,
  surSurvol: (ids: string[]) => void,
  survolee: boolean,
): HTMLElement {
  const carte = document.createElement('div')
  carte.className = 'carte-commentaire' + (survolee ? ' survol' : '')
  carte.dataset.commentaireId = a.id
  carte.contentEditable = 'false'
  const qui = document.createElement('span')
  qui.className = 'carte-auteur'
  qui.textContent = a.auteur || 'Sans auteur'
  const quoi = document.createElement('div')
  quoi.className = 'carte-texte'
  quoi.textContent = a.texte ?? ''
  carte.title = `${a.auteur || 'Sans auteur'} : ${a.texte ?? ''}`
  carte.appendChild(qui)
  carte.appendChild(quoi)
  // Mousedown avalé : le clic sur une carte ne doit ni déplacer le curseur,
  // ni déclencher le seek audio du clic-texte.
  carte.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  carte.addEventListener('click', (e) => {
    e.stopPropagation()
    editer(a.id)
  })
  carte.addEventListener('mouseenter', () => surSurvol([a.id]))
  carte.addEventListener('mouseleave', () => surSurvol([]))
  return carte
}

interface EtatMarge {
  decos: DecorationSet
  /** Ids de commentaires actuellement survolés (souris sur carte ou plage). */
  survol: string[]
}

function construire(
  state: EditorState,
  entretien: Entretien,
  editer: (id: string) => void,
  surSurvol: (ids: string[]) => void,
  survol: string[],
): DecorationSet {
  const commentaires = commentairesVisibles(entretien)
  if (commentaires.length === 0) return DecorationSet.empty

  const survolSet = new Set(survol)
  const decos: Decoration[] = []

  // Plages surlignées au survol (décorations INLINE : PM gère son propre DOM).
  for (const a of commentaires) {
    if (!survolSet.has(a.id)) continue
    decos.push(Decoration.inline(a.from, a.to, { class: 'survol-commentaire' }))
  }

  state.doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph') return
    const debutContenu = offset + 1
    const finContenu = offset + node.nodeSize
    const ici = commentaires
      .filter((a) => a.from < finContenu && a.to > debutContenu)
      // Empilement par POSITION DANS LE TEXTE, pas par ordre d'édition :
      // éditer un commentaire ancien ne le fait pas sauter en fin de colonne.
      .sort((a, b) => a.from - b.from || a.to - b.to)
    if (ici.length === 0) return

    decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'p-commente' }))
    // La clé embarque contenu, texte ET état de survol :
    // une édition comme un survol doivent reconstruire la colonne (sinon DOM périmé).
    const cle = `c:${offset}:${survolSet.size}:${ici
      .map((a) => `${a.id}:${a.auteur}:${a.texte}:${survolSet.has(a.id) ? 1 : 0}`)
      .join('|')}`
    decos.push(
      Decoration.widget(debutContenu, () => {
        const col = document.createElement('div')
        col.className = 'marge-commentaires'
        col.contentEditable = 'false'
        for (const a of ici)
          col.appendChild(construireCarteCommentaire(a, editer, surSurvol, survolSet.has(a.id)))
        return col
      }, { side: -1, key: cle }),
    )
  })
  return DecorationSet.create(state.doc, decos)
}

/**
 *  Plugin de la marge. Se reconstruit quand le doc change OU qu'un « refresh »
 *  passe (le sien ou celui des décorations : toute mutation du modèle — poser,
 *  éditer, supprimer un commentaire — repasse par rafraichirDecorations) OU que
 *  l'état de survol change.
 */
export function pluginCommentairesMarge(entretien: Entretien, editer: (id: string) => void): Plugin {
  /** Survol → méta (PM reste maître du DOM ; cf. note d'en-tête). Dédoublonné :
   *  ne pas re-dispatcher pour le même état (sinon boucle de redraws). */
  let survolCourant: string[] = []
  function surSurvol(ids: string[], view?: { dispatch: (tr: Transaction) => void; state: EditorState }) {
    if (view) {
      const actuel = survolCourant.join(',')
      const demande = [...ids].sort().join(',')
      if (actuel === demande) return
      view.dispatch(view.state.tr.setMeta(commentairesPluginKey, ids))
    }
  }
  return new Plugin({
    key: commentairesPluginKey,
    state: {
      init: (_config, state): EtatMarge => ({
        decos: construire(state, entretien, editer, surSurvol, []),
        survol: [],
      }),
      apply(tr, value, _old, newState) {
        let survol = value.survol
        const meta = tr.getMeta(commentairesPluginKey)
        if (Array.isArray(meta)) survol = meta
        survolCourant = survol
        if (
          tr.docChanged ||
          Array.isArray(meta) ||
          tr.getMeta(decorationsPluginKey) === 'refresh'
        ) {
          return {
            decos: construire(newState, entretien, editer, surSurvol, survol),
            survol,
          }
        }
        return { decos: value.decos.map(tr.mapping, tr.doc), survol }
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decos ?? DecorationSet.empty
      },
      handleDOMEvents: {
        // Sens TEXTE → CARTE : le curseur entre sur un segment annoté,
        // on surligne les cartes des commentaires qui le couvrent (via méta).
        mouseover(view, event) {
          const cible = event.target as HTMLElement | null
          const ids = cible?.closest?.('[data-annot-ids]')?.getAttribute('data-annot-ids')
          const commentaires = (ids ?? '')
            .split(' ')
            .filter((id) =>
              entretien.annotations.some((a) => a.id === id && a.type === 'commentaire'),
            )
            .sort()
          surSurvol(commentaires, view)
          return false // non consommé : le survol reste un geste passif
        },
      },
    },
  })
}
