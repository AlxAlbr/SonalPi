import type { FiltresLexico, ContexteSelectionLexico, LigneLexico, OccurrenceLexico, SelectionLexico } from './types'

function contient(selection: SelectionLexico, id: string): boolean {
  return selection.mode === 'sans-restriction' || selection.ids.includes(id)
}

function intersecte(from: number, to: number, plageFrom: number, plageTo: number): boolean {
  return from < plageTo && to > plageFrom
}

/** Applique toutes les dimensions à la même occurrence. */
export function retenirOccurrenceLexico(
  occurrence: OccurrenceLexico,
  filtres: FiltresLexico,
  contexte: ContexteSelectionLexico,
): boolean {
  if (!contient(filtres.entretiens, occurrence.entretienId)) return false
  if (!filtres.inclureEnqueteurs && occurrence.interviewer) return false

  for (const [variableId, filtre] of Object.entries(filtres.variables)) {
    const variable = contexte.variables.find((candidate) => candidate.id === variableId)
    if (!variable || variable.portee !== filtre.portee) return false
    const valeurs = filtre.portee === 'entretien'
      ? occurrence.valeursEntretien
      : occurrence.valeursLocuteur
    // L'absence de locuteur n'est pas une valeur manquante d'un locuteur.
    if (!valeurs) return false
    const valeur = valeurs[variableId]
    const modaliteValide = variable.modalites.some((modalite) => modalite.id === valeur)
    if (valeur && !modaliteValide) return false
    if (!(valeur ? filtre.modaliteIds.includes(valeur) : filtre.nonRenseigne)) return false
  }

  const personnes = filtres.personnes
  if (personnes.selection.mode === 'choix') {
    const retient = occurrence.locuteurIndex === null
      ? personnes.sansLocuteur
      : occurrence.personneId === null
        ? personnes.sansPersonne
        : personnes.selection.ids.includes(occurrence.personneId)
    if (!retient) return false
  }

  if (filtres.themes.mode === 'choix'
    && !occurrence.themeIds.some((id) => filtres.themes.mode === 'choix' && filtres.themes.ids.includes(id))) {
    return false
  }

  if (filtres.cas.mode === 'choix') {
    const plages = filtres.cas.ids.flatMap((id) => contexte.cas[id] ?? [])
      .filter((plage) => plage.entretienId === occurrence.entretienId)
    if (!plages.some((plage) => intersecte(occurrence.from, occurrence.to, plage.from, plage.to))) {
      return false
    }
  }
  return true
}

export function selectionnerOccurrencesLexico(
  occurrences: OccurrenceLexico[],
  filtres: FiltresLexico,
  contexte: ContexteSelectionLexico,
): OccurrenceLexico[] {
  return occurrences.filter((occurrence) => retenirOccurrenceLexico(occurrence, filtres, contexte))
}

/** Agrège sans perdre les occurrences qui alimentent les concordances. */
export function agregerOccurrencesLexico(occurrences: OccurrenceLexico[]): LigneLexico[] {
  const groupes = new Map<string, OccurrenceLexico[]>()
  for (const occurrence of occurrences) {
    const groupe = groupes.get(occurrence.forme) ?? []
    groupe.push(occurrence)
    groupes.set(occurrence.forme, groupe)
  }
  return [...groupes.entries()].map(([forme, details]) => ({
    forme,
    occurrences: details.length,
    entretiens: new Set(details.map((occurrence) => occurrence.entretienId)).size,
    details,
  }))
}
