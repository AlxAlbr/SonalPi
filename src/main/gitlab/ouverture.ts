import { join } from 'node:path'
import type { OuvertureDistante } from '../../shared/distant'
import type { CorpusFichier } from '../../shared/format'
import { squeletteCorpus } from '../../shared/corpus/squelette'
import type {
  DemandeCreationGitLab,
  DemandeOuvertureGitLab,
  DestinationGitLabPublic,
} from '../../shared/gitlab'
import {
  idDeCompteGitLab,
  idDeDestinationGitLab,
  normaliserRacineGitLab,
  type CoffreComptes,
  type ConfigCompteGitLab,
  type ConfigDestinationGitLab,
} from '../distant/coffre'
import { ClientGitLab } from './client'
import { DepotCommitsGitLabClient, type IdentiteBailGitLab } from './bailGitLab'
import { type ContexteGitLab, preparerContexteGitLabLectureSeule } from './contexte'
import { JournalPublicationGitLab, ReconciliateurPublicationGitLab } from './journalPublication'
import { JournalSessionsGitLab } from './journalSession'
import { assemblerSessionGitLab } from './assemblageSession'

/** Destination GitLab enregistrée, rendue au renderer sans aucun secret. */
export function destinationGitLabPublique(
  coffre: CoffreComptes,
  destination: ConfigDestinationGitLab,
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
    jetonDisponible: coffre.jetonGitLabDisponible(compte.id),
  }
}

/** Miroir prêt et corpus lu : tout ce qu'il faut pour installer la destination. */
export interface PreparationOuvertureGitLab {
  contexte: ContexteGitLab
  corpus: CorpusFichier
  inaccessibles?: { chemin: string; raison: string }[]
  dirMiroir: string
}

/** Effets applicatifs et dépendances du service, explicites et remplaçables. */
export interface OptionsServiceOuvertureGitLab {
  coffre: CoffreComptes
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
    jeton: string,
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
    const client = this.client(demande.urlInstance, demande.projetId, demande.jeton)
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

  /** Ouvre une destination enregistrée, avec le jeton du coffre ou ressaisi. */
  async ouvrir(id: string, jetonSaisi?: string): Promise<OuvertureDistante> {
    const destination = this.options.coffre.listerDestinationsGitLab()
      .find((candidate) => candidate.id === id)
    if (!destination) throw new Error('Destination GitLab inconnue.')
    const compte = this.options.coffre.listerComptesGitLab()
      .find((candidate) => candidate.id === destination.compteId)
    if (!compte) throw new Error('Compte GitLab inconnu.')
    const jeton = jetonSaisi || this.options.coffre.jetonGitLab(compte.id)
    if (!jeton) throw new Error('Saisissez le jeton GitLab pour cette session.')
    const preparation = await this.preparer(compte, destination, jeton)
    if (jetonSaisi) this.options.coffre.memoriserJetonGitLab(compte.id, jetonSaisi)
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
    const compte = this.candidatCompte(demande)
    const destination = this.candidatDestination(demande, racine, compte.id)
    const preparation = await this.preparer(compte, destination, demande.jeton)
    const compteEnregistre = this.options.coffre.enregistrerCompteGitLab(demande)
    const destinationEnregistree = this.options.coffre.enregistrerDestinationGitLab({
      compteId: compteEnregistre.id,
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
    const destinationPublique = destinationGitLabPublique(this.options.coffre, destination)
    if (!destinationPublique) throw new Error('Compte GitLab inconnu.')
    return {
      dir: preparation.dirMiroir,
      nom: preparation.corpus.nom ?? destination.nomProjet,
      corpus: preparation.corpus,
      distant: destinationPublique,
      verrous: [],
      inaccessibles: preparation.inaccessibles,
    }
  }

  private preparer(
    compte: ConfigCompteGitLab,
    destination: ConfigDestinationGitLab,
    jeton: string,
  ): Promise<PreparationOuvertureGitLab> {
    if (this.options.preparer) {
      return this.options.preparer(compte, destination, jeton)
    }
    return preparerOuvertureDestination({
      compte,
      destination,
      jeton,
      dirProfil: this.options.dirProfil,
      identite: () => ({
        userId: compte.utilisateur,
        machineId: this.options.identiteSession.machineId,
        sessionId: this.options.identiteSession.sessionId,
      }),
      fetchImpl: this.options.fetchImpl,
    })
  }

  private client(urlInstance: string, projetId: number, jeton: string): ClientGitLab {
    return new ClientGitLab({ urlInstance, projetId, jeton }, this.options.fetchImpl)
  }

  private candidatCompte(demande: DemandeOuvertureGitLab): ConfigCompteGitLab {
    return {
      fournisseur: 'gitlab',
      id: idDeCompteGitLab(demande.urlInstance, demande.utilisateur),
      urlInstance: demande.urlInstance,
      utilisateur: demande.utilisateur.trim(),
    }
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

/** Préparation réelle d'une destination : client, journaux et leur
 *  réconciliation, miroir et fabrique de sessions d'édition. */
async function preparerOuvertureDestination(options: {
  compte: ConfigCompteGitLab
  destination: ConfigDestinationGitLab
  jeton: string
  dirProfil: string
  identite: () => IdentiteBailGitLab
  fetchImpl?: typeof fetch
}): Promise<PreparationOuvertureGitLab> {
  const dirMiroir = join(options.dirProfil, 'miroirs', options.destination.id)
  const client = new ClientGitLab({
    urlInstance: options.compte.urlInstance,
    projetId: options.destination.projetId,
    jeton: options.jeton,
  }, options.fetchImpl)
  const journalRepertoire = join(
    options.dirProfil,
    'operations-gitlab',
    options.destination.id,
  )
  const journal = new JournalPublicationGitLab(options.destination.id, journalRepertoire)
  const journalSessions = new JournalSessionsGitLab(options.destination.id, journalRepertoire)
  const reconciliateur = new ReconciliateurPublicationGitLab(
    new DepotCommitsGitLabClient(client),
    journal,
  )
  for (const entree of journal.lister()) {
    const resultat = await reconciliateur.reconcilier(entree)
    if (resultat.statut === 'confirme') {
      const actions = journal.chargerActions(entree)
      const action = actions.find((candidate) =>
        candidate.action === 'update' || candidate.action === 'create')
      if (action?.content !== undefined) {
        journalSessions.confirmerPublication(
          entree.resourceHash,
          resultat.commitId,
          action.content,
        )
      }
      journal.supprimer(entree.operationId)
    }
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
  })
  return { ...preparation, dirMiroir }
}
