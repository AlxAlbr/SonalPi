import { randomUUID } from 'node:crypto'
import {
  BailGitLab,
  type BailObserveGitLab,
  type DepotCommitsGitLab,
  type DroitsEditionGitLab,
  type PartieBailGitLab,
} from './bailGitLab'
import {
  PublieurGitLab,
  type ActionPlanGitLab,
  type PlanPublicationGitLab,
  type ResultatPublicationGitLab,
} from './publication'
import { ReferencesDefinitionsInvalidesError } from './referencesDefinitions'
import {
  ReconciliateurPublicationGitLab,
  type JournalPublicationGitLab,
} from './journalPublication'
import { versionSupportee } from '../../shared/format'
import type { RaisonDegradationSession } from '../../shared/distant'
import { JournalSessionsGitLab, sha256Session } from './journalSession'

export interface StockageLocalSessionGitLab {
  lire(): Promise<string>
  ecrire(contenu: string): Promise<void>
}

export type EtatSessionGitLab =
  | { etat: 'lecture-seule'; raison: 'bail'; tenupar: PartieBailGitLab | null }
  | { etat: 'edition'; revision: number; revisionPubliee: number }
  | { etat: 'degrade'; raison: 'droit-perdu' | 'conflit' | 'droits' | 'limite' | 'indetermine' | 'reseau' }

export type ResultatFermetureSessionGitLab =
  | { fermee: true }
  | { fermee: false; raison: 'publication' | 'bail-perdu' | 'degrade' }

export interface OptionsSessionGitLab {
  id: string
  ressource: string
  ressourcePartagee?: string
  cheminRelatif: string
  cheminDistant: string
  branche: string
  depot: DepotCommitsGitLab
  coordination: BailGitLab
  publication: PublieurGitLab
  stockageLocal: StockageLocalSessionGitLab
  journal?: JournalPublicationGitLab
  journalSessions?: JournalSessionsGitLab
  reconciliateur?: ReconciliateurPublicationGitLab
  repriseExplicite?: boolean
  nouvelleOperation?: () => string
  maintenant?: () => number
  intervallePublicationMs?: number
  margeRenouvellementMs?: number
  /** Valide le candidat contre le corpus courant et fournit sa garde. */
  preparerGardeDefinitions?: (contenuEntretien: string, contenuAvant: string) => Promise<ActionPlanGitLab>
}

interface SessionOuverte {
  droit: DroitsEditionGitLab
  commitId: string
  contenuPublie: string
  contenuCapture: string
  revision: number
  revisionDemandee: number
  revisionCapturee: number
  revisionPubliee: number
  dernierePublication: number
  degrade: boolean
  raisonDegradation: RaisonDegradationSession | null
}

export class SessionGitLab {
  private readonly nouvelleOperation: () => string
  private readonly maintenant: () => number
  private readonly intervallePublicationMs: number
  private readonly margeRenouvellementMs: number
  private session: SessionOuverte | null = null
  private operations: Promise<void> = Promise.resolve()
  private readonly marquesEnCours = new Set<Promise<void>>()

  constructor(private readonly options: OptionsSessionGitLab) {
    if (!options.id || !options.ressource || !options.cheminDistant) {
      throw new Error('Session GitLab incomplète.')
    }
    verifierCheminDistant(options.cheminDistant)
    this.nouvelleOperation = options.nouvelleOperation ?? (() => `session-${randomUUID()}`)
    this.maintenant = options.maintenant ?? Date.now
    this.intervallePublicationMs = options.intervallePublicationMs ?? 2 * 60 * 1000
    this.margeRenouvellementMs = options.margeRenouvellementMs ?? 5 * 60 * 1000
    if (
      !Number.isSafeInteger(this.intervallePublicationMs) ||
      this.intervallePublicationMs < 1_000 ||
      !Number.isSafeInteger(this.margeRenouvellementMs) ||
      this.margeRenouvellementMs < 0
    ) {
      throw new Error('Rythmes de session GitLab invalides.')
    }
  }

