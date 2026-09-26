import { join } from 'node:path'
import type { EntreeVerrouPublic, OuvertureDistante } from '../../shared/distant'
import type { CorpusFichier } from '../../shared/format'
import { squeletteCorpus } from '../../shared/corpus/squelette'
import type {
  DemandeCreationGitLab,
  DemandeOuvertureGitLab,
  DestinationGitLabPublic,
} from '../../shared/gitlab'
import {
  idDeDestinationGitLab,
  normaliserRacineGitLab,
  type CoffreComptes,
  type ConfigCompteGitLab,
  type ConfigDestinationGitLab,
} from '../distant/coffre'
import { createHash } from 'node:crypto'
import type { ClientGitLab } from './client'
import {
  BailGitLab,
  DepotCommitsGitLabClient,
  cleRessourceBailGitLab,
  type IdentiteBailGitLab,
} from './bailGitLab'
import { type ContexteGitLab, preparerContexteGitLabLectureSeule } from './contexte'
import {
  JournalPublicationGitLab,
  ReconciliateurPublicationGitLab,
  type EntreeJournalPublication,
} from './journalPublication'
import { JournalSessionsGitLab } from './journalSession'
import { assemblerSessionGitLab } from './assemblageSession'
import type { ServiceAuthentificationGitLab } from './authentification'
import { matriceCapacites } from './politiqueGestes'
import { PublieurGitLab } from './publication'
import { TransactionsGitLab } from './transactions'

/** Destination GitLab enregistrée, rendue au renderer sans aucun secret. */
export function destinationGitLabPublique(
  coffre: CoffreComptes,
  destination: ConfigDestinationGitLab,
  connexionDisponible: (compteId: string) => boolean = () => false,
): DestinationGitLabPublic | null {
  const compte = coffre.listerComptesGitLab()
    .find((candidat) => candidat.id === destination.compteId)
  if (!compte) return null
  return {
    fournisseur: 'gitlab',
    id: destination.id,
    compteId: compte.id,
    urlInstance: compte.urlInstance,
    utilisateur: compte.utilisateur,
    projetId: destination.projetId,
    nomProjet: destination.nomProjet,
    branche: destination.branche,
    racine: destination.racine,
    connexionDisponible: connexionDisponible(compte.id),
  }
}

/** Miroir prêt et corpus lu : tout ce qu'il faut pour installer la destination. */
export interface PreparationOuvertureGitLab {
  contexte: ContexteGitLab
  corpus: CorpusFichier
  inaccessibles?: { chemin: string; raison: string }[]
  verrous?: EntreeVerrouPublic[]
  verrousIndisponibles?: boolean
  dirMiroir: string
}

/** Effets applicatifs et dépendances du service, explicites et remplaçables. */
export interface OptionsServiceOuvertureGitLab {
  coffre: CoffreComptes
  /** Propriétaire des credentials : fournit un client déjà autorisé. */
  authentification: ServiceAuthentificationGitLab
  /** Répertoire du profil : les miroirs et journaux d'opérations vivent dessous. */
  dirProfil: string
  /** Identité du poste et de la session en cours ;
   *  l'utilisateur du compte ouvert la complète. */
  identiteSession: { machineId: string; sessionId: string }
  /** Ferme l'ancien contexte courant ; un refus bloque toute installation. */
  fermerContexte: () => Promise<void>
  /** Installe le contexte préparé et l'ajoute aux récents du profil ;
   *  appelée après la fermeture réussie, jamais avant. */
  installer: (destination: ConfigDestinationGitLab, preparation: PreparationOuvertureGitLab) => void
  /** Couture de test : remplace la préparation complète d'une destination. */
  preparer?: (
    compte: ConfigCompteGitLab,
    destination: ConfigDestinationGitLab,
    client: ClientGitLab,
  ) => Promise<PreparationOuvertureGitLab>
  /** Transport injectable pour les tests ; le fetch global sinon. */
  fetchImpl?: typeof fetch
}

/** Création, enregistrement et ouverture des destinations GitLab. */
export class ServiceOuvertureGitLab {
  constructor(private readonly options: OptionsServiceOuvertureGitLab) {}

