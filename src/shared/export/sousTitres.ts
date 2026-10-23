export interface BornesSousTitre {
  debut: number
  fin: number
}

/** Arrondit le temps avant affichage et ramène les valeurs négatives à zéro. */
export function millisecondesSousTitre(secondes: unknown): number | null {
  if (typeof secondes !== 'number' || !Number.isFinite(secondes)) return null
  return Math.max(0, Math.round(secondes * 1000))
}

/** Retourne uniquement les bornes qui produisent réellement un cue. */
export function bornesSousTitre(debut: unknown, fin: unknown): BornesSousTitre | null {
  const debutMs = millisecondesSousTitre(debut)
  const finMs = millisecondesSousTitre(fin)
  return debutMs == null || finMs == null || finMs <= debutMs
    ? null
    : { debut: debutMs, fin: finMs }
}
