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
import type { MiroirWebDAV } from './miroirWebDAV'
import type { CorpusStore } from '../corpusStore'
import * as corpusModel from '../../shared/corpus'
import type { IdentiteSession } from './sessions'
import { ProviderPutConditionnel } from '../verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../verrous/providerFilesLock'
import type { ContenuVerrou, VerrouProvider } from '../verrous/types'
import { appliquerRegleAnonEntretienAvecBilan } from '../../shared/entretien/anon'
import { regrouperCiblesAnon } from '../../shared/corpus/lotAnon'
import type {
  CorpusFichier,
  EntretienFichier,
  ItemLotValeur,
  ModeTriEntretiens,
  ResultatLotValeur,
  CibleRegleAnon,
  ResultatLotAnon,
  ResultatMutationAnon,
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
import type { DemandeOperationTheme, OptionsExecutionOperationTheme, ProgressionOperationTheme } from '../../shared/corpus/themes'
import { ApercusThemesWebDAV } from './apercusThemesWebDAV'
import { OperationsThemesWebDAV } from './operationsThemesWebDAV'
import { randomUUID } from 'node:crypto'
import { CorrespondancesWebDAV } from './correspondancesWebDAV'
import type { TablesCorrespondance } from '../tablesCorrespondance'
import { RenommagesAnonWebDAV } from './renommagesAnonWebDAV'
import { GardePseudosWebDAV } from './gardePseudosWebDAV'
import { AjoutsVarianteAnonWebDAV } from './ajoutsVarianteAnonWebDAV'
import type { DemandeAjoutVarianteAnon } from '../../shared/corpus/variantesAnon'
import { exigerAbsenceDissociationWebDAV } from '../../shared/corpus/barriereDissociationWebDAV'
import { DissociationsAnonWebDAV } from './dissociationsAnonWebDAV'
import { SuppressionsAnonWebDAV } from './suppressionsAnonWebDAV'
import type { DemandeSuppressionAnon } from '../../shared/corpus/suppressionAnon'
import type { DemandeDissociationAnon } from '../../shared/corpus/dissociationAnon'
import type { PreparationRenommageDistant } from '../renommagesAnon'

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
  gardePseudos?: GardePseudosWebDAV
  /** Accès à la couche session pour réutiliser un verrou déjà tenu par ce poste.
   *  Une correction ordinaire marque la session comme sale au lieu de prendre un second verrou.
   *  Une réunion publie la session avant de retirer une définition encore référencée. */
  getSessions?: () => {
    idsTenus(): string[]
    idsRecuperablesLocalement?(): string[]
    noterSale(id: string): void
    publier?(id: string): Promise<{ ok: boolean; raison?: string }>
    publierSousVerrouCorpus?(id: string, provider: ProviderPutConditionnel): Promise<{ ok: boolean; raison?: string }>
    confirmerSource?(chemin: string, contenu: string, etag: string): void
  } | null
}

export class TransactionsCorpus {
  private readonly apercusThemes: ApercusThemesWebDAV
  private readonly operationsThemes: OperationsThemesWebDAV
  private readonly correspondances: CorrespondancesWebDAV
  private readonly renommages: RenommagesAnonWebDAV
  private readonly dissociations: DissociationsAnonWebDAV
  private readonly suppressions: SuppressionsAnonWebDAV
  private readonly gardePseudos: GardePseudosWebDAV
  private readonly ajoutsVariante: AjoutsVarianteAnonWebDAV
  private mutationsEnCours = 0

