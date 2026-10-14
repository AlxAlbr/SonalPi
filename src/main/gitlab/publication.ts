import {
  estCheminBailGitLab,
  verifierCheminGitLab,
  type ActionCommitGitLab,
  type BailGitLab,
  type DepotCommitsGitLab,
  type DroitsEditionGitLab,
} from './bailGitLab'
import { ErreurEcritureGitLab, TAILLE_MAX_DOCUMENT_GITLAB } from './client'
import { MAX_ACTIONS_PUBLICATION } from './limitesPublication'
import {
  ReconciliateurPublicationGitLab,
  type DroitJournalGitLab,
  type EntreeJournalPublication,
  type JournalPublicationGitLab,
  type NaturePublicationGitLab,
  type SuppressionJournalGitLab,
} from './journalPublication'

export type ActionPlanGitLab =
  | { action: 'create'; chemin: string; contenu: string }
  | { action: 'update'; chemin: string; contenu: string; commitId: string }
  | { action: 'delete'; chemin: string; commitId: string }
  | { action: 'garde'; chemin: string; commitId: string; executable: boolean }
  | {
      action: 'move'
      chemin: string
      cheminPrecedent: string
      commitId: string
    }

export interface PlanPublicationGitLab {
  operationId: string
  /** Ce que la publication transporte : une session d'entretien, une
   *  transaction de corpus ou la suppression d'un entretien. La
   *  réconciliation en dépend. */
  nature: NaturePublicationGitLab
  actions: ActionPlanGitLab[]
  /** Ce qu'une suppression doit pouvoir finir après un arrêt : l'archive
   *  choisie, son empreinte et le plan local complet. */
  suppression?: SuppressionJournalGitLab
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
      statut: 'refuse'
      raison: 'references'
      message: string
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
  /** La progression d'une opération composée doit être durable avant retrait du candidat. */
  conserverJournalConfirme?: boolean
  /** Une recherche de commit vide ne prouve pas l'absence d'une réponse perdue. */
  absenceIndeterminee?: boolean
  /** Revérifie une cible dédiée à chaque tentative, sans remplacer les gardes de fichiers. */
  verifierAvantEnvoi?: () => Promise<void>
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
export { MAX_ACTIONS_PUBLICATION } from './limitesPublication'
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
  nombreDroits = 1,
): void {
  if (!Number.isSafeInteger(nombreDroits) || nombreDroits < 1 || nombreDroits > MAX_ACTIONS_PUBLICATION) {
    throw new Error('Nombre de droits GitLab invalide.')
  }
  if (actions.length + nombreDroits > MAX_ACTIONS_PUBLICATION) {
    throw refusActions(actions.length + nombreDroits)
  }
  const octets = mesurerCorpsPublication(branche, message, actions, RESERVE_ENVELOPPE_PUBLICATION * nombreDroits)
  if (octets > MAX_CORPS_PUBLICATION) throw refusTaille(octets)
}

