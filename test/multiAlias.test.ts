import { describe, test, expect } from 'vitest'
import { parserAliases, regleEnCollisionAlias } from '../src/shared/entretien/anon/alias'
import { cleEntite } from '../src/shared/entretien/anon/brouillonsAnon'
import type { RegleAnon } from '../src/shared/format'

/**
 *  Multi-alias (pur) — « Lyon/Lyons » = UNE entité portant deux graphies.
 *  Parité SonalPi V1 : séparateur `/`, clés canoniques au niveau ALIAS, collision
 *  « un alias = un pseudo ».
 */

describe('parserAliases (parité SonalPi V1 parseAliases)', () => {
  test('scinde sur / ± espaces, trim, sans vide', () => {
    expect(parserAliases('Lyon/Lyons')).toEqual(['Lyon', 'Lyons'])
    expect(parserAliases('Lyon / Lyons')).toEqual(['Lyon', 'Lyons'])
    expect(parserAliases('Lyon//')).toEqual(['Lyon'])
    expect(parserAliases('Lyon')).toEqual(['Lyon'])
    expect(parserAliases('')).toEqual([])
  })

  test('cleEntite : cle de GROUPE (aliases triés) — l’ordre est indifférent', () => {
    expect(cleEntite('Lyon/Lyons')).toBe(cleEntite('Lyons/Lyon'))
    expect(cleEntite('Lyon/Lyons')).toBe('lyon/lyons')
    // Rétrocompatible : un alias seul = trim + minuscules (cles stockées).
    expect(cleEntite('Karine')).toBe('karine')
  })
})

describe('regleEnCollisionAlias (un alias = un pseudo)', () => {
  const regles: RegleAnon[] = [
    { id: 'r1', entite: ['Lyon', 'Lyons'], pseudos: ['Ville'] },
    { id: 'r2', entite: ['Karine'], pseudos: ['Claire'] },
  ]
  test('l’alias seul entre en collision avec le groupe qui le porte', () => {
    expect(regleEnCollisionAlias('Lyons', regles)?.id).toBe('r1')
    expect(regleEnCollisionAlias('Lyon/Beaulieu', regles)?.id).toBe('r1')
  })
  test('insensible à la casse', () => {
    expect(regleEnCollisionAlias('lyons', regles)?.id).toBe('r1')
  })
  test('aucune collision quand aucun alias n’est partagé', () => {
    expect(regleEnCollisionAlias('Marseille', regles)).toBeUndefined()
    expect(regleEnCollisionAlias('', regles)).toBeUndefined()
  })
})