  constructor(
    private readonly client: ClientWebDAV,
    private readonly miroir: MiroirWebDAV,
    /** Le store courant — capturé PAR APPEL : « Ouvrir un corpus… » réaffecte le store du main,
     *  la couche transaction doit toujours viser le dernier. */
    private readonly getStore: () => CorpusStore,
    private readonly identite: () => IdentiteSession,
    private readonly options: OptionsTransactions = {},
  ) {
    this.gardePseudos = options.gardePseudos ?? new GardePseudosWebDAV(client, identite, miroir.dirLocal,
      (chemin, contenu, etag) => {
        const sessions = options.getSessions?.()
        if (sessions?.confirmerSource) return sessions.confirmerSource(chemin, contenu, etag)
        const id = chemin.slice('entretiens/'.length, -'.json'.length)
        if (!sessions?.idsTenus().includes(id) && !sessions?.idsRecuperablesLocalement?.().includes(id)) this.ecrireEntretienLocal(chemin, contenu)
        miroir.noterEtagPublie(chemin, etag)
      })
    this.ajoutsVariante = new AjoutsVarianteAnonWebDAV({ client, dirLocal: miroir.dirLocal, identite,
      miroir: (contenu, etag) => { this.ecrireCorpusLocal(contenu); miroir.noterEtagPublie(CHEMIN_CORPUS, etag) },
    })
    const identiteRenommage = () => ({ ...this.identite(), sessionId: `rename-${randomUUID()}` })
    this.renommages = new RenommagesAnonWebDAV({
      client, store: getStore(), dirLocal: miroir.dirLocal,
      miroir: (chemin, contenu, etag) => {
        this.ecrireEntretienLocal(chemin, contenu)
        miroir.noterEtagPublie(chemin, etag)
      },
      sessionsLocales: () => [...(options.getSessions?.()?.idsTenus() ?? []), ...(options.getSessions?.()?.idsRecuperablesLocalement?.() ?? [])],
      verrouCorpus: () => {
        const id = identiteRenommage()
        return { provider: new ProviderPutConditionnel(client, () => id), chemin: CHEMIN_VERROU_CORPUS }
      },
      verrouEntretien: (id) => {
        const identite = identiteRenommage()
        return { provider: options.verrouNatif ? new ProviderFilesLock(client, () => identite) : new ProviderPutConditionnel(client, () => identite),
          chemin: this.cheminVerrouEntretien(id) }
      },
    })
    const identiteDissociation = () => ({ ...this.identite(), sessionId: `dissociation-${randomUUID()}` })
    this.dissociations = new DissociationsAnonWebDAV({
      client, dirLocal: miroir.dirLocal,
      miroir: (chemin, contenu, etag) => {
        this.ecrireEntretienLocal(chemin, contenu)
        miroir.noterEtagPublie(chemin, etag)
      },
      sessionsLocales: () => [...(options.getSessions?.()?.idsTenus() ?? []), ...(options.getSessions?.()?.idsRecuperablesLocalement?.() ?? [])],
      verrouCorpus: () => {
        const identite = identiteDissociation()
        return { provider: new ProviderPutConditionnel(client, () => identite), chemin: CHEMIN_VERROU_CORPUS }
      },
      verrouEntretien: (id) => {
        const identite = identiteDissociation()
        return { provider: options.verrouNatif ? new ProviderFilesLock(client, () => identite) : new ProviderPutConditionnel(client, () => identite),
          chemin: this.cheminVerrouEntretien(id) }
      },
    })
    const identiteSuppression = () => ({ ...this.identite(), sessionId: `suppression-anon-${randomUUID()}` })
    this.suppressions = new SuppressionsAnonWebDAV({
      client, dirLocal: miroir.dirLocal,
      miroir: (chemin, contenu, etag) => {
        this.ecrireEntretienLocal(chemin, contenu)
        miroir.noterEtagPublie(chemin, etag)
      },
      sessionsLocales: () => [...(options.getSessions?.()?.idsTenus() ?? []), ...(options.getSessions?.()?.idsRecuperablesLocalement?.() ?? [])],
      verrouCorpus: () => {
        const identite = identiteSuppression()
        return { provider: new ProviderPutConditionnel(client, () => identite), chemin: CHEMIN_VERROU_CORPUS }
      },
      verrouEntretien: (id) => {
        const identite = identiteSuppression()
        return { provider: options.verrouNatif ? new ProviderFilesLock(client, () => identite) : new ProviderPutConditionnel(client, () => identite),
          chemin: this.cheminVerrouEntretien(id) }
      },
    })
    this.apercusThemes = new ApercusThemesWebDAV(client, (avant) => this.getStore().adapterEntretienOperationTheme(avant))
    const identiteCourte = () => ({ ...this.identite(), sessionId: `theme-${randomUUID()}` })
    this.operationsThemes = new OperationsThemesWebDAV({
      client, apercus: this.apercusThemes, dirLocal: miroir.dirLocal, gardePseudos: this.gardePseudos,
      adapter: (avant) => this.getStore().adapterEntretienOperationTheme(avant),
      miroir: (chemin, contenu, etag) => {
        this.ecrireEntretienLocal(chemin, contenu)
        if (etag) miroir.noterEtagPublie(chemin, etag)
      },
      verrouCorpus: () => {
        const identite = identiteCourte()
        return { provider: new ProviderPutConditionnel(client, () => identite), chemin: CHEMIN_VERROU_CORPUS }
      },
      verrouEntretien: (id) => {
        const identite = identiteCourte()
        return { provider: options.verrouNatif ? new ProviderFilesLock(client, () => identite)
          : new ProviderPutConditionnel(client, () => identite), chemin: this.cheminVerrouEntretien(id) }
      },
      sessionsLocales: () => {
        const sessions = options.getSessions?.()
        return [...(sessions?.idsTenus() ?? []), ...(sessions?.idsRecuperablesLocalement?.() ?? [])]
      },
    })
    const identiteImport = () => ({ ...this.identite(), sessionId: `import-${randomUUID()}` })
    this.correspondances = new CorrespondancesWebDAV({
      client, store: getStore(), dirLocal: miroir.dirLocal,
      miroir: (chemin, contenu, etag) => {
        this.ecrireEntretienLocal(chemin, contenu)
        miroir.noterEtagPublie(chemin, etag)
      },
      verrouCorpus: () => {
        const identite = identiteImport()
        return { provider: new ProviderPutConditionnel(client, () => identite), chemin: CHEMIN_VERROU_CORPUS }
      },
      verrouEntretien: (id) => {
        const identite = identiteImport()
        return { provider: options.verrouNatif ? new ProviderFilesLock(client, () => identite)
          : new ProviderPutConditionnel(client, () => identite), chemin: this.cheminVerrouEntretien(id) }
      },
      sessionsLocales: () => {
        const sessions = options.getSessions?.()
        return [...(sessions?.idsTenus() ?? []), ...(sessions?.idsRecuperablesLocalement?.() ?? [])]
      },
    })
  }

