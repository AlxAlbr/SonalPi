import type {
  ContexteMoteurSynthese,
  ExtraitSyntheseBrut,
  FiltresSynthese,
  PlageContributionSynthese,
  SelectionSynthese,
  SourceMoteurSynthese,
  TourSynthese,
} from './types'

const intersecte = (aFrom: number, aTo: number, bFrom: number, bTo: number) =>
  aFrom < bTo && aTo > bFrom

function selectionContient(selection: SelectionSynthese, id: string): boolean {
  return selection.mode === 'sans-restriction' || selection.ids.includes(id)
}

function valeurAdmise(
  valeurs: Record<string, string> | null,
  variableId: string,
  filtre: FiltresSynthese['variables'][string],
  contexte: ContexteMoteurSynthese,
): boolean {
  if (!valeurs) return false
  const variable = contexte.variables.find((candidate) => candidate.id === variableId)
  if (!variable || variable.portee !== filtre.portee) return false
  const valeur = valeurs[variableId]
  if (valeur && !variable.modalites.some((modalite) => modalite.id === valeur)) return false
  return valeur ? filtre.modaliteIds.includes(valeur) : filtre.nonRenseigne
}

function tourAdmis(
  tour: TourSynthese | null,
  filtres: FiltresSynthese,
  contexte: ContexteMoteurSynthese,
): boolean {
  if (!filtres.inclureEnqueteurs && tour?.interviewer) return false
  for (const [id, filtre] of Object.entries(filtres.variables)) {
    if (filtre.portee === 'locuteur' && !valeurAdmise(tour?.valeursLocuteur ?? null, id, filtre, contexte)) return false
  }
  const personnes = filtres.personnes
  if (personnes.selection.mode === 'choix') {
    if (!tour) return personnes.sansLocuteur
    if (!tour.personneId) return personnes.sansPersonne
    return personnes.selection.ids.includes(tour.personneId)
  }
  return true
}

function contributionsActives(
  source: SourceMoteurSynthese,
  filtres: FiltresSynthese,
): PlageContributionSynthese[] {
  if (filtres.themes.mode === 'sans-restriction') return source.contributions
  return source.contributions.flatMap((plage) => {
    const themeIds = plage.themeIds.filter((id) => filtres.themes.mode === 'choix' && filtres.themes.ids.includes(id))
    return themeIds.length ? [{ ...plage, themeIds }] : []
  })
}

interface Segment {
  from: number
  to: number
  themes: Set<string>
  annotations: Set<string>
  tour: TourSynthese | null
}

function calculerSource(
  source: SourceMoteurSynthese,
  filtres: FiltresSynthese,
  contexte: ContexteMoteurSynthese,
): ExtraitSyntheseBrut[] {
  if (!selectionContient(filtres.entretiens, source.entretienId)) return []
  for (const [id, filtre] of Object.entries(filtres.variables)) {
    if (filtre.portee === 'entretien' && !valeurAdmise(source.valeursEntretien, id, filtre, contexte)) return []
  }

  const contributions = contributionsActives(source, filtres)
  const cas = filtres.cas.mode === 'choix'
    ? filtres.cas.ids.flatMap((id) => contexte.cas[id] ?? []).filter((plage) => plage.entretienId === source.entretienId)
    : []
  const themesDemandes = filtres.themes.mode === 'choix'
  const casDemandes = filtres.cas.mode === 'choix'
  if (!themesDemandes && !casDemandes) return []
  if ((themesDemandes && !contributions.length) || (casDemandes && !cas.length)) return []

  const bornes = new Set<number>()
  const ajouterBornes = (plages: Array<{ from: number; to: number }>) => plages.forEach((plage) => {
    if (plage.from < plage.to) {
      bornes.add(Math.max(0, plage.from))
      bornes.add(Math.min(source.longueurSource, plage.to))
    }
  })
  ajouterBornes(contributions)
  ajouterBornes(cas)
  ajouterBornes(source.tours)
  const positions = [...bornes].filter((position) => position >= 0 && position <= source.longueurSource).sort((a, b) => a - b)
  const segments: Segment[] = []
  for (let index = 0; index < positions.length - 1; index++) {
    const from = positions[index]
    const to = positions[index + 1]
    if (from >= to) continue
    const presentes = contributions.filter((plage) => intersecte(from, to, plage.from, plage.to))
    if (themesDemandes && !presentes.length) continue
    if (themesDemandes && filtres.correspondanceThemes === 'tous-au-meme-endroit') {
      const themesPresents = new Set(presentes.flatMap((plage) => plage.themeIds))
      if (filtres.themes.mode === 'choix'
        && !filtres.themes.ids.every((themeId) => themesPresents.has(themeId))) continue
    }
    if (casDemandes && !cas.some((plage) => intersecte(from, to, plage.from, plage.to))) continue
    const tour = source.tours.find((plage) => intersecte(from, to, plage.from, plage.to)) ?? null
    if (!tourAdmis(tour, filtres, contexte)) continue
    segments.push({
      from,
      to,
      themes: new Set(presentes.flatMap((plage) => plage.themeIds)),
      annotations: new Set(presentes.flatMap((plage) => plage.annotationIds)),
      tour,
    })
  }

  const reunis: Segment[] = []
  for (const segment of segments) {
    const precedent = reunis.at(-1)
    const memeTour = precedent?.tour?.locuteurId === segment.tour?.locuteurId
      && Boolean(precedent?.tour) === Boolean(segment.tour)
    const themeCommun = [...segment.themes].some((theme) => precedent?.themes.has(theme))
    // Les matériaux d'un cas sans thème peuvent rester continus dans un même tour.
    const continuiteCas = casDemandes && !themesDemandes
    if (precedent && precedent.to === segment.from && memeTour && (themeCommun || continuiteCas)) {
      precedent.to = segment.to
      segment.themes.forEach((id) => precedent.themes.add(id))
      segment.annotations.forEach((id) => precedent.annotations.add(id))
    } else {
      reunis.push(segment)
    }
  }

  return reunis.map((segment) => {
    const annotationIds = [...segment.annotations].sort()
    const themeIds = [...segment.themes].sort()
    return {
      id: `${source.entretienId}:${segment.from}:${segment.to}:${annotationIds.join(',')}`,
      entretienId: source.entretienId,
      titreEntretien: source.titreEntretien,
      from: segment.from,
      to: segment.to,
      longueurSource: source.longueurSource,
      themeIds,
      annotationIds,
      locuteurIds: segment.tour?.locuteurId ? [segment.tour.locuteurId] : [],
      personneIds: segment.tour?.personneId ? [segment.tour.personneId] : [],
      ordre: source.ordre,
    }
  })
}

/** Calcule une collection unique, ordonnée et indépendante de sa représentation. */
export function calculerExtraitsSynthese(
  sources: SourceMoteurSynthese[],
  filtres: FiltresSynthese,
  contexte: ContexteMoteurSynthese,
): ExtraitSyntheseBrut[] {
  return sources.flatMap((source) => calculerSource(source, filtres, contexte))
    .sort((a, b) => a.ordre - b.ordre || a.from - b.from || a.to - b.to || a.id.localeCompare(b.id))
}
