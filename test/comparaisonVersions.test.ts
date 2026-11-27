import { describe, expect, test } from 'vitest'
import { comparerParagraphes, paragraphesDuTexte } from '../src/shared/entretien/comparaisonVersions'

const doc = (...paragraphes: string[]) => ({
  type: 'doc',
  content: paragraphes.map((texte) => ({ type: 'paragraph', content: texte ? [{ type: 'text', text: texte }] : [] })),
})

describe('comparaison de deux versions d’un entretien', () => {
  test('extrait les paragraphes, sauts de ligne internes compris', () => {
    const corps = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'avant' }, { type: 'hardBreak' }, { type: 'text', text: 'après' }] },
      { type: 'paragraph' },
    ] }
    expect(paragraphesDuTexte(corps)).toEqual(['avant\naprès', ''])
    expect(paragraphesDuTexte(null)).toEqual([])
  })

  test('marque les passages modifiés ou ajoutés, pas ceux restés identiques', () => {
    const mienne = doc('Bonjour', 'Je l’ai rencontré en 2007', 'Fin')
    const actuelle = doc('Bonjour', 'Je l’ai rencontré en 1995', 'Fin')
    expect(comparerParagraphes(mienne, actuelle)).toEqual([
      { texte: 'Bonjour', different: false },
      { texte: 'Je l’ai rencontré en 2007', different: true },
      { texte: 'Fin', different: false },
    ])
  })

  test('un paragraphe répété n’est reconnu qu’autant de fois qu’il existe dans la référence', () => {
    expect(comparerParagraphes(doc('Oui', 'Oui'), doc('Oui')).map((p) => p.different)).toEqual([false, true])
  })
})
