import type { OuvertureDistante } from './distant'

/** Capacités WebDAV mesurées lors de la connexion. */
export interface ProfilCapacitesWebDAV {
  /** Préconditions HTTP honorées pour les écritures conditionnelles. */
  preconditions: boolean
  /** Verrouillage natif Nextcloud disponible. */
  filesLock: boolean
  notes?: string[]
}

/** Destination WebDAV et identité associée, sans mot de passe. */
export interface DestinationWebDAVPublic {
  fournisseur: 'webdav'
  id: string
  urlServeur: string
  utilisateur: string
  motDePasseDisponible: boolean
}

export interface DemandeConnexionWebDAV {
  /** URL DAV complète du dossier du corpus. */
  urlServeur: string
  utilisateur: string
  /** Mot de passe d'application saisi, transmis uniquement vers le main. */
  motDePasse: string
}

export interface DemandeCreationWebDAV extends DemandeConnexionWebDAV {
  nomCorpus: string
}

export type ResultatConnexionWebDAV =
  | { ok: true; compte: DestinationWebDAVPublic; profil: ProfilCapacitesWebDAV }
  | { ok: false; note: string }

/** Configuration et ouverture des destinations WebDAV. */
export interface ApiWebDAV {
  lister(): Promise<DestinationWebDAVPublic[]>
  connecter(demande: DemandeConnexionWebDAV): Promise<ResultatConnexionWebDAV>
  /** Publie le corpus et enregistre la destination, sans l'ouvrir. */
  creer(demande: DemandeCreationWebDAV): Promise<ResultatConnexionWebDAV>
  ouvrir(id: string, motDePasse?: string): Promise<OuvertureDistante>
  oublier(id: string): Promise<DestinationWebDAVPublic[]>
}
