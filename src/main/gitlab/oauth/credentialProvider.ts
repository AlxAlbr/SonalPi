/**
 *  Fournisseur de credential OAuth des comptes GitLab.
 *
 *  Le client REST ne connaît que le credential ; son origine, son stockage et
 *  son renouvellement restent ici. Un renouvellement est unique par compte :
 *  plusieurs requêtes concurrentes partagent la même attente au lieu de
 *  consommer le refresh token, que GitLab ne réémet qu'une fois.
 */

import type { CoffreComptes } from '../../distant/coffre'
import { ClientOAuthGitLab, ErreurOAuthGitLab } from './clientOAuth'
import {
  credentialExpire,
  type CredentialOAuthGitLab,
} from './credential'

export interface OptionsGestionnaireCredentials {
  coffre: CoffreComptes
  /** Fabrique du client OAuth d'une instance ; injectable pour les tests. */
  clientOAuth: (urlInstance: string) => ClientOAuthGitLab
}

export class GestionnaireCredentialsGitLab {
  private readonly attentes = new Map<string, Promise<CredentialOAuthGitLab | null>>()

  constructor(private readonly options: OptionsGestionnaireCredentials) {}

  /** Credential courant d'un compte, sans vérifier sa validité. */
  actuel(compteId: string): CredentialOAuthGitLab | null {
    return this.options.coffre.credentialOAuthGitLab(compteId)
  }

  /**
   * Credential utilisable pour un appel. Renouvelle si l'échéance est proche ;
   * les appels concurrents d'un même compte partagent un seul renouvellement.
   */
  credential(compteId: string): Promise<CredentialOAuthGitLab | null> {
    const enCours = this.attentes.get(compteId)
    if (enCours) return enCours
    const attente = this.renouvelerSiNecessaire(compteId).finally(() => {
      this.attentes.delete(compteId)
    })
    this.attentes.set(compteId, attente)
    return attente
  }

  private async renouvelerSiNecessaire(
    compteId: string,
  ): Promise<CredentialOAuthGitLab | null> {
    const credential = this.actuel(compteId)
    if (!credential) return null
    if (!credentialExpire(credential)) return credential
    return this.renouveler(compteId, credential)
  }

  /** Renouvellement explicite, utile après un refus d'accès renouvelé. */
  async renouveler(
    compteId: string,
    credential: CredentialOAuthGitLab,
  ): Promise<CredentialOAuthGitLab> {
    try {
      const compte = this.compte(compteId)
      const rafraichi = await this.options.clientOAuth(compte.urlInstance)
        .rafraichir(credential.refreshToken)
      this.options.coffre.memoriserCredentialOAuthGitLab(compteId, rafraichi)
      return rafraichi
    } catch (erreur) {
      if (erreur instanceof ErreurOAuthGitLab && erreur.raison === 'refus-instance') {
        // Le refresh token est consommé ou révoqué : il ne servira plus.
        this.options.coffre.oublierCredentialOAuthGitLab(compteId)
      }
      throw erreur
    }
  }

  /**
   * Déconnecte un compte : révocation chez l'instance si elle l'accepte, puis
   * effacement local. Les destinations, miroirs et candidats restent intacts.
   */
  async deconnecter(compteId: string): Promise<boolean> {
    const credential = this.actuel(compteId)
    if (!credential) {
      this.options.coffre.oublierCredentialOAuthGitLab(compteId)
      return false
    }
    let revoque = false
    try {
      revoque = await this.options.clientOAuth(this.compte(compteId).urlInstance)
        .revoquer(credential.accessToken)
    } catch {
      revoque = false
    }
    this.options.coffre.oublierCredentialOAuthGitLab(compteId)
    return revoque
  }

  private compte(compteId: string): { urlInstance: string } {
    const compte = this.options.coffre.listerComptesGitLab()
      .find((candidat) => candidat.id === compteId)
    if (!compte) throw new Error('Compte GitLab inconnu.')
    return compte
  }
}
