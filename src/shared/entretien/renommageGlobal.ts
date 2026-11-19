import type { EntretienFichier, PayloadEntretien } from '../format'

export function signaturePayloadEntretien(valeur: unknown): string | undefined {
  return JSON.stringify(valeur, (_cle, v: unknown) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
}

/** N'accepte une relecture que si seuls les noms du locuteur concerné ont changé. */
export function verifierRelectureRenommage(avant: PayloadEntretien, apres: EntretienFichier, locuteurId: string): void {
  const sansNoms = (payload: PayloadEntretien) => ({ ...payload,
    participations: payload.participations.map((p) => p.locuteurRef === locuteurId ? { ...p, nom: '' } : p),
  })
  const { formatVersion: _version, lastModified: _date, ...payload } = apres
  if (!avant.participations.some((p) => p.locuteurRef === locuteurId) || signaturePayloadEntretien(sansNoms(avant)) !== signaturePayloadEntretien(sansNoms(payload))) {
    throw new Error('Le contenu de l’entretien a changé pendant le renommage. Rouvrez-le avant de poursuivre les modifications.')
  }
}
