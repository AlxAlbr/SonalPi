import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { verifierCheminGitLab } from './bailGitLab'
import type { StockageLocalSessionGitLab } from './session'

/** Stocke le JSON local d'un entretien par remplacement atomique. */
export class StockageLocalEntretienGitLab implements StockageLocalSessionGitLab {
  private readonly fichier: string

  constructor(
    dirLocal: string,
    cheminRelatif: string,
  ) {
    verifierCheminGitLab(cheminRelatif)
    this.fichier = join(dirLocal, cheminRelatif)
  }

  async lire(): Promise<string> {
    return readFileSync(this.fichier, 'utf8')
  }

  async ecrire(contenu: string): Promise<void> {
    if (typeof contenu !== 'string') throw new Error('Contenu local GitLab invalide.')
    mkdirSync(dirname(this.fichier), { recursive: true })
    const temporaire = `${this.fichier}.session.tmp`
    const descripteur = openSync(temporaire, 'w', 0o600)
    try {
      writeFileSync(descripteur, contenu, 'utf8')
      fsyncSync(descripteur)
    } finally {
      closeSync(descripteur)
    }
    renameSync(temporaire, this.fichier)
    chmodSync(this.fichier, 0o600)
  }
}
