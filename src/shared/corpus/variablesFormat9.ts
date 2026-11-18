import type { CorpusFichier, Variable } from '../format'
import { objet } from '../natif/validationCommune'
import { lireVariableFormat9 } from '../natif/lectureCasFormat9'
import * as natif from './variables'
import { detailsVariablesEntretien as detailsVariablesNatives, type BlocParticipation } from './lectureVariables'

export { prochainExport, validerLibelleDonnee } from './variables'
export type { Variable } from '../format'
export type { LigneValeur } from './lectureVariables'
export type BlocLocuteur = Pick<BlocParticipation, 'nom' | 'lignes'>
type PatchVariable = Partial<Pick<Variable, 'lib' | 'portee' | 'priv'>>

function porteeNative(portee: unknown): 'entretien' | 'participation' {
  if (portee === 'entretien') return portee
  if (portee === 'locuteur') return 'participation'
  throw new Error('La portée de cette variable est invalide.')
}

export function validerCreationVariableFormat9(lib: unknown, portee: unknown): void {
  natif.validerCreationVariable(lib, porteeNative(portee))
}

export function validerPatchVariableFormat9(patch: unknown): asserts patch is PatchVariable {
  if (!objet(patch)) { natif.validerPatchVariable(patch); return }
  natif.validerPatchVariable({ ...patch, ...(Object.hasOwn(patch, 'portee') ? { portee: porteeNative(patch.portee) } : {}) })
}

/** Seule la portée est copiée ; les modalités restent les objets du corpus actif. */
function modele(corpus: CorpusFichier) {
  return { variables: Object.fromEntries(Object.entries(corpus.variables).map(([id, v]) => [id, lireVariableFormat9(v)])),
    cas: corpus.cas, famillesCas: corpus.famillesCas }
}

function enregistrer(corpus: CorpusFichier, variable: natif.Variable): void {
  const valeur: Variable = { ...variable, portee: variable.portee === 'participation' ? 'locuteur' : variable.portee }
  Object.defineProperty(corpus.variables, valeur.id, { value: valeur, enumerable: true, configurable: true, writable: true })
}

/** Seul le vocabulaire des définitions est adapté ; aucune valeur locale n'est déplacée. */
export function ajouterVariable(corpus: CorpusFichier, lib: string, portee: Variable['portee'], genId: () => string): string {
  validerCreationVariableFormat9(lib, portee)
  const cible = modele(corpus), id = natif.ajouterVariable(cible, lib, porteeNative(portee), genId)
  enregistrer(corpus, cible.variables[id])
  return id
}

export function modifierVariable(corpus: CorpusFichier, id: string, patch: PatchVariable): void {
  validerPatchVariableFormat9(patch)
  const cible = modele(corpus)
  const { portee, ...commun } = patch
  natif.modifierVariable(cible, id, { ...commun, ...(portee !== undefined ? { portee: porteeNative(portee) } : {}) })
  if (Object.hasOwn(corpus.variables, id)) enregistrer(corpus, cible.variables[id])
}

export function retirerVariable(corpus: CorpusFichier, id: string): void {
  natif.retirerVariable(modele(corpus), id)
  delete corpus.variables[id]
}

export function ajouterModalite(corpus: CorpusFichier, idVar: string, lib: string, genId: () => string): void {
  natif.ajouterModalite(modele(corpus), idVar, lib, genId)
}

export function modifierModalite(corpus: CorpusFichier, idVar: string, idMod: string, lib: string): void {
  natif.modifierModalite(modele(corpus), idVar, idMod, lib)
}

export function retirerModalite(corpus: CorpusFichier, idVar: string, idMod: string): void {
  const cible = modele(corpus)
  natif.retirerModalite(cible, idVar, idMod)
  if (Object.hasOwn(corpus.variables, idVar)) corpus.variables[idVar].modalites = cible.variables[idVar].modalites
}

/** Pont de lecture pour les appelants qui emploient encore le format 9. */
export function detailsVariablesEntretien(
  definitions: Variable[],
  entretien: { meta: { valeursGen: Record<string, string> }; locuteurs: { nom: string; interviewer?: boolean; valeursLoc: Record<string, string> }[] },
) {
  const details = detailsVariablesNatives(definitions.map(lireVariableFormat9), { meta: entretien.meta, participations: entretien.locuteurs })
  return { generales: details.generales, parLocuteur: details.parParticipation.map(({ nom, lignes }) => ({ nom, lignes })) }
}
