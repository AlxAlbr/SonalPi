import { parserAliases, regleEnCollisionAlias } from '../entretien/anon'
import type { Categorie, CorpusFichier, RegleAnon, Variable } from '../format'

/**
 *  Sas d'import de l'agrégat Corpus : le seul flux applications→définitions,
 *  idempotent par id (l'id d'import reprend le code legacy du fichier).
 *  Fonction PURE ; l'I/O (lecture du `.sonal`) est faite par l'orchestration.
 */

/** Fusionne codebook + variables importés dans le corpus, par id ;
 *  l'existant fait foi (double import du même `.sonal` = zéro doublon). */
export function fusionnerImport(
  corpus: CorpusFichier,
  codebook: Categorie[],
  variables: Variable[],
): void {
  for (const c of codebook) if (!corpus.codebook[c.id]) corpus.codebook[c.id] = c
  for (const v of variables) if (!corpus.variables[v.id]) corpus.variables[v.id] = v
}

/** Fusionne les règles corpus importées (anon-json portée corpus) dans le corpus,
 *  en respectant « un alias = un pseudo » : une règle entrante qui ne
 *  touche aucune règle existante est ajoutée telle quelle ; un double import
 *  du même `.sonal` n'ajoute rien ; et si l'entrant PARTAGE seulement certains
 *  alias avec des règles existantes, il est ÉCLATÉ — les alias libres restent
 *  libres et deviennent une règle à part (parité V1 « garder les alias
 *  libres »), les alias déjà gouvernés restant où ils sont. */
export function fusionnerReglesAnon(corpus: CorpusFichier, regles: RegleAnon[]): void {
  for (const r of regles) {
    const existantes = Object.values(corpus.reglesAnon)
    // Alias de l'entrant déjà gouvernés par une règle existante → retirés.
    const occupes = new Set<string>()
    for (const e of r.entite) {
      for (const a of parserAliases(e)) {
        if (regleEnCollisionAlias(a, existantes)) occupes.add(a.toLowerCase())
      }
    }
    const libres: string[] = []
    for (const e of r.entite) {
      for (const a of parserAliases(e)) {
        if (!occupes.has(a.toLowerCase()) && !libres.some((x) => x.toLowerCase() === a.toLowerCase())) {
          libres.push(a)
        }
      }
    }
    if (libres.length === 0) continue // tout l'entrant est déjà gouverné : rien à ajouter
    corpus.reglesAnon[r.id] = { ...r, entite: libres }
  }
}
