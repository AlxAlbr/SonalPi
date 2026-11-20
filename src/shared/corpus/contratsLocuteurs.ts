import type { ReferenceParticipation, RefusRapprochementLocuteur } from '../locuteurs'
import { objet } from '../natif/validationCommune'

export interface ChoixRepriseParticipation {
  pseudo?: boolean
  interviewer?: boolean
  variables: string[]
  remplacer?: boolean
}

export type ChoixRepriseLocuteur = ChoixRepriseParticipation

export interface DemandeIdentificationLocuteur extends ReferenceParticipation { nom: string }

export function validerIdentificationLocuteur(v: unknown): asserts v is DemandeIdentificationLocuteur {
  if (!objet(v) || !champsExacts(v, ['entretienId', 'participationId', 'nom'])
    || !identifiant(v.entretienId) || !identifiant(v.participationId) || !identifiant(v.nom)) throw new Error('Validez un nom non vide.')
}
export interface DemandeRapprochementNommage extends ReferenceParticipation {
  source: ReferenceParticipation
  attendu: string
  reprise?: ChoixRepriseParticipation
}

export type OperationNommageLocuteurs =
  | { type: 'identifierAuNommage'; demande: DemandeIdentificationLocuteur }
  | { type: 'rapprocherAuNommage'; demande: DemandeRapprochementNommage }

export function validerOperationNommageLocuteurs(v: unknown): asserts v is OperationNommageLocuteurs {
  if (!objet(v) || !champsExacts(v, ['type', 'demande'])) throw new Error('La demande de nommage est invalide.')
  if (v.type === 'identifierAuNommage') validerIdentificationLocuteur(v.demande)
  else if (v.type === 'rapprocherAuNommage') validerRapprochementNommage(v.demande)
  else throw new Error('La demande de nommage est invalide.')
}

export function validerRapprochementNommage(v: unknown): asserts v is DemandeRapprochementNommage {
  if (!objet(v) || !identifiant(v.entretienId) || !identifiant(v.participationId) || !identifiant(v.attendu)
    || !objet(v.source) || !identifiant(v.source.entretienId) || !identifiant(v.source.participationId)
    || Object.keys(v.source).some((c) => !['entretienId', 'participationId'].includes(c))
    || v.source.entretienId === v.entretienId
    || Object.keys(v).some((c) => !['entretienId', 'participationId', 'source', 'attendu', 'reprise'].includes(c))) {
    throw new Error('La demande de rapprochement est invalide. Rouvrez le dialogue.')
  }
  if (v.reprise !== undefined && !repriseValide(v.reprise)) throw new Error('Le choix des informations à reprendre est invalide.')
}

function repriseValide(r: unknown): r is ChoixRepriseParticipation {
  return objet(r) && Array.isArray(r.variables) && r.variables.every(identifiant)
    && new Set(r.variables).size === r.variables.length
    && Object.keys(r).every((c) => ['pseudo', 'interviewer', 'variables', 'remplacer'].includes(c))
    && ['pseudo', 'interviewer', 'remplacer'].every((c) => r[c] === undefined || typeof r[c] === 'boolean')
}

export interface ParticipationASeparer {
  entretienId: string
  participationId: string
}

export type CommandeCorrectionLocuteurs =
  | { type: 'renommerGlobal'; locuteurId: string; nom: string; attendu: string }
  | { type: 'regrouperSelection'; locuteurIds: string[]; conserverId: string; nom: string; uniformiserNoms: boolean; attendu: string }
  | { type: 'dissocierSelection'; locuteurId: string; participations: ReferenceParticipation[]; attendu: string }
  | { type: 'individualiserSelection'; participations: ReferenceParticipation[]; attendu: string }
  | { type: 'supprimerVide'; locuteurId: string; attendu: string }
  | { type: 'ecarterRapprochement'; reference: ReferenceParticipation; cible: ReferenceParticipation; attendu: string }
  | { type: 'retablirRapprochement'; reference: ReferenceParticipation; cible: RefusRapprochementLocuteur; attendu: string }
  | { type: 'reprendreInformations'; reference: ReferenceParticipation; source: ReferenceParticipation; choix: ChoixRepriseParticipation; attendu: string }

export type CommandeRenommageLocuteur = Extract<CommandeCorrectionLocuteurs, { type: 'renommerGlobal' }>

export function estTypeCorrectionLocuteurs(type: unknown): type is CommandeCorrectionLocuteurs['type'] {
  return type === 'renommerGlobal' || type === 'regrouperSelection' || type === 'dissocierSelection'
    || type === 'individualiserSelection' || type === 'supprimerVide' || type === 'ecarterRapprochement' || type === 'retablirRapprochement' || type === 'reprendreInformations'
}

function champsExacts(v: Record<string, unknown>, champs: readonly string[]): boolean {
  const cles = Object.keys(v)
  return cles.length === champs.length && cles.every((cle) => champs.includes(cle))
}