  /** Publie le squelette du corpus, puis rejoint le chemin commun
   *  d'ouverture d'une destination nouvelle. */
  async creerEtOuvrir(demande: DemandeCreationGitLab): Promise<OuvertureDistante> {
    if (!demande.nomCorpus.trim()) throw new Error('Nom du corpus GitLab manquant.')
    const racine = normaliserRacineGitLab(demande.racine ?? '')
    const cheminCorpus = racine ? `${racine}/corpus.json` : 'corpus.json'
    const compte = this.compte(demande.compteId)
    const client = await this.options.authentification.client(compte.id, demande.projetId)
    const depot = new DepotCommitsGitLabClient(client)
    if (await depot.lireFichier(cheminCorpus, demande.branche)) {
      throw new Error('Un corpus existe déjà à cet emplacement GitLab.')
    }
    const squelette = squeletteCorpus()
    squelette.nom = demande.nomCorpus.trim()
    await depot.publierCommit(
      demande.branche,
      `Sonal création ${racine || 'racine'}`,
      [{
        action: 'create',
        file_path: cheminCorpus,
        content: JSON.stringify(squelette, null, 2),
      }],
    )
    return this.ouvrirNouvelleDestination(demande, racine)
  }

  /** Enregistre une destination inconnue, puis l'ouvre. */
  async enregistrerEtOuvrir(demande: DemandeOuvertureGitLab): Promise<OuvertureDistante> {
    return this.ouvrirNouvelleDestination(
      demande,
      normaliserRacineGitLab(demande.racine ?? ''),
    )
  }

  /** Ouvre une destination enregistrée avec le credential du compte connecté. */
  async ouvrir(id: string): Promise<OuvertureDistante> {
    const destination = this.options.coffre.listerDestinationsGitLab()
      .find((candidate) => candidate.id === id)
    if (!destination) throw new Error('Destination GitLab inconnue.')
    const compte = this.compte(destination.compteId)
    const client = await this.options.authentification.client(compte.id, destination.projetId)
    const preparation = await this.preparer(compte, destination, client)
    return this.installer(destination, preparation)
  }

  /** Chemin commun aux parcours de création et d'enregistrement :
   *  préparer avec les candidats, enregistrer au coffre, installer.
   *  L'enregistrement n'a lieu qu'après une préparation réussie ;
   *  un échec d'enregistrement peut laisser le compte seul au coffre. */
  private async ouvrirNouvelleDestination(
    demande: DemandeOuvertureGitLab,
    racine: string,
  ): Promise<OuvertureDistante> {
    const compte = this.compte(demande.compteId)
    const destination = this.candidatDestination(demande, racine, compte.id)
    const client = await this.options.authentification.client(compte.id, demande.projetId)
    const preparation = await this.preparer(compte, destination, client)
    const destinationEnregistree = this.options.coffre.enregistrerDestinationGitLab({
      compteId: compte.id,
      projetId: demande.projetId,
      nomProjet: demande.nomProjet,
      branche: demande.branche,
      racine,
    })
    return this.installer(destinationEnregistree, preparation)
  }

  /** Ferme l'ancien contexte, fait installer le préparé puis construit
   *  le résultat public. Aucune installation si la fermeture échoue. */
  private async installer(
    destination: ConfigDestinationGitLab,
    preparation: PreparationOuvertureGitLab,
  ): Promise<OuvertureDistante> {
    await this.options.fermerContexte()
    this.options.installer(destination, preparation)
    const destinationPublique = destinationGitLabPublique(
      this.options.coffre,
      destination,
      (compteId) => this.options.authentification.aConnecte(compteId),
    )
    if (!destinationPublique) throw new Error('Compte GitLab inconnu.')
    return {
      dir: preparation.dirMiroir,
      nom: preparation.corpus.nom ?? destination.nomProjet,
      corpus: preparation.corpus,
      distant: destinationPublique,
      capacites: matriceCapacites('gitlab'),
      verrous: preparation.verrous ?? [],
      verrousIndisponibles: preparation.verrousIndisponibles,
      inaccessibles: preparation.inaccessibles,
    }
  }

  private preparer(
    compte: ConfigCompteGitLab,
    destination: ConfigDestinationGitLab,
    client: ClientGitLab,
  ): Promise<PreparationOuvertureGitLab> {
    if (this.options.preparer) {
      return this.options.preparer(compte, destination, client)
    }
    return preparerOuvertureDestination({
      destination,
      client,
      dirProfil: this.options.dirProfil,
      identite: () => ({
        userId: compte.utilisateur,
        machineId: this.options.identiteSession.machineId,
        sessionId: this.options.identiteSession.sessionId,
      }),
    })
  }

