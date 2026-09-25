/**
 *  La SESSION D'ÉCRITURE d'un entretien distant —
 *  le cycle complet :
 *
 *  ouvrir  : acquerir le verrou → GET du fichier SERVEUR (la version
 *  d'après-verrou fait foi) → mémoriser son ETag (garde de publication)
 *  écrire  : autosave local (miroir) uniquement — session marquée « sale »
 *  battre  : toutes les 60 s, preuve de vie ; échec → RÉTROGRADATION
 *  publier : toutes les 5 min si sale + « Publier maintenant » — PUT If-Match
 *  <etag serveur> sous verrou TOUJOURS tenu
 *  fermer  : publication finale PUIS déverrouillage — l'ordre est l'invariant
 *  central (un verrou ne se libère jamais sur un contenu non publié)
 *
 *  La rétrogradation et les publications sont signalées par callback (l'UI
 *  s'abonne) ; le renderer reste par ailleurs libre de consulter `etat()`.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, dirname } from 'node:path'
import { MiroirWebDAV } from './miroirWebDAV'
import { ClientWebDAV, ErreurHttp } from '../webdav/client'
import {
  PERIODE_BATTEMENT_MS,
  PERIODE_PUBLICATION_MS,
  type ContenuVerrou,
} from '../verrous/types'
import { ProviderPutConditionnel } from '../verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../verrous/providerFilesLock'
import type { VerrouProvider } from '../verrous/types'
import type {
  EntreeVerrouPublic,
  EtatSessionPublic,
  ResultatFermetureSession,
  ResultatFermetureToutes,
} from '../../shared/distant'
import { FORMAT_VERSION, type EntretienFichier, type PayloadEntretien } from '../../shared/format'

export interface IdentiteSession {
  userId: string
  machineId: string
  sessionId: string
}

export type EtatSession =
  | EtatSessionPublic
  /** Refus d'acquisition : lecture seule avec détenteur affichable. */
  | { etat: 'tenu-par-autrui'; tenuPar: ContenuVerrou | null }

interface SessionInterne {
  /** Le provider DE CETTE session : le protocole ne connaît que le contrat
   *  `VerrouProvider`, jamais la variante concrète. */
  provider: VerrouProvider
  cheminVerrou: string
  etagServeur: string | null // ETag du FICHIER entretien côté serveur (garde de publication)
  /** Révisions monotones : une écriture arrivée pendant un PUT reste sale. */
  revision: number
  revisionPubliee: number
  dernierPubli: string | null
  /** Limite locale au-delà de laquelle une panne de renouvellement suspend l'édition. */
  droitValideJusqua: number
  degrade: boolean
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

/** Options de construction : quelle VARIANTE de verrou. La variante
 *  est choisie par le main d'après la sonde capabilities — jamais demandée à
 *  l'utilisateur. Le protocole est identique ; seuls le provider et le
 *  chemin verrouillé diffèrent (fichier annexe ou fichier de données).
 */
export interface OptionsSessions {
  /** true = variante A (files_lock sur `entretiens/<id>.json`) ; false/absent
   *  = variante B (PUT conditionnel sur `verrous/<id>.lock.json`). */
  verrouNatif?: boolean
  /** Horloge injectable pour vérifier les échéances sans attendre en test. */
  maintenant?: () => number
}

export class SessionsDEntretien {
  private readonly sessions = new Map<string, SessionInterne>()
  /** Une rétrogradation reste visible jusqu'à la fermeture de l'entretien. */
  private readonly sessionsDegradees = new Set<string>()
  /** File par entretien : acquisition, battement, publication et fermeture ne
   *  se chevauchent jamais. */
  private readonly operations = new Map<string, Promise<void>>()
  private minuteur: ReturnType<typeof setInterval> | null = null
  private fermetureGlobale = false
  private termine = false

  constructor(
    private readonly client: ClientWebDAV,
    private readonly miroir: MiroirWebDAV,
    private readonly identite: () => IdentiteSession,
    /** Notifications vers le renderer. */
    private readonly onRetrogradation?: (id: string) => void,
    private readonly onPublication?: (id: string, date: string) => void,
    private readonly options: OptionsSessions = {},
  ) {}

