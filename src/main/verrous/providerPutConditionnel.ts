/**
 * Variante B du verrou — PUT conditionnel.
 * Marche sur TOUT serveur WebDAV honorant les préconditions (vérifié par sonde
 * à l'ouverture du corpus) : le test-and-set est le serveur, pas nous — deux
 * demandes simultanées, exactement une reçoit 201.
 *
 * Opérations :
 *   Acquérir : PUT verrous/<id>.lock.json + If-None-Match:* → 201 obtenu / 412 tenu
 *   Battre   : même fichier, contenu rafraîchi + If-Match <NOTRE etag mémorisé>
 *              → le battement est à la fois preuve de vie ET détection de
 *              forçage (412 = quelqu'un nous a repris le verrou → rétrogradation)
 *   Libérer  : DELETE + If-Match (idempotent côté app)
 *   Forcer   : DELETE If-Match <etag observé> puis PUT If-None-Match:* — chaque
 *              étape atomique ; deux forçages simultanés → un seul gagne.
 *   Acquérir : PUT verrous/<id>.lock.json + If-None-Match:* → 201 obtenu / 412 tenu
 *   Battre   : même fichier, contenu rafraîchi + If-Match <NOTRE etag mémorisé>
 *              → le battement est à la fois preuve de vie ET détection de
 *              forçage (412 = quelqu'un nous a repris le verrou → rétrogradation)
 *   Libérer  : DELETE + If-Match (idempotent côté app)
 *   Forcer   : DELETE If-Match <etag observé> puis PUT If-None-Match:* — chaque
 *              étape atomique ; deux forçages simultanés → un seul gagne.
 *
 * L'ETag obtenu à l'acquisition est MÉMORISÉ par le provider (par chemin) :
 * toute écriture conditionnelle ultérieure porte CETTE garde — la version que
 * NOUS avons lue, pas une version ré-observée qui masquerait une prise en main
 * concurrente.
 */

import { ClientWebDAV, ErreurHttp } from '../webdav/client'
import type {
  ContenuVerrou,
  ResultatAcquisition,
  ResultatBattement,
  VerrouProvider,
} from './types'
import { estLeNousMeme, MARGE_DERIVE_S } from './types'

/** Fabrique le contenu d'un verrou pour notre session. */
export function contenuVerrou(
  identite: { userId: string; machineId: string; sessionId: string },
  ttlS = 300,
  maintenant = new Date(),
): ContenuVerrou {
  const iso = maintenant.toISOString()
  return { ...identite, acquiredAt: iso, refreshedAt: iso, ttl: ttlS }
}

export class ProviderPutConditionnel implements VerrouProvider {
  /** cheminVerrou → ETag de LA version du verrou que nous détenons. */
  private readonly etags = new Map<string, string>()

  constructor(
    private readonly client: ClientWebDAV,
    /** Notre identité de session — posée à l'ouverture du corpus, JAMAIS
     *  réutilisée entre deux sessions (un verrou n'est pas héritable). */
    private readonly identite: () => { userId: string; machineId: string; sessionId: string },
    private readonly ttlS = 300,
  ) {}

