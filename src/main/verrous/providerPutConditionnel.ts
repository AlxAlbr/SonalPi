/**
 *  Réservations par fichiers WebDAV : le serveur arbitre les demandes concurrentes.
 *  La création exige l'absence du fichier ; chaque renouvellement ou suppression vise une version précise.
 *  Après un refus, une relecture peut fournir une nouvelle version seulement avec la signature attendue.
 *  Aucune relecture ne justifie une écriture ou une suppression sans condition.
 */

import { ClientWebDAV, ErreurHttp } from '../webdav/client'
import type {
  ContenuVerrou,
  ResultatAcquisition,
  ResultatBattement,
  VerrouProvider,
} from './types'
import { estLeNousMeme, estPerime, MARGE_DERIVE_S } from './types'

/** Verrous posés par ce poste et dont la libération a échoué, par serveur et chemin.
 *  Partagé entre instances : chaque opération crée son propre fournisseur. */
const liberationsEnAttente = new Map<string, { sessionId: string; acquiredAt: string }>()

/** Par serveur, décide si un verrou expiré laissé par ce poste peut être retiré avant une nouvelle demande.
 *  Le corpus ouvert l'enregistre : lui seul sait si une opération locale est encore en cours ou à reprendre. */
type AutorisationReprise = (cheminVerrou: string) => boolean
const autorisationsReprise = new Map<string, AutorisationReprise>()

/** Heure de lancement de ce processus.
 *  Une seule instance de SonalPi tourne par profil, et l'identifiant de poste est rangé dans ce profil :
 *  un verrou de ce poste posé avant cette heure vient donc d'un lancement terminé. */
const LANCEMENT_MS = Date.now()

/** Vrai si plus personne ne se sert de ce verrou posé par ce poste :
 *  il a expiré, ou il a été posé par un lancement précédent (fermeture interrompue, plantage). */
export function abandonneParCePoste(v: ContenuVerrou, maintenant = Date.now()): boolean {
  if (estPerime(v, maintenant)) return true
  const pose = Date.parse(v.acquiredAt)
  return Number.isFinite(pose) && pose < LANCEMENT_MS
}

/** Enregistre, ou retire avec null, l'autorisation de reprise pour un serveur. */
export function autoriserRepriseVerrousPerimes(baseUrl: string, autorisation: AutorisationReprise | null): void {
  if (autorisation) autorisationsReprise.set(baseUrl, autorisation)
  else autorisationsReprise.delete(baseUrl)
}

/** Délais entre les tentatives de lecture ou de libération d’un verrou ; modifiables par les tests. */
export const DELAIS_REESSAI_VERROU_MS = [300, 1000, 2500]

