import { debutBloc } from './positions'

/**
 * Synchro audio (S7, D-S14) — le temps est porté par des ANCRES dans le texte.
 *
 * Une ancre = { pos, t } : une position ProseMirror (remappée aux éditions,
 * comme les annotations — c'est la forme PERSISTÉE) + un temps MESURÉ (bornes
 * de cue SRT ; un format word-level en posera une par mot — même mécanisme,
 * seule la densité change). Jamais de temps fabriqué : l'interpolation D-S13
 * reste une DÉRIVATION à la lecture, au prorata de la longueur de texte entre
 * deux ancres (« requête, pas cache »).
 *
 * Invariants de perf (D-S14, actés pour ~30 000 ancres word-level) :
 *  - les ancres sont des DONNÉES triées (par pos, donc par x), hors DOM ;
 *  - les lookups sont en DICHOTOMIE — aucun balayage linéaire par tick ;
 *  - hypothèse assumée : les temps sont croissants dans l'ordre du texte
 *    (vrai d'un SRT chronologique ; un collage exotique dégrade le surlignage,
 *    jamais la stabilité).
 */

/** Ancre temporelle PERSISTÉE : position ProseMirror + temps mesuré (secondes). */
export interface Ancre {
  pos: number
  t: number
}

/** Projection d'une ancre en coordonnée TEXTE cumulée (les frontières de blocs
 *  ont une largeur nulle : fin du bloc k et début du bloc k+1 partagent le même
 *  x — c'est voulu, l'interpolation est au prorata du texte seul). */
export interface AncreTexte {
  x: number
  t: number
}

/**
 * Projette les ancres PM en coordonnées texte, en co-parcourant blocs et ancres
 * (O(n), une passe — jamais O(ancres × blocs)). `longueurs` = longueur de texte
 * de chaque bloc, dans l'ordre du doc ; les ancres arrivent triées par `pos`.
 * Une pos tombée sur une frontière de bloc (après remap) est ramenée au bord.
 */
export function projeterAncres(ancres: Ancre[], longueurs: number[]): AncreTexte[] {
  const out: AncreTexte[] = []
  let k = 0
  let debut = debutBloc(longueurs, 0)
  let cumul = 0
  for (const a of ancres) {
    while (k < longueurs.length && a.pos > debut + longueurs[k]) {
      cumul += longueurs[k]
      debut += 2 + longueurs[k]
      k++
    }
    if (k >= longueurs.length) {
      out.push({ x: cumul, t: a.t })
      continue
    }
    out.push({ x: cumul + Math.max(0, Math.min(longueurs[k], a.pos - debut)), t: a.t })
  }
  return out
}

/** Dernier index i tel que `valeur(i) <= cible` (dichotomie), ou -1. */
function dernierIndex(n: number, cible: number, valeur: (i: number) => number): number {
  let bas = 0
  let haut = n - 1
  let res = -1
  while (bas <= haut) {
    const mi = (bas + haut) >> 1
    if (valeur(mi) <= cible) {
      res = mi
      bas = mi + 1
    } else {
      haut = mi - 1
    }
  }
  return res
}

/**
 * Plage en cours de lecture à l'instant `t` : les indices {g, d} des deux ancres
 * qui l'encadrent, plage NON VIDE en texte (x_d > x_g). Un trou entre deux cues
 * (deux ancres au même x, temps distincts) est rattaché à la plage précédente —
 * même politique que l'ex-indexBlocCourant. Avant la 1re ancre, ou strictement
 * après la dernière → null (rien lu). À t = dernière ancre exactement → la
 * plage qui s'y termine (« fin exacte : encore lu »).
 */
export function plageCourante(ancres: AncreTexte[], t: number): { g: number; d: number } | null {
  const n = ancres.length
  if (n === 0 || t < ancres[0].t) return null
  let k = dernierIndex(n, t, (i) => ancres[i].t)
  if (k === n - 1) {
    if (t > ancres[k].t) return null
    k-- // t pile sur la dernière ancre → repartir de la plage qui s'y termine
  }
  // La plage candidate est (k, k+1) ; vide (trou, ou ancres effondrées par une
  // suppression) → on recule jusqu'à la dernière plage porteuse de texte.
  for (let j = k; j >= 0; j--) {
    if (ancres[j + 1].x > ancres[j].x) return { g: j, d: j + 1 }
  }
  return null
}

/**
 * Temps interpolé à la coordonnée texte `x` (seek clic-tour : x du début du
 * tour). Avant la 1re ancre → son temps ; après la dernière → le sien. Sur une
 * frontière partagée par plusieurs ancres (fin du cue i / deb du cue i+1 au même
 * x), c'est la DERNIÈRE qui gagne → le deb du cue qui commence là (le seek
 * atterrit au début du cue, pas à la fin du précédent).
 */
export function tempsAuPoint(ancres: AncreTexte[], x: number): number | null {
  const n = ancres.length
  if (n === 0) return null
  if (x <= ancres[0].x) return ancres[0].t
  if (x >= ancres[n - 1].x) return ancres[n - 1].t
  const g = dernierIndex(n, x, (i) => ancres[i].x)
  const a = ancres[g]
  const b = ancres[g + 1] // x < b.x strictement (g = DERNIER index à x_g ≤ x)
  return a.t + ((b.t - a.t) * (x - a.x)) / (b.x - a.x)
}

/** Index du PREMIER bloc du tour de parole contenant le bloc `k` (le tour est
 *  DÉRIVÉ : run de blocs consécutifs de même `loc`, D-S2). */
export function debutTour(locs: (number | null)[], k: number): number {
  let i = k
  while (i > 0 && locs[i - 1] === locs[k]) i--
  return i
}
