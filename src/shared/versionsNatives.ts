import { FORMAT_VERSION } from './format'

/** Les formats natifs de développement ne sont pas convertis à l'ouverture. */
export function versionNativeReconnue(version: unknown): version is number {
  return version === FORMAT_VERSION
}

/** La version du journal ne remplace pas celle des documents qu'il contient. */
export function verifierVersionNative(fichier: unknown, contexte: string): void {
  if (!fichier || typeof fichier !== 'object' || Array.isArray(fichier)
    || !versionNativeReconnue((fichier as Record<string, unknown>).formatVersion)) {
    throw new Error(`Version native non supportée : ${contexte}. Recréez les corpus des anciennes versions de développement.`)
  }
}
