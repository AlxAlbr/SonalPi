import { describe, expect, it } from 'vitest'
import { lireProgressionsDemo, serialiserProgressionsDemo } from '../src/renderer/composables/parcours/marqueur'
import type { MarqueurDemo } from '../src/shared/format'

const base: MarqueurDemo = {
  id: 'exercice', exemple: 'synth', usage: 'apprentissage',
  parcoursApprentissage: 'preparation', racineSources: '/sources', parcours: {},
}

describe('progressions du marqueur de démonstration', () => {
  it('relit chaque progression sans la partager entre parcours', () => {
    const resultat = lireProgressionsDemo({
      ...base, parcoursApprentissage: 'traitement',
      parcours: { traitement: { validees: ['charger', 'noter'] } },
    })
    expect([...resultat.progressions.preparation]).toEqual([])
    expect([...resultat.progressions.traitement]).toEqual(['charger', 'noter'])
    expect(resultat.parcoursInitial).toBe('traitement')
    expect(resultat.dernierParcoursId).toBe('traitement')
  })

  it('conserve les acquis et le contexte après sérialisation et relecture', () => {
    const marqueur: MarqueurDemo = {
      ...base,
      parcours: {
        preparation: { validees: ['organiser-suivi'], contexte: { entretienId: 'ent-42' } },
        traitement: { validees: ['charger'] },
        analyse: { validees: ['croiser-themes'], contexte: { entretienId: 'ent-7' } },
        organisation: { validees: ['creer-cas'], contexte: { recueilId: 'rec-1' } },
      },
      dernierParcoursId: 'traitement',
    }
    const resultat = lireProgressionsDemo(marqueur)
    expect(resultat.contextes.preparation).toEqual({ entretienId: 'ent-42' })
    expect(resultat.contextes.analyse).toEqual({ entretienId: 'ent-7' })
    expect(resultat.dernierParcoursId).toBe('traitement')
    expect(resultat.progressions.traitement.has('organiser-suivi')).toBe(false)

    const parcours = serialiserProgressionsDemo(resultat.progressions, resultat.contextes)
    expect(parcours).toEqual(marqueur.parcours)
    const relu = lireProgressionsDemo(JSON.parse(JSON.stringify({ ...marqueur, parcours })))
    expect(relu).toEqual(resultat)
  })

  it('ne déduit pas le dernier parcours de ses acquis', () => {
    const resultat = lireProgressionsDemo({
      ...base, parcours: { traitement: { validees: ['charger'] } },
    })
    expect(resultat.parcoursInitial).toBe('preparation')
  })

  it('laisse le choix vide pour un corpus d’exploration libre', () => {
    const resultat = lireProgressionsDemo({ ...base, usage: 'libre', parcoursApprentissage: undefined })
    expect(resultat.dernierParcoursId).toBeNull()
    expect(resultat.parcoursInitial).toBe('preparation')
  })

  it('ne persiste aucune étape active', () => {
    const serialise = serialiserProgressionsDemo(
      { preparation: new Set(), traitement: new Set(), analyse: new Set(), organisation: new Set() },
      {},
    )
    expect(JSON.stringify(serialise)).not.toContain('active')
  })
})
