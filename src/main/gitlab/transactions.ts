import { randomUUID } from 'node:crypto'
import type { CorpusStore } from '../corpusStore'
import type { ConfigDestinationGitLab } from '../distant/coffre'
import { normaliserRacineGitLab } from '../distant/coffre'
import type { PlanAjoutEntretien } from '../transactionsFichiers'
import type {
  Categorie,
  CorpusFichier,
  EntretienFichier,
  ModeTriEntretiens,
  PayloadEntretien,
  RegleAnon,
  Variable,
} from '../../shared/format'
import { FORMAT_VERSION, versionSupportee } from '../../shared/format'
import { normaliserOrdreEntretiens } from '../../shared/corpus/ordreEntretiens'
import {
  cleRessourceBailGitLab,
  type BailGitLab,
  type DepotCommitsGitLab,
  type DroitsEditionGitLab,
  type FichierGitLab,
} from './bailGitLab'
import type { FileOperationsContexte } from './fileOperations'
import type { JournalPublicationGitLab } from './journalPublication'
import {
  preparerDefinitions,
  type ResultatPreparationDefinitions,
  type SourcePreparation,
} from './preparationDefinitions'
import {
  MAX_ACTIONS_PUBLICATION,
  PublieurGitLab,
  verifierBornesAnticipees,
  type ActionPlanGitLab,
  type ResultatPublicationGitLab,
} from './publication'

/** Entretiens qu'un geste peut garder dans un seul commit : le corpus, les
 *  sources et la mutation du bail partagent la même borne d'actions. */
export const MAX_SOURCES_GARDEES = MAX_ACTIONS_PUBLICATION - 2

/** Ce qu'un geste attend du distant avant de calculer sa référence. */
export interface SourcesTransaction {
  /** Ids des entretiens que le geste contrôle, déduits d'une base fraîche.
   *  Une dérivation peut ainsi en demander tout le membership. */
  deduire: (corpus: CorpusFichier) => string[]
  /** Publie une source que nous détenons, avant toute préparation. Sans cela
   *  le geste se calculerait sur un candidat qui n'est pas encore publié. */
  publierSource?: (entretienId: string) => Promise<void>
}

export interface OptionsTransactionsGitLab {
  destination: ConfigDestinationGitLab
  /** Store du miroir actif : il reste en lecture seule et n'installe qu'après
   *  confirmation, sous la file du contexte. */
  store: CorpusStore
  depot: DepotCommitsGitLab
  coordination: BailGitLab
  publication: PublieurGitLab
  /** File unique du contexte : transactions, tirages et fermeture. */
  file: FileOperationsContexte
  /** Journal des publications, pour bloquer une opération au résultat inconnu. */
  journal?: JournalPublicationGitLab
  nouvelleOperation?: () => string
}

export interface ResultatTransactionDefinitions<T> {
  valeur: T
  /** Corpus installé localement ; publié s'il y a eu un commit de données. */
  corpus: CorpusFichier
}

/** Base fraîche et sa garde, lues à un même instantané du dépôt. */
interface BaseFraiche {
  readonly fichier: FichierGitLab
  readonly corpus: CorpusFichier
}

/** Transactions de corpus GitLab : définitions, création et import.
 *  Toutes prennent le bail de `corpus.json`, calculent sur la base fraîche du
 *  serveur, et n'installent leur candidat qu'une fois le sort de la publication
 *  connu. */
export class TransactionsGitLab {
  private readonly racine: string
  private readonly branche: string
  private readonly nouvelleOperation: () => string
  private readonly cheminCorpus: string
  private readonly ressourceCorpus: string

  constructor(private readonly options: OptionsTransactionsGitLab) {
    this.racine = normaliserRacineGitLab(options.destination.racine)
    this.branche = options.destination.branche
    this.nouvelleOperation = options.nouvelleOperation ?? (() => randomUUID())
    this.cheminCorpus = this.cheminDistant('corpus.json')
    this.ressourceCorpus = cleRessourceBailGitLab(
      options.destination.branche,
      this.cheminCorpus,
    )
  }

