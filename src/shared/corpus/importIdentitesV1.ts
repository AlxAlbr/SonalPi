import type { Locuteur, ParticipationLocuteur } from '../locuteurs'

/** Prépare une identité distincte par participation V1, sans comparer les noms. */
export function preparerIdentitesImportV1(
  existants: Readonly<Record<string, Locuteur>>,
  participations: readonly Pick<ParticipationLocuteur, 'id' | 'nom'>[],
  genererId: () => string,
): { locuteurs: Locuteur[]; associations: Map<string, string> } {
  const ids = new Set(Object.keys(existants))
  const locuteurs: Locuteur[] = []
  const associations = new Map<string, string>()
  for (const participation of participations) {
    if (!participation.id || associations.has(participation.id)) {
      throw new Error('Identifiant de participation absent ou déjà utilisé dans cet entretien.')
    }
    const nom = participation.nom.trim()
    if (!nom) throw new Error('Le nom du locuteur importé ne peut pas être vide.')
    const id = genererId()
    if (!id || ids.has(id)) throw new Error('Identifiant de locuteur absent ou déjà utilisé.')
    ids.add(id)
    locuteurs.push({ id, nom })
    associations.set(participation.id, id)
  }
  return { locuteurs, associations }
}
