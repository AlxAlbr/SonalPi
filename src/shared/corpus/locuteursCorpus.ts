import type { CorpusFichier } from '../format'
import type { EntreeMatrice } from './requetes'
import { blocsParoleDepuisDocument, statistiquesLocuteurs } from '../entretien/statistiquesLocuteurs'

export interface ParticipationLocuteurCorpus {
  entretienId: string
  entretienTitre: string
  locuteurId: string
  nom: string
}

export interface LocuteurCorpus {
  cle: string
  nom: string
  personneId: string | null
  participations: ParticipationLocuteurCorpus[]
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
  locuteurs: LocuteurCorpus[]
  entretiens: EntretienLocuteursCorpus[]
  indisponibles: { id: string; titre: string; raison: string }[]
}

function projeterEntretien(corpus: CorpusFichier, entretien: EntreeMatrice) {
  const groupes = new Map<string, LocuteurCorpus>()
  const parIndex = new Map<number, LocuteurCorpus>()
  for (const locuteur of entretien.data.locuteurs) {
    if (!locuteur.id) throw new Error('Les identifiants des locuteurs doivent être complétés avant la consultation.')
    const personne = locuteur.personneRef && Object.hasOwn(corpus.personnes ?? {}, locuteur.personneRef)
      ? corpus.personnes[locuteur.personneRef] : null
    const cle = personne
      ? JSON.stringify(['personne', personne.id])
      : JSON.stringify(['locuteur', entretien.id, locuteur.id])
    let groupe = groupes.get(cle)
    if (!groupe) {
      groupe = {
        cle, nom: (personne?.nom ?? locuteur.nom).trim() || 'Locuteur sans nom',
        personneId: personne?.id ?? null, participations: [], mots: 0, interventions: 0,
      }
      groupes.set(cle, groupe)
    }
    groupe.participations.push({
      entretienId: entretien.id, entretienTitre: entretien.titre, locuteurId: locuteur.id, nom: locuteur.nom,
    })
    parIndex.set(locuteur.index, groupe)
  }
  const blocs = blocsParoleDepuisDocument(entretien.data.corpsTexte)
  const bilan = statistiquesLocuteurs(blocs, entretien.data.locuteurs, [])
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
export function projeterLocuteursCorpus(corpus: CorpusFichier, entretiens: EntreeMatrice[]): VueLocuteursCorpus {
  const groupes = new Map<string, LocuteurCorpus>()
  const resultats: EntretienLocuteursCorpus[] = []
  const indisponibles: VueLocuteursCorpus['indisponibles'] = []
  for (const entree of entretiens) {
    try {
      const projection = projeterEntretien(corpus, entree)
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
