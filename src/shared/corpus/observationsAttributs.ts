import type { CorpusFichier, Variable, Cas, DerivationAttributCas, FamilleCas } from '../natif/format'
import { porteeObservationsCas, type EntretienLectureCas } from '../natif/lectureCas'
import type { DefinitionAttributCas } from './cas'

/** Recalcule les attributs depuis les membres des règles, jamais depuis les ajouts manuels.
 *  Partagé par la consultation et les contrôles avant enregistrement.
 */

/** Une lecture de valeurs n'a besoin ni du texte ni de ses annotations. */
export type LectureSourceAttributs =
  | { ok: true; data: Pick<EntretienLectureCas, 'meta' | 'participations'> }
  | { ok: false; raison: string }

/** Une observation de la variable source, portée par un propriétaire admissible. */
export interface ObservationAttributCas {
  entretienId: string
  /** Index local, distinct de l'id stable ; null pour une observation d'entretien. */
  participationIndex: number | null
  participationId: string | null
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
  /** Un autre membre peut suspendre la recette pour toute la famille.
   *  Les diagnostics locaux restent consultables pour corriger les données.
   */
  suspensionFamille?: { problemes: string[] }
}

/** Un propriétaire de valeurs admissible par la règle, sans texte requis. */
interface Proprietaire {
  entretienId: string
  participationIndex: number | null
  participationId: string | null
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
        proprietaires.push({ entretienId, participationIndex: null, participationId: null, illisible: true, valeurs: null })
      }
      continue
    }
    for (const regle of cas.regles) {
      if (regle.type === 'entretiens') {
        if (!regle.entretienIds.includes(entretienId)) continue
        const cle = `${entretienId}\0entretien`
        if (!vus.has(cle)) {
          vus.add(cle)
          proprietaires.push({ entretienId, participationIndex: null, participationId: null, illisible: false, valeurs: source.data.meta.valeursGen })
        }
        continue
      }
      if (regle.type === 'modalite' && regle.portee === 'entretien') {
        if (source.data.meta.valeursGen?.[regle.variableId] !== regle.modaliteId) continue
        const cle = `${entretienId}\0entretien`
        if (!vus.has(cle)) {
          vus.add(cle)
          proprietaires.push({ entretienId, participationIndex: null, participationId: null, illisible: false, valeurs: source.data.meta.valeursGen })
        }
        continue
      }
      const membresParticipations = source.data.participations.filter((participation) => {
        if (regle.type === 'modalite') {
          return participation.valeursLoc?.[regle.variableId] === regle.modaliteId
            && (regle.inclureEnqueteurs || participation.interviewer !== true)
        }
        const membre = regle.type === 'locuteur'
          ? (regle.locuteurId === participation.locuteurRef ? regle : undefined)
          : regle.type === 'locuteurs'
            ? regle.membres.find((courant) => courant.locuteurId === participation.locuteurRef)
            : undefined
        return Boolean(membre) && (membre!.inclureEnqueteurs || participation.interviewer !== true)
      })
      for (const participation of membresParticipations) {
        const cle = `${entretienId}\0${participation.index}`
        if (vus.has(cle)) continue
        vus.add(cle)
        proprietaires.push({ entretienId, participationIndex: participation.index, participationId: participation.id ?? null,
          illisible: false, valeurs: participation.valeursLoc ?? {} })
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
      return { entretienId: proprietaire.entretienId, participationIndex: null, participationId: null, valeur: null, invalide: false, sourceIllisible: true }
    }
    const valeur = proprietaire.valeurs?.[derivation.variableSourceId] ?? null
    return {
      entretienId: proprietaire.entretienId,
      participationIndex: proprietaire.participationIndex,
      participationId: proprietaire.participationId,
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

/** Un conflit sur un cas suspend la recette pour toute sa famille. */
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

/** Réunit les valeurs saisies et les recettes du cas ou de sa famille.
 *  Les diagnostics sont recalculés depuis les mêmes sources.
 */
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
  if (!famille) {
    for (const derivation of cas.derivationsPropres ?? []) {
      derivations.set(derivation.attributId, { derivation, origine: 'derivation-propre' })
    }
  }
  const attributs: AttributCasProjete[] = []
  const vus = new Set<string>()
  for (const [attributId, { derivation, origine }] of derivations) {
    vus.add(attributId)
    let diagnostic = resoudreDerivationCas(corpus, cas, derivation, sources)
    if (origine === 'derivation-famille' && famille) {
      const evaluation = evaluerDerivationFamille(corpus, famille, derivation, sources)
      const local = evaluation.parCas.find((entree) => entree.casId === cas.id)?.diagnostic ?? diagnostic
      diagnostic = evaluation.disponible ? local : {
        ...local,
        valeur: null,
        valeurLibelle: null,
        suspensionFamille: { problemes: evaluation.problemes },
        problemes: [
          ...local.problemes,
          'Cet attribut est suspendu pour toute la famille tant qu’un cas reste conflictuel ou non vérifiable.',
        ],
      }
    }
    attributs.push({
      attributId,
      definition: corpus.attributsCas?.[attributId] ?? null,
      origine,
      valeurSaisie: null,
      derivation,
      diagnostic,
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
