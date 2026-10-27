/** Documents conservés sans conversion lors d'une migration. */
export const DOSSIER_AUTRES_MIGRATION = 'Autres'

export interface FichierAutreMigration {
  cheminSource: string
  cheminDestination: string
  taille: number
  sha256: string
  stockageSource?: 'git' | 'lfs'
}

export interface FichierNonReprisMigration {
  chemin: string
  raison: string
}

export interface ConservationMigration {
  autres: FichierAutreMigration[]
  nonRepris: FichierNonReprisMigration[]
  autresCorpus: number
  avertissements: string[]
}

export interface BilanFichiersMigrationLocale extends ConservationMigration {
  bilanId: string
}

/** Écarte les fichiers techniques et les accès, sans interpréter les documents. */
export function raisonExclusionMigration(chemin: string): string | null {
  const segments = chemin.replace(/\\/g, '/').split('/')
  if (segments.some((nom) => /^(?:\.git|\.hg|\.svn|node_modules|\.cache|__pycache__|\.sonal)$/i.test(nom)) ||
    /^(?:\.gitignore|\.gitattributes|\.gitmodules|\.DS_Store|Thumbs\.db)$/i.test(segments.at(-1) ?? '')) {
    return 'Fichier ou dossier technique.'
  }
  if (segments.some((nom) => /^(?:\.ssh|\.gnupg|\.env(?:\..*)?|\.npmrc|\.netrc|credentials(?:\..*)?|comptes(?:\..*)?|id_rsa|id_ed25519)$/i.test(nom)) ||
    /\.(?:pem|key|p12|pfx|kdbx|token)$/i.test(segments.at(-1) ?? '')) {
    return 'Fichier pouvant contenir des accès ou des secrets.'
  }
  if (!cheminMigrationSain(chemin)) return 'Nom incompatible avec le nouveau dossier.'
  return null
}

export function cheminMigrationSain(chemin: string): boolean {
  return !!chemin && !chemin.startsWith('/') && !/[\\\u0000-\u001f\u007f<>:"|?*]/.test(chemin) &&
    chemin.split('/').every((nom) => !!nom && nom !== '.' && nom !== '..' && !/[. ]$/.test(nom) &&
      !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(nom))
}

export function estDestinationAutreMigration(chemin: string): boolean {
  return chemin.startsWith(`${DOSSIER_AUTRES_MIGRATION}/`) && cheminMigrationSain(chemin) &&
    !raisonExclusionMigration(chemin.slice(DOSSIER_AUTRES_MIGRATION.length + 1))
}
