import type {
  EntreeLectureDistante,
  LectureDistante,
} from '../distant/lecture'
import { ClientGitLab } from './client'

interface BrancheGitLab {
  commit?: { id?: string }
}

interface EntreeArbreGitLab {
  id: string
  name: string
  type: 'blob' | 'tree' | 'commit'
  path: string
  mode: string
}

const SHA_COMMIT = /^[0-9a-f]{40}$/i
const TAILLE_PAGE = 100
const MAX_PAGES = 10_000

function verifierChemin(chemin: string, autoriserRacine = false): void {
  if (autoriserRacine && chemin === '') return
  if (
    !chemin ||
    chemin.startsWith('/') ||
    chemin.includes('\\') ||
    chemin.includes('\0') ||
    chemin.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Chemin GitLab invalide : ${chemin}.`)
  }
}

/** Lecture d'un dépôt GitLab figée sur un commit résolu avant l'inventaire. */
export class LecteurGitLab implements LectureDistante {
  constructor(
    private readonly client: ClientGitLab,
    public readonly commit: string,
    private readonly racine = '',
  ) {
    if (!SHA_COMMIT.test(commit)) throw new Error('Commit GitLab invalide.')
    verifierChemin(racine, true)
  }

  static async depuisBranche(
    client: ClientGitLab,
    branche: string,
    racine = '',
  ): Promise<LecteurGitLab> {
    if (!branche.trim()) throw new Error('Branche GitLab manquante.')
    const { corps } = await client.lireJson<BrancheGitLab>(
      client.cheminProjet(`/repository/branches/${encodeURIComponent(branche)}`),
    )
    const commit = corps.commit?.id
    if (!commit || !SHA_COMMIT.test(commit)) {
      throw new Error('La branche GitLab ne fournit pas de commit valide.')
    }
    return new LecteurGitLab(client, commit, racine)
  }

  async inventorier(dossierRelatif: string): Promise<EntreeLectureDistante[]> {
    verifierChemin(dossierRelatif, true)
    const dossierDepot = this.cheminDepot(dossierRelatif)
    const prefixe = dossierDepot ? `${dossierDepot}/` : ''
    const resultat: EntreeLectureDistante[] = []
    const chemins = new Set<string>()

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const reponse = await this.client.lireJson<EntreeArbreGitLab[]>(
        this.client.cheminProjet('/repository/tree'),
        {
          ref: this.commit,
          path: dossierDepot || undefined,
          recursive: 'false',
          per_page: String(TAILLE_PAGE),
          page: String(page),
        },
      )
      if (!Array.isArray(reponse.corps)) throw new Error('Inventaire GitLab invalide.')

      for (const entree of reponse.corps) {
        verifierChemin(entree.path)
        const relatif = entree.path.startsWith(prefixe)
          ? entree.path.slice(prefixe.length)
          : ''
        if (!relatif || relatif.includes('/')) {
          throw new Error(`Entrée GitLab hors du dossier demandé : ${entree.path}.`)
        }
        if (entree.type === 'commit' || entree.mode === '160000') {
          throw new Error(`Sous-module GitLab non supporté : ${entree.path}.`)
        }
        if (entree.mode === '120000') {
          throw new Error(`Lien symbolique GitLab non supporté : ${entree.path}.`)
        }
        if (entree.type !== 'blob' && entree.type !== 'tree') {
          throw new Error(`Type d'entrée GitLab non supporté : ${entree.path}.`)
        }
        if (chemins.has(entree.path)) {
          throw new Error(`Entrée GitLab dupliquée : ${entree.path}.`)
        }
        chemins.add(entree.path)
        resultat.push({
          chemin: relatif,
          dossier: entree.type === 'tree',
          empreinte: entree.type === 'blob'
            ? { type: 'gitlab-blob', valeur: entree.id }
            : null,
        })
      }

      const suivante = reponse.entetes.get('x-next-page')?.trim()
      if (!suivante) return resultat
      const pageSuivante = Number(suivante)
      if (!Number.isSafeInteger(pageSuivante) || pageSuivante <= page) {
        throw new Error('Pagination GitLab invalide.')
      }
      page = pageSuivante - 1
    }
    throw new Error('Inventaire GitLab trop volumineux.')
  }

  async lireTexte(cheminRelatif: string): Promise<string> {
    verifierChemin(cheminRelatif)
    const cheminDepot = this.cheminDepot(cheminRelatif)
    return this.client.lireTexte(
      this.client.cheminProjet(
        `/repository/files/${encodeURIComponent(cheminDepot)}/raw`,
      ),
      { ref: this.commit },
    )
  }

  private cheminDepot(cheminRelatif: string): string {
    return [this.racine, cheminRelatif].filter(Boolean).join('/')
  }
}

/** Résout la branche une fois par tirage : le miroir et l'observation des bails
 *  décrivent alors le même commit, sans seconde résolution de tête. */
export class InstantaneLectureGitLab {
  private lecteur: LecteurGitLab | null = null

  constructor(
    private readonly client: ClientGitLab,
    private readonly branche: string,
    private readonly racine = '',
  ) {}

  async ouvrir(): Promise<LecteurGitLab> {
    this.lecteur = this.lecteur
      ?? await LecteurGitLab.depuisBranche(this.client, this.branche, this.racine)
    return this.lecteur
  }

  /** Lecteur à la racine du dépôt, figé sur le même commit : les fichiers de
   *  coordination vivent hors du dossier du corpus, même quand il est imbriqué. */
  async racineDepot(): Promise<LecteurGitLab> {
    const lecteur = await this.ouvrir()
    return this.racine ? new LecteurGitLab(this.client, lecteur.commit) : lecteur
  }

  /** Ferme l'instantané : le tirage suivant résousera un nouveau commit. */
  oublier(): void {
    this.lecteur = null
  }
}