  /** Refuse les écritures ordinaires tant qu’un import est actif ou incomplet. */
  exigerSansImportCorrespondances(): void {
    if (this.correspondances.occupe || this.correspondances.lireSuivi()) {
      throw new Error('Un import WebDAV est en cours ou reste à reprendre. Aucune autre écriture n’est autorisée.')
    }
  }

  lireAjoutVariante() { return this.ajoutsVariante.lireEnvoi() }
  reconcilierAjoutVariante() { return this.ajoutsVariante.reconcilier() }
  exigerSansAjoutVariante() { this.ajoutsVariante.exigerDisponible() }
  async ajouterVarianteAnon(demande: DemandeAjoutVarianteAnon) {
    if (this.mutationsEnCours || this.operationsThemes.occupe || this.operationsThemes.lireSuivi()) throw new Error('Terminez les autres modifications avant l’ajout de variante.')
    return this.avecMutation(() => this.ajoutsVariante.appliquer(demande))
  }

  async reconcilierPublicationEntretien() { await this.gardePseudos.reconcilier() }
  lirePublicationEntretien() { return this.gardePseudos.lireEnvoi() }
  exigerPublicationDisponible() { this.exigerSansAjoutVariante(); this.gardePseudos.exigerDisponible() }
  exigerSansRenommage(): void {
    this.exigerSansDissociation()
    this.exigerPublicationDisponible()
    this.exigerJournalRenommageDisponible()
  }
  private exigerJournalRenommageDisponible(): void {
    this.renommages.exigerMiroirComplet()
    if (this.renommages.occupe || this.renommages.lireSuivi()) throw new Error('Un renommage WebDAV est en cours ou reste à reprendre. Terminez-le avant cette mutation du corpus.')
  }
  exigerOuvertureRenommage(id: string): void {
    this.suppressions.exigerMiroirComplet()
    if (this.suppressions.cibleProtegee(id)) throw new Error('Cette cible de suppression reste à publier. Relisez le suivi avant d’ouvrir cet entretien.')
    this.dissociations.exigerMiroirComplet()
    if (this.dissociations.cibleProtegee(id)) throw new Error('Cette cible de dissociation reste à publier. Reprenez le lot avant d’ouvrir cet entretien.')
    this.renommages.exigerMiroirComplet()
    if (this.renommages.cibleProtegee(id)) throw new Error('Cette cible de renommage reste à publier. Reprenez le lot avant d’ouvrir cet entretien.')
  }
  lireSuiviRenommageAnon() { return this.renommages.lireSuivi() }
  get renommageEnCours() { return this.renommages.occupe }
  get mutationEnCours() { return this.mutationsEnCours > 0 }
  private exigerRenommageDisponible() {
    this.exigerSansDissociation()
    this.exigerPublicationDisponible()
    this.exigerSansImportCorrespondances()
    if (this.mutationsEnCours || this.operationsThemes.occupe || this.operationsThemes.lireSuivi()) throw new Error('Terminez les mutations et opérations thématiques avant le renommage WebDAV.')
  }
  instantaneRenommageAnon() { this.exigerRenommageDisponible(); return this.renommages.instantane() }
  preparerRepriseRenommageAnon(id: string) { this.exigerRenommageDisponible(); return this.renommages.preparerReprise(id) }
  renommerVarianteAnon(p: PreparationRenommageDistant) { this.exigerRenommageDisponible(); return this.renommages.appliquer(p) }

