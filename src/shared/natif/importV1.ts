import type { Categorie, PayloadEntretien, ParamsAnon, RegleAnon, SourceV1, Variable, CorpusFichier, EntretienFichier, Locuteur } from '../format'
import { FORMAT_VERSION } from '../format'
import { preparerIdentitesImportV1 } from '../corpus/importIdentitesV1'
import { fusionnerImport } from '../corpus/import'
import { normaliserTraitementsLexico } from '../lexico/traitements'
import type { TraitementsLexico } from '../lexico/types'
import { validerCorpusNatif, validerEntretienNatif } from './validation'

type CorpusImportV1 = CorpusFichier & { cas: Record<string, never>; famillesCas: Record<string, never> }

/** Reprend les définitions V1, sans ajouter de thème ni rapprocher les noms. */
export function preparerCorpusImportV1(
  nom: string, sourceV1: SourceV1, codebook: readonly Categorie[], variables: readonly Variable[],
  reglesAnon: readonly RegleAnon[] = [], paramsAnon?: ParamsAnon, traitementsLexico?: TraitementsLexico,
): CorpusImportV1 {
  const corpus: CorpusImportV1 = {
    formatVersion: FORMAT_VERSION, nom, meta: { sourceV1: structuredClone(sourceV1) },
    codebook: {}, variables: {}, reglesAnon: {}, locuteurs: {}, membership: {},
    ordreEntretiens: [], recueils: {}, cas: {}, famillesCas: {}, attributsCas: {},
    lexico: normaliserTraitementsLexico(traitementsLexico),
  }
  fusionnerImport(corpus, structuredClone(codebook), structuredClone(variables))
  for (const regle of reglesAnon) {
    if (!Object.hasOwn(corpus.reglesAnon, regle.id)) corpus.reglesAnon[regle.id] = structuredClone(regle)
  }
  if (paramsAnon !== undefined) corpus.paramsAnon = structuredClone(paramsAnon)
  validerCorpusNatif(corpus)
  return corpus
}

/** Une identité distincte par participation importée ; les ids sont déjà fixés par le store. */
export function preparerEntretienImportV1(
  existants: Readonly<Record<string, Locuteur>>, payload: PayloadEntretien, date: string, genererId: () => string,
): { locuteurs: Locuteur[]; entretien: EntretienFichier } {
  const source = structuredClone(payload)
  if (source.participations.some((p) => p.locuteurRef !== null || p.associationRetiree !== undefined || p.rapprochementsRefuses !== undefined)) {
    throw new Error('Les associations d’un entretien natif ne peuvent pas être réinterprétées comme un import V1.')
  }
  const identites = preparerIdentitesImportV1(existants, source.participations, genererId)
  const entretien: EntretienFichier = {
    ...source, formatVersion: FORMAT_VERSION, lastModified: date,
    participations: source.participations.map((p) => ({ ...p, locuteurRef: identites.associations.get(p.id)! })),
  }
  validerEntretienNatif(entretien)
  return { locuteurs: identites.locuteurs, entretien }
}
