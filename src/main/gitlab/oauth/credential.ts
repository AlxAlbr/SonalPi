/**
 *  Credential OAuth GitLab.
 *  Il ne quitte jamais le main : le renderer ne reçoit que des états.
 */

export interface CredentialOAuthGitLab {
  accessToken: string
  refreshToken: string
  /** Date d'expiration de l'access token, en millisecondes. */
  expiresAt: number
  /** Scopes effectivement accordés par l'instance. */
  scopes: string[]
  /** Date de la dernière rotation du couple de tokens. */
  rotationneeLe: number
}

/** Marge de renouvellement : un token proche de l'échéance est déjà périmé. */
export const MARGE_RENOUVELLEMENT_MS = 60_000

export function credentialExpire(
  credential: CredentialOAuthGitLab,
  maintenant: number = Date.now(),
): boolean {
  return credentialExpireLe(credential.expiresAt, maintenant)
}

export function credentialExpireLe(expiresAt: number, maintenant: number = Date.now()): boolean {
  return expiresAt - maintenant <= MARGE_RENOUVELLEMENT_MS
}

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.trim() ? valeur.trim() : null
}

function listeScopes(valeur: unknown): string[] {
  if (typeof valeur !== 'string') return []
  return [...new Set(valeur.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean))]
}

/**
 *  Valide une réponse de jeton GitLab.
 *  Une réponse sans refresh token est refusée : sans lui, la session ne peut
 *  pas survivre à l'expiration de l'access token.
 */
export function credentialDepuisReponse(
  corps: unknown,
  maintenant: number = Date.now(),
): CredentialOAuthGitLab {
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) {
    throw new Error('Réponse du service d’authentification GitLab illisible.')
  }
  const reponse = corps as Record<string, unknown>
  const accessToken = texte(reponse.access_token)
  const refreshToken = texte(reponse.refresh_token)
  if (!accessToken || !refreshToken) {
    throw new Error('GitLab n’a pas délivré de jeton exploitable pour cette connexion.')
  }
  const expiresIn = Number(reponse.expires_in)
  const duree = Number.isFinite(expiresIn) && expiresIn > 0
    ? Math.min(expiresIn * 1000, 24 * 3600 * 1000)
    : 3600 * 1000
  return {
    accessToken,
    refreshToken,
    expiresAt: maintenant + duree,
    scopes: listeScopes(reponse.scope),
    rotationneeLe: maintenant,
  }
}

export function credentialVersJson(credential: CredentialOAuthGitLab): string {
  return JSON.stringify(credential)
}

/** Relit un credential persisté ; une valeur illisible est traitée comme absente. */
export function credentialDepuisJson(json: string | null | undefined): CredentialOAuthGitLab | null {
  if (!json) return null
  try {
    const lu = JSON.parse(json) as unknown
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) return null
    const c = lu as Record<string, unknown>
    const accessToken = texte(c.accessToken)
    const refreshToken = texte(c.refreshToken)
    const expiresAt = Number(c.expiresAt)
    const rotationneeLe = Number(c.rotationneeLe)
    if (
      !accessToken ||
      !refreshToken ||
      !Number.isFinite(expiresAt) ||
      !Number.isFinite(rotationneeLe)
    ) {
      return null
    }
    return {
      accessToken,
      refreshToken,
      expiresAt,
      rotationneeLe,
      scopes: Array.isArray(c.scopes) ? listeScopes(c.scopes.join(' ')) : [],
    }
  } catch {
    return null
  }
}
