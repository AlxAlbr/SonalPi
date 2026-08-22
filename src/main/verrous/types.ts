/**
 * Le contrat de VERROU (plan-multiuser.md §4-§6) — ce que tout backend doit
 * fournir pour garantir « un écrivain à la fois ». Le protocole de session ne
 * connaît que cette interface, JAMAIS la variante concrète (invariant §15 :
 * capacités, pas types de transport).
 *
 * Deux implémentations prévues :
 *  - ProviderPutConditionnel (§5, variante B) : verrous/<id>.lock.json créé par
 *    PUT If-None-Match:* — marche sur tout serveur WebDAV correct ;
 *  - ProviderFilesLock (§8, variante A, E2) : LOCK/UNLOCK natifs Nextcloud.
 */

/** Le contenu du fichier verrou (variante B) — l'état que l'UI affiche
 *  (« tenu par X depuis HH:MM »). Identité = §7 : userId affichable,
 *  machineId généré, sessionId ALÉATOIRE PAR OUVERTURE (un verrou n'est jamais
 *  hérité d'une session précédente). */
export interface ContenuVerrou {
  userId: string
  machineId: string
  sessionId: string
  acquiredAt: string // ISO
  refreshedAt: string // ISO
  /** Durée de vie annoncée, en SECONDES (défaut plan §5.3 : 300). */
  ttl: number
}

export type ResultatAcquisition =
  | { ok: true; etag: string }
  /** Refus atomique (le serveur a tranché) : le détenteur est lu pour l'UI. */
  | { ok: false; tenuPar: ContenuVerrou | null }

export interface ResultatBattement {
  /** false = NOTRE verrou a été repris par quelqu'un d'autre (détection de
   *  forçage §5.2) → l'appelant doit se rétrograder en lecture seule. */
  ok: boolean
  etag?: string
}

/** L'interface commune aux deux variantes. `cheminVerrou` est relatif à la
 *  racine DAV (« verrous/ent-abc.lock.json »). */
export interface VerrouProvider {
  /** Test-and-set atomique : exactement UN des deux demandeurs reçoit ok. */
  acquerir(cheminVerrou: string): Promise<ResultatAcquisition>
  /** Preuve de vie ET détection de forçage en un seul appel. */
  battre(cheminVerrou: string): Promise<ResultatBattement>
  /** Libération conditionnelle (idempotent côté app : un échec 412 signifie
   *  qu'on ne détient déjà plus — rien à faire). */
  liberer(cheminVerrou: string): Promise<void>
  /** Qui tient le verrou (null = libre). Sert à l'UI au refus d'acquisition
   *  et aux badges. */
  etat(cheminVerrou: string): Promise<ContenuVerrou | null>
}

/* ── Décisions de péremption — fonctions PURES, table de vérité testée ──────
 * Les horloges n'ont besoin d'être justes qu'à la MINUTE près (plan §1) :
 * marge de dérive généreuse, décisions grossières uniquement.
 * ──────────────────────────────────────────────────────────────────────────*/

/** Marge de dérive horloge (s) : TTL + marge avant de déclarer périmé (§5.3). */
export const MARGE_DERIVE_S = 120
/** Battement toutes les 60 s (§5.3). */
export const PERIODE_BATTEMENT_MS = 60_000
/** Publication périodique par défaut : 5 min (tranché §14.5 : activée). */
export const PERIODE_PUBLICATION_MS = 300_000

/** Un verrou est PÉRIMÉ si refreshedAt + ttl + marge < maintenant.
 *  Pure : les tests injectent des horloges décalées ±10 min. */
export function estPerime(v: ContenuVerrou, maintenantMs: number): boolean {
  const limite = Date.parse(v.refreshedAt) + v.ttl * 1000 + MARGE_DERIVE_S * 1000
  return maintenantMs > limite
}

/** Le verrou observé appartient-il à NOTRE session ? (sessionId aléatoire par
 *  ouverture : même user + même machine mais autre session = AUTRE.) */
export function estLeNousMeme(v: ContenuVerrou, sessionId: string): boolean {
  return v.sessionId === sessionId
}