  /** Chemin VERROUILLÉ pour un entretien — le seul point où les variantes
   *  diffèrent physiquement : fichier annexe ou fichier de données. */
  private cheminVerrouDe(id: string): string {
    return this.options.verrouNatif ? CHEMIN_ENTRETIEN(id) : `verrous/${id}.lock.json`
  }

  private fabriquerProvider(): VerrouProvider {
    return this.options.verrouNatif
      ? new ProviderFilesLock(this.client, this.identite)
      : new ProviderPutConditionnel(this.client, this.identite)
  }

  /** Exécute une opération après les précédentes du même entretien. */
  private async serialiser<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const precedente = this.operations.get(id) ?? Promise.resolve()
    let liberer!: () => void
    const verrou = new Promise<void>((resolve) => {
      liberer = resolve
    })
    const file = precedente.catch(() => {}).then(() => verrou)
    this.operations.set(id, file)
    await precedente.catch(() => {})
    try {
      return await operation()
    } finally {
      liberer()
      if (this.operations.get(id) === file) this.operations.delete(id)
    }
  }

  /** Ouvre une session d'écriture : verrou + GET serveur + garde. Idempotent
   *  pour un id déjà tenu par nous. */
  async ouvrir(id: string): Promise<EtatSession> {
    return this.serialiser(id, () => this.ouvrirInterne(id))
  }

  private async ouvrirInterne(id: string): Promise<EtatSession> {
    if (this.termine || this.fermetureGlobale) {
      throw new Error('Le gestionnaire de sessions est en cours de fermeture.')
    }
    if (this.sessionsDegradees.has(id)) return { etat: 'degrade' }
    const existante = this.sessions.get(id)
    if (existante) {
      if (existante.degrade) return { etat: 'degrade' }
      return {
        etat: 'a-nous',
        dernierPubli: existante.dernierPubli,
        sale: existante.revision > existante.revisionPubliee,
      }
    }

    const provider = this.fabriquerProvider()
    const chemin = this.cheminVerrouDe(id)
    const acquisition = await provider.acquerir(chemin)
    if (!acquisition.ok) {
      return { etat: 'tenu-par-autrui', tenuPar: acquisition.tenuPar }
    }
    this.journalAjouter(id)

    // Enregistrer immédiatement le verrou acquis. Si le GET échoue et que la
    // libération compensatoire échoue aussi, fermerToutes pourra le reprendre.
    const session: SessionInterne = {
      provider,
      cheminVerrou: chemin,
      etagServeur: null,
      revision: 0,
      revisionPubliee: 0,
      dernierPubli: null,
      droitValideJusqua: this.maintenant() + acquisition.dureeGarantieMs,
      degrade: false,
    }
    this.sessions.set(id, session)
    this.demarrerMinuteur()

    try {
      const cheminFichier = CHEMIN_ENTRETIEN(id)
      const etagServeur = await this.etagServeurDe(cheminFichier)
      if (etagServeur) {
        const contenu = await this.client.getTexte(cheminFichier)
        this.ecrireLocalFichier(join(this.miroir.dirLocal, cheminFichier), contenu)
        this.miroir.noterEtagPublie(cheminFichier, etagServeur)
      }
      session.etagServeur = etagServeur
      return { etat: 'a-nous', dernierPubli: null, sale: false }
    } catch (erreur) {
      try {
        await provider.liberer(chemin)
        this.retirerSession(id)
      } catch {
        // La session reste suivie afin que la fermeture globale puisse retenter.
      }
      throw erreur
    }
  }

  /** Marque le contenu local comme non publié (appelé après chaque autosave). */
  noterSale(id: string): void {
    const s = this.sessions.get(id)
    if (!s || s.degrade) return
    s.revision += 1
    if (!s.dernierPubli) s.dernierPubli = new Date().toISOString()
  }

  /** Publication : PUT If-Match sous verrou toujours tenu. */
  async publier(id: string): Promise<{ ok: boolean; raison?: string }> {
    return this.serialiser(id, () => this.publierInterne(id))
  }

