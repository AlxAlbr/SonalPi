import type { Categorie, CorpusFichier, Variable } from '../format'

/**
 * Sas d'import de l'agrégat Corpus : le seul flux applications→définitions,
 * idempotent par id (l'id d'import reprend le code legacy du fichier).
 * Fonction PURE ; l'I/O (lecture du `.sonal`) est faite par l'orchestration.
 */

/** Fusionne codebook + variables importés dans le corpus (par id ; l'existant
 *  fait foi → double import du même `.sonal` = zéro doublon). */
export function fusionnerImport(
  corpus: CorpusFichier,
  codebook: Categorie[],
  variables: Variable[],
): void {
  for (const c of codebook) if (!corpus.codebook[c.id]) corpus.codebook[c.id] = c
  for (const v of variables) if (!corpus.variables[v.id]) corpus.variables[v.id] = v
}
