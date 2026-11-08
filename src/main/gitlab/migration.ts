import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { CONNEXION_MIGRATION_GITLAB_REQUISE, MIGRATION_GITLAB_QUALIFIEE, type DemandeSourceMigrationGitLab, type BilanMigrationGitLab, type ConversionEntretienMigrationGitLab, type DemandeBilanMigrationGitLab, type ProgressionMigrationGitLab, type ResultatMigrationGitLab, type SuiviMigrationGitLab } from '../../shared/corpus/migrationGitLab'
import type { DemandeConfigurationBaseMedia, DemandeOuvertureGitLab } from '../../shared/gitlab'
import type { OuvertureDistante } from '../../shared/distant'
import { idDeDestinationGitLab, type CoffreComptes } from '../distant/coffre'
import { preparerBaseMediaVerifiee, resoudreBaseMedia } from '../medias/baseMedia'
import { ClientWebDAV } from '../webdav/client'
import { BailGitLab, cleRessourceBailGitLab, DepotCommitsGitLabClient, type IdentiteBailGitLab } from './bailGitLab'
import type { ServiceAuthentificationGitLab } from './authentification'
import { CopieurMediasMigrationGitLab } from './copieMediasMigration'
import { DocumentsMigrationGitLab } from './documentsMigration'
import { LecteurGitLab } from './lecture'
import { identifierFichierGitLab } from './lfs'
import { OperationMigrationGitLab, initialiserSuiviMigration, type EnvironnementOperationMigration, type InstantaneCibleMigration } from './operationMigration'
import { PreparateurMigrationGitLab, inventorierDepotMigration } from './preparationMigration'
import { SuiviDurableMigrationGitLab, operationMigrationSaine, type EtatMigrationGitLab } from './suiviMigration'
import { installerFluxGitLab, TransfertGitLab } from './transfert'
import { ErreurGitLab } from './client'

export interface OptionsMigrationGitLab {
  authentification: ServiceAuthentificationGitLab
  coffre: CoffreComptes
  dirProfil: string
  identite: { machineId: string; sessionId: string }
  ouvrir(demande: DemandeOuvertureGitLab, signal?: AbortSignal): Promise<OuvertureDistante>
  progression?: (progression: ProgressionMigrationGitLab) => void
  /** Permet aux tests isolés de vérifier aussi le refus d'envoi. */
  autoriserEnvoi?: boolean
}

/** Raccorde préparation privée, confirmation, opération et réouverture. */
export class ServiceMigrationGitLab {
  readonly preparation: PreparateurMigrationGitLab
  private readonly racine: string
  private documents: { bilanId: string; documents: DocumentsMigrationGitLab } | null = null
  private execution: { operationId: string; annulation: AbortController } | null = null
  private annulationPrealable: string | null = null

  constructor(private readonly options: OptionsMigrationGitLab) {
    this.preparation = new PreparateurMigrationGitLab(options.authentification, undefined, options.coffre)
    this.racine = join(options.dirProfil, 'migrations-gitlab')
  }

  async decouvrir(demande: DemandeSourceMigrationGitLab) {
    this.documents = null
    try {
      return await this.preparation.decouvrir(demande)
    } catch (erreur) {
      if (erreur instanceof ErreurGitLab && erreur.statut === 401) {
        throw new Error(CONNEXION_MIGRATION_GITLAB_REQUISE)
      }
      throw erreur
    }
  }

  async preparer(demande: DemandeBilanMigrationGitLab): Promise<BilanMigrationGitLab> {
    this.documents = null
    const bilan = await this.preparation.preparer(demande)
    const dossier = this.dossier(`migration-${bilan.bilanId}`)
    mkdirSync(dossier, { recursive: true, mode: 0o700 })
    this.documents = { bilanId: bilan.bilanId, documents: new DocumentsMigrationGitLab(join(dossier, 'documents'), bilan) }
    return bilan
  }

