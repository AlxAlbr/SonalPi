import type { CorpusFichier, EntretienFichier, Variable } from '../format'
import {
  porteeObservationsCas,
  type Cas,
  type DefinitionAttributCas,
  type DerivationAttributCas,
  type FamilleCas,
} from './cas'

/**
 *  Résolution des attributs de cas : les recettes ne stockent jamais de
 *  valeur ; chaque lecture recalcule les observations depuis les membres de
 *  la règle, jamais depuis les ajouts manuels.
 *  Fonctions PURES, utilisées par le renderer (fiches et aperçus) et par le
 *  main (recontrôle avant validation d'une recette).
 */

/** Une source lue pour ses valeurs : locuteurs et valeurs générales suffisent. */
export type LectureSourceAttributs =
  | { ok: true; data: EntretienFichier }
  | { ok: false; raison: string }

/** Une observation de la variable source, portée par un propriétaire admissible. */
export interface ObservationAttributCas {
  entretienId: string
  /** Index du locuteur porteur ; null pour une observation d'entretien. */
  locuteurIndex: number | null
  /** Modalité de la variable source ; null si la valeur est absente. */
  valeur: string | null
  /** La valeur pointe une modalité disparue de la variable source. */
  invalide: boolean
  /** La source n'a pas pu être lue : ni sa valeur ni ses locuteurs ne sont connus. */
  sourceIllisible: boolean
}

export interface DiagnosticAttributCas {
  statut: 'absent' | 'coherent' | 'coherent-incomplet' | 'incoherent' | 'non-verifiable'
  /** Modalité retenue quand elle est certifiée ; null sinon. */
  valeur: string | null
  valeurLibelle: string | null
  observations: ObservationAttributCas[]
  problemes: string[]
}

/** Un propriétaire de valeurs admissible par la règle, sans texte requis. */
interface Proprietaire {
  entretienId: string
  /** Index du locuteur pour une portée locuteur ; null pour une portée entretien. */
  locuteurIndex: number | null
  /** La source n'a pas pu être lue : le propriétaire reste compté, sa valeur non. */
  illisible: boolean
  valeurs: Record<string, string> | null
}

/** Énumère les propriétaires admissibles de toutes les règles du cas, dédupliqués. */
function proprietairesCas(
  membership: Record<string, unknown>,
  cas: Cas,
  sources: Map<string, LectureSourceAttributs>,
): Proprietaire[] {
  const examen = new Set<string>()
  let entretiensNommes = false
  for (const regle of cas.regles) {
    if (regle.type === 'entretiens') {
      entretiensNommes = true
      for (const id of regle.entretienIds) examen.add(id)
    }
  }
  if (!entretiensNommes) for (const id of Object.keys(membership)) examen.add(id)
  const proprietaires: Proprietaire[] = []
  const vus = new Set<string>()
  for (const entretienId of examen) {
    const source = sources.get(entretienId)
    if (!source?.ok) {
      const cle = `${entretienId}\0illisible`
      if (!vus.has(cle)) {
        vus.add(cle)
        proprietaires.push({ entretienId, locuteurIndex: null, illisible: true, valeurs: null })
      }
      continue
    }
    for (const regle of cas.regles) {
      if (regle.type === 'entretiens') {
        if (!regle.entretienIds.includes(entretienId)) continue
        const cle = `${entretienId}\0entretien`
        if (!vus.has(cle)) {
          vus.add(cle)
          proprietaires.push({ entretienId, locuteurIndex: null, illisible: false, valeurs: source.data.meta.valeursGen })
        }
        continue
      }
      if (regle.type === 'modalite' && regle.portee === 'entretien') {
        if (source.data.meta.valeursGen?.[regle.variableId] !== regle.modaliteId) continue
        const cle = `${entretienId}\0entretien`
        if (!vus.has(cle)) {
          vus.add(cle)
          proprietaires.push({ entretienId, locuteurIndex: null, illisible: false, valeurs: source.data.meta.valeursGen })
        }
        continue
      }
      const membresLocuteurs = source.data.locuteurs.filter((locuteur) => {
        if (regle.type === 'modalite') {
          return locuteur.valeursLoc?.[regle.variableId] === regle.modaliteId
            && (regle.inclureEnqueteurs || locuteur.interviewer !== true)
        }
        const membre = regle.type === 'personne'
          ? (regle.personneId === locuteur.personneRef ? regle : undefined)
          : regle.type === 'personnes'
            ? regle.membres.find((courant) => courant.personneId === locuteur.personneRef)
            : undefined
        return Boolean(membre) && (membre!.inclureEnqueteurs || locuteur.interviewer !== true)
      })
      for (const locuteur of membresLocuteurs) {
        const cle = `${entretienId}\0${locuteur.index}`
        if (vus.has(cle)) continue
        vus.add(cle)
        proprietaires.push({ entretienId, locuteurIndex: locuteur.index, illisible: false, valeurs: locuteur.valeursLoc ?? {} })
      }
    }
  }
  return proprietaires
}