  private compte(compteId: string): ConfigCompteGitLab {
    const compte = this.options.coffre.listerComptesGitLab()
      .find((candidat) => candidat.id === compteId)
    if (!compte) throw new Error('Compte GitLab inconnu. Reconnectez-vous à GitLab.')
    return compte
  }

  private candidatDestination(
    demande: DemandeOuvertureGitLab,
    racine: string,
    compteId: string,
  ): ConfigDestinationGitLab {
    return {
      fournisseur: 'gitlab',
      id: idDeDestinationGitLab({
        compteId,
        projetId: demande.projetId,
        branche: demande.branche,
        racine,
      }),
      compteId,
      projetId: demande.projetId,
      nomProjet: demande.nomProjet.trim(),
      branche: demande.branche.trim(),
      racine,
    }
  }
}

/** Préparation réelle d'une destination : journaux et leur réconciliation,
 *  miroir et fabrique de sessions d'édition. */
async function preparerOuvertureDestination(options: {
  destination: ConfigDestinationGitLab
  client: ClientGitLab
  dirProfil: string
  identite: () => IdentiteBailGitLab
}): Promise<PreparationOuvertureGitLab> {
  const { client } = options
  const dirMiroir = join(options.dirProfil, 'miroirs', options.destination.id)
  const journalRepertoire = join(
    options.dirProfil,
    'operations-gitlab',
    options.destination.id,
  )
  const racine = normaliserRacineGitLab(options.destination.racine)
  const cheminCorpus = racine ? `${racine}/corpus.json` : 'corpus.json'
  const journal = new JournalPublicationGitLab(
    options.destination.id,
    journalRepertoire,
    undefined,
    {
      chemin: cheminCorpus,
      resourceHash: createHash('sha256')
        .update(cleRessourceBailGitLab(options.destination.branche, cheminCorpus), 'utf8')
        .digest('hex'),
    },
  )
  const journalSessions = new JournalSessionsGitLab(options.destination.id, journalRepertoire)
  const depot = new DepotCommitsGitLabClient(client)
  const reconciliateur = new ReconciliateurPublicationGitLab(depot, journal)
  for (const entree of journal.lister()) {
    await reconcilierPublication(entree, reconciliateur, journal, journalSessions)
  }
  const preparation = await preparerContexteGitLabLectureSeule({
    id: options.destination.id,
    dirLocal: dirMiroir,
    client,
    branche: options.destination.branche,
    racine: options.destination.racine,
    cheminsRecuperables: journalSessions.lister().map(({ cheminRelatif }) => cheminRelatif),
    creerSession: (ressource, cheminRelatif) => assemblerSessionGitLab({
      destinationId: options.destination.id,
      dirLocal: dirMiroir,
      client,
      branche: options.destination.branche,
      racine: options.destination.racine,
      ressource,
      cheminRelatif,
      journalSessions,
      identite: options.identite,
      journalRepertoire,
    }).session,
    creerTransactions: (store, file) => {
      const coordination = new BailGitLab({
        branche: options.destination.branche,
        depot,
        identite: options.identite,
      })
      return new TransactionsGitLab({
        destination: options.destination,
        store,
        depot,
        coordination,
        publication: new PublieurGitLab({
          branche: options.destination.branche,
          depot,
          coordination,
          journal,
        }),
        file,
        journal,
      })
    },
  })
  return { ...preparation, dirMiroir }
}

/** Réconcilie une publication retrouvée au démarrage, selon sa nature.
 *
 *  Une session d'entretien confirme son journal de session. Une transaction de
 *  corpus ne confirme JAMAIS un journal de session : son état publié sera
 *  installé par le tirage normal, qui remplace le miroir d'un seul tenant. Une
 *  opération certainement absente peut être abandonnée ; une opération encore
 *  indéterminée reste journalisée et bloque sa ressource. */
async function reconcilierPublication(
  entree: EntreeJournalPublication,
  reconciliateur: ReconciliateurPublicationGitLab,
  journal: JournalPublicationGitLab,
  journalSessions: JournalSessionsGitLab,
): Promise<void> {
  const resultat = await reconciliateur.reconcilier(entree)
  if (resultat.statut === 'indetermine') return
  if (resultat.statut === 'confirme' && entree.nature === 'session-entretien') {
    const actions = journal.chargerActions(entree)
    const action = actions.find(
      (candidate) => candidate.action === 'update' || candidate.action === 'create')
    if (action?.content !== undefined) {
      journalSessions.confirmerPublication(
        entree.resourceHash,
        resultat.commitId,
        action.content,
      )
    }
  }
  journal.supprimer(entree.operationId)
}
