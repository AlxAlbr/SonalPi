import { describe, test, expect } from 'vitest'
import {
  chevauche,
  occurrencesDe,
  aplatir,
  offsetVersPM,
  plageVersPM,
  type TextePlat,
} from '../src/shared/entretien/anon'
import { debutBloc } from '../src/shared/entretien/positions'

/**
 *  Moteur d'anonymisation (pur) — couvre les cas de l'itération 1 : occurrence simple, casse,
 *  frontières de mot, ponctuation de bord, et le pont texte plat ↔ positions PM.
 *  Headless, aucun DOM ni ProseMirror.
 */

describe('occurrencesDe', () => {
  test('occurrence simple', () => {
    expect(occurrencesDe('Je vois Karine demain', 'Karine')).toEqual([{ from: 8, to: 14 }])
  })

  test('insensible à la casse', () => {
    expect(occurrencesDe('paris, Paris et PARIS', 'paris')).toHaveLength(3)
  })

  test('frontières de mot : « Paul » ne matche pas dans « Pauline »', () => {
    expect(occurrencesDe('Pauline vient, Paul aussi', 'Paul')).toEqual([{ from: 15, to: 19 }])
  })

  test('ponctuation de bord exclue du match : « Lyon. » couvre « Lyon »', () => {
    const r = occurrencesDe('à Lyon.', 'Lyon')
    expect(r).toEqual([{ from: 2, to: 6 }]) // le point reste hors de la plage
  })

  test('plusieurs occurrences, ordonnonnées', () => {
    const r = occurrencesDe('pas ici, pas là, jamais de pas', 'pas')
    expect(r.map((p) => p.from)).toEqual([0, 9, 27])
  })

  test('entité vide → aucune occurrence', () => {
    expect(occurrencesDe('du texte', '')).toEqual([])
    expect(occurrencesDe('du texte', '   ')).toEqual([])
  })

  test('entité multi-mots (ponctuation interne conservée)', () => {
    // « New York » reste un match insécable ;
    // la frontière de mot porte sur le premier et le dernier caractère de l'entité.
    expect(occurrencesDe('à New York, puis ailleurs', 'New York')).toEqual([
      { from: 2, to: 10 },
    ])
  })

  test('expression multi-mots : UNE plage par occurrence, jamais scindée par mot', () => {
    // Le moteur matche « New York » comme une seule unité.
    // La POSITION au modèle peut ensuite la couper, comme des annotations « New »
    // et « York » posées séparément ; jamais le matcher lui-même.
    const r = occurrencesDe('New York, puis New York à la fin', 'New York')
    expect(r).toEqual([
      { from: 0, to: 8 },
      { from: 15, to: 23 },
    ])
    expect(r).toHaveLength(2) // deux occurrences, deux plages pleines
  })
})

describe('chevauche', () => {
  test('chevauchement partiel et inclusion', () => {
    expect(chevauche({ from: 0, to: 5 }, { from: 3, to: 8 })).toBe(true)
    expect(chevauche({ from: 0, to: 5 }, { from: 5, to: 8 })).toBe(false) // [0,5[ ∩ [5,8[ = vide
    expect(chevauche({ from: 2, to: 4 }, { from: 0, to: 5 })).toBe(true) // inclus
  })
})

describe('adaptateur texte plat ↔ positions PM', () => {
  // Deux paragraphes : « à Lyon. » (7) puis « Lyon à » (6).
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'à Lyon.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Lyon à' }] },
    ],
  }
  // longueurs = [7, 6] ; le séparateur '\n' fait que le texte plat vaut 14.
  const longueurs = [7, 6]

  test('aplatir : texte concaténé au séparateur près, débuts PM corrects', () => {
    const t = aplatir(doc)
    expect(t.texte).toBe('à Lyon.\nLyon à')
    expect(t.blocs.map((b) => b.longueur)).toEqual([7, 6])
    // Début PM du contenu de chaque bloc = debutBloc(longueurs, k).
    expect(t.blocs.map((b) => b.debut)).toEqual([debutBloc(longueurs, 0), debutBloc(longueurs, 1)])
  })

  test('offsetVersPM : borne dans le bloc 0 puis dans le bloc 1', () => {
    const t = aplatir(doc)
    // bloc 0 : « à Lyon. » occupe les offsets plat [0,7[ → PM [1,8[.
    expect(offsetVersPM(t, 0)).toBe(1)
    expect(offsetVersPM(t, 6)).toBe(7)
    // bloc 1 : « Lyon à » occupe les offsets plat [8,14[ → PM [10,16[.
    //  (8 = 7 + 1 saut ; 10 = debutBloc([7,6], 1) = 1 + 2 + 7.)
    expect(offsetVersPM(t, 8)).toBe(10)
    expect(offsetVersPM(t, 13)).toBe(15)
    // un séparateur ('\n', offset 7) n'appartient à aucun bloc → null.
    expect(offsetVersPM(t, 7)).toBeNull()
  })

  test('plageVersPM : les deux « Lyon » tombent dans leur bloc respectif', () => {
    const t = aplatir(doc)
    const occ = occurrencesDe(t.texte, 'Lyon')
    expect(occ).toEqual([
      { from: 2, to: 6 }, // bloc 0
      { from: 8, to: 12 }, // bloc 1
    ])
    const pm0 = plageVersPM(t, occ[0].from, occ[0].to)
    const pm1 = plageVersPM(t, occ[1].from, occ[1].to)
    // bloc 0 : pm = debutBloc(0) + offset relatif → [1+2, 1+6[ = [3,7[.
    expect(pm0).toEqual({ from: 3, to: 7 })
    // bloc 1 : pm = debutBloc(1) + offset relatif → [10+0, 10+4[ = [10,14[.
    expect(pm1).toEqual({ from: 10, to: 14 })
  })

  test('aucun faux positif à cheval sur deux blocs', () => {
    // Même si l'entité « on » apparaît en fin de bloc 0 et début de bloc 1,
    // le séparateur '\n' empêche un match franchissant la frontière.
    const t: TextePlat = {
      texte: ' Lyon\nLyon ', // blocs vides autour : juste pour isoler le test plat
      blocs: [{ debut: 1, longueur: 4 }, { debut: 7, longueur: 4 }],
    }
    // L'entité « Lyon\nLyon » (texte plat contenant un saut) n'existe pas dans une saisie réelle.
    // On vérifie surtout qu'un mot ne se synthétise pas à la jonction ;
    // ici « Lyon » reste deux occurrences distinctes.
    expect(occurrencesDe(t.texte, 'Lyon')).toEqual([
      { from: 1, to: 5 },
      { from: 6, to: 10 },
    ])
  })
})
