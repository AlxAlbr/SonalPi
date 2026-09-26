/**
 *  Coffre des accès distants.
 *  Il conserve un mot de passe d'application Nextcloud ou un credential OAuth
 *  GitLab. Les destinations GitLab restent séparées du compte et du secret.
 *
 *  Le secret est chiffré via `safeStorage` d'Electron (clé du trousseau OS).
 *  Sans stockage sécurisé, il reste seulement en mémoire pour la session.
 *  Les primitives de chiffrement sont injectables pour tester cette logique
 *  hors d'Electron.
 */

import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  credentialDepuisJson,
  type CredentialOAuthGitLab,
} from '../gitlab/oauth/credential'

/** Destination WebDAV historique, qui porte aussi l'identité du compte. */
export interface ConfigCorpusDistant {
  fournisseur: 'webdav'
  /** Id stable dérivé de l'URL complète et de l'utilisateur. */
  id: string
  urlServeur: string
  utilisateur: string
  /** Absent lorsque le poste ne fournit pas de stockage sécurisé. */
  motDePasseChiffre?: string
}

/** Credential OAuth persisté, toujours chiffré sur disque. */
export interface CredentialOAuthPersiste {
  accessTokenChiffre: string
  refreshTokenChiffre: string
  expiresAt: number
  scopes: string[]
  rotationneeLe: number
}

/** Compte GitLab réutilisable par plusieurs projets et racines. */
export interface ConfigCompteGitLab {
  fournisseur: 'gitlab'
  id: string
  urlInstance: string
  utilisateur: string
  oauth?: CredentialOAuthPersiste
}

/** Destination GitLab sans secret, liée à un compte enregistré. */
export interface ConfigDestinationGitLab {
  fournisseur: 'gitlab'
  id: string
  compteId: string
  projetId: number
  nomProjet: string
  branche: string
  racine: string
}

type ConfigCompteStocke = ConfigCorpusDistant | ConfigCompteGitLab

type ConfigCorpusDistantV2 = Omit<ConfigCorpusDistant, 'fournisseur'>

interface FichierComptesV1 {
  formatVersion: 1
  comptes: Record<string, ConfigCorpusDistantV2>
}

interface FichierComptesV2 {
  formatVersion: 2
  comptes: Record<string, ConfigCorpusDistantV2>
}

interface FichierComptes {
  formatVersion: 4
  comptes: Record<string, ConfigCompteStocke>
  destinationsGitLab: Record<string, ConfigDestinationGitLab>
}

/** Coffre 3 : comptes GitLab porteurs d'un jeton d'accès personnel. */
interface FichierComptesV3 {
  formatVersion: 3
  comptes: Record<string, ConfigCompteStocke & { jetonChiffre?: string }>
  destinationsGitLab: Record<string, ConfigDestinationGitLab>
}

export interface MigrationIdCorpus {
  ancienId: string
  nouvelId: string
}

function ecrireJsonAtomique(fichier: string, valeur: unknown): void {
  const temporaire = `${fichier}.tmp`
  const descripteur = openSync(temporaire, 'w', 0o600)
  try {
    fchmodSync(descripteur, 0o600)
    writeFileSync(descripteur, JSON.stringify(valeur, null, 2), 'utf8')
    fsyncSync(descripteur)
  } finally {
    closeSync(descripteur)
  }
  renameSync(temporaire, fichier)
  chmodSync(fichier, 0o600)
}

/** Primitives injectables — implémentation réelle : `safeStorage` d'Electron. */
export interface Chiffreur {
  disponible(): boolean
  chiffre(clair: string): string
  dechiffre(chiffre: string): string
}

export class CoffreComptes {
  private readonly secretsSession = new Map<string, string>()
  private readonly credentialsSession = new Map<string, CredentialOAuthGitLab>()

  constructor(
    private readonly fichier: string,
    private readonly chiffreur: Chiffreur,
    private readonly migrerReferences: (migrations: MigrationIdCorpus[]) => void = () => undefined,
  ) {}

