import type { Locuteur, ReferenceParticipation } from '../locuteurs'
import type { InventaireIdentitesLocuteurs } from './personnes'
import type { LigneRepertoireLocuteurs } from './repertoireLocuteurs'
import type { CommandeCorrectionLocuteurs } from './contratsLocuteurs'

export interface ApercuCorrectionLocuteurs {
  type: CommandeCorrectionLocuteurs['type']
  attendu: string
  locuteurs: Locuteur[]
  participations: Array<ReferenceParticipation & { nom: string; entretienTitre: string }>
  conflits: Array<{ entretienId: string; titre: string }>
}

export const cleParticipationCorrection = (p: ReferenceParticipation): string => JSON.stringify([p.entretienId, p.participationId])

/** Vérifie la sélection contre un inventaire frais, sans préparer d'écriture. */
export function preparerApercuCorrectionLocuteurs(
  type: ApercuCorrectionLocuteurs['type'],
  selection: readonly LigneRepertoireLocuteurs[],
  inventaire: InventaireIdentitesLocuteurs,
): ApercuCorrectionLocuteurs {
  if (inventaire.indisponibles.length) throw new Error('Certains entretiens sont indisponibles. Rétablissez leur accès avant de corriger les locuteurs.')
  if (!selection.length || (type === 'regrouperSelection' ? selection.length < 2 : selection.length !== 1)) {
    throw new Error('Vérifiez le nombre de locuteurs sélectionnés.')
  }
  const ids = selection.map((ligne) => ligne.locuteurId)
  if (ids.some((id) => !id)) throw new Error('Associez d’abord ces locuteurs depuis « Détails et associations… » avant de les corriger ici.')
  if (new Set(ids).size !== ids.length) throw new Error('La sélection contient plusieurs fois le même locuteur. Actualisez la liste.')
  const locuteurs = selection.map((ligne) => {
    const locuteur = inventaire.locuteurs.find((l) => l.id === ligne.locuteurId)
    const membres = inventaire.participations.filter((p) => p.locuteurRef === ligne.locuteurId)
    const signature = (participations: readonly (ReferenceParticipation & { nom: string; entretienTitre: string })[]) =>
      participations.map((p) => JSON.stringify([cleParticipationCorrection(p), p.nom, p.entretienTitre])).sort().join('\n')
    if (!locuteur || locuteur.nom.trim() !== ligne.nom || signature(membres) !== signature(ligne.participations)) {
      throw new Error('Les locuteurs ou leurs entretiens ont changé. Actualisez la liste puis vérifiez votre sélection.')
    }
    return { ...locuteur }
  })
  const participations = inventaire.participations.filter((p) => ids.includes(p.locuteurRef))
    .map((p) => ({ entretienId: p.entretienId, participationId: p.participationId, nom: p.nom, entretienTitre: p.entretienTitre }))
  if (type === 'dissocierSelection' && participations.length < 2) throw new Error('Ce locuteur intervient dans un seul entretien.')
  const conflits = type === 'regrouperSelection'
    ? [...new Set(participations.map((p) => p.entretienId))].flatMap((entretienId) => {
      const membres = participations.filter((p) => p.entretienId === entretienId)
      return membres.length > 1 ? [{ entretienId, titre: membres[0].entretienTitre }] : []
    }) : []
  return { type, attendu: JSON.stringify(inventaire), locuteurs, participations, conflits }
}
