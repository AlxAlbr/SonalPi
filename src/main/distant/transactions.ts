/**
 *  TRANSACTIONS DE DÉFINITIONS corpus.
 *
 *  Le « point chaud » `corpus.json` (codebook, variables, règles anon de portée
 *  corpus, membership, création/suppression/renommage d'entretien) est écrit par
 *  des transactions COURTES : verrou corpus → GET frais → transform local pur →
 *  PUT If-Match → déverrouillage (~2 allers-retours serveur par commande).
 *
 *  Politique hors ligne : toute écriture dans `corpus.json` est REFUSÉE — pas
 *  de file d'attente ni de différé : la transaction échoue avec un message net
 *  et le corpus local reste intact.
 *
 *  Le verrou corpus est TOUJOURS en variante PUT conditionnel
 *  (`verrous/corpus.lock.json`) même quand files_lock est disponible : les
 *  transactions courtes n'ont rien à gagner du verrou visible web, un seul code
 *  de plus haut niveau suffit. Le verrou ENTRETIEN (suppression sous double
 *  verrou, ordre canonique corpus-avant-entretien) suit, lui, la variante
 *  mesurée à l'ouverture.
 *
 *  Ordre canonique des verrous pour `supprimerEntretien` :
 *  verrou CORPUS d'abord, verrou ENTRETIEN ensuite ; libération en ordre INVERSE.
 *  Politique de publication : publication corpus PUIS MOVE serveur de
 *  l'entretien vers `corbeille/` — briève redondance transitoire assumée,
 *  jamais de membership pointant un fichier disparu sans trace.
 */

import { basename, dirname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { ClientWebDAV, ErreurDelaiWebDAV, ErreurHttp } from '../webdav/client'
import type { MiroirWebDAV } from './miroir'
import type { CorpusStore } from '../corpusStore'
import * as corpusModel from '../../shared/corpus'
import type { IdentiteSession } from './sessions'
import { ProviderPutConditionnel } from '../verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../verrous/providerFilesLock'
import type { ContenuVerrou, VerrouProvider } from '../verrous/types'
import { instructionsAppliquerRegle, poserDansPlages, appliquerDiffAnon } from '../../shared/entretien/anon'
import type {
  CorpusFichier,
  EntretienFichier,
  ItemLotValeur,
  ResultatLotValeur,
  CibleRegleAnon,
  ResultatLotAnon,
  RegleAnon,
  PayloadEntretien,
  Categorie,
  Variable,
} from '../../shared/format'
import { FORMAT_VERSION, versionSupportee } from '../../shared/format'
import type { PlanAjoutEntretien } from '../transactionsFichiers'
import type { CommandePersonnes } from '../../shared/corpus/personnes'
import type { SourcePassageCas } from '../../shared/corpus/cas'
import type { ImpactSuppressionEntretien } from '../../shared/corpus/suppressionEntretien'

/** Chemin VERROUILLÉ pour les transactions de définitions —
 *  TOUJOURS le fichier annexe (PUT conditionnel). */
const CHEMIN_VERROU_CORPUS = 'verrous/corpus.lock.json'
const CHEMIN_CORPUS = 'corpus.json'
const CHEMIN_ENTRETIEN = (id: string) => `entretiens/${id}.json`

/** Erreur porteur d'un MESSAGE UTILISATEUR (français,
 *  affichable tel quel par la bannière renderer).
 *  Les refus de domaine du store (catégorie utilisée…)
 *  restent des Error ordinaires et traversent inchangés. */
export class ErreurTransaction extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurTransaction'
  }
}

export interface OptionsTransactions {
  /** true = le verrou ENTRETIEN de `supprimerEntretien` passe par files_lock natif (chemin = le fichier de données lui-même)
   *  ; false/absent = PUT conditionnel sur `verrous/<id>.lock.json`. Le verrou corpus, lui,
   *  reste TOUJOURS en PUT conditionnel. */
  verrouNatif?: boolean
  /** Accès à la couche session pour réutiliser un verrou déjà tenu par ce poste.
   *  Une correction ordinaire marque la session comme sale au lieu de prendre un second verrou.
   *  Une réunion publie la session avant de retirer une définition encore référencée. */
  getSessions?: () => {
    idsTenus(): string[]
    noterSale(id: string): void
    publier?(id: string): Promise<{ ok: boolean; raison?: string }>
  } | null
}

export class TransactionsCorpus {
  constructor(
    private readonly client: ClientWebDAV,
    private readonly miroir: MiroirWebDAV,
    /** Le store courant — capturé PAR APPEL : « Ouvrir un corpus… » réaffecte le store du main,
     *  la couche transaction doit toujours viser le dernier. */
    private readonly getStore: () => CorpusStore,
    private readonly identite: () => IdentiteSession,
    private readonly options: OptionsTransactions = {},
  ) {}

  /* ── Transaction générique ─────────────────────────────────────────────────*/

  /** Exécute une mutation locale de définitions SOUS transaction complète : verrou corpus →
   *  GET frais si divergence manifeste → mutation (garde lecture seule levée pendant l'appel,
   *  remise après) → PUT If-Match → libération (toujours, y compris sur échec).
   *
   *  La mutation est SYNCHRONE : elle lit `store.ouvrir()` (le fichier local
   *  fraîchement tiré à l'étape précédente) et réécrit le miroir ; c'est le
   *  PUT final qui porte la version locale au serveur.
   *
   *  Refus de verrou / hors ligne / divergence 412 → `ErreurTransaction`
   *  avec message utilisateur ; refus de domaine (ex. catégorie utilisée)
   *  → Error telle quelle, verrou quand même libéré. */
  async executer<T>(mutation: () => T): Promise<T> {
    const provider = new ProviderPutConditionnel(this.client, this.identite)
    let verrouTenu = false
    try {
      const acquisition = await provider.acquerir(CHEMIN_VERROU_CORPUS)
      if (!acquisition.ok) throw new ErreurTransaction(messageRefusDefinitions(acquisition.tenuPar))
      verrouTenu = true

      // La version d'APRÈS-verrou fait foi : si le serveur porte autre chose que notre miroir,
      // on télécharge AVANT de muter — jamais de transformation posée sur une copie périmée.
      const etagServeur = await this.rafraichirCorpusLocal()
      const contenuAvant = readFileSync(join(this.miroir.dirLocal, CHEMIN_CORPUS), 'utf8')

      const store = this.getStore()
      const gardePrecedente = store.lectureSeule
      store.lectureSeule = false // levée PENDANT la mutation seulement (sync)
      let resultat: T
      try {
        resultat = mutation()
      } catch (e) {
        this.ecrireCorpusLocal(contenuAvant)
        throw e
      } finally {
        store.lectureSeule = gardePrecedente
      }

      const contenuTente = readFileSync(join(this.miroir.dirLocal, CHEMIN_CORPUS), 'utf8')
      try {
        await this.publierCorpus(etagServeur)
      } catch (e) {
        // Après une coupure ou un délai dépassé, le PUT a pu réussir sans que
        // sa réponse arrive. Une relecture évite d'annuler un commit réel.
        const reconciliation = await this.reconcilierCorpusApresEchec(contenuTente)
        if (reconciliation === 'publie') return resultat
        if (reconciliation === 'inconnue') this.ecrireCorpusLocal(contenuAvant)
        throw e
      }
      return resultat
    } catch (e) {
      throw classifier(e)
    } finally {
      if (verrouTenu) await provider.liberer(CHEMIN_VERROU_CORPUS).catch(() => {})
    }
  }