/** Calcule la valeur d'une recette sur un cas : statut, valeur et observations. */
export function resoudreDerivationCas(
  corpus: Pick<CorpusFichier, 'variables' | 'membership'>,
  cas: Cas,
  derivation: DerivationAttributCas,
  sources: Map<string, LectureSourceAttributs>,
): DiagnosticAttributCas {
  const variable = corpus.variables?.[derivation.variableSourceId]
  const problemes: string[] = []
  if (!variable || variable.portee !== derivation.porteeSource) {
    return {
      statut: 'non-verifiable', valeur: null, valeurLibelle: null, observations: [],
      problemes: ['La variable source de la recette est absente ou sa portée a changé.'],
    }
  }
  const portee = porteeObservationsCas(cas)
  if (portee !== derivation.porteeSource) {
    return {
      statut: 'non-verifiable', valeur: null, valeurLibelle: null, observations: [],
      problemes: ['La portée des observations du cas ne correspond plus à la recette.'],
    }
  }
  const observations = proprietairesCas(corpus.membership, cas, sources).map((proprietaire): ObservationAttributCas => {
    if (proprietaire.illisible) {
      return { entretienId: proprietaire.entretienId, locuteurIndex: null, valeur: null, invalide: false, sourceIllisible: true }
    }
    const valeur = proprietaire.valeurs?.[derivation.variableSourceId] ?? null
    return {
      entretienId: proprietaire.entretienId,
      locuteurIndex: proprietaire.locuteurIndex,
      valeur,
      invalide: valeur !== null && !variable.modalites.some((modalite) => modalite.id === valeur),
      sourceIllisible: false,
    }
  })

  const distinctes = new Set(observations.filter((observation) =>
    observation.valeur !== null && !observation.invalide).map((observation) => observation.valeur))
  const manquantes = observations.filter((observation) =>
    observation.valeur === null && !observation.sourceIllisible).length
  const illisibles = observations.filter((observation) => observation.invalide || observation.sourceIllisible).length

  if (illisibles) {
    problemes.push('Une observation est illisible : la valeur ne peut pas être certifiée avant contrôle complet.')
    return { statut: 'non-verifiable', valeur: null, valeurLibelle: null, observations, problemes }
  }
  if (distinctes.size > 1) {
    problemes.push('Plusieurs valeurs distinctes : incompatible avec un attribut unique sur ce périmètre.')
    return { statut: 'incoherent', valeur: null, valeurLibelle: null, observations, problemes }
  }
  const valeur = [...distinctes][0] ?? null
  const valeurLibelle = valeur ? variable.modalites.find((modalite) => modalite.id === valeur)?.lib ?? null : null
  if (valeur === null) {
    return { statut: 'absent', valeur: null, valeurLibelle: null, observations, problemes }
  }
  if (manquantes) problemes.push(`${manquantes} valeur(s) manquante(s) ; la valeur connue n’en est pas masquée.`)
  return {
    statut: manquantes ? 'coherent-incomplet' : 'coherent',
    valeur, valeurLibelle, observations, problemes,
  }
}

/** Diagnostic d'une recette pour chaque cas d'une famille. */
export interface DiagnosticDerivationFamille {
  /** Aucun cas conflictuel ni non vérifiable : la recette peut être enregistrée. */
  disponible: boolean
  parCas: Array<{ casId: string; nomCas: string; diagnostic: DiagnosticAttributCas }>
  problemes: string[]
}

/** Applique la politique familiale stricte : un conflit sur un cas suspend
 *  la recette pour toute la famille, sans option par cas. */
