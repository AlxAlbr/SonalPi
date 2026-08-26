import { describe, test, expect } from 'vitest'
import { texteDuCorps } from '../src/shared/entretien/entretien'

/** Garde « contenu déjà présent » : l'assignation d'un SRT remplace la
 *  transcription d'un entretien — elle doit demander confirmation si l'éditeur
 *  porte déjà du texte, jamais écraser en silence. */
describe('texteDuCorps — extraction du texte d’un corps ProseMirror', () => {
  test('doc avec paragraphes → texte brut concaténé (dans l’ordre des blocs)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { loc: 1 },
          content: [{ type: 'text', text: 'Bonjour ' }],
        },
        {
          type: 'paragraph',
          attrs: { loc: 2 },
          content: [{ type: 'text', text: 'monde.' }],
        },
      ],
    }
    expect(texteDuCorps(doc)).toBe('Bonjour monde.')
  })

  test('doc vide (paragraphe sans texte) ou illisible → chaîne vide', () => {
    expect(texteDuCorps({ type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] })).toBe('')
    expect(texteDuCorps({ type: 'doc', content: [] })).toBe('')
    expect(texteDuCorps(null)).toBe('')
    expect(texteDuCorps(undefined)).toBe('')
    expect(texteDuCorps({})).toBe('')
  })
})