import { describe, test, expect } from 'vitest'
import {
  projeterAncres,
  plageCourante,
  tempsAuPoint,
  debutTour,
  type Ancre,
  type AncreTexte,
} from '../src/shared/entretien/audio'
import { charVersPM } from '../src/shared/entretien/positions'
import { enveloppe } from '../src/renderer/audio/enveloppe'

/** Le temps est porté par des ANCRES {pos, t} dans le texte ; l'interpolation reste une dérivation entre ancres, au prorata du texte.
 *  Ces tests couvrent les sémantiques de lecture (cues entiers, fragments scindés, trous, dégénérés)
 *  et le garde-fou de perf (dichotomie comptée sur ~30 000 ancres). */

/** Ancres d'un découpage en cues : chaque cue [deb, fin] posé sur son bloc. */
function ancresDeCues(cues: Array<{ deb: number | null; fin: number | null; longueur: number }>): {
  ancres: Ancre[]
  longueurs: number[]
} {
  const longueurs = cues.map((c) => c.longueur)
  const ancres: Ancre[] = []
  cues.forEach((c, k) => {
    if (c.deb != null) ancres.push({ pos: charVersPM(longueurs, k, 0), t: c.deb })
    if (c.fin != null) ancres.push({ pos: charVersPM(longueurs, k, c.longueur), t: c.fin })
  })
  return { ancres, longueurs }
}
function projection(cues: Array<{ deb: number | null; fin: number | null; longueur: number }>): AncreTexte[] {
  const { ancres, longueurs } = ancresDeCues(cues)
  return projeterAncres(ancres, longueurs)
}
/** Texte couvert par la plage courante, en coordonnées texte [de, a[. */
function plageX(ancres: AncreTexte[], t: number): [number, number] | null {
  const p = plageCourante(ancres, t)
  return p == null ? null : [ancres[p.g].x, ancres[p.d].x]
}

describe('projeterAncres (PM → coordonnée texte cumulée)', () => {
  test('deb au début du bloc, fin à sa fin ; les frontières de blocs pèsent zéro', () => {
    const x = projection([
      { deb: 0, fin: 2, longueur: 10 },
      { deb: 2, fin: 5, longueur: 10 },
    ])
    expect(x).toEqual([
      { x: 0, t: 0 },
      { x: 10, t: 2 },
      { x: 10, t: 2 }, // deb du cue 2 : même x que la fin du cue 1 (frontière)
      { x: 20, t: 5 },
    ])
  })

  test('une pos tombée en frontière (remap) est ramenée au bord du bloc', () => {
    // pos 0 = avant le contenu du 1er bloc → x 0 ; pos hors doc → x total.
    expect(projeterAncres([{ pos: 0, t: 1 }], [5])).toEqual([{ x: 0, t: 1 }])
    expect(projeterAncres([{ pos: 99, t: 9 }], [5])).toEqual([{ x: 5, t: 9 }])
  })
})

describe('plageCourante (surlignage : les 2 ancres encadrant t)', () => {
  // 3 cues de 10 caractères : [0,2], [2,5], puis un TROU [5,6[ avant [6,9].
  const ancres = projection([
    { deb: 0, fin: 2, longueur: 10 },
    { deb: 2, fin: 5, longueur: 10 },
    { deb: 6, fin: 9, longueur: 10 },
  ])

  test('t dans un cue → la plage de ce cue ; t dans un trou → rattaché au cue précédent', () => {
    expect(plageX(ancres, 0)).toEqual([0, 10])
    expect(plageX(ancres, 1.9)).toEqual([0, 10])
    expect(plageX(ancres, 2)).toEqual([10, 20])
    expect(plageX(ancres, 5.5)).toEqual([10, 20]) // trou [5,6[ → cue précédent
    expect(plageX(ancres, 6)).toEqual([20, 30])
  })

  test('avant la 1re ancre → null ; après la dernière → null ; fin exacte : encore lu', () => {
    const silencieux = projection([
      { deb: 1, fin: 2, longueur: 10 },
      { deb: 2, fin: 5, longueur: 10 },
    ])
    expect(plageCourante(silencieux, 0.5)).toBeNull()
    expect(plageCourante(silencieux, 5.1)).toBeNull()
    expect(plageX(silencieux, 5)).toEqual([10, 20]) // t = fin exacte : encore lu
  })

  test('cue scindé : la plage est bornée par les ancres MESURÉES restantes', () => {
    // Un cue [0, 10] dont le bloc a été scindé en 5+10+5 : les ancres n'ont pas bougé en texte,
    // la plage couvre les 20 caractères entre deb et fin.
    const ancres2: AncreTexte[] = [
      { x: 0, t: 0 },
      { x: 20, t: 10 },
    ]
    expect(plageX(ancres2, 4)).toEqual([0, 20])
  })

  test('aucune ancre (texte sans timecodes) → jamais de surlignage', () => {
    expect(plageCourante([], 3)).toBeNull()
  })

  test('ancres effondrées par une suppression (plage vide) → enjambées vers la gauche', () => {
    // Le texte du cue 2 a été supprimé : ses 2 ancres partagent le même x.
    const ancres3: AncreTexte[] = [
      { x: 0, t: 0 },
      { x: 10, t: 2 },
      { x: 10, t: 3 },
      { x: 10, t: 5 },
      { x: 22, t: 5.5 },
    ]
    expect(plageX(ancres3, 4)).toEqual([0, 10]) // plage vide → la précédente porteuse de texte
  })
})

