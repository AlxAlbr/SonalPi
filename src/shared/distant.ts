/**
 * Types partagés main ⇄ renderer pour les corpus distants (plan-multiuser.md
 * E0). Types purs uniquement — aucune logique, aucun secret : le mot de passe
 * d'application ne traverse JAMAIS le pont IPC vers le renderer.
 */

import type { OuvertureCorpus } from './format'

/** Profil de capacités mesuré par les sondes de connexion (plan §5.4/§8). */
export interface ProfilCapacites {
  /** Préconditions HTTP honorées (test-and-set possible → variante B). */
  preconditions: boolean
  /** Plugin files_lock détecté (variante A). */
  filesLock: boolean
  notes?: string[]
}

/** Compte distant tel que vu du renderer : JAMAIS de champ secret ici. */
export interface CompteDistantPublic {
  id: string
  urlServeur: string
  utilisateur: string
}

export interface DemandeConnexion {
  /** Racine DAV du corpus, ex. https://nuage.exemple.org/remote.php/dav/files/max/MonCorpus */
  urlServeur: string
  utilisateur: string
  /** Mot de passe d'APPLICATION Nextcloud (jamais le principal). */
  motDePasse: string
}

export type ResultatConnexion =
  | { ok: true; compte: CompteDistantPublic; profil: ProfilCapacites }
  | { ok: false; note: string }

/** Ouverture d'un corpus distant : le corpus vient du MIROIR local
 *  (`userData/miroirs/<id>`) fraîchement tiré — le renderer ne sait pas
 *  faire la différence avec un corpus local, c'est voulu (invariant §15.1). */
export interface OuvertureDistante extends OuvertureCorpus {
  distant: CompteDistantPublic
}

/** Résultat d'un tirage (pull incrémental §3.1). */
export interface ResultatTiragePublic {
  telecharges: string[]
  corbeille: string[]
  verrous: { chemin: string; etag: string | null }[]
  date: string
}
