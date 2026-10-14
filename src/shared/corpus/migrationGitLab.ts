import type { ApercuCrp } from './migrationCrp'
import type { PayloadEntretien, RegleAnon } from '../format'
import type { DemandeConfigurationBaseMedia, DemandePreparationProjetGitLab, ProjetGitLabPrepare } from '../gitlab'
import type { OuvertureDistante } from '../distant'

export const MIGRATION_GITLAB_QUALIFIEE = false
export const CONNEXION_MIGRATION_GITLAB_REQUISE = 'Reconnectez-vous à GitLab pour lire cette source.'

/** Une source enregistrée est retrouvée dans le coffre du poste. */
export type DemandeSourceMigrationGitLab = DemandePreparationProjetGitLab | { destinationId: string }

export interface ConversionEntretienMigrationGitLab {
  payload: PayloadEntretien
  reglesAnon: RegleAnon[]
}

/** Une cible sans branche ne sera initialisée qu'après confirmation. */
export interface CibleMigrationGitLab extends Omit<ProjetGitLabPrepare, 'branche'> {
  branche: string | null
}

export interface SourceMigrationGitLab {
  preparationId: string
  projet: ProjetGitLabPrepare
  commit: string
  corpus: string[]
}

export interface MediaMigrationGitLab {
  cheminSource: string
  cheminDestination: string
  taille: number
  sha256: string
  stockageSource: 'git' | 'lfs'
}

export interface EntretienMigrationGitLab {
  titre: string
  cheminSonal: string | null
  media: number | null
}

export interface BilanMigrationGitLab {
  bilanId: string
  preparationId: string
  source: ProjetGitLabPrepare
  commitSource: string
  cheminCrp: string
  cible: CibleMigrationGitLab
  commitCible: string | null
  apercu: ApercuCrp
  entretiens: EntretienMigrationGitLab[]
  medias: MediaMigrationGitLab[]
  volumeOctets: number
  destinationMedia: 'depot' | 'externe'
}

export interface DemandeBilanMigrationGitLab {
  preparationId: string
  cheminCrp: string
  cible: DemandePreparationProjetGitLab
  baseMedia?: DemandeConfigurationBaseMedia
}

export interface SuiviMigrationGitLab {
  operationId: string
  bilan: BilanMigrationGitLab
  phase: 'copie' | 'publication' | 'ouverture' | 'terminee'
  mediasConfirmes: number
  publicationsConfirmees: number
  publicationsTotal: number
}

export interface ProgressionMigrationGitLab {
  operationId: string
  bilanId: string
  etape: 'copie' | 'publication' | 'ouverture'
  faits: number
  total: number
  chemin?: string
  octets?: number
}

export type ResultatMigrationGitLab =
  | { etat: 'terminee'; operationId: string; ouverture: OuvertureDistante }
  | { etat: 'interrompue' | 'indeterminee'; operationId: string; message: string }

/** Préparation et opération confirmée ; l'envoi reste réservé à la qualification. */
export interface ApiMigrationGitLab {
  decouvrir(demande: DemandeSourceMigrationGitLab): Promise<SourceMigrationGitLab>
  preparer(demande: DemandeBilanMigrationGitLab): Promise<BilanMigrationGitLab>
  lireEntretien(preparationId: string, index: number): Promise<{ nom: string; contenu: string } | null>
  abandonner(preparationId: string): Promise<void>
  ajouterConversion(bilanId: string, index: number, conversion: ConversionEntretienMigrationGitLab): Promise<void>
  executer(bilanId: string, confirmee: boolean): Promise<ResultatMigrationGitLab>
  listerSuivis(): Promise<SuiviMigrationGitLab[]>
  reprendre(operationId: string, confirmee: boolean, baseMedia?: DemandeConfigurationBaseMedia): Promise<ResultatMigrationGitLab>
  annuler(operationId: string): Promise<void>
  surProgression(cb: (progression: ProgressionMigrationGitLab) => void): () => void
}
