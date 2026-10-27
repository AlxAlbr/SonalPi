import type { Categorie, MarqueurDemo, ParcoursId, PayloadEntretien, Variable } from './format'

export type ExempleId = 'synth' | 'synth-annote'
export type UsageExemple = 'apprentissage' | 'libre'
export type DossierFichiersExercice = 'audio' | 'transcriptions' | 'documents'

export const EXEMPLES_PAR_PARCOURS: Record<ParcoursId, ExempleId> = {
  preparation: 'synth', traitement: 'synth', analyse: 'synth-annote', organisation: 'synth-annote',
}

export const EXEMPLES = [
  { id: 'synth' as const, titre: 'Entretiens déjà importés', resume: 'Quatre entretiens transcrits et leurs audios, sans codage thématique initial.' },
  { id: 'synth-annote' as const, titre: 'Corpus annoté', resume: 'Le même terrain avec ses thèmes, ses extraits codés et ses variables, pour essayer les outils d’analyse.' },
]
export const CLEFS_SOURCES = ['1Coordinatrice', '2RetraiteAnticipee', '3Cuisinier', '4Etudiants'] as const

export interface TravailExemple {
  id: string
  dir: string
  nom: string
  exemple: ExempleId
  usage: UsageExemple
  parcoursApprentissage?: ParcoursId
}
export interface MemoireExemples {
  sources: string
  travaux: TravailExemple[]
  apprentissages: Partial<Record<ParcoursId, string>>
  libres: Partial<Record<ExempleId, string>>
}
export interface ResumeTravailExemple extends TravailExemple {
  etat: 'pret' | 'absent' | 'illisible'
  marqueur?: MarqueurDemo
}
export interface EtatExemples {
  sources: string
  sourcesPresentes: boolean
  emplacementsApprentissage: Record<ParcoursId, string>
  emplacementExemples: string
  travaux: ResumeTravailExemple[]
  apprentissages: Partial<Record<ParcoursId, string>>
  libres: Partial<Record<ExempleId, string>>
}
export interface InstallationExemple {
  exemple: ExempleId
  usage: UsageExemple
  parcoursApprentissage?: ParcoursId
  recommencer?: boolean
  entretiens?: Array<{ cle: string; payload: PayloadEntretien; codebook: Categorie[]; variables: Variable[] }>
}

/** Vérifie l'identité d'un exemple sans se fier au nom du dossier. */
export function identiteExemple(marqueur: MarqueurDemo | undefined): { exemple: ExempleId; usage: UsageExemple } | null {
  if (!marqueur || typeof marqueur.id !== 'string' || !marqueur.id
    || typeof marqueur.racineSources !== 'string') return null
  if (!marqueur.parcours || typeof marqueur.parcours !== 'object' || Array.isArray(marqueur.parcours)
    || Object.values(marqueur.parcours).some((p) => !p || !Array.isArray(p.validees))) return null
  if (marqueur.usage === 'apprentissage' && (!marqueur.parcoursApprentissage
    || marqueur.exemple !== EXEMPLES_PAR_PARCOURS[marqueur.parcoursApprentissage])) return null
  if ((marqueur.exemple === 'synth' || marqueur.exemple === 'synth-annote')
    && (marqueur.usage === 'apprentissage' || marqueur.usage === 'libre')) {
    return { exemple: marqueur.exemple, usage: marqueur.usage }
  }
  return null
}
