import { closeSync, fsyncSync, openSync } from 'node:fs'

/**
 *  Force l'écriture sur disque du contenu d'un dossier, après un renommage.
 *  Windows et certains systèmes de fichiers refusent cette opération :
 *  le fichier, lui-même déjà synchronisé, reste alors valide.
 */
export function synchroniserDossier(dossier: string): void {
  let descripteur: number | null = null
  try {
    descripteur = openSync(dossier, 'r')
    fsyncSync(descripteur)
  } catch {
    // Synchronisation du dossier impossible sur ce système.
  } finally {
    if (descripteur !== null) closeSync(descripteur)
  }
}
