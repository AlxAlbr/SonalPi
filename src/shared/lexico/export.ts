import type { LigneLexico } from './types'

export type FormatExportLexico = 'csv' | 'tsv'

function securiserCellule(valeur: string): string {
  return /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur
}

function echapper(valeur: string, separateur: string): string {
  const sure = securiserCellule(valeur)
  if (sure.includes(separateur) || /["\r\n]/.test(sure)) return `"${sure.replaceAll('"', '""')}"`
  return sure
}

/** Exporte le tableau et son périmètre dans un fichier lisible indépendamment de l'application. */
export function exporterTableauLexico(
  lignes: LigneLexico[],
  criteres: string[],
  format: FormatExportLexico,
  date = new Date(),
): string {
  const separateur = format === 'csv' ? ',' : '\t'
  const ligne = (cellules: Array<string | number>) => cellules
    .map((cellule) => echapper(String(cellule), separateur)).join(separateur)
  const contenu = [
    ligne(['Analyse Lexico']),
    ligne(['Calcul', date.toISOString()]),
    ...criteres.map((critere) => ligne(['Critère', critere])),
    '',
    ligne(['Forme', 'Occurrences', 'Entretiens']),
    ...lignes.map((item) => ligne([item.forme, item.occurrences, item.entretiens])),
  ].join('\r\n')
  return format === 'csv' ? `\uFEFF${contenu}` : contenu
}
