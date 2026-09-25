import { debutBloc } from '../../entretien/positions'

interface NœudDocumentQualcoder {
  type: string
  text?: string
}

interface ParagrapheQualcoder {
  attrs?: { loc?: number | null }
  content?: NœudDocumentQualcoder[]
}

interface DocumentQualcoder {
  content?: ParagrapheQualcoder[]
}

export interface ProjectionTexteQualcoder {
  fulltext: string
  /** Convertit une position ProseMirror en position dans fulltext. */
  position: (positionPm: number) => number
  /** Bornes des blocs, pour les diagnostics de projection. */
  blocs: Array<{ debutPm: number; finPm: number; debutTexte: number; finTexte: number }>
}

/**
 * Produit le texte canonique de QualCoder et sa table de positions.
 * Les locuteurs restent des attributs de paragraphes : ils ne deviennent pas
 * des préfixes, afin que les offsets de QualCoder restentThose de la transcription.
 */
export function projeterTexteQualcoder(corpsTexte: unknown): ProjectionTexteQualcoder {
  const document = corpsTexte as DocumentQualcoder
  const paragraphes = Array.isArray(document?.content) ? document.content : []
  const poids = paragraphes.map((paragraphe) => (paragraphe.content ?? []).reduce(
    (total, noeud) => total + (noeud.type === 'hardBreak' ? 1 : (noeud.text ?? '').length), 0,
  ))
  const pieces: string[] = []
  const blocs: ProjectionTexteQualcoder['blocs'] = []
  let textePosition = 0
  paragraphes.forEach((paragraphe, index) => {
    if (index > 0) {
      pieces.push('\n\n')
      textePosition += 2
    }
    const debutPm = debutBloc(poids, index)
    const debutTexte = textePosition
    for (const noeud of paragraphe.content ?? []) {
      if (noeud.type === 'hardBreak') pieces.push('\n')
      else pieces.push(noeud.text ?? '')
      textePosition += noeud.type === 'hardBreak' ? 1 : (noeud.text ?? '').length
    }
    blocs.push({ debutPm, finPm: debutPm + poids[index], debutTexte, finTexte: textePosition })
  })
  const fulltext = pieces.join('')
  const debutPremier = blocs[0]?.debutPm ?? 1
  const position = (positionPm: number): number => {
    if (!blocs.length || positionPm <= debutPremier) return 0
    for (const bloc of blocs) {
      if (positionPm <= bloc.finPm) {
        const relatif = Math.max(0, positionPm - bloc.debutPm)
        // Les sauts internes sont des caractères du texte final.
        return bloc.debutTexte + relatif
      }
    }
    return fulltext.length
  }
  return { fulltext, position, blocs }
}

/** Coupe une plage PM et renvoie ses bornes et son texte dans fulltext. */
export function plageTexteQualcoder(
  projection: ProjectionTexteQualcoder,
  from: number,
  to: number,
): { from: number; to: number; seltext: string } {
  const debut = projection.position(from)
  const fin = projection.position(to)
  return {
    from: Math.min(debut, fin),
    to: Math.max(debut, fin),
    seltext: projection.fulltext.slice(Math.min(debut, fin), Math.max(debut, fin)),
  }
}
