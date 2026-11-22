import { versionSupportee } from './format'

/** Reconnaît le format natif V2 ; les corpus V1 passent par l'import. */
export function versionNativeReconnue(version: unknown): version is number {
  return versionSupportee(version)
}

/** La version du journal ne remplace pas celle des documents qu'il contient. */
export function verifierVersionNative(fichier: unknown, contexte: string): void {
  if (!fichier || typeof fichier !== 'object' || Array.isArray(fichier)
    || !versionNativeReconnue((fichier as Record<string, unknown>).formatVersion)) {
    throw new Error(`Version native non supportée : ${contexte}. Un document au format V2 est attendu.`)
  }
}
