/**
 *  Règles corpus (`RegleAnon`) — cœur PUR : aucune I/O, aucune dépendance UI.
 *
 *  La règle est la SEULE vérité « entité → pseudos » partagée au corpus
 *  (`corpus.json.reglesAnon`). Le store ne fait que lire → appliquer → écrire ;
 *  le calcul (trouver par entité, créer, réutiliser, garder les deux, retirer,
 *  comptage d'usage) vit ICI, pur et testable headless.
 */

import type { CorpusFichier, RegleAnon } from '../format'
import { parserAliases } from '../entretien/anon'

/** Trouve la règle régnant sur cette entité : PARTAGE d'au moins un alias
 *  (un groupe « Lyon/Lyons » répond aussi pour « Lyon » seul — deux règles
 *  partageant un alias re-pseudonymiseraient les mêmes occurrences). */
export function trouverRegleParEntite(corpus: CorpusFichier, entite: string): RegleAnon | undefined {
  const cles = new Set(parserAliases(entite).map((a) => a.toLowerCase()))
  for (const r of Object.values(corpus.reglesAnon)) {
    if (r.entite.some((e) => parserAliases(e).some((a) => cles.has(a.toLowerCase())))) return r
  }
  return undefined
}

/** Crée une règle et la persiste dans le corpus (mutation) ; `genId` est
 *  injecté (comme pour les autres CRUD du corpus).
 *
 *  Défensive multi-utilisateur : si une règle gouverne déjà cette entité dans
 *  les données fraîches, elle est renvoyée telle quelle, sans mutation.
 *  Une seule règle par entité, donc jamais de doublon — même quand un
 *  collègue vient de poser sa version depuis un autre poste.
 *  L'appelant distingue les deux cas via sa propre lecture préalable
 *  (cf. `CorpusStore.regleAnonCreer`). */
export function creerRegle(corpus: CorpusFichier, entite: string, pseudos: string[], genId: () => string): RegleAnon {
  const existante = trouverRegleParEntite(corpus, entite)
  if (existante) return existante
  const r: RegleAnon = {
    id: genId(),
    entite: parserAliases(entite), // saisie « Lyon/Lyons » → groupe d'alias
    pseudos: pseudos.filter((p) => p.trim() !== ''),
  }
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
