import type { CorpusFichier, EntretienFichier, Locuteur, Personne } from '../format'
import type { EntreeMatrice } from './requetes'
import type { LocuteurASeparer } from './contratsLocuteurs'
import { membresPersonnesRegle, type Cas, type RegleCas } from './cas'
import type { Cas as CasNatif } from '../natif/format'
import { associerParticipation, creerLocuteur, regrouperLocuteurs, renommerLocuteur, separerLocuteur, supprimerLocuteurVide, trouverParticipation } from './identitesLocuteurs'
import { lireCasFormat9 } from '../natif/lectureCasFormat9'

export type { CommandePersonnes, LocuteurASeparer } from './contratsLocuteurs'

export interface VueLocuteurPersonne {
  entretienId: string
  entretienTitre: string
  locuteurId: string
  index: number
  nom: string
  interviewer: boolean
  personneRef: string | null
  personneDeliee?: boolean
  valeursLoc: Record<string, string>
  pseudo?: string
  pseudoEtat?: 'confirme' | 'refuse'
  rapprochementsRefuses?: string[]
}

export interface VueNotePersonne {
  entretienId: string
  entretienTitre: string
  id: string
  categorieId: string
  titre: string
  date: string | null
  statut: 'prive' | 'public'
  corps: string
  locuteurIds: string[]
  rang: number
}

export interface InventairePersonnes {
  personnes: Personne[]
  locuteurs: VueLocuteurPersonne[]
  notes: VueNotePersonne[]
  indisponibles: { id: string; titre: string; raison: string }[]
}

/** Projette les identités sans transporter les transcriptions vers l'interface. */
export function inventorierPersonnes(corpus: CorpusFichier, entretiens: EntreeMatrice[]): InventairePersonnes {
  return {
    personnes: Object.values(corpus.personnes ?? {}).sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id)),
    locuteurs: entretiens.flatMap((e) => e.data.locuteurs.map((l) => {
      if (!l.id) throw new Error('Les identifiants des locuteurs doivent être complétés avant l’inventaire.')
      return {
        entretienId: e.id, entretienTitre: e.titre, locuteurId: l.id,
        index: l.index, nom: l.nom, interviewer: l.interviewer === true,
        personneRef: l.personneRef ?? null,
        ...(l.personneDeliee === undefined ? {} : { personneDeliee: l.personneDeliee }),
        valeursLoc: { ...l.valeursLoc }, pseudo: l.pseudo, pseudoEtat: l.pseudoEtat,
        rapprochementsRefuses: [...(l.rapprochementsRefuses ?? [])],
      }
    })),
    notes: entretiens.flatMap((e) => (e.data.notes ?? [])
      .filter((note) => note.locuteurIds?.length)
      .map((note) => ({
        entretienId: e.id,
        entretienTitre: e.titre,
        id: note.id,
        categorieId: note.categorieId,
        titre: note.titre,
        date: note.date,
        statut: note.statut,
        corps: note.corps,
        locuteurIds: [...(note.locuteurIds ?? [])],
        rang: note.rang,
      }))),
    indisponibles: [],
  }
}

/** Pont d'écriture limité aux champs d'association tant que le stockage reste au format 9. */
function associationsEntretienFormat9(entretien: EntretienFichier) {
  const data = { participations: entretien.locuteurs.map((l) => ({
    id: l.id, locuteurRef: l.personneRef, associationRetiree: l.personneDeliee,
  })) }
  return { data, appliquer: () => {
    data.participations.forEach((participation, i) => {
      const locuteur = entretien.locuteurs[i]
      locuteur.personneRef = participation.locuteurRef
      if (participation.associationRetiree === undefined) delete locuteur.personneDeliee
      else locuteur.personneDeliee = participation.associationRetiree
    })
  } }
}

export function creerPersonne(corpus: CorpusFichier, id: string, nom: string): Personne {
  const modele = { locuteurs: corpus.personnes ?? {} }
  const locuteur = creerLocuteur(modele, id, nom)
  corpus.personnes = modele.locuteurs
  return locuteur
}

export function modifierPersonne(corpus: CorpusFichier, id: string, nom: string): void {
  renommerLocuteur({ locuteurs: corpus.personnes ?? {} }, id, nom)
}

export function trouverLocuteur(entretien: EntretienFichier, locuteurId: string): Locuteur {
  return trouverParticipation({ participations: entretien.locuteurs }, locuteurId)
}

