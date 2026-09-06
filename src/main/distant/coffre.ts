/**
 *  Coffre du compte distant — URL serveur + login + MOT DE PASSE D'APPLICATION
 *  (jamais le principal : révocable individuellement, seul accepté en Basic
 *  auth quand la 2FA est active).
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

/** Un corpus distant configuré. Son URL est saisie ou choisie par navigation
 *  WebDAV ; elle est propre à chaque compte Nextcloud. */
export interface ConfigCorpusDistant {
  /** Id stable du compte distant, dérivé de l'URL complète et de l'utilisateur. */
  id: string
  urlServeur: string // racine DAV du corpus, sans barre finale
  utilisateur: string
  /** Absent lorsque le poste ne fournit pas de stockage sécurisé. */
  motDePasseChiffre?: string
}

interface FichierComptesV1 {
  formatVersion: 1
  comptes: Record<string, ConfigCorpusDistant>
}

interface FichierComptes {
  formatVersion: 2
  comptes: Record<string, ConfigCorpusDistant> // clé = id de corpus
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

  constructor(
    private readonly fichier: string,
    private readonly chiffreur: Chiffreur,
    private readonly migrerReferences: (migrations: MigrationIdCorpus[]) => void = () => undefined,
  ) {}

  private lire(): FichierComptes {
    if (!existsSync(this.fichier)) return { formatVersion: 2, comptes: {} }
    let lu: unknown
    try {
      lu = JSON.parse(readFileSync(this.fichier, 'utf8'))
    } catch {
      throw new Error('Le coffre des comptes distants est corrompu.')
    }
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) {
      throw new Error('Le coffre des comptes distants est invalide.')
    }
    const f = lu as FichierComptes | FichierComptesV1
    if (!f.comptes || typeof f.comptes !== 'object' || Array.isArray(f.comptes)) {
      throw new Error('Le coffre des comptes distants est invalide.')
    }
    const version = Number(f.formatVersion)
    if (version === 2) return f as FichierComptes
    if (version === 1) return this.migrerV1(f as FichierComptesV1)
    throw new Error(`Version de coffre distant non supportée : ${String(version)}`)
  }

  private migrerV1(f: FichierComptesV1): FichierComptes {
    const comptes: Record<string, ConfigCorpusDistant> = {}
    const migrations: MigrationIdCorpus[] = []
    for (const [ancienId, ancienCompte] of Object.entries(f.comptes)) {
      const urlServeur = canoniserUrlServeur(ancienCompte.urlServeur)
      const utilisateur = ancienCompte.utilisateur.trim()
      const nouvelId = idDeCorpus(urlServeur, utilisateur)
      if (comptes[nouvelId]) {
        throw new Error(`Plusieurs comptes distants correspondent au même identifiant : ${nouvelId}`)
      }
      comptes[nouvelId] = { ...ancienCompte, id: nouvelId, urlServeur, utilisateur }
      migrations.push({ ancienId, nouvelId })
    }
    this.migrerReferences(migrations)
    const migre: FichierComptes = { formatVersion: 2, comptes }
    ecrireJsonAtomique(this.fichier, migre)
    return migre
  }

  lister(): ConfigCorpusDistant[] {
    return Object.values(this.lire().comptes)
  }

  stockageSecuriseDisponible(): boolean {
    return this.chiffreur.disponible()
  }

  /** Mot de passe déchiffré — process main uniquement, jamais renvoyé au
   *  renderer. Il est gardé en mémoire jusqu'à la fermeture de l'application. */
  motDePasse(id: string): string | null {
    if (this.secretsSession.has(id)) return this.secretsSession.get(id) ?? null
    const chiffre = this.lire().comptes[id]?.motDePasseChiffre
    if (!chiffre) return null
    try {
      const clair = this.chiffreur.dechiffre(chiffre)
      this.secretsSession.set(id, clair)
      return clair
    } catch {
      return null
    }
  }

  motDePasseDisponible(id: string): boolean {
    return this.motDePasse(id) !== null
  }

  memoriserMotDePasse(id: string, motDePasse: string): void {
    const comptes = this.lire()
    const config = comptes.comptes[id]
    if (!config) throw new Error('Compte distant inconnu')
    this.secretsSession.set(id, motDePasse)
    if (this.chiffreur.disponible()) {
      config.motDePasseChiffre = this.chiffreur.chiffre(motDePasse)
      ecrireJsonAtomique(this.fichier, comptes)
    }
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

  /** Élimine les secrets lisibles qui ne reposent pas sur un trousseau OS.
   *  Ils restent disponibles en mémoire ou sont rechiffrés si possible. */
  assainirSecretsPersistes(): void {
    const comptes = this.lire()
    const stockageSecurise = this.chiffreur.disponible()
    let modifie = false
    for (const config of Object.values(comptes.comptes)) {
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

  oublier(id: string): void {
    const comptes = this.lire()
    delete comptes.comptes[id]
    this.secretsSession.delete(id)
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
