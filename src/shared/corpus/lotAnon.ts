import type { CibleRegleAnon, ResultatLotAnon } from '../format'

/** Regroupe les diffs compatibles ; un doublon ambigu est refusé avant toute écriture. */
export function regrouperCiblesAnon(cibles: CibleRegleAnon[]): {
  groupes: Map<string, CibleRegleAnon>
  echecs: ResultatLotAnon['echecs']
} {
  const groupes = new Map<string, CibleRegleAnon>()
  const refus = new Map<string, string>()
  for (const cible of cibles) {
    const id = cible.entretienId
    if (refus.has(id)) continue
    const existante = groupes.get(id)
    if (!existante) {
      groupes.set(id, structuredClone(cible))
      continue
    }
    if (existante.regleId !== cible.regleId || existante.empreinte !== cible.empreinte) {
      groupes.delete(id)
      refus.set(id, 'Un même entretien ne peut pas recevoir des règles ou des aperçus différents dans cette validation.')
      continue
    }
    existante.toutes = existante.toutes || cible.toutes
    for (const cle of ['plages', 'retirer', 'exception', 'retirerException'] as const) {
      const uniques = new Map([...(existante[cle] ?? []), ...(cible[cle] ?? [])].map((p) => [`${p.from}:${p.to}`, { ...p }]))
      existante[cle] = [...uniques.values()]
    }
  }
  return { groupes, echecs: [...refus].map(([id, raison]) => ({ id, raison })) }
}
