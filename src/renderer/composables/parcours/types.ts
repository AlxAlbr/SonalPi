import type { ParcoursId } from '../../../shared/format'

export type SurfaceGuide = 'corpus' | 'entretien' | 'tableau-bord' | 'docs-cadre'

export type DestinationGuide =
  | { surface: 'catalogue' }
  | { surface: 'parcours'; parcoursId: ParcoursId }
  | { surface: 'corpus-accueil'; parcoursId: ParcoursId }
  | {
      surface: 'entretien'
      entretienId: string
      onglet?: 'maison' | 'themes' | 'locuteurs' | 'donnees' | 'journal' | 'anon' | 'notes'
    }
  | { surface: 'tableau-bord' }
  | { surface: 'docs-cadre' }

/** Identité complète de l'étape actuellement accompagnée. */
export type EtapeActive = { parcoursId: ParcoursId; etapeId: string } | null

/** Une action pédagogique validée par l'état métier, jamais par le seul clic. */
export interface EtapePasAPas {
  id: string
  titre: string
  cible: () => string | null
  fait: () => boolean
  texte: () => string
  explication?: () => string
  panneau?: boolean
  panneauAvecTrou?: boolean
  panneauSur?: SurfaceGuide[]
  numCle?: string
  requiere?: string
  retest?: () => string
  retestCorpus?: boolean
  fini?: () => string
  finiEnEntretien?: boolean
}

export interface DefinitionParcours {
  id: ParcoursId
  titre: string
  resume: string
  disponible: () => boolean
  indisponibilite?: () => string | null
  etapes: EtapePasAPas[]
}
