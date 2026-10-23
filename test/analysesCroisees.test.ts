import { describe, expect, it } from 'vitest'
import { exporterAnalyseCroisee } from '../src/shared/analysesCroisees/export'
import { calculerAnalyseCroisee } from '../src/shared/analysesCroisees/moteur'
import type { SourceAnalyseCroisee } from '../src/shared/analysesCroisees/types'

function source(contributions: SourceAnalyseCroisee['contributions']): SourceAnalyseCroisee {
  return {
    entretienId: 'e1',
    longueurSource: 100,
    contributions,
    tours: [
      { from: 0, to: 50, id: 'tour-1' },
      { from: 50, to: 100, id: 'tour-2' },
    ],
  }
}

describe('analyses croisées', () => {
  it('réunit les annotations superposées sans doubler le volume', () => {
    const resultat = calculerAnalyseCroisee([source([
      { entretienId: 'e1', themeId: 't1', from: 10, to: 30, annotationIds: ['a1'] },
      { entretienId: 'e1', themeId: 't1', from: 20, to: 40, annotationIds: ['a2'] },
    ])], ['t1'], ['e1'])
    expect(resultat.cellules[0]).toMatchObject({ passages: 1, volume: 30, couverture: 30 })
    expect(resultat.cellules[0].plages[0].annotationIds).toEqual(['a1', 'a2'])
  })

  it('réunit les plages contiguës dans un même tour', () => {
    const resultat = calculerAnalyseCroisee([source([
      { entretienId: 'e1', themeId: 't1', from: 10, to: 20, annotationIds: ['a1'] },
      { entretienId: 'e1', themeId: 't1', from: 20, to: 30, annotationIds: ['a2'] },
    ])], ['t1'], ['e1'])
    expect(resultat.cellules[0]).toMatchObject({ passages: 1, volume: 20 })
  })

  it('sépare une plage au changement de tour de parole', () => {
    const resultat = calculerAnalyseCroisee([source([
      { entretienId: 'e1', themeId: 't1', from: 40, to: 60, annotationIds: ['a1'] },
    ])], ['t1'], ['e1'])
    expect(resultat.cellules[0]).toMatchObject({ passages: 2, volume: 20 })
    expect(resultat.cellules[0].plages.map(({ from, to }) => [from, to])).toEqual([[40, 50], [50, 60]])
  })

  it('distingue un zéro réel d’une source indisponible', () => {
    const resultat = calculerAnalyseCroisee([
      source([]),
      { entretienId: 'e2', longueurSource: null, contributions: [], disponible: false, diagnostic: 'Absente.' },
    ], ['t1'], ['e1', 'e2'])
    expect(resultat.cellules).toHaveLength(1)
    expect(resultat.cellules[0]).toMatchObject({ entretienId: 'e1', passages: 0, volume: 0, couverture: 0 })
    expect(resultat.sourcesIndisponibles).toEqual(['e2'])
  })

  it('ignore une annotation orpheline avec un diagnostic', () => {
    const resultat = calculerAnalyseCroisee([source([
      { entretienId: 'e1', themeId: 't1', from: 20, to: 20, annotationIds: ['orpheline'] },
    ])], ['t1'], ['e1'])
    expect(resultat.cellules[0].passages).toBe(0)
    expect(resultat.diagnostics[0]).toMatchObject({ annotationId: 'orpheline', titre: 'Annotation ignorée' })
  })

  it('alimente séparément deux thèmes superposés', () => {
    const resultat = calculerAnalyseCroisee([source([
      { entretienId: 'e1', themeId: 't1', from: 10, to: 20, annotationIds: ['a1'] },
      { entretienId: 'e1', themeId: 't2', from: 10, to: 20, annotationIds: ['a2'] },
    ])], ['t1', 't2'], ['e1'])
    expect(resultat.cellules.map((item) => item.volume)).toEqual([10, 10])
    expect(resultat.totaux.colonnes.e1).toBeNull()
  })

  it('exporte les valeurs et échappe les intitulés', () => {
    const resultat = calculerAnalyseCroisee([source([
      { entretienId: 'e1', themeId: 't1', from: 10, to: 20, annotationIds: ['a1'] },
    ])], ['t1'], ['e1'])
    const csv = exporterAnalyseCroisee({
      format: 'csv',
      disposition: 'large',
      mesure: 'volume',
      date: new Date('2026-01-02T03:04:05.000Z'),
      themes: [{ id: 't1', nom: 'Thème, principal' }],
      entretiens: [{ id: 'e1', nom: 'Entretien 1' }],
      cellules: resultat.cellules,
    })
    expect(csv).toContain('"Thème, principal",10,10')
    expect(csv).toContain('Les thèmes peuvent se superposer')
  })
})
