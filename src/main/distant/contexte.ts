import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CorpusStore } from '../corpusStore'
import type {
  EntreeVerrouPublic,
  OrphelinDistant,
  ProgressionTransfert,
  ResultatFermetureSession,
  ResultatTiragePublic,
} from '../../shared/distant'
import type {
  CorpusFichier,
  OuvertureEntretienEdition,
} from '../../shared/format'
import type { ClientWebDAV } from '../webdav/client'
import { MiroirWebDAV } from './miroirWebDAV'
import {
  SessionsDEntretien,
  type IdentiteSession,
} from './sessions'
import { TransactionsCorpus } from './transactions'
import { PresenceDistante } from './presence'
import { LecteurWebDAV } from './lecteurWebDAV'
import { TransfertWebDAV } from './transfertWebDAV'
import type {
  ResultatTeleversement,
  SurProgressionFichier,
} from './transfert'
import type { ObservationCoordinationDistante } from './coordination'
import { ObservationVerrousWebDAV } from './observationVerrousWebDAV'
import type { DemandeOperationTheme, OptionsExecutionOperationTheme, ProgressionOperationTheme } from '../../shared/corpus/themes'
import { empreinteCorrespondance, type TablesCorrespondance } from '../tablesCorrespondance'
import type { PreparationRenommageDistant } from '../renommagesAnon'
import { GardePseudosWebDAV } from './gardePseudosWebDAV'
import { JournalRenommageAnonWebDAV } from './journalRenommageAnonWebDAV'
import { exigerGeste, gesteAutorise } from '../gitlab/politiqueGestes'
import type { DemandeSuppressionAnon } from '../../shared/corpus/suppressionAnon'
import type { DemandeDissociationAnon } from '../../shared/corpus/dissociationAnon'
import { JournalDissociationAnonWebDAV } from './journalDissociationAnonWebDAV'
import { JournalSuppressionAnonWebDAV } from './journalSuppressionAnonWebDAV'
import { JournalGardePseudosWebDAV } from './journalGardePseudosWebDAV'
import { JournalAjoutVarianteAnonWebDAV } from './journalAjoutVarianteAnonWebDAV'
import type { DemandeAjoutVarianteAnon } from '../../shared/corpus/variantesAnon'
import type { DemandeRetraitVarianteAnon } from '../../shared/corpus/retraitVarianteAnon'
import { JournalRetraitVarianteAnonWebDAV } from './journalRetraitVarianteAnonWebDAV'

/** Services d'un corpus distant assemblés pour une même destination. */
export class ContexteCorpusDistant {
  private demarre = false
  private termine = false
  private operationsSessions = 0
  private readonly operationsParEntretien = new Map<string, number>()
  private readonly renommageCibles = new Set<string>()
  private lecturesRenommage = 0
  private readonly dissociationCibles = new Set<string>()
  private lecturesDissociation = 0
  private readonly suppressionCibles = new Set<string>()
  private lecturesSuppression = 0
  private readonly retraitVarianteCibles = new Set<string>()
  private lecturesRetraitVariante = 0

  constructor(
    public readonly id: string,
    public readonly store: CorpusStore,
    public readonly miroir: MiroirWebDAV,
    public readonly sessions: SessionsDEntretien,
    public readonly transactions: TransactionsCorpus,
    public readonly presence: PresenceDistante,
    private readonly coordination: ObservationCoordinationDistante,
  ) {}

  get dirLocal(): string {
    return this.miroir.dirLocal
  }

  private exigerOuvert(): void {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
  }

  private async avecSession<T>(action: () => Promise<T>, id?: string): Promise<T> {
    this.exigerOuvert()
    this.transactions.exigerSansImportCorrespondances()
    if (id && this.retraitVarianteCibles.has(id)) throw new Error('Cette cible participe au retrait de variante. Attendez son bilan avant de modifier ou fermer la session.')
    if (id && this.suppressionCibles.has(id)) throw new Error('Cette cible participe à la suppression en cours. Attendez son bilan avant de modifier ou fermer la session.')
    if (id && this.dissociationCibles.has(id)) throw new Error('Cette cible participe à la dissociation en cours. Attendez son bilan avant de modifier ou fermer la session.')
    if (id && this.renommageCibles.has(id)) throw new Error('Cette cible participe au renommage en cours. Attendez son bilan avant de modifier ou fermer la session.')
    this.operationsSessions++
    if (id) this.operationsParEntretien.set(id, (this.operationsParEntretien.get(id) ?? 0) + 1)
    try { return await action() } finally {
      this.operationsSessions--
      if (id) {
        const n = this.operationsParEntretien.get(id)! - 1
        if (n) this.operationsParEntretien.set(id, n)
        else this.operationsParEntretien.delete(id)
      }
    }
  }

