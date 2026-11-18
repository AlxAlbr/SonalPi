/** Versions natives reconnues, y compris celles migrées à l'ouverture. */
const VERSIONS_NATIVES_RECONNUES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export function versionNativeReconnue(version: unknown): version is number {
  return typeof version === 'number' && VERSIONS_NATIVES_RECONNUES.includes(version)
}

/** Vérifie le fichier embarqué, indépendamment de la version de son journal. */
export function verifierVersionNative(fichier: unknown, contexte: string): void {
  if (!fichier || typeof fichier !== 'object' || Array.isArray(fichier)
    || !versionNativeReconnue((fichier as Record<string, unknown>).formatVersion)) {
    throw new Error(`Version native non supportée : ${contexte}.`)
  }
}
