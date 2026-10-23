import type { DiagnosticSynthese, ExtraitSynthese } from './types'

export interface ExportSynthese {
  titre: string
  date: Date
  criteres: string[]
  extraits: ExtraitSynthese[]
  diagnostics: DiagnosticSynthese[]
  nomTheme: (id: string) => string
}

/** Produit un document texte autonome à partir de la collection affichée. */
export function exporterSyntheseTxt(donnees: ExportSynthese): string {
  const lignes = [
    donnees.titre,
    `Calcul du ${donnees.date.toLocaleString('fr-FR')}`,
    '',
    'Critères',
    ...donnees.criteres.map((ligne) => `- ${ligne}`),
    '',
    donnees.diagnostics.length ? 'Résultat incomplet' : 'Résultat complet',
  ]
  for (const diagnostic of donnees.diagnostics) lignes.push(`- ${diagnostic.titre} : ${diagnostic.message}`)
  let entretien = ''
  for (const extrait of donnees.extraits) {
    if (extrait.entretienId !== entretien) {
      entretien = extrait.entretienId
      lignes.push('', `## ${extrait.titreEntretien}`)
    }
    const themes = extrait.themeIds.map(donnees.nomTheme).join(', ')
    lignes.push('', `[${extrait.from}–${extrait.to}]${extrait.locuteurs.length ? ` ${extrait.locuteurs.join(', ')}` : ''}${themes ? ` — ${themes}` : ''}`)
    lignes.push(extrait.texte)
  }
  return `${lignes.join('\n')}\n`
}