  ajouterConversion(bilanId: string, index: number, conversion: ConversionEntretienMigrationGitLab): void {
    this.preparation.capturerBilan(bilanId)
    if (this.documents?.bilanId !== bilanId) throw new Error('La préparation des documents a changé.')
    this.documents.documents.ajouter(index, conversion)
  }

  abandonner(preparationId: string): void {
    if (this.preparation.abandonner(preparationId)) this.documents = null
  }

  listerSuivis(): SuiviMigrationGitLab[] {
    if (!existsSync(this.racine)) return []
    return readdirSync(this.racine).filter(operationMigrationSaine).flatMap((id) => {
      const etat = new SuiviDurableMigrationGitLab(this.dossier(id)).lire()
      if (etat && etat.operationId !== id) throw new Error('Le suivi de migration appartient à une autre opération. Aucun envoi autorisé.')
      return etat ? [{ operationId: id, bilan: etat.bilan, phase: etat.phase,
        mediasConfirmes: etat.mediasConfirmes.length, autresConfirmes: etat.autresConfirmes?.length ?? 0,
        publicationsConfirmees: etat.prochainLot, publicationsTotal: etat.lots.length }] : []
    })
  }

  async executer(bilanId: string, confirmee: boolean): Promise<ResultatMigrationGitLab> {
    this.exigerConfirmation(confirmee)
    const capture = this.preparation.capturerBilan(bilanId)
    if (this.documents?.bilanId !== bilanId || this.documents.documents.nombreEntretiens !== capture.bilan.entretiens.length) {
      throw new Error('La conversion des entretiens n’est pas terminée.')
    }
    const operationId = `migration-${bilanId}`
    const destinationId = this.destinationId(capture.bilan)
    if (this.listerSuivis().some((s) => s.operationId !== operationId && s.phase !== 'terminee' && this.destinationId(s.bilan) === destinationId)) {
      throw new Error('Une migration vers cette destination existe déjà. Reprenez-la depuis son suivi.')
    }
    const suivi = new SuiviDurableMigrationGitLab(this.dossier(operationId))
    if (suivi.lire()) throw new Error('Cette migration est déjà engagée. Utilisez Reprendre.')
    return this.executerReserve(operationId, async () => {
      const initial = await this.observer(capture.bilan, capture.bilan.cible.branche ?? 'main')
      const etat = initialiserSuiviMigration(suivi, capture.bilan, destinationId,
        { ...this.options.identite, userId: capture.bilan.cible.utilisateur }, initial)
      this.options.coffre.enregistrerDestinationGitLab({
        compteId: capture.bilan.cible.compteId, projetId: capture.bilan.cible.projetId,
        branche: etat.branche, nomProjet: capture.bilan.cible.nomProjet, racine: '',
      })
      if (capture.baseMedia) this.options.coffre.enregistrerBaseMedia({ destinationGitLabId: destinationId, ...capture.baseMedia })
      return { suivi, etat, reprise: false }
    })
  }

  async reprendre(operationId: string, confirmee: boolean, baseMedia?: DemandeConfigurationBaseMedia): Promise<ResultatMigrationGitLab> {
    this.exigerConfirmation(confirmee)
    return this.executerReserve(operationId, async () => {
      const suivi = new SuiviDurableMigrationGitLab(this.dossier(operationId))
      const etat = suivi.lire()
      if (!etat) throw new Error('Aucune migration de ce nom n’est à reprendre.')
      if (etat.operationId !== operationId) throw new Error('Ce suivi appartient à une autre opération. Aucun envoi autorisé.')
      if (etat.identite.machineId !== this.options.identite.machineId || this.destinationId(etat.bilan) !== etat.destinationId) {
        throw new Error('Ce suivi appartient à un autre poste ou à une autre destination.')
      }
      if (etat.generationBail && etat.identite.sessionId !== this.options.identite.sessionId) {
        const client = await this.options.authentification.client(etat.bilan.cible.compteId, etat.bilan.cible.projetId)
        const ancienneSession = new BailGitLab({ branche: etat.branche, depot: new DepotCommitsGitLabClient(client), identite: () => etat.identite })
        const encoreActif = await ancienneSession.retrouverDroitJournalise(cleRessourceBailGitLab(etat.branche, 'corpus.crp'), etat.generationBail)
        if (encoreActif) throw new Error('La précédente opération est encore active. Votre progression est conservée ; réessayez un peu plus tard.')
      }
      if (baseMedia) {
        if (etat.bilan.destinationMedia !== 'externe') throw new Error('Cette migration copie les médias dans le dépôt, pas dans un espace externe.')
        const resultat = await preparerBaseMediaVerifiee(baseMedia)
        if (!resultat.ok) throw new Error('L’espace média n’est pas accessible avec ces accès.')
        this.options.coffre.enregistrerBaseMedia({ destinationGitLabId: etat.destinationId, ...resultat.base })
      }
      return { suivi, etat, reprise: true }
    })
  }

