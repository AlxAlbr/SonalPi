/**
 *  Alias d'entité — cœur PUR du multi-alias (étape 3a).
 *
 *  Une entité peut porter plusieurs graphies (« Lyon/Lyons ») : le séparateur
 *  `/` (parité V1 SonalPi, `parseAliases`) scinde la saisie en alias. Un alias
 *  ne peut gouverner qu'UN seul pseudo : deux règles qui partagent un alias
 *  re-pseudonymiseraient les mêmes occurrences — c'est une COLLISION.
 */
import type { RegleAnon } from '../../format'

/** Scinde une saisie « Lyon/Lyons » en alias (`/`, ± espaces ; trim, sans vide).
 *  Une saisie sans `/` → liste d'un seul alias. */
export function parserAliases(entite: string): string[] {
  if (!entite) return []
  return entite
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/**
 *  Cherche, parmi des règles, la PREMIÈRE qui partage au moins un alias
 *  (insensible à la casse) avec l'entité donnée — c.-à-d. qui
 *  re-pseudonymiserait les mêmes occurrences. Sert aux points d'entrée
 *  (promotion, fusion) pour faire respecter « un alias = un pseudo », y compris
 *  quand l'un est un groupe « A/B » et l'autre l'alias seul « A ».
 *  Renvoie la règle en collision, ou undefined.
 */
export function regleEnCollisionAlias(
  entite: string,
  regles: RegleAnon[],
): RegleAnon | undefined {
  const cibles = new Set(parserAliases(entite).map((a) => a.toLowerCase()))
  if (cibles.size === 0) return undefined
  return regles.find((r) =>
    r.entite.some((e) => parserAliases(e).some((a) => cibles.has(a.toLowerCase()))),
  )
}