  /** Relit les sources serveur et actualise le miroir avant de publier leurs références. */
  async verifierReferencesPassagesPubliees(references: SourcePassageCas[]): Promise<void> {
    const parEntretien = new Map<string, SourcePassageCas[]>()
    for (const reference of references) {
      const groupe = parEntretien.get(reference.entretienId) ?? []
      groupe.push(reference)
      parEntretien.set(reference.entretienId, groupe)
    }
    for (const [entretienId, groupe] of parEntretien) {
      const chemin = CHEMIN_ENTRETIEN(entretienId)
      let contenu: string
      let data: EntretienFichier
      try {
        contenu = await this.client.getTexte(chemin)
        data = JSON.parse(contenu) as EntretienFichier
      } catch {
        throw new ErreurTransaction("La source publiée du passage est indisponible.")
      }
      if (!versionSupportee(data.formatVersion)) {
        throw new ErreurTransaction("La source publiée du passage est invalide.")
      }
      const reperes = Array.isArray(data.reperesPassages) ? data.reperesPassages : []
      for (const reference of groupe) {
        if (!reperes.some((repere) => repere.id === reference.repereId)) {
          throw new ErreurTransaction("Le repère du passage n'a pas été publié dans l'entretien.")
        }
      }
      this.ecrireEntretienLocal(chemin, contenu)
    }
  }

  /** Migre corpus et entretiens sous leurs verrous avant de rendre le miroir éditable. */
  async migrerFormatSiNecessaire(): Promise<CorpusFichier> {
    const brut = JSON.parse(
      readFileSync(join(this.miroir.dirLocal, CHEMIN_CORPUS), 'utf8'),
    ) as { formatVersion?: number }
    if (brut.formatVersion === FORMAT_VERSION) return this.getStore().ouvrir()
    const ids = () => Object.keys((JSON.parse(
      readFileSync(join(this.miroir.dirLocal, CHEMIN_CORPUS), 'utf8'),
    ) as CorpusFichier).membership ?? {})
    return this.executerCorrectionEntretiens(
      { corpus: true, entretiens: ids, ordreCorpus: 'avant' },
      ids,
      () => this.getStore().ouvrir(),
    )
  }

  /* ── Création et import — entretien puis corpus ───────────────────────────*/

  async creerEntretienVide(titre: string): Promise<{ id: string; corpus: CorpusFichier }> {
    return this.ajouterEntretien((store) => store.preparerCreationEntretienVide(titre))
  }

