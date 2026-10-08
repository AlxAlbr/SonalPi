import { describe, expect, it } from 'vitest'
import { normaliserProgressionsDemo, serialiserProgressionsDemo } from '../src/renderer/composables/parcours/marqueur'
import type { MarqueurDemo } from '../src/shared/format'

const base = { mode: 'pas-a-pas', racineSources: '/sources' } as const

describe('progressions du marqueur de démonstration', () => {
  it('migre l’ancien historique unique vers le traitement', () => {
    const resultat = normaliserProgressionsDemo({ ...base, validees: ['charger', 'noter'] })
    expect([...resultat.progressions.preparation]).toEqual([])
    expect([...resultat.progressions.traitement]).toEqual(['charger', 'noter'])
    expect(resultat.parcoursInitial).toBe('traitement')
    expect(resultat.dernierParcoursId).toBe('traitement')
  })

  it('conserve le contexte des artefacts sans le partager entre parcours', () => {
    const marqueur: MarqueurDemo = {
      ...base,
      parcours: {
        preparation: { validees: ['suivi'], contexte: { entretienId: 'ent-42' } },
        traitement: { validees: ['charger'] },
      },
      dernierParcoursId: 'traitement',
    }
    const resultat = normaliserProgressionsDemo(marqueur)
    expect(resultat.contextes.preparation).toEqual({ entretienId: 'ent-42' })
    expect(resultat.dernierParcoursId).toBe('traitement')
    expect(resultat.progressions.traitement.has('suivi')).toBe(false)

    expect(serialiserProgressionsDemo(resultat.progressions, resultat.contextes)).toEqual(marqueur.parcours)
  })

  it('laisse le choix vide pour un nouveau corpus', () => {
    const resultat = normaliserProgressionsDemo(base)
    expect(resultat.dernierParcoursId).toBeNull()
    expect(resultat.parcoursInitial).toBe('preparation')
  })

  it('ne persiste aucune étape active', () => {
    const serialise = serialiserProgressionsDemo(
      { preparation: new Set(), traitement: new Set(), analyse: new Set() },
      {},
    )
    expect(JSON.stringify(serialise)).not.toContain('active')
  })
})
