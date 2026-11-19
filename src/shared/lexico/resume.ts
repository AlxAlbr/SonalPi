import type { Categorie } from '../format'
import type { Locuteur } from '../locuteurs'
import type { Cas, Variable } from "../format"
import type { FiltresLexico, SelectionLexico } from './types'

export interface ElementNommeLexico {
  id: string
  nom: string
}

export interface ContexteResumeLexico {
  entretiens: ElementNommeLexico[]
  variables: Variable[]
  locuteurs: Locuteur[]
  themes: Pick<Categorie, 'id' | 'nom'>[]
  cas: Pick<Cas, 'id' | 'nom'>[]
}

const noms = (selection: SelectionLexico, univers: ElementNommeLexico[]): string[] => {
  if (selection.mode === 'sans-restriction') return []
  const parId = new Map(univers.map((element) => [element.id, element.nom]))
  return selection.ids.map((id) => parId.get(id) ?? `Élément introuvable (${id})`)
}

function enumerer(valeurs: string[]): string {
  if (valeurs.length <= 3 && valeurs.join(', ').length <= 90) {
    return valeurs.length < 2 ? valeurs[0] ?? '' : `${valeurs.slice(0, -1).join(', ')} et ${valeurs.at(-1)}`
  }
  return `${valeurs.length} choix — voir la liste`
}

/** Résume les entretiens par complément seulement lorsque ce raccourci est exact. */
export function resumerEntretiensLexico(
  selection: SelectionLexico,
  univers: ElementNommeLexico[],
): string {
  if (selection.mode === 'sans-restriction') return `Tous les entretiens (${univers.length})`
  const ids = new Set(selection.ids)
  const choisis = univers.filter((element) => ids.has(element.id))
  const absents = selection.ids.filter((id) => !univers.some((element) => element.id === id))
  if (!choisis.length && !absents.length) return 'Aucun entretien'
  if (choisis.length === univers.length && !absents.length) return `Tous les entretiens (${univers.length})`
  const exclus = univers.filter((element) => !ids.has(element.id))
  if (exclus.length > 0 && exclus.length <= 3 && exclus.map((item) => item.nom).join(', ').length <= 90 && !absents.length) {
    return `Tous les entretiens sauf ${enumerer(exclus.map((item) => `« ${item.nom} »`))} (${choisis.length} sur ${univers.length})`
  }
  if (choisis.length <= 3 && choisis.map((item) => item.nom).join(', ').length <= 90 && !absents.length) {
    return `Entretiens ${enumerer(choisis.map((item) => `« ${item.nom} »`))} (${choisis.length} sur ${univers.length})`
  }
  return `${choisis.length} entretiens sur ${univers.length} — voir la liste${absents.length ? ` · ${absents.length} introuvable(s)` : ''}`
}

/** Produit les lignes lisibles du détail, sans formule logique éditable. */
export function resumerFiltresLexico(
  filtres: FiltresLexico,
  contexte: ContexteResumeLexico,
): string[] {
  const lignes = [
    `Entretiens : ${resumerEntretiensLexico(filtres.entretiens, contexte.entretiens)}`,
  ]
  for (const [id, filtre] of Object.entries(filtres.variables)) {
    const variable = contexte.variables.find((candidate) => candidate.id === id)
    const modalites = filtre.modaliteIds.map((modaliteId) =>
      variable?.modalites.find((modalite) => modalite.id === modaliteId)?.lib
      ?? `Modalité introuvable (${modaliteId})`)
    if (filtre.nonRenseigne) modalites.push('Non renseigné')
    lignes.push(`${variable?.portee === 'participation' ? 'Paroles de locuteurs dont' : 'Entretiens dont'} ${variable?.lib ?? `Variable introuvable (${id})`} = ${enumerer(modalites) || 'aucune modalité'}`)
  }
  if (filtres.locuteurs.selection.mode === 'choix') {
    const choix = noms(filtres.locuteurs.selection, contexte.locuteurs)
    if (filtres.locuteurs.sansIdentiteCommune) choix.push('Locuteurs non associés')
    if (filtres.locuteurs.sansParticipation) choix.push('Passages sans locuteur')
    lignes.push(`Locuteurs : ${enumerer(choix) || 'aucun'}`)
  }
  if (filtres.themes.mode === 'choix') lignes.push(`Dans les thèmes : ${enumerer(noms(filtres.themes, contexte.themes)) || 'aucun'}`)
  if (filtres.cas.mode === 'choix') lignes.push(`Dans les matériaux des cas : ${enumerer(noms(filtres.cas, contexte.cas)) || 'aucun'}`)
  lignes.push(filtres.inclureEnqueteurs ? 'Paroles des enquêteurs incluses' : 'Paroles des enquêteurs exclues')
  lignes.push('Texte pseudonymisé')
  return lignes
}

export function nombreCriteresLexico(filtres: FiltresLexico): number {
  return Number(filtres.entretiens.mode === 'choix')
    + Object.keys(filtres.variables).length
    + Number(filtres.locuteurs.selection.mode === 'choix')
    + Number(filtres.themes.mode === 'choix')
    + Number(filtres.cas.mode === 'choix')
    + Number(!filtres.inclureEnqueteurs)
}
