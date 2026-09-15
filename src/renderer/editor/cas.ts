import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { CorpusFichier, EntretienFichier } from '../../shared/format'
import { membresPersonnesRegle, type RegleModaliteCas, type Cas, type SourcePassageCas } from '../../shared/corpus/cas'
import {
  locuteursPassage,
  preparerSourcesPassages,
  resoudrePassageReference,
  textePassage,
  type EtatResolutionPassage,
  type ModeTextePassage,
  type SourcePassageChargee,
  type SourcePassagePreparee,
} from './passages'

export type OriginePassageCas =
  | {
      type: 'manuel'
      rattachementId: string
      source: SourcePassageCas
    }
  | {
      type: 'regle-personne'
      personneId: string
      entretienId: string
      locuteurIndex: number
    }
  | { type: 'regle-entretien'; entretienId: string }
  | { type: 'regle-modalite'; variableId: string; modaliteId: string; entretienId: string; locuteurIndex: number | null }

export interface PassageCasProjete {
  origine: OriginePassageCas
  etat: EtatResolutionPassage
  titreEntretien: string
  texte: string | null
  locuteurs: string[]
  from: number | null
  to: number | null
  diagnostic: string | null
}

export type DiagnosticRegleCas = {
  type: 'personne-introuvable' | 'variable-introuvable' | 'modalite-introuvable'
  personneId: string | null
  entretienId: null
  diagnostic: string
} | {
  type: 'source-indisponible' | 'source-invalide' | 'entretien-hors-corpus' | 'valeur-invalide'
  personneId: string | null
  entretienId: string
  diagnostic: string
}

export interface MetriquesCas {
  rattachementsManuels: number
  passagesDisponibles: number
  sourcesDistinctes: number
  motsSansDoubleCompte: number
  caracteresSansDoubleCompte: number
  chevauchements: number
}

export type ModeMateriauxCas = 'tous' | 'regles' | 'manuels'

export interface VueMateriauxCas {
  passages: PassageCasProjete[]
  diagnosticsRegles: DiagnosticRegleCas[]
  metriques: MetriquesCas
  problemes: number
}

/** La projection complète reste indépendante du filtre choisi pour la lecture. */
export interface ProjectionCas extends VueMateriauxCas {
  observationsModalite: { membres: number; valeursAbsentes: number; valeursInvalides: number; enqueteursExclus: number; sourcesIllisibles: number }
  casId: string
  nom: string
  memo: string
  modeTexte: ModeTextePassage
  vues: Record<ModeMateriauxCas, VueMateriauxCas>
}

export type SourceCasChargee = SourcePassageChargee

interface InterventionPersonne {
  from: number
  to: number
  locuteurIndex: number
}

/** Réunit les blocs consécutifs d'un même locuteur en une intervention. */
function interventionsPersonne(
  doc: ProseMirrorNode,
  data: EntretienFichier,
  personneId: string | null,
  inclureEnqueteurs: boolean,
  modalite?: RegleModaliteCas,
): InterventionPersonne[] {
  const locuteurs = new Set(data.locuteurs
    .filter((locuteur) => (modalite ? locuteur.valeursLoc?.[modalite.variableId] === modalite.modaliteId : locuteur.personneRef === personneId)
      && (inclureEnqueteurs || locuteur.interviewer !== true))
    .map((locuteur) => locuteur.index))
  if (!locuteurs.size) return []

  const resultat: InterventionPersonne[] = []
  let courante: InterventionPersonne | null = null
  const terminer = () => {
    if (courante && courante.from < courante.to) resultat.push(courante)
    courante = null
  }
  doc.forEach((node, offset) => {
    const index = typeof node.attrs.loc === 'number' ? node.attrs.loc as number : null
    if (node.type.name !== 'paragraph' || index === null || !locuteurs.has(index)) {
      terminer()
      return
    }
    const from = offset + 1
    const to = from + node.content.size
    if (courante?.locuteurIndex === index) courante.to = to
    else {
      terminer()
      courante = { from, to, locuteurIndex: index }
    }
  })
  terminer()
  return resultat
}

