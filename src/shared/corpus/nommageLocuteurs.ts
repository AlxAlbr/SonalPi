import type { CorpusFichier, EntretienFichier } from '../format'
import { creerLocuteur, associerParticipation, regrouperLocuteurs } from './identitesLocuteurs'
import { reprendreDonneesParticipation } from './rapprochementsLocuteurs'
import { validerIdentificationLocuteur, validerRapprochementNommage, type DemandeIdentificationLocuteur, type DemandeRapprochementNommage } from './contratsLocuteurs'

type CorpusNommage = Pick<CorpusFichier, 'locuteurs' | 'cas' | 'variables'>
type EntretienNommage = Pick<EntretienFichier, 'participations'>

/** Un nom saisi crée une identité indépendante, jamais une association déduite du nom. */
export function identifierParticipationNommage(corpus: CorpusNommage, entretien: EntretienNommage, demande: DemandeIdentificationLocuteur, genererId: () => string): string {
  validerIdentificationLocuteur(demande)
  const cible = entretien.participations.find((p) => p.id === demande.participationId)
  if (!cible || cible.nom !== demande.nom) throw new Error('Le nom a changé. Validez à nouveau le nom courant.')
  if (cible.associationRetiree) throw new Error('L’association a été retirée volontairement. Choisissez explicitement un locuteur depuis le corpus.')
  if (cible.locuteurRef) {
    if (!Object.hasOwn(corpus.locuteurs, cible.locuteurRef)) throw new Error('Le locuteur associé est absent. Vérifiez le corpus.')
    return cible.locuteurRef
  }
  const id = genererId()
  creerLocuteur(corpus, id, cible.nom)
  associerParticipation(corpus, entretien, cible.id, id)
  return id
}

/** Réunit les identités après choix explicite, en conservant les noms locaux. */
export function rapprocherParticipationsNommage(corpus: CorpusNommage, fichiers: readonly { id: string; titre: string; data: EntretienNommage }[], demande: DemandeRapprochementNommage): string {
  validerRapprochementNommage(demande)
  const cibleData = fichiers.find((f) => f.id === demande.entretienId)?.data
  const sourceData = fichiers.find((f) => f.id === demande.source.entretienId)?.data
  const cible = cibleData?.participations.find((p) => p.id === demande.participationId)
  const source = sourceData?.participations.find((p) => p.id === demande.source.participationId)
  if (!cible?.locuteurRef || cible.associationRetiree) throw new Error('Validez d’abord le nom du locuteur pour créer son identité distincte.')
  if (!source || !sourceData) throw new Error('La source sélectionnée est absente.')
  if (demande.reprise?.variables.some((id) => !Object.hasOwn(corpus.variables, id) || corpus.variables[id].portee !== 'participation')) {
    throw new Error('La définition de ces données a changé. Actualisez les détails avant de reprendre les informations.')
  }
  if (!source.locuteurRef) associerParticipation(corpus, sourceData, source.id, cible.locuteurRef)
  else if (source.locuteurRef !== cible.locuteurRef) regrouperLocuteurs(corpus, fichiers, source.locuteurRef, cible.locuteurRef)
  if (demande.reprise) reprendreDonneesParticipation(cible, source, demande.reprise)
  return cible.locuteurRef
}
