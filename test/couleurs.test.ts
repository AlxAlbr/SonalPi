import { describe, test, expect } from 'vitest'
import { couleurHexPourCode, couleurPourCode } from '../src/renderer/editor/decorations'

describe('couleurs de codage — distinctes pour des codes voisins', () => {
  test('cat_001 / cat_002 / cat_003 → trois couleurs HEX nettement différentes', () => {
    const c1 = couleurHexPourCode('cat_001')
    const c2 = couleurHexPourCode('cat_002')
    const c3 = couleurHexPourCode('cat_003')
    expect(new Set([c1, c2, c3]).size).toBe(3)
    // format HEX valide
    for (const c of [c1, c2, c3]) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
  })

  test('la teinte HSL (affichage) et l’HEX (export) partagent la même source', () => {
    // Les deux dérivent de hueDe(code) : couleurs voisines pour un même code,
    // et distinctes d'un code à l'autre (on vérifie juste la distinction ici).
    expect(couleurPourCode('cat_001').trait).not.toBe(couleurPourCode('cat_002').trait)
  })

  test('stable : le même code redonne la même couleur', () => {
    expect(couleurHexPourCode('cat_007')).toBe(couleurHexPourCode('cat_007'))
  })
})
