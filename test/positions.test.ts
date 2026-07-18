import { describe, test, expect } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { debutBloc, charVersPM, pmVersTranches } from '../src/shared/entretien/positions'

/** Confronte le mapping PUR à un vrai doc ProseMirror : la position calculée doit
 *  résoudre exactement la sous-chaîne attendue via doc.textBetween. */
const schema = new Schema({
  nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*' }, text: {} },
})

function docDe(textes: string[]) {
  return schema.node(
    'doc',
    null,
    textes.map((t) => schema.node('paragraph', null, t ? [schema.text(t)] : [])),
  )
}

describe('mapping char ↔ ProseMirror', () => {
  test('debutBloc : +1 pour entrer, +2 par frontière de bloc', () => {
    const L = [3, 4] // "abc", "defg"
    expect(debutBloc(L, 0)).toBe(1)
    expect(debutBloc(L, 1)).toBe(1 + 2 + 3) // 6
  })

  test('charVersPM résout la bonne sous-chaîne dans un vrai doc PM', () => {
    const textes = ['Bonjour Pierre', 'Karine habite Lyon']
    const doc = docDe(textes)
    const L = textes.map((t) => t.length)

    // « Pierre » dans le bloc 0 (offset 8..14)
    let from = charVersPM(L, 0, 8)
    let to = charVersPM(L, 0, 14)
    expect(doc.textBetween(from, to)).toBe('Pierre')

    // « Lyon » dans le bloc 1 (offset 14..18)
    from = charVersPM(L, 1, 14)
    to = charVersPM(L, 1, 18)
    expect(doc.textBetween(from, to)).toBe('Lyon')
  })

  test('bloc vide compté correctement (nodeSize 2)', () => {
    const textes = ['ab', '', 'cd']
    const doc = docDe(textes)
    const L = textes.map((t) => t.length)
    const from = charVersPM(L, 2, 0)
    const to = charVersPM(L, 2, 2)
    expect(doc.textBetween(from, to)).toBe('cd')
  })

  test('pmVersTranches : une plage mono-bloc → une tranche', () => {
    const L = [14, 18]
    const from = charVersPM(L, 0, 8)
    const to = charVersPM(L, 0, 14)
    expect(pmVersTranches(L, from, to)).toEqual([{ bloc: 0, debut: 8, fin: 14 }])
  })

  test('pmVersTranches : une plage qui enjambe deux blocs → deux tranches', () => {
    const textes = ['abc', 'def']
    const doc = docDe(textes)
    const L = textes.map((t) => t.length)
    // du milieu du bloc 0 au milieu du bloc 1
    const from = charVersPM(L, 0, 1) // avant 'b'
    const to = charVersPM(L, 1, 2) // avant 'f'
    const tr = pmVersTranches(L, from, to)
    expect(tr).toEqual([
      { bloc: 0, debut: 1, fin: 3 },
      { bloc: 1, debut: 0, fin: 2 },
    ])
    // cohérence avec le doc réel (offset 2 du bloc 1 = avant « f »)
    expect(doc.textBetween(from, to, '')).toBe('bcde')
  })
})
