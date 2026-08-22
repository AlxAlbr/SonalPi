/**
 * La SESSION D'ÉCRITURE d'un entretien distant (plan-multiuser.md §4) —
 * le cycle complet :
 *
 *   ouvrir  : acquerir le verrou → GET du fichier SERVEUR (la version
 *             d'après-verrou fait foi) → mémoriser son ETag (garde de publication)
 *   écrire  : autosave local (miroir) uniquement — session marquée « sale »
 *   battre  : toutes les 60 s, preuve de vie ; échec → RÉTROGRADATION (§5.2)
 *   publier : toutes les 5 min si sale + « Publier maintenant » — PUT If-Match
 *             <etag serveur> sous verrou TOUJOURS tenu (§4.3)
 *   fermer  : publication finale PUIS déverrouillage — l'ordre est l'invariant
 *             central du protocole (§4.4 : un verrou ne se libère jamais sur un
 *             contenu non publié)
 *
 * La rétrogradation et les publications sont signalées par callback (l'UI
 * s'abonne) ; le renderer reste par ailleurs libre de consulter `etat()`.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { MiroirWebDAV } from '../miroir'
import { ClientWebDAV, ErreurHttp } from '../webdav/client'
import {
  PERIODE_BATTEMENT_MS,
  PERIODE_PUBLICATION_MS,
  type ContenuVerrou,
} from '../verrous/types'
import { ProviderPutConditionnel } from '../verrous/providerPutConditionnel'
import type { EntreeVerrouPublic } from '../../shared/distant'

export interface IdentiteSession {
  userId: string
  machineId: string
  sessionId: string
}

export type EtatSession =
  | { etat: 'aucune' }
  /** Nous tenons le verrou. */
  | { etat: 'a-nous'; dernierPubli: string | null; sale: boolean }
  /** Refus d'acquisition : lecture seule avec détenteur affichable. */
  | { etat: 'tenu-par-autrui'; tenuPar: ContenuVerrou | null }
  /** Notre verrou a été repris/perdu au battement : contenu figé en lecture,
   *  modifications locales à sauvegarder à part (divergence E3). */
  | { etat: 'degrade' }

interface SessionInterne {
  provider: ProviderPutConditionnel
  cheminVerrou: string
  etagServeur: string | null // ETag du FICHIER entretien côté serveur (garde de publication)
  sale: boolean
  dernierPubli: string | null
}

const CHEMIN_ENTRETIEN = (id: string) => `entretiens/${id}.json`

