/**
 * La PRÉSENCE (best effort).
 *
 * `presence/<userId>-<machineId>.json` (`{ userId, machineId, entretienOuvert,
 * refreshedAt }`), `PUT` toutes les 60 s, entrées > 10 min considérées mortes.
 * Purement INFORMATIF : badges « ouvert par Olivier » sur les cartes et les
 * lignes de la table de données. JAMAIS utilisé pour décider — la décision,
 * c'est le verrou. En variante files_lock, l'essentiel (qui tient quoi) vient
 * déjà du PROPFIND ; la présence n'ajoute que « consulte sans verrou ».
 *
 * Le dossier `presence/` est exclu du contenu par le miroir
 * (`DOSSIERS_HORS_CONTENU`) : rien ne transite dans la copie locale, on lit le
 * serveur directement. Purge « > 10 min » = FILTRAGE à la lecture (on ne
 * supprime pas les fichiers des autres) ; nos propres fichiers sont écrasés à
 * chaque battement.
 */

import type { ClientWebDAV } from '../webdav/client'
import type { IdentiteSession } from './sessions'
import type { PresencePublic } from '../../shared/distant'

/** Période du battement de présence : 60 s. */
export const PERIODE_PRESENCE_MS = 60_000
/** Au-delà, une présence est morte (poste éteint sans nettoyage possible —
 *  il n'y a rien à libérer, contrairement à un verrou). */
export const PRESENCE_PERIMEE_MS = 10 * 60_000

export class PresenceDistante {
  private minuteur: ReturnType<typeof setInterval> | null = null
  private entretienOuvert: string | null = null

  constructor(
    private readonly client: ClientWebDAV,
    private readonly identite: () => IdentiteSession,
  ) {}

  /** Notre fichier : UN par poste (`<userId>-<machineId>`), jamais par session
   *  — la présence dit « ce poste consulte », elle survit aux relancements. */
  cheminPropre(): string {
    const i = this.identite()
    return `presence/${i.userId}-${i.machineId}.json`
  }

  /** L'entretien actuellement ouvert sur CE poste (null = aucun / écran Corpus).
   *  Appelé par le renderer à chaque ouverture/fermeture — PUT immédiat pour
   *  que le badge apparaisse sans attendre le prochain battement. */
  async noterEntretienOuvert(id: string | null): Promise<void> {
    if (this.entretienOuvert === id) return
    this.entretienOuvert = id
    await this.battre()
  }

  /** Démarre le battement périodique (une présence par minute). */
  demarrer(): void {
    if (this.minuteur) return
    void this.battre() // première présence tout de suite
    this.minuteur = setInterval(() => {
      void this.battre()
    }, PERIODE_PRESENCE_MS)
    ;(this.minuteur as unknown as { unref?: () => void }).unref?.()
  }

  arreter(): void {
    if (this.minuteur) clearInterval(this.minuteur)
    this.minuteur = null
  }

  /** Le dossier `presence/` n'existe pas sur un serveur vierge — et un PUT
   *  WebDAV ne crée JAMAIS les collections parents (409 Conflict). On le crée
   *  une fois par session ; 405 (= existe déjà) et consorts sont tolérés.
   *  Les bancs mémoire créent les dossiers implicitement, les serveurs réels
   *  non. */
  private collectionPrete = false
  private async assurerCollection(): Promise<void> {
    if (this.collectionPrete) return
    try {
      await this.client.mkcol('presence')
    } catch {
      /* existe déjà / refusé : le PUT suivant dira la vérité */
    }
    this.collectionPrete = true
  }

  /** Publie NOTRE présence. Best effort : un échec réseau est silencieux (le
   *  badge des autres disparaîtra de lui-même après péremption). */
  async battre(): Promise<void> {
    try {
      await this.assurerCollection()
      const i = this.identite()
      await this.client.putTexte(
        this.cheminPropre(),
        JSON.stringify({
          userId: i.userId,
          machineId: i.machineId,
          entretienOuvert: this.entretienOuvert,
          refreshedAt: new Date().toISOString(),
        }),
      )
    } catch {
      /* réseau : tant pis, best effort */
    }
  }

  /** Les présences VIVANTES des AUTRES postes (> 10 min = périmée, nous-mêmes
   *  exclus). Dossier absent (404) → []. Erreur réseau → [] (les badges de
   *  présence ne valent jamais une exception). */
  async lister(): Promise<PresencePublic[]> {
    return this.listerInterne().catch(() => [])
  }

  private async listerInterne(): Promise<PresencePublic[]> {
    let entrees
    try {
      entrees = await this.client.propfind('presence')
    } catch (e) {
      // 404 : personne n'a encore publié de présence — normal et bénin.
      if ((e as { statut?: number }).statut === 404) return []
      throw e
    }
    const moi = `${this.identite().userId}-${this.identite().machineId}`
    const limite = Date.now() - PRESENCE_PERIMEE_MS
    const vivantes: PresencePublic[] = []
    for (const e of entrees) {
      // Le chemin renvoyé par PROPFIND est relatif à la collection interrogée
      // (`<user>-<machine>.json`) ; on tolère aussi la forme préfixée.
      const nom = /^(?:presence\/)?(.+)\.json$/.exec(e.chemin)
      if (!nom || nom[1] === moi) continue
      try {
        // PROPFIND donne un chemin relatif à la collection ; le GET part de la
        // racine DAV → re-préfixer.
        const p = JSON.parse(
          await this.client.getTexte(`presence/${nom[1]}.json`),
        ) as PresencePublic
        if (typeof p.userId !== 'string') continue
        if (Date.parse(p.refreshedAt) < limite) continue // périmée : ignorée
        vivantes.push({
          userId: p.userId,
          machineId: p.machineId ?? nom[1],
          entretienOuvert: p.entretienOuvert ?? null,
          refreshedAt: p.refreshedAt,
        })
      } catch {
        /* fichier illisible/corrompu : ignoré (best effort) */
      }
    }
    return vivantes
  }
}
