/**
 * Coffre du compte distant — URL serveur + login + MOT DE PASSE D'APPLICATION
 * (jamais le principal : révocable individuellement, seul accepté en Basic
 * auth quand la 2FA est active — plan §2 « Compte »).
 *
 * Le secret est chiffré via `safeStorage` d'Electron (clé du trousseau OS) ;
 * le fichier sur disque ne contient jamais le mot de passe en clair.
 * Les primitives de chiffrement sont INJECTABLES pour les tests (hors Electron,
 * safeStorage n'existe pas) — la logique reste testée telle quelle.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Un corpus distant configuré. `cheminDistant` est saisi ou choisi par
 *  navigation WebDAV ; il est PROPRIE À CHAQUE COMPTE (un partage Nextcloud
 *  apparaît à `/remote.php/dav/files/<user>/…` — plan §2). */
export interface ConfigCorpusDistant {
  /** Id stable du corpus distant (dérivé du chemin, ex. encodage base64url). */
  id: string
  urlServeur: string // racine DAV du corpus, sans barre finale
  utilisateur: string
  motDePasseChiffre: string // préfixé `ss:` (trousseau) ou `b64:` (repli) + base64
}

interface FichierComptes {
  formatVersion: 1
  comptes: Record<string, ConfigCorpusDistant> // clé = id de corpus
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
  ) {}

  private lire(): FichierComptes {
    try {
      const f = JSON.parse(readFileSync(this.fichier, 'utf8')) as FichierComptes
      if (f.formatVersion === 1 && f.comptes && typeof f.comptes === 'object') return f
    } catch {
      /* absent/corrompu → coffre vide */
    }
    return { formatVersion: 1, comptes: {} }
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
    id?: string
  }): ConfigCorpusDistant {
    const id = params.id ?? idDeCorpus(params.urlServeur)
    const comptes = this.lire()
    const config: ConfigCorpusDistant = {
      id,
      urlServeur: params.urlServeur.replace(/\/+$/, ''),
      utilisateur: params.utilisateur,
      motDePasseChiffre: this.chiffreur.chiffre(params.motDePasse),
    }
    comptes.comptes[id] = config
    writeFileSync(this.fichier, JSON.stringify(comptes, null, 2), 'utf8')
    return config
  }

  oublier(id: string): void {
    const comptes = this.lire()
    delete comptes.comptes[id]
    writeFileSync(this.fichier, JSON.stringify(comptes, null, 2), 'utf8')
  }
}

/** Id stable dérivé de l'URL : deux utilisateurs configurant le même dossier
 *  partagé partagent l'id (mais pas les identifiants — chacun son compte). */
export function idDeCorpus(urlServeur: string): string {
  return Buffer.from(urlServeur.replace(/\/+$/, ''), 'utf8').toString('base64url').slice(0, 32)
}

/** Coffre pré-branché sur le vrai `safeStorage` (appelé depuis le main).
 *
 *  REPLI DOCUMENTÉ : sans trousseau système (Linux sans gnome-keyring/kwallet,
 *  WSLg, certains conteneurs), `safeStorage` est indisponible — on ne bloque
 *  pas l'application pour autant. Le secret est alors OBFUSQUÉ en base64.
 *  Chaque valeur est AUTO-DESCRITIVE (`ss:` = chiffrement trousseau, `b64:` =
 *  repli) : le déchiffrement suit le préfixe, donc un compte enregistré quand
 *  le trousseau était là reste lisible même s'il disparaît ensuite (et
 *  réciproquement) ; les valeurs sans préfixe sont l'héritage d'avant E4 et
 *  partent du principe safeStorage. */
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
          : // Héritage (pré-E4, sans préfixe) : chiffré par safeStorage.
            safeStorage.decryptString(Buffer.from(chiffre, 'base64')),
  }
  return new CoffreComptes(join(dirUserData, 'comptes-distant.json'), chiffreur)
}
