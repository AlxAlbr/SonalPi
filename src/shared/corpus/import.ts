import type { Categorie, CorpusFichier, Variable } from '../format'

/**
 * Sas d'import de l'agrégat Corpus — MODELE_OBJET2 §12, règle n°3 (idempotent par id).
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
