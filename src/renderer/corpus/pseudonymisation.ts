import type { CibleRegleAnon } from '../../shared/format'
import type { OccurrenceScan } from '../../shared/corpus/scanAnon'

export type EtatsOccurrences = Record<string, Record<string, boolean>>

export const cleOccurrence = (o: { from: number; to: number }): string => `${o.from}:${o.to}`

export function etatsDepuisDetails(details: Record<string, OccurrenceScan[]>): {
  cochees: EtatsOccurrences
  exceptions: EtatsOccurrences
} {
  const cochees: EtatsOccurrences = {}
  const exceptions: EtatsOccurrences = {}
  for (const [id, occurrences] of Object.entries(details)) {
    cochees[id] = {}
    exceptions[id] = {}
    for (const o of occurrences) {
      if (o.etat === 'incl') continue
      const cle = cleOccurrence(o)
      cochees[id][cle] = o.etat === 'anon'
      exceptions[id][cle] = o.etat === 'exc'
    }
  }
  return { cochees, exceptions }
}

export interface DiffPseudonymisation {
  cibles: CibleRegleAnon[]
  poses: number
  retraits: number
  exceptionsAjoutees: number
  exceptionsRetirees: number
}

/** Compare l'édition locale au dernier scan détaillé. */
export function construireDiff(
  regleId: string,
  details: Record<string, OccurrenceScan[]>,
  cochees: EtatsOccurrences,
  exceptions: EtatsOccurrences,
): DiffPseudonymisation {
  const diff: DiffPseudonymisation = {
    cibles: [],
    poses: 0,
    retraits: 0,
    exceptionsAjoutees: 0,
    exceptionsRetirees: 0,
  }
  for (const [entretienId, occurrences] of Object.entries(details)) {
    if (!cochees[entretienId]) continue
    const plages: { from: number; to: number }[] = []
    const retirer: { from: number; to: number }[] = []
    const exception: { from: number; to: number }[] = []
    const retirerException: { from: number; to: number }[] = []
    const cible: CibleRegleAnon = { entretienId, regleId, plages, retirer, exception, retirerException }
    for (const o of occurrences) {
      if (o.etat === 'incl') continue
      const cle = cleOccurrence(o)
      const cochee = !!cochees[entretienId]?.[cle]
      const estException = !!exceptions[entretienId]?.[cle]
      const plage = { from: o.from, to: o.to }
      if (cochee && o.etat === 'non') { plages.push(plage); diff.poses++ }
      if (!cochee && o.etat === 'anon') { retirer.push(plage); diff.retraits++ }
      if (estException && o.etat !== 'exc') { exception.push(plage); diff.exceptionsAjoutees++ }
      if (!estException && o.etat === 'exc') { retirerException.push(plage); diff.exceptionsRetirees++ }
    }
    if (plages.length || retirer.length || exception.length || retirerException.length) {
      diff.cibles.push(cible)
    }
  }
  return diff
}

export function bornerLargeurPanneau(valeur: number, disponible: number, minGauche = 280, minDroite = 320): number {
  if (!Number.isFinite(valeur)) valeur = minGauche
  return Math.max(minGauche, Math.min(valeur, Math.max(minGauche, disponible - minDroite)))
}
