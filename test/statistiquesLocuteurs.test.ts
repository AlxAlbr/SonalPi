import { describe, expect, test } from 'vitest'
import { statistiquesLocuteurs, type BlocParole } from '../src/shared/entretien/statistiquesLocuteurs'
import type { Locuteur } from '../src/shared/format'
import type { Ancre } from '../src/shared/entretien/audio'

const locuteurs: Locuteur[] = [
  { index: 0, nom: 'Enquêteur', interviewer: true, valeursLoc: {}, personneRef: null },
  { index: 7, nom: 'Fatima', valeursLoc: {}, personneRef: null },
]
function blocs(lignes: Array<[string, number | null]>): BlocParole[] {
  let pos = 1
  return lignes.map(([texte, loc]) => {
    const bloc = { pos, longueur: texte.length, texte, loc }
    pos += texte.length + 2
    return bloc
  })
}
function bornes(b: BlocParole[], temps: Array<[number, number]>): Ancre[] {
  return b.flatMap((bloc, i) => [{ pos: bloc.pos, t: temps[i][0] }, { pos: bloc.pos + bloc.longueur, t: temps[i][1] }])
}

describe('statistiques des locuteurs', () => {
  test('les paragraphes consécutifs forment un tour, sans masquer les passages non attribués', () => {
    const b = blocs([['Bonjour vous', 0], ['Comment allez-vous ?', 0], ['Très bien', 7], ['Sans nom', null], ['Merci', 0]])
    const bilan = statistiquesLocuteurs(b, locuteurs, [])
    expect(bilan.totalMots).toBe(9)
    expect(bilan.motsEnqueteurs).toBe(5)
    expect(bilan.pourcentageEnqueteurs).toBeCloseTo(500 / 9)
    expect(bilan.lignes.map((l) => [l.loc, l.mots, l.interventions])).toEqual([[0, 5, 2], [7, 2, 1], [null, 2, 1]])
    expect(bilan.lignes[0].positions).toEqual([1, b[4].pos])
    expect(bilan.lignes.every((l) => l.secondes === null)).toBe(true)
    expect(bilan.lignes.reduce((s, l) => s + l.pourcentage, 0)).toBeCloseTo(100)
  })

  test('le rôle vient du réglage interviewer, pas du nom ou d’un point d’interrogation', () => {
    const noms = locuteurs.map((l) => ({ ...l, nom: l.index === 0 ? 'Fatima' : 'Enquêteur ?', interviewer: l.index === 0 }))
    const bilan = statistiquesLocuteurs(blocs([['Un mot', 0], ['Trois petits mots', 7]]), noms, [])
    expect(bilan.motsEnqueteurs).toBe(2)
    expect(bilan.pourcentageEnqueteurs).toBe(40)
  })

  test('les noms identiques et les index non consécutifs ne fusionnent pas les personnes', () => {
    const noms = locuteurs.map((l) => ({ ...l, nom: 'Même nom' }))
    expect(statistiquesLocuteurs(blocs([['A', 0], ['B', 7], ['C', 0]]), noms, []).lignes).toHaveLength(2)
  })

  test('une référence de locuteur inconnue est comptée sans inventer une identité', () => {
    const bilan = statistiquesLocuteurs(blocs([['Bonjour', 0], ['inconnu', 99], ['retour', 0]]), locuteurs, [])
    expect(bilan.lignes.find((l) => l.loc === null)?.mots).toBe(1)
    expect(bilan.lignes.find((l) => l.loc === 0)?.interventions).toBe(2)
  })

  test('les mots suivent la règle Unicode commune, pas la ponctuation ni les noms de libellés', () => {
    const bilan = statistiquesLocuteurs(blocs([["L’aide aux devoirs, c’est utile !", 7], ['? ...', 0]]), locuteurs, [])
    expect(bilan.totalMots).toBe(5)
    expect(bilan.lignes.find((l) => l.loc === 0)?.mots).toBe(0)
    expect(bilan.lignes.find((l) => l.loc === 0)?.interventions).toBe(1)
  })

  test('un entretien vide et les locuteurs sans texte ne créent pas d’interventions', () => {
    expect(statistiquesLocuteurs([], locuteurs, []).lignes).toEqual([])
    expect(statistiquesLocuteurs(blocs([['', 0], ['   ', 7]]), locuteurs, []).lignes).toEqual([])
  })

  test('les trous temporels entre deux cues ne gonflent pas le temps de parole', () => {
    const b = blocs([['Bonjour', 0], ['Une réponse', 7], ['Merci', 0]])
    const bilan = statistiquesLocuteurs(b, locuteurs, bornes(b, [[0, 2], [5, 9], [10, 12]]))
    expect(bilan.lignes.find((l) => l.loc === 0)?.secondes).toBe(4)
    expect(bilan.lignes.find((l) => l.loc === 7)?.secondes).toBe(4)
    expect(bilan.lignes.every((l) => !l.dureePartielle)).toBe(true)
  })

  test('un cue scindé entre deux locuteurs répartit sa durée selon le texte couvert', () => {
    const b = blocs([['abcdefghij', 0], ['abcdefghijklmnopqrst', 7]])
    const ancres = [{ pos: 1, t: 0 }, { pos: b[1].pos + b[1].longueur, t: 12 }]
    const bilan = statistiquesLocuteurs(b, locuteurs, ancres)
    expect(bilan.lignes.find((l) => l.loc === 0)?.secondes).toBeCloseTo(4)
    expect(bilan.lignes.find((l) => l.loc === 7)?.secondes).toBeCloseTo(8)
  })

  test('la durée ne s’étend pas avant le premier repère ou après le dernier', () => {
    const b = blocs([['abcdefghij', 0], ['abcdefghijklmnopqrst', 7], ['Dernier', null]])
    const ancres = [{ pos: 6, t: 10 }, { pos: b[1].pos + 10, t: 16 }]
    const bilan = statistiquesLocuteurs(b, locuteurs, ancres)
    expect(bilan.lignes.find((l) => l.loc === 0)).toMatchObject({ secondes: 2, dureePartielle: true })
    expect(bilan.lignes.find((l) => l.loc === 7)).toMatchObject({ secondes: 4, dureePartielle: true })
    expect(bilan.lignes.find((l) => l.loc === null)?.secondes).toBeNull()
  })

  test('un repère isolé ou des temps tous à zéro ne fournissent pas de durée', () => {
    const b = blocs([['Bonjour', 7]])
    expect(statistiquesLocuteurs(b, locuteurs, [{ pos: 1, t: 12 }]).lignes[0].secondes).toBeNull()
    expect(statistiquesLocuteurs(b, locuteurs, bornes(b, [[0, 0]])).lignes[0].secondes).toBeNull()
  })

  test.each([
    [{ pos: 1, t: -1 }, { pos: 8, t: 2 }],
    [{ pos: 1, t: 2 }, { pos: 8, t: 1 }],
    [{ pos: 8, t: 1 }, { pos: 1, t: 2 }],
    [{ pos: 1, t: NaN }, { pos: 8, t: 2 }],
    [{ pos: 1, t: 0 }, { pos: 99, t: 2 }],
  ])('des repères incohérents laissent les mots et les tours utilisables (%j)', (...ancres) => {
    const bilan = statistiquesLocuteurs(blocs([['Bonjour', 7]]), locuteurs, ancres)
    expect(bilan.reperesIncoherents).toBe(true)
    expect(bilan.lignes[0]).toMatchObject({ mots: 1, interventions: 1, secondes: null })
  })

  test('le calcul ne modifie aucune donnée source', () => {
    const b = blocs([['Bonjour', 0], ['Réponse', 7]])
    const a = bornes(b, [[0, 1], [2, 3]])
    const avant = structuredClone({ b, a, locuteurs })
    expect(statistiquesLocuteurs(b, locuteurs, a)).toEqual(statistiquesLocuteurs(b, locuteurs, a))
    expect({ b, a, locuteurs }).toEqual(avant)
  })

  test('de nombreux repères au mot conservent les durées sans compter les frontières de paragraphes', () => {
    const b = blocs(Array.from({ length: 1000 }, (_, i) => ['un deux trois', i % 2 ? 0 : 7] as [string, number]))
    const a = b.flatMap((bloc, i) => Array.from({ length: bloc.longueur + 1 }, (_, k) => ({ pos: bloc.pos + k, t: i * 20 + k })))
    const bilan = statistiquesLocuteurs(b, locuteurs, a)
    expect(bilan.totalMots).toBe(3000)
    expect(bilan.lignes.reduce((s, l) => s + (l.secondes ?? 0), 0)).toBeCloseTo(13000)
    expect(bilan.tours).toHaveLength(1000)
  })
})