  async ouvrir(): Promise<EtatSessionGitLab> {
    return this.serialiser(async () => {
      if (this.session) return this.etat()
      const ressourceBail = this.options.ressourcePartagee ?? this.options.ressource
      let acquisition = await this.options.coordination.acquireRessource(ressourceBail)
      if (!acquisition.ok && this.options.repriseExplicite) {
        acquisition = await this.options.coordination.reprendreRessource(ressourceBail)
      }
      if (!acquisition.ok) {
        return { etat: 'lecture-seule', raison: 'bail', tenupar: acquisition.tenupar }
      }
      try {
        const distant = await this.options.depot.lireFichier(
          this.options.cheminDistant,
          this.options.branche,
        )
        if (!distant) throw new Error('Entretien GitLab introuvable après acquisition.')
        const reprise = this.options.journalSessions?.lire(this.options.ressource)
        if (reprise && (
          reprise.cheminRelatif !== this.options.cheminRelatif ||
          reprise.cheminDistant !== this.options.cheminDistant ||
          reprise.branche !== this.options.branche
        )) {
          throw new Error('Reprise GitLab incohérente avec la session courante.')
        }
        let contenu: unknown
        try {
          contenu = JSON.parse(distant.contenu)
        } catch {
          throw new Error('Entretien GitLab illisible après acquisition.')
        }
        if (!contenu || typeof contenu !== 'object' || !versionSupportee((contenu as { formatVersion?: unknown }).formatVersion)) {
          throw new Error('Version d’entretien GitLab non prise en charge.')
        }
        let contenuLocal = distant.contenu
        let revision = 0
        if (reprise) {
          const candidat = this.options.journalSessions!.chargerCandidat(reprise)
          if (sha256Session(distant.contenu) !== reprise.baseSha256) {
            throw new Error('Reprise GitLab en conflit avec la version distante.')
          }
          contenuLocal = candidat
          try {
            const contenuCandidat = JSON.parse(candidat) as { formatVersion?: unknown }
            if (!versionSupportee(contenuCandidat.formatVersion)) {
              throw new Error('Version de reprise GitLab non prise en charge.')
            }
          } catch {
            throw new Error('Copie de reprise GitLab illisible.')
          }
          if (candidat !== distant.contenu) revision = 1
        } else {
          this.options.journalSessions?.ouvrir(
            this.options.ressource,
            this.options.cheminRelatif,
            this.options.cheminDistant,
            this.options.branche,
            distant.commitId,
            distant.contenu,
          )
        }
        await this.options.stockageLocal.ecrire(contenuLocal)
        this.session = {
          droit: acquisition.droit,
          commitId: distant.commitId,
          contenuPublie: distant.contenu,
          contenuCapture: contenuLocal,
          revision,
          revisionDemandee: revision,
          revisionCapturee: revision,
          revisionPubliee: 0,
          dernierePublication: this.maintenant(),
          degrade: false,
          raisonDegradation: null,
        }
        return this.etat()
      } catch (erreur) {
        try {
          await this.options.coordination.liberer(acquisition.droit)
        } catch {
          /* Le bail sera observable au prochain démarrage. */
        }
        throw erreur
      }
    })
  }

  async marquerSale(): Promise<void> {
    const session = this.session
    if (!session || session.degrade) return
    const revision = ++session.revisionDemandee
    const marque = (async () => {
      const contenu = await this.options.stockageLocal.lire()
      if (this.session !== session || revision < session.revisionDemandee) return
      this.options.journalSessions?.majCandidat(this.options.ressource, contenu)
      session.contenuCapture = contenu
      session.revisionCapturee = revision
      session.revision = Math.max(session.revision, revision)
    })()
    this.marquesEnCours.add(marque)
    try {
      await marque
    } finally {
      this.marquesEnCours.delete(marque)
    }
  }

  async preserverCandidat(): Promise<boolean> {
    const session = this.session
    if (!session) return false
    const contenu = await this.options.stockageLocal.lire()
    this.options.journalSessions?.majCandidat(this.options.ressource, contenu)
    session.contenuCapture = contenu
    session.revision = Math.max(session.revision, session.revisionDemandee) + 1
    session.revisionDemandee = session.revision
    session.revisionCapturee = session.revision
    return true
  }

  async publier(): Promise<ResultatPublicationGitLab> {
    return this.serialiser(() => this.publierInterne())
  }