  exigerSansDissociation(): void {
    this.exigerSansSuppression()
    this.exigerJournalDissociationDisponible()
  }
  private exigerJournalDissociationDisponible(): void {
    this.dissociations.exigerMiroirComplet()
    if (this.dissociations.occupe || this.dissociations.lireSuivi()) throw new Error('Une dissociation WebDAV est engagée. Relisez son suivi avant cette mutation du corpus.')
  }
  private exigerDissociationDisponible() {
    this.exigerSansSuppression()
    this.exigerPublicationDisponible()
    this.exigerSansImportCorrespondances()
    this.renommages.exigerMiroirComplet()
    if (this.renommages.occupe || this.renommages.lireSuivi() || this.mutationsEnCours || this.operationsThemes.occupe || this.operationsThemes.lireSuivi()) {
      throw new Error('Terminez les opérations incompatibles avant la dissociation WebDAV.')
    }
  }
  preparerDissociationAnon(demande: DemandeDissociationAnon) { this.exigerDissociationDisponible(); return this.dissociations.preparer(demande) }
  preparerRepriseDissociationAnon(id: string) { this.exigerDissociationDisponible(); return this.dissociations.preparerReprise(id) }
  ciblesApercuDissociationAnon(token: string) { return this.dissociations.ciblesApercu(token) }
  oublierApercuDissociationAnon(token: string) { this.dissociations.oublierApercu(token) }
  viderApercusDissociationAnon() { this.dissociations.viderApercus() }
  async dissocierRegleAnon(token: string, confirmee: boolean) {
    try { this.exigerDissociationDisponible(); return await this.dissociations.appliquer(token, confirmee) }
    finally { this.dissociations.oublierApercu(token) }
  }
  lireSuiviDissociationAnon() { return this.dissociations.lireSuivi() }
  relireSuiviDissociationAnon(id: string) { return this.dissociations.relireSuivi(id) }
  get dissociationEnCours() { return this.dissociations.occupe }
  cibleDissociationProtegee(id: string) { return this.dissociations.cibleProtegee(id) }

  exigerSansSuppression(): void {
    this.exigerSansAjoutVariante()
    this.suppressions.exigerMiroirComplet()
    if (this.suppressions.occupe || this.suppressions.lireSuivi()) throw new Error('Une suppression WebDAV est engagée. Relisez son suivi avant cette mutation du corpus.')
  }
  private exigerSuppressionDisponible() {
    this.exigerJournalDissociationDisponible()
    this.exigerPublicationDisponible()
    this.exigerSansImportCorrespondances()
    this.renommages.exigerMiroirComplet()
    if (this.renommages.occupe || this.renommages.lireSuivi() || this.mutationsEnCours || this.operationsThemes.occupe || this.operationsThemes.lireSuivi()) {
      throw new Error('Terminez les opérations incompatibles avant la suppression WebDAV.')
    }
  }
  preparerSuppressionAnon(demande: DemandeSuppressionAnon) { this.exigerSuppressionDisponible(); return this.suppressions.preparer(demande) }
  preparerRepriseSuppressionAnon(id: string) { this.exigerSuppressionDisponible(); return this.suppressions.preparerReprise(id) }
  ciblesApercuSuppressionAnon(token: string) { return this.suppressions.ciblesApercu(token) }
  oublierApercuSuppressionAnon(token: string) { this.suppressions.oublierApercu(token) }
  viderApercusSuppressionAnon() { this.suppressions.viderApercus() }
  async supprimerRegleAnonPartout(token: string, confirmee: boolean) {
    try { this.exigerSuppressionDisponible(); return await this.suppressions.appliquer(token, confirmee) }
    finally { this.suppressions.oublierApercu(token) }
  }
  lireSuiviSuppressionAnon() { return this.suppressions.lireSuivi() }
  relireSuiviSuppressionAnon(id: string) { return this.suppressions.relireSuivi(id) }
  get suppressionEnCours() { return this.suppressions.occupe }
  cibleSuppressionProtegee(id: string) { return this.suppressions.cibleProtegee(id) }

  private async avecMutation<T>(action: () => Promise<T>): Promise<T> {
    this.exigerSansImportCorrespondances()
    this.exigerSansRenommage()
    this.mutationsEnCours++
    try { return await action() } finally { this.mutationsEnCours-- }
  }

  private exigerImportDisponible(): void {
    this.exigerSansRenommage()
    if (this.mutationsEnCours || this.operationsThemes.occupe || this.operationsThemes.lireSuivi()) {
      throw new Error('Terminez les mutations et opérations thématiques avant l’import WebDAV.')
    }
  }

