import { describe, expect, it } from 'vitest'
import { etatPresentationParcours } from '../src/renderer/composables/parcoursPasAPas'

const etapes = [
  { id: 'charger' },
  { id: 'noter' },
  { id: 'lier', requiere: 'noter' },
  { id: 'renommer', requiere: 'charger' },
  { id: 'coder', requiere: 'charger' },
  { id: 'variable', requiere: 'charger' },
]

describe('présentation du parcours pas à pas', () => {
  it('compte les acquis et propose la première étape accessible', () => {
    expect(etatPresentationParcours(etapes, new Set())).toEqual({
      nombreRealisees: 0,
      termine: false,
      prochaine: etapes[0],
    })

    expect(etatPresentationParcours(etapes, new Set(['charger']))).toEqual({
      nombreRealisees: 1,
      termine: false,
      prochaine: etapes[1],
    })
  })

  it('respecte les prérequis même si une étape précédente est déjà acquise', () => {
    const etat = etatPresentationParcours(etapes, new Set(['noter']))
    expect(etat.prochaine?.id).toBe('charger')
    expect(etat.nombreRealisees).toBe(1)
  })

  it('signale la fin sans retirer la possibilité de réessayer dans la liste', () => {
    const etat = etatPresentationParcours(etapes, new Set(etapes.map((e) => e.id)))
    expect(etat).toEqual({ nombreRealisees: 6, termine: true, prochaine: null })
  })
})
