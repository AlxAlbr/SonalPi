import { cleEntite } from '../entretien/anon'
import type { Categorie, CorpusFichier, RegleAnon, Variable } from '../format'

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

/** Fusionne les règles corpus importées (anon-json portée corpus) dans le
 *  corpus **sans doublon d'entité** (l'existant fait foi — une entité = une
 *  règle, parité V1 ; un double import d'un même `.sonal` n'ajoute rien). */
export function fusionnerReglesAnon(corpus: CorpusFichier, regles: RegleAnon[]): void {
  for (const r of regles) {
    const deja = Object.values(corpus.reglesAnon).some((ex) =>
      ex.entite.some((e) => r.entite.some((re) => cleEntite(e) === cleEntite(re))),
    )
    if (deja) continue
    corpus.reglesAnon[r.id] = r
  }
}