  private async publierInterne(): Promise<ResultatPublicationGitLab> {
    const session = this.session
    if (!session || session.degrade) {
      return { statut: 'refuse', raison: 'droit-perdu' }
    }
    await this.attendreMarques()
    const contenu = session.contenuCapture
    const revisionAuDepart = session.revisionCapturee
    if (contenu === session.contenuPublie) {
      session.revisionPubliee = Math.max(session.revisionPubliee, revisionAuDepart)
      session.dernierePublication = this.maintenant()
      return { statut: 'confirme', commitId: session.commitId, compteurBail: this.compteur() }
    }
    let resultat = await this.publierCandidat(session, contenu)
    if (
      resultat.statut === 'refuse' &&
      resultat.raison === 'conflit' &&
      this.options.preparerGardeDefinitions &&
      await this.reprendreApresConflitDeDefinitions(session)
    ) {
      resultat = await this.publierCandidat(session, contenu)
    }
    if (resultat.statut === 'confirme') {
      session.commitId = resultat.commitId
      session.contenuPublie = contenu
      session.revisionPubliee = Math.max(session.revisionPubliee, revisionAuDepart)
      session.dernierePublication = this.maintenant()
      const reprise = this.options.journalSessions?.lire(this.options.ressource)
      if (reprise) {
        this.options.journalSessions?.confirmerPublication(
          reprise.resourceHash,
          resultat.commitId,
          contenu,
        )
      }
      return resultat
    }
    if (resultat.statut === 'refuse' && resultat.raison === 'references') {
      return resultat
    }
    session.degrade = true
    session.raisonDegradation = resultat.statut === 'indetermine'
      ? 'indetermine'
      : resultat.raison === 'droit-perdu'
        ? 'droit-perdu'
        : resultat.raison === 'droits'
          ? 'droits'
          : resultat.raison === 'limite'
            ? 'limite'
            : 'conflit'
    return resultat
  }

  async revalider(): Promise<boolean> {
    return this.serialiser(async () => {
      const session = this.session
      if (!session || session.degrade) return false
      try {
        if (!await this.options.coordination.revalider(session.droit)) {
          session.degrade = true
          session.raisonDegradation = 'droit-perdu'
          return false
        }
        const distant = await this.options.depot.lireFichier(
          this.options.cheminDistant,
          this.options.branche,
        )
        if (!distant || distant.commitId !== session.commitId) {
          session.degrade = true
          session.raisonDegradation = 'conflit'
          return false
        }
        return true
      } catch {
        session.degrade = true
        session.raisonDegradation = 'reseau'
        return false
      }
    })
  }

  async publierPeriodique(): Promise<ResultatPublicationGitLab | null> {
    return this.serialiser(async () => {
      const session = this.session
      if (!session || session.degrade) return null
      const maintenant = this.maintenant()
      const bail = this.options.coordination.snapshot(session.droit)
      const doitPublier = session.revision > session.revisionPubliee &&
        (maintenant - session.dernierePublication >= this.intervallePublicationMs ||
          bail.expireLe - maintenant <= this.margeRenouvellementMs)
      return doitPublier ? this.publierInterne() : null
    })
  }

  async renouvelerSiNecessaire(): Promise<boolean> {
    return this.serialiser(async () => {
      const session = this.session
      if (!session || session.degrade) return false
      const bail = this.options.coordination.snapshot(session.droit)
      if (session.revision > session.revisionPubliee) return false
      if (bail.expireLe - this.maintenant() > this.margeRenouvellementMs) return false
      return this.renouvelerInterne()
    })
  }

  async renouveler(): Promise<boolean> {
    return this.serialiser(() => this.renouvelerInterne())
  }

  private async renouvelerInterne(): Promise<boolean> {
    const session = this.session
    if (!session || session.degrade) return false
    try {
      const renouvele = await this.options.coordination.renouveler(session.droit)
      if (!renouvele) {
        session.degrade = true
        session.raisonDegradation = 'droit-perdu'
      }
      return renouvele
    } catch {
      session.degrade = true
      session.raisonDegradation = 'reseau'
      return false
    }
  }

  async fermer(): Promise<ResultatFermetureSessionGitLab> {
    return this.serialiser(async () => {
      const session = this.session
      if (!session) return { fermee: true }
      await this.attendreMarques()
      if (session.degrade) return { fermee: false, raison: 'degrade' }
      if (session.contenuPublie !== session.contenuCapture) {
        const resultat = await this.publierInterne()
        if (resultat.statut !== 'confirme') {
          return { fermee: false, raison: resultat.statut === 'refuse' && resultat.raison === 'droit-perdu' ? 'bail-perdu' : 'publication' }
        }
      }
      if (session.contenuPublie !== session.contenuCapture) {
        return { fermee: false, raison: 'publication' }
      }
      await this.options.coordination.liberer(session.droit)
      this.options.journalSessions?.supprimer(this.options.ressource)
      this.session = null
      return { fermee: true }
    })
  }