  annuler(operationId: string): void {
    if (this.execution?.operationId === operationId) this.execution.annulation.abort()
    else if (this.documents && operationId === `migration-${this.documents.bilanId}` &&
      !new SuiviDurableMigrationGitLab(this.dossier(operationId)).lire()) this.annulationPrealable = operationId
  }

  private async executerReserve(operationId: string, preparer: () => Promise<{ suivi: SuiviDurableMigrationGitLab; etat: EtatMigrationGitLab; reprise: boolean }>): Promise<ResultatMigrationGitLab> {
    if (this.execution) throw new Error('Une migration est déjà en cours. Attendez son arrêt avant une autre opération.')
    const annulation = new AbortController()
    this.execution = { operationId, annulation }
    if (this.annulationPrealable === operationId) { annulation.abort(); this.annulationPrealable = null }
    try {
      annulation.signal.throwIfAborted()
      const { suivi, etat, reprise } = await preparer()
      const environnement = await this.environnement(etat, suivi)
      return await new OperationMigrationGitLab(suivi, etat, environnement).executer(reprise, annulation.signal)
    } finally { this.execution = null }
  }

  private async environnement(etat: EtatMigrationGitLab, suivi: SuiviDurableMigrationGitLab): Promise<EnvironnementOperationMigration> {
    const cible = etat.bilan.cible
    const compte = this.options.authentification.comptePublic(cible.compteId)
    if (compte.urlInstance !== cible.urlInstance || compte.utilisateur !== cible.utilisateur) throw new Error('Le compte de destination a changé. Aucun envoi autorisé.')
    const client = await this.options.authentification.client(cible.compteId, cible.projetId)
    const source = { telechargerFichier: async (chemin: string, fichier: string, surProgression?: (octets: number, total: number | null) => void) => {
      const media = [...etat.bilan.medias, ...(etat.bilan.conservation?.autres ?? [])].find((m) => m.cheminSource === chemin)
      if (!media) throw new Error('Ce fichier ne figure pas dans la source préparée.')
      if (media.stockageSource === 'lfs') {
        await (await this.options.authentification.clientLfs(etat.bilan.source.compteId, etat.bilan.source.projetId))
          .telechargerObjet(media, fichier, surProgression)
      } else {
        const clientSource = await this.options.authentification.client(etat.bilan.source.compteId, etat.bilan.source.projetId)
        if (etat.bilan.conservation?.autres.some((f) => f.cheminSource === chemin)) {
          const reponse = await clientSource.lireFlux(clientSource.cheminProjet(`/repository/files/${encodeURIComponent(chemin)}/raw`), { ref: etat.bilan.commitSource, lfs: 'false' })
          await installerFluxGitLab(reponse, fichier, media, surProgression)
        } else await new TransfertGitLab(clientSource, async () => etat.bilan.commitSource).telechargerFichier(chemin, fichier, surProgression)
      }
    } }
    let copieur: CopieurMediasMigrationGitLab | undefined
    let copieurAutres: CopieurMediasMigrationGitLab | undefined
    const externe = (): ClientWebDAV => {
      const resolution = resoudreBaseMedia(this.options.coffre, etat.destinationId)
      if (!resolution.ok) throw new Error('Renseignez les accès à l’espace média pour reprendre cette migration.')
      return resolution.client
    }
    return {
      depot: new DepotCommitsGitLabClient(client),
      observer: (commit) => this.observer(etat.bilan, etat.branche, commit),
      progression: this.options.progression,
      copier: async (index, surOctets, signal) => {
        copieur ??= new CopieurMediasMigrationGitLab(source, etat.bilan.destinationMedia === 'depot'
          ? { type: 'depot', client: await this.options.authentification.clientLfs(cible.compteId, cible.projetId) }
          : { type: 'externe', client: externe() }, join(suivi.dossier, 'medias'))
        return copieur.copier(etat.bilan.medias[index], (octets) => surOctets(octets), signal)
      },
      conserverAutre: async (index, surOctets, signal) => {
        const fichier = etat.bilan.conservation?.autres[index]
        if (!fichier) throw new Error('Document absent du bilan confirmé.')
        copieurAutres ??= new CopieurMediasMigrationGitLab(source, {
          type: 'depot', client: await this.options.authentification.clientLfs(cible.compteId, cible.projetId),
        }, join(suivi.dossier, 'autres'))
        await copieurAutres.conserver(fichier, (octets) => surOctets(octets), signal)
      },
      ouvrir: async (signal) => {
        for (const fichier of etat.bilan.conservation?.autres ?? []) {
          signal.throwIfAborted()
          await (await this.options.authentification.clientLfs(cible.compteId, cible.projetId)).confirmerObjet(fichier, signal)
        }
        for (const media of etat.bilan.medias) {
          signal.throwIfAborted()
          if (etat.bilan.destinationMedia === 'depot') {
            await (await this.options.authentification.clientLfs(cible.compteId, cible.projetId)).confirmerObjet(media, signal)
          } else {
            const fichier = join(suivi.dossier, `controle-${randomUUID()}`)
            try {
              await externe().getBinaireFichier(media.cheminDestination, fichier)
              const identite = await identifierFichierGitLab(fichier)
              if (identite.sha256 !== media.sha256 || identite.taille !== media.taille) throw new Error('Un média copié a changé. La migration ne peut pas être annoncée complète.')
            } finally { await unlink(fichier).catch(() => undefined) }
          }
        }
        signal.throwIfAborted()
        return this.options.ouvrir({ ...cible, branche: etat.branche }, signal)
      },
    }
  }

