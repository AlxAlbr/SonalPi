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

import { mkdirSync, readFileSync, renameSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { MiroirWebDAV } from '../miroir'
import { ClientWebDAV, ErreurHttp } from '../webdav/client'
import {
  PERIODE_BATTEMENT_MS,
  PERIODE_PUBLICATION_MS,
  type ContenuVerrou,
} from '../verrous/types'
import { ProviderPutConditionnel } from '../verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../verrous/providerFilesLock'
import type { VerrouProvider } from '../verrous/types'
import type { EntreeVerrouPublic } from '../../shared/distant'
import type { EntretienFichier } from '../../shared/format'

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
  /** Le provider DE CETTE session — variante B ou A (§8) : le protocole ne
   *  connaît que le contrat `VerrouProvider` (invariant §15.2). */
  provider: VerrouProvider
  cheminVerrou: string
  etagServeur: string | null // ETag du FICHIER entretien côté serveur (garde de publication)
  sale: boolean
  dernierPubli: string | null
}

const CHEMIN_ENTRETIEN = (id: string) => `entretiens/${id}.json`

/** Id d'entretien porté par un chemin VERROUILLÉ — les deux conventions de
 *  variante (`entretiens/<id>.json` en A, `verrous/<id>.lock.json` en B). */
function idDe(cheminVerrou: string): string | null {
  const m = /^verrous\/(.+)\.lock\.json$/.exec(cheminVerrou)
  if (m) return m[1]
  const n = /^entretiens\/(.+)\.json$/.exec(cheminVerrou)
  return n ? n[1] : null
}

/** Options de construction : quelle VARIANTE de verrou (plan §8). La variante
 *  est choisie par le main d'après la sonde capabilities — jamais demandée à
 *  l'utilisateur. Le protocole §4 est identique ; seuls le provider et le
 *  chemin verrouillé diffèrent (fichier annexe en B, fichier de données en A).
 */
