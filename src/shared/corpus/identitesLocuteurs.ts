import type { Locuteur, ParticipationLocuteur } from '../locuteurs'
import type { CorpusFichier, MembreLocuteurCas, RegleCas } from "../format"
import { membresLocuteursRegle } from '../natif/lectureCas'
import { cleRefusRapprochement } from './rapprochementsLocuteurs'
import { participationParId } from '../entretien/participations'

type CorpusIdentites = Pick<CorpusFichier, 'locuteurs'>
/** Champs d'association uniquement ; les ids manquants ne sont pas créés ici. */
type ParticipationAssociation = Pick<ParticipationLocuteur, 'locuteurRef' | 'associationRetiree'>
  & Partial<Pick<ParticipationLocuteur, 'id'>>

interface EntretienAssociations<T extends ParticipationAssociation> {
  id: string
  titre: string
  data: { participations: readonly T[] }
}

function nomValide(nom: string): string {
  const valeur = nom.trim()
  if (!valeur) throw new Error('Le nom du locuteur ne peut pas être vide.')
  return valeur
}

/** Aucun enregistrement ne peut réintroduire une identité retirée du corpus. */
export function verifierReferencesLocuteurs(entretien: { participations: readonly Pick<ParticipationLocuteur, 'locuteurRef' | 'rapprochementsRefuses'>[] }, corpus: CorpusIdentites): void {
  for (const p of entretien.participations) {
    const ids = [p.locuteurRef, ...(p.rapprochementsRefuses ?? []).flatMap((r) => r.type === 'locuteur' ? [r.locuteurId] : [])]
    if (ids.some((id) => id && (!corpus.locuteurs || !Object.hasOwn(corpus.locuteurs, id)))) {
      throw new Error('Les associations des locuteurs ont changé. Rouvrez cet entretien avant de poursuivre les modifications.')
    }
  }
}

export function creerLocuteur(corpus: CorpusIdentites, id: string, nom: string): Locuteur {
  const valeur = nomValide(nom)
  if (!id || Object.hasOwn(corpus.locuteurs, id)) throw new Error('Identifiant de locuteur déjà utilisé ou invalide.')
  const locuteur: Locuteur = { id, nom: valeur }
  Object.defineProperty(corpus.locuteurs, id, { value: locuteur, enumerable: true, configurable: true, writable: true })
  return locuteur
}

export function renommerLocuteur(corpus: CorpusIdentites, id: string, nom: string): void {
  if (!Object.hasOwn(corpus.locuteurs, id)) throw new Error('Ce locuteur n’existe plus.')
  corpus.locuteurs[id].nom = nomValide(nom)
}

export function trouverParticipation<T extends { id?: string }>(entretien: { participations: readonly T[] }, participationId: string): T {
  const participation = participationParId(entretien.participations, participationId)
  if (!participation) throw new Error('Cette participation n’existe plus. Actualisez le répertoire des locuteurs.')
  return participation
}

/** L'association ne transfère aucune donnée locale et ne renomme aucune étiquette. */
export function associerParticipation<T extends ParticipationAssociation>(
  corpus: CorpusIdentites,
  entretien: { participations: readonly T[] },
  participationId: string,
  locuteurId: string | null,
): void {
  const participation = trouverParticipation(entretien, participationId)
  if (locuteurId !== null) {
    if (!Object.hasOwn(corpus.locuteurs, locuteurId)) throw new Error('Ce locuteur n’existe plus.')
    if (entretien.participations.some((p) => p.id !== participationId && p.locuteurRef === locuteurId)) {
      throw new Error('Ce locuteur est déjà présent dans cet entretien. Corrigez les associations avant de les rapprocher.')
    }
  }
  participation.locuteurRef = locuteurId
  if (locuteurId === null) participation.associationRetiree = true
  else delete participation.associationRetiree
}