  private lire(): FichierComptes {
    if (!existsSync(this.fichier)) {
      return { formatVersion: 4, comptes: {}, destinationsGitLab: {} }
    }
    let lu: unknown
    try {
      lu = JSON.parse(readFileSync(this.fichier, 'utf8'))
    } catch {
      throw new Error('Le coffre des comptes distants est corrompu.')
    }
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) {
      throw new Error('Le coffre des comptes distants est invalide.')
    }
    const f = lu as FichierComptes | FichierComptesV3 | FichierComptesV2 | FichierComptesV1
    if (!f.comptes || typeof f.comptes !== 'object' || Array.isArray(f.comptes)) {
      throw new Error('Le coffre des comptes distants est invalide.')
    }
    const version = Number(f.formatVersion)
    if (version === 4) {
      const courant = f as FichierComptes
      if (
        !courant.destinationsGitLab ||
        typeof courant.destinationsGitLab !== 'object' ||
        Array.isArray(courant.destinationsGitLab)
      ) {
        throw new Error('Le coffre des comptes distants est invalide.')
      }
      return courant
    }
    if (version === 3) return this.migrerV3(f as FichierComptesV3)
    if (version === 2) return this.migrerV2(f as FichierComptesV2)
    if (version === 1) return this.migrerV1(f as FichierComptesV1)
    throw new Error(`Version de coffre distant non supportée : ${String(version)}`)
  }

  /**
   *  Le jeton d'accès personnel disparaît du coffre : le compte garde son
   *  identité, son credential OAuth s'il en existe un, et toutes ses
   *  destinations, miroirs et candidats locaux.
   */
  private migrerV3(f: FichierComptesV3): FichierComptes {
    const comptes: Record<string, ConfigCompteStocke> = {}
    for (const [id, compte] of Object.entries(f.comptes)) {
      if (compte.fournisseur === 'gitlab') {
        const { jetonChiffre: _jeton, ...sansJeton } = compte as ConfigCompteGitLab & {
          jetonChiffre?: string
        }
        comptes[id] = sansJeton
        continue
      }
      comptes[id] = compte
    }
    const migre: FichierComptes = {
      formatVersion: 4,
      comptes,
      destinationsGitLab: f.destinationsGitLab ?? {},
    }
    ecrireJsonAtomique(this.fichier, migre)
    return migre
  }

  private migrerV1(f: FichierComptesV1): FichierComptes {
    const comptes: Record<string, ConfigCompteStocke> = {}
    const migrations: MigrationIdCorpus[] = []
    for (const [ancienId, ancienCompte] of Object.entries(f.comptes)) {
      const urlServeur = canoniserUrlServeur(ancienCompte.urlServeur)
      const utilisateur = ancienCompte.utilisateur.trim()
      const nouvelId = idDeCorpus(urlServeur, utilisateur)
      if (comptes[nouvelId]) {
        throw new Error(`Plusieurs comptes distants correspondent au même identifiant : ${nouvelId}`)
      }
      comptes[nouvelId] = {
        ...ancienCompte,
        fournisseur: 'webdav',
        id: nouvelId,
        urlServeur,
        utilisateur,
      }
      migrations.push({ ancienId, nouvelId })
    }
    this.migrerReferences(migrations)
    const migre: FichierComptes = {
      formatVersion: 4,
      comptes,
      destinationsGitLab: {},
    }
    ecrireJsonAtomique(this.fichier, migre)
    return migre
  }

  private migrerV2(f: FichierComptesV2): FichierComptes {
    const comptes = Object.fromEntries(
      Object.entries(f.comptes).map(([id, compte]) => [id, {
        ...compte,
        fournisseur: 'webdav' as const,
      }]),
    )
    const migre: FichierComptes = {
      formatVersion: 4,
      comptes,
      destinationsGitLab: {},
    }
    ecrireJsonAtomique(this.fichier, migre)
    return migre
  }

  lister(): ConfigCorpusDistant[] {
    return Object.values(this.lire().comptes)
      .filter((compte): compte is ConfigCorpusDistant => compte.fournisseur === 'webdav')
  }

  listerComptesGitLab(): ConfigCompteGitLab[] {
    return Object.values(this.lire().comptes)
      .filter((compte): compte is ConfigCompteGitLab => compte.fournisseur === 'gitlab')
  }

  listerDestinationsGitLab(): ConfigDestinationGitLab[] {
    return Object.values(this.lire().destinationsGitLab)
  }

  stockageSecuriseDisponible(): boolean {
    return this.chiffreur.disponible()
  }

  /** Mot de passe applicatif déchiffré — process main uniquement. */
  private secret(id: string): string | null {
    if (this.secretsSession.has(id)) return this.secretsSession.get(id) ?? null
    const compte = this.lire().comptes[id]
    if (compte?.fournisseur !== 'webdav' || !compte.motDePasseChiffre) return null
    try {
      const clair = this.chiffreur.dechiffre(compte.motDePasseChiffre)
      this.secretsSession.set(id, clair)
      return clair
    } catch {
      return null
    }
  }

  motDePasse(id: string): string | null {
    const compte = this.lire().comptes[id]
    return compte?.fournisseur === 'webdav' ? this.secret(id) : null
  }

  /** Credential OAuth du compte, déchiffré — process main uniquement. */
  credentialOAuthGitLab(id: string): CredentialOAuthGitLab | null {
    const enSession = this.credentialsSession.get(id)
    if (enSession) return enSession
    const compte = this.lire().comptes[id]
    if (compte?.fournisseur !== 'gitlab' || !compte.oauth) return null
    try {
      const credential = credentialDepuisJson(JSON.stringify({
        accessToken: this.chiffreur.dechiffre(compte.oauth.accessTokenChiffre),
        refreshToken: this.chiffreur.dechiffre(compte.oauth.refreshTokenChiffre),
        expiresAt: compte.oauth.expiresAt,
        scopes: compte.oauth.scopes,
        rotationneeLe: compte.oauth.rotationneeLe,
      }))
      if (!credential) return null
      this.credentialsSession.set(id, credential)
      return credential
    } catch {
      return null
    }
  }

  /** Enregistre le credential OAuth du compte, en le chiffrant s'il le poste le permet. */
  memoriserCredentialOAuthGitLab(id: string, credential: CredentialOAuthGitLab): void {
    const comptes = this.lire()
    const compte = comptes.comptes[id]
    if (!compte || compte.fournisseur !== 'gitlab') {
      throw new Error('Compte GitLab inconnu')
    }
    this.credentialsSession.set(id, credential)
    if (!this.chiffreur.disponible()) return
    compte.oauth = {
      accessTokenChiffre: this.chiffreur.chiffre(credential.accessToken),
      refreshTokenChiffre: this.chiffreur.chiffre(credential.refreshToken),
      expiresAt: credential.expiresAt,
      scopes: credential.scopes,
      rotationneeLe: credential.rotationneeLe,
    }
    ecrireJsonAtomique(this.fichier, comptes)
  }

  /** Retire le credential OAuth ; les destinations et miroirs sont conservés. */
  oublierCredentialOAuthGitLab(id: string): void {
    const comptes = this.lire()
    const compte = comptes.comptes[id]
    if (!compte || compte.fournisseur !== 'gitlab') return
    delete compte.oauth
    this.credentialsSession.delete(id)
    ecrireJsonAtomique(this.fichier, comptes)
  }

  motDePasseDisponible(id: string): boolean {
    return this.motDePasse(id) !== null
  }

  credentialOAuthGitLabDisponible(id: string): boolean {
    return this.credentialOAuthGitLab(id) !== null
  }

  memoriserMotDePasse(id: string, motDePasse: string): void {
    const comptes = this.lire()
    const config = comptes.comptes[id]
    if (!config || config.fournisseur !== 'webdav') {
      throw new Error('Compte distant inconnu')
    }
    this.secretsSession.set(id, motDePasse)
    if (!this.chiffreur.disponible()) return
    config.motDePasseChiffre = this.chiffreur.chiffre(motDePasse)
    ecrireJsonAtomique(this.fichier, comptes)
  }

  enregistrer(params: {
    urlServeur: string
    utilisateur: string
    motDePasse: string
  }): ConfigCorpusDistant {
    const urlServeur = canoniserUrlServeur(params.urlServeur)
    const utilisateur = params.utilisateur.trim()
    const id = idDeCorpus(urlServeur, utilisateur)
    const comptes = this.lire()
    const config: ConfigCorpusDistant = {
      fournisseur: 'webdav',
      id,
      urlServeur,
      utilisateur,
      ...(this.chiffreur.disponible()
        ? { motDePasseChiffre: this.chiffreur.chiffre(params.motDePasse) }
        : {}),
    }
    this.secretsSession.set(id, params.motDePasse)
    comptes.comptes[id] = config
    ecrireJsonAtomique(this.fichier, comptes)
    return config
  }

  /** Enregistre un compte GitLab et son credential OAuth, chiffrés s'il le poste le permet. */
  enregistrerCompteGitLab(params: {
    urlInstance: string
    utilisateur: string
    credential: CredentialOAuthGitLab
  }): ConfigCompteGitLab {
    const urlInstance = canoniserUrlInstanceGitLab(params.urlInstance)
    const utilisateur = params.utilisateur.trim()
    if (!utilisateur) throw new Error('Identité GitLab manquante.')
    const id = idDeCompteGitLab(urlInstance, utilisateur)
    const fichier = this.lire()
    const config: ConfigCompteGitLab = {
      fournisseur: 'gitlab',
      id,
      urlInstance,
      utilisateur,
      ...(this.chiffreur.disponible()
        ? { oauth: this.persisterCredential(params.credential) }
        : {}),
    }
    this.credentialsSession.set(id, params.credential)
    fichier.comptes[id] = config
    ecrireJsonAtomique(this.fichier, fichier)
    return config
  }

  private persisterCredential(credential: CredentialOAuthGitLab): CredentialOAuthPersiste {
    return {
      accessTokenChiffre: this.chiffreur.chiffre(credential.accessToken),
      refreshTokenChiffre: this.chiffreur.chiffre(credential.refreshToken),
      expiresAt: credential.expiresAt,
      scopes: credential.scopes,
      rotationneeLe: credential.rotationneeLe,
    }
  }

  enregistrerDestinationGitLab(params: {
    compteId: string
    projetId: number
    nomProjet: string
    branche: string
    racine?: string
  }): ConfigDestinationGitLab {
    const fichier = this.lire()
    const compte = fichier.comptes[params.compteId]
    if (!compte || compte.fournisseur !== 'gitlab') {
      throw new Error('Compte GitLab inconnu.')
    }
    if (!Number.isSafeInteger(params.projetId) || params.projetId <= 0) {
      throw new Error('Identifiant de projet GitLab invalide.')
    }
    const branche = params.branche.trim()
    if (!branche) throw new Error('Branche GitLab manquante.')
    const racine = normaliserRacineGitLab(params.racine ?? '')
    const id = idDeDestinationGitLab({
      compteId: compte.id,
      projetId: params.projetId,
      branche,
      racine,
    })
    const config: ConfigDestinationGitLab = {
      fournisseur: 'gitlab',
      id,
      compteId: compte.id,
      projetId: params.projetId,
      nomProjet: params.nomProjet.trim(),
      branche,
      racine,
    }
    fichier.destinationsGitLab[id] = config
    ecrireJsonAtomique(this.fichier, fichier)
    return config
  }

  /** Élimine les secrets lisibles qui ne reposent pas sur un trousseau OS.
   *  Ils restent disponibles en mémoire ou sont rechiffrés si possible. */
  assainirSecretsPersistes(): void {
    const comptes = this.lire()
    const stockageSecurise = this.chiffreur.disponible()
    let modifie = false
    for (const config of Object.values(comptes.comptes)) {
      if (config.fournisseur === 'gitlab') {
        if (this.assainirCredentialPersiste(config, stockageSecurise)) modifie = true
        continue
      }
      const chiffre = config.motDePasseChiffre
      if (!chiffre) continue
      const obfusque = chiffre.startsWith('b64:')
      if (!obfusque && stockageSecurise) continue
      try {
        const clair = this.chiffreur.dechiffre(chiffre)
        this.secretsSession.set(config.id, clair)
        if (stockageSecurise) {
          config.motDePasseChiffre = this.chiffreur.chiffre(clair)
        } else {
          delete config.motDePasseChiffre
        }
        modifie = true
      } catch {
        if (obfusque) {
          delete config.motDePasseChiffre
          modifie = true
        }
      }
    }
    if (modifie) ecrireJsonAtomique(this.fichier, comptes)
  }

  /** Même traitement pour un credential OAuth : rien de lisible ne subsiste
   *  hors du trousseau OS, et un secret illisible est retiré. */
  private assainirCredentialPersiste(
    compte: ConfigCompteGitLab,
    stockageSecurise: boolean,
  ): boolean {
    const oauth = compte.oauth
    if (!oauth) return false
    const obfusque = oauth.accessTokenChiffre.startsWith('b64:')
    if (!obfusque && stockageSecurise) return false
    try {
      const credential = credentialDepuisJson(JSON.stringify({
        accessToken: this.chiffreur.dechiffre(oauth.accessTokenChiffre),
        refreshToken: this.chiffreur.dechiffre(oauth.refreshTokenChiffre),
        expiresAt: oauth.expiresAt,
        scopes: oauth.scopes,
        rotationneeLe: oauth.rotationneeLe,
      }))
      if (!credential) {
        delete compte.oauth
        return true
      }
      this.credentialsSession.set(compte.id, credential)
      if (!stockageSecurise) {
        delete compte.oauth
        return true
      }
      compte.oauth = {
        accessTokenChiffre: this.chiffreur.chiffre(credential.accessToken),
        refreshTokenChiffre: this.chiffreur.chiffre(credential.refreshToken),
        expiresAt: credential.expiresAt,
        scopes: credential.scopes,
        rotationneeLe: credential.rotationneeLe,
      }
      return true
    } catch {
      if (obfusque) {
        delete compte.oauth
        return true
      }
      return false
    }
  }

  oublier(id: string): void {
    const comptes = this.lire()
    delete comptes.comptes[id]
    this.secretsSession.delete(id)
    this.credentialsSession.delete(id)
    ecrireJsonAtomique(this.fichier, comptes)
  }

  oublierDestinationGitLab(id: string): void {
    const comptes = this.lire()
    delete comptes.destinationsGitLab[id]
    ecrireJsonAtomique(this.fichier, comptes)
  }
}

