/**
 *  Échanges avec les points d'entrée OAuth de l'instance GitLab :
 *  échange du code contre les tokens, renouvellement, révocation.
 *
 *  Aucune requête ni réponse n'est journalisée, et les messages d'erreur ne
 *  reprennent jamais le corps reçu de l'instance : seule la valeur `error`
 *  normalisée par GitLab est traduite. TLS reste vérifié par `fetch`.
 */

import { credentialDepuisReponse, type CredentialOAuthGitLab } from './credential'
import { uriCallback, type InstanceGitLabOAuth } from './instances'

const TAILLE_MAX_REPONSE_OCTETS = 64 * 1024
const DELAI_MAX_MS = 20_000

export type RaisonErreurOAuthGitLab =
  | 'refus-instance'
  | 'refus-utilisateur'
  | 'reseau'
  | 'reponse-illisible'

export class ErreurOAuthGitLab extends Error {
  constructor(
    public readonly raison: RaisonErreurOAuthGitLab,
    message: string,
  ) {
    super(message)
    this.name = 'ErreurOAuthGitLab'
  }
}

const MESSAGES_REFUS: Record<string, string> = {
  invalid_request:
    'GitLab a refusé la demande de connexion. Recommencez depuis le début.',
  invalid_client:
    'L’application Sonal n’est pas enregistrée correctement sur cette instance.',
  invalid_grant:
    'La demande a expiré ou a déjà été utilisée. Recommencez la connexion GitLab.',
  unauthorized_client:
    'Cette application n’est pas autorisée à se connecter sur cette instance.',
  unsupported_grant_type:
    'Cette instance GitLab n’accepte pas le flux de connexion utilisé par Sonal.',
  invalid_scope:
    'Les permissions demandées ne sont pas acceptées par cette instance GitLab.',
  access_denied:
    'Vous avez refusé l’accès demandé par Sonal.',
  server_error:
    'Le service d’authentification GitLab est temporairement indisponible.',
  temporarily_unavailable:
    'Le service d’authentification GitLab est temporairement indisponible.',
  invalid_token:
    'La connexion GitLab n’est plus valide. Reconnectez-vous.',
}

/** Traduit un refus d'instance sans en recopier le détail. */
function messageRefus(corps: unknown): string {
  const code = corps && typeof corps === 'object' && !Array.isArray(corps)
    ? (corps as Record<string, unknown>).error
    : null
  if (typeof code === 'string' && MESSAGES_REFUS[code]) return MESSAGES_REFUS[code]
  if (code === 'invalid_grant') return MESSAGES_REFUS.invalid_grant
  return 'GitLab a refusé la connexion. Vérifiez votre compte et ses droits sur l’instance.'
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
}

export class ClientOAuthGitLab {
  constructor(
    private readonly instance: InstanceGitLabOAuth,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly delaiMs: number = DELAI_MAX_MS,
  ) {}

  private url(point: string): string {
    return `${this.instance.urlInstance.replace(/\/+$/, '')}/oauth/${point}`
  }

  private async post(point: string, corps: URLSearchParams): Promise<unknown> {
    let reponse: Response
    try {
      reponse = await this.fetchImpl(this.url(point), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': String(Buffer.byteLength(corps.toString())),
        },
        body: corps.toString(),
        signal: AbortSignal.timeout(this.delaiMs),
        redirect: 'error',
      })
    } catch {
      throw new ErreurOAuthGitLab(
        'reseau',
        'L’instance GitLab est injoignable. Vérifiez votre connexion réseau.',
      )
    }
    const texte = await this.lireCorps(reponse)
    if (!reponse.ok) {
      throw new ErreurOAuthGitLab('refus-instance', messageRefus(texte))
    }
    if (!estObjet(texte)) {
      throw new ErreurOAuthGitLab(
        'reponse-illisible',
        'Réponse du service d’authentification GitLab illisible.',
      )
    }
    return texte
  }

  private async lireCorps(reponse: Response): Promise<unknown> {
    const texte = (await reponse.text()).slice(0, TAILLE_MAX_REPONSE_OCTETS)
    try {
      return JSON.parse(texte) as unknown
    } catch {
      return null
    }
  }

  /** Échange le code d'autorisation contre un premier credential. */
  async echangerCode(
    code: string,
    codeVerifier: string,
    redirectUri: string = uriCallback(this.instance),
  ): Promise<CredentialOAuthGitLab> {
    const corps = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.instance.clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    })
    return credentialDepuisReponse(await this.post('token', corps))
  }

  /**
   * Renouvelle un credential. L'instance peut renvoyer un nouveau refresh
   * token : la valeur reçue remplace celle fournie, jamais l'inverse.
   */
  async rafraichir(refreshToken: string): Promise<CredentialOAuthGitLab> {
    const corps = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.instance.clientId,
    })
    return credentialDepuisReponse(await this.post('token', corps))
  }

  /**
   * Révoque un token chez l'instance. Un refus ou une panne réseau ne sont
   * pas des échecs d'opération : le secret local est de toute façon effacé.
   */
  async revoquer(accessToken: string): Promise<boolean> {
    try {
      const reponse = await this.fetchImpl(this.url('revoke'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: accessToken,
          client_id: this.instance.clientId,
        }).toString(),
        signal: AbortSignal.timeout(this.delaiMs),
        redirect: 'error',
      })
      return reponse.ok
    } catch {
      return false
    }
  }
}
