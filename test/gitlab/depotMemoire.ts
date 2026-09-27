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
  /** Nombre de lectures de contenu par chemin : une préparation ne relit
   *  jamais deux fois la même source. */
  readonly lectures = new Map<string, number>()
  /** Nombre maximal de commits menés de front : la file doit le tenir à un. */
  readonly plusGrandEnvol = { valeur: 0 }
  private compteur = 0
  private commitsIllisibles = false
  /** Rappel exécuté avant la validation d'un commit : un banc peut y faire
   *  bouger une garde sans passer par le protocole, comme le ferait un autre poste. */
  avantCommit: (actions: readonly ActionCommitGitLab[]) => void = () => {}
  private enVol = 0
  private tete = this.sha()
  private echecAvant: unknown = null
  private echecApres: unknown = null
  private statutRefus: number | null = null
  private delaiProchainCommit = 0

  /** Remplit le dépôt d'un coup, comme un dépôt déjà peuplé. */
  charger(fichiers: Map<string, string>): void {
    this.compteur = 1
    this.lectures.clear()
    for (const [chemin, contenu] of fichiers) {
      this.fichiers.set(chemin, { contenu, commitId: this.sha() })
    }
    this.tete = this.sha()
  }

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

  async lireFichier(chemin: string, _ref?: string): Promise<FichierGitLab | null> {
    this.lectures.set(chemin, (this.lectures.get(chemin) ?? 0) + 1)
    const fichier = this.fichiers.get(chemin)
    return fichier ? { chemin, ...fichier } : null
  }

  async lireContenuBrut(chemin: string, _ref?: string): Promise<string | null> {
    return this.fichiers.get(chemin)?.contenu ?? null
  }

  async resoudreTete(_branche: string): Promise<string> {
    return this.tete
  }

  /** L'historique des commits devient illisible : la réconciliation ne peut
   *  plus conclure, et l'entrée reste journalisée. */
  rendreCommitsIllisibles(): void {
    this.commitsIllisibles = true
  }

  /** L'historique redevient lisible : c'est le redémarrage de l'application. */
  rendreCommits(): void {
    this.commitsIllisibles = false
  }

  async rechercherCommits(_ref: string, recherche: string): Promise<Array<{ id: string; title: string }>> {
    if (this.commitsIllisibles) throw new Error('historique indisponible')
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
    this.enVol += 1
    this.plusGrandEnvol.valeur = Math.max(this.plusGrandEnvol.valeur, this.enVol)
    try {
      await new Promise((resolve) => setTimeout(resolve, this.delaiProchainCommit))
    } finally {
      this.enVol -= 1
    }
    this.delaiProchainCommit = 0
    if (this.echecAvant) {
      const erreur = this.echecAvant
      this.echecAvant = null
      throw erreur
    }
    this.avantCommit(actions)
    if (this.statutRefus) {
      const statut = this.statutRefus
      this.statutRefus = null
      throw new ErreurEcritureGitLab(statut, `refus ${statut}`)
    }
    this.validerActions(actions)
    const id = this.nouvelId()
    this.appliquer(actions, id)
    this.tete = id
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

  /** Dépose un fichier sans passer par un commit : c'est ainsi qu'un banc met
   *  en place l'état d'un autre poste (un bail repris, une archive existante). */
  deposerHorsProtocole(chemin: string, contenu: string): void {
    this.fichiers.set(chemin, { contenu, commitId: this.nouvelId() })
  }

  /** Trace les refus : un banc doit dire quelle garde a été trouvée périmée. */
  /** Un déplacement est gardé par son chemin d'origine, et sa destination
   *  doit être libre : GitLab ne weighs jamais une archive existante. */
  private validerActions(actions: ActionCommitGitLab[]): void {
    for (const action of actions) {
      if (action.action === 'move') {
        const precedent = this.fichiers.get(action.previous_path as string)
        if (!precedent || action.last_commit_id !== precedent.commitId) {
          throw new ErreurEcritureGitLab(400, 'déplacement périmé')
        }
        if (this.fichiers.has(action.file_path)) {
          throw new ErreurEcritureGitLab(400, 'archive déjà occupée')
        }
        continue
      }
      const fichier = this.fichiers.get(action.file_path)
      if (action.action === 'create' && fichier) {
        throw new ErreurEcritureGitLab(400, 'create existant')
      }
      if (action.action !== 'create' && (!fichier || action.last_commit_id !== fichier.commitId)) {
        throw new ErreurEcritureGitLab(400, 'garde périmée')
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

  private sha(): string {
    return this.nouvelId()
  }
}