  private async observer(bilan: BilanMigrationGitLab, branche: string, commit?: string): Promise<InstantaneCibleMigration> {
    const client = await this.options.authentification.client(bilan.cible.compteId, bilan.cible.projetId)
    const { corps: projet } = await client.lireJson<{ archived?: boolean; default_branch?: string | null; empty_repo?: boolean }>(client.cheminProjet(''))
    if (projet.archived !== false || (projet.empty_repo !== true && projet.default_branch !== branche)) {
      throw new Error('Le projet de destination ou sa branche a changé. Aucun envoi autorisé.')
    }
    if (projet.empty_repo === true) return { commit: null, fichiers: {} }
    const lecteur = commit ? new LecteurGitLab(client, commit) : await LecteurGitLab.depuisBranche(client, branche)
    const fichiers = await inventorierDepotMigration(lecteur)
    return { commit: lecteur.commit, fichiers }
  }

  private destinationId(bilan: BilanMigrationGitLab): string {
    return idDeDestinationGitLab({ compteId: bilan.cible.compteId, projetId: bilan.cible.projetId, branche: bilan.cible.branche ?? 'main', racine: '' })
  }
  private dossier(operationId: string): string {
    if (!operationMigrationSaine(operationId)) throw new Error('Identifiant de migration invalide.')
    return join(this.racine, operationId)
  }
  private exigerConfirmation(confirmee: boolean): void {
    if (!(this.options.autoriserEnvoi ?? MIGRATION_GITLAB_QUALIFIEE)) throw new Error('La migration GitLab attend sa qualification réelle. Aucun envoi autorisé.')
    if (!confirmee) throw new Error('Confirmez la migration avant toute copie ou publication.')
  }
}
