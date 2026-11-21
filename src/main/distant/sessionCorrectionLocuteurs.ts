import type { EntretienFichier } from '../../shared/format'
import type { ResultatBattement, VerrouProvider } from '../verrous/types'

export interface ReservationCorrectionLocuteurs {
  provider: VerrouProvider
  chemin: string
  echeance?: number
  etag?: string | null
  empruntee?: boolean
  battre?: () => Promise<ResultatBattement>
}

export interface IdentiteCorrectionSession {
  entretienId: string
  userId: string
  machineId: string
  sessionId: string
  traceLocale: string
}

/** Le droit d’une session autorisée reste détenu pendant la correction. */
export interface SessionCorrectionLocuteursWebDAV {
  identite: IdentiteCorrectionSession
  avant: string
  etag: string
  reservation: ReservationCorrectionLocuteurs
  verifier(): void
  engager(): void
  verifierResultat(apres: EntretienFichier): void
}

export interface CopieSessionLocuteursWebDAV {
  entretienId: string
  avant: string
  etag: string
  candidat: string
  creation?: boolean
}

export interface ContexteSessionLocuteursWebDAV {
  entretienId: string
  creation: boolean
}