function normaliserEncodageUrl(composant: string): string {
  return composant.replace(/%[0-9a-f]{2}/gi, (echappement) => {
    const valeur = Number.parseInt(echappement.slice(1), 16)
    const caractere = String.fromCharCode(valeur)
    return /^[A-Za-z0-9._~-]$/.test(caractere)
      ? caractere
      : `%${echappement.slice(1).toUpperCase()}`
  })
}

/** Forme stable de l'URL utilisée pour identifier un corpus distant. */
export function canoniserUrlServeur(urlServeur: string): string {
  const brut = urlServeur.trim()
  try {
    const url = new URL(brut)
    const chemin = normaliserEncodageUrl(url.pathname).replace(/\/+$/, '')
    const recherche = normaliserEncodageUrl(url.search)
    return `${url.origin}${chemin}${recherche}`
  } catch {
    return brut.replace(/\/+$/, '')
  }
}

/** Id stable d'un compte distant, dérivé de toute son URL et de l'utilisateur. */
export function idDeCorpus(urlServeur: string, utilisateur: string): string {
  const identite = `${canoniserUrlServeur(urlServeur)}\0${utilisateur.trim()}`
  return idStable(identite)
}

export function canoniserUrlInstanceGitLab(urlInstance: string): string {
  const url = new URL(urlInstance.trim())
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Adresse GitLab invalide.')
  }
  const hoteLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && hoteLocal)) {
    throw new Error('Une adresse GitLab HTTPS est requise.')
  }
  const chemin = normaliserEncodageUrl(url.pathname).replace(/\/+$/, '')
  return `${url.origin}${chemin}`
}

