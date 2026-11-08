import type { OuvertureDistante } from './distant'
import type { SourceMigrationGitLab } from './corpus/migrationGitLab'

export type IdentificationProjetGitLab =
  | { type: 'v2' }
  | { type: 'migration'; source: SourceMigrationGitLab }

export type ResultatOuvertureGitLab = OuvertureDistante | { type: 'migration'; source: SourceMigrationGitLab }

export type AuthentificationGitLab = 'oauth' | 'jeton-personnel'

/** Base média déclarée sur ce poste, sans adresse ni secret. */
export interface BaseMediaGitLabPublique {
  utilisateur: string
  secretDisponible: boolean
}

export interface DemandeConfigurationBaseMedia {
  urlBase: string
  utilisateur: string
  motDePasse: string
}

export type ResultatConfigurationBaseMedia =
  | { ok: true }
  | { ok: false; motif: 'droits' | 'dossier-absent' | 'indisponible' }

/** Destination GitLab enregistrée, sans secret. */
export interface DestinationGitLabPublic {
  fournisseur: 'gitlab'
  id: string
  compteId: string
  urlInstance: string
  utilisateur: string
  authentification: AuthentificationGitLab
  projetId: number
  nomProjet: string
  branche: string
  racine: string
  /** Le compte connecté a-t-il un credential utilisable pour cette destination ? */
  connexionDisponible: boolean
  /** Base média propre à ce poste, ou null si elle n'est pas configurée. */
  baseMedia: BaseMediaGitLabPublique | null
}

/** Compte GitLab connu du poste, décrit sans aucun secret. */
export interface CompteGitLabPublic {
  id: string
  urlInstance: string
  utilisateur: string
  authentification: AuthentificationGitLab
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

export type DemandeOuvertureGitLab = ProjetGitLabPrepare

export interface DemandeCreationGitLab extends DemandeOuvertureGitLab {
  nomCorpus: string
  baseMedia?: DemandeConfigurationBaseMedia
}

/** Authentification et destinations GitLab.
 *  Un secret saisi franchit l'IPC une fois vers le main et n'en revient jamais. */
export interface ApiGitLab {
  lister(): Promise<DestinationGitLabPublic[]>
  /** Instance GitLab qui héberge ce projet, détectée depuis son adresse. */
  detecterInstance(urlProjet: string): Promise<string | null>
  etat(urlInstance: string): Promise<ConnexionGitLabPublique>
  connecter(urlInstance: string, clientId?: string): Promise<ConnexionGitLabPublique>
  connecterAvecJeton(urlInstance: string, jeton: string): Promise<ConnexionGitLabPublique>
  deconnecter(urlInstance: string, utilisateur: string): Promise<ConnexionGitLabPublique>
  oublierCompte(urlInstance: string, utilisateur: string): Promise<DestinationGitLabPublic[]>
  preparerProjet(demande: DemandePreparationProjetGitLab): Promise<ProjetGitLabPrepare>
  enregistrerEtOuvrir(demande: DemandeOuvertureGitLab): Promise<ResultatOuvertureGitLab>
  creerEtOuvrir(demande: DemandeCreationGitLab): Promise<OuvertureDistante>
  ouvrir(id: string): Promise<ResultatOuvertureGitLab>
  configurerBaseMedia(
    destinationId: string,
    demande: DemandeConfigurationBaseMedia,
  ): Promise<ResultatConfigurationBaseMedia>
  oublierBaseMedia(destinationId: string): Promise<DestinationGitLabPublic[]>
  oublierDestination(id: string): Promise<DestinationGitLabPublic[]>
}
