import {
  BailGitLab,
  DepotCommitsGitLabClient,
  type DepotCommitsGitLab,
  type IdentiteBailGitLab,
} from './bailGitLab'
import { normaliserRacineGitLab } from '../distant/coffre'
import { ClientGitLab } from './client'
import { JournalPublicationGitLab, ReconciliateurPublicationGitLab } from './journalPublication'
import { JournalSessionsGitLab } from './journalSession'
import { PublieurGitLab } from './publication'
import { SessionGitLab } from './session'
import { StockageLocalEntretienGitLab } from './stockageSession'

export interface OptionsAssemblageSessionGitLab {
  destinationId: string
  dirLocal: string
  client: ClientGitLab
  branche: string
  racine?: string
  ressource: string
  cheminRelatif: string
  identite: () => IdentiteBailGitLab
  journalRepertoire: string
  journalSessions?: JournalSessionsGitLab
  maintenant?: () => number
  dureeBailMs?: number
  repriseExplicite?: boolean
  nouvelleOperation?: () => string
}

export interface AssemblageSessionGitLab {
  depot: DepotCommitsGitLab
  coordination: BailGitLab
  publication: PublieurGitLab
  journal: JournalPublicationGitLab
  journalSessions: JournalSessionsGitLab
  reconciliateur: ReconciliateurPublicationGitLab
  session: SessionGitLab
}

/** Assemble les ports GitLab sans les exposer au renderer. */
export function assemblerSessionGitLab(
  options: OptionsAssemblageSessionGitLab,
): AssemblageSessionGitLab {
  const maintenant = options.maintenant ?? Date.now
  const racine = normaliserRacineGitLab(options.racine ?? '')
  const cheminDistant = racine ? `${racine}/${options.cheminRelatif}` : options.cheminRelatif
  const depot = new DepotCommitsGitLabClient(options.client)
  const journal = new JournalPublicationGitLab(
    options.destinationId,
    options.journalRepertoire,
    () => new Date(maintenant()),
  )
  const journalSessions = options.journalSessions ?? new JournalSessionsGitLab(
    options.destinationId,
    options.journalRepertoire,
    () => new Date(maintenant()),
  )
  const coordination = new BailGitLab({
    branche: options.branche,
    depot,
    identite: options.identite,
    maintenant,
    dureeBailMs: options.dureeBailMs,
  })
  const publication = new PublieurGitLab({
    branche: options.branche,
    depot,
    coordination,
    journal,
  })
  const reconciliateur = new ReconciliateurPublicationGitLab(depot, journal)
  const session = new SessionGitLab({
    id: options.destinationId,
    ressource: options.ressource,
    cheminRelatif: options.cheminRelatif,
    cheminDistant,
    branche: options.branche,
    depot,
    coordination,
    publication,
    stockageLocal: new StockageLocalEntretienGitLab(
      options.dirLocal,
      options.cheminRelatif,
    ),
    journal,
    journalSessions,
    reconciliateur,
    repriseExplicite: options.repriseExplicite,
    nouvelleOperation: options.nouvelleOperation,
  })
  return { depot, coordination, publication, journal, journalSessions, reconciliateur, session }
}
