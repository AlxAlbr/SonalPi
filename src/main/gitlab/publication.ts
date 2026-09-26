import {
  estCheminBailGitLab,
  verifierCheminGitLab,
  type ActionCommitGitLab,
  type BailGitLab,
  type DepotCommitsGitLab,
  type DroitsEditionGitLab,
} from './bailGitLab'
import { ErreurEcritureGitLab, TAILLE_MAX_DOCUMENT_GITLAB } from './client'
import {
  ReconciliateurPublicationGitLab,
  type EntreeJournalPublication,
  type JournalPublicationGitLab,
  type NaturePublicationGitLab,
} from './journalPublication'

export type ActionPlanGitLab =
  | { action: 'create'; chemin: string; contenu: string }
  | { action: 'update'; chemin: string; contenu: string; commitId: string }
  | { action: 'delete'; chemin: string; commitId: string }
  | {
      action: 'move'
      chemin: string
      cheminPrecedent: string
      commitId: string
    }

export interface PlanPublicationGitLab {
  operationId: string
  /** Ce que la publication transporte : une session d'entretien ou une
   *  transaction de corpus. La réconciliation en dépend. */
  nature: NaturePublicationGitLab
  actions: ActionPlanGitLab[]
}

export type ResultatPublicationGitLab =
  | {
      statut: 'confirme'
      commitId: string
      compteurBail: number
    }
  | {
      statut: 'refuse'
      raison: 'conflit' | 'droit-perdu' | 'droits' | 'limite'
    }
  | {
      statut: 'indetermine'
      operationId: string
    }

export interface OptionsPublieurGitLab {
  branche: string
  depot: DepotCommitsGitLab
  coordination: BailGitLab
  journal?: JournalPublicationGitLab
  /** Attente avant le réessai d'une collision de branche, et avant tout. */
  attendre?: (delaiMs: number) => Promise<void>
}

/** Délai avant de renvoyer un commit refusé alors que ses gardes tiennent : il
 *  faut laisser l'autre poste finir son commit, mesuré à 200–400 ms sur
 *  l'instance de qualification. */
export const DELAI_REESSAI_BRANCHE_MS = 400

const SHA_COMMIT = /^[a-f0-9]{40,64}$/
const IDENT_OPERATION = /^[A-Za-z0-9._:-]{1,120}$/
/** Le plan sérialisé vaut la lecture d'un fichier : ce qui s'ouvre doit
 *  pouvoir s'enregistrer. */
const TAILLE_MAX_PLAN = TAILLE_MAX_DOCUMENT_GITLAB
/** GitLab refuse au-delà de cent actions dans un même commit, bail compris. */
export const MAX_ACTIONS_PUBLICATION = 100
/** Taille du corps HTTP de publication, bail et échappement compris. */
export const MAX_CORPS_PUBLICATION = TAILLE_MAX_DOCUMENT_GITLAB
/** Marge réservée pour l'enveloppe et l'action de bail lors d'un contrôle
 *  anticipé, effectué avant l'acquisition du droit. */
export const RESERVE_ENVELOPPE_PUBLICATION = 8 * 1024

/** Un geste trop volumineux pour un seul commit : il est refusé par son nom,
 *  jamais découpé en plusieurs commits ni dégardé. */
export class RefusLimitePublicationGitLab extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RefusLimitePublicationGitLab'
  }
}

/** Octets du corps exact que l'API recevra, branche et actions comprises. */
export function mesurerCorpsPublication(
  branche: string,
  message: string,
  actions: readonly unknown[],
  reserve = 0,
): number {
  return Buffer.byteLength(
    JSON.stringify({ branch: branche, commit_message: message, actions }),
    'utf8',
  ) + reserve
}

/** Contrôle définitif des bornes, sur le corps complet, bail compris : c'est
 *  lui que GitLab compte. */
export function verifierBornesPublication(
  branche: string,
  message: string,
  actions: readonly unknown[],
): void {
  if (actions.length > MAX_ACTIONS_PUBLICATION) throw refusActions(actions.length)
  const octets = mesurerCorpsPublication(branche, message, actions)
  if (octets > MAX_CORPS_PUBLICATION) throw refusTaille(octets)
}

/** Même contrôle avant l'acquisition du droit : l'action de bail n'existe pas
 *  encore, sa place est donc comptée à l'avance. */