  private async publierInterne(id: string): Promise<{ ok: boolean; raison?: string }> {
    const s = this.sessions.get(id)
    if (!s) return { ok: false, raison: 'aucune session' }
    if (s.degrade) return { ok: false, raison: 'divergence' }
    if (this.maintenant() > s.droitValideJusqua) {
      await this.degraderInterne(id)
      return { ok: false, raison: 'droit-expire' }
    }
    if (s.revision <= s.revisionPubliee) return { ok: true }
    const revisionPubliee = s.revision
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
      // Une écriture arrivée pendant le PUT porte une révision supérieure et
      // reste donc sale pour la publication suivante.
      s.revisionPubliee = Math.max(s.revisionPubliee, revisionPubliee)
      s.dernierPubli = new Date().toISOString()
      this.onPublication?.(id, s.dernierPubli)
      return { ok: true }
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 412) {
        await this.degraderInterne(id)
        return { ok: false, raison: 'divergence' }
      }
      if (e instanceof ErreurHttp) throw e
      const etagConfirme = await this.confirmerPublicationIncertaine(
        cheminFichier,
        contenu,
        s.etagServeur,
      )
      if (!etagConfirme) throw e
      this.miroir.noterEtagPublie(cheminFichier, etagConfirme)
      s.etagServeur = etagConfirme
      s.revisionPubliee = Math.max(s.revisionPubliee, revisionPubliee)
      s.dernierPubli = new Date().toISOString()
      this.onPublication?.(id, s.dernierPubli)
      return { ok: true }
    }
  }

  private async confirmerPublicationIncertaine(
    chemin: string,
    contenuTente: string,
    etagAvant: string | null,
  ): Promise<string | null> {
    try {
      const etag = await this.etagServeurDe(chemin)
      if (!etag || etag === etagAvant) return null
      return await this.client.getTexte(chemin) === contenuTente ? etag : null
    } catch {
      return null
    }
  }

  /** Ferme après publication finale, puis libère le verrou. Une erreur garde
   *  la session suivie et n'est jamais présentée comme une réussite. */
  async fermer(id: string): Promise<ResultatFermetureSession> {
    return this.serialiser(id, () => this.fermerInterne(id))
  }

  private async fermerInterne(id: string): Promise<ResultatFermetureSession> {
    const s = this.sessions.get(id)
    if (!s) {
      this.sessionsDegradees.delete(id)
      return { fermee: true }
    }
    while (!s.degrade && s.revision > s.revisionPubliee) {
      try {
        const publication = await this.publierInterne(id)
        if (!publication.ok && publication.raison !== 'divergence') {
          return { fermee: false, raison: 'publication', message: publication.raison }
        }
      } catch (e) {
        return {
          fermee: false,
          raison: 'publication',
          message: e instanceof Error ? e.message : String(e),
        }
      }
    }
    try {
      await s.provider.liberer(s.cheminVerrou)
    } catch (e) {
      return {
        fermee: false,
        raison: 'liberation',
        message: e instanceof Error ? e.message : String(e),
      }
    }
    this.retirerSession(id)
    this.sessionsDegradees.delete(id)
    return { fermee: true }
  }

  /** Ferme toutes les sessions et acquitte aussi les états dégradés. */
  async fermerToutes(): Promise<ResultatFermetureToutes> {
    this.fermetureGlobale = true
    const fermees: string[] = []
    const bloquees: ResultatFermetureToutes['bloquees'] = []
    const ids = new Set([...this.sessions.keys(), ...this.sessionsDegradees])
    for (const id of ids) {
      const resultat = await this.fermer(id)
      if (resultat.fermee) fermees.push(id)
      else bloquees.push({ id, raison: resultat.raison, message: resultat.message })
    }
    if (bloquees.length > 0) this.fermetureGlobale = false
    return { fermees, bloquees }
  }

  /** Arrêt terminal : aucune session ni opération ne peut être oubliée. */
  dispose(): void {
    if (this.sessions.size > 0 || this.sessionsDegradees.size > 0 || this.operations.size > 0) {
      throw new Error('Des sessions ou opérations sont encore actives.')
    }
    this.termine = true
    this.arreterMinuteur()
  }

  private retirerSession(id: string): void {
    this.journalRetirer(id)
    this.sessions.delete(id)
    if (this.sessions.size === 0) this.arreterMinuteur()
  }

  /** État consultable par l'UI. */
  etat(id: string): EtatSessionPublic {
    if (this.sessionsDegradees.has(id)) return { etat: 'degrade' }
    const s = this.sessions.get(id)
    if (!s) return { etat: 'aucune' }
    if (s.degrade) return { etat: 'degrade' }
    return {
      etat: 'a-nous',
      dernierPubli: s.dernierPubli,
      sale: s.revision > s.revisionPubliee,
    }
  }

  /** Transaction courte sur un entretien fermé : verrou, GET frais, mutation,
   *  PUT conditionnel, puis libération. */
  async modifierEntretienFerme<T>(
    id: string,
    mutation: (data: EntretienFichier) => T,
  ): Promise<{ ok: true; resultat: T } | { ok: false; raison: string }> {
    return this.serialiser(id, async () => {
      if (this.sessions.has(id)) return { ok: false, raison: 'session-active' }
      const ouverture = await this.ouvrirInterne(id)
      if (ouverture.etat !== 'a-nous') {
        return { ok: false, raison: ouverture.etat === 'tenu-par-autrui' ? 'tenu-par-autrui' : 'session-degradee' }
      }
      let resultat!: T
      const abs = join(this.miroir.dirLocal, CHEMIN_ENTRETIEN(id))
      const contenuAvant = readFileSync(abs, 'utf8')
      let contenuTente: string | null = null
      try {
        const data = JSON.parse(contenuAvant) as EntretienFichier
        resultat = mutation(data)
        data.lastModified = new Date().toISOString()
        contenuTente = JSON.stringify(data, null, 2)
        this.ecrireLocalFichier(abs, contenuTente)
        this.noterSale(id)
        const publication = await this.publierInterne(id)
        if (!publication.ok) {
          await this.restaurerEntretienCourt(id, contenuAvant)
          const fermeture = await this.fermerInterne(id)
          if (!fermeture.fermee) return { ok: false, raison: fermeture.raison }
          return { ok: false, raison: publication.raison ?? 'publication' }
        }
      } catch (e) {
        const reconciliation = contenuTente
          ? await this.reconcilierEntretienCourt(id, contenuTente, contenuAvant)
          : false
        const session = this.sessions.get(id)
        if (session) session.revisionPubliee = session.revision
        const fermeture = await this.fermerInterne(id)
        if (!fermeture.fermee) {
          throw new Error(
            `${e instanceof Error ? e.message : String(e)}; verrou non libéré (${fermeture.raison}).`,
          )
        }
        if (reconciliation) return { ok: true, resultat }
        throw e
      }
      const fermeture = await this.fermerInterne(id)
      if (!fermeture.fermee) return { ok: false, raison: fermeture.raison }
      return { ok: true, resultat }
    })
  }

  /** Relit un PUT court incertain. Un contenu identique confirme le commit. */
  private async reconcilierEntretienCourt(
    id: string,
    contenuTente: string,
    contenuAvant: string,
  ): Promise<boolean> {
    const chemin = CHEMIN_ENTRETIEN(id)
    try {
      const etag = await this.etagServeurDe(chemin)
      if (!etag) {
        this.ecrireLocalFichier(join(this.miroir.dirLocal, chemin), contenuAvant)
        return false
      }
      const contenuServeur = await this.client.getTexte(chemin)
      this.ecrireLocalFichier(join(this.miroir.dirLocal, chemin), contenuServeur)
      this.miroir.noterEtagPublie(chemin, etag)
      const session = this.sessions.get(id)
      if (session) session.etagServeur = etag
      return contenuServeur === contenuTente
    } catch {
      this.ecrireLocalFichier(join(this.miroir.dirLocal, chemin), contenuAvant)
      return false
    }
  }

  /** Restaure la version serveur après le refus certain d'une transaction courte. */
  private async restaurerEntretienCourt(id: string, contenuAvant: string): Promise<void> {
    const chemin = CHEMIN_ENTRETIEN(id)
    try {
      const etag = await this.etagServeurDe(chemin)
      if (!etag) throw new Error('Entretien distant absent.')
      const contenuServeur = await this.client.getTexte(chemin)
      this.ecrireLocalFichier(join(this.miroir.dirLocal, chemin), contenuServeur)
      this.miroir.noterEtagPublie(chemin, etag)
    } catch {
      this.ecrireLocalFichier(join(this.miroir.dirLocal, chemin), contenuAvant)
    }
  }

  /** Désignation audio distante sur un entretien fermé. */
  async designerAudio(
    id: string,
    cheminAudio: string,
  ): Promise<{ ok: boolean; raison?: string }> {
    const resultat = await this.modifierEntretienFerme(id, (data) => {
      data.meta ??= { valeursGen: {}, audioRef: null }
      data.meta.audioDistant = { chemin: cheminAudio }
    })
    return resultat.ok ? { ok: true } : resultat
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

  private maintenant(): number {
    return this.options.maintenant?.() ?? Date.now()
  }

  /** Un tick du minuteur — public pour les tests. */
  async tic(): Promise<void> {
    const maintenant = this.maintenant()
    for (const id of [...this.sessions.keys()]) {
      await this.serialiser(id, async () => {
        const s = this.sessions.get(id)
        if (!s || s.degrade) return
        try {
          const b = await s.provider.battre(s.cheminVerrou)
          if (!b.ok) {
            await this.degraderInterne(id, true)
            return
          }
          s.droitValideJusqua = this.maintenant() + b.dureeGarantieMs
        } catch {
          if (this.maintenant() > s.droitValideJusqua) {
            await this.degraderInterne(id)
          }
          return
        }
        if (
          s.revision > s.revisionPubliee &&
          s.dernierPubli !== null &&
          maintenant - Date.parse(s.dernierPubli) >= PERIODE_PUBLICATION_MS - 1000
        ) {
          await this.publierInterne(id).catch(() => {})
        }
      })
    }
  }

  /** Rétrogradation : retire le droit d'écrire, conserve une copie locale,
   *  puis tente de libérer. L'état reste visible jusqu'à sa fermeture. */
  private async degraderInterne(id: string, verrouPerdu = false): Promise<void> {
    const s = this.sessions.get(id)
    if (!s || s.degrade) return
    s.degrade = true
    this.sessionsDegradees.add(id)
    this.revoquerEcriture?.(id)
    this.onRetrogradation?.(id)
    try {
      const brut = readFileSync(join(this.miroir.dirLocal, CHEMIN_ENTRETIEN(id)), 'utf8')
      this.ecrireCopieRecuperation(id, brut)
    } catch {
      /* Rien à mettre de côté. */
    }
    if (verrouPerdu) {
      this.retirerSession(id)
      return
    }
    try {
      await s.provider.liberer(s.cheminVerrou)
      this.retirerSession(id)
    } catch {
      // La session active reste suivie afin que la fermeture retente la libération.
    }
  }
  revoquerEcriture?: (id: string) => void

  /** Préserve le dernier état du renderer sans le remettre dans le miroir publiable. */
  preserverRecuperation(id: string, payload: PayloadEntretien): boolean {
    if (!this.sessionsDegradees.has(id)) return false
    const fichier: EntretienFichier = {
      ...payload,
      formatVersion: FORMAT_VERSION,
      lastModified: new Date(this.maintenant()).toISOString(),
    }
    return this.ecrireCopieRecuperation(id, JSON.stringify(fichier, null, 2))
  }

  private ecrireCopieRecuperation(id: string, brut: string): boolean {
    try {
      const dossierSessions = join(this.miroir.dirLocal, 'sessions')
      mkdirSync(dossierSessions, { recursive: true })
      while (true) {
        try {
          writeFileSync(
            join(
              dossierSessions,
              `${id}.divergence-${this.identite().sessionId}.copie-${randomUUID()}.json`,
            ),
            brut,
            { encoding: 'utf8', flag: 'wx' },
          )
          return true
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
        }
      }
    } catch {
      return false
    }
  }

  /** Ids retrouvés dans le journal local avant toute lecture distante. */
  idsRecuperablesLocalement(): string[] {
    return Object.keys(this.lireJournal())
  }

  /** Ids des entretiens DONT NOUS tenons le verrou — passés au pull comme
   *  exclusions (le miroir n'écrase jamais une copie de travail sous verrou). */
  idsTenus(): string[] {
    return [...this.sessions.keys()]
  }

  /* ── Copies de DIVERGENCE (fusion assistée) ─────────────────────────────
   *  Une rétrogradation (publication 412) met la copie locale de côté hors
   *  serveur. Un id propre préserve les divergences successives d'une session.
   *  Les anciens noms restent acceptés.
   *  ───────────────────────────────────────────────────────────────────────*/

  private readonly REGEX_DIVERGENCE =
    /^sessions\/([^/]+)\.divergence-([^/]+?)(?:\.copie-([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}))?\.json$/i

  /** Les copies de divergence de CE POSTE (toutes sessions confondues). */
  listerDivergences(): { chemin: string; id: string; sessionId: string; date: string }[] {
    const dossier = join(this.miroir.dirLocal, 'sessions')
    try {
      return readdirSync(dossier)
        .map((nom) => this.REGEX_DIVERGENCE.exec(`sessions/${nom}`))
        .filter((m): m is RegExpExecArray => !!m)
        .map((m) => ({
          chemin: m[0],
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
   *  « reprendre / abandonner ».
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

  /** Abandon explicite d'un orphelin (choix « abandonner » du dialogue) :
   *  déverrouille SANS publier — la copie locale du miroir reste en place et
   *  repartira en divergence si elle resurgit plus tard.
   */
  async abandonnerOrphelin(cheminVerrou: string): Promise<void> {
    await this.libererVerrouOrphelin(cheminVerrou)
  }

  /** Reprise d'un orphelin (choix « reprendre et publier » du dialogue) :
   *  la copie locale du miroir (dernier autosave avant crash) est publiée sur
   *  le serveur PUIS le verrou libéré — l'ordre publication-avant-libération
   *  s'applique ici aussi. Personne n'a pu écrire entre-temps sans contourner
   *  le verrou ; la garde If-Match couvre ce résidu (412 → divergence, on ne
   *  publie pas). `cheminVerrou` = le chemin VERROUILLÉ, qui dépend de la
   *  variante (fichier de données en files_lock, fichier annexe sinon).
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
    // Garde : si le serveur ne porte plus la version publiée avant le crash, quelqu'un a écrit DERRIÈRE le verrou (UI web),
    // c'est une divergence — on ne publie pas, on ne libère pas : l'utilisateur tranche.
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
        // Le fichier a changé derrière le verrou (contournement pendant le crash) : ne PAS écraser ;
        // la copie locale reste dans le miroir.
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
    // Variante B : DELETE d'un verrou dont nous ne détenons PAS l'ETag en mémoire —
    // observation puis suppression conditionnelle (déjà parti ?).
    const etag = await this.etagServeurDe(cheminVerrou)
    try {
      await this.client.supprimer(cheminVerrou, etag ?? undefined)
    } catch (e) {
      if (!(e instanceof ErreurHttp && (e.statut === 404 || e.statut === 412))) throw e
    }
    const id = idDe(cheminVerrou)
    if (id) this.journalRetirer(id)
  }

  /* ── Journal LOCAL des sessions tenues ────────────────────────────────
   * Chaque acquisition est consignée avant l'édition afin qu'un redémarrage
   * protège la copie locale avant le premier tirage. Le nom historique du
   * fichier est conservé pour relire les journaux files_lock existants.
   * Format : { id: acquiredAt ISO }.
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
    this.ecrireLocalFichier(this.fichierJournal, JSON.stringify(j, null, 2))
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

  /** État PUBLIC des fichiers verrou vus au pull (badges fiables) :
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

  /** Badges files_lock : le PROPFIND sur `entretiens/`
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
