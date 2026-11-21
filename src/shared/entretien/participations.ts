/** Résout un id local déjà enregistré ; aucune participation n'est créée ou choisie par son index. */
export function participationParId<T extends { id?: string }>(participations: readonly T[], id: string): T | undefined {
  if (typeof id !== 'string' || !id.trim()) return undefined
  const correspondances = participations.filter((p) => p.id === id)
  return correspondances.length === 1 ? correspondances[0] : undefined
}

/** Change uniquement le nom local ; les paragraphes et l'identité corpus ne sont pas modifiés. */
export function renommerParticipation<T extends { id?: string; nom: string }>(participations: readonly T[], id: string, nom: string): boolean {
  const participation = participationParId(participations, id)
  if (!participation) return false
  participation.nom = nom
  return true
}

/** Retire la participation sans renuméroter les autres ; l'appelant gère ses références dans le texte et les notes. */
export function supprimerParticipation<T extends { id?: string }>(participations: T[], id: string): boolean {
  const participation = participationParId(participations, id)
  if (!participation) return false
  participations.splice(participations.indexOf(participation), 1)
  return true
}
