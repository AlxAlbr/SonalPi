import type { Locuteur } from '../format'
import { compterMotsProseMirror } from '../corpus/ordreEntretiens'
import { projeterAncres, type Ancre } from './audio'

export interface BlocParole {
  pos: number
  longueur: number
  texte: string
  loc: number | null
}

export interface TourParole {
  loc: number | null
  pos: number
  debut: number
  fin: number
  mots: number
}

export interface StatistiqueLocuteur {
  loc: number | null
  mots: number
  interventions: number
  positions: number[]
  pourcentage: number
  secondes: number | null
  dureePartielle: boolean
}

export interface StatistiquesLocuteurs {
  lignes: StatistiqueLocuteur[]
  tours: TourParole[]
  totalMots: number
  motsEnqueteurs: number
  pourcentageEnqueteurs: number
  reperesIncoherents: boolean
}

/** Calcule le bilan depuis le texte, sans compter les libellés affichés autour des paroles. */
export function statistiquesLocuteurs(
  blocs: BlocParole[],
  locuteurs: Locuteur[],
  ancres: Ancre[],
): StatistiquesLocuteurs {
  const connus = new Map(locuteurs.map((locuteur) => [locuteur.index, locuteur]))
  const parLoc = new Map<number | null, StatistiqueLocuteur & { longueur: number; couverte: number }>()
  const xBlocs: number[] = []
  const locs: (number | null)[] = []
  const groupes: Array<TourParole & { contientTexte: boolean }> = []
  let x = 0
  for (const bloc of blocs) {
    const loc = bloc.loc != null && connus.has(bloc.loc) ? bloc.loc : null
    locs.push(loc)
    xBlocs.push(x)
    const mots = compterMotsProseMirror({ text: bloc.texte })
    if (!parLoc.has(loc)) {
      parLoc.set(loc, { loc, mots: 0, interventions: 0, positions: [], pourcentage: 0, secondes: null, dureePartielle: false, longueur: 0, couverte: 0 })
    }
    const ligne = parLoc.get(loc)!
    ligne.mots += mots
    ligne.longueur += bloc.longueur
    const precedent = groupes.at(-1)
    if (precedent && precedent.loc === loc) {
      precedent.fin = x + bloc.longueur
      precedent.mots += mots
      precedent.contientTexte ||= !!bloc.texte.trim()
    } else {
      groupes.push({ loc, pos: bloc.pos, debut: x, fin: x + bloc.longueur, mots, contientTexte: !!bloc.texte.trim() })
    }
    x += bloc.longueur
  }
  const tours: TourParole[] = groupes.filter((tour) => tour.contientTexte).map(({ contientTexte: _, ...tour }) => tour)
  for (const tour of tours) {
    const ligne = parLoc.get(tour.loc)!
    ligne.interventions++
    ligne.positions.push(tour.pos)
  }

  const borne = blocs.length ? blocs.at(-1)!.pos + blocs.at(-1)!.longueur + 1 : 0
  const reperesIncoherents = ancres.some((ancre, i) =>
    !Number.isFinite(ancre.pos) || !Number.isFinite(ancre.t) || ancre.pos < 0 || ancre.pos > borne || ancre.t < 0
    || (i > 0 && (ancre.pos < ancres[i - 1].pos || ancre.t < ancres[i - 1].t)),
  )
  if (!reperesIncoherents) {
    const projetes = projeterAncres(ancres, blocs.map((bloc) => bloc.longueur))
    let bloc = 0
    for (let i = 0; i < projetes.length - 1; i++) {
      const a = projetes[i]
      const b = projetes[i + 1]
      // Les silences entre deux repères au même endroit du texte ne sont pas attribués.
      if (b.x <= a.x || b.t <= a.t) continue
      while (bloc < blocs.length && xBlocs[bloc] + blocs[bloc].longueur <= a.x) bloc++
      for (let j = bloc; j < blocs.length && xBlocs[j] < b.x; j++) {
        const longueur = Math.min(xBlocs[j] + blocs[j].longueur, b.x) - Math.max(xBlocs[j], a.x)
        if (longueur <= 0) continue
        const ligne = parLoc.get(locs[j])!
        ligne.secondes = (ligne.secondes ?? 0) + (b.t - a.t) * longueur / (b.x - a.x)
        ligne.couverte += longueur
      }
    }
  }
  const totalMots = [...parLoc.values()].reduce((total, ligne) => total + ligne.mots, 0)
  const motsEnqueteurs = [...parLoc.values()].reduce((total, ligne) =>
    total + (ligne.loc != null && connus.get(ligne.loc)?.interviewer ? ligne.mots : 0), 0)
  const lignes = [...parLoc.values()].filter((ligne) => ligne.interventions > 0).map(({ longueur, couverte, ...ligne }) => ({
    ...ligne,
    pourcentage: totalMots ? ligne.mots / totalMots * 100 : 0,
    dureePartielle: ligne.secondes !== null && couverte < longueur - 1e-6,
  })).sort((a, b) => b.mots - a.mots)
  return {
    lignes, tours, totalMots, motsEnqueteurs,
    pourcentageEnqueteurs: totalMots ? motsEnqueteurs / totalMots * 100 : 0,
    reperesIncoherents,
  }
}
