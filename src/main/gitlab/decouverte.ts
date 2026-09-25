import type {
  BrancheGitLabPublic,
  ProjetGitLabPublic,
  ResultatDecouverteGitLab,
} from '../../shared/distant'
import { ClientGitLab } from './client'

export interface ConfigurationDecouverteGitLab {
  urlInstance: string
  jeton: string
  taillePage?: number
  nombrePagesMax?: number
  tailleMaxReponseOctets?: number
  fetchImpl?: typeof fetch
}

interface Objet {
  [cle: string]: unknown
}

function estObjet(valeur: unknown): valeur is Objet {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
}

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null
}

function projetPublic(valeur: unknown): ProjetGitLabPublic {
  if (!estObjet(valeur)) throw new Error('Projet GitLab invalide.')
  const id = valeur.id
  const nom = texte(valeur.name)
  const chemin = texte(valeur.path_with_namespace)
  const brancheParDefaut = valeur.default_branch
  if (
    !Number.isSafeInteger(id) ||
    (id as number) <= 0 ||
    !nom ||
    !chemin ||
    (brancheParDefaut !== null && typeof brancheParDefaut !== 'string')
  ) {
    throw new Error('Projet GitLab invalide.')
  }
  return {
    id: id as number,
    nom,
    chemin,
    brancheParDefaut,
    archive: valeur.archived === true,
  }
}

function branchePublique(valeur: unknown): BrancheGitLabPublic {
  if (!estObjet(valeur)) throw new Error('Branche GitLab invalide.')
  const nom = texte(valeur.name)
  if (!nom || typeof valeur.default !== 'boolean') {
    throw new Error('Branche GitLab invalide.')
  }
  return { nom, parDefaut: valeur.default }
}

/** Découverte en lecture des projets et branches accessibles au jeton fourni. */
export class DecouverteGitLab {
  private readonly client: ClientGitLab
  private readonly instance: URL
  private readonly taillePage: number
  private readonly nombrePagesMax: number
  private readonly tailleMaxReponseOctets: number

  constructor(configuration: ConfigurationDecouverteGitLab) {
    this.taillePage = configuration.taillePage ?? 50
    this.nombrePagesMax = configuration.nombrePagesMax ?? 5
    if (
      !Number.isSafeInteger(this.taillePage) ||
      this.taillePage <= 0 ||
      this.taillePage > 100 ||
      !Number.isSafeInteger(this.nombrePagesMax) ||
      this.nombrePagesMax <= 0 ||
      this.nombrePagesMax > 10
    ) {
      throw new Error('Limites de découverte GitLab invalides.')
    }
    this.tailleMaxReponseOctets = configuration.tailleMaxReponseOctets ?? 4 * 1024 * 1024
    this.instance = new URL(configuration.urlInstance)
    this.client = new ClientGitLab({
      urlInstance: configuration.urlInstance,
      jeton: configuration.jeton,
      tailleMaxReponseOctets: this.tailleMaxReponseOctets,
    }, configuration.fetchImpl)
  }

  async listerProjets(): Promise<ResultatDecouverteGitLab<ProjetGitLabPublic>> {
    return this.listerPages(
      '/projects',
      {
        membership: 'true',
        simple: 'true',
        order_by: 'last_activity_at',
        sort: 'desc',
      },
      projetPublic,
    )
  }

  async lireUtilisateur(): Promise<string> {
    const reponse = await this.client.lireJson<{ username?: unknown }>(
      '/user',
      {},
      { tailleMaxOctets: this.tailleMaxReponseOctets },
    )
    if (typeof reponse.corps.username !== 'string' || !reponse.corps.username.trim()) {
      throw new Error('Utilisateur GitLab invalide.')
    }
    return reponse.corps.username.trim()
  }

  async chargerProjet(entree: string): Promise<ProjetGitLabPublic> {
    const chemin = this.cheminProjet(entree)
    const reponse = await this.client.lireJson<unknown>(
      `/projects/${encodeURIComponent(chemin)}`,
      {},
      { tailleMaxOctets: this.tailleMaxReponseOctets },
    )
    return projetPublic(reponse.corps)
  }

  async listerBranches(projetId: number): Promise<ResultatDecouverteGitLab<BrancheGitLabPublic>> {
    if (!Number.isSafeInteger(projetId) || projetId <= 0) {
      throw new Error('Identifiant de projet GitLab invalide.')
    }
    return this.listerPages(
      `/projects/${encodeURIComponent(String(projetId))}/repository/branches`,
      {},
      branchePublique,
    )
  }

  private cheminProjet(entree: string): string {
    const valeur = entree.trim()
    if (!valeur) throw new Error('Adresse du projet GitLab manquante.')
    let chemin = valeur
    if (/^https?:\/\//i.test(valeur)) {
      const url = new URL(valeur)
      if (url.origin !== this.instance.origin) {
        throw new Error('Le projet doit appartenir à l’instance GitLab indiquée.')
      }
      chemin = decodeURIComponent(url.pathname)
    }
    chemin = chemin.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
    const segments = chemin.split('/')
    if (
      !chemin ||
      segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))
    ) {
      throw new Error('Adresse du projet GitLab invalide.')
    }
    return segments.map((segment) => decodeURIComponent(segment)).join('/')
  }

  private async listerPages<T>(
    chemin: string,
    parametres: Record<string, string>,
    convertir: (valeur: unknown) => T,
  ): Promise<ResultatDecouverteGitLab<T>> {
    const elements: T[] = []
    for (let page = 1; page <= this.nombrePagesMax; page += 1) {
      const reponse = await this.client.lireJson<unknown>(chemin, {
        ...parametres,
        page: String(page),
        per_page: String(this.taillePage),
      }, { tailleMaxOctets: this.tailleMaxReponseOctets })
      if (!Array.isArray(reponse.corps)) {
        throw new Error('Réponse de découverte GitLab invalide.')
      }
      elements.push(...reponse.corps.map(convertir))
      if (!reponse.entetes.get('x-next-page')) {
        return { elements, tronque: false }
      }
      if (page === this.nombrePagesMax) {
        return { elements, tronque: true }
      }
    }
    return { elements, tronque: false }
  }
}
