import type {
  DemandePreparationProjetGitLab,
  ProjetGitLabPrepare,
} from '../../shared/gitlab'
import { ClientGitLab } from './client'

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
}

function adresseProjet(entree: string): { urlInstance: string; chemin: string } {
  try {
    const url = new URL(entree.trim())
    if (url.username || url.password || url.search || url.hash) throw new Error()
    const chemin = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
    const segments = chemin.split('/').map(decodeURIComponent)
    if (
      segments.length < 2 ||
      segments.some((segment) =>
        !segment || segment === '.' || segment === '..' || segment === '-' || /[/\\]/.test(segment))
    ) {
      throw new Error()
    }
    return { urlInstance: url.origin, chemin: segments.join('/') }
  } catch {
    throw new Error('Adresse du projet GitLab invalide. Copiez l’adresse de la page du projet.')
  }
}

/** Vérifie le projet et son utilisateur sans écrire ni enregistrer de destination. */
export async function preparerProjetGitLab(
  demande: DemandePreparationProjetGitLab,
  fetchImpl: typeof fetch = fetch,
): Promise<ProjetGitLabPrepare> {
  const { urlInstance, chemin } = adresseProjet(demande.urlProjet)
  const client = new ClientGitLab({
    urlInstance,
    jeton: demande.jeton,
    tailleMaxReponseOctets: 4 * 1024 * 1024,
  }, fetchImpl)
  const { corps: projet } = await client.lireJson<unknown>(`/projects/${encodeURIComponent(chemin)}`)
  if (
    !estObjet(projet) ||
    !Number.isSafeInteger(projet.id) || (projet.id as number) <= 0 ||
    typeof projet.name !== 'string' || !projet.name.trim() ||
    typeof projet.archived !== 'boolean' ||
    (projet.default_branch !== null && typeof projet.default_branch !== 'string')
  ) {
    throw new Error('Projet GitLab invalide.')
  }
  if (projet.archived) {
    throw new Error('Ce projet GitLab est archivé et ne peut pas être utilisé.')
  }
  if (typeof projet.default_branch !== 'string' || !projet.default_branch.trim()) {
    throw new Error('Ce projet GitLab n’a pas de branche par défaut. Initialisez le dépôt dans GitLab, par exemple avec un README.')
  }
  const { corps: utilisateur } = await client.lireJson<unknown>('/user')
  if (!estObjet(utilisateur) || typeof utilisateur.username !== 'string' || !utilisateur.username.trim()) {
    throw new Error('Utilisateur GitLab invalide.')
  }
  return {
    urlInstance,
    utilisateur: utilisateur.username.trim(),
    projetId: projet.id as number,
    nomProjet: projet.name.trim(),
    branche: projet.default_branch,
  }
}
