import type { Ancre } from './audio'

/**
 *  Horodatage des tours de parole : les temps d'un tour sont ceux des ancres
 *  mesurées qui tombent dans son texte (jamais un temps interpolé).
 *  Arithmétique pure, sans ProseMirror : testable sans éditeur.
 */

/** Un bloc du document, vu par l'horodatage : début de son contenu, longueur, locuteur. */
export interface BlocHorodatage {
  pos: number
  longueur: number
  loc: number | null
}

/** Un tour de parole et les ancres qui tombent dans son texte. */
export interface TourHorodatage {
  /** Index du premier et du dernier bloc du tour. */
  premierBloc: number
  dernierBloc: number
  /** Positions du début et de la fin du texte du tour. */
  debut: number
  fin: number
  /** Index de la première et de la dernière ancre du tour (`derniereAncre < premiereAncre` : aucune). */
  premiereAncre: number
  derniereAncre: number
}

/** Premier index d'ancre dont la position est ≥ `pos` (dichotomie, ancres triées). */
export function premiereAncreApres(ancres: Ancre[], pos: number): number {
  let bas = 0
  let haut = ancres.length
  while (bas < haut) {
    const mi = (bas + haut) >> 1
    if (ancres[mi].pos < pos) bas = mi + 1
    else haut = mi
  }
  return bas
}

/** Découpe les blocs en tours (blocs consécutifs du même locuteur) et rattache leurs ancres. */
export function toursHorodates(blocs: BlocHorodatage[], ancres: Ancre[]): TourHorodatage[] {
  const tours: TourHorodatage[] = []
  let k = 0
  while (k < blocs.length) {
    let j = k
    while (j + 1 < blocs.length && blocs[j + 1].loc === blocs[k].loc) j++
    const debut = blocs[k].pos
    const fin = blocs[j].pos + blocs[j].longueur
    const premiereAncre = premiereAncreApres(ancres, debut)
    const derniereAncre = premiereAncreApres(ancres, fin + 1) - 1
    tours.push({ premierBloc: k, dernierBloc: j, debut, fin, premiereAncre, derniereAncre })
    k = j + 1
  }
  return tours
}

/** Temps de début et de fin d'un tour, s'il porte au moins deux ancres. */
export function bornesTour(tour: TourHorodatage, ancres: Ancre[]): { debut: number; fin: number } | null {
  if (tour.derniereAncre - tour.premiereAncre < 1) return null
  return { debut: ancres[tour.premiereAncre].t, fin: ancres[tour.derniereAncre].t }
}

/** « 0:12.4 » (ou « 1:02:03.4 » au-delà d'une heure), au dixième de seconde. */
export function formaterTemps(t: number): string {
  const dixiemes = Math.round(Math.max(0, t) * 10)
  const h = Math.floor(dixiemes / 36000)
  const m = Math.floor(dixiemes / 600) % 60
  const s = Math.floor(dixiemes / 10) % 60
  const d = dixiemes % 10
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}.${d}` : `${m}:${ss}.${d}`
}

/** « 19,4 s » sous la minute, « 2 min 05 s » au-delà. */
export function formaterDuree(secondes: number): string {
  const s = Math.max(0, secondes)
  if (s < 60) return `${(Math.round(s * 10) / 10).toFixed(1).replace('.', ',')} s`
  const total = Math.round(s)
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, '0')} s`
}

/**
 *  Lit un temps saisi : « 12.4 », « 12,4 », « 0:12.4 » ou « 1:02:03.4 ».
 *  Rend null si la saisie n'est pas un temps.
 */
export function lireTemps(saisie: string): number | null {
  const morceaux = saisie.trim().replace(',', '.').split(':')
  if (morceaux.length > 3 || morceaux.some((m) => !/^\d+(\.\d*)?$/.test(m))) return null
  const valeurs = morceaux.map(Number)
  if (valeurs.slice(1).some((v) => v >= 60)) return null
  return valeurs.reduce((total, v) => total * 60 + v, 0)
}