const identifiant = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const referenceValide = (p: unknown): p is ReferenceParticipation => objet(p)
  && champsExacts(p, ['entretienId', 'participationId']) && identifiant(p.entretienId) && identifiant(p.participationId)
export function validerReferenceLocuteurOuvert(v: unknown): asserts v is ReferenceParticipation {
  if (!referenceValide(v)) throw new Error('Rouvrez cet entretien avant de modifier ses locuteurs.')
}

const refusValide = (r: unknown): r is RefusRapprochementLocuteur => objet(r) && (r.type === 'locuteur'
  ? champsExacts(r, ['type', 'locuteurId']) && identifiant(r.locuteurId)
  : r.type === 'participation' && champsExacts(r, ['type', 'entretienId', 'participationId'])
    && identifiant(r.entretienId) && identifiant(r.participationId))

/** Refuse les anciennes références ambiguës avant de préparer une correction. */
export function validerCommandeCorrectionLocuteurs(v: unknown): asserts v is CommandeCorrectionLocuteurs {
  const erreur = () => new Error('Cette demande de correction des locuteurs est invalide. Actualisez puis vérifiez votre sélection.')
  if (!objet(v) || !estTypeCorrectionLocuteurs(v.type) || !identifiant(v.attendu)) throw erreur()
  if (v.type === 'supprimerVide') {
    if (!champsExacts(v, ['type', 'locuteurId', 'attendu']) || !identifiant(v.locuteurId)) throw erreur()
  } else if (v.type === 'reprendreInformations') {
    if (!champsExacts(v, ['type', 'reference', 'source', 'choix', 'attendu']) || !referenceValide(v.reference)
      || !referenceValide(v.source) || !repriseValide(v.choix)) throw erreur()
  } else if (v.type === 'ecarterRapprochement' || v.type === 'retablirRapprochement') {
    if (!champsExacts(v, ['type', 'reference', 'cible', 'attendu']) || !referenceValide(v.reference)
      || !(v.type === 'ecarterRapprochement' ? referenceValide(v.cible) : refusValide(v.cible))) throw erreur()
  } else if (v.type === 'individualiserSelection') {
    if (!champsExacts(v, ['type', 'participations', 'attendu']) || !Array.isArray(v.participations)
      || !v.participations.length || !v.participations.every(referenceValide)
      || new Set(v.participations.map((p) => JSON.stringify([p.entretienId, p.participationId]))).size !== v.participations.length) throw erreur()
  } else if (v.type === 'renommerGlobal') {
    if (!champsExacts(v, ['type', 'locuteurId', 'nom', 'attendu']) || !identifiant(v.locuteurId) || !identifiant(v.nom)) throw erreur()
  } else if (v.type === 'regrouperSelection') {
    if (!champsExacts(v, ['type', 'locuteurIds', 'conserverId', 'nom', 'uniformiserNoms', 'attendu'])
      || !Array.isArray(v.locuteurIds) || v.locuteurIds.length < 2 || !v.locuteurIds.every(identifiant)
      || new Set(v.locuteurIds).size !== v.locuteurIds.length || !identifiant(v.conserverId)
      || !v.locuteurIds.includes(v.conserverId) || !identifiant(v.nom) || typeof v.uniformiserNoms !== 'boolean') throw erreur()
  } else {
    if (!champsExacts(v, ['type', 'locuteurId', 'participations', 'attendu']) || !identifiant(v.locuteurId)
      || !Array.isArray(v.participations) || !v.participations.length || !v.participations.every((p) =>
        objet(p) && champsExacts(p, ['entretienId', 'participationId']) && identifiant(p.entretienId) && identifiant(p.participationId))) throw erreur()
    const cles = v.participations.map((p) => JSON.stringify([p.entretienId, p.participationId]))
    if (new Set(cles).size !== cles.length) throw erreur()
  }
}

export type CommandeLocuteurs =
  | CommandeCorrectionLocuteurs
  | { type: 'fusionner'; conserverId: string; absorberId: string; attendu: string; reprise?: { entretienId: string; participationId: string; sourceEntretienId: string; sourceParticipationId: string; choix: ChoixRepriseLocuteur } }
  | { type: 'separer'; locuteurId: string; nom: string; participations: ParticipationASeparer[]; attendu: string }
  | { type: 'creerDefinition'; nom: string }
  | { type: 'refuser'; entretienId: string; participationId: string; sourceEntretienId: string; sourceParticipationId: string }
  | { type: 'annulerRefus'; entretienId: string; participationId: string; cible: RefusRapprochementLocuteur }
  | { type: 'rapprocher'; entretienId: string; participationId: string; sourceEntretienId: string; sourceParticipationId: string; attendu?: string; reprise?: ChoixRepriseLocuteur }
  | { type: 'creer'; entretienId: string; participationId: string; nom: string }
  | { type: 'lier'; entretienId: string; participationId: string; locuteurId: string | null }
  | { type: 'modifier'; locuteurId: string; nom: string }
  | { type: 'supprimer'; locuteurId: string }
