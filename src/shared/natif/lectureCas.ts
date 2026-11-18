import type { ParticipationLocuteur } from '../locuteurs'
import type { Cas, EntretienFichier, MembreLocuteurCas, RegleCas } from './format'

/** Informations locales nécessaires aux lectures de cas, sans inventer les ids absents. */
export type ParticipationLectureCas = Pick<ParticipationLocuteur,
  'index' | 'nom' | 'locuteurRef' | 'interviewer' | 'valeursLoc' | 'pseudo' | 'pseudoEtat' | 'couleur'>
  & Partial<Pick<ParticipationLocuteur, 'id'>>

export interface EntretienLectureCas extends Pick<EntretienFichier, 'corpsTexte' | 'annotations' | 'meta' | 'reperesPassages'> {
  participations: readonly ParticipationLectureCas[]
}

export type RegleModaliteCas = Extract<RegleCas, { type: 'modalite' }>

export function membresLocuteursRegle(regle: RegleCas): MembreLocuteurCas[] {
  if (regle.type === 'locuteur') return [regle]
  return regle.type === 'locuteurs' ? regle.membres : []
}

/** La première règle porte la même portée d'observation que lors de sa création. */
export function porteeObservationsCas(cas: Pick<Cas, 'regles'>): 'entretien' | 'participation' | null {
  for (const regle of cas.regles) {
    if (regle.type === 'entretiens' || (regle.type === 'modalite' && regle.portee === 'entretien')) return 'entretien'
    if (regle.type === 'locuteur' || regle.type === 'locuteurs'
      || (regle.type === 'modalite' && regle.portee === 'participation')) return 'participation'
  }
  return null
}
