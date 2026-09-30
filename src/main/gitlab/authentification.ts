/**
 *  Service d'authentification GitLab du main.
 *
 *  Il est le seul à conserver les credentials : le renderer ne reçoit que des
 *  états publics. Il fournit aussi le client REST associé à un compte, avec un
 *  credential à jour, pour que le reste du code GitLab ignore tout du flux
 *  d'authentification.
 */

import type { CoffreComptes, ConfigCompteGitLab } from '../distant/coffre'
import { canoniserUrlInstanceGitLab, idDeCompteGitLab } from '../distant/coffre'
import type { ConnexionGitLabPublique, CompteGitLabPublic } from '../../shared/gitlab'
import {
  ClientGitLab,
  autorisationJetonPersonnel,
  autorisationOAuth,
} from './client'
import { ClientOAuthGitLab } from './oauth/clientOAuth'
import { credentialExpire, credentialExpireLe } from './oauth/credential'
import { GestionnaireCredentialsGitLab } from './oauth/credentialProvider'
import { connecterGitLabOAuth } from './oauth/connexion'
import {
  CHEMIN_CALLBACK_GITLAB,
  ErreurInstanceGitLabOAuth,
  InstancesGitLab,
  PORT_CALLBACK_GITLAB,
  uriCallback,
} from './oauth/instances'

export interface OptionsServiceAuthentificationGitLab {
  coffre: CoffreComptes
  instances: InstancesGitLab
  /** Ouvre l'URL d'autorisation dans le navigateur du poste. */
  ouvrirNavigateur: (url: string) => Promise<void> | void
  fetchImpl?: typeof fetch
  portCallback?: number
}

export class ServiceAuthentificationGitLab {
  private readonly credentials: GestionnaireCredentialsGitLab

  constructor(private readonly options: OptionsServiceAuthentificationGitLab) {
    this.credentials = new GestionnaireCredentialsGitLab({
      coffre: options.coffre,
      clientOAuth: (urlInstance) => {
        const instance = this.options.instances.resoudre(urlInstance)
        return new ClientOAuthGitLab(instance, options.fetchImpl ?? fetch)
      },
    })
  }

  /** État public d'une instance et de ses comptes, sans aucun secret. */
  etat(urlInstance: string): ConnexionGitLabPublique {
    const comptes = this.options.coffre.listerComptesGitLab()
      .filter((compte) => compte.urlInstance === canoniqueOuBrut(urlInstance))
      .sort((a, b) => a.utilisateur.localeCompare(b.utilisateur))
      .map((compte) => this.comptePublicDepuisConfig(compte))
    const application = this.options.instances.connue(urlInstance)
    // L'URI annoncée est celle qu'il faut déclarer sur l'application : le port
    // réellement écouté, y compris lorsqu'un poste de qualification le change.
    const port = this.options.portCallback ?? this.portDeclare(urlInstance)
    return {
      urlInstance: canoniqueOuBrut(urlInstance),
      applicationConnue: application,
      uriCallback: uriCallback({ portCallback: port, cheminCallback: CHEMIN_CALLBACK_GITLAB }),
      comptes,
    }
  }

  /**
   * Connexion OAuth d'un compte sur l'instance. Le navigateur s'ouvre, GitLab
   * affiche le consentement, et le credential est chiffré au retour.
   */
  async connecter(urlInstance: string, clientId?: string): Promise<ConnexionGitLabPublique> {
    const instance = clientId
      ? this.options.instances.declarer(urlInstance, clientId)
      : this.options.instances.resoudre(urlInstance)
    const { credential, utilisateur } = await connecterGitLabOAuth({
      instance,
      ouvrirNavigateur: this.options.ouvrirNavigateur,
      ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
      ...(this.options.portCallback === undefined
        ? {}
        : { portCallback: this.options.portCallback }),
    })
    this.options.coffre.enregistrerCompteGitLab({
      urlInstance: instance.urlInstance,
      utilisateur,
      credential,
    })
    return this.etat(instance.urlInstance)
  }

  /** Valide et mémorise un jeton d'accès GitLab sans passer par OAuth. */
  async connecterAvecJeton(
    urlInstance: string,
    jetonSaisi: string,
  ): Promise<ConnexionGitLabPublique> {
    const urlCanonique = canoniserUrlInstanceGitLab(urlInstance)
    const jeton = jetonSaisi.trim()
    if (!jeton) throw new Error('Jeton d’accès GitLab manquant.')
    const client = new ClientGitLab({
      urlInstance: urlCanonique,
      autorisation: autorisationJetonPersonnel(jeton),
    }, this.options.fetchImpl)
    const reponse = await client.lireJson<{ username?: unknown }>('/user')
    const utilisateur = typeof reponse.corps.username === 'string'
      ? reponse.corps.username.trim()
      : ''
    if (!utilisateur) throw new Error('Le compte associé au jeton GitLab est invalide.')
    this.options.coffre.enregistrerCompteGitLabAvecJeton({
      urlInstance: urlCanonique,
      utilisateur,
      jeton,
    })
    return this.etat(urlCanonique)
  }

