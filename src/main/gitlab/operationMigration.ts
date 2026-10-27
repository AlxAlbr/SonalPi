import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { BilanMigrationGitLab, ProgressionMigrationGitLab, ResultatMigrationGitLab } from '../../shared/corpus/migrationGitLab'
import type { OuvertureDistante } from '../../shared/distant'
import type { ReferenceMediaDistant } from '../../shared/format'
import { BailGitLab, cheminBailRessourceGitLab, cleRessourceBailGitLab, estCheminBailGitLab, type DepotCommitsGitLab, type DroitsEditionGitLab, type IdentiteBailGitLab } from './bailGitLab'
import { DocumentsMigrationGitLab } from './documentsMigration'
import { JournalPublicationGitLab, ReconciliateurPublicationGitLab } from './journalPublication'
import { PublieurGitLab, verifierBornesAnticipees, type ActionPlanGitLab } from './publication'
import { SuiviDurableMigrationGitLab, type EtatMigrationGitLab } from './suiviMigration'

export interface InstantaneCibleMigration {
  commit: string | null
  fichiers: Record<string, string>
}

export interface EnvironnementOperationMigration {
  depot: DepotCommitsGitLab
  observer(commit?: string): Promise<InstantaneCibleMigration>
  copier(index: number, surOctets: (octets: number) => void, signal: AbortSignal): Promise<ReferenceMediaDistant>
  conserverAutre?(index: number, surOctets: (octets: number) => void, signal: AbortSignal): Promise<void>
  ouvrir(signal: AbortSignal): Promise<OuvertureDistante>
  progression?: (progression: ProgressionMigrationGitLab) => void
  maintenant?: () => number
}

export function initialiserSuiviMigration(
  suivi: SuiviDurableMigrationGitLab,
  bilan: BilanMigrationGitLab,
  destinationId: string,
  identite: IdentiteBailGitLab,
  initial: InstantaneCibleMigration,
): EtatMigrationGitLab {
  if (initial.commit !== bilan.commitCible) throw new Error('La destination a changé depuis le bilan. Préparez de nouveau la migration.')
  const documents = new DocumentsMigrationGitLab(join(suivi.dossier, 'documents'), bilan, true)
  const etat: EtatMigrationGitLab = {
    version: 1, operationId: `migration-${bilan.bilanId}`, destinationId, bilan,
    branche: bilan.cible.branche ?? 'main', identite, phase: 'copie', initial: initial.fichiers, initialisationConfirmee: false,
    mediasConfirmes: [], autresConfirmes: [], documents: [], lots: [], prochainLot: 0,
  }
  let actions: ActionPlanGitLab[] = []
  let indices: number[] = []
  const verifier = (candidats: ActionPlanGitLab[]) => verifierBornesAnticipees(etat.branche, `Sonal ${etat.operationId}-pub-${randomUUID()}`,
    candidats.map((a) => ({ action: 'create', file_path: a.chemin, content: 'contenu' in a ? a.contenu : '' })))
  for (const action of documents.contenusPrepares()) {
    verifier([action])
    try { verifier([...actions, action]) } catch {
      etat.lots.push(indices)
      actions = []; indices = []
    }
    indices.push(etat.documents.length)
    etat.documents.push(suivi.conserverContenu(action.chemin, action.contenu))
    actions.push(action)
  }
  if (indices.length) etat.lots.push(indices)
  suivi.ecrire(etat)
  return etat
}

/** Copie, publie et reprend une migration à partir de ses preuves locales. */
export class OperationMigrationGitLab {
  private readonly journal: JournalPublicationGitLab
  private readonly coordination: BailGitLab
  private readonly publication: PublieurGitLab
  private droit: DroitsEditionGitLab | null = null
  private readonly ressource: string

  constructor(
    private readonly suivi: SuiviDurableMigrationGitLab,
    private readonly etat: EtatMigrationGitLab,
    private readonly environnement: EnvironnementOperationMigration,
  ) {
    this.journal = new JournalPublicationGitLab(etat.destinationId, join(suivi.dossier, 'publication'))
    this.ressource = cleRessourceBailGitLab(etat.branche, 'corpus.json')
    this.coordination = new BailGitLab({
      branche: etat.branche, depot: environnement.depot, identite: () => etat.identite,
      nouvelleGeneration: () => this.etat.generationBail!, maintenant: environnement.maintenant,
    })
    this.publication = new PublieurGitLab({
      branche: etat.branche, depot: environnement.depot, coordination: this.coordination,
      journal: this.journal, conserverJournalConfirme: true, absenceIndeterminee: true,
      verifierAvantEnvoi: () => this.verifierCible(),
    })
  }

