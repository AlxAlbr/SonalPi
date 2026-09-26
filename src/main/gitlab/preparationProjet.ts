import type {
  DemandePreparationProjetGitLab,
  ProjetGitLabPrepare,
} from '../../shared/gitlab'
import type { ServiceAuthentificationGitLab } from './authentification'

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
}

/** Chemin du projet dans son instance, déduit de l'adresse de sa page. */
function cheminProjet(entree: string): string {
  try {
    const url = new URL(entree.trim())
    if (url.username || url.password || url.search || url.hash) throw new Error()
    const hoteLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && hoteLocal)) throw new Error()
    const chemin = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
    const segments = chemin.split('/').map(decodeURIComponent)
    if (
      segments.length < 2 ||
      segments.some((segment) =>
        !segment || segment === '.' || segment === '..' || segment === '-' || /[/\\]/.test(segment))
    ) {
      throw new Error()
    }
    return segments.join('/')
  } catch {
    throw new Error('Adresse du projet GitLab invalide. Copiez l’adresse de la page du projet.')
  }
}

/** Vérifie le projet et sa branche par défaut, sans rien enregistrer. */
export async function preparerProjetGitLab(
  demande: DemandePreparationProjetGitLab,
  authentification: ServiceAuthentificationGitLab,
): Promise<ProjetGitLabPrepare> {
  const chemin = cheminProjet(demande.urlProjet)
  const compte = authentification.comptePublic(demande.compteId)
  // Le projet doit appartenir à l'instance du compte connecté : aucun token ne
  // part vers un autre serveur que celui pour lequel il a été délivré.
  if (hoteDe(demande.urlProjet) !== hoteDe(compte.urlInstance)) {
    throw new Error(
      'Ce projet n’est pas sur l’instance GitLab du compte connecté. ' +
      'Connectez-vous à l’instance qui l’héberge.',
    )
  }
  const client = await authentification.client(demande.compteId)
  const { corps: projet } = await client.lireJson<unknown>(
    `/projects/${encodeURIComponent(chemin)}`,
    undefined,
    { tailleMaxOctets: 4 * 1024 * 1024 },
  )
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
  return {
    compteId: demande.compteId,
    urlInstance: compte.urlInstance,
    utilisateur: compte.utilisateur,
    projetId: projet.id as number,
    nomProjet: projet.name.trim(),
    branche: projet.default_branch,
  }
}

function hoteDe(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
