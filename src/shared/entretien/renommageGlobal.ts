import type { CorpusFichier, EntretienFichier, PayloadEntretien } from '../format'
import { validerRenommageParticipation, type DemandeRenommageParticipation } from '../corpus/contratsLocuteurs'
import { participationParId } from './participations'

export function signaturePayloadEntretien(valeur: unknown): string | undefined {
  return JSON.stringify(valeur, (_cle, v: unknown) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
}

/** Modifie seulement le nom de la participation, sans toucher à l'identité commune. */
export function renommerParticipationDansEntretien(corpus: Pick<CorpusFichier, 'locuteurs'>, entretien: Pick<EntretienFichier, 'participations'>, demande: DemandeRenommageParticipation): string {
  validerRenommageParticipation(demande)
  const p = participationParId(entretien.participations, demande.participationId)
  if (!p || p.locuteurRef !== demande.locuteurId || !Object.hasOwn(corpus.locuteurs, demande.locuteurId)) {
    throw new Error('Le locuteur ou son association a changé. Vérifiez son nom avant de réessayer.')
  }
  const nom = demande.nom.trim()
  if (p.nom !== demande.nomAvant && p.nom !== nom) throw new Error('Le nom a changé. Vérifiez le nom courant avant de réessayer.')
  p.nom = nom
  return demande.locuteurId
}

/** Une relecture locale ne peut remplacer aucun autre champ ni aucun autre nom. */
export function verifierRelectureRenommageParticipation(avant: PayloadEntretien, apres: EntretienFichier, demande: DemandeRenommageParticipation): void {
  const attendu = structuredClone(avant), p = participationParId(attendu.participations, demande.participationId)
  if (!p || p.locuteurRef !== demande.locuteurId || (p.nom !== demande.nomAvant && p.nom !== demande.nom.trim())) throw new Error('Le nom ou son association a changé pendant le renommage.')
  p.nom = demande.nom.trim()
  const { formatVersion: _v, lastModified: _d, ...payload } = apres
  if (signaturePayloadEntretien(attendu) !== signaturePayloadEntretien(payload)) {
    throw new Error('Le contenu de l’entretien a changé pendant le renommage. Rouvrez-le avant de poursuivre les modifications.')
  }
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