export function verifierBornesAnticipees(
  branche: string,
  message: string,
  actions: readonly unknown[],
): void {
  if (actions.length + 1 > MAX_ACTIONS_PUBLICATION) {
    throw refusActions(actions.length + 1)
  }
  const octets = mesurerCorpsPublication(branche, message, actions, RESERVE_ENVELOPPE_PUBLICATION)
  if (octets > MAX_CORPS_PUBLICATION) throw refusTaille(octets)
}

function refusActions(total: number): RefusLimitePublicationGitLab {
  return new RefusLimitePublicationGitLab(
    `Ce geste porterait ${total} actions dans un seul commit, `
    + `au-delà des ${MAX_ACTIONS_PUBLICATION} acceptées par GitLab. `
    + 'Réduisez le nombre d’entretiens concernés.',
  )
}

function refusTaille(octets: number): RefusLimitePublicationGitLab {
  return new RefusLimitePublicationGitLab(
    `Cette publication ferait ${Math.round(octets / 1024)} Kio, `
    + `au-delà des ${Math.round(MAX_CORPS_PUBLICATION / 1024)} Kio acceptés par GitLab. `
    + 'Réduisez le nombre d’entretiens concernés.',
  )
}

export class PublieurGitLab {
  private readonly attendre: (delaiMs: number) => Promise<void>

  constructor(private readonly options: OptionsPublieurGitLab) {
    if (!options.branche.trim()) throw new Error('Branche GitLab manquante.')
    this.attendre = options.attendre ?? ((delaiMs) => new Promise((resolve) => {
      setTimeout(resolve, delaiMs)
    }))
  }

  /** Publie sous un droit, dans la file de commits de la destination.
   *
   *  Deux publications de ressources différentes ne se croisent donc jamais :
   *  GitLab refuse la seconde quand elles se chevauchent, quelle que soit la
   *  disjointure de leurs fichiers. */
  publierSousDroit(
    plan: PlanPublicationGitLab,
    droit: DroitsEditionGitLab,
  ): Promise<ResultatPublicationGitLab> {
    return this.options.coordination.serierCommit(() => this.publierInterne(plan, droit))
  }

  private async publierInterne(
    plan: PlanPublicationGitLab,
    droit: DroitsEditionGitLab,
  ): Promise<ResultatPublicationGitLab> {
    const actions = compilerPlan(plan)
    const avant = this.options.coordination.snapshot(droit)
    let transition: ReturnType<BailGitLab['preparerPublication']>
    try {
      transition = this.options.coordination.preparerPublication(droit)
    } catch (erreur) {
      if (erreur instanceof Error && erreur.message === 'Le droit d’édition GitLab est expiré.') {
        return { statut: 'refuse', raison: 'droit-perdu' }
      }
      throw erreur
    }
    const actionsComplete = [...actions, transition.action]
    const message = `Sonal ${plan.operationId}`
    try {
      // Le bail vient d'être posé : un dépassement doit le laisser intact.
      verifierBornesPublication(this.options.branche, message, actionsComplete)    } catch (erreur) {
      this.options.coordination.annulerPreparation(droit)
      throw erreur
    }
    if (this.options.journal) {
      try {
        this.options.journal.preparer({
          operationId: plan.operationId,
          nature: plan.nature,
          branche: this.options.branche,
          resourceHash: avant.resourceHash,
          generation: avant.generation,
          leaseCommitId: transition.action.last_commit_id as string,
          etat: 'prepare',
          actions: actionsComplete,
        })
      } catch (erreur) {
        this.options.coordination.annulerPreparation(droit)
        throw erreur
      }
    }
    try {
      let reessai = false
      for (;;) {
        try {
          const commit = await this.options.depot.publierCommit(
            this.options.branche,
            message,
            actionsComplete,
          )
          if (!SHA_COMMIT.test(commit.id)) {
            return this.reconcilierPerdu(plan, droit, transition)
          }
          this.options.coordination.confirmerPublication(
            droit,
            commit.id,
            transition.expireLe,
            transition.compteur,
          )
          this.supprimerJournal(plan.operationId)
          return {
            statut: 'confirme',
            commitId: commit.id,
            compteurBail: transition.compteur,
          }
        } catch (erreur) {
          // Un refus alors que toutes les gardes tiennent encore ne parle pas
          // de notre édition : c'est la tête de branche qui a bougé pendant
          // l'envoi. Le même commit repart, une fois.
          const collisionDeBranche = erreur instanceof ErreurEcritureGitLab
            && (erreur.statut === 400 || erreur.statut === 409)
            && !reessai
            && await this.gardesTiennent(actionsComplete)
          if (!collisionDeBranche) throw erreur
          reessai = true
          await this.attendre(DELAI_REESSAI_BRANCHE_MS)
        }
      }
    } catch (erreur) {
      if (erreur instanceof ErreurEcritureGitLab) {
        if (erreur.statut === 400 || erreur.statut === 409) {
          const generationCourante = await this.generationCourante(avant.chemin)
          const droitPerdu = generationCourante !== avant.generation
          this.options.coordination.refuserPublication(droit, droitPerdu)
          this.supprimerJournal(plan.operationId)
          return {
            statut: 'refuse',
            raison: droitPerdu ? 'droit-perdu' : 'conflit',
          }
        }
        if (erreur.statut === 404) {
          this.options.coordination.refuserPublication(droit, true)
          this.supprimerJournal(plan.operationId)
          return { statut: 'refuse', raison: 'droit-perdu' }
        }
        if (erreur.statut === 401 || erreur.statut === 403) {
          this.options.coordination.refuserPublication(droit, false)
          this.supprimerJournal(plan.operationId)
          return { statut: 'refuse', raison: 'droits' }
        }
        if (erreur.statut === 413 || erreur.statut === 429) {
          this.options.coordination.refuserPublication(droit, false)
          this.supprimerJournal(plan.operationId)
          return { statut: 'refuse', raison: 'limite' }
        }
      }
      this.options.coordination.suspendrePublicationIndeterminee(droit)
      return this.reconcilierPerdu(plan, droit, transition)
    }
  }