  async instantaneCorrespondances() {
    this.exigerImportDisponible()
    return this.correspondances.instantane()
  }

  async importerCorrespondances(preparation: ReturnType<TablesCorrespondance['consommerImport']>) {
    this.exigerImportDisponible()
    return this.correspondances.appliquer(preparation)
  }

  async reprendreImportCorrespondances(operationId: string, confirmee: boolean) {
    this.exigerImportDisponible()
    return this.correspondances.reprendre(operationId, confirmee)
  }

  lireSuiviImportCorrespondances() { return this.correspondances.lireSuivi() }
  get importCorrespondancesEnCours(): boolean { return this.correspondances.occupe }

  analyserOperationTheme(demande: DemandeOperationTheme, operationPrecedente?: string) {
    this.exigerSansImportCorrespondances()
    this.exigerSansRenommage()
    return this.operationsThemes.analyser(demande, operationPrecedente)
  }

  executerOperationTheme(id: string, demande: DemandeOperationTheme, options: OptionsExecutionOperationTheme,
    progression?: (etat: ProgressionOperationTheme) => void) {
    if (this.operationsThemes.occupe) return this.operationsThemes.executer(id, demande, options, progression)
    return this.avecMutation(() => this.operationsThemes.executer(id, demande, options, progression))
  }

  lireSuiviOperationTheme() { return this.operationsThemes.lireSuivi() }
  preparerRepriseOperationTheme(id: string) { return this.operationsThemes.preparerReprise(id) }
  async reconcilierOperationTheme(id: string) {
    this.exigerSansImportCorrespondances()
    this.exigerSansDissociation()
    this.exigerJournalRenommageDisponible()
    if (!this.operationsThemes.publicationDuLotSeule(id)) this.exigerPublicationDisponible()
    this.mutationsEnCours++
    try { return await this.operationsThemes.reconcilier(id) } finally { this.mutationsEnCours-- }
  }
  abandonnerOperationTheme(id: string) { this.operationsThemes.abandonner(id) }
  get operationThemeEnCours(): boolean { return this.operationsThemes.occupe }

  detailsOperationTheme(operationId: string, entretienId: string) {
    return this.apercusThemes.details(operationId, entretienId)
  }

