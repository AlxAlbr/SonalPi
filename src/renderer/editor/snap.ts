import type { EditorState } from '@tiptap/pm/state'

/** Un caractère « de mot » (lettres accentuées comprises, chiffres, tiret). */
const WORD_CHAR = /[\p{L}\p{N}_-]/u

/**
 *  Étend une plage [from, to[ aux frontières de mot (snap-to-mot : le token
 *  reste la granularité de la sélection). N'agit que si les deux bornes sont
 *  dans le même bloc de texte ; sinon la plage est renvoyée inchangée.
 *  Fonction pure vis-à-vis du modèle (aucune dépendance au stockage).
 */
export function snapToWord(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number } {
  const $from = state.doc.resolve(from)
  const $to = state.doc.resolve(to)

  // Bornes dans des blocs différents → pas de snap (cas hors-scope au set minimum).
  if ($from.parent !== $to.parent || !$from.parent.isTextblock) {
    return { from, to }
  }

  const text = $from.parent.textContent
  let startOff = $from.parentOffset
  let endOff = $to.parentOffset

  // Sélection vide → on encadre le mot sous le curseur.
  const vide = startOff === endOff
  if (vide) {
    while (startOff > 0 && WORD_CHAR.test(text[startOff - 1])) startOff--
    while (endOff < text.length && WORD_CHAR.test(text[endOff])) endOff++
  } else {
    // Retire les séparateurs de bord sans inclure les mots voisins.
    while (startOff < endOff && !WORD_CHAR.test(text[startOff])) startOff++
    while (endOff > startOff && !WORD_CHAR.test(text[endOff - 1])) endOff--
    if (startOff < endOff) {
      while (startOff > 0 && WORD_CHAR.test(text[startOff - 1])) startOff--
      while (endOff < text.length && WORD_CHAR.test(text[endOff])) endOff++
    }
  }

  const blockStart = from - $from.parentOffset
  return { from: blockStart + startOff, to: blockStart + endOff }
}

/** Recule une position vers le DÉBUT du mot qui la contient (dans son bloc). */
function versDebutMot(state: EditorState, pos: number): number {
  const $p = state.doc.resolve(pos)
  if (!$p.parent.isTextblock) return pos
  const text = $p.parent.textContent
  let off = $p.parentOffset
  while (off > 0 && WORD_CHAR.test(text[off - 1])) off--
  return pos - ($p.parentOffset - off)
}

/** Avance une position vers la FIN du mot qui la contient (dans son bloc).
 *  N'étend que si la position est DANS un mot (précédée d'un caractère de mot) :
 *  si elle tombe déjà à la frontière de DÉBUT d'un mot (juste après un espace),
 *  on la laisse — la sélection s'arrête proprement là, sans absorber le mot qui
 *  suit (ex. sélection « Thomas, » qui ne doit pas avaler « Bonjour »). */
function versFinMot(state: EditorState, pos: number): number {
  const $p = state.doc.resolve(pos)
  if (!$p.parent.isTextblock) return pos
  const text = $p.parent.textContent
  let off = $p.parentOffset
  // Déjà au début d'un mot (précédé d'un séparateur) → frontière propre, on ne bouge pas.
  if (off > 0 && !WORD_CHAR.test(text[off - 1])) return pos
  while (off < text.length && WORD_CHAR.test(text[off])) off++
  return pos + (off - $p.parentOffset)
}

/**
 *  Snappe chaque borne à sa frontière de mot INDÉPENDAMMENT — chacune dans
 *  son bloc. Contrairement à `snapToWord` (qui exige les deux bornes dans un
 *  même bloc), sert à l'attribution de locuteur multi-blocs : on ne coupe
 *  jamais un mot en deux, même quand la sélection enjambe plusieurs blocs.
 */
export function snapBornes(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number } {
  return { from: versDebutMot(state, from), to: versFinMot(state, to) }
}
