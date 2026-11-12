import { randomUUID } from 'node:crypto'
import type { CorpusStore } from '../corpusStore'
import type { ConfigDestinationGitLab } from '../distant/coffre'
import { normaliserRacineGitLab } from '../distant/coffre'
import { planSuppressionLocal, type PlanAjoutEntretien } from '../transactionsFichiers'
import type {
  Categorie,
  CibleRegleAnon,
  ResultatMutationAnon,
  CorpusFichier,
  EntretienFichier,
  ItemLotValeur,
  ModeTriEntretiens,
  PayloadEntretien,
  RegleAnon,
  Variable,
} from '../../shared/format'
import { referenceMediaDistant, versionSupportee } from '../../shared/format'
import { normaliserOrdreEntretiens } from '../../shared/corpus/ordreEntretiens'
import { poserValeur } from '../../shared/corpus/requetes'
import { appliquerRegleAnonEntretienAvecBilan } from '../../shared/entretien/anon'
import { analyserImpactSuppressionEntretien } from '../../shared/corpus/suppressionEntretien'
import type { ImpactSuppressionEntretien } from '../../shared/corpus/suppressionEntretien'
import {
  cleRessourceBailGitLab,
  type BailGitLab,
  type DepotCommitsGitLab,
  type DroitsEditionGitLab,
  type FichierGitLab,
} from './bailGitLab'
import type { FileOperationsContexte } from './fileOperations'
import { ErreurReponseTropVolumineuseGitLab } from './client'
import type { JournalPublicationGitLab } from './journalPublication'
import type { ApercusThemesGitLab } from './apercusThemes'
import { OperationsThemesGitLab } from './operationsThemes'
import { CorrespondancesGitLab } from './correspondances'
import { RenommagesAnonGitLab } from './renommagesAnon'
import { DissociationsAnonGitLab } from './dissociationsAnon'
import { SuppressionsAnonGitLab } from './suppressionsAnon'
import { RetraitsVarianteAnonGitLab, type EtapeContexteRetraitVariante } from './retraitsVarianteAnon'
import { reprendreAjoutsVarianteGitLab } from './reprise'
import { exigerAbsenceDissociationGitLab } from './referencesDefinitions'
import { verifierReferencesDefinitions } from './referencesDefinitions'
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
import {
  choisirDestinationArchive,
  empreinteArchive,
  suffixeArchive,
  type PlanSuppressionDistant,
} from './suppressionEntretien'

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

