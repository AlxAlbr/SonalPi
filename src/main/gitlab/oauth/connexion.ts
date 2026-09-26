/**
 *  Connexion OAuth à une instance GitLab, du clic « Se connecter » au
 *  credential utilisable.
 *
 *  Le state et le code_verifier naissent ici et meurent avec la tentative :
 *  ils ne sont ni journalisés, ni écrits, ni transmis au renderer. Le
 *  navigateur n'est ouvert qu'après le démarrage de la callback loopback, et
 *  l'URI d'autorisation n'est jamais consignée.
 */

import { canoniserUrlInstanceGitLab } from '../../distant/coffre'
import { ClientGitLab, autorisationOAuth } from '../client'
import { CallbackLoopbackOAuth, ErreurCallbackOAuth } from './callbackLoopback'
import { ClientOAuthGitLab, ErreurOAuthGitLab } from './clientOAuth'
import type { CredentialOAuthGitLab } from './credential'
import type { InstanceGitLabOAuth } from './instances'
import { challengeS256, nouvelEtat, nouveauVerifierCode } from './pkce'

export interface OptionsConnexionOAuth {
  instance: InstanceGitLabOAuth
  /** Ouvre l'URL d'autorisation dans le navigateur du poste. */
  ouvrirNavigateur: (url: string) => Promise<void> | void
  fetchImpl?: typeof fetch
  delaiMs?: number
  /** Port libre en test ; sinon le port enregistré sur l'application. */
  portCallback?: number
}

export interface ConnexionOAuthGitLab {
  credential: CredentialOAuthGitLab
  /** Identité GitLab du compte, seule information utile au renderer. */
  utilisateur: string
}

/** Une seule tentative de connexion à la fois sur le poste. */
let tentativeEnCours: Promise<ConnexionOAuthGitLab> | null = null

export function connexionEnCours(): boolean {
  return tentativeEnCours !== null
}

export async function connecterGitLabOAuth(
  options: OptionsConnexionOAuth,
): Promise<ConnexionOAuthGitLab> {
  if (tentativeEnCours) {
    throw new ErreurCallbackOAuth(
      'connexion-concurrente',
      'Une connexion GitLab est déjà en cours sur ce poste.',
    )
  }
  const tentative = executerConnexion(options).finally(() => {
    tentativeEnCours = null
  })
  tentativeEnCours = tentative
  return tentative
}

async function executerConnexion(
  options: OptionsConnexionOAuth,
): Promise<ConnexionOAuthGitLab> {
  const instance = options.instance
  const etat = nouvelEtat()
  const codeVerifier = nouveauVerifierCode()
  const callback = new CallbackLoopbackOAuth(
    {
      port: options.portCallback ?? instance.portCallback,
      chemin: instance.cheminCallback,
      ...(options.delaiMs === undefined ? {} : { delaiMs: options.delaiMs }),
    },
    etat,
  )
  try {
    const uriRedirection = await callback.demarrer()
    // L'attente est ouverte AVANT le navigateur : un retour très rapide ne
    // doit pas tomber dans le vide.
    const retour = callback.attendre()
    await options.ouvrirNavigateur(urlAutorisation({
      instance,
      etat,
      codeVerifier,
      uriRedirection,
    }))
    const { code } = await retour
    const clientOAuth = new ClientOAuthGitLab(instance, options.fetchImpl ?? fetch)
    const credential = await clientOAuth.echangerCode(code, codeVerifier, uriRedirection)
    return { credential, utilisateur: await identite(instance, credential, options.fetchImpl) }
  } finally {
    callback.arreter()
  }
}

function urlAutorisation(params: {
  instance: InstanceGitLabOAuth
  etat: string
  codeVerifier: string
  uriRedirection: string
}): string {
  const url = new URL(`${canoniserUrlInstanceGitLab(params.instance.urlInstance)}/oauth/authorize`)
  url.searchParams.set('client_id', params.instance.clientId)
  url.searchParams.set('redirect_uri', params.uriRedirection)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', params.instance.scopes)
  url.searchParams.set('state', params.etat)
  url.searchParams.set('code_challenge', challengeS256(params.codeVerifier))
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

/** Identité du compte connecté : elle sert de clé de stockage, pas de secret. */
async function identite(
  instance: InstanceGitLabOAuth,
  credential: CredentialOAuthGitLab,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const client = new ClientGitLab({
    urlInstance: instance.urlInstance,
    autorisation: autorisationOAuth(credential.accessToken),
  }, fetchImpl)
  const { corps } = await client.lireJson<unknown>('/user')
  const utilisateur = corps && typeof corps === 'object' && !Array.isArray(corps)
    ? (corps as Record<string, unknown>).username
    : null
  if (typeof utilisateur !== 'string' || !utilisateur.trim()) {
    throw new ErreurOAuthGitLab(
      'reponse-illisible',
      'GitLab n’a pas identifié le compte connecté.',
    )
  }
  return utilisateur.trim()
}
