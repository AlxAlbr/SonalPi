import type { CorpusFichier, EntretienFichier } from '../format'
import type { Cas, DerivationAttributCas, FamilleCas } from './cas'
import {
  resoudreDerivationCas as resoudreNatif,
  evaluerDerivationFamille as evaluerNatif,
  projeterAttributsCas as projeterNatif,
  variablesDisponiblesFamille as variablesNatives,
} from './observationsAttributs'
import { lireCasFormat9, lireCorpusCasFormat9, lireDerivationFormat9, lireEntretienCasFormat9, lireFamilleCasFormat9 } from '../natif/lectureCasFormat9'

export type { AttributCasProjete, DiagnosticAttributCas, DiagnosticDerivationFamille, VariableCandidateFamille } from './observationsAttributs'
export { libelleValeurSaisie } from './observationsAttributs'

export type LectureSourceAttributs =
  | { ok: true; data: EntretienFichier }
  | { ok: false; raison: string }

type ContexteFormat9 = Pick<CorpusFichier, 'membership' | 'variables' | 'cas' | 'famillesCas' | 'attributsCas'>
const lireSources = (sources: Map<string, LectureSourceAttributs>) => new Map([...sources].map(([id, source]) => [id,
  source.ok ? { ok: true as const, data: lireEntretienCasFormat9(source.data) } : source,
]))

/** Raccorde les fichiers encore au format 9 au même moteur de lecture natif. */
export function resoudreDerivationCas(corpus: ContexteFormat9, cas: Cas, derivation: DerivationAttributCas, sources: Map<string, LectureSourceAttributs>) {
  return resoudreNatif(lireCorpusCasFormat9(corpus), lireCasFormat9(cas), lireDerivationFormat9(derivation), lireSources(sources))
}

export function evaluerDerivationFamille(corpus: ContexteFormat9, famille: FamilleCas, derivation: DerivationAttributCas, sources: Map<string, LectureSourceAttributs>) {
  return evaluerNatif(lireCorpusCasFormat9(corpus), lireFamilleCasFormat9(famille), lireDerivationFormat9(derivation), lireSources(sources))
}

export function projeterAttributsCas(corpus: ContexteFormat9, cas: Cas, sources: Map<string, LectureSourceAttributs>) {
  return projeterNatif(lireCorpusCasFormat9(corpus), lireCasFormat9(cas), lireSources(sources))
}

export function variablesDisponiblesFamille(corpus: ContexteFormat9, famille: FamilleCas, sources: Map<string, LectureSourceAttributs>) {
  return variablesNatives(lireCorpusCasFormat9(corpus), lireFamilleCasFormat9(famille), lireSources(sources))
}
