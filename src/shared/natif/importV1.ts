import type {
  Categorie, Locuteur as LocuteurFormat9, PayloadEntretien as PayloadImportV1,
  ParamsAnon, RegleAnon, SourceV1, Variable as VariableImportV1,
} from '../format'
import type { Locuteur } from '../locuteurs'
import { preparerIdentitesImportV1 } from '../corpus/importIdentitesV1'
import { fusionnerImport } from '../corpus/import'
import { normaliserTraitementsLexico } from '../lexico/traitements'
import type { TraitementsLexico } from '../lexico/types'
import { FORMAT_NATIF_LOCUTEURS, type CorpusFichier, type EntretienFichier } from './format'
import { validerCorpusNatif, validerEntretienNatif } from './validation'

type ImportAvecIds = Omit<PayloadImportV1, 'locuteurs'> & { locuteurs: (LocuteurFormat9 & { id: string })[] }
type CorpusImportV1 = CorpusFichier & { cas: Record<string, never>; famillesCas: Record<string, never> }

/** Le corpus V1 fournit ses définitions ; aucun thème par défaut n'est ajouté. */
export function preparerCorpusImportV1(
  nom: string,
  sourceV1: SourceV1,
  codebook: readonly Categorie[],
  variables: readonly VariableImportV1[],
  reglesAnon: readonly RegleAnon[] = [],
  paramsAnon?: ParamsAnon,
  traitementsLexico?: TraitementsLexico,
): CorpusImportV1 {
  const corpus: CorpusImportV1 = {
    formatVersion: FORMAT_NATIF_LOCUTEURS,
    nom,
    meta: { sourceV1: structuredClone(sourceV1) },
    codebook: {}, variables: {}, reglesAnon: {}, locuteurs: {}, membership: {},
    ordreEntretiens: [], recueils: {}, cas: {}, famillesCas: {}, attributsCas: {},
    lexico: normaliserTraitementsLexico(traitementsLexico),
  }
  fusionnerImport(corpus, structuredClone(codebook), variables.map((v) => ({
    ...structuredClone(v), portee: v.portee === 'locuteur' ? 'participation' as const : v.portee,
  })))
  for (const regle of reglesAnon) {
    if (!corpus.reglesAnon[regle.id]) corpus.reglesAnon[regle.id] = structuredClone(regle)
  }
  if (paramsAnon !== undefined) corpus.paramsAnon = structuredClone(paramsAnon)
  validerCorpusNatif(corpus)
  return corpus
}

/** Transforme le résultat du parseur V1, sans relire ni modifier ses sources. */
export function preparerEntretienImportV1(
  existants: Readonly<Record<string, Locuteur>>,
  payload: ImportAvecIds,
  date: string,
  genererId: () => string,
): { locuteurs: Locuteur[]; entretien: EntretienFichier } {
  const { locuteurs: sources, notes, ...commun } = structuredClone(payload)
  if (sources.some((p) => p.personneRef !== null || p.personneDeliee !== undefined || p.rapprochementsRefuses !== undefined)) {
    throw new Error('Les associations historiques d’un entretien natif ne peuvent pas être réinterprétées comme un import V1.')
  }
  const identites = preparerIdentitesImportV1(existants, sources, genererId)
  const entretien: EntretienFichier = {
    ...commun,
    formatVersion: FORMAT_NATIF_LOCUTEURS,
    lastModified: date,
    participations: sources.map(({ personneRef: _ref, personneDeliee: _retrait, rapprochementsRefuses: _refus, ...local }) => ({
      ...local, locuteurRef: identites.associations.get(local.id)!,
    })),
    ...(notes !== undefined ? { notes: notes.map(({ locuteurIds, ...note }) => ({
      ...note, ...(locuteurIds !== undefined ? { participationIds: locuteurIds } : {}),
    })) } : {}),
  }
  validerEntretienNatif(entretien)
  return { locuteurs: identites.locuteurs, entretien }
}
