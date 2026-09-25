import type { OuvertureDistante } from './distant'

/** Destination GitLab enregistrée, sans jeton. */
export interface DestinationGitLabPublic {
  fournisseur: 'gitlab'
  id: string
  compteId: string
  urlInstance: string
  utilisateur: string
  projetId: number
  nomProjet: string
  branche: string
  racine: string
  jetonDisponible: boolean
}

/** Adresse et jeton saisis, transmis uniquement vers le main. */
export interface DemandePreparationProjetGitLab {
  urlProjet: string
  jeton: string
}

/** Projet vérifié et branche par défaut, sans secret. */
export interface ProjetGitLabPrepare {
  urlInstance: string
  utilisateur: string
  projetId: number
  nomProjet: string
  branche: string
}

export interface DemandeOuvertureGitLab extends ProjetGitLabPrepare {
  jeton: string
  racine?: string
}

export interface DemandeCreationGitLab extends DemandeOuvertureGitLab {
  nomCorpus: string
}

/** Préparation et ouverture des destinations GitLab. */
export interface ApiGitLab {
  lister(): Promise<DestinationGitLabPublic[]>
  preparerProjet(demande: DemandePreparationProjetGitLab): Promise<ProjetGitLabPrepare>
  enregistrerEtOuvrir(demande: DemandeOuvertureGitLab): Promise<OuvertureDistante>
  creerEtOuvrir(demande: DemandeCreationGitLab): Promise<OuvertureDistante>
  ouvrir(id: string, jeton?: string): Promise<OuvertureDistante>
  oublierDestination(id: string): Promise<DestinationGitLabPublic[]>
}