  private async avecLectureRenommage<T>(action: () => Promise<T>): Promise<T> {
    this.exigerOuvert()
    this.lecturesRenommage++
    try { return await action() } finally { this.lecturesRenommage-- }
  }
  instantaneRenommageAnon() { return this.avecLectureRenommage(() => this.transactions.instantaneRenommageAnon()) }
  preparerRepriseRenommageAnon(id: string) { return this.avecLectureRenommage(() => this.transactions.preparerRepriseRenommageAnon(id)) }
  lireSuiviRenommageAnon() { this.exigerOuvert(); return this.transactions.lireSuiviRenommageAnon() }
  renommageAnonDisponible() {
    this.exigerOuvert()
    return !this.lecturesRetraitVariante && !this.transactions.retraitVarianteEnCours && !this.transactions.lireSuiviRetraitVarianteAnon() && !this.lecturesSuppression && !this.transactions.suppressionEnCours && !this.transactions.lireSuiviSuppressionAnon()
      && !this.lecturesDissociation && !this.transactions.dissociationEnCours && !this.transactions.lireSuiviDissociationAnon()
      && !this.renommageCibles.size && !this.transactions.mutationEnCours && !this.transactions.lirePublicationEntretien() && !this.transactions.importCorrespondancesEnCours
      && !this.transactions.lireSuiviImportCorrespondances() && !this.transactions.operationThemeEnCours && !this.transactions.lireSuiviOperationTheme()
  }
  async renommerVarianteAnon(p: PreparationRenommageDistant) {
    this.exigerOuvert()
    const operationsSansCible = this.operationsSessions - [...this.operationsParEntretien.values()].reduce((n, v) => n + v, 0)
    if (operationsSansCible || this.lecturesSuppression || this.renommageCibles.size || this.lecturesRenommage || p.cibles.some((c) => this.operationsParEntretien.has(c.id))) throw new Error('Terminez les opérations des cibles avant le renommage WebDAV.')
    p.cibles.forEach((c) => this.renommageCibles.add(c.id))
    // Même un lot sans fichier cible protège sa publication de définition et la fermeture du contexte.
    this.lecturesRenommage++
    try { return await this.transactions.renommerVarianteAnon(p) }
    finally { this.renommageCibles.clear(); this.lecturesRenommage-- }
  }
  async observerCiblesRenommageAnon(ids: string[]) {
    this.exigerOuvert()
    const observation = await this.coordination.observerVerrous()
    return ids.map((id) => ({ id, etat: this.operationsParEntretien.has(id) || this.sessions.idsTenus().includes(id) || this.sessions.idsRecuperablesLocalement().includes(id)
      ? 'session-locale' as const : observation.indisponible ? 'inconnu' as const
        : observation.entrees.some((e) => e.chemin === `verrous/${id}.lock.json` || e.chemin === `entretiens/${id}.json`) ? 'tenu-autrui' as const : 'libre-observe' as const }))
  }

  private async avecLectureDissociation<T>(action: () => Promise<T>): Promise<T> {
    this.exigerOuvert()
    this.lecturesDissociation++
    try { return await action() } finally { this.lecturesDissociation-- }
  }
  preparerDissociationAnon(demande: DemandeDissociationAnon) {
    exigerGeste('webdav', 'anon.dissocier-globalement')
    return this.avecLectureDissociation(() => this.transactions.preparerDissociationAnon(demande))
  }
  preparerRepriseDissociationAnon(id: string) {
    exigerGeste('webdav', 'anon.dissocier-globalement')
    return this.avecLectureDissociation(() => this.transactions.preparerRepriseDissociationAnon(id))
  }
  lireSuiviDissociationAnon() { this.exigerOuvert(); return this.transactions.lireSuiviDissociationAnon() }
  relireSuiviDissociationAnon(id: string) { return this.avecLectureDissociation(() => this.transactions.relireSuiviDissociationAnon(id)) }
  oublierApercuDissociationAnon(token: string) { this.transactions.oublierApercuDissociationAnon(token) }
  dissociationAnonDisponible() {
    this.exigerOuvert()
    return gesteAutorise('webdav', 'anon.dissocier-globalement') && !this.lecturesRetraitVariante && !this.transactions.retraitVarianteEnCours && !this.transactions.lireSuiviRetraitVarianteAnon() && !this.lecturesSuppression && !this.transactions.suppressionEnCours && !this.transactions.lireSuiviSuppressionAnon() && !this.lecturesDissociation && !this.lecturesRenommage && !this.transactions.renommageEnCours
      && !this.transactions.lireSuiviRenommageAnon() && !this.transactions.mutationEnCours && !this.transactions.lirePublicationEntretien()
      && !this.transactions.importCorrespondancesEnCours && !this.transactions.lireSuiviImportCorrespondances()
      && !this.transactions.operationThemeEnCours && !this.transactions.lireSuiviOperationTheme()
  }
  async dissocierRegleAnon(token: string, confirmee: boolean) {
    let reservees = false
    try {
      this.exigerOuvert()
      exigerGeste('webdav', 'anon.dissocier-globalement')
      const ids = this.transactions.ciblesApercuDissociationAnon(token)
      const sansCible = this.operationsSessions - [...this.operationsParEntretien.values()].reduce((n, v) => n + v, 0)
      if (sansCible || this.lecturesSuppression || this.lecturesDissociation || this.lecturesRenommage || this.renommageCibles.size
        || ids.some((id) => this.operationsParEntretien.has(id))) throw new Error('Terminez les opérations des cibles avant la dissociation WebDAV.')
      ids.forEach((id) => this.dissociationCibles.add(id))
      this.lecturesDissociation++; reservees = true
      return await this.transactions.dissocierRegleAnon(token, confirmee)
    } finally {
      this.transactions.oublierApercuDissociationAnon(token)
      if (reservees) { this.dissociationCibles.clear(); this.lecturesDissociation-- }
    }
  }

