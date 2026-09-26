import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CorpusStore } from '../corpusStore'
import type {
  EntreeVerrouPublic,
  OrphelinDistant,
  ProgressionTransfert,
  ResultatFermetureSession,
  ResultatTiragePublic,
} from '../../shared/distant'
import type {
  CorpusFichier,
  OuvertureEntretienEdition,
} from '../../shared/format'
import type { ClientWebDAV } from '../webdav/client'
import { MiroirWebDAV } from './miroirWebDAV'
import {
  SessionsDEntretien,
  type IdentiteSession,
} from './sessions'
import { TransactionsCorpus } from './transactions'
import { PresenceDistante } from './presence'
import { LecteurWebDAV } from './lecteurWebDAV'
import { TransfertWebDAV } from './transfertWebDAV'
import type {
  ResultatTeleversement,
  SurProgressionFichier,
} from './transfert'
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
    const observation = await this.coordination.observerVerrous()
    return {
      telecharges: tirage.telecharges,
      corbeille: tirage.corbeille,
      verrous: observation.entrees,
      verrousIndisponibles: observation.indisponible || undefined,
      presences: await this.presence.lister(),
      inaccessibles: tirage.inaccessibles.length > 0 ? tirage.inaccessibles : undefined,
      date: tirage.date,
    }
  }

  /** Ouvre un entretien après acquisition de son droit d'édition. */
  async ouvrirEntretienPourEdition(id: string): Promise<OuvertureEntretienEdition> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    const etat = await this.sessions.ouvrir(id)
    if (etat.etat !== 'a-nous') {
      const lecture = this.store.lireEntretien(id)
      if (!lecture.ok) return lecture
      return {
        ...lecture,
        acces: 'lecture-seule',
        verrouTenuParAutrui:
          etat.etat === 'tenu-par-autrui' && etat.tenuPar
            ? {
                userId: etat.tenuPar.userId,
                machineId: etat.tenuPar.machineId,
                acquiredAt: etat.tenuPar.acquiredAt,
              }
            : null,
      }
    }
    try {
      this.store.autoriserEcritureEntretien(id)
      const lecture = this.store.ouvrirEntretienPourEdition(id)
      if (!lecture.ok) {
        this.store.revoquerEcritureEntretien(id)
        await this.sessions.fermer(id)
        return lecture
      }
      return { ...lecture, acces: 'edition' }
    } catch (erreur) {
      this.store.revoquerEcritureEntretien(id)
      await this.sessions.fermer(id)
      throw erreur
    }
  }

  /** Publie puis ferme la session d'un entretien. */
  async fermerEntretien(id: string): Promise<ResultatFermetureSession> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    this.store.revoquerEcritureEntretien(id)
    const resultat = await this.sessions.fermer(id)
    if (!resultat.fermee && this.sessions.etat(id).etat === 'a-nous') {
      this.store.autoriserEcritureEntretien(id)
    }
    return resultat
  }

  /** Exécute une mutation des définitions avec les gardes distantes. */
  async executerDefinitions<T>(mutation: () => T): Promise<T> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.transactions.executer(mutation)
  }

  /** Liste un dossier de la destination courante pour les sélecteurs. */
  async listerDossier(dossier: string): Promise<{ nom: string; dossier: boolean }[]> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.miroir.listerDossier(dossier)
  }

  /** Désigne un média partagé par une session courte. */
  async designerAudio(
    id: string,
    cheminAudio: string,
  ): Promise<{ ok: boolean; raison?: string }> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.sessions.designerAudio(id, cheminAudio)
  }

  /** Téléverse un fichier vers la destination du contexte. */
  async televerserFichier(
    cheminCible: string,
    sourceLocale: string,
    contentType: string,
    surProgression?: SurProgressionFichier,
  ): Promise<ResultatTeleversement> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.miroir.televerserFichier(
      cheminCible,
      sourceLocale,
      contentType,
      surProgression,
    )
  }

  /** Publie l'état local d'un entretien sous son droit d'édition. */
  async publierEntretien(id: string): Promise<{ ok: boolean; raison?: string }> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.sessions.publier(id)
  }

  /** Retourne les sessions d'un lancement précédent récupérables. */
  async listerOrphelins(): Promise<OrphelinDistant[]> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    const liste = await this.sessions.orphelins()
    return liste.map(({ cheminVerrou, id, verrou }) => ({
      cheminVerrou,
      id,
      userId: verrou.userId,
      machineId: verrou.machineId,
      acquiredAt: verrou.acquiredAt,
    }))
  }

  /** Reprend et publie une session récupérable. */
  async reprendreOrphelin(
    cheminVerrou: string,
  ): Promise<{ ok: boolean; raison?: string }> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.sessions.reprendreOrphelin(cheminVerrou)
  }

  /** Libère une session récupérable sans publier sa copie locale. */
  async abandonnerOrphelin(cheminVerrou: string): Promise<void> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    await this.sessions.abandonnerOrphelin(cheminVerrou)
  }

  /** Met à jour la présence informative du poste. */
  async noterEntretienOuvert(id: string | null): Promise<void> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    await this.presence.noterEntretienOuvert(id)
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
  verrousIndisponibles?: boolean
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
  const observation = await coordination.observerVerrous()

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
    verrous: observation.entrees,
    verrousIndisponibles: observation.indisponible || undefined,
    inaccessibles: tirage.inaccessibles.length > 0 ? tirage.inaccessibles : undefined,
  }
}