/** Regroupe les références sur des copies complètes, sans propager les données locales. */
export function regrouperLocuteurs<T extends ParticipationAssociation & Pick<ParticipationLocuteur, 'rapprochementsRefuses'>>(
  corpus: CorpusIdentites & Pick<CorpusFichier, 'cas'>,
  entretiens: readonly EntretienAssociations<T>[],
  conserverId: string,
  absorberId: string,
  maintenant: () => string = () => new Date().toISOString(),
): void {
  if (conserverId === absorberId || !Object.hasOwn(corpus.locuteurs, conserverId) || !Object.hasOwn(corpus.locuteurs, absorberId)) {
    throw new Error('Choisissez deux locuteurs distincts existants.')
  }
  const appartient = (ref: string | null) => ref === conserverId || ref === absorberId
  for (const e of entretiens) {
    if (e.data.participations.filter((p) => appartient(p.locuteurRef)).length > 1) {
      throw new Error(`Réunion impossible : plusieurs participations appartiennent à « ${e.titre} ». Corrigez cet entretien avant de les réunir.`)
    }
  }
  const membres = new Set(entretiens.flatMap((e) => e.data.participations
    .filter((p) => appartient(p.locuteurRef) && p.id)
    .map((p) => JSON.stringify(['participation', e.id, p.id]))))
  const casModifies = Object.values(corpus.cas ?? {}).flatMap((cas) => {
    const membresCas = cas.regles.flatMap(membresLocuteursRegle)
    if (!membresCas.some((m) => m.locuteurId === absorberId)) return []
    const reunis = new Map<string, MembreLocuteurCas>()
    for (const membre of membresCas) {
      const id = membre.locuteurId === absorberId ? conserverId : membre.locuteurId
      reunis.set(id, { locuteurId: id, inclureEnqueteurs: membre.inclureEnqueteurs || reunis.get(id)?.inclureEnqueteurs === true })
    }
    let inseree = false
    const regles = cas.regles.flatMap((regle): RegleCas[] => {
      if (regle.type !== 'locuteur' && regle.type !== 'locuteurs') return [regle]
      if (inseree) return []
      inseree = true
      return [{ type: 'locuteurs', membres: [...reunis.values()] }]
    })
    return [{ cas, regles, date: maintenant() }]
  })
  for (const e of entretiens) for (const p of e.data.participations) {
    if (appartient(p.locuteurRef)) p.locuteurRef = conserverId
    if (p.rapprochementsRefuses !== undefined) {
      const vus = new Set<string>()
      p.rapprochementsRefuses = p.rapprochementsRefuses
        .map((r) => r.type === 'locuteur' && r.locuteurId === absorberId ? { ...r, locuteurId: conserverId } : r)
        .filter((r) => {
          const cle = cleRefusRapprochement(r)
          if (p.locuteurRef === conserverId && (cle === JSON.stringify(['locuteur', conserverId]) || membres.has(cle))) return false
          if (vus.has(cle)) return false
          vus.add(cle)
          return true
        })
    }
  }
  for (const { cas, regles, date } of casModifies) {
    cas.regles = regles
    cas.modifieLe = date
  }
  delete corpus.locuteurs[absorberId]
}

export interface InventaireAssociationsLocuteurs {
  participations: readonly Pick<ParticipationLocuteur, 'locuteurRef' | 'rapprochementsRefuses'>[]
  indisponibles: readonly { id: string; titre: string; raison: string }[]
}

/** Une identité vide reste conservée tant que ses usages ne sont pas tous vérifiés. */
export function supprimerLocuteurVide(
  corpus: CorpusIdentites & Pick<CorpusFichier, 'cas'>,
  inventaire: InventaireAssociationsLocuteurs,
  id: string,
): void {
  if (inventaire.indisponibles.length) throw new Error('Suppression impossible : certains entretiens sont illisibles.')
  if (!Object.hasOwn(corpus.locuteurs, id)) throw new Error('Ce locuteur n’existe plus.')
  if (inventaire.participations.some((p) => p.locuteurRef === id)) throw new Error('Déliez les participations avant de supprimer ce locuteur.')
  const casDependants = Object.values(corpus.cas ?? {}).filter((cas) =>
    cas.regles.some((regle) => membresLocuteursRegle(regle).some((m) => m.locuteurId === id)))
  if (casDependants.length) {
    throw new Error(`Ce locuteur est utilisé par les règles des cas : ${casDependants.map((cas) => cas.nom).join(', ')}. Traitez ces cas avant de le supprimer.`)
  }
  if (inventaire.participations.some((p) => p.rapprochementsRefuses?.some((r) => r.type === 'locuteur' && r.locuteurId === id))) {
    throw new Error('Ce locuteur est encore cité dans des rapprochements refusés. Examinez ces refus avant de le supprimer.')
  }
  delete corpus.locuteurs[id]
}
