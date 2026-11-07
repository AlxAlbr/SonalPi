/**
 *  Règles corpus (`RegleAnon`) — cœur PUR : aucune I/O, aucune dépendance UI.
 *
 *  La règle est la SEULE vérité « entité → pseudos » partagée au corpus
 *  (`corpus.crp.reglesAnon`). Le store ne fait que lire → appliquer → écrire ;
 *  le calcul (trouver par entité, créer, réutiliser, garder les deux, retirer,
 *  comptage d'usage) vit ICI, pur et testable headless.
 */

import type { CorpusFichier, RegleAnon } from '../format'
import { parserAliases } from '../entretien/anon'
import { aliasesCommuns, validerDefinitionAnon } from './definitionsAnon'

/** Cherche une définition non ambiguë partageant au moins un alias. */
export function trouverRegleParEntite(corpus: CorpusFichier, entite: string): RegleAnon | undefined {
  const cherche = parserAliases(entite)
  const correspondances = Object.values(corpus.reglesAnon).filter((r) => aliasesCommuns(r.entite, cherche))
  return correspondances.length === 1 ? correspondances[0] : undefined
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
export function creerRegle(corpus: CorpusFichier, entite: string, pseudos: string[], genId: () => string, categorie?: string): RegleAnon {
  const definition = validerDefinitionAnon(entite, pseudos, categorie)
  const collisions = Object.values(corpus.reglesAnon).filter((r) => aliasesCommuns(r.entite, definition.entite))
  if (collisions.length > 1) throw new Error('Plusieurs règles partagent ces alias. Résolvez la collision avant de créer une règle.')
  const existante = collisions[0]
  if (existante) {
    const connus = new Set(existante.entite.flatMap(parserAliases).map((e) => e.normalize('NFC').toLocaleLowerCase('fr')))
    if (definition.entite.some((e) => !connus.has(e.toLocaleLowerCase('fr')))) {
      throw new Error('Le groupe recouvre une règle existante et contient de nouveaux alias. Aucun alias n’a été abandonné ; résolvez ce chevauchement.')
    }
    return existante
  }
  const r: RegleAnon = { id: genId(), ...definition }
  if (!r.id || Object.hasOwn(corpus.reglesAnon, r.id) || r.id === '__proto__') throw new Error('Identifiant de règle déjà utilisé ou invalide.')
  corpus.reglesAnon[r.id] = r
  return r
}

/** Ajoute un pseudo absent, ou refuse explicitement une définition invalide. */
export function ajouterPseudoRegle(corpus: CorpusFichier, id: string, pseudo: string): string | undefined {
  const r = corpus.reglesAnon[id]
  if (!r) return undefined
  const p = pseudo.trim()
  if (!p) return undefined
  if (r.pseudos.some((x) => x.toLowerCase() === p.toLowerCase())) return undefined
  const definition = validerDefinitionAnon(r.entite, [...r.pseudos, p], r.categorie)
  r.pseudos = definition.pseudos
  return p
}

/** Retire une règle du corpus (mutation). Renvoie true si elle existait. */
export function retirerRegle(corpus: CorpusFichier, id: string): boolean {
  if (!(id in corpus.reglesAnon)) return false
  delete corpus.reglesAnon[id]
  return true
}