  async executer(reprise: boolean, signal: AbortSignal): Promise<ResultatMigrationGitLab> {
    try {
      for (const document of this.etat.documents) this.suivi.lireContenu(document)
      if (this.etat.intention && !await this.reconcilierIntention(reprise)) {
        return this.indetermine('Le dernier envoi n’est pas encore confirmé. Relisez le suivi avant de reprendre.')
      }
      if (this.etat.phase !== 'ouverture' && this.etat.phase !== 'terminee') {
        await this.verifierCible()
        for (let index = reprise ? 0 : this.etat.mediasConfirmes.length; index < this.etat.bilan.medias.length; index += 1) {
          signal.throwIfAborted()
          this.signaler('copie', index, this.etat.bilan.medias.length, this.etat.bilan.medias[index].cheminSource)
          const reference = await this.environnement.copier(index, (octets) => this.signaler('copie', index,
            this.etat.bilan.medias.length, this.etat.bilan.medias[index].cheminSource, octets), signal)
          this.etat.mediasConfirmes[index] = reference
          this.suivi.ecrire(this.etat)
        }
        const autres = this.etat.bilan.conservation?.autres ?? []
        this.etat.autresConfirmes ??= []
        for (let index = reprise ? 0 : this.etat.autresConfirmes.length; index < autres.length; index++) {
          signal.throwIfAborted()
          const fichier = autres[index]
          this.signaler('autres', index, autres.length, fichier.cheminSource)
          if (!this.environnement.conserverAutre) throw new Error('La copie des documents supplémentaires n’est pas disponible.')
          await this.environnement.conserverAutre(index, (octets) => this.signaler('autres', index, autres.length, fichier.cheminSource, octets), signal)
          this.etat.autresConfirmes[index] = fichier.cheminDestination
          this.suivi.ecrire(this.etat)
        }
        this.etat.phase = 'publication'
        this.suivi.ecrire(this.etat)
        while (this.etat.prochainLot < this.etat.lots.length) {
          signal.throwIfAborted()
          await this.verifierCible()
          await this.acquerirDroit()
          await this.verifierCible()
          if (!await this.coordination.renouveler(this.droit!)) throw new Error('La destination n’est plus disponible pour cette migration. Réessayez plus tard.')
          const operationId = `${this.etat.operationId}-pub-${randomUUID()}`
          const lot = this.etat.prochainLot
          this.etat.intention = { operationId, lot }
          this.suivi.ecrire(this.etat)
          this.signaler('publication', lot, this.etat.lots.length)
          const actions = this.etat.lots[lot].map((index) => {
            const d = this.etat.documents[index]
            return { action: 'create' as const, chemin: d.chemin, contenu: this.suivi.lireContenu(d) }
          })
          const resultat = await this.publication.publierSousDroit({ operationId, nature: 'transaction-corpus', actions }, this.droit!)
          if (resultat.statut === 'indetermine') return this.indetermine('L’envoi n’est pas confirmé. Les copies acquises sont conservées ; reprenez depuis le suivi.')
          if (resultat.statut === 'refuse') {
            delete this.etat.intention
            this.suivi.ecrire(this.etat)
            throw new Error('La publication a été refusée. Aucun fichier existant n’a été remplacé ; vérifiez les accès et la destination avant de reprendre.')
          }
          this.confirmerLot(operationId)
        }
        await this.verifierCible()
        this.etat.phase = 'ouverture'
        this.suivi.ecrire(this.etat)
      }
      signal.throwIfAborted()
      if (this.etat.phase !== 'terminee') await this.verifierCible()
      await this.libererDroit()
      this.signaler('ouverture', 0, 1)
      signal.throwIfAborted()
      const ouverture = await this.environnement.ouvrir(signal)
      if (ouverture.inaccessibles?.length) throw new Error('Le corpus est publié, mais des médias ne sont pas accessibles. Corrigez l’accès puis reprenez l’ouverture.')
      this.etat.phase = 'terminee'
      try { this.suivi.ecrire(this.etat) } catch {
        // Le corpus est confirmé et installé ; le suivi conserve une ouverture réessayable.
      }
      return { etat: 'terminee', operationId: this.etat.operationId, ouverture }
    } catch (erreur) {
      return {
        etat: 'interrompue', operationId: this.etat.operationId,
        message: signal.aborted ? 'La migration est arrêtée. Les copies acquises sont conservées ; vous pourrez reprendre.'
          : erreur instanceof Error ? erreur.message : 'La migration est interrompue. Consultez son suivi.',
      }
    } finally {
      if (!this.etat.intention) await this.libererDroit().catch(() => undefined)
    }
  }

