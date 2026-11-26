import { closeSync, fsyncSync, openSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

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

/**
 *  Remplace un fichier par un nouveau contenu, sans risque de le perdre.
 *  Le contenu est forcé sur disque avant le renommage :
 *  sans cela, un arrêt brutal de Windows peut laisser un fichier rempli de zéros.
 */
export function ecrireFichierDurable(fichier: string, contenu: string): void {
  const temporaire = `${fichier}.tmp`
  const descripteur = openSync(temporaire, 'w')
  try {
    writeFileSync(descripteur, contenu, 'utf8')
    fsyncSync(descripteur)
  } finally {
    closeSync(descripteur)
  }
  renameSync(temporaire, fichier)
  synchroniserDossier(dirname(fichier))
}
