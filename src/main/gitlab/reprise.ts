/**
 *  Reprise des opérations GitLab au démarrage d'une destination.
 *
 *  Un arrêt peut survenir à quatre endroits : avant l'envoi, après l'envoi
 *  sans réponse, après la confirmation mais avant l'archivage local, ou au
 *  milieu de cet archivage. Le premier laisse tout intact, le deuxième se
 *  retrouve par l'historique sans jamais rejouer le commit, le troisième et
 *  le quatrième passent tous deux par le plan local que l'entrée porte.
 *
 *  L'ordre est donc imposé : la transaction locale déjà commencée d'abord,
 *  puis les publications composites, et seulement ensuite le tirage normal —
 *  qui ne saurait pas où sont les sauvegardes et les PNG d'un entretien retiré.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CorpusStore } from '../corpusStore'
import type { PlanSuppressionEntretien } from '../transactionsFichiers'
import {
  cheminBailDepuisEmpreinteGitLab,
  type BailGitLab,
  type DepotCommitsGitLab,
} from './bailGitLab'
import {
  ReconciliateurPublicationGitLab,
  type EntreeJournalPublication,
  type JournalPublicationGitLab,
} from './journalPublication'
import type { JournalSessionsGitLab } from './journalSession'

export interface OptionsRepriseGitLab {
  depot: DepotCommitsGitLab
  coordination: BailGitLab
  journal: JournalPublicationGitLab
  /** Le cas échéant, la session correspondante est confirmée par son journal. */
  journalSessions?: JournalSessionsGitLab
  /** Miroir de la destination : c'est là que les archives locales s'écrivent. */
  dirMiroir: string
  /** Trace lisible dans la console, comme le reste du cycle de vie GitLab. */
  trace?: (message: string) => void
}

/** Vérifie les ajouts sans répéter un envoi dont l’issue reste inconnue. */
export async function reprendreAjoutsVarianteGitLab(options: OptionsRepriseGitLab): Promise<void> {
  const reconciliateur = new ReconciliateurPublicationGitLab(options.depot, options.journal)
  for (const entree of options.journal.lister().filter((e) => e.operationId.startsWith('ajout-variante-'))) {
    await reconcilierPublication(entree, options, reconciliateur)
  }
  if (options.journal.lister().some((e) => e.operationId.startsWith('ajout-variante-'))) {
    throw new Error('L’ajout de variante n’a pas pu être vérifié. Aucun nouvel envoi autorisé ; actualisez ou rouvrez ce corpus.')
  }
}

export async function reprendreOperationsGitLab(options: OptionsRepriseGitLab): Promise<void> {
  repriseLocale(options.dirMiroir)
  const reconciliateur = new ReconciliateurPublicationGitLab(options.depot, options.journal)
  for (const entree of options.journal.lister()) {
    // Ces transformations textuelles ont leur suivi et n’héritent pas de droits anciens.
    if (entree.operationId.startsWith('suppression-anon-') || entree.operationId.startsWith('retrait-variante-')) continue
    await reconcilierPublication(entree, options, reconciliateur)
  }
  if (options.journal.lister().some((e) => e.operationId.startsWith('ajout-variante-'))) {
    throw new Error('L’ajout de variante reste indéterminé. Rouvrez ce corpus pour vérifier son issue, sans répéter l’ajout.')
  }
}

/** Termine une transaction locale laissée ouverte par un arrêt précédent. */
function repriseLocale(dirMiroir: string): void {
  new CorpusStore(dirMiroir).reprendreTransactionFichiers()
}

/** Réconcilie une publication retrouvée, selon sa nature.
 *
 *  Une session d'entretien confirme son journal de session. Une transaction de
 *  corpus ne confirme JAMAIS un journal de session : son état publié sera
 *  installé par le tirage normal, qui remplace le miroir d'un seul tenant. Une
 *  suppression confirmée est au contraire installée tout de suite : ses
 *  sauvegardes et ses PNG n'ont pas d'autre chemin que le plan local qu'elle
 *  porte. Une opération certainement absente peut être abandonnée ; une
 *  opération encore indéterminée reste journalisée et bloque sa ressource. */
async function reconcilierPublication(
  entree: EntreeJournalPublication,
  options: OptionsRepriseGitLab,
  reconciliateur: ReconciliateurPublicationGitLab,
): Promise<void> {
  const resultat = await reconciliateur.reconcilier(entree)
  if (resultat.statut === 'indetermine' || (entree.operationId.startsWith('ajout-variante-') && resultat.statut !== 'confirme')) return
  const commitId = resultat.statut === 'confirme' ? resultat.commitId : null
  if (commitId && entree.nature === 'session-entretien' && options.journalSessions) {
    const action = options.journal.chargerActions(entree).find(
      (candidat) => candidat.action === 'update' || candidat.action === 'create')
    if (action?.content !== undefined) {
      options.journalSessions.confirmerPublication(
        entree.droits[0].resourceHash,
        commitId,
        action.content,
      )
    }
  }
  if (commitId && entree.nature === 'suppression-entretien' && entree.suppression) {
    installerSuppression(entree.suppression.planLocal, options.dirMiroir)
    options.journal.marquerConfirmeAInstaller(entree.operationId, commitId)
  }
  // Un ajout ne rend que les droits acquis par cette instance.
  // Les autres parcours gardent leur reprise existante.
  for (const droit of entree.droits) {
    const chemin = cheminBailDepuisEmpreinteGitLab(droit.resourceHash)
    const rendu = entree.operationId.startsWith('ajout-variante-')
      ? await options.coordination.rendreBailAcquis(chemin, droit.generation)
      : await options.coordination.rendreBailNotre(chemin, droit.generation)
    if (rendu === 'libere') {
      options.trace?.(
        `[GitLab] bail de ${droit.resourceHash.slice(0, 12)} rendu au démarrage `
        + `(${entree.operationId}).`,
      )
    }
  }
  options.journal.supprimer(entree.operationId)
}

/** Applique l'archivage local d'une suppression confirmée.
 *
 *  Le plan est idempotent : un arrêt au milieu de l'application se termine au
 *  prochain démarrage, et un corpus qui ne correspond ni à l'avant ni à l'après
 *  n'est jamais écrasé. */
function installerSuppression(plan: PlanSuppressionEntretien, dirMiroir: string): void {
  if (!existsSync(join(dirMiroir, 'corpus.json'))) {
    throw new Error(
      'La suppression GitLab ne peut pas reprendre : corpus.json est absent du miroir local.',
    )
  }
  new CorpusStore(dirMiroir).appliquerTransactionFichiers(plan)
}
