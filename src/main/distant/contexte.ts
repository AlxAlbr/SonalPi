import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CorpusStore } from '../corpusStore'
import type {
  EntreeVerrouPublic,
  ProgressionTransfert,
  ResultatTiragePublic,
} from '../../shared/distant'
import type { CorpusFichier } from '../../shared/format'
import type { ClientWebDAV } from '../webdav/client'
import { MiroirWebDAV } from './miroir'
import {
  SessionsDEntretien,
  type IdentiteSession,
} from './sessions'
import { TransactionsCorpus } from './transactions'
import { PresenceDistante } from './presence'
import { LecteurWebDAV } from './lecteurWebDAV'
import { TransfertWebDAV } from './transfertWebDAV'
import type { ObservationCoordinationDistante } from './coordination'
import { ObservationVerrousWebDAV } from './observationVerrousWebDAV'

/** Services d'un corpus distant assemblés pour une même destination. */
export class ContexteCorpusDistant {
  private demarre = false
  private termine = false

  constructor(
    public readonly id: string,
    public readonly store: CorpusStore,
    public readonly miroir: MiroirWebDAV,
    public readonly sessions: SessionsDEntretien,
    public readonly transactions: TransactionsCorpus,
    public readonly presence: PresenceDistante,
    private readonly coordination: ObservationCoordinationDistante,
  ) {}

  get dirLocal(): string {
    return this.miroir.dirLocal
  }

  /** Active les tâches de fond seulement après la bascule vers ce contexte. */
  demarrer(): void {
    if (this.demarre || this.termine) return
    this.demarre = true
    this.presence.demarrer()
  }

  /** Actualise le miroir sans toucher aux copies détenues par une session. */
  async actualiser(): Promise<ResultatTiragePublic> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    const exclus = this.sessions.idsTenus().map((id) => `entretiens/${id}.json`)
    const tirage = await this.miroir.tirer(exclus)
    return {
      telecharges: tirage.telecharges,
      corbeille: tirage.corbeille,
      verrous: await this.coordination.observerVerrous(),
      presences: await this.presence.lister(),
      inaccessibles: tirage.inaccessibles.length > 0 ? tirage.inaccessibles : undefined,
      date: tirage.date,
    }
  }

  /** Publie et libère toutes les sessions avant de terminer le contexte. */
  async fermer(): Promise<void> {
    if (this.termine) return
    const ids = this.sessions.idsTenus()
    for (const id of ids) this.store.revoquerEcritureEntretien(id)
    const bilan = await this.sessions.fermerToutes()
    if (bilan.bloquees.length > 0) {
      for (const blocage of bilan.bloquees) {
        if (this.sessions.etat(blocage.id).etat === 'a-nous') {
          this.store.autoriserEcritureEntretien(blocage.id)
        }
      }
      const detail = bilan.bloquees
        .map((blocage) => `${blocage.id} (${blocage.raison})`)
        .join(', ')
      throw new Error(`Changement de corpus refusé : sessions non fermées : ${detail}.`)
    }
    this.presence.arreter()
    this.sessions.dispose()
    this.termine = true
  }

  /** Arrête la présence lors d'une fermeture forcée, sans masquer les sessions. */
  arreterPresence(): void {
    this.presence.arreter()
  }
}

export interface OptionsPreparationContexteNextcloud {
  id: string
  dirLocal: string
  client: ClientWebDAV
  identite: () => IdentiteSession
  verrouNatif: boolean
  exclusionsSupplementaires?: string[]
  surProgression?: (progression: ProgressionTransfert) => void
  surRetrogradation?: (id: string) => void
  surPublication?: (id: string, date: string) => void
}

export interface PreparationContexteDistant {
  contexte: ContexteCorpusDistant
  corpus: CorpusFichier
  verrous: EntreeVerrouPublic[]
  inaccessibles?: { chemin: string; raison: string }[]
}

/** Prépare entièrement un contexte Nextcloud sans activer ses tâches de fond. */
export async function preparerContexteNextcloud(
  options: OptionsPreparationContexteNextcloud,
): Promise<PreparationContexteDistant> {
  const lecture = new LecteurWebDAV(options.client)
  const transfert = new TransfertWebDAV(options.client)
  const miroir = new MiroirWebDAV(
    options.client,
    options.dirLocal,
    options.surProgression,
    lecture,
    { fournisseur: 'webdav', destinationId: options.id },
    transfert,
  )
  let store: CorpusStore | null = null
  const sessions = new SessionsDEntretien(
    options.client,
    miroir,
    options.identite,
    (id) => {
      store?.revoquerEcritureEntretien(id)
      options.surRetrogradation?.(id)
    },
    options.surPublication,
    { verrouNatif: options.verrouNatif },
  )

  const idsExclus = new Set([
    ...sessions.idsRecuperablesLocalement(),
    ...(options.exclusionsSupplementaires ?? []),
  ])
  for (const orphelin of await sessions.orphelins()) idsExclus.add(orphelin.id)
  const tirage = await miroir.tirer(
    [...idsExclus].map((id) => `entretiens/${id}.json`),
  )
  if (!existsSync(join(options.dirLocal, 'corpus.json'))) {
    throw new Error(
      "Le dossier distant ne contient pas de corpus.json — ce n'est pas (encore) un corpus Sonal.",
    )
  }

  const magasin = new CorpusStore(options.dirLocal)
  magasin.lectureSeule = true
  store = magasin
  const transactions = new TransactionsCorpus(
    options.client,
    miroir,
    () => magasin,
    options.identite,
    {
      verrouNatif: options.verrouNatif,
      getSessions: () => sessions,
    },
  )
  const presence = new PresenceDistante(options.client, options.identite)
  const coordination = new ObservationVerrousWebDAV(
    options.client,
    sessions,
    options.verrouNatif,
  )
  await transactions.migrerFormatSiNecessaire()
  await transactions.reconcilierFichiersOrphelins()
  const corpus = magasin.ouvrir()
  const verrous = await coordination.observerVerrous()

  return {
    contexte: new ContexteCorpusDistant(
      options.id,
      magasin,
      miroir,
      sessions,
      transactions,
      presence,
      coordination,
    ),
    corpus,
    verrous,
    inaccessibles: tirage.inaccessibles.length > 0 ? tirage.inaccessibles : undefined,
  }
}