export class SessionsDEntretien {
  private readonly sessions = new Map<string, SessionInterne>()
  private minuteur: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly client: ClientWebDAV,
    private readonly miroir: MiroirWebDAV,
    private readonly identite: () => IdentiteSession,
    /** Notifications vers le renderer (poll côté UI en attendant E4). */
    private readonly onRetrogradation?: (id: string) => void,
    private readonly onPublication?: (id: string, date: string) => void,
  ) {}

  /** Ouvre une session d'écriture : verrou + GET serveur + garde. Idempotent
   *  pour un id déjà tenu par nous (réouverture de la même session). */
  async ouvrir(id: string): Promise<EtatSession> {
    const existante = this.sessions.get(id)
    if (existante) return { etat: 'a-nous', dernierPubli: existante.dernierPubli, sale: existante.sale }

    // Un seul provider partagé (il mémorise les ETags par chemin), identité
    // propre à CETTE ouverture d'app.
    const provider = new ProviderPutConditionnel(this.client, this.identite)
    const chemin = `verrous/${id}.lock.json`
    const acquisition = await provider.acquerir(chemin)
    if (!acquisition.ok) {
      return { etat: 'tenu-par-autrui', tenuPar: acquisition.tenuPar }
    }

    // La version d'APRÈS-verrou fait foi : GET serveur écrit dans le miroir
    // (pas de confiance à notre copie locale potentiellement périmée, §4.1).
    const cheminFichier = CHEMIN_ENTRETIEN(id)
    let etagServeur = await this.etagServeurDe(cheminFichier)
    if (etagServeur) {
      const contenu = await this.client.getTexte(cheminFichier)
      this.ecrireLocalFichier(join(this.miroir.dirLocal, cheminFichier), contenu)
      this.miroir.noterEtagPublie(cheminFichier, etagServeur)
    } else {
      // Fichier inconnu du manifeste (créé hors pull ?) : garde nulle → la
      // première publication se fera sans If-Match (création/réécriture franche).
      etagServeur = null
    }

    this.sessions.set(id, {
      provider,
      cheminVerrou: chemin,
      etagServeur,
      sale: false,
      dernierPubli: null,
    })
    this.demarrerMinuteur()
    return { etat: 'a-nous', dernierPubli: null, sale: false }
  }

  /** Marque le contenu local comme non publié (appelé après chaque autosave). */
  noterSale(id: string): void {
    const s = this.sessions.get(id)
    if (s) {
      s.sale = true
      if (!s.dernierPubli) s.dernierPubli = new Date().toISOString()
    }
  }

  /** Publication §4.3 : PUT If-Match sous verrou toujours tenu.
   *  412 → divergence (§6) : copie locale mise de côté, session dégradée ;
   *  JAMAIS d'écrasement silencieux. */
  async publier(id: string): Promise<{ ok: boolean; raison?: string }> {
    const s = this.sessions.get(id)
    if (!s) return { ok: false, raison: 'aucune session' }
    if (!s.sale) return { ok: true }
    const cheminFichier = CHEMIN_ENTRETIEN(id)
    const contenu = readFileSync(join(this.miroir.dirLocal, cheminFichier), 'utf8')
    try {
      const nouveauEtag = await s.provider['client'].putTexte(
        cheminFichier,
        contenu,
        s.etagServeur ? { ifMatch: s.etagServeur } : {},
      )
      const etagFinal = nouveauEtag ?? (await this.etagServeurDe(cheminFichier)) ?? ''
      this.miroir.noterEtagPublie(cheminFichier, etagFinal)
      s.etagServeur = etagFinal || null
      s.sale = false
      s.dernierPubli = new Date().toISOString()
      this.onPublication?.(id, s.dernierPubli)
      return { ok: true }
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 412) {
        // Quelqu'un a contourné le verrou (UI web, forçage) : ne pas écraser.
        await this.degrader(id)
        return { ok: false, raison: 'divergence' }
      }
      throw e // réseau : réessai au prochain tick / « Publier maintenant »
    }
  }

  /** Fermeture §4.4 : publication finale PUIS libération — JAMAIS l'inverse.
   *  Échec RÉSEAU de la publication → le verrou RESTE tenu (le contenu n'est
   *  pas parti ; retenter « Publier » puis refermer). DIVERGENCE (412) → la
   *  dégradation a déjà mis la copie locale de côté et retiré la session :
   *  rien d'autre à faire ici. */
  async fermer(id: string): Promise<void> {
    const s = this.sessions.get(id)
    if (!s) return
    if (s.sale) {
      try {
        const r = await this.publier(id)
        if (!r.ok) return // réseau OU divergence : la session est déjà partie
      } catch {
        return // réseau : rester sous verrou, retenter plus tard
      }
    }
    try {
      await s.provider.liberer(s.cheminVerrou)
    } catch {
      /* serveur injoignable : orphelin > TTL, nettoyage §5.3 à l'ouverture */
    }
    this.sessions.delete(id)
    if (this.sessions.size === 0) this.arreterMinuteur()
  }

  /** État consultable par l'UI (poll). Toute session restant dans la carte est
   *  « à nous » : les refus d'acquisition et les dégradations retirent la
   *  session (ou ne la créent jamais) et sont signalés par callback/retour. */
  etat(id: string): EtatSession {
    const s = this.sessions.get(id)
    if (!s) return { etat: 'aucune' }
    return { etat: 'a-nous', dernierPubli: s.dernierPubli, sale: s.sale }
  }

  /* ── Minuterie unique : battements + publications périodiques ────────────*/

  private demarrerMinuteur(): void {
    if (this.minuteur) return
    this.minuteur = setInterval(() => {
      void this.tic()
    }, PERIODE_BATTEMENT_MS)
    ;(this.minuteur as unknown as { unref?: () => void }).unref?.()
  }

  private arreterMinuteur(): void {
    if (this.minuteur) {
      clearInterval(this.minuteur)
      this.minuteur = null
    }
  }

