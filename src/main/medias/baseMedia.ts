/**
 *  Base de médias d'un corpus GitLab — déclaration locale, côté poste.
 *
 *  Chaque personne associe à sa destination GitLab le dossier WebDAV où
 *  vivent ses médias. Cette déclaration reste ici : ni l'URL, ni le secret
 *  ne sont publiés dans le corpus, et une base n'est pas un corpus — elle
 *  n'apparaît jamais parmi les destinations distantes récentes.
 *
 *  Le transport reprend celui du connecteur WebDAV existant : HTTPS
 *  obligatoire, authentification Basic avec mot de passe d'application,
 *  même coffre pour le secret. La lecture par plages et la capacité du
 *  serveur appartiennent au contrat de transport du module média.
 */

import { canoniserUrlServeur, type CoffreComptes } from '../distant/coffre'
import { ClientWebDAV, ErreurHttp, verifierTransportWebDAV } from '../webdav/client'

/** Ce que l'interface peut savoir d'une base média : jamais le secret. */
export interface BaseMediaWebDAVLocale {
  /** Destination GitLab liée, branche et racine comprises. */
  destinationGitLabId: string
  /** URL du dossier partagé, sans barre finale. */
  urlBase: string
  utilisateur: string
  /** Le poste sait-il fournir le mot de passe à la demande ? */
  secretDisponible: boolean
}

/** Pourquoi la base média n'est pas utilisable en l'état. */
export type MotifBaseMediaIndisponible =
  | 'non-configuree' // aucune base déclarée pour cette destination
  | 'secret-indisponible' // base déclarée, secret absent de la session
  | 'adresse-invalide' // HTTPS obligatoire, identifiants dans l'URL, fragment…

export type ResolutionBaseMedia =
  | { ok: true; base: BaseMediaWebDAVLocale; client: ClientWebDAV }
  | { ok: false; motif: MotifBaseMediaIndisponible }

/** Forme publique de la base déclarée, ou null si le poste n'en a pas. */
export function baseMediaLocale(
  coffre: CoffreComptes,
  destinationGitLabId: string,
): BaseMediaWebDAVLocale | null {
  const config = coffre.baseMedia(destinationGitLabId)
  if (!config) return null
  return {
    destinationGitLabId,
    urlBase: config.urlBase,
    utilisateur: config.utilisateur,
    secretDisponible: coffre.motDePasseBaseMedia(destinationGitLabId) !== null,
  }
}

/** Base déclarée et client prêt à l'emploi. Le secret ne quitte pas le main :
 *  il entre dans le client, il n'en ressort jamais. */
export function resoudreBaseMedia(
  coffre: CoffreComptes,
  destinationGitLabId: string,
): ResolutionBaseMedia {
  const base = baseMediaLocale(coffre, destinationGitLabId)
  if (!base) return { ok: false, motif: 'non-configuree' }
  if (!base.secretDisponible) return { ok: false, motif: 'secret-indisponible' }
  const motDePasse = coffre.motDePasseBaseMedia(destinationGitLabId)
  if (motDePasse === null) return { ok: false, motif: 'secret-indisponible' }
  try {
    return { ok: true, base, client: new ClientWebDAV(clientConfig(base, motDePasse)) }
  } catch {
    return { ok: false, motif: 'adresse-invalide' }
  }
}

function clientConfig(
  base: BaseMediaWebDAVLocale,
  motDePasse: string,
): { baseUrl: string; identifiants: { utilisateur: string; motDePasse: string } } {
  return {
    baseUrl: base.urlBase,
    identifiants: { utilisateur: base.utilisateur, motDePasse },
  }
}

/** Vérifie qu'une déclaration est recevable AVANT de l'enregistrer :
 *  HTTPS obligatoire, aucun identifiant dans l'URL, aucun fragment.
 *  La forme saisie est contrôlée avant d'être canonisée : la canonisation
 *  tronquerait au silence un identifiant ou un fragment tapé par erreur. */
