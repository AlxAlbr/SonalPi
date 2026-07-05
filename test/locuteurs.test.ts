import { describe, test, expect } from 'vitest'
import {
  nomDeLocuteur,
  prochainIndex,
  renommerLocuteur,
  ajouterLocuteur,
} from '../src/shared/entretien/locuteurs'
import type { Locuteur } from '../src/shared/format'

function locs(): Locuteur[] {
  return [
    { index: 1, nom: 'Enquêteur', valeursLoc: {}, personneRef: null },
    { index: 2, nom: 'Karine', valeursLoc: {}, personneRef: null },
  ]
}

describe('modèle locuteurs (pur)', () => {
  test('nomDeLocuteur : nom par index, fallback si inconnu/null', () => {
    const l = locs()
    expect(nomDeLocuteur(l, 2)).toBe('Karine')
    expect(nomDeLocuteur(l, null)).toBe('')
    expect(nomDeLocuteur(l, 9)).toBe('loc 9')
  })

  test('prochainIndex : max + 1', () => {
    expect(prochainIndex(locs())).toBe(3)
    expect(prochainIndex([])).toBe(1)
  })

  test('renommer répercute par RÉFÉRENCE (l’index ne change pas)', () => {
    const l = locs()
    renommerLocuteur(l, 2, 'K.')
    expect(l.find((x) => x.index === 2)?.nom).toBe('K.')
    // l'index (ce que les blocs référencent) est intact
    expect(l.map((x) => x.index)).toEqual([1, 2])
  })

  test('ajouter prend le prochain index libre', () => {
    const l = locs()
    const nouveau = ajouterLocuteur(l, 'Témoin')
    expect(nouveau.index).toBe(3)
    expect(l).toHaveLength(3)
  })
})