  /** Mutation de définitions calculée sur le seul `corpus.json` lu sur
   *  GitLab. Une commande sans changement est un succès sans commit de données :
   *  la base fraîche est néanmoins installée, pour ne pas rester en retard. */
  executerDefinitions<T>(
    preparer: (store: CorpusStore) => T,
  ): Promise<ResultatTransactionDefinitions<T>> {
    return this.options.file.executer(async () => {
      this.verifierTransactionReconciliee()
      const droit = await this.acquerirBailCorpus()
      try {
        const frais = await this.lireBase(this.branche)
        const operationId = this.nouvelleOperation()
        const preparation = preparerDefinitions(frais.fichier.contenu, preparer)
        if (preparation.candidat) {
          const resultat = await this.options.publication.publierSousDroit({
            operationId,
            nature: 'transaction-corpus',
            actions: [this.actionCorpus(frais, preparation)],
          }, droit)
          this.verifierPublication(resultat, 'La modification du corpus')
        }
        const installe = preparation.candidat ?? preparation.baseFraîche
        this.installer(operationId, installe)
        return { valeur: preparation.valeur, corpus: installe }
      } finally {
        await this.libererBail(droit)
      }
    })
  }

  /** Mutation de définitions qui écrit une référence ou une recette.
   *
   *  Chaque source nécessaire est lue sur un même instantané Git que
   *  `corpus.json`, et entre dans le commit sous son contenu inchangé et sa
   *  garde : si une source a bougé depuis la lecture, tout le commit est refusé
   *  et le corpus publié reste intact. Les copies sous session ne sont jamais
   *  remplacées, et le miroir n'est écrit qu'après confirmation. */
  executerDefinitionsAvecSources<T>(
    preparer: (store: CorpusStore) => T,
    sources: SourcesTransaction,
  ): Promise<ResultatTransactionDefinitions<T>> {
    return this.options.file.executer(async () => {
      this.verifierTransactionReconciliee()
      // Aperçu sans droit : il évite la plupart des commits de coordination
      // inutiles, et ne prouve rien du membership réellement protégé.
      const apercu = await this.lireBase(this.branche)
      const prevues = this.sourcesAttendues(sources.deduire, apercu.corpus)
      for (const entretienId of prevues) {
        await sources.publierSource?.(entretienId)
      }
      const droit = await this.acquerirBailCorpus()
      try {
        // Un seul instantané pour le corpus et ses sources : la décision porte
        // sur des versions cohérentes entre elles.
        const sha = await this.options.depot.resoudreTete(this.branche)
        const frais = await this.lireBase(sha)
        const retenues = this.sourcesAttendues(sources.deduire, frais.corpus)
        const lues = await this.lireSources(retenues, sha, frais.corpus)
        const operationId = this.nouvelleOperation()
        const preparation = preparerDefinitions(
          frais.fichier.contenu,
          preparer,
          lues.map((source) => ({ id: source.id, contenu: source.contenu })),
        )
        if (preparation.candidat) {
          const actions = this.actionsGardees(frais, preparation, lues)
          this.verifierBornes(operationId, actions)
          const resultat = await this.options.publication.publierSousDroit({
            operationId,
            nature: 'transaction-corpus',
            actions,
          }, droit)
          this.verifierPublication(resultat, 'La modification du corpus')
        }
        const installe = preparation.candidat ?? preparation.baseFraîche
        this.installer(operationId, installe)
        return { valeur: preparation.valeur, corpus: installe }
      } finally {
        await this.libererBail(droit)
      }
    })
  }

