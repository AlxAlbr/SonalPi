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
  cheminBailDepuisEmpreinteGitLab,
  cleRessourceBailGitLab,
  FileCommitsGitLab,
  type IdentiteBailGitLab,
} from './bailGitLab'
import { type ContexteGitLab, preparerContexteGitLabLectureSeule } from './contexte'
import { JournalPublicationGitLab } from './journalPublication'
import { reprendreOperationsGitLab } from './reprise'
import { empreinteDestinationSuppressionGitLab, JournalSuppressionAnonGitLab } from './journalSuppressionAnon'
import { empreinteDestinationRetraitVarianteGitLab, JournalRetraitVarianteAnonGitLab } from './journalRetraitVarianteAnon'
import { JournalSessionsGitLab } from './journalSession'
import { assemblerSessionGitLab } from './assemblageSession'
import type { ServiceAuthentificationGitLab } from './authentification'
import { matriceCapacites } from './politiqueGestes'
import { PublieurGitLab } from './publication'
import { TransactionsGitLab } from './transactions'
import {
  baseMediaLocale,
  preparerBaseMediaVerifiee,
  type BaseMediaVerifiee,
  type MotifIndisponibiliteBase,
  type ResultatPreparationBaseMedia,
} from '../medias/baseMedia'

/** Destination GitLab enregistrée, rendue au renderer sans aucun secret. */
export function destinationGitLabPublique(
  coffre: CoffreComptes,
  destination: ConfigDestinationGitLab,
  connexionDisponible: (compteId: string) => boolean = () => false,
): DestinationGitLabPublic | null {
  const compte = coffre.listerComptesGitLab()
    .find((candidat) => candidat.id === destination.compteId)
  if (!compte) return null
  const baseMedia = baseMediaLocale(coffre, destination.id)
  return {
    fournisseur: 'gitlab',
    id: destination.id,
    compteId: compte.id,
    urlInstance: compte.urlInstance,
    utilisateur: compte.utilisateur,
    authentification: compte.authentification,
    projetId: destination.projetId,
    nomProjet: destination.nomProjet,
    branche: destination.branche,
    racine: destination.racine,
    connexionDisponible: connexionDisponible(compte.id),
    baseMedia: baseMedia
      ? {
          utilisateur: baseMedia.utilisateur,
          secretDisponible: baseMedia.secretDisponible,
        }
      : null,
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
  /** Couture de test pour la validation du dossier média facultatif. */
  preparerBaseMedia?: (
    demande: NonNullable<DemandeCreationGitLab['baseMedia']>,
  ) => Promise<ResultatPreparationBaseMedia>
}

/** Création, enregistrement et ouverture des destinations GitLab. */
export class ServiceOuvertureGitLab {
  constructor(private readonly options: OptionsServiceOuvertureGitLab) {}

  /** Publie le squelette du corpus, puis rejoint le chemin commun
   *  d'ouverture d'une destination nouvelle. */
  async creerEtOuvrir(demande: DemandeCreationGitLab): Promise<OuvertureDistante> {
    if (!demande.nomCorpus.trim()) throw new Error('Nom du corpus GitLab manquant.')
    const compte = this.compte(demande.compteId)
    const client = await this.options.authentification.client(compte.id, demande.projetId)
    const depot = new DepotCommitsGitLabClient(client)
    if (await depot.lireFichier('corpus.json', demande.branche)) {
      throw new Error('Un corpus existe déjà à la racine du projet GitLab.')
    }

    let baseMedia: BaseMediaVerifiee | undefined
    if (demande.baseMedia) {
      const preparation = await (
        this.options.preparerBaseMedia ?? preparerBaseMediaVerifiee
      )(demande.baseMedia)
      if (!preparation.ok) throw erreurPreparationBaseMedia(preparation.motif)
      baseMedia = preparation.base
    }

    const squelette = squeletteCorpus()
    squelette.nom = demande.nomCorpus.trim()
    await depot.publierCommit(
      demande.branche,
      'Sonal création racine',
      [{
        action: 'create',
        file_path: 'corpus.json',
        content: JSON.stringify(squelette, null, 2),
      }],
    )
    return this.ouvrirNouvelleDestination(demande, baseMedia)
  }

  /** Enregistre une destination inconnue à la racine du projet, puis l'ouvre. */
  async enregistrerEtOuvrir(demande: DemandeOuvertureGitLab): Promise<OuvertureDistante> {
    return this.ouvrirNouvelleDestination(demande)
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
    baseMedia?: BaseMediaVerifiee,
  ): Promise<OuvertureDistante> {
    const compte = this.compte(demande.compteId)
    const destination = this.candidatDestination(demande, compte.id)
    const client = await this.options.authentification.client(compte.id, demande.projetId)
    const preparation = await this.preparer(compte, destination, client)
    const destinationEnregistree = this.options.coffre.enregistrerDestinationGitLab({
      compteId: compte.id,
      projetId: demande.projetId,
      nomProjet: demande.nomProjet,
      branche: demande.branche,
      racine: '',
    })
    if (baseMedia) {
      this.options.coffre.enregistrerBaseMedia({
        destinationGitLabId: destinationEnregistree.id,
        ...baseMedia,
      })
    }
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
    compteId: string,
  ): ConfigDestinationGitLab {
    return {
      fournisseur: 'gitlab',
      id: idDeDestinationGitLab({
        compteId,
        projetId: demande.projetId,
        branche: demande.branche,
        racine: '',
      }),
      compteId,
      projetId: demande.projetId,
      nomProjet: demande.nomProjet.trim(),
      branche: demande.branche.trim(),
      racine: '',
    }
  }
}

function erreurPreparationBaseMedia(motif: MotifIndisponibiliteBase): Error {
  const messages: Record<MotifIndisponibiliteBase, string> = {
    droits: 'Le compte WebDAV ou son mot de passe est refusé.',
    'dossier-absent': 'Le dossier WebDAV indiqué est introuvable.',
    indisponible: 'Le dossier WebDAV ne répond pas.',
  }
  return new Error(messages[motif])
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
  // Une seule file de commits pour toute la destination : les sessions et les
  // transactions de corpus ne peuvent pas se croiser.
  const fileCommits = new FileCommitsGitLab()
  const coordination = new BailGitLab({
    branche: options.destination.branche,
    depot,
    identite: options.identite,
    fileCommits,
  })
  const retrait = new JournalRetraitVarianteAnonGitLab(dirMiroir,
    empreinteDestinationRetraitVarianteGitLab(options.destination.id, options.destination.branche, racine), racine).lire()
  const retraitEnAttente = !!retrait && (!retrait.varianteRetiree || !retrait.miroirComplet)
  new JournalSuppressionAnonGitLab(dirMiroir,
    empreinteDestinationSuppressionGitLab(options.destination.id, options.destination.branche, racine), racine).lire()
  if (!retraitEnAttente) await reprendreOperationsGitLab({
    depot,
    coordination,
    journal,
    journalSessions,
    dirMiroir,
    trace: (message) => console.info(message),
  })
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
      fileCommits,
      branche: options.destination.branche,
      racine: options.destination.racine,
      ressource,
      cheminRelatif,
      journalSessions,
      identite: options.identite,
      journalRepertoire,
    }).session,
    creerTransactions: (store, file) => {
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