export function evaluerDerivationFamille(
  corpus: Pick<CorpusFichier, 'variables' | 'membership'> & { cas?: Record<string, Cas> },
  famille: FamilleCas,
  derivation: DerivationAttributCas,
  sources: Map<string, LectureSourceAttributs>,
): DiagnosticDerivationFamille {
  const membres = Object.values(corpus.cas ?? {})
    .filter((cas) => cas.familleId === famille.id)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id))
  const parCas = membres.map((cas) => ({
    casId: cas.id,
    nomCas: cas.nom,
    diagnostic: resoudreDerivationCas(corpus, cas, derivation, sources),
  }))
  const problemes: string[] = []
  let disponible = true
  for (const courant of parCas) {
    if (courant.diagnostic.statut === 'incoherent' || courant.diagnostic.statut === 'non-verifiable') {
      disponible = false
      problemes.push(`« ${courant.nomCas} » : ${courant.diagnostic.problemes.join(' ')}`)
    }
  }
  return { disponible, parCas, problemes }
}

/** Un attribut affichable dans la fiche du cas : saisi ou dérivé, jamais les deux. */
export interface AttributCasProjete {
  attributId: string
  definition: DefinitionAttributCas | null
  origine: 'saisi' | 'derivation-famille' | 'derivation-propre'
  valeurSaisie: string | null
  derivation: DerivationAttributCas | null
  /** Présent pour un attribut dérivé ; null pour un attribut saisi. */
  diagnostic: DiagnosticAttributCas | null
}

/** Réunit, pour un cas, les valeurs saisies et les recettes de sa famille et
 *  de lui-même, avec le diagnostic recalculé de chaque dérivation. */
export function projeterAttributsCas(
  corpus: Pick<CorpusFichier, 'variables' | 'membership' | 'famillesCas' | 'attributsCas'> & { cas?: Record<string, Cas> },
  cas: Cas,
  sources: Map<string, LectureSourceAttributs>,
): AttributCasProjete[] {
  const famille = cas.familleId ? corpus.famillesCas?.[cas.familleId] : undefined
  const derivations = new Map<string, { derivation: DerivationAttributCas; origine: AttributCasProjete['origine'] }>()
  for (const derivation of famille?.derivationsAttributs ?? []) {
    derivations.set(derivation.attributId, { derivation, origine: 'derivation-famille' })
  }
  for (const derivation of cas.derivationsPropres ?? []) {
    if (!derivations.has(derivation.attributId)) {
      derivations.set(derivation.attributId, { derivation, origine: 'derivation-propre' })
    }
  }
  const attributs: AttributCasProjete[] = []
  const vus = new Set<string>()
  for (const [attributId, { derivation, origine }] of derivations) {
    vus.add(attributId)
    attributs.push({
      attributId,
      definition: corpus.attributsCas?.[attributId] ?? null,
      origine,
      valeurSaisie: null,
      derivation,
      diagnostic: resoudreDerivationCas(corpus, cas, derivation, sources),
    })
  }
  for (const [attributId, valeur] of Object.entries(cas.valeursAttributsSaisis ?? {})) {
    if (vus.has(attributId)) continue
    vus.add(attributId)
    attributs.push({
      attributId,
      definition: corpus.attributsCas?.[attributId] ?? null,
      origine: 'saisi',
      valeurSaisie: valeur,
      derivation: null,
      diagnostic: null,
    })
  }
  return attributs.sort((a, b) =>
    (a.definition?.ordre ?? Number.MAX_SAFE_INTEGER) - (b.definition?.ordre ?? Number.MAX_SAFE_INTEGER)
    || a.attributId.localeCompare(b.attributId))
}

/** Libellé affichable d'une valeur saisie selon le type de sa définition. */
export function libelleValeurSaisie(
  definition: DefinitionAttributCas | null,
  valeur: string | null,
): string | null {
  if (!definition || valeur === null) return valeur
  if (definition.type === 'texte') return valeur
  return definition.modalites.find((modalite) => modalite.id === valeur)?.lib ?? valeur
}

/** Variable candidate à une dérivation, pour l'aperçu de disponibilité. */
export interface VariableCandidateFamille {
  variable: Variable
  disponible: boolean
  problemes: string[]
}

/** Liste les variables de la portée de la famille avec leur disponibilité. */
export function variablesDisponiblesFamille(
  corpus: Pick<CorpusFichier, 'variables' | 'membership'> & { cas?: Record<string, Cas> },
  famille: FamilleCas,
  sources: Map<string, LectureSourceAttributs>,
): VariableCandidateFamille[] {
  return Object.values(corpus.variables ?? {})
    .filter((variable) => variable.portee === famille.origine.portee)
    .sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id))
    .map((variable) => {
      const evaluation = evaluerDerivationFamille(corpus, famille,
        { attributId: 'apercu', variableSourceId: variable.id, porteeSource: variable.portee }, sources)
      return { variable, disponible: evaluation.disponible, problemes: evaluation.problemes }
    })
}
