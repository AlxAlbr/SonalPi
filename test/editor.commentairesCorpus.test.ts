import { describe, expect, it } from 'vitest'
import {
  commentairesDeEntretien,
  filtrerCommentaires,
  genererMarkdownCommentaires,
  nomFichierMarkdownCommentaires,
  trierCommentaires,
} from '../src/renderer/editor/commentairesCorpus'
import type { Annotation } from '../src/shared/entretien/annotation'

const corps = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { loc: 1 },
      content: [{ type: 'text', text: 'Karine habite Lyon depuis sa retraite.' }],
    },
    {
      type: 'paragraph',
      attrs: { loc: 2 },
      content: [{ type: 'text', text: 'Elle parle souvent de son travail passé.' }],
    },
  ],
}

// « Lyon » occupe les offsets 14 à 18 du premier paragraphe, qui commence à la position 1.
const annotations: Annotation[] = [
  { id: 'c2', type: 'commentaire', from: 41 + 22, to: 41 + 35, auteur: 'Max', texte: 'Retour sur le métier' },
  { id: 'c1', type: 'commentaire', from: 15, to: 19, auteur: 'Élodie', texte: 'Ville citée' },
  { id: 'k1', type: 'codage', from: 1, to: 7, auteur: '', code: 't1' },
  { id: 'c3', type: 'commentaire', from: 30, to: 30, auteur: '', texte: 'Passage disparu' },
]

const entretien = { id: 'e1', titre: 'Entretien Karine' }

describe('commentairesDeEntretien', () => {
  it('garde les seuls commentaires, dans l’ordre du texte, avec leur passage', () => {
    const liste = commentairesDeEntretien(entretien, corps, annotations)
    expect(liste.map((c) => c.id)).toEqual(['c1', 'c3', 'c2'])
    expect(liste[0]).toMatchObject({ passage: 'Lyon', pos: 15, entretienTitre: 'Entretien Karine', orphelin: false })
    expect(liste[2].passage).toBe('son travail p')
  })

  it('signale un commentaire dont le passage a été supprimé', () => {
    const orphelin = commentairesDeEntretien(entretien, corps, annotations).find((c) => c.id === 'c3')!
    expect(orphelin.orphelin).toBe(true)
    expect(orphelin.passage).toBe('')
  })

  it('reste utilisable si le texte est illisible', () => {
    const liste = commentairesDeEntretien(entretien, { type: 'inconnu' }, annotations)
    expect(liste).toHaveLength(3)
    expect(liste.every((c) => c.passage === '')).toBe(true)
  })
})

describe('filtrerCommentaires', () => {
  const liste = commentairesDeEntretien(entretien, corps, annotations)

  it('cherche dans le texte, l’auteur, le passage et l’entretien, sans tenir compte des accents', () => {
    expect(filtrerCommentaires(liste, 'metier').map((c) => c.id)).toEqual(['c2'])
    expect(filtrerCommentaires(liste, 'elodie').map((c) => c.id)).toEqual(['c1'])
    expect(filtrerCommentaires(liste, 'LYON').map((c) => c.id)).toEqual(['c1'])
    expect(filtrerCommentaires(liste, 'karine')).toHaveLength(3)
  })

  it('renvoie tout pour une requête vide', () => {
    expect(filtrerCommentaires(liste, '  ')).toHaveLength(3)
  })
})

describe('trierCommentaires et export Markdown', () => {
  const liste = commentairesDeEntretien(entretien, corps, annotations)

  it('trie par auteur puis garde l’ordre du texte à égalité', () => {
    expect(trierCommentaires(liste, 'auteur', 'asc').map((c) => c.id)).toEqual(['c3', 'c1', 'c2'])
    expect(trierCommentaires(liste, 'auteur', 'desc').map((c) => c.id)).toEqual(['c2', 'c1', 'c3'])
  })

  it('exporte chaque commentaire avec son entretien, son auteur et son passage', () => {
    const md = genererMarkdownCommentaires(liste, 'Mon corpus', new Date('2026-11-13T10:00:00Z'))
    expect(md).toContain('# Commentaires du corpus "Mon corpus"')
    expect(md).toContain('## Entretien Karine - Élodie')
    expect(md).toContain('> Lyon')
    expect(md).toContain('*Passage commenté supprimé du texte.*')
    expect(nomFichierMarkdownCommentaires('Mon/corpus', new Date('2026-11-13T10:00:00Z')))
      .toBe('commentaires_Mon_corpus_2026-11-13.md')
  })
})
