import { describe, test, expect } from 'vitest'
import { instructionsAppliquerRegle } from '../src/shared/entretien/anon'
import type { EntretienFichier, RegleAnon } from '../src/shared/format'
import type { Annotation } from '../src/shared/entretien/annotation'

/** Un entretien mono-paragraphe (PM : contenu démarrant à 1). */
function entretien(texte: string, annotations: Annotation[] = []): EntretienFichier {
  return {
    formatVersion: 3,
    lastModified: '',
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: texte }] }] },
    annotations,
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
  }
}
function anon(texte: string, idx: number, len: number, etat: 'anonymise' | 'exception', pseudo = 'A', regle?: string): Annotation {
  return { id: `a${idx}`, type: 'anon', from: 1 + idx, to: 1 + idx + len, auteur: '', etat, pseudo, regle }
}
let n = 0
const genId = () => `m${n++}`

const regle: RegleAnon = { id: 'r1', entite: ['Lyon'], pseudos: ['L1', 'L2'] }

describe('instructionsAppliquerRegle — application en masse', () => {
  test('pose une occurrence par match « à traiter » (non couvert)', () => {
    n = 0
    const e = entretien('Lyon est grand. Lyon est beau.')
    const instr = instructionsAppliquerRegle(e, regle, genId)
    expect(instr.nb).toBe(2)
    expect(instr.poser).toHaveLength(2)
    expect(instr.poser[0].pseudo).toBe('L1') // primaire
    expect(instr.poser[0].regle).toBe('r1')
  })

  test('respecte multi-alias (entite[])', () => {
    n = 0
    const r = { id: 'r2', entite: ['Lyon', 'Marseille'], pseudos: ['L'] }
    const e = entretien('Lyon et Marseille.')
    const instr = instructionsAppliquerRegle(e, r, genId)
    expect(instr.nb).toBe(2)
  })

  test('une occurrence déjà anonymisée ou en exception n’est PAS re-posée', () => {
    n = 0
    const texte = 'Lyon. Lyon. Lyon.'
    const e = entretien(texte, [anon(texte, 0, 4, 'anonymise', 'L1', 'r1'), anon(texte, 6, 4, 'exception')])
    const instr = instructionsAppliquerRegle(e, regle, genId)
    expect(instr.nb).toBe(1) // seulement le 3ᵉ « Lyon » non couvert
  })

  test('entité absente du texte → rien', () => {
    n = 0
    const instr = instructionsAppliquerRegle(entretien('Karine habite ici.'), regle, genId)
    expect(instr.nb).toBe(0)
  })

  test('multi-pseudo : on applique avec le pseudo primaire (application en masse)', () => {
    n = 0
    const instr = instructionsAppliquerRegle(entretien('Lyon.'), regle, genId)
    expect(instr.poser[0].pseudo).toBe('L1')
  })
})
