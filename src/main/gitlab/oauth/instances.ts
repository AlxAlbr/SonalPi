/**
 *  Instances GitLab utilisables par Sonal.
 *
 *  Une application OAuth doit être enregistrée sur l'instance : soit par
 *  l'institution, via le registre embarqué, soit par l'utilisateur lui-même
 *  via sa propre application, dont le `client_id` est une valeur publique
 *  mémorisée sur le poste. Un `client_id` n'est jamais un secret : il n'a pas
 *  à être chiffré, et n'est jamais demandé en même temps qu'un mot de passe.
 *
 *  Une instance sans application connue ne peut pas utiliser OAuth.
 *  Le parcours principal peut toutefois proposer un jeton d'accès personnel.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { canoniserUrlInstanceGitLab } from '../../distant/coffre'

/** Port de la callback loopback, identique à celui déclaré sur l'application. */
export const PORT_CALLBACK_GITLAB = 7474

/** Chemin de la callback ; l'URI déclarée doit correspondre exactement. */
export const CHEMIN_CALLBACK_GITLAB = '/callback'

/**
 *  Scope demandé au consentement.
 *
 *  Mesuré sur instance : `read_api` couvre la découverte des projets et des
 *  branches, la lecture des fichiers et l'identité du compte. En revanche
 *  l'API Repository Commits, que Sonal utilise pour publier, refuse
 *  `read_api write_repository` avec un `insufficient_scope` nommant `api` :
 *  seule la publication par la Repository Files API accepte `write_repository`.
 *  Le scope `api` est donc le minimum réellement exigé par GitLab pour ce
 *  parcours, et il est le scope demandé.
 */
export const SCOPES_GITLAB_PAR_DEFAUT = 'api'

export interface InstanceGitLabOAuth {
  /** Adresse canonique de l'instance. */
  urlInstance: string
  /** Identifiant public de l'application OAuth Sonal sur cette instance. */
  clientId: string
  scopes: string
  portCallback: number
  cheminCallback: string
  /** Qui a enregistré l'application : l'institution ou l'utilisateur du poste. */
  origine: 'institution' | 'poste'
}

export function uriCallback(
  instance: Pick<InstanceGitLabOAuth, 'portCallback' | 'cheminCallback'>,
): string {
  return `http://127.0.0.1:${instance.portCallback}${instance.cheminCallback}`
}

/** Refus d'instance, ou application absente : aucun repli n'est proposé. */
export class ErreurInstanceGitLabOAuth extends Error {
  constructor(
    message: string,
    public readonly applicationAbsente = false,
  ) {
    super(message)
    this.name = 'ErreurInstanceGitLabOAuth'
  }
}

interface FichierInstances {
  formatVersion: 1
  instances: Record<string, { clientId: string; scopes?: string }>
}

/**
 *  Registre des instances déclarées par la distribution.
 *  Une entrée suppose l'enregistrement effectif de l'application et la
 *  qualification du flux : voir `docs/dev/gitlab-oauth.md`.
 */
export const INSTANCES_GITLAB_OAUTH: readonly InstanceGitLabOAuth[] = [
  // { urlInstance: 'https://gitlab.exemple.org', clientId: '...', scopes: SCOPES_GITLAB_PAR_DEFAUT },
]

/** Instances connues du poste : registre de la distribution et saisies locales. */
export class InstancesGitLab {
  constructor(private readonly fichier: string) {}

  private lire(): FichierInstances {
    if (!existsSync(this.fichier)) return { formatVersion: 1, instances: {} }
    let lu: unknown
    try {
      lu = JSON.parse(readFileSync(this.fichier, 'utf8'))
    } catch {
      throw new Error('La liste des instances GitLab est corrompue.')
    }
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) {
      throw new Error('La liste des instances GitLab est invalide.')
    }
    const fichier = lu as FichierInstances
    if (!fichier.instances || typeof fichier.instances !== 'object') {
      throw new Error('La liste des instances GitLab est invalide.')
    }
    return { formatVersion: 1, instances: fichier.instances }
  }

  private ecrire(valeur: FichierInstances): void {
    const temporaire = `${this.fichier}.tmp`
    writeFileSync(temporaire, JSON.stringify(valeur, null, 2), 'utf8')
    renameSync(temporaire, this.fichier)
  }

  /** Instance prête à être utilisée, ou refus explicite. */
  resoudre(urlInstance: string): InstanceGitLabOAuth {
    const canonique = canoniser(urlInstance)
    const locale = this.lire().instances[canonique]
    if (locale?.clientId) {
      return {
        urlInstance: canonique,
        clientId: locale.clientId.trim(),
        scopes: locale.scopes?.trim() || SCOPES_GITLAB_PAR_DEFAUT,
        portCallback: PORT_CALLBACK_GITLAB,
        cheminCallback: CHEMIN_CALLBACK_GITLAB,
        origine: 'poste',
      }
    }
    const embarquee = INSTANCES_GITLAB_OAUTH.find(
      (candidate) => canoniser(candidate.urlInstance) === canonique,
    )
    if (embarquee) return { ...embarquee, origine: 'institution' }
    throw new ErreurInstanceGitLabOAuth(
      `Sonal n’a pas d’application OAuth enregistrée sur ${canonique}. ` +
      'Demandez le client_id Sonal à votre institution, ou créez une application ' +
      'OAuth sur cette instance puis saissez son identifiant. ' +
      'La marche à suivre est décrite dans la documentation.',
      true,
    )
  }

  connue(urlInstance: string): boolean {
    try {
      this.resoudre(urlInstance)
      return true
    } catch (erreur) {
      if (erreur instanceof ErreurInstanceGitLabOAuth) return false
      throw erreur
    }
  }

  /** Mémorise l'application déclarée par l'utilisateur pour cette instance. */
  declarer(urlInstance: string, clientId: string): InstanceGitLabOAuth {
    const canonique = canoniser(urlInstance)
    const identifiant = clientId.trim()
    if (!identifiant) throw new ErreurInstanceGitLabOAuth('Identifiant d’application manquant.')
    if (!/^[A-Za-z0-9._-]{4,}$/.test(identifiant)) {
      throw new ErreurInstanceGitLabOAuth(
        'Cet identifiant d’application ne ressemble pas à un client_id GitLab.',
      )
    }
    const fichier = this.lire()
    fichier.instances[canonique] = { clientId: identifiant, scopes: SCOPES_GITLAB_PAR_DEFAUT }
    this.ecrire(fichier)
    return this.resoudre(canonique)
  }

  oublier(urlInstance: string): void {
    const fichier = this.lire()
    delete fichier.instances[canoniser(urlInstance)]
    this.ecrire(fichier)
  }
}

function canoniser(urlInstance: string): string {
  try {
    return canoniserUrlInstanceGitLab(urlInstance)
  } catch {
    throw new ErreurInstanceGitLabOAuth(
      'Adresse GitLab invalide. Utilisez l’adresse de votre instance, en HTTPS.',
    )
  }
}
