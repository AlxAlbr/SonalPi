import type {
  CelluleAnalyseCroisee,
  DiagnosticAnalyseCroisee,
  MesureAnalyseCroisee,
  TotauxAnalyseCroisee,
} from './types'

export interface EntreeExportAnalyseCroisee {
  id: string
  nom: string
}

export interface OptionsExportAnalyseCroisee {
  format: 'csv' | 'tsv'
  disposition: 'large' | 'long'
  mesure: MesureAnalyseCroisee
  date: Date
  themes: EntreeExportAnalyseCroisee[]
  entretiens: EntreeExportAnalyseCroisee[]
  cellules: CelluleAnalyseCroisee[]
  sourcesIndisponibles?: string[]
  diagnostics?: DiagnosticAnalyseCroisee[]
  totaux?: TotauxAnalyseCroisee
}

const libellesMesure: Record<MesureAnalyseCroisee, string> = {
  passages: 'Passages',
  volume: 'Volume (caractères source)',
  couverture: 'Couverture (%)',
}

function echapper(valeur: unknown, separateur: string): string {
  const texte = valeur === null || valeur === undefined ? '' : String(valeur)
  return texte.includes(separateur) || /["\r\n]/.test(texte)
    ? `"${texte.replaceAll('"', '""')}"`
    : texte
}

function decimal(valeur: number, format: OptionsExportAnalyseCroisee['format']): string {
  const texte = valeur.toFixed(2)
  return format === 'tsv' ? texte.replace('.', ',') : texte
}

function valeurCellule(
  cellule: CelluleAnalyseCroisee | undefined,
  mesure: MesureAnalyseCroisee,
  format: OptionsExportAnalyseCroisee['format'],
): string | number {
  if (!cellule) return ''
  if (mesure === 'couverture') return cellule.couverture === null ? '' : decimal(cellule.couverture, format)
  return cellule[mesure]
}

/** Produit un tableau autonome sans transcription ni donnée personnelle. */
export function exporterAnalyseCroisee(options: OptionsExportAnalyseCroisee): string {
  const separateur = options.format === 'csv' ? ',' : '\t'
  const lignes: unknown[][] = [
    ['Analyses croisées'],
    ['Date', options.date.toISOString()],
    ['Mesure', libellesMesure[options.mesure]],
    ['État', options.sourcesIndisponibles?.length || options.diagnostics?.length ? 'Incomplet' : 'Complet'],
    ['Avertissement', 'Les thèmes peuvent se superposer ; leurs valeurs ne sont pas nécessairement additionnables.'],
    ['Sources contributrices', options.entretiens.filter((item) => !options.sourcesIndisponibles?.includes(item.id)).map((item) => item.nom).join(' | ')],
  ]
  for (const diagnostic of options.diagnostics ?? []) {
    linesDiagnostic(lignes, diagnostic)
  }
  lignes.push([])
  const parCle = new Map(options.cellules.map((item) => [`${item.themeId}\u0000${item.entretienId}`, item]))
  if (options.disposition === 'large') {
    lignes.push(['Thème', ...options.entretiens.map((item) => item.nom), 'Total'])
    for (const theme of options.themes) {
      const cellules = options.entretiens.map((entretien) => parCle.get(`${theme.id}\u0000${entretien.id}`))
      const totalCalcule = options.totaux?.lignes[theme.id]?.[options.mesure]
      const total = totalCalcule !== undefined && totalCalcule !== null
        ? (options.mesure === 'couverture' ? decimal(totalCalcule, options.format) : totalCalcule)
        : options.mesure === 'couverture' || cellules.some((item) => !item)
          ? ''
          : cellules.reduce<number>((somme, item) => somme + (item?.[options.mesure] as number ?? 0), 0)
      lignes.push([theme.nom, ...cellules.map((item) => valeurCellule(item, options.mesure, options.format)), total])
    }
  } else {
    lignes.push(['Thème', 'Entretien', 'Passages', 'Volume (caractères source)', 'Couverture (%)', 'État'])
    for (const theme of options.themes) {
      for (const entretien of options.entretiens) {
        const item = parCle.get(`${theme.id}\u0000${entretien.id}`)
        lignes.push([
          theme.nom,
          entretien.nom,
          item?.passages ?? '',
          item?.volume ?? '',
          item?.couverture === null || item?.couverture === undefined ? '' : decimal(item.couverture, options.format),
          item ? 'Disponible' : 'Source indisponible',
        ])
      }
    }
  }
  return `\uFEFF${lignes.map((ligne) => ligne.map((item) => echapper(item, separateur)).join(separateur)).join('\r\n')}\r\n`
}

function linesDiagnostic(lignes: unknown[][], diagnostic: DiagnosticAnalyseCroisee): void {
  lignes.push(['Diagnostic', diagnostic.titre, diagnostic.message])
}
