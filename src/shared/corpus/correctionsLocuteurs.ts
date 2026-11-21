import type { ParticipationLocuteur, ReferenceParticipation } from '../locuteurs'
import type { CorpusFichier } from "../format"
import { validerCommandeCorrectionLocuteurs, type CommandeCorrectionLocuteurs } from './contratsLocuteurs'
import { creerLocuteur, regrouperLocuteurs, renommerLocuteur, supprimerLocuteurVide } from './identitesLocuteurs'
import { cleRefusRapprochement, refuserRapprochementLocuteurs, reprendreDonneesParticipation } from './rapprochementsLocuteurs'

export type { CommandeCorrectionLocuteurs } from './contratsLocuteurs'

type CorpusCorrection = Pick<CorpusFichier, 'locuteurs' | 'cas'>
type ParticipationCorrection = Pick<ParticipationLocuteur, 'id' | 'nom' | 'locuteurRef' | 'associationRetiree' | 'rapprochementsRefuses'>
  & Partial<Pick<ParticipationLocuteur, 'pseudo' | 'pseudoEtat' | 'interviewer' | 'valeursLoc'>>
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
  const tous = entretiens.flatMap((e) => e.data.participations.map((participation) => ({ entretienId: e.id, participation })))
  const retrouver = (r: ReferenceParticipation) => {
    const membre = tous.find((m) => m.entretienId === r.entretienId && m.participation.id === r.participationId)
    if (!membre) throw new Error('Une voix sélectionnée a changé. Actualisez la liste.')
    return membre
  }
  const groupe = (m: typeof tous[number]) => m.participation.locuteurRef && Object.hasOwn(corpus.locuteurs, m.participation.locuteurRef)
    ? tous.filter((p) => p.participation.locuteurRef === m.participation.locuteurRef) : [m]
  if (commande.type === 'reprendreInformations') {
    const a = retrouver(commande.reference), b = retrouver(commande.source)
    const cible = a.participation, source = b.participation
    if (a.entretienId === b.entretienId || !cible.locuteurRef || cible.locuteurRef !== source.locuteurRef
      || !Object.hasOwn(corpus.locuteurs, cible.locuteurRef) || !cible.valeursLoc || !source.valeursLoc) throw new Error('Choisissez deux entretiens du même locuteur pour reprendre ses informations.')
    const donnees = { ...cible, valeursLoc: cible.valeursLoc }
    reprendreDonneesParticipation(donnees, { ...source, valeursLoc: source.valeursLoc }, commande.choix)
    Object.assign(cible, { pseudo: donnees.pseudo, pseudoEtat: donnees.pseudoEtat, interviewer: donnees.interviewer })
    return cible.locuteurRef
  }
  if (commande.type === 'supprimerVide') {
    supprimerLocuteurVide(corpus, { participations: tous.map((m) => m.participation), indisponibles: [] }, commande.locuteurId)
    return commande.locuteurId
  }
  if (commande.type === 'individualiserSelection') {
    const ids = new Set<string>()
    const nouveaux = commande.participations.map((r) => {
      const membre = retrouver(r), p = membre.participation
      if (p.locuteurRef && Object.hasOwn(corpus.locuteurs, p.locuteurRef)) throw new Error('Un locuteur est déjà identifié. Actualisez la sélection.')
      const nom = nomValide(p.nom), id = genererId()
      if (!id || ids.has(id) || Object.hasOwn(corpus.locuteurs, id)) throw new Error('Un identifiant de locuteur est déjà utilisé ou invalide.')
      ids.add(id)
      return { p, nom, id }
    })
    for (const { p, nom, id } of nouveaux) { creerLocuteur(corpus, id, nom); p.locuteurRef = id; delete p.associationRetiree }
    return nouveaux[0].id
  }
  if (commande.type === 'ecarterRapprochement') {
    const a = retrouver(commande.reference), b = retrouver(commande.cible)
    if (a.entretienId === b.entretienId || groupe(a).includes(b)) throw new Error('Choisissez deux locuteurs distincts dans des entretiens différents.')
    const cible = (m: typeof a) => ({ ...m, participation: { ...m.participation,
      locuteurRef: m.participation.locuteurRef && Object.hasOwn(corpus.locuteurs, m.participation.locuteurRef) ? m.participation.locuteurRef : null } })
    refuserRapprochementLocuteurs(a.participation, cible(b))
    refuserRapprochementLocuteurs(b.participation, cible(a))
    return a.participation.locuteurRef ?? ''
  }
  if (commande.type === 'retablirRapprochement') {
    const origine = retrouver(commande.reference), refus = commande.cible
    if (!origine.participation.rapprochementsRefuses?.some((r) => cleRefusRapprochement(r) === cleRefusRapprochement(refus))) throw new Error('Cette distinction a changé. Actualisez la liste.')
    const a = groupe(origine)
    const cible = refus.type === 'locuteur'
      ? tous.find((m) => m.participation.locuteurRef === refus.locuteurId && Object.hasOwn(corpus.locuteurs, refus.locuteurId))
      : tous.find((m) => m.entretienId === refus.entretienId && m.participation.id === refus.participationId)
    const b = cible ? groupe(cible) : []
    const vise = (r: typeof refus, membres: typeof tous) => r.type === 'locuteur'
      ? membres.some((m) => m.participation.locuteurRef === r.locuteurId && Object.hasOwn(corpus.locuteurs, r.locuteurId))
      : membres.some((m) => m.entretienId === r.entretienId && m.participation.id === r.participationId)
    for (const m of a) if (m.participation.rapprochementsRefuses) m.participation.rapprochementsRefuses = m.participation.rapprochementsRefuses.filter((r) => !vise(r, b) && cleRefusRapprochement(r) !== cleRefusRapprochement(refus))
    for (const m of b) if (m.participation.rapprochementsRefuses) m.participation.rapprochementsRefuses = m.participation.rapprochementsRefuses.filter((r) => !vise(r, a))
    return origine.participation.locuteurRef ?? ''
  }
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
