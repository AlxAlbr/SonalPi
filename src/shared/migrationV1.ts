import type { OuvertureCorpus, PayloadImportEntretien, RegleAnon } from './format'

export const MIGRATION_ANNULEE = 'MIGRATION_ANNULEE'

/** Le nom du fichier est le repère visible de l'utilisateur V1. */
export function nomDepuisCrp(chemin: string): string {
  return (chemin.split(/[\\/]/).pop() ?? '').replace(/\.crp$/i, '')
}

export interface RemplacementTranscriptionMigration {
  index: number
  chemin: string
}

export interface DemandeVerificationMigration {
  cheminCrp: string
  empreinteCrp?: string
  transcriptions?: RemplacementTranscriptionMigration[]
}

export interface FichierMigrationV1 {
  index: number
  titre: string
  reference: string
  chemin: string
  etat: 'ok' | 'manquant' | 'illisible'
}

export interface VerificationMigrationV1 {
  empreinteCrp: string
  transcriptions: FichierMigrationV1[]
  medias: FichierMigrationV1[]
}

export interface DemandePreparationMigration extends DemandeVerificationMigration {
  nom: string
  dossier: string
}

export interface EntretienSourceMigration {
  nom: string
  contenu: string
}

export interface PontMigrationV1 {
  choisirCrp: () => Promise<string | null>
  choisirEmplacement: (emplacement?: string) => Promise<string | null>
  choisirTranscription: () => Promise<string | null>
  verifier: (demande: DemandeVerificationMigration) => Promise<VerificationMigrationV1>
  destination: (cheminCrp: string, nomDossier: string, emplacement?: string) => Promise<string>
  preparer: (demande: DemandePreparationMigration) => Promise<{ nbEntretiens: number }>
  lireEntretien: (index: number) => Promise<EntretienSourceMigration | null>
  ajouterEntretien: (index: number, payload: PayloadImportEntretien, regles: RegleAnon[]) => Promise<void>
  finaliser: () => Promise<OuvertureCorpus>
  terminer: () => Promise<string | null>
  annuler: () => Promise<void>
}