function diagnosticSourceRegle(source: SourcePassagePreparee | undefined): {
  type: 'source-indisponible' | 'source-invalide'
  diagnostic: string
} | null {
  if (source?.ok) return null
  if (source?.invalide) {
    return { type: 'source-invalide', diagnostic: 'La source ne peut pas être lue pour appliquer la règle.' }
  }
  return { type: 'source-indisponible', diagnostic: 'La source est momentanément indisponible pour appliquer la règle.' }
}

function cleOrigine(origine: OriginePassageCas): string {
  if (origine.type === 'manuel') return origine.rattachementId
  if (origine.type === 'regle-entretien') return origine.entretienId
  if (origine.type === 'regle-modalite') return `${origine.variableId}\0${origine.modaliteId}\0${origine.locuteurIndex}`
  return `${origine.personneId}\0${origine.locuteurIndex}`
}

function comparerPassages(a: PassageCasProjete, b: PassageCasProjete): number {
  return a.titreEntretien.localeCompare(b.titreEntretien, 'fr')
    || (a.origine.type === 'manuel' ? a.origine.source.entretienId : a.origine.entretienId)
      .localeCompare(b.origine.type === 'manuel' ? b.origine.source.entretienId : b.origine.entretienId)
    || (a.from ?? Number.MAX_SAFE_INTEGER) - (b.from ?? Number.MAX_SAFE_INTEGER)
    || (a.to ?? Number.MAX_SAFE_INTEGER) - (b.to ?? Number.MAX_SAFE_INTEGER)
    || a.origine.type.localeCompare(b.origine.type)
    || cleOrigine(a.origine).localeCompare(cleOrigine(b.origine))
}

