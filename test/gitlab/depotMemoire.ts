import {
  type ActionCommitGitLab,
  type DepotCommitsGitLab,
  type FichierGitLab,
} from '../../src/main/gitlab/bailGitLab'
import { ErreurEcritureGitLab } from '../../src/main/gitlab/client'

interface Fichier {
  contenu: string
  commitId: string
}

/** Dépôt GitLab de test : garde `last_commit_id` vérifiée, actions appliquées
 *  dans l'ordre, et pannes injectables (avant envoi, après acceptation, refus). */
export class DepotMemoire implements DepotCommitsGitLab {
  readonly fichiers = new Map<string, Fichier>()
  readonly commits: Array<{ id: string; message: string; actions: ActionCommitGitLab[] }> = []
  private compteur = 0
  private echecAvant: unknown = null
  private echecApres: unknown = null
  private statutRefus: number | null = null
  private delaiProchainCommit = 0

  echouerApresAccepter(erreur: unknown): void {
    this.echecApres = erreur
  }

  echouerAvantEnvoyer(erreur: unknown): void {
    this.echecAvant = erreur
  }

  refuser(statut: number): void {
    this.statutRefus = statut
  }

  ralentirProchainCommit(delaiMs: number): void {
    this.delaiProchainCommit = delaiMs
  }

  async lireFichier(chemin: string): Promise<FichierGitLab | null> {
    const fichier = this.fichiers.get(chemin)
    return fichier ? { chemin, ...fichier } : null
  }

  async rechercherCommits(_ref: string, recherche: string): Promise<Array<{ id: string; title: string }>> {
    return this.commits
      .filter((commit) => commit.message.includes(recherche))
      .map((commit) => ({ id: commit.id, title: commit.message }))
      .reverse()
  }

  async publierCommit(
    _branche: string,
    message: string,
    actions: ActionCommitGitLab[],
  ): Promise<{ id: string }> {
    if (this.delaiProchainCommit > 0) {
      const delai = this.delaiProchainCommit
      this.delaiProchainCommit = 0
      await new Promise((resolve) => setTimeout(resolve, delai))
    }
    if (this.echecAvant) {
      const erreur = this.echecAvant
      this.echecAvant = null
      throw erreur
    }
    if (this.statutRefus) {
      const statut = this.statutRefus
      this.statutRefus = null
      throw new ErreurEcritureGitLab(statut, `refus ${statut}`)
    }
    this.validerActions(actions)
    const id = this.nouvelId()
    this.appliquer(actions, id)
    this.commits.push({ id, message, actions })
    if (this.echecApres) {
      const erreur = this.echecApres
      this.echecApres = null
      throw erreur
    }
    return { id }
  }

  modifierHorsProtocole(chemin: string, contenu: string): void {
    const fichier = this.fichiers.get(chemin)
    if (!fichier) throw new Error('Fichier de test absent.')
    this.fichiers.set(chemin, { contenu, commitId: this.nouvelId() })
  }

  private validerActions(actions: ActionCommitGitLab[]): void {
    for (const action of actions) {
      const fichier = this.fichiers.get(action.file_path)
      if (action.action === 'create' && fichier) {
        throw new ErreurEcritureGitLab(400, 'create existant')
      }
      if (action.action !== 'create') {
        if (!fichier || action.last_commit_id !== fichier.commitId) {
          throw new ErreurEcritureGitLab(400, 'garde périmée')
        }
      }
      if (action.action === 'move') {
        const precedent = this.fichiers.get(action.previous_path as string)
        if (!precedent || action.last_commit_id !== precedent.commitId) {
          throw new ErreurEcritureGitLab(400, 'déplacement périmé')
        }
      }
    }
  }

  private appliquer(actions: ActionCommitGitLab[], commitId: string): void {
    for (const action of actions) {
      if (action.action === 'delete') {
        this.fichiers.delete(action.file_path)
      } else if (action.action === 'move') {
        const precedent = this.fichiers.get(action.previous_path as string) as Fichier
        this.fichiers.delete(action.previous_path as string)
        this.fichiers.set(action.file_path, { ...precedent, commitId })
      } else {
        this.fichiers.set(action.file_path, {
          contenu: action.content as string,
          commitId,
        })
      }
    }
  }

  private nouvelId(): string {
    this.compteur += 1
    return this.compteur.toString(16).padStart(40, '0')
  }
}