/** Une suppression ne publie jamais les sessions ouvertes à la place de leur utilisateur. */
export interface SourcesSuppressionDefinitions {
  verifierSessionsFermees?: () => void
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
 *  Toutes prennent le bail de `corpus.crp`, calculent sur la base fraîche du
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
    this.cheminCorpus = this.cheminDistant('corpus.crp')
    this.ressourceCorpus = cleRessourceBailGitLab(
      options.destination.branche,
      this.cheminCorpus,
    )
  }

  get file(): FileOperationsContexte { return this.options.file }

  creerRetraitsVarianteAnon(sessions: () => string[], verifierContexte?: (etape: EtapeContexteRetraitVariante) => void): RetraitsVarianteAnonGitLab {
    return new RetraitsVarianteAnonGitLab(this.options, sessions, Date.now, verifierContexte)
  }

  creerSuppressionsAnon(sessions: () => string[]): SuppressionsAnonGitLab {
    return new SuppressionsAnonGitLab(this.options, sessions)
  }

  creerDissociationsAnon(sessions: () => string[]): DissociationsAnonGitLab {
    return new DissociationsAnonGitLab(this.options, sessions)
  }

  creerRenommagesAnon(sessions: () => string[]): RenommagesAnonGitLab {
    return new RenommagesAnonGitLab(this.options, sessions)
  }

  creerCorrespondances(sessionsLocales: () => string[]): CorrespondancesGitLab {
    return new CorrespondancesGitLab(this.options, sessionsLocales)
  }

  creerOperationsThemes(
    apercus: ApercusThemesGitLab,
    dirLocal: string,
    sessionsLocales: () => string[],
  ): OperationsThemesGitLab {
    return new OperationsThemesGitLab({
      destinationId: this.options.destination.id,
      dirLocal,
      branche: this.branche,
      racine: this.racine,
      store: this.options.store,
      depot: this.options.depot,
      coordination: this.options.coordination,
      publication: this.options.publication,
      journalPublication: this.options.journal,
      apercus,
      sessionsLocales,
      nouvelleOperation: this.nouvelleOperation,
    })
  }

  /** Mutation de définitions calculée sur le seul `corpus.crp` lu sur
   *  GitLab. Une commande sans changement est un succès sans commit de données :
   *  la base fraîche est néanmoins installée, pour ne pas rester en retard. */
  executerDefinitions<T>(
    preparer: (store: CorpusStore) => T,
    ajoutVariante = false,
    verifierContexte?: () => void,
  ): Promise<ResultatTransactionDefinitions<T>> {
    return this.options.file.executer(async () => {
      verifierContexte?.()
      if (ajoutVariante && !this.options.journal) throw new Error('Le suivi de publication GitLab est indisponible. Aucun ajout autorisé.')
      this.verifierTransactionReconciliee()
      const droit = await this.acquerirBailCorpus()
      try {
        const frais = await this.lireBase(this.branche)
        exigerAbsenceDissociationGitLab(frais.corpus)
        const operationId = `${ajoutVariante ? 'ajout-variante-' : ''}${this.nouvelleOperation()}`
        let preparation = preparerDefinitions(frais.fichier.contenu, preparer)
        if (ajoutVariante) {
          // L’ajout ne publie pas les ajustements de classement du store de préparation.
          preparation = { ...preparation, baseFraîche: frais.corpus,
            candidat: preparation.candidat ? { ...structuredClone(frais.corpus), reglesAnon: preparation.candidat.reglesAnon } : null }
        }
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

  /** Relit l’issue des ajouts sans répéter une publication ni hériter de droits. */
  async relireAjoutsVarianteDansFile(): Promise<void> {
    if (!this.options.journal) return
    await reprendreAjoutsVarianteGitLab({
      depot: this.options.depot, coordination: this.options.coordination,
      journal: this.options.journal, dirMiroir: this.options.store.repertoire,
    })
  }

  /** Mutation de définitions qui écrit une référence ou une recette.
   *
   *  Chaque source nécessaire est lue sur un même instantané Git que
   *  `corpus.crp`, et entre dans le commit sous une garde sans contenu : si
   *  une source a bougé depuis la lecture, tout le commit est refusé
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
      exigerAbsenceDissociationGitLab(apercu.corpus)
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

  /** Supprime une définition uniquement lorsque les entretiens sont fermés.
   *  Les droits des entretiens restent protégés dans le même commit que la définition. */
  executerSuppressionDefinitions<T>(
    preparer: (store: CorpusStore) => T,
    sources: SourcesSuppressionDefinitions = {},
  ): Promise<ResultatTransactionDefinitions<T>> {
    return this.options.file.executer(async () => {
      this.verifierTransactionReconciliee()
      sources.verifierSessionsFermees?.()
      const droit = await this.acquerirBailCorpus()
      const droitsEntretiens: DroitsEditionGitLab[] = []
      try {
        const sha = await this.options.depot.resoudreTete(this.branche)
        const frais = await this.lireBase(sha)
        exigerAbsenceDissociationGitLab(frais.corpus)
        const retenues = this.sourcesAttendues(
          (corpus) => Object.keys(corpus.membership),
          frais.corpus,
        ).sort()
        if (2 * retenues.length + 2 > MAX_ACTIONS_PUBLICATION) {
          throw new Error('Ce corpus contient trop d’entretiens pour protéger cette suppression dans un seul envoi. Aucune définition supprimée.')
        }
        for (const id of retenues) {
          const acquisition = await this.options.coordination.acquireRessource(this.ressourceEntretien(id))
          if (!acquisition.ok) throw new Error(`L’entretien « ${this.titreDe(id, frais.corpus)} » est ouvert en édition. Enregistrez et fermez les entretiens avant de supprimer cette définition.`)
          droitsEntretiens.push(acquisition.droit)
        }
        sources.verifierSessionsFermees?.()
        const lues = await this.lireSources(retenues, sha, frais.corpus)
        const operationId = this.nouvelleOperation()
        const preparation = preparerDefinitions(
          frais.fichier.contenu,
          preparer,
          lues.map((source) => ({ id: source.id, contenu: source.contenu })),
          { inventaireComplet: true },
        )
        if (preparation.candidat) {
          const actions = this.actionsGardees(frais, preparation, lues)
          this.verifierBornes(operationId, actions, droitsEntretiens.length + 1)
          const resultat = await this.options.publication.publierSousDroits({
            operationId,
            nature: 'transaction-corpus',
            actions,
          }, [droit, ...droitsEntretiens])
          this.verifierPublication(resultat, 'La suppression de la définition')
        }
        const installe = preparation.candidat ?? preparation.baseFraîche
        this.installer(operationId, installe)
        return { valeur: preparation.valeur, corpus: installe }
      } finally {
        for (const droitEntretien of droitsEntretiens.reverse()) await this.libererBail(droitEntretien)
        await this.libererBail(droit)
      }
    })
  }

  /** Tri par modification ou par longueur, sur un corpus calme.
   *
   *  Le tri ne produit qu'un ordre : une lecture légèrement périmée donne un
   *  rang faux, corrigé au tri suivant, jamais une référence pendante. Aucun
   *  entretien n'est donc gardé, et le commit ne porte que `corpus.crp` et la
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

  /** Impact d'un retrait, lu sur le corpus publié à un instantané immuable.
   *
   *  Aucun droit n'est pris : cet aperçu peut périmer avant la confirmation, et
   *  la commande le recalcule sous ses deux baux. Le miroir ne sert à rien
   *  ici — il serait peut-être en retard. */
  async analyserSuppressionEntretien(
    entretienId: string,
  ): Promise<ImpactSuppressionEntretien> {
    return this.options.file.executer(async () => {
      const sha = await this.options.depot.resoudreTete(this.branche)
      const base = await this.lireBase(sha)
      if (!base.corpus.membership[entretienId]) {
        throw new Error("Cet entretien n'existe plus.")
      }
      return analyserImpactSuppressionEntretien(base.corpus, entretienId)
    })
  }

  /** Retrait et archivage d'un entretien, sous deux droits et dans un seul
   *  commit.
   *
   *  L'ordre est global et immuable : le droit du corpus, puis celui de
   *  l'entretien, puis la publication — et la libération en ordre inverse. Le
   *  commit porte le retrait du membership, le déplacement du JSON vers son
   *  archive, et le renouvellement des deux baux ; ou il ne porte rien du
   *  tout. Les sauvegardes et les PNG restent hors du dépôt : leur archivage
   *  est un plan local, durable, et idempotent. */
  supprimerEntretien(
    entretienId: string,
    impactAttendu?: ImpactSuppressionEntretien,
  ): Promise<CorpusFichier> {
    return this.options.file.executer(async () => {
      this.verifierTransactionReconciliee()
      this.verifierSuppressionRejouable(entretienId)
      const droitCorpus = await this.acquerirBailCorpus()
      try {
        const droitEntretien = await this.acquerirBailEntretien(entretienId)
        try {
          return await this.publierSuppression(
            entretienId,
            impactAttendu,
            droitCorpus,
            droitEntretien,
          )
        } finally {
          await this.libererBail(droitEntretien)
        }
      } finally {
        await this.libererBail(droitCorpus)
      }
    })
  }

  private async publierSuppression(
    entretienId: string,
    impactAttendu: ImpactSuppressionEntretien | undefined,
    droitCorpus: DroitsEditionGitLab,
    droitEntretien: DroitsEditionGitLab,
  ): Promise<CorpusFichier> {
    const operationId = this.nouvelleOperation()
    // Un seul instantané pour le corpus, l'entretien et l'archive : la décision
    // porte sur des versions cohérentes entre elles.
    const sha = await this.options.depot.resoudreTete(this.branche)
    const frais = await this.lireBase(sha)
    if (!frais.corpus.membership[entretienId]) {
      throw new Error(`L’entretien « ${this.titreDe(entretienId, frais.corpus)} » `
        + 'n’existe plus sur GitLab.')
    }
    const cheminSource = this.cheminDistant(`entretiens/${entretienId}.json`)
    const source = await this.lireSource(entretienId, sha, frais.corpus)
    const archive = await choisirDestinationArchive(
      entretienId,
      operationId,
      async (chemin) => Boolean(
        await this.options.depot.lireFichier(this.cheminDistant(chemin), sha),
      ),
    )
    // Le retrait se calcule sur la base fraîche protégée ; l'inventaire des
    // fichiers locaux ne décide jamais de ce que GitLab reçoit.
    const preparation = preparerDefinitions(frais.fichier.contenu, (store) =>
      store.preparerRetraitEntretien(entretienId, impactAttendu))
    const suffixe = suffixeArchive(operationId)
    const plan: PlanSuppressionDistant = {
      operationId,
      entretienId,
      cheminSource,
      cheminArchive: this.cheminDistant(archive),
      empreinteArchive: empreinteArchive(source.contenu),
      corpusApres: preparation.valeur.corpusApres,
      planLocal: planSuppressionLocal(
        entretienId,
        this.options.store.ouvrir(),
        preparation.valeur.corpusApres,
        this.options.store.inventorierFichiersSuppression(entretienId, (nom) =>
          this.options.store.destinationArchive(nom, suffixe)),
      ),
    }
    const actions: ActionPlanGitLab[] = [
      this.actionCorpus(frais, preparation.valeur),
      {
        action: 'move',
        chemin: plan.cheminArchive,
        cheminPrecedent: plan.cheminSource,
        commitId: source.commitId,
      },
    ]
    this.verifierBornes(operationId, actions)
    const resultat = await this.options.publication.publierSousDroits({
      operationId,
      nature: 'suppression-entretien',
      actions,
      suppression: {
        entretienId: plan.entretienId,
        cheminSource: plan.cheminSource,
        cheminArchive: plan.cheminArchive,
        empreinteArchive: plan.empreinteArchive,
        octetsArchive: Buffer.byteLength(source.contenu, 'utf8'),
        planLocal: plan.planLocal,
      },
    }, [droitCorpus, droitEntretien])
    this.verifierSuppression(resultat, entretienId, frais.corpus, droitCorpus, droitEntretien)
    // Le commit est reçu : l'entrée reste journalisée jusqu'à ce que l'archive
    // locale soit en place. Un échec ici se reprend au prochain démarrage.
    this.options.store.appliquerTransactionFichiers(plan.planLocal)
    this.options.journal?.supprimer(operationId)
    return plan.corpusApres
  }

  /** Une suppression déjà journalisée ne se recommence pas : elle se reprend.
   *  Rendre le geste idempotent nuirait à sa lecture et à son journal. */
  private verifierSuppressionRejouable(entretienId: string): void {
    const entree = this.options.journal?.suppressionDe(entretienId)
    if (!entree || entree.etat === 'confirme-a-installer') return
    throw new Error(
      `La suppression de l’entretien « ${entretienId} » a déjà été tentée `
      + 'sans résultat connu. Actualisez le corpus avant de réessayer.',
    )
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

  /** Pose plusieurs valeurs dans un entretien fermé sous un seul bail court. */
  poserValeursEntretien(
    entretienId: string,
    items: readonly ItemLotValeur[],
  ): Promise<void> {
    if (items.some((item) => item.entretienId !== entretienId)) {
      throw new Error('Le lot de valeurs mélange plusieurs entretiens.')
    }
    return this.modifierEntretienCourt(entretienId, (entretien, corpus) => {
      for (const item of items) {
        const variable = corpus.variables[item.idVar]
        if (item.idMod) {
          if (!variable) {
            throw new Error(`La variable « ${item.idVar} » n’existe plus sur GitLab.`)
          }
          if (!variable.modalites.some((modalite) => modalite.id === item.idMod)) {
            throw new Error(`La modalité « ${item.idMod} » n’existe plus sur GitLab.`)
          }
          if (variable.portee !== item.cible.type) {
            throw new Error(`La variable « ${variable.lib} » ne correspond pas à cette cellule.`)
          }
        }
        if (item.cible.type === 'locuteur') {
          const index = item.cible.index
          if (!entretien.locuteurs.some((locuteur) => locuteur.index === index)) {
            throw new Error(`Le locuteur ${index} n’existe plus dans cet entretien.`)
          }
        }
        poserValeur(entretien, item.cible, item.idVar, item.idMod)
      }
    })
  }

  /** Désigne un média WebDAV existant dans un entretien fermé. */
  designerAudio(entretienId: string, chemin: string): Promise<void> {
    return this.modifierEntretienCourt(entretienId, (entretien) => {
      entretien.meta ??= { valeursGen: {}, audioRef: null }
      entretien.meta.audioDistant = referenceMediaDistant(chemin)
    })
  }

  /** Une session ouverte ne peut pas réutiliser une définition textuelle périmée. */
  async verifierRegleAnonSession(regleLocale: RegleAnon): Promise<void> {
    const base = await this.lireBase(await this.options.depot.resoudreTete(this.branche))
    const fraiche = base.corpus.reglesAnon[regleLocale.id]
    const definition = (r: RegleAnon) => JSON.stringify([r.id, r.entite, r.pseudos])
    if (!fraiche || definition(fraiche) !== definition(regleLocale)) {
      throw new Error('La règle distante a changé. Actualisez le corpus avant de valider les occurrences de cette session.')
    }
  }

  /** Applique une règle dans un entretien fermé sous un bail court. */
  appliquerRegleEntretien(
    entretienId: string,
    cible: CibleRegleAnon,
  ): Promise<ResultatMutationAnon & { titre: string }> {
    if (cible.entretienId !== entretienId) {
      throw new Error('La cible de pseudonymisation ne correspond pas à l’entretien.')
    }
    return this.modifierEntretienCourt(entretienId, (entretien, corpus) => {
      const titre = corpus.membership[entretienId]?.titre ?? entretienId
      const regle = corpus.reglesAnon[cible.regleId]
      if (!regle) {
        throw new Error(`La règle d’anonymisation « ${cible.regleId} » n’existe plus sur GitLab.`)
      }
      return {
        ...appliquerRegleAnonEntretienAvecBilan(entretien, regle, cible),
        titre,
      }
    })
  }

  /** Transaction courte sur un entretien fermé.
   *
   *  Le corpus est une garde inchangée, pas une ressource verrouillée. Si une
   *  définition indépendante bouge, la préparation est reprise une fois sur
   *  un nouvel instantané. */
  private modifierEntretienCourt<T>(
    entretienId: string,
    appliquer: (entretien: EntretienFichier, corpus: CorpusFichier) => T,
  ): Promise<T> {
    return this.options.file.executer(async () => {
      const droit = await this.acquerirBailEntretien(entretienId)
      try {
        for (let tentative = 0; tentative < 2; tentative++) {
          const sha = await this.options.depot.resoudreTete(this.branche)
          const frais = await this.lireBase(sha)
          if (!frais.corpus.membership[entretienId]) {
            throw this.entretienIntrouvable(entretienId, frais.corpus)
          }
          const source = await this.lireSource(entretienId, sha, frais.corpus)
          const entretien = JSON.parse(source.contenu) as EntretienFichier
          const avant = JSON.stringify(entretien)
          const valeur = appliquer(entretien, frais.corpus)
          const modifie = JSON.stringify(entretien) !== avant
          if (!modifie) {
            this.options.store.installerEntretienDistant(entretienId, entretien)
            return valeur
          }
          entretien.lastModified = new Date().toISOString()
          verifierReferencesDefinitions(entretien, frais.corpus, JSON.parse(avant) as EntretienFichier)
          const contenu = JSON.stringify(entretien, null, 2)
          const operationId = this.nouvelleOperation()
          const resultat = await this.options.publication.publierSousDroit({
            operationId,
            nature: 'transaction-entretien',
            actions: [
              {
                action: 'update',
                chemin: this.cheminDistant(`entretiens/${entretienId}.json`),
                contenu,
                commitId: source.commitId,
              },
              {
                action: 'update',
                chemin: this.cheminCorpus,
                contenu: frais.fichier.contenu,
                commitId: frais.fichier.commitId,
              },
            ],
          }, droit)
          if (resultat.statut === 'confirme') {
            this.options.store.installerEntretienDistant(entretienId, entretien)
            return valeur
          }
          if (
            tentative === 0
            && resultat.statut === 'refuse'
            && resultat.raison === 'conflit'
            && await this.reprendreTransactionEntretien(source.commitId, entretienId, droit)
          ) {
            continue
          }
          this.verifierPublication(resultat, `La modification de « ${this.titreDe(entretienId, frais.corpus)} »`)
        }
        throw new Error('La modification GitLab a été refusée après une nouvelle lecture.')
      } finally {
        await this.libererBail(droit)
      }
    })
  }

  /** Réactive un bail suspendu seulement si l'entretien et le bail tiennent. */
  private async reprendreTransactionEntretien(
    commitId: string,
    entretienId: string,
    droit: DroitsEditionGitLab,
  ): Promise<boolean> {
    const courant = await this.options.depot.lireFichier(
      this.cheminDistant(`entretiens/${entretienId}.json`),
      this.branche,
    )
    if (!courant || courant.commitId !== commitId) return false
    if (!await this.options.coordination.revalider(droit)) return false
    this.options.coordination.reprendreApresConflitNeutre(droit)
    return true
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
        verifierReferencesDefinitions(plan.entretien, plan.corpusApres, { ...plan.entretien, annotations: [] })
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

  /** Remplace localement `corpus.crp` par un état confirmé côté serveur. */
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
      throw new Error(this.messageBailTenu(acquisition.tenupar, 'Le corpus GitLab'))
    }
    return acquisition.droit
  }

  /** Droit d'un entretien, pris après celui du corpus et dans le même ordre
   *  partout : fermer notre session ne réserve rien, et un autre poste peut
   *  gagner entre les deux acquisitions. Il est alors nommé. */
  private async acquerirBailEntretien(entretienId: string): Promise<DroitsEditionGitLab> {
    const ressource = this.ressourceEntretien(entretienId)
    const acquisition = await this.options.coordination.acquireRessource(ressource)
    if (!acquisition.ok) {
      throw new Error(this.messageBailTenu(
        acquisition.tenupar,
        `L’entretien « ${entretienId} »`,
      ))
    }
    return acquisition.droit
  }

  private ressourceEntretien(entretienId: string): string {
    return cleRessourceBailGitLab(
      this.options.destination.branche,
      this.cheminDistant(`entretiens/${entretienId}.json`),
    )
  }

  /** Un bail de corpus n'a pas d'entretien à rouvrir : dire « en cours de
   *  modification par nous » ne donne rien à faire. On nomme l'échéance,
   *  qui est la seule issue quand personne ne le rend. */
  private messageBailTenu(tenupar: { userId: string; expireLe: string } | null, sujet: string): string {
    if (!tenupar) return `${sujet} est en cours de modification par un poste inconnu.`
    if (tenupar.userId === this.options.coordination.compteCourant()) {
      const echeance = Date.parse(tenupar.expireLe)
      const quand = Number.isFinite(echeance)
        ? ` Il est rendable jusqu'à ${new Date(echeance).toLocaleTimeString('fr-FR')}, `
        : ''
      return `${sujet} est retenu par ce poste, qui a peut-être déjà terminé.${quand}`
        + 'Actualisez le corpus, puis réessayez.'
    }
    return `${sujet} est en cours de modification par ${tenupar.userId}.`
  }

  /** Un droit suspendu attend sa réconciliation : le rendre avec une garde
   *  périmée ne ferait que constater un refus, et le bail expirerait de toute
   *  façon. Seul un droit encore le nôtre est rendu. */
  private async libererBail(droit: DroitsEditionGitLab): Promise<void> {
    try {
      if (this.options.coordination.snapshot(droit).suspendu) return
      await this.options.coordination.liberer(droit)
    } catch {
      /* Un bail laissé en place expire : il ne vaut pas un refus. */
    }
  }

  /** Base fraîche du serveur, avec la garde qui la protège. */
  private async lireBaseFraiche(ref: string): Promise<FichierGitLab> {
    const distant = await this.options.depot.lireFichier(this.cheminCorpus, ref)
    if (!distant) throw new Error('Le fichier corpus.crp est introuvable sur GitLab.')
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
        + `au-delà de la limite de ${MAX_SOURCES_GARDEES}. Réduisez le nombre d’entretiens concernés.`,
      )
    }
    return [...retenues]
  }

  /** Une lecture de contenu par source, à l'instantané du corpus. */
  private async lireSources(
    ids: readonly string[],
    sha: string,
    corpus: CorpusFichier,
  ): Promise<Array<SourcePreparation & {
    readonly commitId: string
    readonly executable: boolean
  }>> {
    const sources: Array<SourcePreparation & {
      readonly commitId: string
      readonly executable: boolean
    }> = []
    for (const id of ids) {
      const fichier = await this.lireSource(id, sha, corpus)
      sources.push({
        id,
        contenu: fichier.contenu,
        commitId: fichier.commitId,
        executable: fichier.executable,
      })
    }
    return sources
  }

  /** Un entretien hors de la limite de lecture avec garde est nommé, pas
   *  transformé en panne anonyme : c'est lui qui rend le geste impossible. */
  private async lireSource(
    id: string,
    sha: string,
    corpus: CorpusFichier,
  ): Promise<FichierGitLab> {
    const chemin = this.cheminDistant(`entretiens/${id}.json`)
    try {
      const fichier = await this.options.depot.lireFichier(chemin, sha)
      if (!fichier) throw this.entretienIntrouvable(id, corpus)
      this.verifierEntretien(fichier.contenu, corpus, id)
      return fichier
    } catch (erreur) {
      if (erreur instanceof ErreurReponseTropVolumineuseGitLab) {
        throw new Error(
          `L’entretien « ${this.titreDe(id, corpus)} » est trop volumineux pour être gardé `
          + `dans un commit GitLab : il dépasse les ${Math.round(erreur.limiteOctets / 1024)} Kio `
          + 'de la lecture avec sa garde. Cet entretien reste consultable, '
          + 'mais il ne peut pas porter de référence ni de recette.',
        )
      }
      throw erreur
    }
  }

  private entretienIntrouvable(id: string, corpus: CorpusFichier): Error {
    return new Error(
      `L’entretien « ${this.titreDe(id, corpus)} » n’existe plus sur GitLab.`,
    )
  }

  private titreDe(id: string, corpus: CorpusFichier): string {
    return corpus.membership[id]?.titre ?? id
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
      if (contenu === null) throw this.entretienIntrouvable(id, corpus)
      this.verifierEntretien(contenu, corpus, id)
      conversations.set(id, JSON.parse(contenu) as EntretienFichier)
    }
    return conversations
  }

  private actionCorpus(
    frais: BaseFraiche,
    plan: { candidat?: CorpusFichier | null; corpusApres?: CorpusFichier },
  ): ActionPlanGitLab {
    exigerAbsenceDissociationGitLab(frais.corpus)
    const corpus = plan.candidat ?? plan.corpusApres
    if (!corpus) throw new Error('Candidat de corpus GitLab absent.')
    return {
      action: 'update',
      chemin: this.cheminCorpus,
      contenu: JSON.stringify(corpus, null, 2),
      commitId: frais.fichier.commitId,
    }
  }

  /** Le corpus d'abord, puis chaque source sous une garde légère : le commit
   *  est atomique, donc une source périmée n'atteint jamais le corpus. */
  private actionsGardees(
    frais: BaseFraiche,
    preparation: ResultatPreparationDefinitions<unknown>,
    sources: ReadonlyArray<{
      id: string
      contenu: string
      commitId: string
      executable: boolean
    }>,
  ): ActionPlanGitLab[] {
    return [
      this.actionCorpus(frais, preparation),
      ...sources.map((source) => ({
        action: 'garde' as const,
        chemin: this.cheminDistant(`entretiens/${source.id}.json`),
        commitId: source.commitId,
        executable: source.executable,
      })),
    ]
  }

  /** Contrôle des bornes avant l'envoi, sur le plan métier : le corps exact
   *  sera revérifié par le publieur, bail compris. */
  private verifierBornes(operationId: string, actions: ActionPlanGitLab[], nombreDroits = 1): void {
    verifierBornesAnticipees(this.branche, `Sonal ${operationId}`, actions, nombreDroits)
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
      throw new Error('Le fichier corpus.crp de GitLab est illisible.')
    }
    if (!versionSupportee(corpus.formatVersion)) {
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

  private verifierPublication(resultat: ResultatPublicationGitLab, sujet: string): void {
    if (resultat.statut === 'confirme') return
    if (resultat.statut === 'indetermine') {
      throw new Error(
        `${sujet} GitLab n’a pas été confirmée. Actualisez le corpus avant de réessayer.`,
      )
    }
    if (resultat.raison === 'references') throw new Error(resultat.message)
    const messages = {
      conflit: `${sujet} a été refusée : le corpus GitLab a changé pendant l’opération. Aucune modification n’a été appliquée. Réessayez lorsque les autres publications sont terminées.`,
      'droit-perdu': `${sujet} a été refusée : le droit de modification GitLab a été perdu.`,
      droits: `GitLab refuse ${sujet.toLowerCase()} avec les droits de ce compte.`,
      limite: `GitLab refuse ${sujet.toLowerCase()} à cause d’une limite de service.`,
    } as const
    throw new Error(messages[resultat.raison])
  }

  /** Un refus de suppression nomme le droit réellement perdu : les deux baux ne
   *  sont jamais présentés comme intacts, ni l'un comme perdu par supposition
   *  quand l'autre a bougé. */
  private verifierSuppression(
    resultat: ResultatPublicationGitLab,
    entretienId: string,
    corpus: CorpusFichier,
    droitCorpus: DroitsEditionGitLab,
    droitEntretien: DroitsEditionGitLab,
  ): void {
    if (resultat.statut === 'confirme') return
    const titre = this.titreDe(entretienId, corpus)
    if (resultat.statut === 'indetermine') {
      throw new Error(
        `La suppression de « ${titre} » n’a pas pu être confirmée. `
        + 'Actualisez le corpus avant de réessayer.',
      )
    }
    if (resultat.raison === 'references') throw new Error(resultat.message)
    if (resultat.raison === 'droit-perdu') {
      if (this.options.coordination.droitPerdu(droitEntretien)) {
        throw new Error(
          `« ${titre} » a été repris par un autre poste pendant la suppression. `
          + 'Aucun entretien ni archive n’a été modifié.',
        )
      }
      if (this.options.coordination.droitPerdu(droitCorpus)) {
        throw new Error(
          'Le droit de modification du corpus GitLab a été perdu pendant la suppression. '
          + 'Aucun entretien ni archive n’a été modifié.',
        )
      }
      throw new Error(
        `Un des deux droits de la suppression de « ${titre} » a été perdu. `
        + 'Actualisez le corpus avant de réessayer.',
      )
    }
    const messages = {
      conflit: `La suppression de « ${titre} » a été refusée : le corpus GitLab a changé pendant l’opération. Aucune modification n’a été appliquée. Réessayez lorsque les autres publications sont terminées.`,
      droits: `GitLab refuse la suppression de « ${titre} » avec les droits de ce compte.`,
      limite: `GitLab refuse la suppression de « ${titre} » à cause d’une limite de service.`,
    } as const
    throw new Error(messages[resultat.raison])
  }
}
