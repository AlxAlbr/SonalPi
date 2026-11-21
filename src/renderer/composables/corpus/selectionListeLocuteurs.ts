export interface SelectionListeLocuteurs {
  cles: string[]
  ancre: string | null
}

/** Reprend les gestes de sélection d’une liste de fichiers, dans l’ordre affiché. */
export function selectionnerLocuteurs(
  selection: SelectionListeLocuteurs,
  ordre: string[],
  cible: string,
  geste: { etendre?: boolean; basculer?: boolean } = {},
): SelectionListeLocuteurs {
  if (!ordre.includes(cible)) return selection
  const presentes = selection.cles
  if (geste.etendre && selection.ancre && ordre.includes(selection.ancre)) {
    const a = ordre.indexOf(selection.ancre), b = ordre.indexOf(cible)
    const plage = ordre.slice(Math.min(a, b), Math.max(a, b) + 1)
    return { cles: geste.basculer ? [...new Set([...presentes, ...plage])] : plage, ancre: selection.ancre }
  }
  if (geste.basculer) {
    return { cles: presentes.includes(cible) ? presentes.filter((cle) => cle !== cible) : [...presentes, cible], ancre: cible }
  }
  return { cles: [cible], ancre: cible }
}
