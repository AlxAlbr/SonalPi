import type { MarqueurDemo, ParcoursId, ProgressionParcoursDemo } from '../../../shared/format'

export interface ProgressionsDemoNormalisees {
  progressions: Record<ParcoursId, Set<string>>
  contextes: Partial<Record<ParcoursId, Record<string, string>>>
  parcoursInitial: ParcoursId
  dernierParcoursId: ParcoursId | null
}

/** Lit les marqueurs récents et migre en mémoire l'ancien historique unique. */
export function normaliserProgressionsDemo(marqueur: MarqueurDemo): ProgressionsDemoNormalisees {
  const anciennes = marqueur.validees ?? []
  const dernierParcoursId = marqueur.dernierParcoursId ?? (
    anciennes.length > 0
      ? 'traitement'
      : (marqueur.parcours?.traitement?.validees.length ?? 0) > 0 &&
          (marqueur.parcours?.preparation?.validees.length ?? 0) === 0
        ? 'traitement'
        : (marqueur.parcours?.preparation?.validees.length ?? 0) > 0
          ? 'preparation'
          : null
  )
  return {
    progressions: {
      preparation: new Set(marqueur.parcours?.preparation?.validees ?? []),
      traitement: new Set(marqueur.parcours?.traitement?.validees ?? anciennes),
      analyse: new Set(marqueur.parcours?.analyse?.validees ?? []),
    },
    contextes: {
      ...(marqueur.parcours?.preparation?.contexte
        ? { preparation: { ...marqueur.parcours.preparation.contexte } }
        : {}),
      ...(marqueur.parcours?.traitement?.contexte
        ? { traitement: { ...marqueur.parcours.traitement.contexte } }
        : {}),
    },
    parcoursInitial: dernierParcoursId ?? 'preparation',
    dernierParcoursId,
  }
}

/** Produit le format moderne sans réintroduire l'ancien champ partagé. */
export function serialiserProgressionsDemo(
  progressions: Record<ParcoursId, ReadonlySet<string>>,
  contextes: Partial<Record<ParcoursId, Record<string, string>>>,
): Partial<Record<ParcoursId, ProgressionParcoursDemo>> {
  const resultat: Partial<Record<ParcoursId, ProgressionParcoursDemo>> = {
    preparation: {
      validees: [...progressions.preparation],
      ...(contextes.preparation ? { contexte: { ...contextes.preparation } } : {}),
    },
    traitement: {
      validees: [...progressions.traitement],
      ...(contextes.traitement ? { contexte: { ...contextes.traitement } } : {}),
    },
  }
  if (progressions.analyse.size > 0 || contextes.analyse) {
    resultat.analyse = {
      validees: [...progressions.analyse],
      ...(contextes.analyse ? { contexte: { ...contextes.analyse } } : {}),
    }
  }
  return resultat
}
