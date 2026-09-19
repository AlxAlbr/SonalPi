import { describe, test, expect } from 'vitest'
import { projeterSegments } from '../src/renderer/import/projection'
import type { EntreeExport } from '../src/renderer/import/exportSonal'
import type { Annotation, Ancre } from '../src/shared/entretien/annotation'

/** Corpus de charge synthétique : `blocs` blocs alternant deux locuteurs,
 *  deux ancres par bloc (une au début, une au milieu), et `anns` annotations
 *  LONGUES qui traversent de nombreux blocs — le pire cas de la projection
 *  (un codage enjambant des centaines de paragraphes). */
function corpusCharge(blocs: number, anns: number): EntreeExport {
  const pm: Array<{ type: string; attrs: { loc: number }; content: unknown[] }> = []
  const ancres: Ancre[] = []
  const annotations: Annotation[] = []
  let pos = 1
  for (let b = 0; b < blocs; b++) {
    const texte = `Bloc numéro ${b} avec un peu de texte pour peser.`
    pm.push({
      type: 'paragraph',
      attrs: { loc: (b % 2) + 1 },
      content: [{ type: 'text', text: texte }],
    })
    ancres.push({ pos, t: b * 10 })
    ancres.push({ pos: pos + Math.floor(texte.length / 2), t: b * 10 + 5 })
    pos += texte.length + 2
  }
  const finDoc = pos - 2
  for (let a = 0; a < anns; a++) {
    const from = 1 + Math.floor((finDoc * a) / anns)
    const to = Math.min(finDoc, from + Math.floor(finDoc / anns) - 1)
    annotations.push({
      id: `an${a}`,
      type: a % 3 === 0 ? 'anon' : 'codage',
      from,
      to,
      auteur: 'x',
      code: 'cat_001',
      etat: 'anonymise',
      pseudo: 'P',
    })
  }
  return {
    corpsTexte: { type: 'doc', content: pm } as never,
    annotations,
    ancres,
    locuteurs: [
      { index: 1, nom: 'Karine', interviewer: false, pseudo: 'Claire', pseudoEtat: 'confirme', valeursLoc: {}, personneRef: null },
      { index: 2, nom: 'Marc', interviewer: true, valeursLoc: {}, personneRef: null },
    ],
    codebook: [{ id: 'c1', nom: 'Lieu', couleur: '#ff0000', ordre: 0, parent: null, actif: true, codeExport: 'cat_001' }],
    variables: [],
    meta: { valeursGen: {} },
    legacy: { tabAnon: null, notes: '' },
    brouillonsAnon: [],
  }
}

describe('projection sur corpus de charge', () => {
  // Deux ancres par bloc → deux segments par bloc ; les annotations longues
  // redécoupent des fragments au passage.
  const BLOCS = 8000
  const ANNS = 400
  const e = corpusCharge(BLOCS, ANNS)

  test('le contenu reste complet et ordonné (aucune perte de structure)', () => {
    const segments = projeterSegments(e)
    // Un cue par ancre : 2 segments par bloc.
    expect(segments.length).toBe(2 * BLOCS)
    // Chaque bloc porte ses deux cues (deb < fin), et les temps restent
    // strictement croissants au fil des segments.
    let precedent = -1
    let nbCues = 0
    for (const s of segments) {
      if (s.deb == null) continue
      // Le cue FINAL d'un bloc se referme sur l'ancre du bloc suivant :
      // sa fin porte alors null (c'est la convention de la projection).
      if (s.fin != null) expect(s.fin).toBeGreaterThan(s.deb)
      expect(s.deb).toBeGreaterThanOrEqual(precedent)
      precedent = s.deb
      nbCues++
    }
    expect(nbCues).toBe(2 * BLOCS)
    // Les locuteurs sont alternés bloc par bloc et préservés.
    expect(segments[0].loc).toBe(1)
    expect(segments[2].loc).toBe(2)
    // Les fragments portent bien le code du codage long qui les traverse.
    expect(segments.some((s) => s.fragments.some((f) => f.codes.includes('cat_001')))).toBe(true)
    expect(segments.some((s) => s.fragments.some((f) => f.anon?.pseudo === 'P'))).toBe(true)
  })

  test('pas de régression quadratique : 4× la taille ≈ 4× le temps', () => {
    const mesurer = (blocs: number, anns: number): number => {
      const e = corpusCharge(blocs, anns)
      const t0 = performance.now()
      projeterSegments(e)
      return performance.now() - t0
    }
    const t1 = Math.max(mesurer(1000, 50), 2)
    const t4 = mesurer(4000, 200)
    // Le comportement quadratique donnerait 16× ; l'indexation linéaire
    // vise ≈ 4×. Marge généreuse pour les machines lentes (8×).
    expect(t4).toBeLessThan(t1 * 8)
  })

  test('un grand corpus se projette en un temps borné', () => {
    const t0 = performance.now()
    projeterSegments(e)
    const ms = performance.now() - t0
    // Généreux : la projection indexée prend ≈ 100 ms ; l'ancien balayage
    // quadratique dépassait 80 s sur ce corpus. Seuil de filet de sécurité.
    expect(ms).toBeLessThan(5000)
  })
})
