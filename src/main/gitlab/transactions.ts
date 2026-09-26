import { randomUUID } from 'node:crypto'
import type { CorpusStore } from '../corpusStore'
import type { ConfigDestinationGitLab } from '../distant/coffre'
import { normaliserRacineGitLab } from '../distant/coffre'
import type {
  Categorie,
  CorpusFichier,
  PayloadEntretien,
  RegleAnon,
  Variable,
} from '../../shared/format'
import { FORMAT_VERSION } from '../../shared/format'
import type { PlanAjoutEntretien } from '../transactionsFichiers'
import {
  BailGitLab,
  cleRessourceBailGitLab,
  type DepotCommitsGitLab,
} from './bailGitLab'
import { PublieurGitLab, type ResultatPublicationGitLab } from './publication'
import { StockageLocalEntretienGitLab } from './stockageSession'

export interface OptionsTransactionsGitLab {
  destination: ConfigDestinationGitLab
  dirLocal: string
  store: CorpusStore
  depot: DepotCommitsGitLab
  coordination: BailGitLab
  publication: PublieurGitLab
  nouvelleOperation?: () => string
}

/** Transactions courtes qui ajoutent un entretien et son membership dans un même commit. */
export class TransactionsGitLab {
  private readonly racine: string
  private readonly nouvelleOperation: () => string

  constructor(private readonly options: OptionsTransactionsGitLab) {
    this.racine = normaliserRacineGitLab(options.destination.racine)
    this.nouvelleOperation = options.nouvelleOperation ?? (() => `ajout-${randomUUID()}`)
  }

  creerEntretienVide(titre: string): Promise<{ id: string; corpus: CorpusFichier }> {
    return this.ajouterEntretien((store) => store.preparerCreationEntretienVide(titre))
  }

  importerEntretien(
    titre: string,
    payload: PayloadEntretien,
    codebook: Categorie[] = [],
    variables: Variable[] = [],
    reglesAnon: RegleAnon[] = [],
  ): Promise<{ id: string; corpus: CorpusFichier }> {
    return this.ajouterEntretien((store) =>
      store.preparerImportEntretien(titre, payload, codebook, variables, reglesAnon),
    )
  }

  private async ajouterEntretien(
    preparer: (store: CorpusStore) => PlanAjoutEntretien,
  ): Promise<{ id: string; corpus: CorpusFichier }> {
    const cheminCorpus = this.cheminDistant('corpus.json')
    const ressource = cleRessourceBailGitLab(
      this.options.destination.branche,
      cheminCorpus,
    )
    const acquisition = await this.options.coordination.acquireRessource(ressource)
    if (!acquisition.ok) {
      const utilisateur = acquisition.tenupar?.userId ?? 'un autre utilisateur'
      throw new Error(`Le corpus GitLab est en cours de modification par ${utilisateur}.`)
    }

    try {
      const distant = await this.options.depot.lireFichier(
        cheminCorpus,
        this.options.destination.branche,
      )
      if (!distant) throw new Error('Le fichier corpus.json est introuvable sur GitLab.')
      this.verifierCorpus(distant.contenu)

      await new StockageLocalEntretienGitLab(
        this.options.dirLocal,
        'corpus.json',
      ).ecrire(distant.contenu)
      const plan = preparer(this.options.store)
      const resultat = await this.options.publication.publierSousDroit({
        operationId: this.nouvelleOperation(),
        actions: [
          {
            action: 'create',
            chemin: this.cheminDistant(`entretiens/${plan.id}.json`),
            contenu: JSON.stringify(plan.entretien, null, 2),
          },
          {
            action: 'update',
            chemin: cheminCorpus,
            contenu: JSON.stringify(plan.corpusApres, null, 2),
            commitId: distant.commitId,
          },
        ],
      }, acquisition.droit)
      this.verifierPublication(resultat)

      this.options.store.appliquerTransactionFichiers(plan)
      return { id: plan.id, corpus: plan.corpusApres }
    } finally {
      await this.options.coordination.liberer(acquisition.droit).catch(() => {})
    }
  }

  private cheminDistant(cheminRelatif: string): string {
    return this.racine ? `${this.racine}/${cheminRelatif}` : cheminRelatif
  }

  private verifierCorpus(contenu: string): void {
    let corpus: { formatVersion?: unknown }
    try {
      corpus = JSON.parse(contenu) as { formatVersion?: unknown }
    } catch {
      throw new Error('Le fichier corpus.json de GitLab est illisible.')
    }
    if (corpus.formatVersion !== FORMAT_VERSION) {
      throw new Error('La version du corpus GitLab n’est pas prise en charge.')
    }
  }

  private verifierPublication(resultat: ResultatPublicationGitLab): void {
    if (resultat.statut === 'confirme') return
    if (resultat.statut === 'indetermine') {
      throw new Error(
        'GitLab n’a pas confirmé l’ajout. Actualisez le corpus avant de réessayer.',
      )
    }
    const messages = {
      conflit: 'Le corpus GitLab a changé pendant l’ajout. Actualisez puis réessayez.',
      'droit-perdu': 'Le droit de modification GitLab a été perdu pendant l’ajout.',
      droits: 'GitLab refuse l’ajout avec les droits de ce compte.',
      limite: 'GitLab refuse l’ajout à cause d’une limite de service.',
    } as const
    throw new Error(messages[resultat.raison])
  }
}
