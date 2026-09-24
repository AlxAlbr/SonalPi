/**
 *  Variante A du verrou — files_lock natif Nextcloud.
 *  Sélectionnée AUTOMATIQUEMENT quand la sonde capabilities dit
 *  `files.locking` présent : l'utilisateur ne choisit rien. Derrière le
 *  même contrat `VerrouProvider` que la variante PUT conditionnel — le
 *  protocole de session est inchangé, seul le provider diffère.
 *
 *  Différences de nature avec la variante B :
 *   - le verrou porte sur LE FICHIER DE DONNÉES lui-même
 *     (`entretiens/<id>.json`), pas sur un fichier annexe dans `verrous/` ;
 *   - il est VISIBLE dans l'UI web Nextcloud (cadenas) et IMPOSÉ par le
 *     serveur (PUT/DELETE d'un tiers → 423, vérifié réel) — la reprise après
 *     écrasement ne devrait plus jamais se déclencher ;
 *   - l'identité du détenteur est l'utilisateur NEXTCLOUD, pas notre sessionId :
 *     deux sessions du MÊME user sur deux postes ne sont pas distinguées
 *     par le serveur. D'où la garde d'acquisition ci-dessous (refus si déjà
 *     verrouillé, même par « nous ») et le JOURNAL LOCAL des verrous tenus
 *     (couche session) pour la détection des orphelins après crash.
 *
 *  Contrat vérifié contre le Nextcloud réel (pile A, 2026-08) :
 *   LOCK + X-User-Lock:1   → 200 / 423 ; re-LOCK même user = battement (200)
 *   UNLOCK + X-User-Lock:1 → 200 libéré / 423 autrui / 412 pas verrouillé
 */

import { ClientWebDAV, ErreurHttp } from '../webdav/client'
import type {
  ContenuVerrou,
  ResultatAcquisition,
  ResultatBattement,
  VerrouProvider,
} from './types'
import { MARGE_DERIVE_S } from './types'

/** TTL affiché/décisionnel quand le serveur n'annonce pas de timeout.
 *  `lock-timeout: 0` = n'expire jamais (défaut files_lock).
 *  La péremption côté app reste calculable via `lock-time`. */
const TTL_PAR_DEFAUT_S = 3600

export class ProviderFilesLock implements VerrouProvider {
  constructor(
    private readonly client: ClientWebDAV,
    /** Notre identité — sert au contenu affiché ; le serveur, lui,
     *  n'enregistre que l'utilisateur Nextcloud. */
    private readonly identite: () => { userId: string; machineId: string; sessionId: string },
  ) {}

  /** Test-and-set : refus si le fichier est DÉJÀ verrouillé, y compris par le même utilisateur Nextcloud via une AUTRE session/poste.
   *  Le serveur ne distingue pas ; notre garde protège le mono-écrivain intra-utilisateur.
   *  Puis LOCK atomique ; 423 = perdu la course. */
  async acquerir(cheminVerrou: string): Promise<ResultatAcquisition> {
    const dejaLa = await this.etat(cheminVerrou)
    if (dejaLa) return { ok: false, tenuPar: dejaLa }
    try {
      await this.client.verrouiller(cheminVerrou)
      return {
        ok: true,
        etag: 'files-lock',
        dureeGarantieMs: (TTL_PAR_DEFAUT_S + MARGE_DERIVE_S) * 1000,
      }
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 423) {
        return { ok: false, tenuPar: await this.etat(cheminVerrou) }
      }
      throw e
    }
  }

  /** Battement = re-LOCK (renouvelle `lock-time`, vérifié réel).
   *  Échec → le verrou n'est plus le nôtre (libéré/repris) → rétrogradation. */
  async battre(cheminVerrou: string): Promise<ResultatBattement> {
    try {
      await this.client.verrouiller(cheminVerrou)
      return {
        ok: true,
        dureeGarantieMs: (TTL_PAR_DEFAUT_S + MARGE_DERIVE_S) * 1000,
      }
    } catch (e) {
      if (e instanceof ErreurHttp && (e.statut === 423 || e.statut === 404)) {
        return { ok: false }
      }
      throw e // réseau : le TTL + marge tolère plusieurs échecs consécutifs
    }
  }

  /** Libération conditionnelle — idempotent (412 = déjà parti). */
  async liberer(cheminVerrou: string): Promise<void> {
    try {
      await this.client.deverrouiller(cheminVerrou)
    } catch (e) {
      if (e instanceof ErreurHttp && (e.statut === 412 || e.statut === 404)) return
      throw e
    }
  }

  /** Qui tient le verrou (null = libre), lu sur les props PROPFIND. */
  async etat(cheminVerrou: string): Promise<ContenuVerrou | null> {
    const brut = await this.client.etatVerrouNatif(cheminVerrou)
    if (!brut) return null
    const iso = brut.time ? new Date(brut.time * 1000).toISOString() : new Date().toISOString()
    return {
      userId: brut.owner || this.identite().userId,
      machineId: '', // le serveur ne connaît pas les machines
      sessionId: '', // ni les sessions — voir journal local pour les orphelins
      acquiredAt: iso,
      refreshedAt: iso,
      ttl: brut.timeout && brut.timeout > 0 ? brut.timeout : TTL_PAR_DEFAUT_S,
    }
  }
}
