import type { Categorie } from '../format'
import type { Locuteur } from '../locuteurs'
import type { Cas, Variable } from "../format"
import type { FiltresSynthese, SelectionSynthese } from './types'

interface ElementNomme { id: string; nom: string }

export interface ContexteResumeSynthese {
  entretiens: ElementNomme[]
  variables: Variable[]
  locuteurs: Locuteur[]
  themes: Pick<Categorie, 'id' | 'nom'>[]
  cas: Pick<Cas, 'id' | 'nom'>[]
}

function noms(selection: SelectionSynthese, univers: ElementNomme[], libelleDefaut: string): string {
  if (selection.mode === 'sans-restriction') return libelleDefaut
  const index = new Map(univers.map((element) => [element.id, element.nom]))
  const valeurs = selection.ids.map((id) => index.get(id) ?? `Introuvable (${id})`)
  return valeurs.length <= 3 ? valeurs.join(', ') || 'Aucun' : `${valeurs.length} choix`
}

export function resumerFiltresSynthese(
  filtres: FiltresSynthese,
  contexte: ContexteResumeSynthese,
): string[] {
  const lignes = [`Entretiens : ${noms(filtres.entretiens, contexte.entretiens, 'Tous les entretiens')}`]
  for (const [id, filtre] of Object.entries(filtres.variables)) {
    const variable = contexte.variables.find((candidate) => candidate.id === id)
    const modalites = filtre.modaliteIds.map((modaliteId) =>
      variable?.modalites.find((modalite) => modalite.id === modaliteId)?.lib ?? `Introuvable (${modaliteId})`)
    if (filtre.nonRenseigne) modalites.push('Non renseigné')
    lignes.push(`${variable?.lib ?? id} : ${modalites.join(', ') || 'Aucune modalité'}`)
  }
  const selectionLocuteurs = filtres.locuteurs.selection
  const choixLocuteurs = selectionLocuteurs.mode === 'sans-restriction' ? ['Aucun filtre'] : [
    ...(selectionLocuteurs.ids.length ? [noms(selectionLocuteurs, contexte.locuteurs, '')] : []),
    ...(filtres.locuteurs.sansIdentiteCommune ? ['Locuteurs non associés'] : []),
    ...(filtres.locuteurs.sansParticipation ? ['Passages sans locuteur'] : []),
  ]
  lignes.push(`Locuteurs : ${choixLocuteurs.join(', ') || 'Aucun'}`)
  lignes.push(`Thèmes : ${noms(filtres.themes, contexte.themes, 'Aucun thème sélectionné')}`)
  if (filtres.themes.mode === 'choix') lignes.push(filtres.correspondanceThemes === 'tous-au-meme-endroit'
    ? 'Correspondance thématique : tous les thèmes sélectionnés au même endroit'
    : 'Correspondance thématique : au moins un thème sélectionné')
  if (contexte.cas.length || filtres.cas.mode === 'choix') {
    lignes.push(`Cas : ${noms(filtres.cas, contexte.cas, 'Aucun cas sélectionné')}`)
  }
  lignes.push(filtres.inclureEnqueteurs ? 'Paroles des enquêteurs incluses' : 'Paroles des enquêteurs exclues')
  return lignes
}

export function nombreCriteresSynthese(filtres: FiltresSynthese): number {
  return Number(filtres.entretiens.mode === 'choix')
    + Object.keys(filtres.variables).length
    + Number(filtres.locuteurs.selection.mode === 'choix')
    + Number(filtres.themes.mode === 'choix')
    + Number(filtres.cas.mode === 'choix')
    + Number(!filtres.inclureEnqueteurs)
}