  viderApercusOperationTheme(): void {
    this.apercusThemes.vider()
  }

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
    return this.avecMutation(() => this.executerSousVerrou(mutation))
  }

  private async executerSousVerrou<T>(mutation: () => T): Promise<T> {
    const provider = new ProviderPutConditionnel(this.client, this.identite)
    let verrouTenu = false
    try {
      const acquisition = await provider.acquerir(CHEMIN_VERROU_CORPUS)
      if (!acquisition.ok) throw new ErreurTransaction(messageRefusDefinitions(acquisition.tenuPar))
      verrouTenu = true

      // La version d'APRÈS-verrou fait foi : si le serveur porte autre chose que notre miroir,
      // on télécharge AVANT de muter — jamais de transformation posée sur une copie périmée.
      const etagServeur = await this.rafraichirCorpusLocal(true)
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

  /** Modifie les définitions après avoir verrouillé et relu les entretiens de
   *  contrôle. Ces sources restent inchangées ; seule la définition corpus est
   *  publiée. */
  async executerDefinitionsAvecSources<T>(
    idsDemandes: string[] | (() => string[]),
    mutation: () => T,
  ): Promise<T> {
    return this.executerCorrectionEntretiens(
      { corpus: true, entretiens: [] },
      idsDemandes,
      mutation,
    )
  }

  /** Trie selon les contenus publiés sans remplacer les fichiers du miroir local. */
  async trierEntretiens(mode: Extract<ModeTriEntretiens, 'modif' | 'longueur'>): Promise<CorpusFichier> {
    return this.avecMutation(() => this.trierEntretiensSousVerrou(mode))
  }

  private async trierEntretiensSousVerrou(mode: Extract<ModeTriEntretiens, 'modif' | 'longueur'>): Promise<CorpusFichier> {
    const provider = new ProviderPutConditionnel(this.client, this.identite)
    let verrouTenu = false
    try {
      const acquisition = await provider.acquerir(CHEMIN_VERROU_CORPUS)
      if (!acquisition.ok) throw new ErreurTransaction(messageRefusDefinitions(acquisition.tenuPar))
      verrouTenu = true

      const etagServeur = await this.rafraichirCorpusLocal(true)
      const fichierCorpus = join(this.miroir.dirLocal, CHEMIN_CORPUS)
      const contenuAvant = readFileSync(fichierCorpus, 'utf8')
      const store = this.getStore()
      const corpus = store.ouvrir()
      const entretiens = new Map<string, EntretienFichier>()
      for (const id of corpus.ordreEntretiens!) {
        const chemin = CHEMIN_ENTRETIEN(id)
        const contenu = await this.client.getTexte(chemin)
        let entretien: EntretienFichier
        try {
          entretien = JSON.parse(contenu) as EntretienFichier
        } catch {
          throw new Error(`L’entretien « ${corpus.membership[id].titre} » est illisible.`)
        }
        if (!versionSupportee(entretien.formatVersion)) {
          throw new Error(`L’entretien « ${corpus.membership[id].titre} » utilise une version non supportée.`)
        }
        entretiens.set(id, entretien)
      }

      const gardePrecedente = store.lectureSeule
      store.lectureSeule = false
      let resultat: CorpusFichier
      try {
        resultat = store.trierEntretiensAvecContenus(mode, entretiens)
      } catch (erreur) {
        this.ecrireCorpusLocal(contenuAvant)
        throw erreur
      } finally {
        store.lectureSeule = gardePrecedente
      }

      const contenuTente = readFileSync(fichierCorpus, 'utf8')
      try {
        await this.publierCorpus(etagServeur)
      } catch (erreur) {
        const reconciliation = await this.reconcilierCorpusApresEchec(contenuTente)
        if (reconciliation === 'publie') return resultat
        if (reconciliation === 'inconnue') this.ecrireCorpusLocal(contenuAvant)
        throw erreur
      }
      return resultat
    } catch (erreur) {
      throw classifier(erreur)
    } finally {
      if (verrouTenu) await provider.liberer(CHEMIN_VERROU_CORPUS).catch(() => {})
    }
  }

  /** Relit les sources serveur et actualise le miroir avant de publier leurs références. */
  async verifierReferencesPassagesPubliees(references: SourcePassageCas[]): Promise<void> {
    return this.avecMutation(() => this.rafraichirReferencesPassages(references))
  }

  private async rafraichirReferencesPassages(references: SourcePassageCas[]): Promise<void> {
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
  private async ajouterEntretien(preparer: (store: CorpusStore) => PlanAjoutEntretien) {
    return this.avecMutation(() => this.ajouterEntretienSousVerrou(preparer))
  }

  private async ajouterEntretienSousVerrou(
    preparer: (store: CorpusStore) => PlanAjoutEntretien,
  ): Promise<{ id: string; corpus: CorpusFichier }> {
    const provider = new ProviderPutConditionnel(this.client, this.identite)
    let verrouTenu = false
    try {
      const acquisition = await provider.acquerir(CHEMIN_VERROU_CORPUS)
      if (!acquisition.ok) throw new ErreurTransaction(messageRefusDefinitions(acquisition.tenuPar))
      verrouTenu = true

      const etagCorpus = await this.rafraichirCorpusLocal(true)
      const store = this.getStore()
      const plan = preparer(store)
      const cheminEntretien = CHEMIN_ENTRETIEN(plan.id)
      const contenuEntretien = JSON.stringify(plan.entretien, null, 2)
      const contenuCorpus = JSON.stringify(plan.corpusApres, null, 2)
      const nouvellesRegles = Object.fromEntries(Object.entries(plan.corpusApres.reglesAnon ?? {})
        .filter(([id]) => !Object.hasOwn(plan.corpusAvant.reglesAnon ?? {}, id)))
      const etagEntretien = await this.gardePseudos.publierSousVerrou(contenuEntretien, JSON.stringify({ annotations: [] }),
        () => this.publierNouvelEntretien(cheminEntretien, contenuEntretien), provider, cheminEntretien, nouvellesRegles)

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
      if (verrouTenu && !this.gardePseudos.verrouIncertain(provider)) await provider.liberer(CHEMIN_VERROU_CORPUS).catch(() => {})
    }
  }

  /* ── Suppression d'entretien — double verrou ──────────────────────────────*/

  /** Supprime un entretien sous double verrou, sans modifier le miroir avant le commit serveur. */
  async supprimerEntretien(
    id: string,
    impactAttendu?: ImpactSuppressionEntretien,
  ): Promise<CorpusFichier> {
    return this.avecMutation(() => this.supprimerEntretienSousVerrous(id, impactAttendu))
  }

  private async supprimerEntretienSousVerrous(id: string, impactAttendu?: ImpactSuppressionEntretien): Promise<CorpusFichier> {
    const providerCorpus = new ProviderPutConditionnel(this.client, this.identite)
    let verrouCorpusTenu = false
    try {
      const acqC = await providerCorpus.acquerir(CHEMIN_VERROU_CORPUS)
      if (!acqC.ok) throw new ErreurTransaction(messageRefusDefinitions(acqC.tenuPar))
      verrouCorpusTenu = true
      const etagServeur = await this.rafraichirCorpusLocal(true)

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
    return this.avecMutation(() => this.archiverFichiersOrphelinsSousVerrous())
  }

  private async archiverFichiersOrphelinsSousVerrous(): Promise<string[]> {
    const providerCorpus = new ProviderPutConditionnel(this.client, this.identite)
    const acquisition = await providerCorpus.acquerir(CHEMIN_VERROU_CORPUS)
    if (!acquisition.ok) return []
    const archives: string[] = []
    try {
      await this.rafraichirCorpusLocal(true)
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
    return this.avecMutation(() => this.corrigerEntretiensSousVerrous(cibles, idsDemandes, mutation))
  }

  private async corrigerEntretiensSousVerrous<T>(
    cibles: { corpus: boolean; entretiens: string[] | (() => string[]); ordreCorpus?: 'avant' | 'apres' },
    idsDemandes: string[] | (() => string[]), mutation: () => T,
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
      const etagCorpus = await this.rafraichirCorpusLocal(cibles.corpus)
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
                if (!sessions?.publierSousVerrouCorpus) {
                  throw new ErreurTransaction('La session ouverte ne permet pas de confirmer sa publication.')
                }
                const publication = await sessions.publierSousVerrouCorpus(id, providerCorpus)
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
                etags.get(id) ?? null, contenuAvant!, providerCorpus,
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
      if (verrouCorpusTenu && !this.gardePseudos.verrouIncertain(providerCorpus)) await providerCorpus.liberer(CHEMIN_VERROU_CORPUS).catch(() => {})
    }
  }

  /** Crée la définition avant le lien et conserve la fiche si le second commit échoue. */
  async creerPersonneDepuisLocuteur(
    entretienId: string,
    locuteurId: string,
    nom: string,
  ): Promise<string> {
    return this.avecMutation(() => this.creerEtLierPersonne(entretienId, locuteurId, nom))
  }

  private async creerEtLierPersonne(entretienId: string, locuteurId: string, nom: string): Promise<string> {
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
    return this.avecMutation(() => this.poserValeurLotSousVerrous(items))
  }

  private async poserValeurLotSousVerrous(items: ItemLotValeur[]): Promise<ResultatLotValeur> {
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
      const etagFinal = await this.publierEntretienCourt(cheminFichier, contenu, etagServeur, brut)
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
    return this.avecMutation(() => this.appliquerRegleLotSousVerrous(cibles))
  }

  private async appliquerRegleLotSousVerrous(cibles: CibleRegleAnon[]): Promise<ResultatLotAnon> {
    const succes: ResultatLotAnon['succes'] = []
    const { groupes, echecs } = regrouperCiblesAnon(cibles)
    const sessions = this.options.getSessions?.() ?? null
    for (const [id, cible] of groupes) {
      const providerCorpus = new ProviderPutConditionnel(this.client, this.identite)
      let corpusTenu = false
      try {
        const acquisition = await providerCorpus.acquerir(CHEMIN_VERROU_CORPUS)
        if (!acquisition.ok) throw new ErreurTransaction(messageRefusDefinitions(acquisition.tenuPar))
        corpusTenu = true
        const etagCorpus = await this.rafraichirCorpusLocal()
        if (!etagCorpus) throw new ErreurTransaction('Le corpus distant est introuvable. Aucun entretien n’a été modifié.')
        const { regle, titre } = this.regleEtTitre(cible.regleId, id)
        if (sessions?.idsTenus().includes(id)) {
          const store = this.getStore()
          const gardePrecedente = store.lectureSeule
          store.lectureSeule = false
          let resultat: ResultatMutationAnon
          try {
            resultat = store.appliquerRegleAnon(id, cible.regleId, cible)
          } finally {
            store.lectureSeule = gardePrecedente
          }
          if (resultat.nb) sessions.noterSale(id)
          succes.push({ id, ...resultat, titre })
        } else {
          const resultat = await this.appliquerRegleHorsSession(id, regle, cible, etagCorpus, providerCorpus)
          succes.push({ id, ...resultat, titre })
        }
      } catch (e) {
        echecs.push({ id, raison: classifier(e).message })
      } finally {
        if (corpusTenu && !this.gardePseudos.verrouIncertain(providerCorpus)) await providerCorpus.liberer(CHEMIN_VERROU_CORPUS).catch(() => {})
      }
    }
    return { succes, echecs }
  }

  /** Lit la règle dans le corpus rafraîchi sous verrou, avant le verrou d'entretien. */
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
    etagCorpus: string,
    providerCorpus: ProviderPutConditionnel,
  ): Promise<ResultatMutationAnon> {
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
      if (!etagServeur) throw new ErreurTransaction('L’entretien distant est introuvable. Le miroir n’est pas une source de publication.')
      const brut = await this.client.getTexte(cheminFichier)
      const data = JSON.parse(brut) as EntretienFichier
      const resultat = appliquerRegleAnonEntretienAvecBilan(data, regle, cible)
      if (resultat.nb === 0) return resultat
      if (await this.etagServeurDe(CHEMIN_CORPUS) !== etagCorpus) {
        throw new ErreurTransaction('La définition corpus a changé pendant la validation. Actualisez avant de recommencer.')
      }
      data.lastModified = new Date().toISOString()
      const contenu = JSON.stringify(data, null, 2)
      // PUT If-Match : divergence (412) → exception ci-dessus, rien n'est écrasé.
      const etagFinal = await this.publierEntretienCourt(cheminFichier, contenu, etagServeur, brut, providerCorpus)
      // Écriture THROUGH du MIROIR : le MÊME contenu que le serveur part en local ;
      // compteurs et prochains scans sont à jour sans pull complet.
      const abs = join(this.miroir.dirLocal, cheminFichier)
      mkdirSync(dirname(abs), { recursive: true })
      const tmp = `${abs}.tmp`
      writeFileSync(tmp, contenu, 'utf8')
      renameSync(tmp, abs)
      if (etagFinal) this.miroir.noterEtagPublie(cheminFichier, etagFinal)
      return resultat
    } finally {
      await provider.liberer(cheminVerrou).catch(() => {})
    }
  }

  /* ── Aides internes ──────────────────────────────────────────────────────── */

  /** Relit les octets et leur ETag, même si le manifeste annonce une version identique. */
  private async rafraichirCorpusLocal(interdireDissociation = false): Promise<string | null> {
    let source
    try { source = await this.client.getTexteAvecEtag(CHEMIN_CORPUS) }
    catch (e) { if (e instanceof ErreurHttp && e.statut === 404) return null; throw e }
    const contenu = source.contenu, etatServeur = source.etag
    if (interdireDissociation) exigerAbsenceDissociationWebDAV(JSON.parse(contenu))
    const abs = join(this.miroir.dirLocal, CHEMIN_CORPUS)
    mkdirSync(dirname(abs), { recursive: true })
    const tmp = `${abs}.tmp`
    writeFileSync(tmp, contenu, 'utf8')
    renameSync(tmp, abs)
    if (etatServeur) this.miroir.noterEtagPublie(CHEMIN_CORPUS, etatServeur)
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
    avant: string,
    providerCorpus?: ProviderPutConditionnel,
  ): Promise<string> {
    if (contenu !== avant && Buffer.byteLength(contenu) === Buffer.byteLength(avant)) contenu += '\n'
    const envoi = () => this.envoyerEntretienCourt(chemin, contenu, etagAttendu)
    return providerCorpus
      ? this.gardePseudos.publierSousVerrou(contenu, avant, envoi, providerCorpus, chemin)
      : this.gardePseudos.publier(contenu, avant, envoi, chemin)
  }

  private async envoyerEntretienCourt(chemin: string, contenu: string, etagAttendu: string | null): Promise<string> {
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
    exigerAbsenceDissociationWebDAV(JSON.parse(contenu))
    try { exigerAbsenceDissociationWebDAV(JSON.parse(await this.client.getTexte(CHEMIN_CORPUS))) }
    catch (e) { if (!(e instanceof ErreurHttp && e.statut === 404)) throw e }
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
  const { groupes, echecs } = regrouperCiblesAnon(cibles)
  for (const c of groupes.values()) {
    try {
      const r = store.appliquerRegleAnon(c.entretienId, c.regleId, c)
      succes.push({ id: c.entretienId, ...r })
    } catch (e) {
      echecs.push({ id: c.entretienId, raison: classifier(e).message })
    }
  }
  return { succes, echecs }
}

/* ── Classification des échecs en messages utilisateur ───────────────────────*/

function messageRefusDefinitions(tenuPar: ContenuVerrou | null): string {
  const qui = tenuPar?.userId ?? 'un autre utilisateur'
  return `Le corpus est en cours de modification par ${qui}, qui a peut-être déjà terminé. ` +
    'Actualisez le corpus, puis réessayez dans un instant.'
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
