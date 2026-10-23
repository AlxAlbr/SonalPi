import type { Annotation } from '../annotation'
import type { Plage } from './anonymisation'
import { annotationVisible } from './classification'

export interface PortionAnonVisible extends Plage {
  annotation: Annotation | null
}

/** Retourne la décision qui masque les autres sur une plage donnée. */
export function decisionAnonVisible(
  annotations: Annotation[],
  plage: Plage,
): Annotation | null {
  return annotationVisible(annotations, plage) ?? null
}

/** Découpe une plage selon les décisions de pseudonymisation réellement visibles. */
export function projeterPortionsAnon(
  annotations: Annotation[],
  plage: Plage,
): PortionAnonVisible[] {
  if (plage.from >= plage.to) return []
  const candidats = annotations.filter((annotation) => annotation.type === 'anon'
    && annotation.from < annotation.to
    && annotation.from < plage.to
    && annotation.to > plage.from)
  const bornes = new Set<number>([plage.from, plage.to])
  for (const annotation of candidats) {
    bornes.add(Math.max(plage.from, annotation.from))
    bornes.add(Math.min(plage.to, annotation.to))
  }
  const triees = [...bornes].sort((a, b) => a - b)
  const resultat: PortionAnonVisible[] = []
  for (let index = 0; index < triees.length - 1; index += 1) {
    const from = triees[index]
    const to = triees[index + 1]
    if (from >= to) continue
    const annotation = decisionAnonVisible(candidats, { from, to })
    const precedente = resultat[resultat.length - 1]
    if (precedente?.annotation === annotation && precedente.to === from) precedente.to = to
    else resultat.push({ from, to, annotation })
  }
  return resultat
}