  private async avecLectureSuppression<T>(action: () => Promise<T>): Promise<T> {
    this.exigerOuvert()
    this.lecturesSuppression++
    try { return await action() } finally { this.lecturesSuppression-- }
  }
  preparerSuppressionAnon(demande: DemandeSuppressionAnon) {
    exigerGeste('webdav', 'anon.supprimer-partout')
    return this.avecLectureSuppression(() => this.transactions.preparerSuppressionAnon(demande))
  }
  preparerRepriseSuppressionAnon(id: string) {
    exigerGeste('webdav', 'anon.supprimer-partout')
    return this.avecLectureSuppression(() => this.transactions.preparerRepriseSuppressionAnon(id))
  }
  lireSuiviSuppressionAnon() { this.exigerOuvert(); return this.transactions.lireSuiviSuppressionAnon() }
  relireSuiviSuppressionAnon(id: string) { return this.avecLectureSuppression(() => this.transactions.relireSuiviSuppressionAnon(id)) }
  oublierApercuSuppressionAnon(token: string) { this.transactions.oublierApercuSuppressionAnon(token) }
  suppressionAnonDisponible() {
    this.exigerOuvert()
    return gesteAutorise('webdav', 'anon.supprimer-partout') && !this.lecturesRetraitVariante && !this.transactions.retraitVarianteEnCours && !this.transactions.lireSuiviRetraitVarianteAnon() && !this.lecturesSuppression && !this.transactions.suppressionEnCours
      && !this.lecturesDissociation && !this.transactions.dissociationEnCours && !this.transactions.lireSuiviDissociationAnon()
      && !this.lecturesRenommage && !this.transactions.renommageEnCours && !this.transactions.lireSuiviRenommageAnon()
      && !this.transactions.mutationEnCours && !this.transactions.lirePublicationEntretien()
      && !this.transactions.importCorrespondancesEnCours && !this.transactions.lireSuiviImportCorrespondances()
      && !this.transactions.operationThemeEnCours && !this.transactions.lireSuiviOperationTheme()
  }
  async supprimerRegleAnonPartout(token: string, confirmee: boolean) {
    let reservees = false
    try {
      this.exigerOuvert()
      exigerGeste('webdav', 'anon.supprimer-partout')
      const ids = this.transactions.ciblesApercuSuppressionAnon(token)
      const sansCible = this.operationsSessions - [...this.operationsParEntretien.values()].reduce((n, v) => n + v, 0)
      if (sansCible || this.lecturesSuppression || this.lecturesDissociation || this.lecturesRenommage || this.renommageCibles.size
        || ids.some((id) => this.operationsParEntretien.has(id))) throw new Error('Terminez les opérations des cibles avant la suppression WebDAV.')
      ids.forEach((id) => this.suppressionCibles.add(id))
      this.lecturesSuppression++; reservees = true
      return await this.transactions.supprimerRegleAnonPartout(token, confirmee)
    } finally {
      this.transactions.oublierApercuSuppressionAnon(token)
      if (reservees) { this.suppressionCibles.clear(); this.lecturesSuppression-- }
    }
  }