export function idDeCompteGitLab(urlInstance: string, utilisateur: string): string {
  const identite = utilisateur.trim()
  if (!identite) throw new Error('Identité GitLab manquante.')
  return idStable(
    `gitlab\0${canoniserUrlInstanceGitLab(urlInstance)}\0${identite}`,
  )
}

export function idDeDestinationGitLab(params: {
  compteId: string
  projetId: number
  branche: string
  racine?: string
}): string {
  const branche = params.branche.trim()
  if (!branche) throw new Error('Branche GitLab manquante.')
  const racine = normaliserRacineGitLab(params.racine ?? '')
  return idStable(
    `gitlab-destination\0${params.compteId}\0${params.projetId}\0${branche}\0${racine}`,
  )
}

export function normaliserRacineGitLab(racine: string): string {
  const propre = racine.trim().replace(/\/+$/, '')
  if (propre === '') return ''
  if (
    propre.startsWith('/') ||
    propre.includes('\\') ||
    propre.split('/').some((segment) => segment === '.' || segment === '..' || !segment)
  ) {
    throw new Error('Racine GitLab invalide.')
  }
  return propre
}

function idStable(identite: string): string {
  return `sha256-${createHash('sha256').update(identite, 'utf8').digest('base64url')}`
}

/** Met à jour les raccourcis du profil. Les anciens miroirs restent isolés afin
 *  que le premier pull avec le nouvel identifiant reparte d'une copie vide. */
