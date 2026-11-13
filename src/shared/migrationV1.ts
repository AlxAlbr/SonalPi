import type { OuvertureCorpus, PayloadEntretien, RegleAnon } from './format'

export const MIGRATION_ANNULEE = 'MIGRATION_ANNULEE'

/** Le nom du fichier est le repère visible de l'utilisateur V1. */
export function nomDepuisCrp(chemin: string): string {
  return (chemin.split(/[\\/]/).pop() ?? '').replace(/\.crp$/i, '')
}

export interface DemandePreparationMigration {
  cheminCrp: string
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
  destination: (cheminCrp: string, nomDossier: string, emplacement?: string) => Promise<string>
  preparer: (demande: DemandePreparationMigration) => Promise<{ nbEntretiens: number }>
  lireEntretien: (index: number) => Promise<EntretienSourceMigration | null>
  ajouterEntretien: (index: number, payload: PayloadEntretien, regles: RegleAnon[]) => Promise<void>
  finaliser: () => Promise<OuvertureCorpus>
  terminer: () => Promise<string | null>
  annuler: () => Promise<void>
}