  /** Déconnexion locale, avec révocation distante pour OAuth uniquement. */
  async deconnecter(urlInstance: string, utilisateur: string): Promise<ConnexionGitLabPublique> {
    const compte = this.compte(urlInstance, utilisateur)
    if (compte.authentification === 'oauth') {
      await this.credentials.deconnecter(compte.id)
    } else {
      this.options.coffre.oublierJetonPersonnelGitLab(compte.id)
    }
    return this.etat(compte.urlInstance)
  }

  /** Oubli du compte : credential et compte disparaissent, les destinations restent. */
  oublierCompte(urlInstance: string, utilisateur: string): void {
    const compte = this.compte(urlInstance, utilisateur)
    this.options.coffre.oublier(compte.id)
  }

  /**
   * Client REST d'un compte, credential renouvelé si besoin. Sans credential
   * valide, l'appel doit être refusé par l'appelant : rien n'est tenté en
   * lecture seule avec une identité incomplète.
   */
  async client(compteId: string, projetId?: number): Promise<ClientGitLab> {
    const compte = this.compteParId(compteId)
    const autorisation = compte.authentification === 'oauth'
      ? await this.autorisationOAuth(compteId)
      : this.autorisationJetonPersonnel(compteId)
    return new ClientGitLab({
      urlInstance: compte.urlInstance,
      ...(projetId === undefined ? {} : { projetId }),
      autorisation,
    }, this.options.fetchImpl)
  }

  /** True quand le credential existe mais demande un renouvellement. */
  aRafraichir(compteId: string): boolean {
    const compte = this.compteParId(compteId)
    if (compte.authentification !== 'oauth') return false
    const credential = this.credentials.actuel(compteId)
    return credential !== null && credentialExpire(credential)
  }

  /** Le compte a-t-il encore un accès utilisable ? */
  aConnecte(compteId: string): boolean {
    const compte = this.compteParId(compteId)
    return compte.authentification === 'oauth'
      ? this.credentials.actuel(compteId) !== null
      : this.options.coffre.jetonPersonnelGitLabDisponible(compteId)
  }

  /** Description publique d'un compte, sans secret. */
  comptePublic(compteId: string): CompteGitLabPublic {
    return this.comptePublicDepuisConfig(this.compteParId(compteId))
  }

  private comptePublicDepuisConfig(compte: ConfigCompteGitLab): CompteGitLabPublic {
    const credential = compte.authentification === 'oauth'
      ? this.credentials.actuel(compte.id)
      : null
    return {
      id: compte.id,
      urlInstance: compte.urlInstance,
      utilisateur: compte.utilisateur,
      authentification: compte.authentification,
      connecte: compte.authentification === 'oauth'
        ? credential !== null
        : this.options.coffre.jetonPersonnelGitLabDisponible(compte.id),
      aRafraichir: credential ? credentialExpireLe(credential.expiresAt) : false,
      scopes: credential?.scopes ?? [],
    }
  }

  private async autorisationOAuth(compteId: string) {
    const credential = await this.credentials.credential(compteId)
    if (!credential) {
      throw new ErreurInstanceGitLabOAuth(
        'Votre connexion GitLab a expiré ou a été révoquée. Reconnectez-vous.',
      )
    }
    return autorisationOAuth(credential.accessToken)
  }

  private autorisationJetonPersonnel(compteId: string) {
    const jeton = this.options.coffre.jetonPersonnelGitLab(compteId)
    if (!jeton) {
      throw new ErreurInstanceGitLabOAuth(
        'Votre jeton d’accès GitLab est absent. Saisissez-le à nouveau.',
      )
    }
    return autorisationJetonPersonnel(jeton)
  }

  /** Port déclaré pour l'instance, ou le port standard de Sonal. */
  private portDeclare(urlInstance: string): number {
    try {
      return this.options.instances.resoudre(urlInstance).portCallback
    } catch {
      return PORT_CALLBACK_GITLAB
    }
  }

  private compte(urlInstance: string, utilisateur: string): ConfigCompteGitLab {
    const id = idDeCompteGitLab(canoniqueOuBrut(urlInstance), utilisateur)
    return this.compteParId(id)
  }

  private compteParId(id: string): ConfigCompteGitLab {
    const compte = this.options.coffre.listerComptesGitLab()
      .find((candidat) => candidat.id === id)
    if (!compte) throw new ErreurInstanceGitLabOAuth('Compte GitLab inconnu.')
    return compte
  }
}

function canoniqueOuBrut(urlInstance: string): string {
  try {
    return canoniserUrlInstanceGitLab(urlInstance)
  } catch {
    return urlInstance
  }
}