  /** Sort d'une publication dont la réponse s'est perdue.
   *
   *  Le commit peut avoir abouti : la réconciliation le retrouve et en vérifie
   *  le contenu, et l'état de bail qu'il portait est adopté pour que la
   *  libération suivante porte la bonne garde. Si le commit n'existe pas, le
   *  refus est certain et la publication est déclarée telle. Tant que le sort
   *  reste inconnu, l'entrée demeure journalisée et l'appelant est informé
   *  d'un résultat indéterminé, comme avant. */
  private async reconcilierPerdu(
    plan: PlanPublicationGitLab,
    droit: DroitsEditionGitLab,
    transition: { expireLe: number; compteur: number },
  ): Promise<ResultatPublicationGitLab> {
    this.marquerIndetermine(plan.operationId)
    if (!this.options.journal) return { statut: 'indetermine', operationId: plan.operationId }
    const entree = this.options.journal.lireSiPresent(plan.operationId)
    if (!entree) return { statut: 'indetermine', operationId: plan.operationId }
    const reconciliateur = new ReconciliateurPublicationGitLab(
      this.options.depot,
      this.options.journal,
    )
    let resultat: Awaited<ReturnType<ReconciliateurPublicationGitLab['reconcilier']>>
    try {
      resultat = await reconciliateur.reconcilier(entree)
    } catch {
      return { statut: 'indetermine', operationId: plan.operationId }
    }
    if (resultat.statut === 'indetermine') {
      return { statut: 'indetermine', operationId: plan.operationId }
    }
    if (resultat.statut === 'absent') {
      // Le commit n'a jamais existé : le refus est certain, et la libération
      // portera encore la bonne garde.
      this.supprimerJournal(plan.operationId)
      return { statut: 'refuse', raison: 'conflit' }
    }
    this.adopterBailReconcilie(droit, resultat.commitId, entree)
    this.supprimerJournal(plan.operationId)
    return {
      statut: 'confirme',
      commitId: resultat.commitId,
      compteurBail: transition.compteur,
    }
  }

  /** Reprend l'état de bail que la publication reconciliée portait. */
  private adopterBailReconcilie(
    droit: DroitsEditionGitLab,
    commitId: string,
    entree: EntreeJournalPublication,
  ): void {
    if (!this.options.journal) return
    let actions: ActionCommitGitLab[]
    try {
      actions = this.options.journal.chargerActions(entree)
    } catch {
      return
    }
    const cheminBail = this.options.coordination.snapshot(droit).chemin
    const action = actions.find((candidate) => candidate.file_path === cheminBail)
    if (action?.content === undefined) return
    let bail: unknown
    try {
      bail = JSON.parse(action.content)
    } catch {
      return
    }
    const compteur = (bail as { compteur?: unknown }).compteur
    const expireLe = (bail as { expireLe?: unknown }).expireLe
    if (!Number.isSafeInteger(compteur) || typeof expireLe !== 'string') return
    try {
      this.options.coordination.constaterPublicationReconciliee(droit, commitId, {
        compteur: compteur as number,
        expireLe,
      })
    } catch {
      /* Un bail incohérent laisse la suspension en place : la libération
         échouera proprement, comme elle le ferait sans réconciliation. */
    }
  }

