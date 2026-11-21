/** Identité commune au corpus, indépendante des noms et des données locales. */
export interface Locuteur {
  id: string
  nom: string
}

/** Référence stable d'une participation, toujours accompagnée de son entretien. */
export interface ReferenceParticipation {
  entretienId: string
  participationId: string
}

export type RefusRapprochementLocuteur =
  | { type: 'locuteur'; locuteurId: string }
  | ({ type: 'participation' } & ReferenceParticipation)

/** Informations propres à la présence d'un locuteur dans un entretien. */
export interface ParticipationLocuteur {
  id: string
  /** Index référencé par les paragraphes, distinct de l'identifiant stable. */
  index: number
  nom: string
  locuteurRef: string | null
  /** Rôle d'enquêteur dans cet entretien uniquement. */
  interviewer?: boolean
  /** Pseudonyme de l'étiquette de parole, pas du texte de la transcription. */
  pseudo?: string
  couleur?: string
  /** Seule une décision est enregistrée ; une suggestion reste calculée. */
  pseudoEtat?: 'confirme' | 'refuse'
  valeursLoc: Record<string, string>
  /** Conserve un retrait volontaire d'association dans les données historiques. */
  associationRetiree?: boolean
  rapprochementsRefuses?: RefusRapprochementLocuteur[]
}