/** Réessaie une opération après une panne passagère du serveur ou du réseau. */
async function avecReessais<T>(operation: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await operation()
    } catch (e) {
      const passagere = e instanceof TypeError || (e instanceof ErreurHttp && (e.statut === 0 || e.statut === 423 || e.statut >= 500))
      if (!passagere || i >= DELAIS_REESSAI_VERROU_MS.length) throw e
      await new Promise((r) => setTimeout(r, DELAIS_REESSAI_VERROU_MS[i]))
    }
  }
}

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
  /** cheminVerrou → signature du verrou que nous avons posé, pour le reconnaître à la relecture. */
  private readonly poses = new Map<string, { sessionId: string; acquiredAt: string }>()

  constructor(
    private readonly client: ClientWebDAV,
    /** Notre identité de session — posée à l'ouverture du corpus, JAMAIS
     *  réutilisée entre deux sessions (un verrou n'est pas héritable). */
    private readonly identite: () => { userId: string; machineId: string; sessionId: string },
    private readonly ttlS = 300,
  ) {}

  async acquerir(cheminVerrou: string, nouvelleTentative = false, absences = 0): Promise<ResultatAcquisition> {
    const contenu = contenuVerrou(this.identite(), this.ttlS)
    try {
      const etag = await this.putTexteAvecEtagFiable(cheminVerrou, JSON.stringify(contenu, null, 2), {
        ifNoneMatch: '*',
      })
      // MÉMORISER la garde : battement et libération porteront CET ETag —
      // la version que nous avons créée, preuve de notre détention.
      this.etags.set(cheminVerrou, etag)
      this.poses.set(cheminVerrou, { sessionId: contenu.sessionId, acquiredAt: contenu.acquiredAt })
      return {
        ok: true,
        etag,
        dureeGarantieMs: (this.ttlS + MARGE_DERIVE_S) * 1000,
      }
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 412) {
        // Le refus est acquis ; un verrou que le serveur ne sait pas relire laisse seulement le détenteur inconnu.
        let lisible = true
        const tenuPar = await this.etat(cheminVerrou).catch(() => { lisible = false; return null })
        // Juste après la suppression d'un verrou, certains serveurs refusent encore sa création
        // alors que le fichier n'existe plus : on redemande après une courte pause.
        if (lisible && !tenuPar && absences < DELAIS_REESSAI_VERROU_MS.length) {
          console.warn('[verrou] création refusée alors que le verrou est absent, nouvelle demande :', cheminVerrou)
          await new Promise((r) => setTimeout(r, DELAIS_REESSAI_VERROU_MS[absences]))
          return this.acquerir(cheminVerrou, nouvelleTentative, absences + 1)
        }
        if (!lisible) console.warn('[verrou] création refusée et verrou illisible :', cheminVerrou)
        if (!nouvelleTentative && (await this.retirerLiberationEnAttente(cheminVerrou, tenuPar)
          || await this.retirerPerimeDeCePoste(cheminVerrou, tenuPar))) {
          return this.acquerir(cheminVerrou, true, absences)
        }
        return { ok: false, tenuPar }
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
      console.warn('[verrou] battement refusé, verrou disparu ou illisible :', cheminVerrou)
      this.etags.delete(cheminVerrou)
      return { ok: false }
    }
    if (!estLeNousMeme(actuel, this.identite().sessionId)) {
      console.warn('[verrou] battement refusé, verrou tenu par une autre session :', cheminVerrou, JSON.stringify(actuel))
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
        // Certains serveurs changent la version annoncée juste après l'écriture.
        // Si le verrou porte toujours notre signature, on rafraîchit sur sa version actuelle.
        const etag = await this.battreSurVersionActuelle(cheminVerrou, actuel)
        if (etag) {
          this.etags.set(cheminVerrou, etag)
          return { ok: true, etag, dureeGarantieMs: (this.ttlS + MARGE_DERIVE_S) * 1000 }
        }
        // Notre verrou a été FORCÉ entre-temps, détecté au battement suivant.
        this.etags.delete(cheminVerrou)
        return { ok: false }
      }
      throw e
    }
  }

  private async battreSurVersionActuelle(cheminVerrou: string, lu: ContenuVerrou): Promise<string | null> {
    try {
      return await this.rafraichirSiToujoursNotre(cheminVerrou, lu)
    } catch (e) {
      console.warn('[verrou] battement impossible, le serveur n’a pas répondu :', cheminVerrou, e)
      return null
    }
  }

  /** Réessaie le battement sur la version correspondant à notre signature.
   *  La condition reste obligatoire, même après une relecture. */
  private async rafraichirSiToujoursNotre(cheminVerrou: string, lu: ContenuVerrou): Promise<string | null> {
    const estNotre = (v: ContenuVerrou | null): v is ContenuVerrou =>
      !!v && v.sessionId === lu.sessionId && v.acquiredAt === lu.acquiredAt
    const version = await this.lireVersion(cheminVerrou)
    if (!version?.etag || !estNotre(version.contenu)) return null
    const rafraichi = JSON.stringify({ ...version.contenu, refreshedAt: new Date().toISOString() }, null, 2)
    try {
      return await this.putTexteAvecEtagFiable(cheminVerrou, rafraichi, { ifMatch: version.etag })
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 412) return null
      throw e
    }
  }

  async liberer(cheminVerrou: string): Promise<void> {
    const etag = this.etags.get(cheminVerrou)
    const pose = this.poses.get(cheminVerrou)
    if (!etag && !pose) return // jamais détenu / déjà libéré : idempotent
    try {
      // Après un battement raté, le verrou peut encore porter notre signature :
      // on le retire dans ce cas seulement, au lieu de le laisser bloquer jusqu'à son expiration.
      const retire = etag
        ? await avecReessais(() => this.supprimerNotreVerrou(cheminVerrou, etag, pose))
        : await avecReessais(() => this.supprimerSiToujoursNotre(cheminVerrou, pose!))
      if (!retire && pose) {
        // Relu absent ou étranger alors que nous ne l'avons pas vu supprimé : la lecture peut être périmée.
        // La prochaine demande de ce verrou vérifiera à nouveau sa signature avant de le retirer.
        console.warn('[verrou] libération non confirmée par le serveur, vérification à la prochaine demande :', cheminVerrou)
        liberationsEnAttente.set(this.cle(cheminVerrou), pose)
        this.etags.delete(cheminVerrou)
        this.poses.delete(cheminVerrou)
        return
      }
    } catch (e) {
      // Le verrou reste posé : on retient qu'il est à nous pour le retirer à la prochaine demande.
      console.warn('[verrou] libération impossible, nouvelle tentative à la prochaine demande :', cheminVerrou, e)
      if (pose) liberationsEnAttente.set(this.cle(cheminVerrou), pose)
      throw e
    }
    liberationsEnAttente.delete(this.cle(cheminVerrou))
    this.etags.delete(cheminVerrou)
    this.poses.delete(cheminVerrou)
  }

  /** Vrai si le verrou est supprimé, ou n'est plus le nôtre selon une relecture. */
  private async supprimerNotreVerrou(cheminVerrou: string, etag: string, pose?: { sessionId: string; acquiredAt: string }): Promise<boolean> {
    try {
      await this.client.supprimer(cheminVerrou, etag)
      return true
    } catch (e) {
      if (!(e instanceof ErreurHttp && (e.statut === 412 || e.statut === 404))) throw e
      // Une version annoncée trop tôt peut être périmée.
      // Le nouvel essai lie notre signature à la version de la même réponse.
      if (e.statut === 412 && pose) return await this.supprimerSiToujoursNotre(cheminVerrou, pose)
      return true
    }
  }

  /** Un verrou que ce poste n'a pas réussi à libérer est retiré avant une nouvelle demande.
   *  Seulement s'il porte encore exactement la signature retenue. */
  private async retirerLiberationEnAttente(cheminVerrou: string, tenuPar: ContenuVerrou | null): Promise<boolean> {
    const enAttente = liberationsEnAttente.get(this.cle(cheminVerrou))
    if (!enAttente || !tenuPar || tenuPar.sessionId !== enAttente.sessionId || tenuPar.acquiredAt !== enAttente.acquiredAt) return false
    try {
      if (!(await this.supprimerSiToujoursNotre(cheminVerrou, enAttente))) return false
    } catch (e) {
      if (!(e instanceof ErreurHttp && e.statut === 404)) {
        console.warn('[verrou] retrait du verrou non libéré impossible :', cheminVerrou, e)
        return false
      }
    }
    liberationsEnAttente.delete(this.cle(cheminVerrou))
    return true
  }

  /** Un verrou abandonné par une autre session de ce poste est retiré si le corpus ouvert l'autorise.
   *  Abandonné : expiré, ou posé avant le lancement actuel de SonalPi.
   *  La suppression vise uniquement la version portant encore la signature observée. */
  private async retirerPerimeDeCePoste(cheminVerrou: string, tenuPar: ContenuVerrou | null): Promise<boolean> {
    const moi = this.identite()
    if (!tenuPar || tenuPar.machineId !== moi.machineId || tenuPar.sessionId === moi.sessionId) return false
    if (!abandonneParCePoste(tenuPar)) return false
    if (!autorisationsReprise.get(this.client.config.baseUrl)?.(cheminVerrou)) return false
    try {
      if (!(await this.supprimerSiToujoursNotre(cheminVerrou, tenuPar))) return false
    } catch (e) {
      console.warn('[verrou] retrait de la réservation abandonnée par ce poste impossible :', cheminVerrou, e)
      return false
    }
    console.warn('[verrou] réservation abandonnée par ce poste retirée :', cheminVerrou, JSON.stringify(tenuPar))
    return true
  }

  private cle(cheminVerrou: string) {
    return `${this.client.config.baseUrl}|${cheminVerrou}`
  }

  /** Supprime le verrou s'il porte encore notre signature ; vrai s'il a été supprimé. */
  private async supprimerSiToujoursNotre(cheminVerrou: string, pose: { sessionId: string; acquiredAt: string; refreshedAt?: string }): Promise<boolean> {
    const version = await this.lireVersion(cheminVerrou)
    const actuel = version?.contenu
    if (!actuel || actuel.sessionId !== pose.sessionId || actuel.acquiredAt !== pose.acquiredAt
      || (pose.refreshedAt !== undefined && actuel.refreshedAt !== pose.refreshedAt)) return false
    if (!version.etag) throw new Error('Impossible de vérifier la réservation. Elle est conservée ; réessayez plus tard.')
    try {
      await this.client.supprimer(cheminVerrou, version.etag)
    } catch (e) {
      if (!(e instanceof ErreurHttp && e.statut === 404)) throw e
    }
    return true
  }

  /** Lit ensemble la signature et la version, sans laisser une observation séparée viser un autre détenteur. */
  private async lireVersion(chemin: string): Promise<{ contenu: ContenuVerrou | null; etag: string | null } | null> {
    try {
      const lu = await avecReessais(() => this.client.getTexteAvecEtag(chemin))
      return { contenu: analyserContenu(lu.contenu), etag: lu.etag }
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 404) return null
      throw e
    }
  }

  /** Forçage d'un verrou PÉRIMÉ (l'appelant a vérifié `estPerime`, UI confirmée).
   *  DELETE If-Match <etag observé> PUIS PUT If-None-Match:* — chaque étape
   *  atomique ; si quelqu'un force en même temps, un seul gagne chaque étape. */
  async forcer(cheminVerrou: string): Promise<ResultatAcquisition> {
    const version = await this.lireVersion(cheminVerrou)
    if (version?.contenu) {
      // Course de forçage : l'étape DELETE peut perdre (404 = un autre forçeur
      // a déjà supprimé ; 412 = le verrou a bougé entre observation et garde).
      // Dans les deux cas on POURSUIT vers l'acquisition, seule arbitre finale.
      if (version.etag) {
        try {
          await this.client.supprimer(cheminVerrou, version.etag)
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
      // Certains serveurs ne servent pas un fichier qui vient d'être écrit : quelques nouvelles tentatives.
      brut = await avecReessais(() => this.client.getTexte(cheminVerrou))
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 404) return null
      throw e
    }
    return analyserContenu(brut)
  }

  /* ── Aides internes ─────────────────────────────────────────────────────── */

  /** Retient la version écrite, ou celle d'une relecture au contenu identique.
   *  Une reprise concurrente ne doit jamais nous donner la garde d'un autre détenteur. */
  private async putTexteAvecEtagFiable(
    chemin: string,
    contenu: string,
    options: Parameters<ClientWebDAV['putTexte']>[2],
  ): Promise<string> {
    const etagReponse = await this.client.putTexte(chemin, contenu, options)
    if (etagReponse) return etagReponse
    const relu = await avecReessais(() => this.client.getTexteAvecEtag(chemin))
    if (!relu.etag || relu.contenu !== contenu) throw new ErreurHttp(500, 'Réservation écrite sans version vérifiable')
    return relu.etag
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
