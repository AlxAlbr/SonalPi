import type { ReferenceParticipation, RefusRapprochementLocuteur } from '../locuteurs'
import { objet } from '../natif/validationCommune'

export interface ChoixRepriseParticipation {
  pseudo?: boolean
  interviewer?: boolean
  variables: string[]
  remplacer?: boolean
}

export type ChoixRepriseLocuteur = ChoixRepriseParticipation

export interface ParticipationASeparer {
  entretienId: string
  participationId: string
}

export type CommandeCorrectionLocuteurs =
  | { type: 'renommerGlobal'; locuteurId: string; nom: string; attendu: string }
  | { type: 'regrouperSelection'; locuteurIds: string[]; conserverId: string; nom: string; uniformiserNoms: boolean; attendu: string }
  | { type: 'dissocierSelection'; locuteurId: string; participations: ReferenceParticipation[]; attendu: string }

export type CommandeRenommageLocuteur = Extract<CommandeCorrectionLocuteurs, { type: 'renommerGlobal' }>

export function estTypeCorrectionLocuteurs(type: unknown): type is CommandeCorrectionLocuteurs['type'] {
  return type === 'renommerGlobal' || type === 'regrouperSelection' || type === 'dissocierSelection'
}

function champsExacts(v: Record<string, unknown>, champs: readonly string[]): boolean {
  const cles = Object.keys(v)
  return cles.length === champs.length && cles.every((cle) => champs.includes(cle))
}

const identifiant = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** Refuse les anciennes références ambiguës avant de préparer une correction. */
export function validerCommandeCorrectionLocuteurs(v: unknown): asserts v is CommandeCorrectionLocuteurs {
  const erreur = () => new Error('Cette demande de correction des locuteurs est invalide. Actualisez puis vérifiez votre sélection.')
  if (!objet(v) || !estTypeCorrectionLocuteurs(v.type) || !identifiant(v.attendu)) throw erreur()
  if (v.type === 'renommerGlobal') {
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
