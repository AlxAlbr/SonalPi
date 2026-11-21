import { FORMAT_VERSION, type EntretienFichier, type ParticipationLocuteur, type PayloadEntretien } from '../format'
import type { ReferenceParticipation } from '../locuteurs'
import type { DemandeRapprochementNommage } from '../corpus/contratsLocuteurs'
import type { InventaireIdentitesLocuteurs } from '../corpus/inventaireLocuteurs'
import { associerParticipation, regrouperLocuteurs } from '../corpus/identitesLocuteurs'
import { reprendreDonneesParticipation } from '../corpus/rapprochementsLocuteurs'
import { signaturePayloadEntretien } from './renommageGlobal'

export function verifierPayloadRelecture(attendu: PayloadEntretien, apres: EntretienFichier): void {
  const { formatVersion: _v, lastModified: _date, ...payload } = apres
  if (apres.formatVersion !== FORMAT_VERSION || signaturePayloadEntretien(attendu) !== signaturePayloadEntretien(payload)) {
    throw new Error('Le contenu de l’entretien a changé. Rouvrez le corpus avant de poursuivre les modifications.')
  }
}

/** Une identification ne peut modifier que la référence de la participation nommée. */
export function verifierRelectureIdentification(avant: PayloadEntretien, apres: EntretienFichier, reference: ReferenceParticipation, relecture = false): void {
  const attendu = structuredClone(avant), cible = attendu.participations.find((p) => p.id === reference.participationId)
  const resultat = apres.participations.find((p) => p.id === reference.participationId)
  if (!cible || cible.locuteurRef || cible.associationRetiree || !resultat
    || (!resultat.locuteurRef && !relecture)) throw new Error('L’association a changé. Rouvrez le corpus pour vérifier les locuteurs.')
  cible.locuteurRef = resultat.locuteurRef
  if (cible.associationRetiree === false && resultat.associationRetiree === undefined) delete cible.associationRetiree
  verifierPayloadRelecture(attendu, apres)
}

/** Prévoit les seuls changements locaux d'un rapprochement explicitement choisi. */
export function payloadApresRapprochement(
  avant: PayloadEntretien,
  demande: DemandeRapprochementNommage,
  inventaire: InventaireIdentitesLocuteurs,
): PayloadEntretien {
  const attendu = structuredClone(avant)
  const fichiers = new Map<string, { id: string; titre: string; data: { participations: ParticipationLocuteur[] } }>()
  for (const p of inventaire.participations) {
    if (!fichiers.has(p.entretienId)) fichiers.set(p.entretienId, { id: p.entretienId, titre: p.entretienTitre, data: { participations: [] } })
    fichiers.get(p.entretienId)!.data.participations.push({ ...structuredClone(p), id: p.participationId })
  }
  const courant = fichiers.get(demande.entretienId), sourceData = fichiers.get(demande.source.entretienId)
  if (!courant || !sourceData) throw new Error('Un entretien du rapprochement est absent.')
  courant.data.participations = attendu.participations
  const cible = courant.data.participations.find((p) => p.id === demande.participationId)
  const source = sourceData.data.participations.find((p) => p.id === demande.source.participationId)
  if (!cible?.locuteurRef || !source) throw new Error('Le locuteur sélectionné a changé.')
  const corpus = { locuteurs: Object.fromEntries(inventaire.locuteurs.map((l) => [l.id, { ...l }])), cas: {} }
  if (!source.locuteurRef) associerParticipation(corpus, sourceData.data, source.id, cible.locuteurRef)
  else if (source.locuteurRef !== cible.locuteurRef) regrouperLocuteurs(corpus, [...fichiers.values()], source.locuteurRef, cible.locuteurRef)
  if (demande.reprise) reprendreDonneesParticipation(cible, source, demande.reprise)
  return attendu
}