function compterMots(texte: string): number {
  return texte.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

function calculerMetriques(
  passages: PassageCasProjete[],
  diagnosticsRegles: DiagnosticRegleCas[],
  sources: Map<string, SourcePassagePreparee>,
): MetriquesCas {
  const sourcesReferencees = new Set<string>()
  const parEntretien = new Map<string, Array<{ from: number; to: number }>>()
  let passagesDisponibles = 0
  for (const passage of passages) {
    const entretienId = passage.origine.type === 'manuel'
      ? passage.origine.source.entretienId
      : passage.origine.entretienId
    sourcesReferencees.add(entretienId)
    if (passage.etat !== 'disponible' || passage.from === null || passage.to === null) continue
    const source = sources.get(entretienId)
    if ((passage.origine.type === 'regle-entretien' || (passage.origine.type === 'regle-modalite' && passage.origine.locuteurIndex === null)) && source?.ok && !source.doc.textContent.length) continue
    passagesDisponibles += 1
    const intervalles = parEntretien.get(entretienId) ?? []
    intervalles.push({ from: passage.from, to: passage.to })
    parEntretien.set(entretienId, intervalles)
  }

  for (const diagnostic of diagnosticsRegles) {
    if (diagnostic.entretienId) sourcesReferencees.add(diagnostic.entretienId)
  }

  let motsSansDoubleCompte = 0
  let caracteresSansDoubleCompte = 0
  let chevauchements = 0
  for (const [entretienId, intervalles] of parEntretien) {
    const source = sources.get(entretienId)
    if (!source?.ok) continue
    intervalles.sort((a, b) => a.from - b.from || a.to - b.to)
    const reunis: Array<{ from: number; to: number }> = []
    for (const intervalle of intervalles) {
      const precedent = reunis[reunis.length - 1]
      if (precedent && intervalle.from <= precedent.to) {
        if (intervalle.from < precedent.to) chevauchements += 1
        precedent.to = Math.max(precedent.to, intervalle.to)
      } else {
        reunis.push({ ...intervalle })
      }
    }
    for (const intervalle of reunis) {
      const texte = textePassage(source.doc, source.data, intervalle.from, intervalle.to, 'original')
      motsSansDoubleCompte += compterMots(texte)
      caracteresSansDoubleCompte += texte.length
    }
  }

  return {
    rattachementsManuels: passages.filter((passage) => passage.origine.type === 'manuel').length,
    passagesDisponibles,
    sourcesDistinctes: sourcesReferencees.size,
    motsSansDoubleCompte,
    caracteresSansDoubleCompte,
    chevauchements,
  }
}

function construireVue(
  passages: PassageCasProjete[],
  diagnosticsRegles: DiagnosticRegleCas[],
  sources: Map<string, SourcePassagePreparee>,
): VueMateriauxCas {
  return {
    passages,
    diagnosticsRegles,
    metriques: calculerMetriques(passages, diagnosticsRegles, sources),
    problemes: passages.filter((passage) => passage.etat !== 'disponible').length
      + diagnosticsRegles.length,
  }
}

/** Projette les matériaux vivants d'un cas sans écrire dans le corpus. */
export function projeterCas(
  corpus: Pick<CorpusFichier, 'membership' | 'personnes'> & Partial<Pick<CorpusFichier, 'variables'>>,
  cas: Cas,
  sources: Map<string, SourceCasChargee>,
  mode: ModeTextePassage = 'pseudonymise',
): ProjectionCas {
  return projeterCasDepuisSourcesPreparees(corpus, cas, preparerSourcesPassages(sources), mode)
}

/** Réutilise les documents déjà parsés pour projeter plusieurs cas. */
export function projeterCasDepuisSourcesPreparees(
  corpus: Pick<CorpusFichier, 'membership' | 'personnes'> & Partial<Pick<CorpusFichier, 'variables'>>,
  cas: Cas,
  sourcesPreparees: Map<string, SourcePassagePreparee>,
  mode: ModeTextePassage = 'pseudonymise',
): ProjectionCas {
  const passages: PassageCasProjete[] = cas.rattachements.map((rattachement) => ({
    origine: {
      type: 'manuel',
      rattachementId: rattachement.id,
      source: structuredClone(rattachement.source),
    },
    ...resoudrePassageReference(corpus, rattachement.source, sourcesPreparees, mode),
  }))
  const diagnosticsRegles: DiagnosticRegleCas[] = []

  const observationsModalite = { membres: 0, valeursAbsentes: 0, valeursInvalides: 0, enqueteursExclus: 0, sourcesIllisibles: 0 }
  for (const regle of cas.regles) {
    if (regle.type === 'modalite') {
      const variable = corpus.variables?.[regle.variableId]
      if (!variable || variable.portee !== regle.portee || !variable.modalites.some((m) => m.id === regle.modaliteId)) {
        diagnosticsRegles.push({
          type: !variable || variable.portee !== regle.portee ? 'variable-introuvable' : 'modalite-introuvable',
          personneId: null, entretienId: null,
          diagnostic: 'La variable, sa portée ou la modalité de cette règle ne peut plus être résolue.',
        })
        continue
      }
      for (const [entretienId, reference] of Object.entries(corpus.membership)) {
        const source = sourcesPreparees.get(entretienId)
        const donneesInvalides = source?.ok && (!Array.isArray(source.data.locuteurs)
          || !Array.isArray(source.data.annotations) || !source.data.meta
          || typeof source.data.meta !== 'object')
        const probleme = donneesInvalides
          ? { type: 'source-invalide' as const, diagnostic: 'Les données de la source ne peuvent pas être lues pour appliquer la règle.' }
          : diagnosticSourceRegle(source)
        if (probleme) {
          diagnosticsRegles.push({ ...probleme, personneId: null, entretienId })
          observationsModalite.sourcesIllisibles++
          continue
        }
        if (!source?.ok) continue
        const proprietaires = regle.portee === 'entretien' ? [source.data.meta.valeursGen] : source.data.locuteurs
          .filter((locuteur) => {
            if (!regle.inclureEnqueteurs && locuteur.interviewer === true) {
              observationsModalite.enqueteursExclus++
              return false
            }
            return true
          }).map((locuteur) => locuteur.valeursLoc)
        const invalidesAvant = observationsModalite.valeursInvalides
        for (const valeurs of proprietaires) {
          const valeur = valeurs?.[regle.variableId]
          if (!valeur) observationsModalite.valeursAbsentes++
          else if (!variable.modalites.some((m) => m.id === valeur)) observationsModalite.valeursInvalides++
          else if (valeur === regle.modaliteId) observationsModalite.membres++
        }
        if (observationsModalite.valeursInvalides > invalidesAvant) diagnosticsRegles.push({
          type: 'valeur-invalide', personneId: null, entretienId, diagnostic: 'Une valeur référence une modalité absente de la variable.',
        })
        const interventions = regle.portee === 'entretien'
          ? source.data.meta.valeursGen?.[regle.variableId] === regle.modaliteId
            ? [{ from: 0, to: source.doc.content.size, locuteurIndex: null }] : []
          : interventionsPersonne(source.doc, source.data, null, regle.inclureEnqueteurs, regle)
        for (const intervention of interventions) {
          const { from, to, locuteurIndex } = intervention
          passages.push({
            origine: { type: 'regle-modalite', variableId: variable.id, modaliteId: regle.modaliteId, entretienId, locuteurIndex },
            etat: 'disponible', titreEntretien: reference.titre,
            texte: source.doc.textContent.length ? textePassage(source.doc, source.data, from, to, mode) : '',
            locuteurs: locuteursPassage(source.doc, source.data, from, to, mode), from, to, diagnostic: null,
          })
        }
      }
      continue
    }

    if (regle.type === 'entretiens') {
      for (const entretienId of regle.entretienIds) {
        const reference = corpus.membership[entretienId]
        if (!reference) {
          diagnosticsRegles.push({
            type: 'entretien-hors-corpus', personneId: null, entretienId,
            diagnostic: 'L’entretien désigné par la règle ne fait plus partie du corpus.',
          })
          continue
        }
        const source = sourcesPreparees.get(entretienId)
        const probleme = diagnosticSourceRegle(source)
        if (probleme) {
          diagnosticsRegles.push({ ...probleme, personneId: null, entretienId })
          continue
        }
        if (!source?.ok) continue
        const from = 0
        const to = source.doc.content.size
        passages.push({
          origine: { type: 'regle-entretien', entretienId },
          etat: 'disponible', titreEntretien: reference.titre,
          texte: source.doc.textContent.length ? textePassage(source.doc, source.data, from, to, mode) : '',
          locuteurs: locuteursPassage(source.doc, source.data, from, to, mode),
          from, to, diagnostic: null,
        })
      }
      continue
    }
    for (const membre of membresPersonnesRegle(regle)) {
      if (!corpus.personnes[membre.personneId]) {
        diagnosticsRegles.push({
          type: 'personne-introuvable',
          personneId: membre.personneId,
          entretienId: null,
          diagnostic: "La personne utilisée par cette règle n'existe plus.",
        })
        continue
      }
      for (const [entretienId, reference] of Object.entries(corpus.membership)) {
        const source = sourcesPreparees.get(entretienId)
        const probleme = diagnosticSourceRegle(source)
        if (probleme) {
          diagnosticsRegles.push({
            ...probleme,
            personneId: membre.personneId,
            entretienId,
          })
          continue
        }
        if (!source?.ok) continue
        for (const intervention of interventionsPersonne(
          source.doc,
          source.data,
          membre.personneId,
          membre.inclureEnqueteurs,
        )) {
          passages.push({
            origine: {
              type: 'regle-personne',
              personneId: membre.personneId,
              entretienId,
              locuteurIndex: intervention.locuteurIndex,
            },
            etat: 'disponible',
            titreEntretien: reference.titre,
            texte: textePassage(source.doc, source.data, intervention.from, intervention.to, mode),
            locuteurs: locuteursPassage(
              source.doc,
              source.data,
              intervention.from,
              intervention.to,
              mode,
            ),
            from: intervention.from,
            to: intervention.to,
            diagnostic: null,
          })
        }
      }
    }
  }

  passages.sort(comparerPassages)
  const vues: ProjectionCas['vues'] = {
    tous: construireVue(passages, diagnosticsRegles, sourcesPreparees),
    regles: construireVue(
      passages.filter((passage) => passage.origine.type !== 'manuel'),
      diagnosticsRegles,
      sourcesPreparees,
    ),
    manuels: construireVue(
      passages.filter((passage) => passage.origine.type === 'manuel'),
      [],
      sourcesPreparees,
    ),
  }
  return {
    observationsModalite,
    casId: cas.id,
    nom: cas.nom,
    memo: cas.memo,
    modeTexte: mode,
    ...vues.tous,
    vues,
  }
}
