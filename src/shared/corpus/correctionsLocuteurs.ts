import type { CorpusFichier, Locuteur } from '../format'
import type { EntreeMatrice } from './requetes'
import type { LocuteurASeparer } from './personnes'
import { creerPersonne, fusionnerPersonnes, modifierPersonne } from './personnes'
import { refuserRapprochement } from './rapprochementsPersonnes'

export type CommandeCorrectionLocuteurs =
  | { type: 'renommerGlobal'; personneId: string; nom: string; attendu: string }
  | { type: 'regrouperSelection'; personneIds: string[]; conserverId: string; nom: string; uniformiserNoms: boolean; attendu: string }
  | { type: 'dissocierSelection'; personneId: string; locuteurs: LocuteurASeparer[]; attendu: string }

function nomValide(nom: string): string {
  const valeur = nom.trim()
  if (!valeur) throw new Error('Le nom du locuteur ne peut pas être vide.')
  return valeur
}

function membresPersonne(entretiens: EntreeMatrice[], personneId: string) {
  return entretiens.flatMap((entretien) => entretien.data.locuteurs
    .filter((locuteur) => locuteur.personneRef === personneId)
    .map((locuteur) => ({ entretienId: entretien.id, locuteur })))
}

function renommer(corpus: CorpusFichier, entretiens: EntreeMatrice[], personneId: string, nom: string) {
  modifierPersonne(corpus, personneId, nom)
  for (const membre of membresPersonne(entretiens, personneId)) membre.locuteur.nom = nom
}

/** Applique une correction à des copies complètes, avant leur enregistrement en une transaction. */
export function appliquerCorrectionLocuteurs(
  corpus: CorpusFichier,
  entretiens: EntreeMatrice[],
  commande: CommandeCorrectionLocuteurs,
  genererId: () => string,
): string {
  if (commande.type === 'renommerGlobal') {
    const nom = nomValide(commande.nom)
    renommer(corpus, entretiens, commande.personneId, nom)
    return commande.personneId
  }

  if (commande.type === 'regrouperSelection') {
    const nom = nomValide(commande.nom)
    const ids = new Set(commande.personneIds)
    if (ids.size < 2 || ids.size !== commande.personneIds.length || !ids.has(commande.conserverId)) {
      throw new Error('Choisissez au moins deux locuteurs distincts et un nom à conserver.')
    }
    if (typeof commande.uniformiserNoms !== 'boolean') {
      throw new Error('Choisissez de conserver les noms des entretiens ou de les remplacer.')
    }
    if ([...ids].some((id) => !Object.hasOwn(corpus.personnes, id))) {
      throw new Error('Un locuteur sélectionné n’existe plus. Actualisez la liste.')
    }
    for (const entretien of entretiens) {
      if (entretien.data.locuteurs.filter((locuteur) => locuteur.personneRef && ids.has(locuteur.personneRef)).length > 1) {
        throw new Error(`Réunion impossible : plusieurs locuteurs appartiennent à « ${entretien.titre} ». Corrigez cet entretien avant de les réunir.`)
      }
    }
    for (const id of ids) {
      if (id !== commande.conserverId) fusionnerPersonnes(corpus, entretiens, commande.conserverId, id)
    }
    if (commande.uniformiserNoms) renommer(corpus, entretiens, commande.conserverId, nom)
    else modifierPersonne(corpus, commande.conserverId, nom)
    return commande.conserverId
  }

  if (!Object.hasOwn(corpus.personnes, commande.personneId)) {
    throw new Error('Ce locuteur n’existe plus. Actualisez la liste.')
  }
  const membres = membresPersonne(entretiens, commande.personneId)
  if (!commande.locuteurs.length) throw new Error('Choisissez au moins une participation à dissocier.')
  if (commande.locuteurs.length >= membres.length) {
    throw new Error('Laissez au moins une participation sur le locuteur d’origine.')
  }
  const cle = (membre: LocuteurASeparer) => JSON.stringify([membre.entretienId, membre.locuteurId])
  const parCle = new Map(membres.map((membre) => [
    cle({ entretienId: membre.entretienId, locuteurId: membre.locuteur.id! }), membre.locuteur,
  ]))
  const cles = commande.locuteurs.map(cle)
  if (new Set(cles).size !== cles.length) throw new Error('Une participation est sélectionnée plusieurs fois.')
  const selection = cles.map((valeur) => parCle.get(valeur))
  if (selection.some((locuteur) => !locuteur)) {
    throw new Error('Une participation n’est plus associée à ce locuteur. Actualisez la liste.')
  }

  const ids = new Set<string>()
  const nouvelles = selection.map((locuteur) => {
    const id = genererId()
    if (!id || id in corpus.personnes || ids.has(id)) {
      throw new Error('Un identifiant de locuteur est déjà utilisé ou invalide.')
    }
    ids.add(id)
    return { locuteur: locuteur as Locuteur, id, nom: nomValide(locuteur!.nom) }
  })
  for (const nouvelle of nouvelles) {
    creerPersonne(corpus, nouvelle.id, nouvelle.nom)
    nouvelle.locuteur.personneRef = nouvelle.id
    delete nouvelle.locuteur.personneDeliee
  }
  // La distinction volontaire vaut aussi entre les participations dissociées.
  for (let i = 0; i < membres.length; i++) {
    for (let j = i + 1; j < membres.length; j++) {
      const a = membres[i].locuteur, b = membres[j].locuteur
      if (a.personneRef === b.personneRef) continue
      refuserRapprochement(a, b)
      refuserRapprochement(b, a)
    }
  }
  return commande.personneId
}