/** Un tick du minuteur — PUBLIC pour les tests (déterminisme sans attente 60 s). */
  async tic(): Promise<void> {
    const maintenant = Date.now()
    for (const [id, s] of [...this.sessions.entries()]) {
      try {
        const b = await s.provider.battre(s.cheminVerrou)
        if (!b.ok) {
          await this.degrader(id) // repris par autrui → rétrogradation immédiate
          continue
        }
      } catch {
        /* réseau : le TTL + marge tolère plusieurs échecs consécutifs */
        continue
      }
      if (s.sale && s.dernierPubli !== null && maintenant - Date.parse(s.dernierPubli) >= PERIODE_PUBLICATION_MS - 1000) {
        await this.publier(id).catch(() => {})
      }
    }
  }

  /** Rétrogradation (§5.2) : notre verrou a été repris. Le contenu local est
   *  mis de côté hors serveur (divergence, §6) ; la session disparaît —
   *  l'entretien redevient NON éditable (garde store retirée). */
  private async degrader(id: string): Promise<void> {
    const s = this.sessions.get(id)
    if (!s) return
    try {
      const brut = readFileSync(join(this.miroir.dirLocal, CHEMIN_ENTRETIEN(id)), 'utf8')
      const dossierSessions = join(this.miroir.dirLocal, 'sessions')
      mkdirSync(dossierSessions, { recursive: true })
      writeFileSync(
        join(dossierSessions, `${id}.divergence-${this.identite().sessionId}.json`),
        brut,
        'utf8',
      )
    } catch {
      /* rien à mettre de côté */
    }
    this.revoquerEcriture?.(id)
    this.sessions.delete(id)
    if (this.sessions.size === 0) this.arreterMinuteur()
    this.onRetrogradation?.(id)
  }
  revoquerEcriture?: (id: string) => void

  /** Ids des entretiens DONT NOUS tenons le verrou — passés au pull comme
   *  exclusions (le miroir n'écrase jamais une copie de travail sous verrou). */
  idsTenus(): string[] {
    return [...this.sessions.keys()]
  }

  /** Liste des verrous orphelins (crash sans libération) — matière du dialogue
   *  « reprendre / abandonner » (§4.5). Un orphelin = verrou de NOTRE machine
   *  mais d'une AUTRE session (sessionId aléatoire par lancement : un verrou
   *  n'est jamais hérité).
   */
  async orphelins(): Promise<{ cheminVerrou: string; id: string; verrou: ContenuVerrou }[]> {
    const out: { cheminVerrou: string; id: string; verrou: ContenuVerrou }[] = []
    try {
      const liste = await this.client.propfind('verrous')
      for (const e of liste.filter((x) => !x.dossier && x.chemin.endsWith('.lock.json'))) {
        try {
          const v = JSON.parse(await this.client.getTexte(`verrous/${e.chemin}`)) as ContenuVerrou
          if (v.machineId === this.identite().machineId && v.sessionId !== this.identite().sessionId) {
            const m = /^verrous\/(.+)\.lock\.json$/.exec(`verrous/${e.chemin}`)
            if (m) out.push({ cheminVerrou: `verrous/${e.chemin}`, id: m[1], verrou: v })
          }
        } catch {
          /* illisible : ignoré */
        }
      }
    } catch {
      /* pas de dossier verrous : aucun orphelin */
    }
    return out
  }

  /** Abandon explicite d'un orphelin (choix « abandonner » du dialogue §4.5) :
   *  déverrouille SANS publier — la copie locale du miroir reste en place et
   *  repartira en divergence si elle resurgit plus tard (§6).
   */
  async abandonnerOrphelin(cheminVerrou: string): Promise<void> {
    await this.supprimerVerrouOrphelin(cheminVerrou)
  }

  /** Reprise d'un orphelin (choix « reprendre et publier » du dialogue §4.5) :
   *  la copie locale du miroir (dernier autosave avant crash) est publiée sur
   *  le serveur PUIS le verrou libéré — l'ordre invariant §4.4 s'applique ici
   *  aussi. Personne n'a pu écrire entre-temps sans contourner le verrou ; la
   *  garde If-Match couvre ce résidu (412 → divergence, on ne publie pas).
   */
  async reprendreOrphelin(cheminVerrou: string): Promise<{ ok: boolean; raison?: string }> {
    const m = /^verrous\/(.+)\.lock\.json$/.exec(cheminVerrou)
    if (!m) return { ok: false, raison: 'chemin invalide' }
    const id = m[1]
    const cheminFichier = CHEMIN_ENTRETIEN(id)
    let contenu: string
    try {
      contenu = readFileSync(join(this.miroir.dirLocal, cheminFichier), 'utf8')
    } catch {
      return { ok: false, raison: 'pas de copie locale' }
    }
    const etagConnu = this.miroir.etagDistant(cheminFichier) // dernière version que NOUS avons publiée
    const etagActuel = await this.etagServeurDe(cheminFichier)
    // Garde §4.5 : si le serveur ne porte plus la version publiée avant le
    // crash, quelqu'un a écrit DERRIÈRE le verrou (UI web) — divergence, on
    // ne publie pas et on ne libère pas : l'utilisateur tranche.
    if (etagConnu && etagActuel && etagConnu !== etagActuel) {
      return { ok: false, raison: 'divergence' }
    }
    try {
      const nouveauEtag = await this.client.putTexte(
        cheminFichier,
        contenu,
        etagActuel ? { ifMatch: etagActuel } : {},
      )
      const etagFinal = nouveauEtag ?? (await this.etagServeurDe(cheminFichier)) ?? ''
      if (etagFinal) this.miroir.noterEtagPublie(cheminFichier, etagFinal)
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 412) {
        // Le fichier a changé derrière le verrou (contournement pendant le
        // crash) : ne PAS écraser — la copie locale reste dans le miroir.
        return { ok: false, raison: 'divergence' }
      }
      throw e // réseau : l'orphelin reste en place, retenter plus tard
    }
    await this.supprimerVerrouOrphelin(cheminVerrou)
    return { ok: true }
  }

  /** DELETE d'un verrou dont nous ne détenons PAS l'ETag en mémoire (orphelin) :
   *  observation puis suppression conditionnelle — tolérante (déjà parti ?). */
  private async supprimerVerrouOrphelin(cheminVerrou: string): Promise<void> {
    const etag = await this.etagServeurDe(cheminVerrou)
    try {
      await this.client.supprimer(cheminVerrou, etag ?? undefined)
    } catch (e) {
      if (!(e instanceof ErreurHttp && (e.statut === 404 || e.statut === 412))) throw e
    }
  }

  /** ETag serveur courant d'un fichier, observé par PROPFIND. */
  private async etagServeurDe(cheminRelatif: string): Promise<string | null> {
    const dossier = cheminRelatif.includes('/') ? cheminRelatif.slice(0, cheminRelatif.lastIndexOf('/')) : ''
    const nom = cheminRelatif.slice(cheminRelatif.lastIndexOf('/') + 1)
    const entree = (await this.client.propfind(dossier)).find((e) => e.chemin === nom)
    return entree?.etag ?? null
  }

  /** État PUBLIC des fichiers verrou vus au pull (badges fiables §3.1/§10) :
   *  chaque verrou est lu et décodé ; ceux de NOTRE propre session sont omis
   *  (on édite ces entretiens soi-même — un badge n'apporte rien). Un fichier
   *  illisible → contenu null (badge omis, jamais deviné).
   */
  async etatVerrousPublics(
    chemins: { chemin: string; etag: string | null }[],
  ): Promise<EntreeVerrouPublic[]> {
    const notreSession = this.identite().sessionId
    const out: EntreeVerrouPublic[] = []
    for (const { chemin, etag } of chemins) {
      let contenu: EntreeVerrouPublic['contenu'] = null
      try {
        const v = JSON.parse(await this.client.getTexte(chemin)) as Partial<ContenuVerrou>
        if (
          typeof v.userId === 'string' &&
          typeof v.sessionId === 'string' &&
          typeof v.acquiredAt === 'string' &&
          v.sessionId !== notreSession
        ) {
          contenu = { userId: v.userId, machineId: v.machineId ?? '', acquiredAt: v.acquiredAt }
        }
      } catch {
        /* illisible/injoignable : badge omis */
      }
      out.push({ chemin, etag, contenu })
    }
    return out
  }

  /** Écriture locale atomique d'un contenu serveur fraîchement tiré. */
  private ecrireLocalFichier(abs: string, contenu: string): void {
    mkdirSync(dirname(abs), { recursive: true })
    const tmp = `${abs}.tmp`
    writeFileSync(tmp, contenu, 'utf8')
    renameSync(tmp, abs)
  }
}
