import type { ParticipationLocuteur, ReferenceParticipation } from '../locuteurs'
import type { CorpusFichier } from '../natif/format'
import { validerCommandeCorrectionLocuteurs, type CommandeCorrectionLocuteurs } from './contratsLocuteurs'
import { creerLocuteur, regrouperLocuteurs, renommerLocuteur } from './identitesLocuteurs'
import { refuserRapprochementLocuteurs } from './rapprochementsLocuteurs'

export type { CommandeCorrectionLocuteurs } from './contratsLocuteurs'

type CorpusCorrection = Pick<CorpusFichier, 'locuteurs' | 'cas'>
type ParticipationCorrection = Pick<ParticipationLocuteur, 'id' | 'nom' | 'locuteurRef' | 'associationRetiree' | 'rapprochementsRefuses'>
interface EntretienCorrection<T extends ParticipationCorrection> {
  id: string
  titre: string
  data: { participations: T[] }
}

function nomValide(nom: string): string {
  const valeur = nom.trim()
  if (!valeur) throw new Error('Le nom du locuteur ne peut pas être vide.')
  return valeur
}

function membresLocuteur<T extends ParticipationCorrection>(entretiens: readonly EntretienCorrection<T>[], locuteurId: string) {
  return entretiens.flatMap((e) => e.data.participations.filter((p) => p.locuteurRef === locuteurId)
    .map((participation) => ({ entretienId: e.id, participation })))
}

function renommer<T extends ParticipationCorrection>(corpus: CorpusCorrection, entretiens: readonly EntretienCorrection<T>[], locuteurId: string, nom: string) {
  renommerLocuteur(corpus, locuteurId, nom)
  for (const membre of membresLocuteur(entretiens, locuteurId)) membre.participation.nom = nom
}

/** Applique une correction à des copies complètes, avant leur enregistrement en une transaction. */
export function appliquerCorrectionLocuteurs<T extends ParticipationCorrection>(
  corpus: CorpusCorrection,
  entretiens: readonly EntretienCorrection<T>[],
  commande: CommandeCorrectionLocuteurs,
  genererId: () => string,
): string {
  validerCommandeCorrectionLocuteurs(commande)
  if (commande.type === 'renommerGlobal') {
    const nom = nomValide(commande.nom)
    renommer(corpus, entretiens, commande.locuteurId, nom)
    return commande.locuteurId
  }
  if (commande.type === 'regrouperSelection') {
    const nom = nomValide(commande.nom)
    const ids = new Set(commande.locuteurIds)
    if ([...ids].some((id) => !Object.hasOwn(corpus.locuteurs, id))) {
      throw new Error('Un locuteur sélectionné n’existe plus. Actualisez la liste.')
    }
    for (const e of entretiens) {
      if (e.data.participations.filter((p) => p.locuteurRef && ids.has(p.locuteurRef)).length > 1) {
        throw new Error(`Réunion impossible : plusieurs locuteurs appartiennent à « ${e.titre} ». Corrigez cet entretien avant de les réunir.`)
      }
    }
    for (const id of ids) if (id !== commande.conserverId) regrouperLocuteurs(corpus, entretiens, commande.conserverId, id)
    if (commande.uniformiserNoms) renommer(corpus, entretiens, commande.conserverId, nom)
    else renommerLocuteur(corpus, commande.conserverId, nom)
    return commande.conserverId
  }
  if (!Object.hasOwn(corpus.locuteurs, commande.locuteurId)) throw new Error('Ce locuteur n’existe plus. Actualisez la liste.')
  const membres = membresLocuteur(entretiens, commande.locuteurId)
  if (commande.participations.length >= membres.length) throw new Error('Laissez au moins une participation sur le locuteur d’origine.')
  const cle = (p: ReferenceParticipation) => JSON.stringify([p.entretienId, p.participationId])
  const parCle = new Map(membres.map((m) => [cle({ entretienId: m.entretienId, participationId: m.participation.id }), m.participation]))
  const selection = commande.participations.map((p) => parCle.get(cle(p)))
  if (selection.some((p) => !p)) throw new Error('Une participation n’est plus associée à ce locuteur. Actualisez la liste.')
  const ids = new Set<string>()
  const nouvelles = selection.map((participation) => {
    const id = genererId()
    if (!id || Object.hasOwn(corpus.locuteurs, id) || ids.has(id)) throw new Error('Un identifiant de locuteur est déjà utilisé ou invalide.')
    ids.add(id)
    return { participation: participation!, id, nom: nomValide(participation!.nom) }
  })
  for (const nouvelle of nouvelles) {
    creerLocuteur(corpus, nouvelle.id, nouvelle.nom)
    nouvelle.participation.locuteurRef = nouvelle.id
    delete nouvelle.participation.associationRetiree
  }
  // La distinction volontaire vaut aussi entre les participations dissociées.
  for (let i = 0; i < membres.length; i++) for (let j = i + 1; j < membres.length; j++) {
    const a = membres[i], b = membres[j]
    if (a.participation.locuteurRef === b.participation.locuteurRef) continue
    refuserRapprochementLocuteurs(a.participation, b)
    refuserRapprochementLocuteurs(b.participation, a)
  }
  return commande.locuteurId
}