  private async acquerirDroit(): Promise<void> {
    if (this.droit && await this.coordination.revalider(this.droit)) return
    this.droit = this.etat.generationBail
      ? await this.coordination.retrouverDroitJournalise(this.ressource, this.etat.generationBail) : null
    if (this.droit) {
      this.etat.initialisationConfirmee = true
      this.suivi.ecrire(this.etat)
      return
    }
    this.etat.generationBail = randomUUID()
    this.suivi.ecrire(this.etat)
    const resultat = await this.coordination.acquireRessource(this.ressource)
    if (!resultat.ok) throw new Error('Cette destination est utilisée par une autre opération. Réessayez plus tard.')
    this.droit = resultat.droit
    this.etat.initialisationConfirmee = true
    this.suivi.ecrire(this.etat)
  }

  private async libererDroit(): Promise<void> {
    if (!this.droit && this.etat.generationBail) {
      this.droit = await this.coordination.retrouverDroitJournalise(this.ressource, this.etat.generationBail)
    }
    if (!this.droit) return
    this.etat.initialisationConfirmee = true
    this.suivi.ecrire(this.etat)
    const droit = this.droit
    this.droit = null
    await this.coordination.liberer(droit)
  }

  private async verifierCible(commit?: string): Promise<void> {
    const snapshot = await this.environnement.observer(commit)
    const cheminBail = cheminBailRessourceGitLab(this.ressource)
    let bailProuve = false
    if (snapshot.fichiers[cheminBail] && this.etat.generationBail) {
      const fichier = await this.environnement.depot.lireFichier(cheminBail, snapshot.commit!)
      const bail = fichier ? JSON.parse(fichier.contenu) : null
      bailProuve = bail?.generation === this.etat.generationBail &&
        bail?.holder?.userId === this.etat.identite.userId && bail.holder.machineId === this.etat.identite.machineId &&
        bail.holder.sessionId === this.etat.identite.sessionId
    }
    if (!this.etat.initialisationConfirmee && this.etat.prochainLot === 0 && !bailProuve && snapshot.commit !== this.etat.bilan.commitCible) {
      throw new Error('La destination a changé depuis le bilan. Aucun envoi autorisé.')
    }
    const attendus = { ...this.etat.initial }
    for (const lot of this.etat.lots.slice(0, this.etat.prochainLot)) {
      for (const index of lot) attendus[this.etat.documents[index].chemin] = this.etat.documents[index].blob
    }
    for (const [chemin, blob] of Object.entries(snapshot.fichiers)) {
      if (chemin === cheminBail && bailProuve) continue
      if (estCheminBailGitLab(chemin)) throw new Error('Cette destination est utilisée par une autre opération. Réessayez plus tard.')
      if (attendus[chemin] !== blob) throw new Error(`La destination contient un fichier nouveau ou modifié : « ${chemin} ». Aucun écrasement autorisé.`)
    }
    if (Object.keys(attendus).some((p) => snapshot.fichiers[p] !== attendus[p])) throw new Error('La destination a changé depuis sa préparation. Aucun écrasement autorisé.')
  }

  private confirmerLot(operationId: string): void {
    this.etat.prochainLot += 1
    delete this.etat.intention
    this.suivi.ecrire(this.etat)
    this.journal.supprimer(operationId)
  }

  private async reconcilierIntention(reprise: boolean): Promise<boolean> {
    const intention = this.etat.intention!
    const entree = this.journal.lireSiPresent(intention.operationId)
    if (entree) {
      const verdict = await new ReconciliateurPublicationGitLab(this.environnement.depot, this.journal).reconcilier(entree)
      if (verdict.statut === 'confirme') { this.confirmerLot(intention.operationId); return true }
      if (verdict.statut === 'indetermine' || !reprise) return false
    } else {
      const commits = await this.environnement.depot.rechercherCommits(this.etat.branche, intention.operationId)
      if (commits.some((c) => c.title === `Sonal ${intention.operationId}`)) return false
      if (!reprise) return false
    }
    await this.acquerirDroit()
    if (!await this.coordination.renouveler(this.droit!)) return false
    const snapshot = await this.environnement.observer()
    const documents = this.etat.lots[intention.lot].map((i) => this.etat.documents[i])
    if (documents.every((d) => snapshot.fichiers[d.chemin] === d.blob)) {
      this.confirmerLot(intention.operationId)
      return true
    }
    if (documents.some((d) => snapshot.fichiers[d.chemin] !== undefined)) return false
    delete this.etat.intention
    this.suivi.ecrire(this.etat)
    if (entree) this.journal.supprimer(intention.operationId)
    return true
  }

  private indetermine(message: string): ResultatMigrationGitLab { return { etat: 'indeterminee', operationId: this.etat.operationId, message } }
  private signaler(etape: ProgressionMigrationGitLab['etape'], faits: number, total: number, chemin?: string, octets?: number): void {
    this.environnement.progression?.({ operationId: this.etat.operationId, bilanId: this.etat.bilan.bilanId, etape, faits, total, chemin, octets })
  }
}