export function verifierDeclarationBaseMedia(params: {
  urlBase: string
  utilisateur: string
  motDePasse: string
}): { urlBase: string; utilisateur: string } {
  const utilisateur = params.utilisateur.trim()
  if (!utilisateur) throw new Error('Identité du compte média manquante.')
  if (!params.motDePasse) throw new Error('Mot de passe d\'application manquant.')
  const saisie = params.urlBase.trim()
  if (!saisie) throw new Error('Adresse du dossier média manquante.')
  let analysee: URL | null = null
  try {
    analysee = new URL(saisie)
  } catch {
    throw new Error('Adresse du dossier média invalide.')
  }
  if (analysee.username || analysee.password) {
    throw new Error('L\'adresse du dossier média ne doit pas contenir d\'identifiants.')
  }
  if (analysee.hash) {
    throw new Error('L\'adresse du dossier média ne doit pas contenir de fragment.')
  }
  const urlBase = canoniserUrlServeur(saisie)
  verifierTransportWebDAV(urlBase)
  return { urlBase, utilisateur }
}

/** Résultat du test d'accès au dossier, tel que l'interface le reformule. */
export type MotifIndisponibiliteBase =
  | 'droits' // 401 / 403 : compte ou mot de passe d'application refusé
  | 'dossier-absent' // 404 : le dossier partagé n'existe pas pour ce compte
  | 'indisponible' // réseau, délai dépassé, erreur du serveur

export type TestAccesBase =
  | { ok: true }
  | { ok: false; motif: MotifIndisponibiliteBase }

/** Déclaration canonique dont l'accès a été contrôlé. */
export interface BaseMediaVerifiee {
  urlBase: string
  utilisateur: string
  motDePasse: string
}

export type ResultatPreparationBaseMedia =
  | { ok: true; base: BaseMediaVerifiee }
  | { ok: false; motif: MotifIndisponibiliteBase }

/** Le dossier partagé est-il accessible avec ces identifiants ?
 *  Un inventaire du dossier suffit : il ne lit aucun média. */
export async function testerAccesBase(client: ClientWebDAV): Promise<TestAccesBase> {
  try {
    await client.propfind('')
    return { ok: true }
  } catch (erreur) {
    if (erreur instanceof ErreurHttp) {
      if (erreur.statut === 401 || erreur.statut === 403) return { ok: false, motif: 'droits' }
      if (erreur.statut === 404) return { ok: false, motif: 'dossier-absent' }
    }
    // Panne réseau, délai dépassé, erreur du serveur : le dossier ne répond pas.
    return { ok: false, motif: 'indisponible' }
  }
}

/** Valide une déclaration et contrôle son accès sans encore la persister. */
export async function preparerBaseMediaVerifiee(
  params: { urlBase: string; utilisateur: string; motDePasse: string },
  creerClient: (
    config: { baseUrl: string; identifiants: { utilisateur: string; motDePasse: string } },
  ) => ClientWebDAV = (config) => new ClientWebDAV(config),
): Promise<ResultatPreparationBaseMedia> {
  const declaration = verifierDeclarationBaseMedia(params)
  const client = creerClient({
    baseUrl: declaration.urlBase,
    identifiants: {
      utilisateur: declaration.utilisateur,
      motDePasse: params.motDePasse,
    },
  })
  const acces = await testerAccesBase(client)
  if (!acces.ok) return acces
  return {
    ok: true,
    base: { ...declaration, motDePasse: params.motDePasse },
  }
}

/** Valide et teste une base avant de la persister dans le coffre. */
export async function enregistrerBaseMediaVerifiee(
  coffre: CoffreComptes,
  destinationGitLabId: string,
  params: { urlBase: string; utilisateur: string; motDePasse: string },
  creerClient: (
    config: { baseUrl: string; identifiants: { utilisateur: string; motDePasse: string } },
  ) => ClientWebDAV = (config) => new ClientWebDAV(config),
): Promise<TestAccesBase> {
  if (!coffre.listerDestinationsGitLab().some((destination) => destination.id === destinationGitLabId)) {
    throw new Error('Destination GitLab inconnue.')
  }
  const preparation = await preparerBaseMediaVerifiee(params, creerClient)
  if (!preparation.ok) return preparation
  coffre.enregistrerBaseMedia({
    destinationGitLabId,
    ...preparation.base,
  })
  return { ok: true }
}