  idsOperationsSessions(): string[] { return [...this.operationsParEntretien.keys()] }
  verifierContexteRetraitVariante(): void { this.exigerOuvert() }
  private async avecLectureRetraitVariante<T>(action: () => Promise<T>): Promise<T> {
    this.exigerOuvert(); this.lecturesRetraitVariante++
    try { return await action() } finally { this.lecturesRetraitVariante-- }
  }
  preparerRetraitVarianteAnon(demande: DemandeRetraitVarianteAnon) {
    exigerGeste('webdav', 'anon.retirer-variante')
    return this.avecLectureRetraitVariante(() => this.transactions.preparerRetraitVarianteAnon(demande))
  }
  preparerRepriseRetraitVarianteAnon(id: string) {
    exigerGeste('webdav', 'anon.retirer-variante')
    return this.avecLectureRetraitVariante(() => this.transactions.preparerRepriseRetraitVarianteAnon(id))
  }
  lireSuiviRetraitVarianteAnon() { this.exigerOuvert(); return this.transactions.lireSuiviRetraitVarianteAnon() }
  relireSuiviRetraitVarianteAnon(id: string) { return this.avecLectureRetraitVariante(() => this.transactions.relireSuiviRetraitVarianteAnon(id)) }
  oublierApercuRetraitVarianteAnon(token: string) { this.transactions.oublierApercuRetraitVarianteAnon(token) }
  async retirerVarianteAnon(token: string, confirmee: boolean) {
    let reservees = false
    try {
      this.exigerOuvert(); exigerGeste('webdav', 'anon.retirer-variante')
      const ids = this.transactions.ciblesApercuRetraitVarianteAnon(token)
      const sansCible = this.operationsSessions - [...this.operationsParEntretien.values()].reduce((n, v) => n + v, 0)
      if (sansCible || this.lecturesRetraitVariante || this.lecturesSuppression || this.lecturesDissociation || this.lecturesRenommage
        || ids.some((id) => this.operationsParEntretien.has(id))) throw new Error('Terminez les opérations des cibles avant le retrait de variante WebDAV.')
      ids.forEach((id) => this.retraitVarianteCibles.add(id)); this.lecturesRetraitVariante++; reservees = true
      return await this.transactions.retirerVarianteAnon(token, confirmee)
    } finally {
      this.transactions.oublierApercuRetraitVarianteAnon(token)
      if (reservees) { this.retraitVarianteCibles.clear(); this.lecturesRetraitVariante-- }
    }
  }

  private exigerImportSansSessions(): void {
    this.exigerOuvert()
    if (this.operationsSessions || this.sessions.idsTenus().length || this.sessions.idsRecuperablesLocalement().length) {
      throw new Error('Fermez les sessions locales ou récupérables avant l’import WebDAV.')
    }
  }

  async instantaneCorrespondances() {
    this.exigerOuvert()
    return this.transactions.instantaneCorrespondances()
  }

  async importerCorrespondances(preparation: ReturnType<TablesCorrespondance['consommerImport']>) {
    this.exigerImportSansSessions()
    return this.transactions.importerCorrespondances(preparation)
  }

  lireSuiviImportCorrespondances() {
    this.exigerOuvert()
    return this.transactions.lireSuiviImportCorrespondances()
  }

  async reprendreImportCorrespondances(operationId: string, confirmee: boolean) {
    this.exigerImportSansSessions()
    return this.transactions.reprendreImportCorrespondances(operationId, confirmee)
  }

  exigerEcritureEntretien(id: string): void {
    this.exigerOuvert()
    this.transactions.exigerSansImportCorrespondances()
    if (this.retraitVarianteCibles.has(id)) throw new Error('La cible participe au retrait de variante. Attendez avant d’enregistrer.')
    if (this.suppressionCibles.has(id)) throw new Error('La cible participe à la suppression en cours. Attendez avant d’enregistrer.')
    if (this.dissociationCibles.has(id)) throw new Error('La cible participe à la dissociation en cours. Attendez avant d’enregistrer.')
    if (this.renommageCibles.has(id)) throw new Error('La cible participe au renommage en cours. Attendez avant d’enregistrer.')
    if (this.sessions.etat(id).etat !== 'a-nous') throw new Error('La session WebDAV ne permet pas cette écriture.')
  }

  /** Active les tâches de fond seulement après la bascule vers ce contexte. */
  demarrer(): void {
    if (this.demarre || this.termine) return
    this.demarre = true
    this.presence.demarrer()
  }

  /** Actualise le miroir sans toucher aux copies détenues par une session. */
  async actualiser(): Promise<ResultatTiragePublic> {
    return this.avecSession(() => this.tirerMiroir())
  }

