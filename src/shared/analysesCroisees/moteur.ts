import type {
  CelluleAnalyseCroisee,
  ContributionAnalyseCroisee,
  DiagnosticAnalyseCroisee,
  ResultatAnalyseCroisee,
  SourceAnalyseCroisee,
  TourAnalyseCroisee,
} from './types'

interface SegmentValide {
  from: number
  to: number
  annotationIds: string[]
  tourId: string | null
}

function tourA(source: SourceAnalyseCroisee, from: number, to: number): TourAnalyseCroisee | null {
  return source.tours?.find((tour) => tour.from < to && tour.to > from) ?? null
}

function decouperAuxTours(
  contribution: ContributionAnalyseCroisee,
  source: SourceAnalyseCroisee,
): SegmentValide[] {
  const bornes = new Set([contribution.from, contribution.to])
  for (const tour of source.tours ?? []) {
    if (tour.from > contribution.from && tour.from < contribution.to) bornes.add(tour.from)
    if (tour.to > contribution.from && tour.to < contribution.to) bornes.add(tour.to)
  }
  const positions = [...bornes].sort((a, b) => a - b)
  return positions.slice(0, -1).map((from, index) => {
    const to = positions[index + 1]
    return {
      from,
      to,
      annotationIds: [...new Set(contribution.annotationIds)].sort(),
      tourId: tourA(source, from, to)?.id ?? null,
    }
  })
}

function contributionValide(
  contribution: ContributionAnalyseCroisee,
  source: SourceAnalyseCroisee,
  diagnostics: DiagnosticAnalyseCroisee[],
): boolean {
  const longueur = source.longueurSource
  const valide = contribution.entretienId === source.entretienId
    && Number.isInteger(contribution.from)
    && Number.isInteger(contribution.to)
    && contribution.from >= 0
    && contribution.from < contribution.to
    && (longueur === null || contribution.to <= longueur)
    && contribution.themeId.length > 0
    && contribution.annotationIds.length > 0
    && contribution.annotationIds.every((id) => id.length > 0)
  if (!valide) {
    diagnostics.push({
      entretienId: source.entretienId,
      themeId: contribution.themeId || undefined,
      annotationId: contribution.annotationIds[0],
      titre: 'Annotation ignorée',
      message: 'La plage ou sa référence de source est invalide.',
    })
  }
  return valide
}

function reunir(segments: SegmentValide[]): SegmentValide[] {
  const tries = [...segments].sort((a, b) => a.from - b.from || a.to - b.to)
  const resultat: SegmentValide[] = []
  for (const segment of tries) {
    const precedent = resultat.at(-1)
    const chevauche = Boolean(precedent && segment.from < precedent.to)
    const contiguMemeTour = Boolean(precedent
      && segment.from === precedent.to
      && segment.tourId !== null
      && segment.tourId === precedent.tourId)
    if (precedent && (chevauche || contiguMemeTour)) {
      precedent.to = Math.max(precedent.to, segment.to)
      precedent.annotationIds = [...new Set([...precedent.annotationIds, ...segment.annotationIds])].sort()
    } else {
      resultat.push({ ...segment, annotationIds: [...segment.annotationIds] })
    }
  }
  return resultat
}

function cellule(
  source: SourceAnalyseCroisee,
  themeId: string,
  diagnostics: DiagnosticAnalyseCroisee[],
): CelluleAnalyseCroisee {
  const segments = source.contributions
    .filter((item) => item.themeId === themeId)
    .filter((item) => contributionValide(item, source, diagnostics))
    .flatMap((item) => decouperAuxTours(item, source))
  const plages = reunir(segments).map((plage) => ({
    id: `${source.entretienId}:${themeId}:${plage.from}:${plage.to}:${plage.annotationIds.join(',')}`,
    from: plage.from,
    to: plage.to,
    annotationIds: plage.annotationIds,
  }))
  const volume = plages.reduce((total, plage) => total + plage.to - plage.from, 0)
  const longueur = source.longueurSource
  return {
    themeId,
    entretienId: source.entretienId,
    passages: plages.length,
    volume,
    couverture: longueur !== null && Number.isFinite(longueur) && longueur > 0
      ? Math.min(100, Math.max(0, volume / longueur * 100))
      : null,
    plages,
  }
}

/** Calcule une matrice ordonnée sans dépendre du DOM ni du mode d'affichage. */
export function calculerAnalyseCroisee(
  sources: SourceAnalyseCroisee[],
  themeIds: string[],
  entretienIds: string[],
): ResultatAnalyseCroisee {
  const diagnostics: DiagnosticAnalyseCroisee[] = []
  const sourcesParId = new Map(sources.map((source) => [source.entretienId, source]))
  const indisponibles: string[] = []
  const cellules: CelluleAnalyseCroisee[] = []
  for (const themeId of themeIds) {
    for (const entretienId of entretienIds) {
      const source = sourcesParId.get(entretienId)
      if (!source || source.disponible === false) {
        if (!indisponibles.includes(entretienId)) indisponibles.push(entretienId)
        if (!diagnostics.some((item) => item.entretienId === entretienId && item.titre === 'Source indisponible')) {
          diagnostics.push({
            entretienId,
            titre: 'Source indisponible',
            message: source?.diagnostic ?? 'La transcription ne peut pas être lue.',
          })
        }
        continue
      }
      cellules.push(cellule(source, themeId, diagnostics))
    }
  }

  const lignes: ResultatAnalyseCroisee['totaux']['lignes'] = {}
  for (const themeId of themeIds) {
    const items = cellules.filter((item) => item.themeId === themeId)
    const longueurs = entretienIds.map((id) => sourcesParId.get(id)?.longueurSource)
    const longueurTotaleFiable = longueurs.every((longueur) => typeof longueur === 'number' && longueur >= 0)
      ? (longueurs as number[]).reduce((total, longueur) => total + longueur, 0)
      : null
    const volume = items.reduce((total, item) => total + item.volume, 0)
    lignes[themeId] = {
      passages: items.reduce((total, item) => total + item.passages, 0),
      volume,
      couverture: longueurTotaleFiable && longueurTotaleFiable > 0
        ? Math.min(100, volume / longueurTotaleFiable * 100)
        : null,
    }
  }
  return {
    cellules,
    sourcesIndisponibles: indisponibles,
    diagnostics,
    totaux: {
      lignes,
      colonnes: Object.fromEntries(entretienIds.map((id) => [id, null])),
    },
  }
}
