import { parserAliases } from '../entretien/anon/alias'

export interface DefinitionAnon {
  entite: string[]
  pseudos: string[]
  categorie?: string
}

export class ErreurDefinitionAnon extends Error {
  constructor(public readonly code: 'format' | 'entite-vide' | 'pseudo-vide' | 'pseudos-nombre' | 'alias-variantes', message: string) {
    super(message)
    this.name = 'ErreurDefinitionAnon'
  }
}

const cle = (texte: string) => texte.normalize('NFC').toLocaleLowerCase('fr')
export function dedupliquerValeursAnon(valeurs: string[]): string[] {
  const uniques = new Map<string, string>()
  for (const valeur of valeurs) {
    const texte = valeur.trim().normalize('NFC')
    if (texte && !uniques.has(cle(texte))) uniques.set(cle(texte), texte)
  }
  return [...uniques.values()]
}

/** Valide sans tronquer : plusieurs alias ou deux variantes, jamais les deux ensemble. */
export function validerDefinitionAnon(entite: unknown, pseudos: unknown, categorie?: unknown, brouillon = false): DefinitionAnon {
  if (typeof entite === 'string') entite = parserAliases(entite)
  if (!Array.isArray(entite) || !entite.every((e) => typeof e === 'string') ||
    !Array.isArray(pseudos) || !pseudos.every((p) => typeof p === 'string') ||
    (categorie != null && typeof categorie !== 'string')) {
    throw new ErreurDefinitionAnon('format', 'La définition doit contenir des alias et des pseudonymes textuels.')
  }
  const aliases = dedupliquerValeursAnon((entite as string[]).flatMap(parserAliases))
  const variantes = dedupliquerValeursAnon(pseudos as string[])
  if (!aliases.length) throw new ErreurDefinitionAnon('entite-vide', 'Saisissez au moins une entité originale.')
  if (!variantes.length && !brouillon) throw new ErreurDefinitionAnon('pseudo-vide', 'Saisissez au moins un pseudonyme.')
  if (variantes.length > 2) throw new ErreurDefinitionAnon('pseudos-nombre', 'Deux pseudonymes maximum sont autorisés. Résolvez les variantes supplémentaires.')
  if (aliases.length > 1 && variantes.length > 1) {
    throw new ErreurDefinitionAnon('alias-variantes', 'Choisissez plusieurs alias avec un seul pseudo, ou une seule entité avec deux variantes.')
  }
  const cat = (categorie as string | undefined | null)?.trim()
  return { entite: aliases, pseudos: variantes, ...(cat ? { categorie: cat } : {}) }
}

export function aliasesCommuns(a: string[], b: string[]): boolean {
  const cles = new Set(a.flatMap(parserAliases).map(cle))
  return b.flatMap(parserAliases).some((alias) => cles.has(cle(alias)))
}
