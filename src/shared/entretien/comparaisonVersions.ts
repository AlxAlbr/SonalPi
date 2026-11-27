/**
 *  Comparaison lisible de deux versions du texte d'un entretien.
 *  Sert à montrer à l'utilisateur sa version gardée sur ce poste,
 *  en signalant les passages qui diffèrent de la version actuelle.
 */

type DocTexte = { content?: Array<{ content?: Array<{ type?: string; text?: string }> }> }

/** Paragraphes du texte d'un entretien, dans l'ordre (sauts de ligne internes conservés). */
export function paragraphesDuTexte(corpsTexte: unknown): string[] {
  const doc = corpsTexte as DocTexte | null
  return (doc?.content ?? []).map((p) =>
    (p.content ?? []).map((n) => (n.type === 'hardBreak' ? '\n' : n.text ?? '')).join(''),
  )
}

export interface ParagrapheCompare {
  texte: string
  /** Vrai si ce paragraphe n'existe pas, à l'identique, dans la version de référence. */
  different: boolean
}

/** Paragraphes d'une version, chacun marqué s'il est absent de la référence.
 *  Un paragraphe répété n'est reconnu qu'autant de fois qu'il figure dans la référence. */
export function comparerParagraphes(version: unknown, reference: unknown): ParagrapheCompare[] {
  const restants = new Map<string, number>()
  for (const p of paragraphesDuTexte(reference)) restants.set(p, (restants.get(p) ?? 0) + 1)
  return paragraphesDuTexte(version).map((texte) => {
    const n = restants.get(texte) ?? 0
    if (n > 0) {
      restants.set(texte, n - 1)
      return { texte, different: false }
    }
    return { texte, different: true }
  })
}
