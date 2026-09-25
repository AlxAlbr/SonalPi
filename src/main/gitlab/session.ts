import { randomUUID } from 'node:crypto'
import {
  BailGitLab,
  type DepotCommitsGitLab,
  type DroitsEditionGitLab,
  type PartieBailGitLab,
} from './bailGitLab'
import {
  PublieurGitLab,
  type PlanPublicationGitLab,
  type ResultatPublicationGitLab,
} from './publication'
import {
  ReconciliateurPublicationGitLab,
  type JournalPublicationGitLab,
} from './journalPublication'
import { FORMAT_VERSION } from '../../shared/format'
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
}

interface SessionOuverte {
  droit: DroitsEditionGitLab
  commitId: string
  contenuPublie: string
  revision: number
  revisionPubliee: number
  degrade: boolean
  raisonDegradation: RaisonDegradationSession | null
}

export class SessionGitLab {
  private readonly nouvelleOperation: () => string
  private session: SessionOuverte | null = null
  private readonly operations = new Map<string, Promise<unknown>>()

  constructor(private readonly options: OptionsSessionGitLab) {
    if (!options.id || !options.ressource || !options.cheminDistant) {
      throw new Error('Session GitLab incomplète.')
    }
    verifierCheminDistant(options.cheminDistant)
    this.nouvelleOperation = options.nouvelleOperation ?? (() => `session-${randomUUID()}`)
  }

  async ouvrir(): Promise<EtatSessionGitLab> {
    return this.serialiser('ouvrir', async () => {
      if (this.session) return this.etat()
      let acquisition = await this.options.coordination.acquireRessource(this.options.ressource)
      if (!acquisition.ok && this.options.repriseExplicite) {
        acquisition = await this.options.coordination.reprendreRessource(this.options.ressource)
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
        if (!contenu || typeof contenu !== 'object' || (contenu as { formatVersion?: unknown }).formatVersion !== FORMAT_VERSION) {
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
            if (contenuCandidat.formatVersion !== FORMAT_VERSION) {
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
          revision,
          revisionPubliee: 0,
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
    this.options.journalSessions?.majCandidat(
      this.options.ressource,
      await this.options.stockageLocal.lire(),
    )
    session.revision += 1
  }

  async publier(): Promise<ResultatPublicationGitLab> {
    return this.serialiser('publier', async () => {
      const session = this.session
      if (!session || session.degrade) {
        return { statut: 'refuse', raison: 'droit-perdu' }
      }
      const contenu = await this.options.stockageLocal.lire()
      if (contenu === session.contenuPublie) {
        session.revisionPubliee = session.revision
        return { statut: 'confirme', commitId: session.commitId, compteurBail: this.compteur() }
      }
      const revisionAuDepart = session.revision
      const plan: PlanPublicationGitLab = {
        operationId: this.nouvelleOperation(),
        actions: [{
          action: 'update',
          chemin: this.options.cheminDistant,
          contenu,
          commitId: session.commitId,
        }],
      }
      const resultat = await this.options.publication.publierSousDroit(plan, session.droit)
      if (resultat.statut === 'confirme') {
        session.commitId = resultat.commitId
        session.contenuPublie = contenu
        session.revisionPubliee = Math.max(session.revisionPubliee, revisionAuDepart)
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
    })
  }

  async renouveler(): Promise<boolean> {
    return this.serialiser('renouveler', async () => {
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
    })
  }

  async fermer(): Promise<ResultatFermetureSessionGitLab> {
    return this.serialiser('fermer', async () => {
      const session = this.session
      if (!session) return { fermee: true }
      if (session.degrade) return { fermee: false, raison: 'degrade' }
      if (session.contenuPublie !== await this.options.stockageLocal.lire()) {
        const resultat = await this.publier()
        if (resultat.statut !== 'confirme') {
          return { fermee: false, raison: resultat.statut === 'refuse' && resultat.raison === 'droit-perdu' ? 'bail-perdu' : 'publication' }
        }
      }
      if (session.contenuPublie !== await this.options.stockageLocal.lire()) {
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
  }

  etat(): EtatSessionGitLab {
    const session = this.session
    if (!session) return { etat: 'lecture-seule', raison: 'bail', tenupar: null }
    if (session.degrade) {
      return { etat: 'degrade', raison: session.raisonDegradation ?? 'droit-perdu' }
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

  private compteur(): number {
    return this.session ? this.options.coordination.snapshot(this.session.droit).compteur : 0
  }

  private async serialiser<T>(cle: string, operation: () => Promise<T>): Promise<T> {
    const precedente = this.operations.get(cle) ?? Promise.resolve()
    let liberer!: () => void
    const attente = new Promise<void>((resolve) => { liberer = resolve })
    const file = precedente.catch(() => undefined).then(() => attente)
    this.operations.set(cle, file)
    await precedente.catch(() => undefined)
    try {
      return await operation()
    } finally {
      liberer()
      if (this.operations.get(cle) === file) this.operations.delete(cle)
    }
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
