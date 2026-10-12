import { aliasesCommuns, dedupliquerValeursAnon, validerDefinitionAnon, type DefinitionAnon } from '../../corpus/definitionsAnon'
import { cleEntite } from './brouillonsAnon'

export interface DefinitionAnonLocale extends DefinitionAnon {
  etat: 'declaration' | 'brouillon'
}

/** La mémoire locale ne contient que la définition, jamais des positions ni des compteurs. */
export function validerDefinitionLocale(definition: DefinitionAnonLocale): DefinitionAnonLocale {
  if (!definition || !['declaration', 'brouillon'].includes(definition.etat)) throw new Error('État de définition locale invalide.')
  return { ...validerDefinitionAnon(definition.entite, definition.pseudos, definition.categorie, definition.etat === 'brouillon'), etat: definition.etat }
}

export function memoriserDefinitionLocale(definitions: DefinitionAnonLocale[], definition: DefinitionAnonLocale): void {
  const valide = validerDefinitionLocale(definition)
  const cle = cleEntite(valide.entite.join('/'))
  const communes = definitions.filter((d) => aliasesCommuns(d.entite, valide.entite))
  if (communes.some((d) => cleEntite(d.entite.join('/')) !== cle)) throw new Error('Chevauchement partiel d’une définition locale. Aucun alias n’a été abandonné.')
  if (communes.length > 1) throw new Error('Plusieurs définitions locales partagent ces alias.')
  const index = definitions.findIndex((d) => d === communes[0])
  if (index < 0) definitions.push(valide)
  else definitions[index] = valide
}

export function normaliserPseudosDeclares(declarations: Record<string, string[]>): Record<string, string[]> {
  if (!declarations || typeof declarations !== 'object' || Array.isArray(declarations)) throw new Error('Déclarations de variantes invalides.')
  const resultat: Record<string, string[]> = Object.create(null)
  for (const [entite, pseudos] of Object.entries(declarations)) {
    const cle = cleEntite(entite)
    if (!cle || !Array.isArray(pseudos) || pseudos.some((p) => typeof p !== 'string')) throw new Error('Déclarations de variantes invalides.')
    resultat[cle] = dedupliquerValeursAnon([...(resultat[cle] ?? []), ...pseudos])
  }
  return resultat
}

export function validerMemoireLocale(definitions: DefinitionAnonLocale[]): DefinitionAnonLocale[] {
  if (!Array.isArray(definitions)) throw new Error('Mémoire locale invalide.')
  const resultat: DefinitionAnonLocale[] = []
  for (const definition of definitions) {
    const valide = validerDefinitionLocale(definition)
    if (resultat.some((d) => aliasesCommuns(d.entite, valide.entite))) throw new Error('Déclarations locales répétées ou recouvrantes.')
    resultat.push(valide)
  }
  return resultat
}

export function retirerDefinitionLocale(definitions: DefinitionAnonLocale[], entite: string): void {
  const cle = cleEntite(entite)
  for (let i = definitions.length - 1; i >= 0; i--) if (cleEntite(definitions[i].entite.join('/')) === cle) definitions.splice(i, 1)
}