  /** Tri par modification ou par longueur, sur un corpus calme.
   *
   *  Le tri ne produit qu'un ordre : une lecture légèrement périmée donne un
   *  rang faux, corrigé au tri suivant, jamais une référence pendante. Aucun
   *  entretien n'est donc gardé, et le commit ne porte que `corpus.json` et la
   *  mutation du bail. Les contenus sont lus par l'endpoint brut, au SHA du
   *  corpus, hors de la limite de la lecture avec garde.
   *
   *  `verifierAvantBail` s'exécute dans la file du contexte, avant toute
   *  acquisition : c'est là que le tri refuse un entretien tenu. */
  trierEntretiens(
    mode: Extract<ModeTriEntretiens, 'modif' | 'longueur'>,
    verifierAvantBail: () => Promise<void>,
  ): Promise<CorpusFichier> {
    return this.options.file.executer(async () => {
      this.verifierTransactionReconciliee()
      await verifierAvantBail()
      const droit = await this.acquerirBailCorpus()
      try {
        const sha = await this.options.depot.resoudreTete(this.branche)
        const frais = await this.lireBase(sha)
        const conversations = await this.lirePublications(frais.corpus, sha)
        const operationId = this.nouvelleOperation()
        const preparation = preparerDefinitions(frais.fichier.contenu, (store) =>
          store.trierEntretiensAvecContenus(mode, conversations))
        if (preparation.candidat) {
          const resultat = await this.options.publication.publierSousDroit({
            operationId,
            nature: 'transaction-corpus',
            actions: [this.actionCorpus(frais, preparation)],
          }, droit)
          this.verifierPublication(resultat, 'Le tri des entretiens')
        }
        const installe = preparation.candidat ?? preparation.baseFraîche
        this.installer(operationId, installe)
        return installe
      } finally {
        await this.libererBail(droit)
      }
    })
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

  /** Une transaction de corpus au résultat inconnu est encore journalisée :
   *  aucune nouvelle définition, création ou import n'est accepté. */
  transactionReconciliee(): boolean {
    return (this.options.journal?.transactionsCorpusJournalisees().length ?? 0) === 0
  }

  private async ajouterEntretien(
    preparer: (store: CorpusStore) => PlanAjoutEntretien,
  ): Promise<{ id: string; corpus: CorpusFichier }> {
    return this.options.file.executer(async () => {
      this.verifierTransactionReconciliee()
      const droit = await this.acquerirBailCorpus()
      try {
        const frais = await this.lireBase(this.branche)
        const operationId = this.nouvelleOperation()
        const plan = preparerDefinitions(frais.fichier.contenu, preparer).valeur
        const resultat = await this.options.publication.publierSousDroit({
          operationId,
          nature: 'transaction-corpus',
          actions: [
            {
              action: 'create',
              chemin: this.cheminDistant(`entretiens/${plan.id}.json`),
              contenu: JSON.stringify(plan.entretien, null, 2),
            },
            this.actionCorpus(frais, plan),
          ],
        }, droit)
        this.verifierPublication(resultat, 'L’ajout')
        // Le plan local repart de l'état local réellement remplacé, jamais du
        // `corpusAvant` frais du serveur : un miroir en retard doit pouvoir
        // accepter cette installation.
        this.options.store.appliquerTransactionFichiers({
          ...plan,
          corpusAvant: this.options.store.ouvrir(),
        })
        return { id: plan.id, corpus: plan.corpusApres }
      } finally {
        await this.libererBail(droit)
      }
    })
  }

  /** Remplace localement `corpus.json` par un état confirmé côté serveur. */
  private installer(identifiant: string, corpusApres: CorpusFichier): void {
    this.options.store.appliquerTransactionFichiers({
      operation: 'remplacement',
      id: identifiant,
      corpusAvant: this.options.store.ouvrir(),
      corpusApres,
      entretiens: [],
    })
  }

  private async acquerirBailCorpus(): Promise<DroitsEditionGitLab> {
    const acquisition = await this.options.coordination.acquireRessource(this.ressourceCorpus)
    if (!acquisition.ok) {
      throw new Error(this.messageBailTenu(acquisition.tenupar))
    }
    return acquisition.droit
  }

  /** Un bail de corpus n'a pas d'entretien à rouvrir : dire « en cours de
   *  modification par nous » ne donne rien à faire. On nomme l'échéance,
   *  qui est la seule issue cuando personne ne le rend. */
  private messageBailTenu(tenupar: { userId: string; expireLe: string } | null): string {
    if (!tenupar) return 'Le corpus GitLab est en cours de modification par un poste inconnu.'
    if (tenupar.userId === this.options.coordination.compteCourant()) {
      const echeance = Date.parse(tenupar.expireLe)
      const quand = Number.isFinite(echeance)
        ? ` Il est rendable jusqu'à ${new Date(echeance).toLocaleTimeString('fr-FR')}, `
        : ''
      return `Le corpus GitLab est retenu par ce poste, qui a peut-être déjà terminé.${quand}`
        + 'Actualisez le corpus, puis réessayez.'
    }
    return `Le corpus GitLab est en cours de modification par ${tenupar.userId}.`
  }

  private async libererBail(droit: DroitsEditionGitLab): Promise<void> {
    try {
      await this.options.coordination.liberer(droit)
    } catch {
      /* Un bail laissé en place expire : il ne vaut pas un refus. */
    }
  }

  /** Base fraîche du serveur, avec la garde qui la protège. */
  private async lireBaseFraiche(ref: string): Promise<FichierGitLab> {
    const distant = await this.options.depot.lireFichier(this.cheminCorpus, ref)
    if (!distant) throw new Error('Le fichier corpus.json est introuvable sur GitLab.')
    this.verifierCorpus(distant.contenu)
    return distant
  }

  /** Base fraîche et sa garde, lues à la référence demandée : une branche pour
   *  un aperçu, un SHA pour une décision engageante. */
  private async lireBase(ref: string): Promise<BaseFraiche> {
    const fichier = await this.lireBaseFraiche(ref)
    return { fichier, corpus: JSON.parse(fichier.contenu) as CorpusFichier }
  }

  /** Sources exactes et dédupliquées : seuls les entretiens du membership
   *  frais comptent, et une source lue deux fois ne l'est qu'une fois. */
  private sourcesAttendues(
    deduire: (corpus: CorpusFichier) => string[],
    corpus: CorpusFichier,
  ): string[] {
    const membres = new Set(Object.keys(corpus.membership))
    const retenues = new Set<string>()
    for (const id of deduire(corpus)) {
      if (membres.has(id)) retenues.add(id)
    }
    if (retenues.size > MAX_SOURCES_GARDEES) {
      throw new Error(
        `Cette opération garderait ${retenues.size} entretiens dans un seul commit, `
        + `au-delà des ${MAX_SOURCES_GARDEES} acceptés. Réduisez le nombre d’entretiens concernés.`,
      )
    }
    return [...retenues]
  }

  /** Une lecture de contenu par source, à l'instantané du corpus. */
  private async lireSources(
    ids: readonly string[],
    sha: string,
    corpus: CorpusFichier,
  ): Promise<Array<SourcePreparation & { readonly commitId: string }>> {
    const sources: Array<SourcePreparation & { readonly commitId: string }> = []
    for (const id of ids) {
      const fichier = await this.options.depot.lireFichier(
        this.cheminDistant(`entretiens/${id}.json`),
        sha,
      )
      if (!fichier) {
        throw new Error(
          `L’entretien « ${corpus.membership[id]?.titre ?? id} » n’existe plus sur GitLab.`,
        )
      }
      this.verifierEntretien(fichier.contenu, corpus, id)
      sources.push({ id, contenu: fichier.contenu, commitId: fichier.commitId })
    }
    return sources
  }

  /** Contenus publiés lus par l'endpoint brut, pour un tri par contenu. */
  private async lirePublications(
    corpus: CorpusFichier,
    sha: string,
  ): Promise<Map<string, EntretienFichier>> {
    const ids = normaliserOrdreEntretiens(structuredClone(corpus)).ordreEntretiens ?? []
    const conversations = new Map<string, EntretienFichier>()
    for (const id of ids) {
      const contenu = await this.options.depot.lireContenuBrut(
        this.cheminDistant(`entretiens/${id}.json`),
        sha,
      )
      if (contenu === null) {
        throw new Error(
          `L’entretien « ${corpus.membership[id]?.titre ?? id} » n’existe plus sur GitLab.`,
        )
      }
      this.verifierEntretien(contenu, corpus, id)
      conversations.set(id, JSON.parse(contenu) as EntretienFichier)
    }
    return conversations
  }

  private actionCorpus(
    frais: BaseFraiche,
    plan: { candidat?: CorpusFichier | null; corpusApres?: CorpusFichier },
  ): ActionPlanGitLab {
    const corpus = plan.candidat ?? plan.corpusApres
    if (!corpus) throw new Error('Candidat de corpus GitLab absent.')
    return {
      action: 'update',
      chemin: this.cheminCorpus,
      contenu: JSON.stringify(corpus, null, 2),
      commitId: frais.fichier.commitId,
    }
  }

  /** Le corpus d'abord, puis chaque source gardée sous son contenu inchangé :
   *  le commit est atomique, donc une source bâtarde n'atteint jamais le
   *  corpus. */
  private actionsGardees(
    frais: BaseFraiche,
    preparation: ResultatPreparationDefinitions<unknown>,
    sources: ReadonlyArray<{ id: string; contenu: string; commitId: string }>,
  ): ActionPlanGitLab[] {
    return [
      this.actionCorpus(frais, preparation),
      ...sources.map((source) => ({
        action: 'update' as const,
        chemin: this.cheminDistant(`entretiens/${source.id}.json`),
        contenu: source.contenu,
        commitId: source.commitId,
      })),
    ]
  }

  /** Contrôle des bornes avant l'envoi, sur le plan métier : le corps exact
   *  sera revérifié par le publieur, bail compris. */
  private verifierBornes(operationId: string, actions: ActionPlanGitLab[]): void {
    verifierBornesAnticipees(this.branche, `Sonal ${operationId}`, actions)
  }

  private cheminDistant(cheminRelatif: string): string {
    return this.racine ? `${this.racine}/${cheminRelatif}` : cheminRelatif
  }

  private verifierTransactionReconciliee(): void {
    if (this.transactionReconciliee()) return
    throw new Error(
      'Une opération sur le corpus GitLab n’a pas de résultat connu. Actualisez le corpus avant de réessayer.',
    )
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

  /** Une source illisible ou d'une version inconnue suspend le geste : la
   *  décision ne repose jamais sur un entretien que GitLab ne sait pas lire. */
  private verifierEntretien(contenu: string, corpus: CorpusFichier, id: string): void {
    const titre = corpus.membership[id]?.titre ?? id
    let entretien: unknown
    try {
      entretien = JSON.parse(contenu)
    } catch {
      throw new Error(`L’entretien « ${titre} » est illisible sur GitLab.`)
    }
    const version = (entretien as { formatVersion?: unknown } | null)?.formatVersion
    if (typeof version !== 'number' || !versionSupportee(version)) {
      throw new Error(`L’entretien « ${titre} » utilise une version non prise en charge.`)
    }
  }

  private verifierPublication(resultat: ResultatPublicationGitLab, sujet: string): void {    if (resultat.statut === 'confirme') return
    if (resultat.statut === 'indetermine') {
      throw new Error(
        `${sujet} GitLab n’a pas été confirmée. Actualisez le corpus avant de réessayer.`,
      )
    }
    const messages = {
      conflit: `${sujet} a été refusée : le corpus GitLab a changé pendant l’opération. Actualisez puis réessayez.`,
      'droit-perdu': `${sujet} a été refusée : le droit de modification GitLab a été perdu.`,
      droits: `GitLab refuse ${sujet.toLowerCase()} avec les droits de ce compte.`,
      limite: `GitLab refuse ${sujet.toLowerCase()} à cause d’une limite de service.`,
    } as const
    throw new Error(messages[resultat.raison])
  }
}