  private async tirerMiroir(): Promise<ResultatTiragePublic> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    if (this.lecturesRetraitVariante || this.transactions.retraitVarianteEnCours) throw new Error('Attendez la fin du retrait de variante avant le tirage du miroir.')
    if (this.lecturesSuppression || this.transactions.suppressionEnCours) throw new Error('Attendez la fin de la suppression avant le tirage du miroir.')
    if (this.lecturesDissociation || this.transactions.dissociationEnCours) throw new Error('Attendez la fin de la dissociation avant le tirage du miroir.')
    if (this.lecturesRenommage || this.transactions.renommageEnCours) throw new Error('Attendez la fin du renommage avant le tirage du miroir.')
    await this.transactions.reconcilierAjoutVariante()
    await this.transactions.reconcilierPublicationEntretien()
    const retrait = this.transactions.lireSuiviRetraitVarianteAnon()
    if (retrait) await this.transactions.relireSuiviRetraitVarianteAnon(retrait.operationId)
    const dissociation = this.transactions.lireSuiviDissociationAnon()
    if (dissociation) await this.transactions.relireSuiviDissociationAnon(dissociation.operationId)
    const suppression = this.transactions.lireSuiviSuppressionAnon()
    if (suppression) await this.transactions.relireSuiviSuppressionAnon(suppression.operationId)
    const exclus = [...new Set([...this.sessions.idsTenus(), ...this.sessions.idsRecuperablesLocalement(),
      ...(this.transactions.lireSuiviRenommageAnon()?.cibles.filter((c) => c.etat === 'a-faire').map((c) => c.id) ?? []),
      ...(this.transactions.lireSuiviDissociationAnon()?.differes.map((c) => c.id) ?? []),
      ...(this.transactions.lireSuiviDissociationAnon()?.nouvellesCibles ?? []),
      ...(this.transactions.lireSuiviSuppressionAnon()?.differes.map((c) => c.id) ?? []),
      ...(this.transactions.lireSuiviSuppressionAnon()?.nouvellesCibles ?? []),
      ...(this.transactions.lireSuiviRetraitVarianteAnon()?.differes.map((c) => c.id) ?? []),
      ...(this.transactions.lireSuiviRetraitVarianteAnon()?.nouvellesCibles ?? [])])].map((id) => `entretiens/${id}.json`)
    const tirage = await this.miroir.tirer(exclus)
    const observation = await this.coordination.observerVerrous()
    return {
      telecharges: tirage.telecharges,
      corbeille: tirage.corbeille,
      verrous: observation.entrees,
      verrousIndisponibles: observation.indisponible || undefined,
      presences: await this.presence.lister(),
      inaccessibles: tirage.inaccessibles.length > 0 ? tirage.inaccessibles : undefined,
      date: tirage.date,
    }
  }

  /** Ouvre un entretien après acquisition de son droit d'édition. */
  async ouvrirEntretienPourEdition(id: string): Promise<OuvertureEntretienEdition> {
    this.transactions.exigerOuvertureRenommage(id)
    return this.avecSession(() => this.acquerirEtOuvrirEntretien(id), id)
  }

  private async acquerirEtOuvrirEntretien(id: string): Promise<OuvertureEntretienEdition> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    const etat = await this.sessions.ouvrir(id)
    if (etat.etat !== 'a-nous') {
      const lecture = this.store.lireEntretien(id)
      if (!lecture.ok) return lecture
      return {
        ...lecture,
        acces: 'lecture-seule',
        verrouTenuParAutrui:
          etat.etat === 'tenu-par-autrui' && etat.tenuPar
            ? {
                userId: etat.tenuPar.userId,
                machineId: etat.tenuPar.machineId,
                acquiredAt: etat.tenuPar.acquiredAt,
              }
            : null,
      }
    }
    try {
      this.store.autoriserEcritureEntretien(id)
      const lecture = this.store.ouvrirEntretienPourEdition(id)
      if (!lecture.ok) {
        this.store.revoquerEcritureEntretien(id)
        await this.sessions.fermer(id)
        return lecture
      }
      return { ...lecture, acces: 'edition' }
    } catch (erreur) {
      this.store.revoquerEcritureEntretien(id)
      await this.sessions.fermer(id)
      throw erreur
    }
  }

  /** Publie puis ferme la session d'un entretien. */
  async fermerEntretien(id: string): Promise<ResultatFermetureSession> {
    return this.avecSession(() => this.publierEtFermerEntretien(id), id)
  }

  private async publierEtFermerEntretien(id: string): Promise<ResultatFermetureSession> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    this.store.revoquerEcritureEntretien(id)
    const resultat = await this.sessions.fermer(id)
    if (!resultat.fermee && this.sessions.etat(id).etat === 'a-nous') {
      this.store.autoriserEcritureEntretien(id)
    }
    return resultat
  }

  /** Exécute une mutation des définitions avec les gardes distantes. */
  async executerDefinitions<T>(mutation: () => T): Promise<T> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.transactions.executer(mutation)
  }

  async ajouterVarianteAnon(demande: DemandeAjoutVarianteAnon) {
    this.exigerOuvert()
    exigerGeste('webdav', 'anon.ajouter-variante')
    const sansEntretien = this.operationsSessions - [...this.operationsParEntretien.values()].reduce((n, v) => n + v, 0)
    if (sansEntretien || this.lecturesSuppression || this.lecturesDissociation || this.lecturesRenommage) throw new Error('Terminez les autres opérations avant l’ajout de variante.')
    return this.transactions.ajouterVarianteAnon(demande)
  }

  /** Prépare l’aperçu depuis les fichiers publiés, sans modifier le miroir ni les sessions. */
  async analyserOperationTheme(demande: DemandeOperationTheme, operationPrecedente?: string) {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.transactions.analyserOperationTheme(demande, operationPrecedente)
  }

  async executerOperationTheme(id: string, demande: DemandeOperationTheme, options: OptionsExecutionOperationTheme,
    progression?: (etat: ProgressionOperationTheme) => void) {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.transactions.executerOperationTheme(id, demande, options, progression)
  }

  lireSuiviOperationTheme() {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.transactions.lireSuiviOperationTheme()
  }

  async preparerRepriseOperationTheme(id: string) {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.transactions.preparerRepriseOperationTheme(id)
  }

  async reconcilierOperationTheme(id: string) {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.transactions.reconcilierOperationTheme(id)
  }

  abandonnerOperationTheme(id: string): void {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    this.transactions.abandonnerOperationTheme(id)
  }

  detailsOperationTheme(operationId: string, entretienId: string) {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.transactions.detailsOperationTheme(operationId, entretienId)
  }

  /** Liste un dossier de la destination courante pour les sélecteurs. */
  async listerDossier(dossier: string): Promise<{ nom: string; dossier: boolean }[]> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.miroir.listerDossier(dossier)
  }

  /** Désigne un média partagé par une session courte. */
  async designerAudio(
    id: string,
    cheminAudio: string,
  ): Promise<{ ok: boolean; raison?: string }> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    this.transactions.exigerOuvertureRenommage(id)
    return this.avecSession(() => this.sessions.designerAudio(id, cheminAudio), id)
  }

  /** Téléverse un fichier vers la destination du contexte. */
  async televerserFichier(
    cheminCible: string,
    sourceLocale: string,
    contentType: string,
    surProgression?: SurProgressionFichier,
  ): Promise<ResultatTeleversement> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    this.transactions.exigerSansRenommage()
    return this.avecSession(() => this.miroir.televerserFichier(
      cheminCible,
      sourceLocale,
      contentType,
      surProgression,
    ))
  }

  /** Publie l'état local d'un entretien sous son droit d'édition. */
  async publierEntretien(id: string): Promise<{ ok: boolean; raison?: string }> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.avecSession(() => this.sessions.publier(id), id)
  }

  /** Retourne les sessions d'un lancement précédent récupérables. */
  async listerOrphelins(): Promise<OrphelinDistant[]> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    // Un import incomplet se reprend depuis son propre journal, jamais comme une session.
    if (this.transactions.lireSuiviImportCorrespondances() || this.transactions.lirePublicationEntretien()) return []
    const suivi = this.transactions.lireSuiviRenommageAnon()
    const dissociation = this.transactions.lireSuiviDissociationAnon()
    const liste = await this.sessions.orphelins()
    return liste.filter(({ id, verrou }) => !verrou.sessionId.startsWith('retrait-variante-') && !this.transactions.cibleRetraitVarianteProtegee(id) && !verrou.sessionId.startsWith('import-') && !verrou.sessionId.startsWith('rename-') && !verrou.sessionId.startsWith('garde-') && !verrou.sessionId.startsWith('dissociation-') && !verrou.sessionId.startsWith('suppression-anon-') && id !== 'corpus'
      && !this.transactions.cibleSuppressionProtegee(id) && !suivi?.cibles.some((c) => c.id === id) && !dissociation?.differes.some((c) => c.id === id) && !dissociation?.nouvellesCibles.includes(id))
      .map(({ cheminVerrou, id, verrou }) => ({
      cheminVerrou,
      id,
      userId: verrou.userId,
      machineId: verrou.machineId,
      acquiredAt: verrou.acquiredAt,
    }))
  }

  /** Reprend et publie une session récupérable. */
  async reprendreOrphelin(
    cheminVerrou: string,
  ): Promise<{ ok: boolean; raison?: string }> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.avecSession(async () => {
      await this.exigerOrphelinDeSession(cheminVerrou)
      return this.sessions.reprendreOrphelin(cheminVerrou)
    })
  }

  /** Libère une session récupérable sans publier sa copie locale. */
  async abandonnerOrphelin(cheminVerrou: string): Promise<void> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    await this.avecSession(async () => {
      await this.exigerOrphelinDeSession(cheminVerrou)
      await this.sessions.abandonnerOrphelin(cheminVerrou)
    })
  }

  private async exigerOrphelinDeSession(cheminVerrou: string): Promise<void> {
    this.transactions.exigerPublicationDisponible()
    const orphelin = (await this.sessions.orphelins()).find((v) => v.cheminVerrou === cheminVerrou)
    if (!orphelin || this.transactions.cibleRetraitVarianteProtegee(orphelin.id) || orphelin.verrou.sessionId.startsWith('retrait-variante-') || orphelin.verrou.sessionId.startsWith('ajout-variante-') || orphelin.verrou.sessionId.startsWith('import-') || orphelin.verrou.sessionId.startsWith('rename-') || orphelin.verrou.sessionId.startsWith('garde-') || orphelin.verrou.sessionId.startsWith('dissociation-') || orphelin.verrou.sessionId.startsWith('suppression-anon-') || orphelin.id === 'corpus'
      || this.transactions.lireSuiviRenommageAnon()?.cibles.some((c) => c.id === orphelin.id)
      || this.transactions.cibleDissociationProtegee(orphelin.id) || this.transactions.cibleSuppressionProtegee(orphelin.id)) {
      throw new Error('Ce verrou ne correspond pas à une session locale récupérable. Aucune publication ni libération autorisée.')
    }
  }

  /** Met à jour la présence informative du poste. */
  async noterEntretienOuvert(id: string | null): Promise<void> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    await this.presence.noterEntretienOuvert(id)
  }

  /** Publie et libère toutes les sessions avant de terminer le contexte. */
  async fermer(): Promise<void> {
    if (this.termine) return
    if (this.lecturesRetraitVariante || this.transactions.retraitVarianteEnCours) throw new Error('Attendez la fin du retrait de variante avant le changement de corpus.')
    if (this.lecturesSuppression || this.transactions.suppressionEnCours) throw new Error('Attendez la fin de la suppression globale avant le changement de corpus.')
    if (this.lecturesDissociation || this.transactions.dissociationEnCours) throw new Error('Attendez la fin de la dissociation globale avant le changement de corpus.')
    if (this.lecturesRenommage || this.transactions.renommageEnCours || this.transactions.mutationEnCours) throw new Error('Attendez la fin du renommage ou de la mutation avant le changement de corpus.')
    if (this.transactions.importCorrespondancesEnCours || this.operationsSessions) throw new Error('Attendez la fin de l’import ou de l’opération distante avant le changement de corpus.')
    if (this.transactions.operationThemeEnCours) throw new Error('Une opération sur les thématiques doit se terminer avant le changement de corpus.')
    const ids = this.sessions.idsTenus()
    for (const id of ids) this.store.revoquerEcritureEntretien(id)
    const bilan = await this.sessions.fermerToutes()
    if (bilan.bloquees.length > 0) {
      for (const blocage of bilan.bloquees) {
        if (this.sessions.etat(blocage.id).etat === 'a-nous') {
          this.store.autoriserEcritureEntretien(blocage.id)
        }
      }
      const detail = bilan.bloquees
        .map((blocage) => `${blocage.id} (${blocage.raison})`)
        .join(', ')
      throw new Error(`Changement de corpus refusé : sessions non fermées : ${detail}.`)
    }
    this.presence.arreter()
    this.sessions.dispose()
    this.transactions.viderApercusOperationTheme()
    this.transactions.viderApercusDissociationAnon()
    this.transactions.viderApercusSuppressionAnon()
    this.transactions.viderApercusRetraitVarianteAnon()
    this.termine = true
  }

  /** Arrête la présence lors d'une fermeture forcée, sans masquer les sessions. */
  arreterPresence(): void {
    this.presence.arreter()
  }
}

