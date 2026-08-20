/**
 * Règles corpus (`RegleAnon`) — cœur PUR (3b, plan_anon_suite §4.2/§4.3).
 *
 * La règle est la SEULE vérité « entité → pseudos » partagée au corpus
 * (`corpus.json.reglesAnon`). Le store ne fait que lire → appliquer → écrire ;
 * le calcul (trouver par entité, créer, réutiliser, garder les deux, retirer,
 * comptage d'usage) vit ICI, pur et testable headless.
 */

import type { CorpusFichier, RegleAnon } from '../format'
import { cleEntite } from '../entretien/brouillonsAnon'

/** Trouve la règle d'une entité (insensible à la casse sur les alias `entite[]`). */
export function trouverRegleParEntite(corpus: CorpusFichier, entite: string): RegleAnon | undefined {
  const cle = cleEntite(entite)
  for (const r of Object.values(corpus.reglesAnon)) {
    if (r.entite.some((e) => cleEntite(e) === cle)) return r
  }
  return undefined
}

/** Crée une règle (l'entité n'a PAS encore de règle) et la persiste dans le
 *  corpus (mutation). `genId` injecté (comme les autres CRUD du corpus). */
export function creerRegle(corpus: CorpusFichier, entite: string, pseudos: string[], genId: () => string): RegleAnon {
  const r: RegleAnon = { id: genId(), entite: [entite.trim()], pseudos: pseudos.filter((p) => p.trim() !== '') }
  corpus.reglesAnon[r.id] = r
  return r
}

/** « Garder les deux » : ajoute un pseudo à une règle existante si absent et
 *  sous le cap (≤2). Mutation ; renvoie le pseudo ajouté (ou undefined sinon). */
export function ajouterPseudoRegle(corpus: CorpusFichier, id: string, pseudo: string): string | undefined {
  const r = corpus.reglesAnon[id]
  if (!r) return undefined
  const p = pseudo.trim()
  if (!p) return undefined
  if (r.pseudos.some((x) => x.toLowerCase() === p.toLowerCase())) return undefined
  if (r.pseudos.length >= 2) return undefined
  r.pseudos.push(p)
  return p
}

/** Retire une règle du corpus (mutation). Renvoie true si elle existait. */
export function retirerRegle(corpus: CorpusFichier, id: string): boolean {
  if (!(id in corpus.reglesAnon)) return false
  delete corpus.reglesAnon[id]
  return true
}
