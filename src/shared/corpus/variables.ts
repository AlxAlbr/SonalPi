import { compterUsagesCasVariable, type SourcesUsagesVariable } from './cas'
import type { CorpusFichier, Variable } from '../natif/format'
import { objet } from '../natif/validationCommune'

export type { Variable } from '../natif/format'
export { detailsVariablesEntretien, type BlocParticipation, type LigneValeur } from './lectureVariables'

export type PatchVariable = Partial<Pick<Variable, 'lib' | 'portee' | 'priv'>>
type CorpusVariables = Pick<CorpusFichier, 'variables'> & SourcesUsagesVariable

export function validerLibelleDonnee(lib: unknown): asserts lib is string {
  if (typeof lib !== 'string') throw new Error('Le libellé doit être du texte.')
}

export function validerCreationVariable(lib: unknown, portee: unknown): void {
  validerLibelleDonnee(lib)
  if (portee !== 'entretien' && portee !== 'participation') throw new Error('La portée de cette variable est invalide.')
}

/** Les ids, codes d'export et modalités ne se remplacent pas par un changement de libellé. */
export function validerPatchVariable(patch: unknown): asserts patch is PatchVariable {
  if (!objet(patch) || Object.keys(patch).some((cle) => !['lib', 'portee', 'priv'].includes(cle))
    || (Object.hasOwn(patch, 'lib') && typeof patch.lib !== 'string')
    || (Object.hasOwn(patch, 'portee') && patch.portee !== 'entretien' && patch.portee !== 'participation')
    || (Object.hasOwn(patch, 'priv') && typeof patch.priv !== 'boolean')) {
    throw new Error('Les champs modifiables de cette variable sont invalides.')
  }
}

/** Prochain code d'export numérique : maximum présent plus un. */
export function prochainExport(nums: readonly number[]): number {
  return nums.reduce((m, n) => Math.max(m, n), 0) + 1
}

/** Crée une définition ; les valeurs restent dans les entretiens et leurs participations. */
export function ajouterVariable(corpus: CorpusVariables, lib: string, portee: Variable['portee'], genId: () => string): string {
  validerCreationVariable(lib, portee)
  const id = genId()
  if (!id || Object.hasOwn(corpus.variables, id)) throw new Error('Identifiant de variable déjà utilisé ou invalide.')
  const vs = Object.values(corpus.variables)
  const variable: Variable = { id, lib, portee, priv: false,
    ordre: vs.reduce((m, v) => Math.max(m, v.ordre), -1) + 1,
    vExport: prochainExport(vs.map((v) => v.vExport)), modalites: [] }
  Object.defineProperty(corpus.variables, id, { value: variable, enumerable: true, configurable: true, writable: true })
  return id
}

export function modifierVariable(corpus: CorpusVariables, id: string, patch: PatchVariable): void {
  validerPatchVariable(patch)
  if (patch.portee && patch.portee !== corpus.variables[id]?.portee && compterUsagesCasVariable(corpus, id)) {
    throw new Error('Cette variable est utilisée par des cas ou familles.')
  }
  if (Object.hasOwn(corpus.variables, id)) corpus.variables[id] = { ...corpus.variables[id], ...patch }
}

export function retirerVariable(corpus: CorpusVariables, id: string): void {
  if (compterUsagesCasVariable(corpus, id)) throw new Error('Cette variable est utilisée par des cas ou familles.')
  delete corpus.variables[id]
}

export function ajouterModalite(corpus: CorpusVariables, idVar: string, lib: string, genId: () => string): void {
  validerLibelleDonnee(lib)
  if (!Object.hasOwn(corpus.variables, idVar)) return
  const v = corpus.variables[idVar], id = genId()
  if (!id || v.modalites.some((m) => m.id === id)) throw new Error('Identifiant de modalité déjà utilisé ou invalide.')
  v.modalites.push({ id, lib, mExport: prochainExport(v.modalites.map((m) => m.mExport)) })
}

export function modifierModalite(corpus: CorpusVariables, idVar: string, idMod: string, lib: string): void {
  validerLibelleDonnee(lib)
  if (!Object.hasOwn(corpus.variables, idVar)) return
  const m = corpus.variables[idVar].modalites.find((x) => x.id === idMod)
  if (m) m.lib = lib
}

export function retirerModalite(corpus: CorpusVariables, idVar: string, idMod: string): void {
  if (compterUsagesCasVariable(corpus, idVar, idMod)) throw new Error('Cette modalité est utilisée par des cas.')
  if (Object.hasOwn(corpus.variables, idVar)) {
    const v = corpus.variables[idVar]
    v.modalites = v.modalites.filter((m) => m.id !== idMod)
  }
}