/** Un lien ne renomme jamais le locuteur et ne modifie pas ses valeurs. */
export function lierLocuteur(corpus: CorpusFichier, entretien: EntretienFichier, locuteurId: string, personneId: string | null): void {
  const modele = associationsEntretienFormat9(entretien)
  associerParticipation({ locuteurs: corpus.personnes ?? {} }, modele.data, locuteurId, personneId)
  modele.appliquer()
}

/** Les chaînes du format 9 gardent leur portée historique, sans contexte inventé. */
export function reconcilierRefusFormat9(
  entretiens: EntreeMatrice[], conserverId: string, absorberIds: ReadonlySet<string>, membres: ReadonlySet<string>,
): void {
  for (const e of entretiens) for (const l of e.data.locuteurs) {
    if (l.rapprochementsRefuses) {
      l.rapprochementsRefuses = [...new Set(l.rapprochementsRefuses
        .map((r) => r.startsWith('personne:') && absorberIds.has(r.slice('personne:'.length)) ? `personne:${conserverId}` : r)
        .filter((r) => l.personneRef !== conserverId || (r !== `personne:${conserverId}` && !membres.has(r))))]
    }
  }
}

export function reporterReglesCasFormat9(cas: Cas, source: CasNatif): void {
  cas.regles = source.regles.map((r): RegleCas => {
    if (r.type === 'locuteur') return { type: 'personne', personneId: r.locuteurId, inclureEnqueteurs: r.inclureEnqueteurs }
    if (r.type === 'locuteurs') return { type: 'personnes', membres: r.membres.map((m) => ({ personneId: m.locuteurId, inclureEnqueteurs: m.inclureEnqueteurs })) }
    if (r.type === 'modalite' && r.portee === 'participation') return { ...r, portee: 'locuteur' }
    return r
  })
  cas.modifieLe = source.modifieLe
}

/** Regroupe les identités sans propager de données locales. */
export function fusionnerPersonnes(corpus: CorpusFichier, entretiens: EntreeMatrice[], conserverId: string, absorberId: string): void {
  const appartient = (ref: string | null) => ref === conserverId || ref === absorberId
  const membres = new Set(entretiens.flatMap((e) => e.data.locuteurs.filter((l) => appartient(l.personneRef)).map((l) => `locuteur:${l.id}`)))
  const modeles = entretiens.map((e) => ({ ...associationsEntretienFormat9(e.data), id: e.id, titre: e.titre }))
  const casNatifs = Object.fromEntries(Object.entries(corpus.cas ?? {}).map(([id, cas]) => [id, lireCasFormat9(cas)]))
  const casModifies = Object.entries(corpus.cas ?? {}).filter(([, cas]) =>
    cas.regles.some((r) => membresPersonnesRegle(r).some((m) => m.personneId === absorberId)))
  regrouperLocuteurs({ locuteurs: corpus.personnes, cas: casNatifs }, modeles, conserverId, absorberId)
  for (const modele of modeles) modele.appliquer()
  reconcilierRefusFormat9(entretiens, conserverId, new Set([absorberId]), membres)
  for (const [id, cas] of casModifies) reporterReglesCasFormat9(cas, casNatifs[id])
}

/** Crée une identité avec une partie des locuteurs d'une personne existante. */
export function separerPersonne(
  corpus: CorpusFichier,
  entretiens: EntreeMatrice[],
  personneId: string,
  nouvelleId: string,
  nom: string,
  selection: LocuteurASeparer[],
): Personne {
  const modeles = entretiens.map((e) => ({ ...associationsEntretienFormat9(e.data), id: e.id, titre: e.titre }))
  const nouvelle = separerLocuteur({ locuteurs: corpus.personnes }, modeles, personneId, nouvelleId, nom,
    selection.map((p) => ({ entretienId: p.entretienId, participationId: p.locuteurId })))
  for (const modele of modeles) modele.appliquer()
  return nouvelle
}

/** Une lecture incomplète ne permet pas de prouver qu'une personne est vide. */
export function supprimerPersonneVide(corpus: CorpusFichier, inventaire: InventairePersonnes, id: string): void {
  supprimerLocuteurVide({
    locuteurs: corpus.personnes ?? {},
    cas: Object.fromEntries(Object.entries(corpus.cas ?? {}).map(([cle, cas]) => [cle, lireCasFormat9(cas)])),
  }, {
    indisponibles: inventaire.indisponibles,
    participations: inventaire.locuteurs.map((p) => ({
      locuteurRef: p.personneRef,
      rapprochementsRefuses: p.rapprochementsRefuses?.filter((r) => r.startsWith('personne:'))
        .map((r) => ({ type: 'locuteur' as const, locuteurId: r.slice('personne:'.length) })),
    })),
  }, id)
}