  async importerEntretien(
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

  /** Publie le nouveau fichier avant de rendre son membership visible.
   *  Le miroir n'est modifié qu'après confirmation des deux publications. */
  private async ajouterEntretien(
    preparer: (store: CorpusStore) => PlanAjoutEntretien,
  ): Promise<{ id: string; corpus: CorpusFichier }> {
    const provider = new ProviderPutConditionnel(this.client, this.identite)
    let verrouTenu = false
    try {
      const acquisition = await provider.acquerir(CHEMIN_VERROU_CORPUS)
      if (!acquisition.ok) throw new ErreurTransaction(messageRefusDefinitions(acquisition.tenuPar))
      verrouTenu = true

      const etagCorpus = await this.rafraichirCorpusLocal()
      const store = this.getStore()
      const plan = preparer(store)
      const cheminEntretien = CHEMIN_ENTRETIEN(plan.id)
      const contenuEntretien = JSON.stringify(plan.entretien, null, 2)
      const contenuCorpus = JSON.stringify(plan.corpusApres, null, 2)
      const etagEntretien = await this.publierNouvelEntretien(
        cheminEntretien,
        contenuEntretien,
      )

      let etagCorpusPublie = ''
      try {
        etagCorpusPublie = await this.publierCorpus(etagCorpus, contenuCorpus, false)
      } catch (e) {
        const reconciliation = await this.reconcilierCorpusApresEchec(contenuCorpus)
        if (reconciliation !== 'publie') {
          if (reconciliation === 'serveur-restaure') {
            await this.annulerNouvelEntretien(cheminEntretien, etagEntretien)
          }
          throw e
        }
      }

      store.appliquerTransactionFichiers(plan)
      if (etagCorpusPublie) this.miroir.noterEtagPublie(CHEMIN_CORPUS, etagCorpusPublie)
      if (etagEntretien) this.miroir.noterEtagPublie(cheminEntretien, etagEntretien)
      return { id: plan.id, corpus: plan.corpusApres }
    } catch (e) {
      throw classifier(e)
    } finally {
      if (verrouTenu) await provider.liberer(CHEMIN_VERROU_CORPUS).catch(() => {})
    }
  }

  /* ── Suppression d'entretien — double verrou ──────────────────────────────*/

  /** Supprime un entretien sous double verrou, sans modifier le miroir avant le commit serveur. */
  async supprimerEntretien(
    id: string,
    impactAttendu?: ImpactSuppressionEntretien,
  ): Promise<CorpusFichier> {
    const providerCorpus = new ProviderPutConditionnel(this.client, this.identite)
    let verrouCorpusTenu = false
    try {
      const acqC = await providerCorpus.acquerir(CHEMIN_VERROU_CORPUS)
      if (!acqC.ok) throw new ErreurTransaction(messageRefusDefinitions(acqC.tenuPar))
      verrouCorpusTenu = true
      const etagServeur = await this.rafraichirCorpusLocal()

      const providerEntretien = this.providerPourEntretien()
      const cheminVerrou = this.cheminVerrouEntretien(id)
      const acqE = await providerEntretien.acquerir(cheminVerrou)
      if (!acqE.ok) {
        throw new ErreurTransaction(
          `« ${id} » est ouvert par ${acqE.tenuPar?.userId ?? 'un autre utilisateur'} — sa suppression est impossible tant que cette session tient.`,
        )
      }

      const store = this.getStore()
      const plan = store.preparerSuppressionEntretien(id, impactAttendu)
      const contenuCorpus = JSON.stringify(plan.corpusApres, null, 2)
      try {
        let etagCorpusPublie = ''
        try {
          etagCorpusPublie = await this.publierCorpus(etagServeur, contenuCorpus, false)
        } catch (e) {
          const reconciliation = await this.reconcilierCorpusApresEchec(contenuCorpus)
          if (reconciliation !== 'publie') throw e
        }

        await this.client.creerDossier('corbeille')
        const destination = await this.destinationCorbeilleDistante(id)
        try {
          await this.client.deplacer(CHEMIN_ENTRETIEN(id), destination)
        } catch (e) {
          if (!(e instanceof ErreurHttp && e.statut === 404)
            && !await this.deplacementConfirme(CHEMIN_ENTRETIEN(id), destination)) {
            store.appliquerTransactionFichiers(plan)
            throw new ErreurTransaction(
              'Le membership a été mis à jour mais le fichier entretien n\u2019a pas pu être archivé sur le serveur — il sera récupéré au prochain passage.',
            )
          }
        }
        store.appliquerTransactionFichiers(plan)
        if (etagCorpusPublie) this.miroir.noterEtagPublie(CHEMIN_CORPUS, etagCorpusPublie)
        return plan.corpusApres
      } finally {
        await providerEntretien.liberer(cheminVerrou).catch(() => {})
      }
    } catch (e) {
      throw classifier(e)
    } finally {
      if (verrouCorpusTenu) await providerCorpus.liberer(CHEMIN_VERROU_CORPUS).catch(() => {})
    }
  }

  /** Archive les fichiers serveur qui ne sont plus référencés par le membership.
   *  Le verrou corpus garantit qu'aucune création ou suppression n'est en cours. */
  async reconcilierFichiersOrphelins(): Promise<string[]> {
    const providerCorpus = new ProviderPutConditionnel(this.client, this.identite)
    const acquisition = await providerCorpus.acquerir(CHEMIN_VERROU_CORPUS)
    if (!acquisition.ok) return []
    const archives: string[] = []
    try {
      await this.rafraichirCorpusLocal()
      const corpus = this.getStore().ouvrir()
      const fichiers = (await this.client.propfind('entretiens'))
        .filter((entree) => !entree.dossier && entree.chemin.endsWith('.json'))
      await this.client.creerDossier('corbeille')
      for (const fichier of fichiers) {
        const id = fichier.chemin.slice(0, -'.json'.length)
        if (!id || id === '.' || id === '..' || id.includes('/') || id.includes('\\')) continue
        if (corpus.membership[id]) continue
        const providerEntretien = this.providerPourEntretien()
        const cheminVerrou = this.cheminVerrouEntretien(id)
        let entretienVerrouille = false
        try {
          const acqE = await providerEntretien.acquerir(cheminVerrou)
          if (!acqE.ok) continue
          entretienVerrouille = true
          const source = CHEMIN_ENTRETIEN(id)
          const destination = await this.destinationCorbeilleDistante(id)
          try {
            await this.client.deplacer(source, destination)
          } catch (e) {
            if (!(e instanceof ErreurHttp && e.statut === 404)
              && !await this.deplacementConfirme(source, destination)) continue
          }
          this.archiverOrphelinLocal(id, basename(destination))
          archives.push(id)
        } finally {
          if (entretienVerrouille) {
            await providerEntretien.liberer(cheminVerrou).catch(() => {})
          }
        }
      }
      return archives
    } finally {
      await providerCorpus.liberer(CHEMIN_VERROU_CORPUS).catch(() => {})
    }
  }

  /* ── Correction courte d'un entretien ────────────────────────────────*/

  /** Stabilise les définitions, relit l'entretien après verrou et publie sous ETag. */
  async executerEntretien<T>(id: string, mutation: () => T): Promise<T> {
    return this.executerCorrectionEntretiens(
      { corpus: false, entretiens: [id] },
      [id],
      mutation,
    )
  }

  /** Garde une source fraîche et stable pendant la correction d'un autre entretien. */
  async executerEntretienAvecSource<T>(
    id: string,
    sourceId: string,
    mutation: () => T,
  ): Promise<T> {
    if (id === sourceId) throw new ErreurTransaction('Choisissez un autre entretien comme source.')
    return this.executerCorrectionEntretiens(
      { corpus: false, entretiens: [id] },
      [id, sourceId],
      mutation,
    )
  }

  /** Publie une création éventuelle, puis le refus sur sa cible. */
  async refuserRapprochement(
    commande: Extract<CommandePersonnes, { type: 'refuser' }>,
  ): Promise<string | null> {
    if (commande.entretienId === commande.sourceEntretienId) {
      throw new ErreurTransaction('Choisissez un autre entretien comme source.')
    }
    return this.executerCorrectionEntretiens(
      { corpus: true, entretiens: [commande.entretienId] },
      [commande.entretienId, commande.sourceEntretienId],
      () => this.getStore().personnesCommander(commande, false),
    )
  }

  /** Publie une création éventuelle, puis les associations source et cible. */
  async rapprocherPersonnes(
    commande: Extract<CommandePersonnes, { type: 'rapprocher' }>,
  ): Promise<string | null> {
    if (commande.entretienId === commande.sourceEntretienId) {
      throw new ErreurTransaction('Choisissez un autre entretien comme source.')
    }
    return this.executerCorrectionEntretiens(
      {
        corpus: true,
        entretiens: [commande.sourceEntretienId, commande.entretienId],
      },
      [commande.entretienId, commande.sourceEntretienId],
      () => this.getStore().personnesCommander(commande, false),
    )
  }

  /** Réunit les liens avant de retirer la définition absorbée. */
  async fusionnerPersonnes(
    commande: Extract<CommandePersonnes, { type: 'fusionner' }>,
  ): Promise<string | null> {
    return this.executerCorrectionEntretiens(
      {
        corpus: true,
        entretiens: () => Object.keys(this.getStore().ouvrir().membership),
        ordreCorpus: 'apres',
      },
      () => Object.keys(this.getStore().ouvrir().membership),
      () => this.getStore().personnesCommander(commande, false),
    )
  }

  /** Crée la définition séparée avant de déplacer ses locuteurs. */
  async separerPersonne(
    commande: Extract<CommandePersonnes, { type: 'separer' }>,
  ): Promise<string | null> {
    return this.executerCorrectionEntretiens(
      {
        corpus: true,
        entretiens: () => Object.keys(this.getStore().ouvrir().membership),
        ordreCorpus: 'avant',
      },
      () => Object.keys(this.getStore().ouvrir().membership),
      () => this.getStore().personnesCommander(commande, false),
    )
  }

  /** Supprime une définition après contrôle frais de tous les entretiens. */
  async supprimerPersonneVide(personneId: string): Promise<null> {
    return this.executerCorrectionEntretiens(
      { corpus: true, entretiens: [] },
      () => Object.keys(this.getStore().ouvrir().membership),
      () => {
        this.getStore().personnesCommander({ type: 'supprimer', personneId }, false)
        return null
      },
    )
  }

  private async executerCorrectionEntretiens<T>(
    cibles: {
      corpus: boolean
      entretiens: string[] | (() => string[])
      ordreCorpus?: 'avant' | 'apres'
    },
    idsDemandes: string[] | (() => string[]),
    mutation: () => T,
  ): Promise<T> {
    const providerCorpus = new ProviderPutConditionnel(this.client, this.identite)
    let verrouCorpusTenu = false
    const verrousEntretiens: { provider: VerrouProvider; chemin: string }[] = []
    const contenusAvant = new Map<string, string>()
    const etags = new Map<string, string>()
    try {
      const acquisitionCorpus = await providerCorpus.acquerir(CHEMIN_VERROU_CORPUS)
      if (!acquisitionCorpus.ok) throw new ErreurTransaction(messageRefusDefinitions(acquisitionCorpus.tenuPar))
      verrouCorpusTenu = true
      const etagCorpus = await this.rafraichirCorpusLocal()
      const cheminCorpus = join(this.miroir.dirLocal, CHEMIN_CORPUS)
      const contenuCorpusAvant = readFileSync(cheminCorpus, 'utf8')
      const idsLus = typeof idsDemandes === 'function' ? idsDemandes() : idsDemandes
      const ids = [...new Set(idsLus)].sort((a, b) => a.localeCompare(b))
      const entretiensCibles = typeof cibles.entretiens === 'function'
        ? cibles.entretiens()
        : cibles.entretiens
      if (entretiensCibles.some((id) => !ids.includes(id))) {
        throw new ErreurTransaction('Une cible de la correction n’a pas été verrouillée.')
      }

      const sessions = this.options.getSessions?.() ?? null
      const idsTenus = new Set(sessions?.idsTenus() ?? [])
      for (const id of ids) {
        if (idsTenus.has(id)) continue
        const provider = this.providerPourEntretien()
        const chemin = this.cheminVerrouEntretien(id)
        const acquisition = await provider.acquerir(chemin)
        if (!acquisition.ok) {
          throw new ErreurTransaction(
            `« ${id} » est ouvert par ${acquisition.tenuPar?.userId ?? 'un autre utilisateur'} — impossible de le modifier tant que cette session tient.`,
          )
        }
        verrousEntretiens.push({ provider, chemin })
      }

      for (const id of ids) {
        const chemin = CHEMIN_ENTRETIEN(id)
        if (!idsTenus.has(id)) {
          const etag = await this.etagServeurDe(chemin)
          if (!etag) throw new ErreurTransaction(`L’entretien « ${id} » est absent du serveur.`)
          const contenu = await this.client.getTexte(chemin)
          this.ecrireEntretienLocal(chemin, contenu)
          this.miroir.noterEtagPublie(chemin, etag)
          etags.set(id, etag)
        }
        contenusAvant.set(id, readFileSync(join(this.miroir.dirLocal, chemin), 'utf8'))
      }

      const store = this.getStore()
      const gardePrecedente = store.lectureSeule
      let resultat: T
      try {
        store.lectureSeule = false
        resultat = mutation()
        if (!cibles.corpus && readFileSync(cheminCorpus, 'utf8') !== contenuCorpusAvant) {
          throw new Error('Cette correction modifie aussi les définitions du corpus et doit utiliser une transaction composite.')
        }
        const entretiensModifiables = new Set(entretiensCibles)
        for (const id of ids) {
          if (entretiensModifiables.has(id)) continue
          const chemin = CHEMIN_ENTRETIEN(id)
          if (readFileSync(join(this.miroir.dirLocal, chemin), 'utf8') !== contenusAvant.get(id)) {
            throw new Error('Un entretien de contrôle a été modifié de façon inattendue.')
          }
        }
      } catch (e) {
        this.ecrireCorpusLocal(contenuCorpusAvant)
        for (const [id, contenu] of contenusAvant) {
          this.ecrireEntretienLocal(CHEMIN_ENTRETIEN(id), contenu)
        }
        throw e
      } finally {
        store.lectureSeule = gardePrecedente
      }

      const publies: string[] = []
      const entretiensAPublier = entretiensCibles
      const contenuCorpusTente = readFileSync(cheminCorpus, 'utf8')
      const corpusModifie = contenuCorpusTente !== contenuCorpusAvant

      const publierDefinitions = async (): Promise<void> => {
        if (!corpusModifie) return
        try {
          await this.publierCorpus(etagCorpus)
          publies.push('les définitions')
        } catch (e) {
          const reconciliation = await this.reconcilierCorpusApresEchec(contenuCorpusTente)
          if (reconciliation === 'publie') {
            publies.push('les définitions')
            return
          }
          if (reconciliation === 'inconnue') this.ecrireCorpusLocal(contenuCorpusAvant)
          if (publies.length) {
            throw new ErreurTransaction(
              `La correction a été appliquée partiellement (${publies.join(', ')}), mais les définitions n’ont pas été publiées. Actualisez le répertoire puis reprenez l’opération. ${classifier(e).message}`,
            )
          }
          for (const [id, contenu] of contenusAvant) {
            this.ecrireEntretienLocal(CHEMIN_ENTRETIEN(id), contenu)
          }
          throw e
        }
      }

      const publierEntretiens = async (): Promise<void> => {
        for (let index = 0; index < entretiensAPublier.length; index += 1) {
          const id = entretiensAPublier[index]
          const chemin = CHEMIN_ENTRETIEN(id)
          const contenuAvant = contenusAvant.get(id)
          const contenuTente = readFileSync(join(this.miroir.dirLocal, chemin), 'utf8')
          if (contenuTente === contenuAvant) continue
          try {
            if (idsTenus.has(id)) {
              sessions?.noterSale(id)
              if (cibles.ordreCorpus === 'apres' && corpusModifie) {
                if (!sessions?.publier) {
                  throw new ErreurTransaction('La session ouverte ne permet pas de confirmer sa publication.')
                }
                const publication = await sessions.publier(id)
                if (!publication.ok) {
                  throw new ErreurTransaction(
                    `La session de « ${id} » n’a pas été publiée (${publication.raison ?? 'échec inconnu'}).`,
                  )
                }
              }
            } else {
              const etagFinal = await this.publierEntretienCourt(
                chemin,
                contenuTente,
                etags.get(id) ?? null,
              )
              if (etagFinal) this.miroir.noterEtagPublie(chemin, etagFinal)
            }
            publies.push(`l’entretien « ${id} »`)
          } catch (e) {
            await this.rafraichirEntretienLocalApresEchec(chemin, contenuAvant ?? contenuTente)
            for (const restant of entretiensAPublier.slice(index + 1)) {
              const avant = contenusAvant.get(restant)
              if (avant !== undefined) this.ecrireEntretienLocal(CHEMIN_ENTRETIEN(restant), avant)
            }
            if (cibles.ordreCorpus === 'apres' && corpusModifie) {
              this.ecrireCorpusLocal(contenuCorpusAvant)
            }
            if (publies.length) {
              throw new ErreurTransaction(
                `La correction a été appliquée partiellement (${publies.join(', ')}), mais « ${id} » a échoué. Actualisez le répertoire puis reprenez l’opération. ${classifier(e).message}`,
              )
            }
            throw e
          }
        }
      }

      if (cibles.ordreCorpus === 'apres') {
        await publierEntretiens()
        await publierDefinitions()
      } else {
        await publierDefinitions()
        await publierEntretiens()
      }
      return resultat
    } catch (e) {
      throw classifier(e)
    } finally {
      for (const verrou of [...verrousEntretiens].reverse()) {
        await verrou.provider.liberer(verrou.chemin).catch(() => {})
      }
      if (verrouCorpusTenu) await providerCorpus.liberer(CHEMIN_VERROU_CORPUS).catch(() => {})
    }
  }

  /** Crée la définition avant le lien et conserve la fiche si le second commit échoue. */
  async creerPersonneDepuisLocuteur(
    entretienId: string,
    locuteurId: string,
    nom: string,
  ): Promise<string> {
    const personneId = await this.executer(() => this.getStore().creerDefinitionPersonne(nom))
    try {
      await this.executerEntretien(entretienId, () => this.getStore().personnesCommander({
        type: 'lier', entretienId, locuteurId, personneId,
      }, false))
      return personneId
    } catch (e) {
      throw new ErreurTransaction(
        `La personne a été créée, mais le lien a échoué. Retrouvez-la dans le répertoire pour réessayer. ${classifier(e).message}`,
      )
    }
  }

  /* ── Lot de valeurs — un verrou court PAR ENTRETIEN ───────────────────*/

  /** Modification en lot des valeurs EAV (table de données, colonne) :
   *  le lot ne touche PAS `corpus.json` (pas de verrou corpus) — UN cycle par ENTRETIEN :
   *  verrou court → GET frais → PUT If-Match → libérer (le même motif que les définitions,
   *  appliqué au fichier entretien). Exécution séquentielle ;
   *  tout échec ponctuel (entretien ouvert entre-temps par autrui, divergence 412, réseau)
   *  est signalé nommément SANS bloquer les autres entretiens du lot.
   *  Le miroir est écrit THROUGH (même contenu que le serveur) →
   *  la matrice locale est fraîche sans pull complet, le prochain tirage devient no-op.
   *  JAMAIS de verrou global : un lot long ne doit pas geler le corpus. */
  async poserValeurLot(items: ItemLotValeur[]): Promise<ResultatLotValeur> {
    const succes: string[] = []
    const echecs: { id: string; raison: string }[] = []
    // Regrouper par entretien :
    // UN verrou et UN aller-retour serveur même si plusieurs valeurs demandées pour le même fichier (itération 1 :
    // 1 variable → 1 item).
    const parEntretien = new Map<string, ItemLotValeur[]>()
    for (const item of items) {
      const liste = parEntretien.get(item.entretienId) ?? []
      liste.push(item)
      parEntretien.set(item.entretienId, liste)
    }
    const sessions = this.options.getSessions?.() ?? null
    for (const [id, lot] of parEntretien) {
      try {
        if (sessions?.idsTenus().includes(id)) {
          // Session À NOUS sur cet id (défense en profondeur, cf. options) :
          // chemin existant — la publication suivra la session (`noterSale`),
          // jamais un second verrou sur un fichier déjà à nous.
          const store = this.getStore()
          const gardePrecedente = store.lectureSeule
          store.lectureSeule = false
          try {
            for (const item of lot)
              if (!store.poserValeur(item.entretienId, item.cible, item.idVar, item.idMod))
                throw new ErreurTransaction(`« ${item.entretienId} » est introuvable dans le corpus.`)
          } finally {
            store.lectureSeule = gardePrecedente
          }
          sessions.noterSale(id)
        } else {
          await this.poserValeurHorsSession(id, lot)
        }
        succes.push(id)
      } catch (e) {
        echecs.push({ id, raison: classifier(e).message })
      }
    }
    return { succes, echecs }
  }

  /** Le cycle d'UN entretien hors session : acquerir → GET frais → mutation pure locale →
   *  PUT If-Match → écriture THROUGH du miroir,
   *  `liberer` TOUJOURS en `finally` (y compris sur échec). Divergence 412 ou réseau :
   *  exception propagée à l'appelant (échec nommé, miroir NON modifié —
   *  il n'est écrit qu'après un PUT réussi). Pas de retry (itération 1) : l'utilisateur relance le lot. */
  private async poserValeurHorsSession(id: string, lot: ItemLotValeur[]): Promise<void> {
    const provider = this.providerPourEntretien()
    const cheminVerrou = this.cheminVerrouEntretien(id)
    const acquisition = await provider.acquerir(cheminVerrou)
    if (!acquisition.ok) {
      throw new ErreurTransaction(
        `« ${id} » est ouvert par ${acquisition.tenuPar?.userId ?? 'un autre utilisateur'} — impossible de le modifier tant que cette session tient.`,
      )
    }
    try {
      const cheminFichier = CHEMIN_ENTRETIEN(id)
      // La version d'APRÈS-verrou fait foi : GET frais du SERVEUR,
      // jamais confiance à la copie miroir (périmée possible).
      const etagServeur = await this.etagServeurDe(cheminFichier)
      let brut: string
      if (etagServeur) brut = await this.client.getTexte(cheminFichier)
      else
        brut = readFileSync(join(this.miroir.dirLocal, cheminFichier), 'utf8') // cas dégénéré : absent du serveur, partir du miroir
      const data = JSON.parse(brut) as EntretienFichier
      // Mutation pure locale — parité `store.poserValeur`, sans toucher au membership.
      for (const item of lot) corpusModel.poserValeur(data, item.cible, item.idVar, item.idMod)
      data.lastModified = new Date().toISOString()
      const contenu = JSON.stringify(data, null, 2)
      // PUT If-Match : divergence (412) → exception ci-dessus, rien n'est écrasé.
      const etagFinal = await this.publierEntretienCourt(cheminFichier, contenu, etagServeur)
      // Écriture THROUGH du MIROIR : le MÊME contenu que le serveur part en local (écriture atomique,
      // même utilitaire que le store) — la matrice est fraîche sans pull complet.
      const abs = join(this.miroir.dirLocal, cheminFichier)
      mkdirSync(dirname(abs), { recursive: true })
      const tmp = `${abs}.tmp`
      writeFileSync(tmp, contenu, 'utf8')
      renameSync(tmp, abs)
      if (etagFinal) this.miroir.noterEtagPublie(cheminFichier, etagFinal)
    } finally {
      await provider.liberer(cheminVerrou).catch(() => {})
    }
  }

  /* ── Anonymisation en masse — un verrou court PAR ENTRETIEN ────────────*/


  /** Application EN MASSE d'une règle anon sur des entretiens FERMÉS.
   *  Le même motif que `poserValeurLot` : UN cycle par fichier (verrou court, GET frais du serveur,
   *  instructions pures, PUT If-Match), exécution séquentielle,
   *  échec nommé sans bloquer les autres entretiens du lot.
   *  Un entretien OUVERT chez nous passe par le chemin session existant (défense en profondeur, cf.
   *  `poserValeurLot`). */
  async appliquerRegleLot(cibles: CibleRegleAnon[]): Promise<ResultatLotAnon> {
    const succes: ResultatLotAnon['succes'] = []
    const echecs: ResultatLotAnon['echecs'] = []
    // Dédupliquer par entretien : UN verrou et UN aller-retour serveur,
    // même si la sélection contient des doublons ; les plages du diff (poses cochées, retraits,
    // exceptions) sont FUSIONNÉES.
    const parEntretien = new Map<string, CibleRegleAnon>()
    for (const c of cibles) {
      const v = parEntretien.get(c.entretienId)
      if (!v) {
        parEntretien.set(c.entretienId, { ...c })
      } else {
        for (const k of ['plages', 'retirer', 'exception', 'retirerException'] as const) {
          if (c[k]?.length) v[k] = [...(v[k] ?? []), ...c[k]]
        }
      }
    }
    const sessions = this.options.getSessions?.() ?? null
    for (const [id, cible] of parEntretien) {
      try {
        const { regle, titre } = this.regleEtTitre(cible.regleId, id)
        if (sessions?.idsTenus().includes(id)) {
          // Session À NOUS sur cet id : chemin existant ; la publication suivra la session (`noterSale`).
          // Jamais un second verrou sur un fichier déjà à nous.
          const store = this.getStore()
          const gardePrecedente = store.lectureSeule
          store.lectureSeule = false
          let nb: number
          try {
            nb = store.appliquerRegleAnon(id, cible.regleId, cible).nb
          } finally {
            store.lectureSeule = gardePrecedente
          }
          sessions.noterSale(id)
          succes.push({ id, nb, titre })
        } else {
          const nb = await this.appliquerRegleHorsSession(id, regle, cible)
          succes.push({ id, nb, titre })
        }
      } catch (e) {
        echecs.push({ id, raison: classifier(e).message })
      }
    }
    return { succes, echecs }
  }

  /** Règle + titre lus sur le corpus LOCAL (miroir).
   *  La règle affichée dans le panneau est celle qu'on applique ;
   *  le GET frais porte sur le fichier ENTRETIEN seul,
   *  qui est le seul verrouillé par ce cycle. */
  private regleEtTitre(regleId: string, entretienId: string): { regle: RegleAnon; titre: string } {
    const corpus = this.getStore().ouvrir()
    const regle = corpus.reglesAnon[regleId]
    if (!regle) throw new ErreurTransaction('La règle n\u2019existe plus — actualisez le corpus puis recommencez.')
    return { regle, titre: corpus.membership[entretienId]?.titre ?? entretienId }
  }

  /** Le cycle d'UN entretien hors session : acquerir, GET frais, instructions pures, PUT If-Match,
   *  écriture THROUGH du miroir ; `liberer` TOUJOURS en `finally` (même sur échec).
   *  Refus de verrou / divergence 412 / réseau : exception propagée à l'appelant (échec nommé,
   *  miroir NON modifié). Rien à poser → aucun PUT, aucun `lastModified` touché. */
  private async appliquerRegleHorsSession(
    id: string,
    regle: RegleAnon,
    cible: CibleRegleAnon,
  ): Promise<number> {
    const provider = this.providerPourEntretien()
    const cheminVerrou = this.cheminVerrouEntretien(id)
    const acquisition = await provider.acquerir(cheminVerrou)
    if (!acquisition.ok) {
      throw new ErreurTransaction(
        `ouvert par ${acquisition.tenuPar?.userId ?? 'un autre utilisateur'} — impossible de l'anonymiser tant que cette session tient.`,
      )
    }
    try {
      const cheminFichier = CHEMIN_ENTRETIEN(id)
      // La version d'APRÈS-verrou fait foi : GET frais du SERVEUR,
      // jamais confiance à la copie miroir (périmée possible).
      const etagServeur = await this.etagServeurDe(cheminFichier)
      let brut: string
      if (etagServeur) brut = await this.client.getTexte(cheminFichier)
      else
        brut = readFileSync(join(this.miroir.dirLocal, cheminFichier), 'utf8') // cas dégénéré : absent du serveur, partir du miroir.
      const data = JSON.parse(brut) as EntretienFichier
      const instr = instructionsAppliquerRegle(data, regle, () => 'a-' + Math.random().toString(36).slice(2, 9))
      const poser = poserDansPlages(instr.poser, cible.plages)
      const nbDiff = appliquerDiffAnon(
        data.annotations,
        regle.id,
        cible.retirer,
        cible.exception,
        cible.retirerException,
      )
      if (poser.length === 0 && nbDiff === 0) return 0
      for (const o of poser) {
        data.annotations.push({
          id: o.id,
          type: 'anon',
          from: o.from,
          to: o.to,
          auteur: 'corpus',
          etat: 'anonymise',
          pseudo: o.pseudo,
          regle: o.regle,
        })
      }
      data.lastModified = new Date().toISOString()
      const contenu = JSON.stringify(data, null, 2)
      // PUT If-Match : divergence (412) → exception ci-dessus, rien n'est écrasé.
      const etagFinal = await this.publierEntretienCourt(cheminFichier, contenu, etagServeur)
      // Écriture THROUGH du MIROIR : le MÊME contenu que le serveur part en local ;
      // compteurs et prochains scans sont à jour sans pull complet.
      const abs = join(this.miroir.dirLocal, cheminFichier)
      mkdirSync(dirname(abs), { recursive: true })
      const tmp = `${abs}.tmp`
      writeFileSync(tmp, contenu, 'utf8')
      renameSync(tmp, abs)
      if (etagFinal) this.miroir.noterEtagPublie(cheminFichier, etagFinal)
      return poser.length + nbDiff
    } finally {
      await provider.liberer(cheminVerrou).catch(() => {})
    }
  }

  /* ── Aides internes ──────────────────────────────────────────────────────── */

  /** GET frais de `corpus.json` si le serveur n'est plus la version du manifeste ;
   *  renvoie l'ETag serveur OBSERVÉ (garde If-Match du PUT final).
   *  null = fichier absent du serveur (cas dégénéré : première publication). */
  private async rafraichirCorpusLocal(): Promise<string | null> {
    const etatServeur = await this.etagServeurDe(CHEMIN_CORPUS)
    if (!etatServeur) return null
    if (etatServeur === this.miroir.etagDistant(CHEMIN_CORPUS)) return etatServeur
    const contenu = await this.client.getTexte(CHEMIN_CORPUS)
    const abs = join(this.miroir.dirLocal, CHEMIN_CORPUS)
    mkdirSync(dirname(abs), { recursive: true })
    const tmp = `${abs}.tmp`
    writeFileSync(tmp, contenu, 'utf8')
    renameSync(tmp, abs)
    this.miroir.noterEtagPublie(CHEMIN_CORPUS, etatServeur)
    return etatServeur
  }

  private archiverOrphelinLocal(id: string, nomDestination: string): void {
    const source = join(this.miroir.dirLocal, CHEMIN_ENTRETIEN(id))
    if (!existsSync(source)) return
    const dossier = join(this.miroir.dirLocal, 'corbeille-miroir', 'entretiens')
    mkdirSync(dossier, { recursive: true })
    let destination = join(dossier, nomDestination)
    if (existsSync(destination)) {
      destination = join(
        dossier,
        `${nomDestination}.copie-${Math.random().toString(36).slice(2, 10)}`,
      )
    }
    renameSync(source, destination)
  }

  private async destinationCorbeilleDistante(id: string): Promise<string> {
    const destination = `corbeille/${id}.json`
    if (await this.etagServeurDe(destination) === null) return destination
    return `corbeille/${id}.copie-${Math.random().toString(36).slice(2, 10)}.json`
  }

  private async deplacementConfirme(source: string, destination: string): Promise<boolean> {
    try {
      const [etagSource, etagDestination] = await Promise.all([
        this.etagServeurDe(source),
        this.etagServeurDe(destination),
      ])
      return etagSource === null && etagDestination !== null
    } catch {
      return false
    }
  }

  /** Confirme un PUT court dont la réponse a pu se perdre après le commit. */
  private async publierEntretienCourt(
    chemin: string,
    contenu: string,
    etagAttendu: string | null,
  ): Promise<string> {
    try {
      const nouveauEtag = await this.client.putTexte(
        chemin,
        contenu,
        etagAttendu ? { ifMatch: etagAttendu } : {},
      )
      return nouveauEtag ?? (await this.etagServeurDe(chemin)) ?? etagAttendu ?? ''
    } catch (e) {
      try {
        const etagActuel = await this.etagServeurDe(chemin)
        if (etagActuel && await this.client.getTexte(chemin) === contenu) return etagActuel
      } catch {
        /* L'erreur initiale reste la plus utile. */
      }
      throw e
    }
  }

  private ecrireEntretienLocal(chemin: string, contenu: string): void {
    const abs = join(this.miroir.dirLocal, chemin)
    mkdirSync(dirname(abs), { recursive: true })
    const tmp = `${abs}.tmp`
    writeFileSync(tmp, contenu, 'utf8')
    renameSync(tmp, abs)
  }

  private async rafraichirEntretienLocalApresEchec(chemin: string, repli: string): Promise<void> {
    try {
      const etag = await this.etagServeurDe(chemin)
      if (!etag) {
        this.ecrireEntretienLocal(chemin, repli)
        return
      }
      this.ecrireEntretienLocal(chemin, await this.client.getTexte(chemin))
      this.miroir.noterEtagPublie(chemin, etag)
    } catch {
      this.ecrireEntretienLocal(chemin, repli)
    }
  }

  /** Réconcilie un PUT dont la réponse n'est pas exploitable.
   *  Le miroir ne reçoit que le contenu effectivement relu sur le serveur. */
  private async reconcilierCorpusApresEchec(
    contenuTente: string,
  ): Promise<'publie' | 'serveur-restaure' | 'inconnue'> {
    try {
      const etag = await this.etagServeurDe(CHEMIN_CORPUS)
      if (!etag) return 'inconnue'
      const contenuServeur = await this.client.getTexte(CHEMIN_CORPUS)
      this.ecrireCorpusLocal(contenuServeur)
      this.miroir.noterEtagPublie(CHEMIN_CORPUS, etag)
      return contenuServeur === contenuTente ? 'publie' : 'serveur-restaure'
    } catch {
      return 'inconnue'
    }
  }

  private ecrireCorpusLocal(contenu: string): void {
    const abs = join(this.miroir.dirLocal, CHEMIN_CORPUS)
    mkdirSync(dirname(abs), { recursive: true })
    const tmp = `${abs}.tmp`
    writeFileSync(tmp, contenu, 'utf8')
    renameSync(tmp, abs)
  }

  /** Crée exclusivement un entretien et confirme les réponses éventuellement perdues. */
  private async publierNouvelEntretien(chemin: string, contenu: string): Promise<string> {
    try {
      const etag = await this.client.putTexte(chemin, contenu, { ifNoneMatch: '*' })
      return etag ?? (await this.etagServeurDe(chemin)) ?? ''
    } catch (e) {
      try {
        const etag = await this.etagServeurDe(chemin)
        if (etag && await this.client.getTexte(chemin) === contenu) return etag
      } catch {
        // L'erreur initiale reste la plus utile.
      }
      throw e
    }
  }

  /** Annule une création dont le membership n'a certainement pas été publié. */
  private async annulerNouvelEntretien(chemin: string, etag: string): Promise<void> {
    try {
      await this.client.supprimer(chemin, etag || undefined)
    } catch {
      try {
        if (await this.etagServeurDe(chemin) === null) return
      } catch {
        // L'orphelin sera archivé par une réconciliation ultérieure.
      }
    }
  }

  /** PUT If-Match de `corpus.json`, avec mise à jour optionnelle du manifeste. */
  private async publierCorpus(
    etagAttendu: string | null,
    contenuFourni?: string,
    noterManifeste = true,
  ): Promise<string> {
    const contenu = contenuFourni
      ?? readFileSync(join(this.miroir.dirLocal, CHEMIN_CORPUS), 'utf8')
    const nouveauEtag = await this.client.putTexte(
      CHEMIN_CORPUS,
      contenu,
      etagAttendu ? { ifMatch: etagAttendu } : {},
    )
    const etagFinal =
      nouveauEtag ??
      (await this.etagServeurDe(CHEMIN_CORPUS)) ??
      etagAttendu ??
      ''
    if (etagFinal && noterManifeste) this.miroir.noterEtagPublie(CHEMIN_CORPUS, etagFinal)
    return etagFinal
  }

  /** Provider du verrou ENTRETIEN selon la variante mesurée à l'ouverture. */
  private providerPourEntretien(): VerrouProvider {
    return this.options.verrouNatif
      ? new ProviderFilesLock(this.client, this.identite)
      : new ProviderPutConditionnel(this.client, this.identite)
  }

  private cheminVerrouEntretien(id: string): string {
    return this.options.verrouNatif ? CHEMIN_ENTRETIEN(id) : `verrous/${id}.lock.json`
  }

  /** ETag serveur courant d'un fichier, observé par PROPFIND Depth:1. */
  private async etagServeurDe(cheminRelatif: string): Promise<string | null> {
    const dossier = cheminRelatif.includes('/')
      ? cheminRelatif.slice(0, cheminRelatif.lastIndexOf('/'))
      : ''
    const nom = cheminRelatif.slice(cheminRelatif.lastIndexOf('/') + 1)
    const entree = (await this.client.propfind(dossier)).find((x) => x.chemin === nom)
    return entree?.etag ?? null
  }
}

/* ── Lot de valeurs en corpus LOCAL ──────────────────────────────────────*/

/** Pas de transaction ni de garde en local (aucune couche session) : boucle directe du store,
 *  MÊMES résultats qu'en distant — succès par entretien, échecs nommés,
 *  un échec ne bloque jamais les autres. */
export async function poserValeurLotLocal(
  store: CorpusStore,
  items: ItemLotValeur[],
): Promise<ResultatLotValeur> {
  const succes: string[] = []
  const echecs: { id: string; raison: string }[] = []
  const ids = [...new Set(items.map((i) => i.entretienId))]
  for (const id of ids) {
    try {
      for (const item of items.filter((i) => i.entretienId === id))
        if (!store.poserValeur(item.entretienId, item.cible, item.idVar, item.idMod))
          throw new Error(`« ${id} » est introuvable dans le corpus.`)
      succes.push(id)
    } catch (e) {
      echecs.push({ id, raison: classifier(e).message })
    }
  }
  return { succes, echecs }
}

/* ── Lot d'anonymisation en masse en corpus LOCAL ────────────────────────────*/

/** Pas de transaction ni de garde en local (aucune couche session) :
 *  boucle directe du store, avec les MÊMES résultats qu'en distant.
 *  Succès par entretien avec occurrences posées ; échecs nommés ;
 *  un échec ne bloque jamais les autres entretiens du lot. */
export async function appliquerRegleLotLocal(
  store: CorpusStore,
  cibles: CibleRegleAnon[],
): Promise<ResultatLotAnon> {
  const succes: ResultatLotAnon['succes'] = []
  const echecs: ResultatLotAnon['echecs'] = []
  const vues = new Set<string>()
  for (const c of cibles) {
    if (vues.has(c.entretienId)) continue
    vues.add(c.entretienId)
    try {
      const r = store.appliquerRegleAnon(c.entretienId, c.regleId, c)
      succes.push({ id: c.entretienId, nb: r.nb, titre: r.titre })
    } catch (e) {
      echecs.push({ id: c.entretienId, raison: classifier(e).message })
    }
  }
  return { succes, echecs }
}

/* ── Classification des échecs en messages utilisateur ───────────────────────*/

function messageRefusDefinitions(tenuPar: ContenuVerrou | null): string {
  return `Définitions en cours de modification par ${tenuPar?.userId ?? 'un autre utilisateur'} — réessayez dans un instant.`
}

/** Traduit les échecs techniques en messages utilisateur ;
 *  laisse passer tels quels les refus de domaine (Error simple levée PAR la mutation)
 *  et les ErreurTransaction déjà formulées. */
function classifier(e: unknown): Error {
  if (e instanceof ErreurTransaction) return e
  if (e instanceof ErreurDelaiWebDAV) {
    return new ErreurTransaction(
      'Le serveur n’a pas répondu dans le délai prévu. La modification n’est pas considérée comme publiée.',
    )
  }
  if (e instanceof ErreurHttp) {
    if (e.statut === 412) {
      return new ErreurTransaction(
        'Le serveur a changé pendant la modification (divergence). Rien n\u2019a été écrasé — actualisez le corpus puis recommencez.',
      )
    }
    if (e.statut === 0 || e.statut >= 500) {
      return new ErreurTransaction(`Le serveur a répondu une erreur (${e.statut}) — réessayez.`)
    }
    return new ErreurTransaction(`Le serveur a refusé l'opération (${e.statut}).`)
  }
  // fetch réseau : TypeError (« fetch failed »…) — pas de différé, un refus explicite.
  // Toute AUTRE erreur (refus de domaine levé par la mutation, fichier local corrompu…)
  // traverse INCHANGÉE — on ne déguise jamais un refus métier en panne réseau.
  if (e instanceof TypeError) {
    return new ErreurTransaction(
      'Serveur injoignable — les modifications partagées nécessitent une connexion au corpus distant.',
    )
  }
  return e instanceof Error ? e : new ErreurTransaction('Modification impossible pour une raison inattendue.')
}
