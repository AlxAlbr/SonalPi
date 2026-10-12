import { describe, test, expect } from 'vitest'
import {
  instructionsValiderAnon,
  aplatir,
  occurrencesDe,
  plageVersPM,
} from '../src/shared/entretien/anon'
import type { Annotation } from '../src/shared/entretien/annotation'

/**
 *  Bascule exception ↔ anonymisé — le moteur de la validation d'une ligne,
 *  extrait en PURE (`instructionsValiderAnon`) pour être testable :
 *  le couplage Vue/PM de useEntretien.validerAnon ne fait qu'APPLIQUER les
 *  instructions (relabel / retraits / poses) sur la table réactive.
 *
 *  Règles garanties ici :
 *   - le relabel ne touche JAMAIS une exception (état + pseudo-mémoire intacts) ;
 *   - une exception couvrante (entière ou contenue) BLOQUE la pose et le retrait
 *     du match : une exception ne repasse jamais « à traiter ».
 */

const TEXTE = 'Paul vient, Paul part.'
const DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: TEXTE }] }],
}
const X = aplatir(DOC)
const texteEntre = (f: number, t: number) => TEXTE.slice(f - 1, t - 1)

/** Plage PM de la k-ième occurrence de « Paul » (contenu du bloc commençant à 1). */
function paul(k: 0 | 1): { from: number; to: number } {
  const pl = occurrencesDe(X.texte, 'Paul')[k]
  return plageVersPM(X, pl.from, pl.to)!
}

let seq = 0
function ann(opts: {
  from: number
  to: number
  etat?: 'anonymise' | 'exception'
  pseudo?: string
}): Annotation {
  return { id: `a${++seq}`, type: 'anon', auteur: 'max', ...opts }
}

describe('instructionsValiderAnon — relabel (jamais les exceptions)', () => {
  test('conserve la variante des occurrences anonymisées et ne touche pas les exceptions', () => {
    const p1 = paul(0)
    const p2 = paul(1)
    const annotations = [
      ann({ ...p1, pseudo: 'X', etat: 'anonymise' }),
      ann({ ...p2, pseudo: 'Y', etat: 'exception' }),
    ]
    const r = instructionsValiderAnon(annotations, [], 'paul', 'Z', texteEntre, () => 'n')
    expect(r.relabel).toEqual([{ id: annotations[0].id, pseudo: 'X' }]) // Variante conservée, exception intacte.
    expect(r.poser).toEqual([])
    // rien ne touche l'exception : état et pseudo-mémoire restent intacts.
    expect(annotations[1].etat).toBe('exception')
    expect(annotations[1].pseudo).toBe('Y')
  })

  test('entité différente (autre cle) → aucun relabel', () => {
    const p = paul(0)
    const annotations = [ann({ ...p, pseudo: 'X', etat: 'anonymise' })]
    const r = instructionsValiderAnon(annotations, [], 'karine', 'Z', texteEntre, () => 'n')
    expect(r.relabel).toEqual([])
  })
})

describe('instructionsValiderAnon — une exception bloque la pose', () => {
  test('exception couvrant ENTIÈREMENT le match → pas de pose', () => {
    const p = paul(0)
    const annotations = [ann({ ...p, pseudo: 'X', etat: 'exception' })]
    const r = instructionsValiderAnon(annotations, [p], 'paul', 'Z', texteEntre, () => 'n')
    expect(r.poser).toEqual([])
  })

  test('exception CONTENUE dans le match → ni pose ni absorption (le match reste en clair)', () => {
    const p = paul(0) // [1,5[
    const annotations = [ann({ from: p.from + 1, to: p.to - 1, pseudo: 'X', etat: 'exception' })]
    const r = instructionsValiderAnon(annotations, [p], 'paul', 'Z', texteEntre, () => 'n')
    expect(r.poser).toEqual([])
    expect(r.relabel).toEqual([])
  })

  test('occurrence ANONYMISÉE couvrant entièrement le match → rien à faire (re-validation)', () => {
    const p = paul(0)
    const annotations = [ann({ ...p, pseudo: 'X', etat: 'anonymise' })]
    const r = instructionsValiderAnon(annotations, [p], 'paul', 'Z', texteEntre, () => 'n')
    expect(r.poser).toEqual([])
  })
})

describe('instructionsValiderAnon — pose sur les matches libres (itération 1 intact)', () => {
  test('match non couvert → pose une occurrence (pseudo + id généré)', () => {
    const p = paul(1) // 2e « Paul », libre
    let n = 0
    const r = instructionsValiderAnon([], [p], 'paul', 'Z', texteEntre, () => `gen-${++n}`)
    expect(r.poser).toEqual([{ id: 'gen-1', from: p.from, to: p.to, pseudo: 'Z' }])
  })

  test('le large absorbe l\u2019étroit : pose par-dessus, les étroites CONSERVÉES (incluses)', () => {
    const p = paul(0)
    const annotations = [
      ann({ from: p.from, to: p.to - 2, pseudo: 'X', etat: 'anonymise' }),
      ann({ from: p.to - 2, to: p.to, pseudo: 'X', etat: 'anonymise' }),
    ]
    const r = instructionsValiderAnon(annotations, [p], 'paul', 'Z', texteEntre, () => 'n')
    // Rien n'est détruit : au retrait de la large, les étroites réapparaîtront.
    expect(r.poser).toEqual([{ id: 'n', from: p.from, to: p.to, pseudo: 'Z' }])
  })

  test('chevauchement partiel NON contenu → rien ne change (incluses différé)', () => {
    const p = paul(0)
    // occurrence (0,4) chevauchant partiellement le match (1,5) : ni contenu,
    // ni conteneur, pas d'exception → aucun geste (l'incluses est différé).
    const annotations = [ann({ from: p.from - 1, to: p.to - 1, pseudo: 'X', etat: 'anonymise' })]
    const r = instructionsValiderAnon(annotations, [p], 'paul', 'Z', texteEntre, () => 'n')
    expect(r.poser).toEqual([])
  })
})