function refusActions(total: number): RefusLimitePublicationGitLab {
  return new RefusLimitePublicationGitLab(
    `Ce geste porterait ${total} actions dans un seul commit, `
    + `au-delà de la limite de sécurité de ${MAX_ACTIONS_PUBLICATION} actions de Sonal. `
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
    return this.publierSousDroits(plan, [droit])
  }

  /** Publie sous plusieurs droits, dans la même file et le même commit.
   *
   *  Une suppression d'entretien détient le corpus et son entretien : les deux
   *  baux sont renouvelés par le commit de données, ou aucun ne l'est. Le
   *  cas à un droit délègue ici, pour qu'un seul protocole existe. */
  publierSousDroits(
    plan: PlanPublicationGitLab,
    droits: readonly DroitsEditionGitLab[],
  ): Promise<ResultatPublicationGitLab> {
    verifierDroitsPublication(droits)
    const ressources = droits.map(
      (droit) => this.options.coordination.snapshot(droit).resourceHash,
    )
    if (new Set(ressources).size !== ressources.length) {
      throw new Error('Deux droits de publication désignent le même bail.')
    }
    return this.options.coordination.serierCommit(() => this.publierInterne(plan, droits))
  }

  private async publierInterne(
    plan: PlanPublicationGitLab,
    droits: readonly DroitsEditionGitLab[],
  ): Promise<ResultatPublicationGitLab> {
    const actions = compilerPlan(plan)
    const avant = droits.map((droit) => this.options.coordination.snapshot(droit))
    const transitions: Array<{
      droit: DroitsEditionGitLab
      action: ActionCommitGitLab
      expireLe: number
      compteur: number
    }> = []
    for (const droit of droits) {
      try {
        const transition = this.options.coordination.preparerPublication(droit)
        transitions.push({ droit, ...transition })
      } catch (erreur) {
        // Un droit expiré annule toutes les transitions déjà préparées :
        // aucun commit ne portera la moitié des renouvellements.
        this.annulerTransitions(transitions)
        if (erreur instanceof Error && erreur.message === 'Le droit d’édition GitLab est expiré.') {
          return { statut: 'refuse', raison: 'droit-perdu' }
        }
        throw erreur
      }
    }
    const actionsComplete = [
      ...actions,
      ...transitions.map((transition) => transition.action),
    ]
    const message = `Sonal ${plan.operationId}`
    try {
      // Les baux viennent d'être posés : un dépassement doit les laisser intacts.
      verifierBornesPublication(this.options.branche, message, actionsComplete)
    } catch (erreur) {
      this.annulerTransitions(transitions)
      throw erreur
    }
    if (this.options.journal) {
      const droitsJournal: DroitJournalGitLab[] = avant.map((snapshot, index) => ({
        resourceHash: snapshot.resourceHash,
        generation: snapshot.generation,
        leaseCommitId: transitions[index].action.last_commit_id as string,
      }))
      try {
        this.options.journal.preparer({
          operationId: plan.operationId,
          nature: plan.nature,
          branche: this.options.branche,
          droits: droitsJournal,
          etat: 'prepare',
          actions: actionsComplete,
          suppression: plan.suppression,
        })
      } catch (erreur) {
        this.annulerTransitions(transitions)
        throw erreur
      }
    }
    try {
      let reessai = false
      for (;;) {
        if (this.options.verifierAvantEnvoi) {
          try { await this.options.verifierAvantEnvoi() } catch {
            this.refuserTous(transitions, false)
            this.supprimerJournal(plan.operationId)
            return { statut: 'refuse', raison: 'conflit' }
          }
        }
        try {
          const commit = await this.options.depot.publierCommit(
            this.options.branche,
            message,
            actionsComplete,
          )
          if (!SHA_COMMIT.test(commit.id)) {
            return this.reconcilierPerdu(plan, transitions)
          }
          // Un seul identifiant de commit pour tous les droits : leurs
          // transitions ne peuvent pas diverger après coup.
          for (const transition of transitions) {
            this.options.coordination.confirmerPublication(
              transition.droit,
              commit.id,
              transition.expireLe,
              transition.compteur,
            )
          }
          this.cloturerConfirmation(plan, commit.id)
          return {
            statut: 'confirme',
            commitId: commit.id,
            compteurBail: transitions[0].compteur,
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
          // Chaque droit est jugé sur sa propre garde : les autres ne sont
          // pas présentés comme intacts par supposition.
          const perdus: boolean[] = []
          for (const snapshot of avant) {
            perdus.push(await this.generationCourante(snapshot.chemin) !== snapshot.generation)
          }
          transitions.forEach((transition, index) =>
            this.options.coordination.refuserPublication(transition.droit, perdus[index]))
          this.supprimerJournal(plan.operationId)
          return {
            statut: 'refuse',
            raison: perdus.some(Boolean) ? 'droit-perdu' : 'conflit',
          }
        }
        if (erreur.statut === 404) {
          this.refuserTous(transitions, true)
          this.supprimerJournal(plan.operationId)
          return { statut: 'refuse', raison: 'droit-perdu' }
        }
        if (erreur.statut === 401 || erreur.statut === 403) {
          this.refuserTous(transitions, false)
          this.supprimerJournal(plan.operationId)
          return { statut: 'refuse', raison: 'droits' }
        }
        if (erreur.statut === 413 || erreur.statut === 429) {
          this.refuserTous(transitions, false)
          this.supprimerJournal(plan.operationId)
          return { statut: 'refuse', raison: 'limite' }
        }
      }
      for (const transition of transitions) {
        this.options.coordination.suspendrePublicationIndeterminee(transition.droit)
      }
      return this.reconcilierPerdu(plan, transitions)
    }
  }

  /** Annule des transitions avant tout envoi : rien n'a été publié, et chaque
   *  droit reste utilisable par son appelant. */
  private annulerTransitions(
    transitions: ReadonlyArray<{ droit: DroitsEditionGitLab }>,
  ): void {
    for (const transition of transitions) {
      try {
        this.options.coordination.annulerPreparation(transition.droit)
      } catch {
        /* Une transition déjà annulée ne gêne pas les autres. */
      }
    }
  }

  /** Un refus porte sur tous les droits du commit : aucun n'est présenté comme
   *  intact, et chacun est suspendu selon ce que le refus implique. */
  private refuserTous(
    transitions: ReadonlyArray<{ droit: DroitsEditionGitLab }>,
    droitPerdu: boolean,
  ): void {
    for (const transition of transitions) {
      this.options.coordination.refuserPublication(transition.droit, droitPerdu)
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
    transitions: ReadonlyArray<{
      droit: DroitsEditionGitLab
      expireLe: number
      compteur: number
    }>,
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
    if (resultat.statut === 'absent' && (this.options.absenceIndeterminee || plan.operationId.startsWith('ajout-variante-') || plan.operationId.startsWith('retrait-variante-'))) {
      return { statut: 'indetermine', operationId: plan.operationId }
    }
    if (resultat.statut === 'absent') {
      // Le commit n'a jamais existé : le refus est certain, et la libération
      // portera encore la bonne garde.
      this.supprimerJournal(plan.operationId)
      return { statut: 'refuse', raison: 'conflit' }
    }
    for (const transition of transitions) {
      this.adopterBailReconcilie(transition.droit, resultat.commitId, entree)
    }
    this.cloturerConfirmation(plan, resultat.commitId)
    return {
      statut: 'confirme',
      commitId: resultat.commitId,
      compteurBail: transitions[0].compteur,
    }
  }

  /** Un commit reçu ou retrouvé clôt la partie distante.
   *
   *  Une suppression garde son entrée : elle porte le plan local, et celui-ci
   *  n'est appliqué qu'après coup. Les autres natures sont réparables par un
   *  tirage et n'ont plus rien à prouver. */
  private cloturerConfirmation(plan: PlanPublicationGitLab, commitId: string): void {
    if (plan.nature === 'suppression-entretien') {
      try {
        this.options.journal?.marquerConfirmeAInstaller(plan.operationId, commitId)
      } catch {
        /* Sans journal, l'appelant installe tout de même et le tirage suit. */
      }
      return
    }
    if (!this.options.conserverJournalConfirme) this.supprimerJournal(plan.operationId)
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
        // Un déplacement est gardé par son chemin d'origine : c'est là qu'il
        // faut relire, la destination n'existe pas encore.
        const chemin = action.action === 'move'
          ? (action.previous_path as string)
          : action.file_path
        const observe = await this.options.depot.lireGardeFichier(chemin, this.options.branche)
        if (!observe || observe.commitId !== action.last_commit_id) return false
        if (action.action === 'chmod' && observe.executable !== action.execute_filemode) return false
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

/** Une publication porte au moins un droit, et jamais deux fois le même :
 *  acquérir le même droit deux fois donnerait deux transitions concurrentes
 *  sur un seul fichier de bail. */
export function verifierDroitsPublication(
  droits: readonly DroitsEditionGitLab[],
): void {
  if (droits.length === 0 || droits.length > MAX_ACTIONS_PUBLICATION) {
    throw new Error('Droits de publication GitLab invalides.')
  }
  const generations = new Set(droits.map((droit) => droit.generation))
  if (generations.size !== droits.length) {
    throw new Error('Deux droits de publication désignent le même bail.')
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
    if (action.action === 'garde') {
      if (!SHA_COMMIT.test(action.commitId) || typeof action.executable !== 'boolean') {
        throw new Error('Garde GitLab invalide.')
      }
      return {
        action: 'chmod',
        file_path: action.chemin,
        execute_filemode: action.executable,
        last_commit_id: action.commitId,
      }
    }
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