export interface OptionsSessions {
  /** true = variante A (files_lock sur `entretiens/<id>.json`) ; false/absent
   *  = variante B (PUT conditionnel sur `verrous/<id>.lock.json`). */
  verrouNatif?: boolean
}

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
    private readonly options: OptionsSessions = {},
  ) {}

  /** Chemin VERROUILLÉ pour un entretien — le seul point où les variantes
   *  diffèrent physiquement (§8) : fichier annexe (B) ou fichier de données (A). */
  private cheminVerrouDe(id: string): string {
    return this.options.verrouNatif ? CHEMIN_ENTRETIEN(id) : `verrous/${id}.lock.json`
  }

  private fabriquerProvider(): VerrouProvider {
    return this.options.verrouNatif
      ? new ProviderFilesLock(this.client, this.identite)
      : new ProviderPutConditionnel(this.client, this.identite)
  }

  /** Ouvre une session d'écriture : verrou + GET serveur + garde. Idempotent
   *  pour un id déjà tenu par nous (réouverture de la même session). */
  async ouvrir(id: string): Promise<EtatSession> {
    const existante = this.sessions.get(id)
    if (existante) return { etat: 'a-nous', dernierPubli: existante.dernierPubli, sale: existante.sale }

    // Un provider PAR session d'écriture ; la variante vient des options (§8).
    const provider = this.fabriquerProvider()
    const chemin = this.cheminVerrouDe(id)
    const acquisition = await provider.acquerir(chemin)
    if (!acquisition.ok) {
      return { etat: 'tenu-par-autrui', tenuPar: acquisition.tenuPar }
    }
    // Variante A : consigner le verrou au JOURNAL LOCAL (les orphelins ne sont
    // pas détectables serveur — files_lock n'enregistre ni machine ni session).
    if (this.options.verrouNatif) this.journalAjouter(id)

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
      const nouveauEtag = await this.client.putTexte(
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
    if (this.options.verrouNatif) this.journalRetirer(id)
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
    // Variante A : le verrou natif a été PERDU — sortir l'id du journal (on ne
    // le propose plus comme orphelin à reprendre : il appartient à autrui).
    if (this.options.verrouNatif) this.journalRetirer(id)
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

  /* ── Copies de DIVERGENCE (§6, fusion assistée E3b) ─────────────────────
   * Une rétrogradation (publication 412) met la copie locale de côté hors
   * serveur : `sessions/<id>.divergence-<sessionId>.json`. Elle n'est ni
   * perdue ni publiée en silence — listée ici pour le dialogue de fusion.
   * ───────────────────────────────────────────────────────────────────────*/

  private readonly REGEX_DIVERGENCE = /^sessions\/([^/]+)\.divergence-([^/]+)\.json$/

  /** Les copies de divergence de CE POSTE (toutes sessions confondues). */
  listerDivergences(): { chemin: string; id: string; sessionId: string; date: string }[] {
    const dossier = join(this.miroir.dirLocal, 'sessions')
    try {
      return readdirSync(dossier)
        .map((nom) => this.REGEX_DIVERGENCE.exec(`sessions/${nom}`))
        .filter((m): m is RegExpExecArray => !!m)
        .map((m) => ({
          chemin: `sessions/${m[1]}.divergence-${m[2]}.json`,
          id: m[1],
          sessionId: m[2],
          date: statSync(join(this.miroir.dirLocal, m[0])).mtime.toISOString(),
        }))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
    } catch {
      return [] // pas encore de dossier sessions : aucune divergence
    }
  }

  /** Contenu d'une copie de divergence (null = absente/corrompue). Le chemin
   *  est validé contre la convention ci-dessus — jamais de traversal. */
  lireDivergence(chemin: string): EntretienFichier | null {
    if (!this.REGEX_DIVERGENCE.test(chemin)) return null
    try {
      return JSON.parse(readFileSync(join(this.miroir.dirLocal, chemin), 'utf8')) as EntretienFichier
    } catch {
      return null
    }
  }

  /** Jette une copie (choix explicite du dialogue — jamais automatique). */
  supprimerDivergence(chemin: string): void {
    if (!this.REGEX_DIVERGENCE.test(chemin)) return
    try {
      unlinkSync(join(this.miroir.dirLocal, chemin))
    } catch {
      /* déjà partie : idempotent */
    }
  }

  /** Liste des verrous orphelins (crash sans libération) — matière du dialogue
   *  « reprendre / abandonner » (§4.5).
   *  Variante B : un orphelin = verrou de NOTRE machine mais d'une AUTRE
   *  session (sessionId aléatoire par lancement : un verrou n'est jamais
   *  hérité) — détection par lecture des fichiers `verrous/`.
   *  Variante A : le serveur n'enregistre ni machine ni session → détection
   *  par le JOURNAL LOCAL des verrous tenus (tenu à jour à ouvrir/fermer),
   *  croisé avec l'état réel du serveur (encore verrouillé ?).
   */
  async orphelins(): Promise<{ cheminVerrou: string; id: string; verrou: ContenuVerrou }[]> {
    if (this.options.verrouNatif) return await this.orphelinsNatifs()
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

  /** Orphelins VARIANTE A : entrées du journal local dont le fichier est
   *  ENCORE verrouillé côté serveur (sinon : libéré entre-temps — entrée
   *  purgée silencieusement). Le détenteur affiché est l'utilisateur Nextcloud
   *  de notre propre identité (le serveur ne sait pas plus). */
  private async orphelinsNatifs(): Promise<{
    cheminVerrou: string
    id: string
    verrou: ContenuVerrou
  }[]> {
    const out: { cheminVerrou: string; id: string; verrou: ContenuVerrou }[] = []
    for (const [id, acquiredAt] of Object.entries(this.lireJournal())) {
      const cheminFichier = CHEMIN_ENTRETIEN(id)
      let etat = null
      try {
        etat = await this.client.etatVerrouNatif(cheminFichier)
      } catch {
        continue // réseau : retenter au prochain passage
      }
      if (!etat || !etat.verrouille) {
        this.journalRetirer(id) // déjà libéré (fermeture propre ? nettoyage admin ?)
        continue
      }
      out.push({
        cheminVerrou: cheminFichier,
        id,
        verrou: {
          userId: etat.owner || this.identite().userId,
          machineId: this.identite().machineId,
          sessionId: '', // non enregistré côté serveur en variante A
          acquiredAt,
          refreshedAt: acquiredAt,
          ttl: etat.timeout && etat.timeout > 0 ? etat.timeout : 3600,
        },
      })
    }
    return out
  }

  /** Abandon explicite d'un orphelin (choix « abandonner » du dialogue §4.5) :
   *  déverrouille SANS publier — la copie locale du miroir reste en place et
   *  repartira en divergence si elle resurgit plus tard (§6).
   */
  async abandonnerOrphelin(cheminVerrou: string): Promise<void> {
    await this.libererVerrouOrphelin(cheminVerrou)
  }

  /** Reprise d'un orphelin (choix « reprendre et publier » du dialogue §4.5) :
   *  la copie locale du miroir (dernier autosave avant crash) est publiée sur
   *  le serveur PUIS le verrou libéré — l'ordre invariant §4.4 s'applique ici
   *  aussi. Personne n'a pu écrire entre-temps sans contourner le verrou ; la
   *  garde If-Match couvre ce résidu (412 → divergence, on ne publie pas).
   *  `cheminVerrou` = le chemin VERROUILLÉ, qui dépend de la variante
   *  (`entretiens/<id>.json` en A, `verrous/<id>.lock.json` en B).
   */
  async reprendreOrphelin(cheminVerrou: string): Promise<{ ok: boolean; raison?: string }> {
    const id = idDe(cheminVerrou)
    if (!id) return { ok: false, raison: 'chemin invalide' }
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
    await this.libererVerrouOrphelin(cheminVerrou)
    return { ok: true }
  }

  /** Libération d'un verrou orphelin, selon la variante du chemin : UNLOCK
   *  natif (A) ou DELETE conditionnel du fichier annexe (B). Purge ensuite le
   *  journal local si l'id y figure (variante A).
   */
  private async libererVerrouOrphelin(cheminVerrou: string): Promise<void> {
    if (this.options.verrouNatif) {
      try {
        await this.client.deverrouiller(cheminVerrou)
      } catch (e) {
        if (!(e instanceof ErreurHttp && (e.statut === 412 || e.statut === 404))) throw e
      }
      const id = idDe(cheminVerrou)
      if (id) this.journalRetirer(id)
      return
    }
    // Variante B : DELETE d'un verrou dont nous ne détenons PAS l'ETag en
    // mémoire — observation puis suppression conditionnelle (déjà parti ?).
    const etag = await this.etagServeurDe(cheminVerrou)
    try {
      await this.client.supprimer(cheminVerrou, etag ?? undefined)
    } catch (e) {
      if (!(e instanceof ErreurHttp && (e.statut === 404 || e.statut === 412))) throw e
    }
  }

  /* ── Journal LOCAL des verrous natifs tenus (variante A, §8) ──────────────
   * files_lock n'expose que l'UTILISATEUR détenteur — ni machine ni session.
   * Pour retrouver nos orphelins après un crash, chaque acquisition native
   * est consignée ici (`sessions/.verrous-natifs.json`, local pur), retirée à
   * la fermeture/libération. Format : { id: acquiredAt ISO }.
   * ─────────────────────────────────────────────────────────────────────────*/
  private get fichierJournal(): string {
    return join(this.miroir.dirLocal, 'sessions', '.verrous-natifs.json')
  }

  private lireJournal(): Record<string, string> {
    try {
      const j = JSON.parse(readFileSync(this.fichierJournal, 'utf8')) as Record<string, unknown>
      if (j && typeof j === 'object') {
        return Object.fromEntries(
          Object.entries(j).filter(([, v]) => typeof v === 'string'),
        ) as Record<string, string>
      }
    } catch {
      /* absent/corrompu → journal vide */
    }
    return {}
  }

  private ecrireJournal(j: Record<string, string>): void {
    mkdirSync(dirname(this.fichierJournal), { recursive: true })
    writeFileSync(this.fichierJournal, JSON.stringify(j, null, 2), 'utf8')
  }

  private journalAjouter(id: string): void {
    const j = this.lireJournal()
    j[id] = new Date().toISOString()
    this.ecrireJournal(j)
  }

  private journalRetirer(id: string): void {
    const j = this.lireJournal()
    if (!(id in j)) return
    delete j[id]
    this.ecrireJournal(j)
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

  /** Badges VARIANTE A (§3.1/§8) : le PROPFIND files_lock sur `entretiens/`
   *  donne l'état « tenu par X » SUR LES FICHIERS DE DONNÉES EUX-MÊMES — pas
   *  de dossier `verrous/` à scanner. Une seule requête pour tout le corpus.
   *  Les entretiens dont NOUS tenons la session sont omis (on ne se badge pas
   *  soi-même) ; les autres verrous du même utilisateur (autre session/poste)
   *  restent affichés — c'est une information vraie.
   */
  async etatVerrousPublicsNatifs(): Promise<EntreeVerrouPublic[]> {
    const tenus = new Set(this.idsTenus())
    let carte: Record<string, import('../webdav/client').EtatVerrouNatif>
    try {
      carte = await this.client.etatsVerrouxDossier('entretiens')
    } catch {
      return [] // serveur injoignable : badges absents ce cycle, jamais devinés
    }
    const out: EntreeVerrouPublic[] = []
    for (const [nom, e] of Object.entries(carte)) {
      if (!e.verrouille) continue
      const id = nom.replace(/\.json$/, '')
      if (tenus.has(id)) continue
      out.push({
        chemin: `entretiens/${nom}`,
        etag: null,
        contenu: {
          userId: e.owner || this.identite().userId,
          machineId: '',
          acquiredAt: e.time ? new Date(e.time * 1000).toISOString() : new Date().toISOString(),
        },
      })
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
