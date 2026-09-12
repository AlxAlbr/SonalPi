/** Plage autonome d'un entretien référencée par un recueil. */
export interface ReperePassage {
  id: string
  from: number
  to: number
}

/** Un repère vide reste présent afin que sa référence puisse être diagnostiquée. */
export function estRepereOrphelin(repere: ReperePassage): boolean {
  return repere.from >= repere.to
}

/** Crée un repère sur une sélection non vide. */
export function creerReperePassage(
  reperes: ReperePassage[],
  plage: { from: number; to: number },
  genId: () => string,
): ReperePassage | null {
  if (!Number.isInteger(plage.from) || !Number.isInteger(plage.to) || plage.from >= plage.to) {
    return null
  }
  const repere: ReperePassage = { id: genId(), from: plage.from, to: plage.to }
  if (!repere.id || reperes.some((candidat) => candidat.id === repere.id)) {
    throw new Error('Identifiant de repère invalide ou déjà utilisé.')
  }
  reperes.push(repere)
  return repere
}

/** Rend les anciennes plages inexploitables après un remplacement complet du texte. */
export function rendreReperesOrphelins(reperes: ReperePassage[] | undefined): ReperePassage[] {
  return (reperes ?? []).map((repere) => ({ ...repere, from: 0, to: 0 }))
}

/** Normalise un ancien entretien qui ne portait pas encore de repères. */
export function normaliserReperesPassages(reperes: unknown): ReperePassage[] {
  if (!Array.isArray(reperes)) return []
  return reperes
    .filter((repere): repere is ReperePassage => {
      if (!repere || typeof repere !== 'object') return false
      const candidat = repere as Partial<ReperePassage>
      return typeof candidat.id === 'string'
        && Number.isInteger(candidat.from)
        && Number.isInteger(candidat.to)
        && candidat.from! >= 0
        && candidat.to! >= candidat.from!
    })
    .map((repere) => ({ ...repere }))
}
