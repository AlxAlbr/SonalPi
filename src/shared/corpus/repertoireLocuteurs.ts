import type { Locuteur, ParticipationLocuteur, ReferenceParticipation } from '../locuteurs'
import { blocsParoleDepuisDocument, statistiquesLocuteurs } from '../entretien/statistiquesLocuteurs'

export interface ParticipationRepertoireLocuteurs extends ReferenceParticipation {
  entretienTitre: string
  nom: string
}

/** Ligne calculée pour la consultation, jamais enregistrée comme identité. */
export interface LigneRepertoireLocuteurs {
  cle: string
  nom: string
  locuteurId: string | null
  participations: ParticipationRepertoireLocuteurs[]
  mots: number
  interventions: number
}

export interface TourLocuteurCorpus {
  cle: string | null
  nom: string
  pos: number
  debut: number
  fin: number
  mots: number
}

export interface EntretienLocuteursCorpus {
  id: string
  titre: string
  tours: TourLocuteurCorpus[]
}

export interface VueLocuteursCorpus {
  locuteurs: LigneRepertoireLocuteurs[]
  entretiens: EntretienLocuteursCorpus[]
  indisponibles: { id: string; titre: string; raison: string }[]
}

export interface SourceRepertoireLocuteurs {
  id: string
  titre: string
  corpsTexte: unknown
  participations: readonly Pick<ParticipationLocuteur, 'id' | 'index' | 'nom' | 'locuteurRef' | 'interviewer'>[]
}

function projeterEntretien(locuteurs: Readonly<Record<string, Locuteur>>, entretien: SourceRepertoireLocuteurs) {
  const groupes = new Map<string, LigneRepertoireLocuteurs>()
  const parIndex = new Map<number, LigneRepertoireLocuteurs>()
  for (const participation of entretien.participations) {
    if (!participation.id) throw new Error('Les identifiants des participations doivent être complétés avant la consultation.')
    const locuteur = participation.locuteurRef && Object.hasOwn(locuteurs, participation.locuteurRef)
      ? locuteurs[participation.locuteurRef] : null
    const cle = locuteur
      ? JSON.stringify(['locuteur', locuteur.id])
      : JSON.stringify(['participation', entretien.id, participation.id])
    let groupe = groupes.get(cle)
    if (!groupe) {
      groupe = {
        cle, nom: (locuteur?.nom ?? participation.nom).trim() || 'Locuteur sans nom',
        locuteurId: locuteur?.id ?? null, participations: [], mots: 0, interventions: 0,
      }
      groupes.set(cle, groupe)
    }
    groupe.participations.push({
      entretienId: entretien.id, entretienTitre: entretien.titre, participationId: participation.id, nom: participation.nom,
    })
    parIndex.set(participation.index, groupe)
  }
  const blocs = blocsParoleDepuisDocument(entretien.corpsTexte)
  const bilan = statistiquesLocuteurs(blocs, entretien.participations, [])
  for (const ligne of bilan.lignes) {
    const groupe = ligne.loc === null ? undefined : parIndex.get(ligne.loc)
    if (!groupe) continue
    groupe.mots += ligne.mots
    groupe.interventions += ligne.interventions
  }
  const longueur = blocs.reduce((total, bloc) => total + bloc.longueur, 0)
  const tours: TourLocuteurCorpus[] = longueur > 0 ? bilan.tours.map((tour) => {
    const groupe = tour.loc === null ? undefined : parIndex.get(tour.loc)
    return {
      cle: groupe?.cle ?? null, nom: groupe?.nom ?? 'Sans locuteur', pos: tour.pos,
      debut: tour.debut / longueur * 100, fin: tour.fin / longueur * 100, mots: tour.mots,
    }
  }) : []
  return { groupes, entretien: { id: entretien.id, titre: entretien.titre, tours } }
}

/** Réunit les participations connues sans transporter les transcriptions ni modifier les sources. */
export function projeterRepertoireLocuteurs(
  locuteurs: Readonly<Record<string, Locuteur>>,
  entretiens: readonly SourceRepertoireLocuteurs[],
): VueLocuteursCorpus {
  const groupes = new Map<string, LigneRepertoireLocuteurs>()
  const resultats: EntretienLocuteursCorpus[] = []
  const indisponibles: VueLocuteursCorpus['indisponibles'] = []
  for (const entree of entretiens) {
    try {
      const projection = projeterEntretien(locuteurs, entree)
      for (const groupe of projection.groupes.values()) {
        const precedent = groupes.get(groupe.cle)
        if (!precedent) groupes.set(groupe.cle, groupe)
        else {
          precedent.participations.push(...groupe.participations)
          precedent.mots += groupe.mots
          precedent.interventions += groupe.interventions
        }
      }
      resultats.push(projection.entretien)
    } catch (e) {
      indisponibles.push({ id: entree.id, titre: entree.titre, raison: e instanceof Error ? e.message : String(e) })
    }
  }
  return {
    locuteurs: [...groupes.values()].sort((a, b) =>
      a.nom.localeCompare(b.nom, 'fr', { numeric: true })
      || a.participations[0].entretienTitre.localeCompare(b.participations[0].entretienTitre, 'fr')
      || a.cle.localeCompare(b.cle)),
    entretiens: resultats,
    indisponibles,
  }
}
