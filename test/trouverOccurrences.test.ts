import { describe, expect, it } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { trouverOccurrences } from '../src/renderer/editor/recherche'

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

/** Le texte couvert par une plage PM doit être exactement la requête. */
const texteDe = (doc: ReturnType<typeof docDe>, de: number, a: number) =>
  doc.textBetween(de, a, '\n')

describe('trouverOccurrences', () => {
  it('renvoie des plages PM qui résolvent la requête (2 blocs)', () => {
    const doc = docDe(['Karine habite Lyon.', 'Elle travaille à Lyon.'])
    const occ = trouverOccurrences(doc, 'Lyon')
    expect(occ).toHaveLength(2)
    for (const o of occ) expect(texteDe(doc, o.de, o.a)).toBe('Lyon')
  })

  it('est insensible à la casse', () => {
    const doc = docDe(['KARINE parle. karine rit.'])
    expect(trouverOccurrences(doc, 'karine')).toHaveLength(2)
  })

  it('est sensible aux accents', () => {
    const doc = docDe(['Il est né en juin.'])
    expect(trouverOccurrences(doc, 'ne')).toHaveLength(0)
    expect(trouverOccurrences(doc, 'né')).toHaveLength(1)
  })

  it('ne trouve rien à cheval entre deux blocs (séparateur)', () => {
    const doc = docDe(['…la fin', 'début du reste…'])
    expect(trouverOccurrences(doc, 'findébut')).toHaveLength(0)
  })

  it('gère les blocs vides et renvoie vide sans requête', () => {
    const doc = docDe(['un', '', 'deux'])
    expect(trouverOccurrences(doc, 'undeux')).toHaveLength(0)
    expect(trouverOccurrences(doc, '')).toHaveLength(0)
  })
})