  async acquerir(cheminVerrou: string): Promise<ResultatAcquisition> {
    const contenu = contenuVerrou(this.identite(), this.ttlS)
    try {
      const etag = await this.putTexteAvecEtagFiable(cheminVerrou, JSON.stringify(contenu, null, 2), {
        ifNoneMatch: '*',
      })
      // MÉMORISER la garde : battement et libération porteront CET ETag —
      // la version que nous avons créée, preuve de notre détention.
      this.etags.set(cheminVerrou, etag)
      return {
        ok: true,
        etag,
        dureeGarantieMs: (this.ttlS + MARGE_DERIVE_S) * 1000,
      }
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 412) {
        return { ok: false, tenuPar: await this.etat(cheminVerrou) }
      }
      throw e
    }
  }

  async battre(cheminVerrou: string): Promise<ResultatBattement> {
    const etagDetenu = this.etags.get(cheminVerrou)
    if (!etagDetenu) return { ok: false } // jamais acquis ici → rien à battre
    const actuel = await this.etat(cheminVerrou)
    if (!actuel) {
      // Verrou disparu sous nos pieds (nettoyage serveur ?) → rétrogradation ;
      // la RÉ-acquisition éventuelle est une décision de la couche session.
      this.etags.delete(cheminVerrou)
      return { ok: false }
    }
    if (!estLeNousMeme(actuel, this.identite().sessionId)) {
      this.etags.delete(cheminVerrou) // repris par autrui : notre garde ne sert plus
      return { ok: false }
    }
    try {
      const rafraichi: ContenuVerrou = { ...actuel, refreshedAt: new Date().toISOString() }
      const etag = await this.putTexteAvecEtagFiable(cheminVerrou, JSON.stringify(rafraichi, null, 2), {
        ifMatch: etagDetenu,
      })
      // La garde AVANCE avec le battement : sans ça, la libération suivante
      // porterait un ETag périmé et échouerait en 412 (bug attrapé par le
      // contrat réel — acquire→batte→libère — jamais testé côté mémoire).
      if (etag) this.etags.set(cheminVerrou, etag)
      return {
        ok: true,
        etag,
        dureeGarantieMs: (this.ttlS + MARGE_DERIVE_S) * 1000,
      }
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 412) {
        // Notre verrou a été FORCÉ entre-temps, détecté au battement suivant.
        this.etags.delete(cheminVerrou)
        return { ok: false }
      }
      throw e
    }
  }

  async liberer(cheminVerrou: string): Promise<void> {
    const etag = this.etags.get(cheminVerrou)
    if (!etag) return // jamais détenu / déjà libéré : idempotent
    try {
      await this.client.supprimer(cheminVerrou, etag)
      this.etags.delete(cheminVerrou)
    } catch (e) {
      if (e instanceof ErreurHttp && (e.statut === 412 || e.statut === 404)) {
        this.etags.delete(cheminVerrou) // déjà repris ou déjà parti : rien à faire
        return
      }
      throw e
    }
  }

  /** Forçage d'un verrou PÉRIMÉ (l'appelant a vérifié `estPerime`, UI confirmée).
   *  DELETE If-Match <etag observé> PUIS PUT If-None-Match:* — chaque étape
   *  atomique ; si quelqu'un force en même temps, un seul gagne chaque étape. */
  async forcer(cheminVerrou: string): Promise<ResultatAcquisition> {
    const ancien = await this.etat(cheminVerrou)
    if (ancien) {
      // Course de forçage : l'étape DELETE peut perdre (404 = un autre forçeur
      // a déjà supprimé ; 412 = le verrou a bougé entre observation et garde).
      // Dans les deux cas on POURSUIT vers l'acquisition, seule arbitre finale.
      const etag = await this.etatEtag(cheminVerrou)
      if (etag) {
        try {
          await this.client.supprimer(cheminVerrou, etag)
        } catch (e) {
          if (!(e instanceof ErreurHttp && (e.statut === 404 || e.statut === 412))) throw e
        }
      }
    }
    return this.acquerir(cheminVerrou)
  }

  /** Qui tient le verrou (null = libre). */
  async etat(cheminVerrou: string): Promise<ContenuVerrou | null> {
    let brut: string
    try {
      brut = await this.client.getTexte(cheminVerrou)
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 404) return null
      throw e
    }
    return analyserContenu(brut)
  }

  /* ── Aides internes ─────────────────────────────────────────────────────── */

  /** PUT renvoyant TOUJOURS un ETag fiable : si le serveur n'en expose pas dans
   *  la réponse du PUT (cas rare), il est relu par PROPFIND immédiatement —
   *  la suite du protocole exige une garde non nulle. */
  private async putTexteAvecEtagFiable(
    chemin: string,
    contenu: string,
    options: Parameters<ClientWebDAV['putTexte']>[2],
  ): Promise<string> {
    const etagReponse = await this.client.putTexte(chemin, contenu, options)
    if (etagReponse) return etagReponse
    const relu = await this.etatEtag(chemin)
    if (!relu) throw new ErreurHttp(500, 'Verrou écrit sans ETag récupérable')
    return relu
  }

  /** ETag ACTUEL d'une ressource, observé par PROPFIND (sans télécharger).
   *  NB : les entrées renvoyées sont relatives au dossier interrogé. */
  private async etatEtag(chemin: string): Promise<string | null> {
    const dossier = dossierDe(chemin)
    const nom = nomDe(chemin)
    const entree = (await this.client.propfind(dossier)).find((e) => e.chemin === nom)
    return entree?.etag ?? null
  }
}

/** Décodage défensif d'un fichier verrou : un JSON partiellement conforme est
 *  traité comme « libre » — le nettoyage des orphelins périmés (>24 h) s'occupe
 *  des résidus, jamais la couche session. */
function analyserContenu(brut: string): ContenuVerrou | null {
  try {
    const v = JSON.parse(brut) as Partial<ContenuVerrou>
    if (
      typeof v.userId === 'string' &&
      typeof v.sessionId === 'string' &&
      typeof v.refreshedAt === 'string' &&
      typeof v.ttl === 'number'
    ) {
      return {
        userId: v.userId,
        machineId: typeof v.machineId === 'string' ? v.machineId : '',
        sessionId: v.sessionId,
        acquiredAt: typeof v.acquiredAt === 'string' ? v.acquiredAt : v.refreshedAt,
        refreshedAt: v.refreshedAt,
        ttl: v.ttl,
      }
    }
    return null
  } catch {
    return null
  }
}

function dossierDe(chemin: string): string {
  return chemin.includes('/') ? chemin.slice(0, chemin.lastIndexOf('/')) : ''
}

function nomDe(chemin: string): string {
  return chemin.slice(chemin.lastIndexOf('/') + 1)
}
