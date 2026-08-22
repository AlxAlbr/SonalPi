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
 *  faire la différence avec un corpus local, c'est voulu (invariant §15.1).
 *  Le pull d'ouverture livre aussi l'état des verrous (badges fiables §3.1,
 *  sans second aller-retour).
 */
export interface OuvertureDistante extends OuvertureCorpus {
  distant: CompteDistantPublic
  verrous: EntreeVerrouPublic[]
}

/** État PUBLIC d'un fichier verrou — ce que l'UI affiche (« tenu par X depuis
 *  HH:MM », §10). Aucun champ de protocole (sessionId, ttl) ne traverse le pont.
 */
export interface EtatVerrouPublic {
  userId: string
  machineId: string
  acquiredAt: string // ISO
}

/** Une entrée `verrous/` vue au pull, avec son contenu décodé (null = fichier
 *  illisible/corrompu — badge omis, jamais deviné). Les verrous de NOTRE
 *  propre session sont filtrés côté main : un badge « tenu par moi » sur la
 *  carte que je suis en train d'éditer n'apporte rien.
 */
export interface EntreeVerrouPublic {
  chemin: string // « verrous/<id>.lock.json »
  etag: string | null
  contenu: EtatVerrouPublic | null
}

/** Résultat d'un tirage (pull incrémental §3.1). */
export interface ResultatTiragePublic {
  telecharges: string[]
  corbeille: string[]
  verrous: EntreeVerrouPublic[]
  /** Présences vivantes des autres postes (§9, E4) — informatif, jamais
   *  décisionnel. Absent si corpus local. */
  presences?: PresencePublic[]
  date: string
}

/** Présence informative (§9, E4) : qui consulte quoi, SANS valeur décisionnelle
 *  (la décision, c'est le verrou). Une présence > 10 min est morte (filtrée). */
export interface PresencePublic {
  userId: string
  machineId: string
  entretienOuvert: string | null
  refreshedAt: string // ISO
}

/** Verrou orphelin détecté à l'ouverture du corpus (§4.5 — crash sans
 *  libération) : proposé au dialogue « reprendre / abandonner ». */
export interface OrphelinDistant {
  cheminVerrou: string // « verrous/<id>.lock.json »
  id: string // id de l'entretien (extrait du chemin)
  userId: string
  machineId: string
  acquiredAt: string // ISO
}

/** Une copie de DIVERGENCE mise de côté (§6, rétrogradation d'une publication
 *  412) — matière du dialogue de fusion assistée (E3b). Le contenu ne traverse
 *  le pont que sur demande explicite (`lireDivergence`). */
export interface DivergenceDistante {
  chemin: string // « sessions/<id>.divergence-<sessionId>.json » (relatif miroir)
  id: string // id de l'entretien concerné
  sessionId: string // session d'écriture qui a subi la rétrogradation
  date: string // ISO (mtime de la copie — affichage « copie du JJ/MM HH:MM »)
}
