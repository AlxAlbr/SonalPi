import type { OuvertureDistante } from './distant'

/** Destination GitLab enregistrée, sans secret. */
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
  /** Le compte connecté a-t-il un credential utilisable pour cette destination ? */
  connexionDisponible: boolean
}

/** Compte GitLab connu du poste, décrit sans aucun secret. */
export interface CompteGitLabPublic {
  id: string
  urlInstance: string
  utilisateur: string
  connecte: boolean
  /** Le credential existe mais son échéance est proche : un renouvellement va avoir lieu. */
  aRafraichir: boolean
  scopes: string[]
}

/** État d'une instance : application connue et comptes connectés dessus. */
export interface ConnexionGitLabPublique {
  urlInstance: string
  /** L'instance a-t-elle une application OAuth Sonal utilisable ? */
  applicationConnue: boolean
  /** Redirect URI à déclarer sur l'application. */
  uriCallback: string
  comptes: CompteGitLabPublic[]
}

/** Adresse du projet et compte qui l'ouvre, transmis uniquement vers le main. */
export interface DemandePreparationProjetGitLab {
  urlProjet: string
  compteId: string
}

/** Projet vérifié et branche par défaut, sans secret. */
export interface ProjetGitLabPrepare {
  compteId: string
  urlInstance: string
  utilisateur: string
  projetId: number
  nomProjet: string
  branche: string
}

export interface DemandeOuvertureGitLab extends ProjetGitLabPrepare {
  racine?: string
}

export interface DemandeCreationGitLab extends DemandeOuvertureGitLab {
  nomCorpus: string
}

/** Authentification, destinations GitLab : aucun secret ne franchit l'IPC. */
export interface ApiGitLab {
  lister(): Promise<DestinationGitLabPublic[]>
  /** Instance GitLab qui héberge ce projet, détectée depuis son adresse. */
  detecterInstance(urlProjet: string): Promise<string | null>
  etat(urlInstance: string): Promise<ConnexionGitLabPublique>
  connecter(urlInstance: string, clientId?: string): Promise<ConnexionGitLabPublique>
  deconnecter(urlInstance: string, utilisateur: string): Promise<ConnexionGitLabPublique>
  oublierCompte(urlInstance: string, utilisateur: string): Promise<DestinationGitLabPublic[]>
  preparerProjet(demande: DemandePreparationProjetGitLab): Promise<ProjetGitLabPrepare>
  enregistrerEtOuvrir(demande: DemandeOuvertureGitLab): Promise<OuvertureDistante>
  creerEtOuvrir(demande: DemandeCreationGitLab): Promise<OuvertureDistante>
  ouvrir(id: string): Promise<OuvertureDistante>
  oublierDestination(id: string): Promise<DestinationGitLabPublic[]>
}
