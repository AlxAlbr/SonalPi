import type { CorpusFichier, Variable } from '../format'

/**
 * Base de données EAV de l'agrégat Corpus — MODELE_OBJET2 §5, étape 6. Le SCHÉMA
 * (variables & leurs modalités dépendantes) est une DÉFINITION portée par le corpus ;
 * les VALEURS vivent chez leur propriétaire côté entretien (cf. `corpus/requetes.ts`).
 * Fonctions PURES ; les identités opaques sont injectées via `genId` → déterministe en test.
 */

/** Prochain code d'export numérique (max + 1) pour variable ou modalité. */
export function prochainExport(nums: number[]): number {
  return nums.reduce((m, n) => Math.max(m, n), 0) + 1
}

/** Ajoute une variable (id opaque injecté ; ordre + code d'export en fin). */
export function ajouterVariable(
  corpus: CorpusFichier,
  lib: string,
  portee: 'entretien' | 'locuteur',
  genId: () => string,
): string {
  const id = genId()
  const vs = Object.values(corpus.variables)
  corpus.variables[id] = {
    id,
    lib,
    portee,
    priv: false,
    ordre: vs.reduce((m, v) => Math.max(m, v.ordre), -1) + 1,
    vExport: prochainExport(vs.map((v) => v.vExport)),
    modalites: [],
  }
  return id
}

export function modifierVariable(
  corpus: CorpusFichier,
  id: string,
  patch: Partial<Pick<Variable, 'lib' | 'portee' | 'priv'>>,
): void {
  if (corpus.variables[id]) corpus.variables[id] = { ...corpus.variables[id], ...patch }
}

export function retirerVariable(corpus: CorpusFichier, id: string): void {
  delete corpus.variables[id]
}

/** Ajoute une modalité à une variable (id opaque injecté ; code d'export en fin). */
export function ajouterModalite(
  corpus: CorpusFichier,
  idVar: string,
  lib: string,
  genId: () => string,
): void {
  const v = corpus.variables[idVar]
  if (v) v.modalites.push({ id: genId(), lib, mExport: prochainExport(v.modalites.map((m) => m.mExport)) })
}

export function modifierModalite(corpus: CorpusFichier, idVar: string, idMod: string, lib: string): void {
  const m = corpus.variables[idVar]?.modalites.find((x) => x.id === idMod)
  if (m) m.lib = lib
}

export function retirerModalite(corpus: CorpusFichier, idVar: string, idMod: string): void {
  const v = corpus.variables[idVar]
  if (v) v.modalites = v.modalites.filter((m) => m.id !== idMod)
}