export function migrerReferencesProfil(
  dirUserData: string,
  migrations: MigrationIdCorpus[],
): void {
  if (migrations.length === 0) return
  const fichier = join(dirUserData, 'settings.json')
  if (!existsSync(fichier)) return
  let lu: unknown
  try {
    lu = JSON.parse(readFileSync(fichier, 'utf8'))
  } catch {
    return
  }
  if (!lu || typeof lu !== 'object' || Array.isArray(lu)) return
  const settings = lu as Record<string, unknown>
  if (!Array.isArray(settings.recentsDistant)) return
  const nouveauxIds = new Map(migrations.map((m) => [m.ancienId, m.nouvelId]))
  settings.recentsDistant = [
    ...new Set(
      settings.recentsDistant
        .filter((id): id is string => typeof id === 'string')
        .map((id) => nouveauxIds.get(id) ?? id),
    ),
  ]
  ecrireJsonAtomique(fichier, settings)
}

/** Coffre pré-branché sur le vrai `safeStorage` d'Electron. */
export function coffreReel(dirUserData: string): CoffreComptes {
  // eslint-disable-next-line @typescript-eslint/no-var-requires -- import paresseux : ce module n'est chargé que dans Electron.
  const { safeStorage } = require('electron') as typeof import('electron')
  const disponible = (): boolean => {
    if (!safeStorage.isEncryptionAvailable()) return false
    if (process.platform !== 'linux') return true
    return ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(
      safeStorage.getSelectedStorageBackend(),
    )
  }
  const chiffreur: Chiffreur = {
    disponible,
    chiffre: (clair) => 'ss:' + safeStorage.encryptString(clair).toString('base64'),
    dechiffre: (chiffre) =>
      chiffre.startsWith('ss:')
        ? safeStorage.decryptString(Buffer.from(chiffre.slice(3), 'base64'))
        : chiffre.startsWith('b64:')
          ? Buffer.from(chiffre.slice(4), 'base64').toString('utf8')
          : safeStorage.decryptString(Buffer.from(chiffre, 'base64')),
  }
  const fichier = join(dirUserData, 'comptes-distant.json')
  const coffre = new CoffreComptes(
    fichier,
    chiffreur,
    (migrations) => migrerReferencesProfil(dirUserData, migrations),
  )
  coffre.lister()
  if (existsSync(fichier)) chmodSync(fichier, 0o600)
  coffre.assainirSecretsPersistes()
  return coffre
}
