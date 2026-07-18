import type { EditorState, Transaction } from '@tiptap/pm/state'

/**
 * S4 — « Attribuer la sélection » (commande de domaine côté éditeur, headless).
 *
 * Pose le locuteur `loc` sur TOUS les blocs couverts par [from, to[, en scindant
 * le bloc de tête et/ou de queue si une borne tombe en MILIEU de bloc. Renvoie la
 * transaction (NON appliquée) + les blocs touchés avec leur ANCIEN loc (support
 * du journal S5 : l'inverse = restaurer ces loc ; positions valides dans le doc
 * post-transaction, remappées ensuite par journalRemap), ou `null` si rien à
 * faire. Le remap des annotations est assuré par `pluginRemap`, qui voit passer
 * cette transaction (scission prouvée en POC3) — aucune plage n'est perdue, elle
 * enjambe la coupe.
 *
 * Timecodes : PLUS RIEN à faire ici depuis S7 (D-S14) — le temps est porté par
 * des ancres positionnées dans le texte, remappées comme les annotations : une
 * coupe ne déplace aucune ancre. L'ex-invariant D-S5 (bornes null aux fragments)
 * n'est plus du code, c'est une conséquence du remap.
 *
 * Fusion physique des blocs : AUCUNE (D-S2). Deux blocs adjacents de même `loc`
 * ne forment un « tour » que par dérivation au rendu (gouttière).
 */
export function attribuerSelectionTr(
  state: EditorState,
  from: number,
  to: number,
  loc: number | null,
): { tr: Transaction; blocs: Array<{ pos: number; ancien: number | null }> } | null {
  if (from >= to) return null

  const $from = state.doc.resolve(from)
  const $to = state.doc.resolve(to)
  if (!$from.parent.isTextblock || !$to.parent.isTextblock) return null

  const tr = state.tr

  // Une coupe n'est nécessaire que si la borne est STRICTEMENT à l'intérieur d'un
  // bloc (ni au tout début, ni à la toute fin) : sinon le bloc est couvert entier.
  const coupeQueue = to > $to.start() && to < $to.end()
  const coupeTete = from > $from.start() && from < $from.end()

  // 1) Coupe de QUEUE d'abord (position haute → les positions basses restent
  //    valides) ; le split copie les attrs (le fragment de queue hérite `loc`).
  if (coupeQueue) tr.split(to, 1)

  // 2) Coupe de TÊTE (chaînage sain quand tête et queue sont dans le même bloc).
  if (coupeTete) tr.split(from, 1)

  // 3) `loc` sur les blocs couverts. Les fragments de tête et
  //    de queue tombent hors [from2, to2] → ils gardent leur ancien loc. On note
  //    l'ANCIEN loc de chaque bloc touché (l'inverse S5) ; `setNodeMarkup` ne
  //    déplace aucune position → `pos` reste valide dans le doc final.
  const from2 = tr.mapping.map(from, 1)
  const to2 = tr.mapping.map(to, -1)
  const cibles: Array<{ pos: number; ancien: number | null }> = []
  tr.doc.nodesBetween(from2, to2, (node, pos) => {
    if (node.isTextblock) {
      cibles.push({ pos, ancien: (node.attrs.loc ?? null) as number | null })
      return false
    }
    return true
  })
  for (const { pos } of cibles) {
    const node = tr.doc.nodeAt(pos)
    if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, loc })
  }

  return tr.steps.length ? { tr, blocs: cibles } : null
}
