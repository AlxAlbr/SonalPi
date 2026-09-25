import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { verifierCheminGitLab } from './bailGitLab'

const VERSION = 1
const TAILLE_MAX = 3 * 1024 * 1024
const SHA256 = /^[a-f0-9]{64}$/
const CANDIDAT = /^[a-f0-9]{64}\.bin$/

export interface EntreeSessionGitLab {
  version: 1
  destinationId: string
  resourceHash: string
  cheminRelatif: string
  cheminDistant: string
  branche: string
  commitId: string
  baseSha256: string
  candidat: string
  ecritLe: string
}

export interface RepriseSessionGitLab {
  resourceHash: string
  cheminRelatif: string
  cheminDistant: string
  branche: string
  commitId: string
  baseSha256: string
  candidat: string
}

function hacherRessource(ressource: string): string {
  if (!ressource.trim()) throw new Error('Ressource de session GitLab manquante.')
  return createHash('sha256').update(ressource, 'utf8').digest('hex')
}

function hacherContenu(contenu: string): string {
  return createHash('sha256').update(contenu, 'utf8').digest('hex')
}

function ecrireAtomique(fichier: string, contenu: string): void {
  const temporaire = `${fichier}.tmp`
  const descripteur = openSync(temporaire, 'w', 0o600)
  try {
    writeFileSync(descripteur, contenu, 'utf8')
    fsyncSync(descripteur)
  } finally {
    closeSync(descripteur)
  }
  renameSync(temporaire, fichier)
  chmodSync(fichier, 0o600)
  try {
    const dossier = openSync(dirname(fichier), 'r')
    try {
      fsyncSync(dossier)
    } finally {
      closeSync(dossier)
    }
  } catch {
    /* Le fichier reste protégé si le système ne permet pas de synchroniser le dossier. */
  }
}

/** Conserve les copies locales et la base distante d'une session ouverte. */
export class JournalSessionsGitLab {
  private readonly sessions: string
  private readonly candidats: string

  constructor(
    private readonly destinationId: string,
    repertoire: string,
    private readonly maintenant: () => Date = () => new Date(),
  ) {
    if (!destinationId.trim()) throw new Error('Destination de session GitLab manquante.')
    this.sessions = join(repertoire, 'sessions')
    this.candidats = join(repertoire, 'session-candidates')
    mkdirSync(this.sessions, { recursive: true, mode: 0o700 })
    mkdirSync(this.candidats, { recursive: true, mode: 0o700 })
    chmodSync(this.sessions, 0o700)
    chmodSync(this.candidats, 0o700)
  }

  lire(ressource: string): RepriseSessionGitLab | null {
    const resourceHash = hacherRessource(ressource)
    const fichier = this.chemin(resourceHash)
    if (!existsSync(fichier)) return null
    const entree = this.lireFichier(fichier, resourceHash)
    return {
      resourceHash,
      cheminRelatif: entree.cheminRelatif,
      cheminDistant: entree.cheminDistant,
      branche: entree.branche,
      commitId: entree.commitId,
      baseSha256: entree.baseSha256,
      candidat: entree.candidat,
    }
  }

  /** Ajoute une session ouverte sans modifier une reprise déjà conservée. */
  ouvrir(
    ressource: string,
    cheminRelatif: string,
    cheminDistant: string,
    branche: string,
    commitId: string,
    contenuPublie: string,
  ): void {
    const resourceHash = hacherRessource(ressource)
    if (this.lireSiPresent(resourceHash)) return
    this.ecrire(resourceHash, {
      version: VERSION,
      destinationId: this.destinationId,
      resourceHash,
      cheminRelatif,
      cheminDistant,
      branche,
      commitId,
      baseSha256: hacherContenu(contenuPublie),
      candidat: `${resourceHash}.bin`,
      ecritLe: this.maintenant().toISOString(),
    }, contenuPublie)
  }

  /** Actualise la copie locale avant qu'une publication puisse être perdue. */
  majCandidat(ressource: string, contenu: string): void {
    const resourceHash = hacherRessource(ressource)
    const fichier = this.chemin(resourceHash)
    if (!existsSync(fichier)) throw new Error('Session GitLab absente du journal local.')
    this.ecrireCandidat(`${resourceHash}.bin`, contenu)
    const entree = this.lireFichier(fichier, resourceHash)
    entree.candidat = `${resourceHash}.bin`
    entree.ecritLe = this.maintenant().toISOString()
    this.ecrireEntree(fichier, entree)
  }

  /** Confirme une publication et change la base de reprise. */
  confirmerPublication(
    resourceHash: string,
    commitId: string,
    contenuPublie: string,
  ): void {
    const fichier = this.chemin(resourceHash)
    if (!existsSync(fichier)) return
    const entree = this.lireFichier(fichier, resourceHash)
    entree.commitId = commitId
    entree.baseSha256 = hacherContenu(contenuPublie)
    entree.candidat = `${resourceHash}.bin`
    entree.ecritLe = this.maintenant().toISOString()
    this.ecrireCandidat(entree.candidat, contenuPublie)
    this.ecrireEntree(fichier, entree)
  }

  /** Charge la copie locale d'une reprise. */
  chargerCandidat(entree: RepriseSessionGitLab): string {
    const fichier = this.cheminCandidat(entree.candidat)
    if (!existsSync(fichier)) throw new Error('Copie de session GitLab absente.')
    const contenu = readFileSync(fichier, 'utf8')
    if (Buffer.byteLength(contenu, 'utf8') > TAILLE_MAX) {
      throw new Error('Copie de session GitLab trop volumineuse.')
    }
    return contenu
  }

