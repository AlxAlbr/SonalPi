/**
 *  Coffre du compte distant — URL serveur + login + MOT DE PASSE D'APPLICATION
 *  (jamais le principal : révocable individuellement, seul accepté en Basic
 *  auth quand la 2FA est active).
 *
 *  Le secret est chiffré via `safeStorage` d'Electron (clé du trousseau OS) ;
 *  le fichier sur disque ne contient jamais le mot de passe en clair.
 *  Les primitives de chiffrement sont INJECTABLES pour les tests (hors Electron,
 *  safeStorage n'existe pas) — la logique reste testée telle quelle.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Un corpus distant configuré. Son URL est saisie ou choisie par navigation
 *  WebDAV ; elle est propre à chaque compte Nextcloud. */
export interface ConfigCorpusDistant {
  /** Id stable du compte distant, dérivé de l'URL complète et de l'utilisateur. */
  id: string
  urlServeur: string // racine DAV du corpus, sans barre finale
  utilisateur: string
  motDePasseChiffre: string // préfixé `ss:` (trousseau) ou `b64:` (repli) + base64
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
  writeFileSync(temporaire, JSON.stringify(valeur, null, 2), 'utf8')
  renameSync(temporaire, fichier)
}

/** Primitives injectables — implémentation réelle : `safeStorage` d'Electron. */
export interface Chiffreur {
  chiffre(clair: string): string
  dechiffre(chiffre: string): string
}

export class CoffreComptes {
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

  /** Mot de passe DÉCHIFFRÉ — process main uniquement, jamais renvoyé au
   *  renderer (le renderer ne connaît que les métadonnées non secrètes). */
  motDePasse(id: string): string | null {
    const c = this.lire().comptes[id]
    if (!c) return null
    try {
      return this.chiffreur.dechiffre(c.motDePasseChiffre)
    } catch {
      return null // plateforme changée / trousseau perdu → reconnexion demandée
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
      motDePasseChiffre: this.chiffreur.chiffre(params.motDePasse),
    }
    comptes.comptes[id] = config
    ecrireJsonAtomique(this.fichier, comptes)
    return config
  }

  oublier(id: string): void {
    const comptes = this.lire()
    delete comptes.comptes[id]
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

/** Coffre pré-branché sur le vrai `safeStorage` (appelé depuis le main).
 *
 *  REPLI DOCUMENTÉ : sans trousseau système (Linux sans gnome-keyring/kwallet,
 *  WSLg, certains conteneurs), `safeStorage` est indisponible — on ne bloque
 *  pas l'application pour autant. Le secret est alors OBFUSQUÉ en base64.
 *  Chaque valeur est AUTO-DESCRITIVE (`ss:` = chiffrement trousseau, `b64:` =
 *  repli) : le déchiffrement suit le préfixe, donc un compte enregistré quand
 *  le trousseau était là reste lisible même s'il disparaît ensuite (et
 *  réciproquement) ; les valeurs sans préfixe sont l'héritage d'une ancienne
 *  version du format et partent du principe safeStorage. */
export function coffreReel(dirUserData: string): CoffreComptes {
  // eslint-disable-next-line @typescript-eslint/no-var-requires -- import paresseux : ce module n'est chargé que dans Electron
  const { safeStorage } = require('electron') as typeof import('electron')
  const chiffreur: Chiffreur = {
    chiffre: (clair) =>
      safeStorage.isEncryptionAvailable()
        ? 'ss:' + safeStorage.encryptString(clair).toString('base64')
        : 'b64:' + Buffer.from(clair, 'utf8').toString('base64'),
    dechiffre: (chiffre) =>
      chiffre.startsWith('ss:')
        ? safeStorage.decryptString(Buffer.from(chiffre.slice(3), 'base64'))
        : chiffre.startsWith('b64:')
          ? Buffer.from(chiffre.slice(4), 'base64').toString('utf8')
          : // Héritage d'une ancienne version du format (sans préfixe) :
            // chiffré par safeStorage.
            safeStorage.decryptString(Buffer.from(chiffre, 'base64')),
  }
  const coffre = new CoffreComptes(
    join(dirUserData, 'comptes-distant.json'),
    chiffreur,
    (migrations) => migrerReferencesProfil(dirUserData, migrations),
  )
  coffre.lister()
  return coffre
}
