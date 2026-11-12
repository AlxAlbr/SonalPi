import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DemandeOuvertureExterne, OuvertureAuDemarrage } from '../shared/ouvertureFichier'

/** Ignore l'exécutable, l'entrée de développement et les options Electron. */
export function fichiersDesArguments(argv: string[], cwd: string, developpement: boolean): string[] {
  const fichiers: string[] = []
  const optionsAvecValeur = new Set(['--user-data-dir', '--app', '--inspect', '--inspect-brk', '--remote-debugging-port', '--password-store', '--js-flags', '--ozone-platform'])
  let options = true
  const args = argv.slice(developpement ? 2 : 1)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (options && arg === '--') { options = false; continue }
    if (options && arg.startsWith('-')) {
      if (optionsAvecValeur.has(arg)) i++
      continue
    }
    let chemin = arg
    if (arg.startsWith('file:')) {
      try { chemin = fileURLToPath(arg) } catch { continue }
    }
    if (extname(chemin).toLowerCase() === '.crp') fichiers.push(resolve(cwd, chemin))
  }
  return fichiers
}

export function demandeDepuisFichiers(chemins: string[]): DemandeOuvertureExterne | null {
  return chemins.length ? { chemin: chemins[0], multiple: chemins.length > 1 } : null
}

/** Conserve seulement la première demande avant disponibilité de l'interface. */
export class OuvertureInitiale {
  private demande: DemandeOuvertureExterne | null = null
  private demandeRefusee = false

  retenir(demande: DemandeOuvertureExterne | null): void {
    if (!demande) return
    if (this.demande) this.demandeRefusee = true
    else this.demande = demande
  }

  prendre(): OuvertureAuDemarrage {
    const resultat = { demande: this.demande, demandeRefusee: this.demandeRefusee }
    this.demande = null
    this.demandeRefusee = false
    return resultat
  }
}