  supprimer(ressource: string): void {
    const resourceHash = hacherRessource(ressource)
    const fichier = this.chemin(resourceHash)
    const entree = this.lireSiPresent(resourceHash)
    if (entree) this.supprimerFichier(this.cheminCandidat(entree.candidat))
    this.supprimerFichier(fichier)
  }

  lister(): RepriseSessionGitLab[] {
    return readdirSync(this.sessions, { withFileTypes: true })
      .filter((entree) => entree.isFile() && entree.name.endsWith('.json'))
      .map((entree) => {
        const resourceHash = entree.name.slice(0, -5)
        const valeur = this.lireFichier(join(this.sessions, entree.name), resourceHash)
        return {
          resourceHash,
          cheminRelatif: valeur.cheminRelatif,
          cheminDistant: valeur.cheminDistant,
          branche: valeur.branche,
          commitId: valeur.commitId,
          baseSha256: valeur.baseSha256,
          candidat: valeur.candidat,
        }
      })
  }

  private lireSiPresent(resourceHash: string): RepriseSessionGitLab | null {
    const fichier = this.chemin(resourceHash)
    return existsSync(fichier) ? this.lireReprise(fichier, resourceHash) : null
  }

  private lireReprise(fichier: string, resourceHash: string): RepriseSessionGitLab {
    const brut = this.lireFichier(fichier, resourceHash)
    return {
      resourceHash,
      cheminRelatif: brut.cheminRelatif,
      cheminDistant: brut.cheminDistant,
      branche: brut.branche,
      commitId: brut.commitId,
      baseSha256: brut.baseSha256,
      candidat: brut.candidat,
    }
  }

  private lireFichier(fichier: string, resourceHash: string): EntreeSessionGitLab {
    const contenu = readFileSync(fichier, 'utf8')
    if (Buffer.byteLength(contenu, 'utf8') > TAILLE_MAX) {
      throw new Error('Entrée de session GitLab trop volumineuse.')
    }
    let brut: unknown
    try {
      brut = JSON.parse(contenu)
    } catch {
      throw new Error('Journal de session GitLab corrompu.')
    }
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
      throw new Error('Entrée de session GitLab invalide.')
    }
    const entree = brut as Partial<EntreeSessionGitLab>
    if (
      entree.version !== VERSION ||
      entree.destinationId !== this.destinationId ||
      entree.resourceHash !== resourceHash ||
      !SHA256.test(resourceHash) ||
      typeof entree.cheminRelatif !== 'string' ||
      typeof entree.cheminDistant !== 'string' ||
      typeof entree.branche !== 'string' ||
      !entree.branche.trim() ||
      typeof entree.commitId !== 'string' ||
      !/^[a-f0-9]{40,64}$/.test(entree.commitId) ||
      typeof entree.baseSha256 !== 'string' ||
      !SHA256.test(entree.baseSha256) ||
      typeof entree.candidat !== 'string' ||
      !CANDIDAT.test(entree.candidat) ||
      typeof entree.ecritLe !== 'string' ||
      !Number.isFinite(Date.parse(entree.ecritLe))
    ) {
      throw new Error('Entrée de session GitLab invalide.')
    }
    verifierCheminGitLab(entree.cheminRelatif)
    verifierCheminGitLab(entree.cheminDistant)
    return entree as EntreeSessionGitLab
  }

  private ecrire(resourceHash: string, entree: EntreeSessionGitLab, candidat: string): void {
    this.ecrireCandidat(entree.candidat, candidat)
    try {
      this.ecrireEntree(this.chemin(resourceHash), entree)
    } catch (erreur) {
      this.supprimerFichier(this.cheminCandidat(entree.candidat))
      throw erreur
    }
  }

  private ecrireEntree(fichier: string, entree: EntreeSessionGitLab): void {
    this.valider(entree)
    ecrireAtomique(fichier, JSON.stringify(entree, null, 2))
  }

  private valider(entree: EntreeSessionGitLab): void {
    if (
      entree.version !== VERSION ||
      entree.destinationId !== this.destinationId ||
      !SHA256.test(entree.resourceHash) ||
      !SHA256.test(entree.baseSha256) ||
      !CANDIDAT.test(entree.candidat)
    ) {
      throw new Error('Entrée de session GitLab invalide.')
    }
  }

  private ecrireCandidat(nom: string, contenu: string): void {
    if (!CANDIDAT.test(nom)) throw new Error('Copie de session GitLab invalide.')
    if (Buffer.byteLength(contenu, 'utf8') > TAILLE_MAX) {
      throw new Error('Copie de session GitLab trop volumineuse.')
    }
    ecrireAtomique(this.cheminCandidat(nom), contenu)
  }

  private chemin(resourceHash: string): string {
    if (!SHA256.test(resourceHash)) throw new Error('Ressource de session GitLab invalide.')
    return join(this.sessions, `${resourceHash}.json`)
  }

  private cheminCandidat(nom: string): string {
    if (!CANDIDAT.test(nom)) throw new Error('Copie de session GitLab invalide.')
    return join(this.candidats, nom)
  }

  private supprimerFichier(fichier: string): void {
    if (existsSync(fichier)) unlinkSync(fichier)
  }
}

export function sha256Session(contenu: string): string {
  return hacherContenu(contenu)
}