describe('tempsAuPoint (interpolation entre ancres : seek clic-tour)', () => {
  test('sur une borne mesurée → son temps ; entre deux → prorata du texte', () => {
    const ancres = projection([
      { deb: 10, fin: null, longueur: 5 },
      { deb: null, fin: null, longueur: 10 },
      { deb: null, fin: 20, longueur: 5 },
    ])
    expect(tempsAuPoint(ancres, 0)).toBe(10)
    expect(tempsAuPoint(ancres, 5)).toBe(12.5) // début du fragment 2 (prorata)
    expect(tempsAuPoint(ancres, 15)).toBe(17.5)
    expect(tempsAuPoint(ancres, 20)).toBe(20)
  })

  test('avant la 1re ancre / après la dernière : on borne, on n’extrapole pas', () => {
    const ancres = projection([
      { deb: null, fin: null, longueur: 5 },
      { deb: 3, fin: 6, longueur: 10 },
      { deb: null, fin: null, longueur: 5 },
    ])
    expect(tempsAuPoint(ancres, 0)).toBe(3)
    expect(tempsAuPoint(ancres, 20)).toBe(6)
  })

  test('frontière partagée (fin du cue i / deb du cue i+1) → le deb du cue qui commence', () => {
    const ancres = projection([
      { deb: 0, fin: 4, longueur: 8 },
      { deb: 6, fin: 10, longueur: 4 },
    ])
    expect(tempsAuPoint(ancres, 8)).toBe(6) // seek au DÉBUT du cue 2, pas à la fin du 1
  })

  test('aucune ancre → null (pas de seek)', () => {
    expect(tempsAuPoint([], 3)).toBeNull()
  })
})

describe('debutTour (clic-tour ; tour dérivé)', () => {
  test('le tour est le run de blocs consécutifs de même loc', () => {
    const locs = [1, 1, 2, 2, 2, 1]
    expect(debutTour(locs, 0)).toBe(0)
    expect(debutTour(locs, 1)).toBe(0)
    expect(debutTour(locs, 4)).toBe(2)
    expect(debutTour(locs, 5)).toBe(5)
  })
})

describe('garde-fou perf (~30 000 ancres : dichotomie, pas de balayage)', () => {
  // Un Proxy compte les ACCÈS au tableau d'ancres : un lookup dichotomique en fait O(log n),
  // un balayage linéaire en ferait O(n) — le compteur départage.
  function compteur(ancres: AncreTexte[]): { proxy: AncreTexte[]; lus: () => number } {
    let n = 0
    const proxy = new Proxy(ancres, {
      get(cible, prop) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) n++
        return Reflect.get(cible, prop)
      },
    })
    return { proxy, lus: () => n }
  }

  const N = 30_000
  const grandes: AncreTexte[] = Array.from({ length: N }, (_, i) => ({ x: i * 6, t: i * 0.35 }))

  test('plageCourante : O(log n) accès, résultat exact au milieu du tas', () => {
    const { proxy, lus } = compteur(grandes)
    const p = plageCourante(proxy, (N / 2) * 0.35 + 0.1)!
    expect(p.g).toBe(N / 2)
    expect(p.d).toBe(N / 2 + 1)
    expect(lus()).toBeLessThan(4 * Math.ceil(Math.log2(N)) + 12) // ~2 lectures/étape + bords
  })

  test('tempsAuPoint : O(log n) accès', () => {
    const { proxy, lus } = compteur(grandes)
    expect(tempsAuPoint(proxy, (N / 2) * 6 + 3)).toBeCloseTo((N / 2) * 0.35 + 0.175, 5)
    expect(lus()).toBeLessThan(4 * Math.ceil(Math.log2(N)) + 12)
  })
})

describe('enveloppe waveform (S6, calquée sur le worker SonalPi1)', () => {
  test('min/max par tranche, dernière tranche partielle tolérée', () => {
    // valeurs exactement représentables en float32 (pas d'écart de précision)
    const canal = new Float32Array([0.125, -0.5, 0.75, 0.25, -0.125, 0.375, 0.625])
    const { min, max } = enveloppe(canal, 3) // pas = ceil(7/3) = 3
    expect(Array.from(max)).toEqual([0.75, 0.375, 0.625])
    expect(Array.from(min)).toEqual([-0.5, -0.125, 0.625])
  })

  test('canal plus court que la largeur : tranches vides à min=1/max=-1 (silence visuel)', () => {
    const canal = new Float32Array([0.5])
    const { min, max } = enveloppe(canal, 3)
    expect(max[0]).toBe(0.5)
    expect(min[1]).toBe(1.0)
    expect(max[1]).toBe(-1.0)
  })
})
