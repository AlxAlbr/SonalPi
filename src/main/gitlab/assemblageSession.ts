import {
  BailGitLab,
  cleRessourceBailGitLab,
  DepotCommitsGitLabClient,
  type DepotCommitsGitLab,
  type FileCommitsGitLab,
  type IdentiteBailGitLab,
} from './bailGitLab'
import { normaliserRacineGitLab } from '../distant/coffre'
import { ClientGitLab } from './client'
import { JournalPublicationGitLab, ReconciliateurPublicationGitLab } from './journalPublication'
import { JournalSessionsGitLab } from './journalSession'
import { PublieurGitLab } from './publication'
import { SessionGitLab } from './session'
import { StockageLocalEntretienGitLab } from './stockageSession'
import { verifierContenusReferencesDefinitions } from './referencesDefinitions'
import {
  DUREE_BAIL_GITLAB_MS,
  INTERVALLE_PUBLICATION_GITLAB_MS,
  MARGE_RENOUVELLEMENT_GITLAB_MS,
} from './parametresSession'

export interface OptionsAssemblageSessionGitLab {
  destinationId: string
  dirLocal: string
  client: ClientGitLab
  /** File de commits de la destination, partagée avec les autres sessions. */
  fileCommits?: FileCommitsGitLab
  branche: string
  racine?: string
  ressource: string
  cheminRelatif: string
  identite: () => IdentiteBailGitLab
  journalRepertoire: string
  journalSessions?: JournalSessionsGitLab
  maintenant?: () => number
  dureeBailMs?: number
  intervallePublicationMs?: number
  margeRenouvellementMs?: number
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
  const cheminCorpus = racine ? `${racine}/corpus.json` : 'corpus.json'
  const ressourcePartagee = cleRessourceBailGitLab(options.branche, cheminDistant)
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
    dureeBailMs: options.dureeBailMs ?? DUREE_BAIL_GITLAB_MS,
    ressourcesLegacy: [options.ressource],
    fileCommits: options.fileCommits,
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
    ressourcePartagee,
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
    maintenant,
    intervallePublicationMs: options.intervallePublicationMs ?? INTERVALLE_PUBLICATION_GITLAB_MS,
    margeRenouvellementMs: options.margeRenouvellementMs ?? MARGE_RENOUVELLEMENT_GITLAB_MS,
    preparerGardeDefinitions: async (contenuEntretien, contenuAvant) => {
      const corpus = await depot.lireFichier(cheminCorpus, options.branche)
      if (!corpus) throw new Error('Le fichier corpus.json est introuvable sur GitLab.')
      verifierContenusReferencesDefinitions(contenuEntretien, corpus.contenu, contenuAvant)
      return {
        action: 'update',
        chemin: cheminCorpus,
        contenu: corpus.contenu,
        commitId: corpus.commitId,
      }
    },
  })
  return { depot, coordination, publication, journal, journalSessions, reconciliateur, session }
}
