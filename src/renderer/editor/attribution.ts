import type { EditorState, Transaction } from '@tiptap/pm/state'

/**
 * S4 — « Attribuer la sélection » (commande de domaine côté éditeur, headless).
 *
 * Pose le locuteur `loc` sur TOUS les blocs couverts par [from, to[, en scindant
 * le bloc de tête et/ou de queue si une borne tombe en MILIEU de bloc. Renvoie la
 * transaction (NON appliquée) ou `null` si rien à faire. Le remap des annotations
 * est assuré par `pluginRemap`, qui voit passer cette transaction (scission prouvée
 * en POC3) — aucune plage n'est perdue, elle enjambe la coupe.
 *
 * Invariant timecodes (D-S5 / D-S13) : une coupe fabrique une borne INCONNUE → on
 * la met à `null`, jamais une valeur inventée. Le fragment de GAUCHE garde le `deb`
 * du bloc d'origine (et perd son `fin`) ; celui de DROITE garde le `fin` (et perd
 * son `deb`). Les cues entiers couverts (intérieurs, ou extrémité non coupée)
 * gardent leurs timecodes mesurés. L'interpolation audio reste une DÉRIVATION à la
 * lecture (S6) : rien n'est stocké ici.
 *
 * Fusion physique des blocs : AUCUNE (D-S2). Deux blocs adjacents de même `loc`
 * ne forment un « tour » que par dérivation au rendu (gouttière).
 */
export function attribuerSelectionTr(
  state: EditorState,
  from: number,
  to: number,
  loc: number | null,
): Transaction | null {
  if (from >= to) return null

  const $from = state.doc.resolve(from)
  const $to = state.doc.resolve(to)
  if (!$from.parent.isTextblock || !$to.parent.isTextblock) return null

  const paragraph = state.schema.nodes.paragraph
  const tr = state.tr

  // Une coupe n'est nécessaire que si la borne est STRICTEMENT à l'intérieur d'un
  // bloc (ni au tout début, ni à la toute fin) : sinon le bloc est couvert entier.
  const coupeQueue = to > $to.start() && to < $to.end()
  const coupeTete = from > $from.start() && from < $from.end()

  // 1) Coupe de QUEUE d'abord (position haute → les positions basses restent valides).
  //    left = fragment couvert (garde deb, perd fin) ; right = queue (perd deb, garde fin).
  if (coupeQueue) {
    const attrs = $to.parent.attrs
    tr.setNodeMarkup($to.before($to.depth), undefined, { ...attrs, fin: null })
    tr.split(to, 1, [{ type: paragraph, attrs: { ...attrs, deb: null } }])
  }

  // 2) Coupe de TÊTE. On relit l'état COURANT du bloc (chaînage quand tête et queue
  //    sont dans le même bloc : le fragment intérieur hérite alors deb=fin=null).
  //    left = tête (garde deb, perd fin) ; right = fragment couvert (perd deb, garde fin).
  if (coupeTete) {
    const $f = tr.doc.resolve(from)
    const attrs = $f.parent.attrs
    tr.setNodeMarkup($f.before($f.depth), undefined, { ...attrs, fin: null })
    tr.split(from, 1, [{ type: paragraph, attrs: { ...attrs, deb: null } }])
  }

  // 3) `loc` sur les blocs couverts (timecodes PRÉSERVÉS). Les fragments de tête et
  //    de queue tombent hors [from2, to2] → ils gardent leur ancien loc.
  const from2 = tr.mapping.map(from, 1)
  const to2 = tr.mapping.map(to, -1)
  const cibles: number[] = []
  tr.doc.nodesBetween(from2, to2, (node, pos) => {
    if (node.isTextblock) {
      cibles.push(pos)
      return false
    }
    return true
  })
  for (const pos of cibles) {
    const node = tr.doc.nodeAt(pos)
    if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, loc })
  }

  return tr.steps.length ? tr : null
}