  /** Les gardes du plan sont-elles encore celles envoyées ?
   *
   *  C'est le seul contrôle qui distingue un conflit métier d'une collision de
   *  branche : une garde qui a bougé EST un conflit, une garde intacte ne peut
   *  pas l'être. Le coût est proportionnel au plan, et il n'est payé que sur un
   *  refus. */
  private async gardesTiennent(actions: ActionCommitGitLab[]): Promise<boolean> {
    try {
      for (const action of actions) {
        if (action.action === 'create') continue
        const observe = await this.options.depot.lireFichier(action.file_path, this.options.branche)
        if (!observe || observe.commitId !== action.last_commit_id) return false
      }
      return true
    } catch {
      return false
    }
  }


  private marquerIndetermine(operationId: string): void {
    try {
      this.options.journal?.marquerIndetermine(operationId)
    } catch {
      /* L'entrée « prepare » suffit à retrouver l'opération au démarrage. */
    }
  }

  private supprimerJournal(operationId: string): void {
    try {
      this.options.journal?.supprimer(operationId)
    } catch {
      /* Une entrée confirmée ou refusée sera nettoyée après sa réconciliation. */
    }
  }

  private async generationCourante(chemin: string): Promise<string | null> {
    try {
      const observe = await this.options.depot.lireFichier(chemin, this.options.branche)
      if (!observe) return null
      const brut = JSON.parse(observe.contenu) as { generation?: unknown }
      return typeof brut.generation === 'string' ? brut.generation : null
    } catch {
      return null
    }
  }
}

function compilerPlan(plan: PlanPublicationGitLab): ActionCommitGitLab[] {
  if (!IDENT_OPERATION.test(plan.operationId)) {
    throw new Error('Identifiant d’opération GitLab invalide.')
  }
  if (plan.actions.length === 0) {
    throw new Error('Plan de publication GitLab invalide.')
  }
  const vus = new Set<string>()
  const actions = plan.actions.map((action): ActionCommitGitLab => {
    if (estCheminBailGitLab(action.chemin)) {
      throw new Error('Le plan ne peut pas modifier directement un bail GitLab.')
    }
    verifierCheminGitLab(action.chemin)
    if (action.action === 'move') {
      verifierCheminGitLab(action.cheminPrecedent)
      if (
        action.chemin === action.cheminPrecedent ||
        estCheminBailGitLab(action.cheminPrecedent) ||
        vus.has(action.cheminPrecedent)
      ) {
        throw new Error('Action de déplacement GitLab invalide.')
      }
      vus.add(action.chemin)
      vus.add(action.cheminPrecedent)
      if (!SHA_COMMIT.test(action.commitId)) throw new Error('Garde GitLab invalide.')
      return {
        action: 'move',
        file_path: action.chemin,
        previous_path: action.cheminPrecedent,
        last_commit_id: action.commitId,
      }
    }
    if (vus.has(action.chemin)) throw new Error('Action GitLab dupliquée.')
    vus.add(action.chemin)
    if (action.action === 'delete') {
      if (!SHA_COMMIT.test(action.commitId)) throw new Error('Garde GitLab invalide.')
      return {
        action: 'delete',
        file_path: action.chemin,
        last_commit_id: action.commitId,
      }
    }
    if (typeof action.contenu !== 'string') {
      throw new Error('Contenu de publication GitLab invalide.')
    }
    if (action.action === 'create') {
      return { action: 'create', file_path: action.chemin, content: action.contenu }
    }
    if (!SHA_COMMIT.test(action.commitId)) throw new Error('Garde GitLab invalide.')
    return {
      action: 'update',
      file_path: action.chemin,
      content: action.contenu,
      last_commit_id: action.commitId,
    }
  })
  if (Buffer.byteLength(JSON.stringify(actions), 'utf8') > TAILLE_MAX_PLAN) {
    throw new Error('Plan de publication GitLab trop volumineux.')
  }
  return actions
}
