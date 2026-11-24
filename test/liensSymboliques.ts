import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 *  Indique si ce poste sait créer des liens symboliques.
 *  Sous Windows, il faut le mode développeur ou des droits d'administrateur :
 *  sans eux, les vérifications qui reposent sur des liens sont sautées.
 */
export const liensSymboliquesDisponibles = (() => {
  const dossier = mkdtempSync(join(tmpdir(), 'sonal-liens-'))
  try {
    writeFileSync(join(dossier, 'cible'), '')
    symlinkSync(join(dossier, 'cible'), join(dossier, 'lien'))
    return true
  } catch {
    return false
  } finally {
    rmSync(dossier, { recursive: true, force: true })
  }
})()