export interface OptionsPreparationContexteNextcloud {
  id: string
  dirLocal: string
  client: ClientWebDAV
  identite: () => IdentiteSession
  verrouNatif: boolean
  exclusionsSupplementaires?: string[]
  surProgression?: (progression: ProgressionTransfert) => void
  surRetrogradation?: (id: string) => void
  surPublication?: (id: string, date: string) => void
}

export interface PreparationContexteDistant {
  contexte: ContexteCorpusDistant
  corpus: CorpusFichier
  verrous: EntreeVerrouPublic[]
  verrousIndisponibles?: boolean
  inaccessibles?: { chemin: string; raison: string }[]
}

/** Prépare entièrement un contexte Nextcloud sans activer ses tâches de fond. */
export async function preparerContexteNextcloud(
  options: OptionsPreparationContexteNextcloud,
): Promise<PreparationContexteDistant> {
  const lecture = new LecteurWebDAV(options.client)
  const transfert = new TransfertWebDAV(options.client)
  const miroir = new MiroirWebDAV(
    options.client,
    options.dirLocal,
    options.surProgression,
    lecture,
    { fournisseur: 'webdav', destinationId: options.id },
    transfert,
  )
  let store: CorpusStore | null = null
  let sessions!: SessionsDEntretien
  let contexte: ContexteCorpusDistant | undefined
  const gardePseudos = new GardePseudosWebDAV(options.client, options.identite, options.dirLocal,
    (chemin, contenu, etag) => sessions.confirmerSource(chemin, contenu, etag))
  sessions = new SessionsDEntretien(
    options.client,
    miroir,
    options.identite,
    (id) => {
      store?.revoquerEcritureEntretien(id)
      options.surRetrogradation?.(id)
    },
    options.surPublication,
    { verrouNatif: options.verrouNatif, gardePseudos },
  )

  const ajoutVariante = new JournalAjoutVarianteAnonWebDAV(options.dirLocal,
    empreinteCorrespondance(options.client.config.baseUrl.replace(/\/+$/, ''))).lire()
  const suppression = new JournalSuppressionAnonWebDAV(options.dirLocal,
    empreinteCorrespondance(options.client.config.baseUrl.replace(/\/+$/, ''))).lire()
  const retrait = new JournalRetraitVarianteAnonWebDAV(options.dirLocal,
    empreinteCorrespondance(options.client.config.baseUrl.replace(/\/+$/, ''))).lire()
  const retraitEnAttente = !!retrait && (!retrait.varianteRetiree || !retrait.miroirComplet)
  const garderMiroirSuppression = !!suppression && (!!suppression.envoi || !suppression.miroirComplet)
  const lotRenommage = new JournalRenommageAnonWebDAV(options.dirLocal,
    empreinteCorrespondance(options.client.config.baseUrl.replace(/\/+$/, ''))).lire()
  const lotDissociation = new JournalDissociationAnonWebDAV(options.dirLocal,
    empreinteCorrespondance(options.client.config.baseUrl.replace(/\/+$/, ''))).lire()
  const envoiEntretien = new JournalGardePseudosWebDAV(options.dirLocal,
    empreinteCorrespondance(options.client.config.baseUrl.replace(/\/+$/, ''))).lire()
  const idsExclus = new Set([
    ...(retraitEnAttente ? [...retrait!.cibles.map((c) => c.id), ...retrait!.nouvellesCibles] : []),
    ...(suppression && (!suppression.regleRetiree || !suppression.miroirComplet) ? [...suppression.cibles.map((c) => c.id), ...suppression.nouvellesCibles] : []),
    ...(envoiEntretien ? [envoiEntretien.chemin.slice('entretiens/'.length, -'.json'.length)] : []),
    ...(lotRenommage && !lotRenommage.termine ? lotRenommage.cibles.map((c) => c.id) : []),
    ...(lotDissociation && !lotDissociation.regleRetiree ? [...lotDissociation.cibles.map((c) => c.id), ...lotDissociation.nouvellesCibles] : []),
    ...sessions.idsRecuperablesLocalement(),
    ...(options.exclusionsSupplementaires ?? []),
  ])
  if (!retraitEnAttente && !ajoutVariante && (!suppression || suppression.regleRetiree && suppression.miroirComplet)) {
    for (const orphelin of await sessions.orphelins()) idsExclus.add(orphelin.id)
  }
  const tirage = retraitEnAttente || garderMiroirSuppression || !!ajoutVariante
    ? { telecharges: [], corbeille: [], inaccessibles: [], date: new Date().toISOString() }
    : await miroir.tirer([...idsExclus].map((id) => `entretiens/${id}.json`))
  if (!existsSync(join(options.dirLocal, 'corpus.json'))) {
    throw new Error(
      "Le dossier distant ne contient pas de corpus.json — ce n'est pas (encore) un corpus Sonal.",
    )
  }

  const magasin = new CorpusStore(options.dirLocal)
  magasin.lectureSeule = true
  store = magasin
  const transactions = new TransactionsCorpus(
    options.client,
    miroir,
    () => magasin,
    options.identite,
    {
      verrouNatif: options.verrouNatif,
      gardePseudos,
      getSessions: () => sessions,
      sessionsEnCours: () => contexte?.idsOperationsSessions() ?? [],
      verifierContexteRetrait: () => contexte?.verifierContexteRetraitVariante(),
    },
  )
  await transactions.reconcilierAjoutVariante()
  const presence = new PresenceDistante(options.client, options.identite)
  const coordination = new ObservationVerrousWebDAV(
    options.client,
    sessions,
    options.verrouNatif,
  )
  // Une reprise n’autorise ni migration ni archivage automatique des sources.
  if (!retraitEnAttente && !ajoutVariante && !transactions.lireSuiviSuppressionAnon() && !transactions.lireSuiviImportCorrespondances() && !transactions.lireSuiviRenommageAnon() && !transactions.lireSuiviDissociationAnon()
    && !transactions.lirePublicationEntretien() && magasin.ouvrir().dissociationAnon === undefined && magasin.ouvrir().suppressionAnon === undefined && magasin.ouvrir().retraitVarianteAnon === undefined) {
    await transactions.migrerFormatSiNecessaire()
    await transactions.reconcilierFichiersOrphelins()
  }
  const corpus = magasin.ouvrir()
  const observation = retraitEnAttente ? { entrees: [], indisponible: true } : await coordination.observerVerrous()
  contexte = new ContexteCorpusDistant(
      options.id,
      magasin,
      miroir,
      sessions,
      transactions,
      presence,
      coordination,
    )

  return {
    contexte,
    corpus,
    verrous: observation.entrees,
    verrousIndisponibles: observation.indisponible || undefined,
    inaccessibles: tirage.inaccessibles.length > 0 ? tirage.inaccessibles : undefined,
  }
}