  async reconcilierOperationsPending(): Promise<Array<{
    operationId: string
    resultat: Awaited<ReturnType<ReconciliateurPublicationGitLab['reconcilier']>>
  }>> {
    return this.serialiser(async () => {
      if (!this.options.journal || !this.options.reconciliateur) return []
      const resultats: Array<{
        operationId: string
        resultat: Awaited<ReturnType<ReconciliateurPublicationGitLab['reconcilier']>>
      }> = []
      for (const entree of this.options.journal.lister()) {
        const resultat = await this.options.reconciliateur.reconcilier(entree)
        resultats.push({ operationId: entree.operationId, resultat })
        if (resultat.statut === 'confirme') this.options.journal.supprimer(entree.operationId)
      }
      return resultats
    })
  }

  etat(): EtatSessionGitLab {
    const session = this.session
    if (!session) return { etat: 'lecture-seule', raison: 'bail', tenupar: null }
    if (session.degrade) {
      return { etat: 'degrade', raison: session.raisonDegradation ?? 'droit-perdu' }
    }
    if (this.options.coordination.snapshot(session.droit).expireLe <= this.maintenant()) {
      session.degrade = true
      session.raisonDegradation = 'droit-perdu'
      return { etat: 'degrade', raison: 'droit-perdu' }
    }
    return {
      etat: 'edition',
      revision: session.revision,
      revisionPubliee: session.revisionPubliee,
    }
  }

  droit(): DroitsEditionGitLab | null {
    return this.session?.droit ?? null
  }

  /** Indique si un bail observé est bien celui de cette session active. */
  tientBail(bail: BailObserveGitLab): boolean {
    const session = this.session
    if (!session || session.degrade || bail.legacy) return false
    try {
      const local = this.options.coordination.snapshot(session.droit)
      return local.expireLe > this.maintenant() &&
        bail.generation === local.generation &&
        bail.userId === local.identite.userId &&
        bail.machineId === local.identite.machineId &&
        bail.sessionId === local.identite.sessionId
    } catch {
      return false
    }
  }

  /** Valide les définitions et publie dans la même section critique locale. */
  private publierCandidat(
    session: SessionOuverte,
    contenu: string,
  ): Promise<ResultatPublicationGitLab> {
    return this.options.coordination.serierCommit(async () => {
      let gardeDefinitions: ActionPlanGitLab | null = null
      try {
        gardeDefinitions = await this.options.preparerGardeDefinitions?.(contenu, session.contenuPublie) ?? null
      } catch (erreur) {
        if (erreur instanceof ReferencesDefinitionsInvalidesError) {
          return { statut: 'refuse', raison: 'references', message: erreur.message } as const
        }
        throw erreur
      }
      const plan: PlanPublicationGitLab = {
        operationId: this.nouvelleOperation(),
        nature: 'session-entretien',
        actions: [
          {
            action: 'update',
            chemin: this.options.cheminDistant,
            contenu,
            commitId: session.commitId,
          },
          ...(gardeDefinitions ? [gardeDefinitions] : []),
        ],
      }
      return this.options.publication.publierSousDroit(plan, session.droit)
    })
  }

  /** Un autre poste a pu modifier seulement le corpus entre validation et
   *  commit. Si l'entretien et le bail n'ont pas bougé, la validation peut
   *  repartir une fois sur les définitions fraîches. */
  private async reprendreApresConflitDeDefinitions(
    session: SessionOuverte,
  ): Promise<boolean> {
    try {
      const entretien = await this.options.depot.lireFichier(
        this.options.cheminDistant,
        this.options.branche,
      )
      if (!entretien || entretien.commitId !== session.commitId) return false
      if (!await this.options.coordination.revalider(session.droit)) return false
      this.options.coordination.reprendreApresConflitNeutre(session.droit)
      return true
    } catch {
      return false
    }
  }

  private compteur(): number {
    return this.session ? this.options.coordination.snapshot(this.session.droit).compteur : 0
  }

  private async attendreMarques(): Promise<void> {
    while (this.marquesEnCours.size > 0) {
      await Promise.allSettled([...this.marquesEnCours])
    }
  }

  private serialiser<T>(operation: () => Promise<T>): Promise<T> {
    const resultat = this.operations.then(operation, operation)
    this.operations = resultat.then(() => undefined, () => undefined)
    return resultat
  }
}

function verifierCheminDistant(chemin: string): void {
  if (
    !chemin ||
    chemin.startsWith('/') ||
    chemin.includes('\\') ||
    chemin.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Chemin GitLab invalide : ${chemin}.`)
  }
}
