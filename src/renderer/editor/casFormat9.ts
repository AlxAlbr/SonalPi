import type { CorpusFichier } from '../../shared/format'
import type { Cas } from '../../shared/corpus/cas'
import { lireCasFormat9, lireCorpusCasFormat9, lireEntretienCasFormat9 } from '../../shared/natif/lectureCasFormat9'
import { projeterCas as projeterNatif, projeterCasDepuisSourcesPreparees as projeterPrepareNatif } from './cas'
import type { ModeTextePassage, SourcePassageChargee, SourcePassagePreparee } from './passages'

export type { DiagnosticRegleCas, MetriquesCas, ModeMateriauxCas, OriginePassageCas, PassageCasProjete, ProjectionCas, VueMateriauxCas } from './cas'
export type SourceCasChargee = SourcePassageChargee

type CorpusProjectionFormat9 = Pick<CorpusFichier, 'membership' | 'personnes'> & Partial<Pick<CorpusFichier, 'variables'>>

/** Raccorde les instantanés au format 9 au lecteur de cas natif, sans écriture. */
export function projeterCas(corpus: CorpusProjectionFormat9, cas: Cas, sources: Map<string, SourceCasChargee>, mode: ModeTextePassage = 'pseudonymise') {
  const lectures = new Map([...sources].map(([id, source]) => [id,
    source.ok ? { ok: true as const, data: lireEntretienCasFormat9(source.data) } : source,
  ]))
  return projeterNatif(lireCorpusCasFormat9(corpus), lireCasFormat9(cas), lectures, mode)
}

/** Conserve les documents déjà parsés ; seuls les champs de lecture sont adaptés. */
export function projeterCasDepuisSourcesPreparees(corpus: CorpusProjectionFormat9, cas: Cas, sources: Map<string, SourcePassagePreparee>, mode: ModeTextePassage = 'pseudonymise') {
  const lectures = new Map([...sources].map(([id, source]) => [id,
    source.ok ? { ...source, data: lireEntretienCasFormat9(source.data) } : source,
  ]))
  return projeterPrepareNatif(lireCorpusCasFormat9(corpus), lireCasFormat9(cas), lectures, mode)
}
