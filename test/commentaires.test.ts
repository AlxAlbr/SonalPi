import { describe, test, expect } from 'vitest'
import { ajouterCommentaire, ajouterCodage, modifierCommentaire, retirerAnnotation, type Entretien } from '../src/shared/entretien/entretien'
import { annuler, appliquerInverse, enregistrer, estApplicable, type CtxInverse } from '../src/shared/entretien/journal'

/** Entretien de test vide + générateur d'ids séquentiels (déterministe). */
function neuf(): { entretien: Entretien; genId: () => string } {
  const entretien: Entretien = { annotations: [], ancres: [] }
  let n = 0
  return { entretien, genId: () => `a-${++n}` }
}

const ctx = (e: Entretien): CtxInverse => ({
  entretien: e,
  locuteurs: [],
  valeursGen: {},
})

describe('ajouterCommentaire', () => {
  test('pose une annotation autonome avec auteur et texte rognés', () => {
    const { entretien, genId } = neuf()
    const c = ajouterCommentaire(entretien, { from: 5, to: 12, auteur: ' Karine ', texte: '  revenir dessus  ' }, genId)
    expect(c).not.toBeNull()
    expect(c!.type).toBe('commentaire')
    expect(c!.auteur).toBe('Karine')
    expect(c!.texte).toBe('revenir dessus')
    expect(entretien.annotations).toHaveLength(1)
  })

  test('refuse plage vide ou texte vide', () => {
    const { entretien, genId } = neuf()
    expect(ajouterCommentaire(entretien, { from: 5, to: 5, auteur: 'K', texte: 'x' }, genId)).toBeNull()
    expect(ajouterCommentaire(entretien, { from: 5, to: 8, auteur: 'K', texte: '   ' }, genId)).toBeNull()
    expect(entretien.annotations).toHaveLength(0)
  })
})

describe('modifierCommentaire', () => {
  test('réécrit texte et auteur ; refuse un commentaire devenu vide', () => {
    const { entretien, genId } = neuf()
    const c = ajouterCommentaire(entretien, { from: 1, to: 4, auteur: 'Karine', texte: 'brouillon' }, genId)!
    expect(modifierCommentaire(entretien, c.id, { auteur: 'Alain', texte: 'relu' })).toBe(true)
    expect(c.auteur).toBe('Alain')
    expect(c.texte).toBe('relu')
    expect(modifierCommentaire(entretien, c.id, { auteur: 'Alain', texte: '  ' })).toBe(false)
    expect(c.texte).toBe('relu') // inchangé après le refus
  })

  test('refuse un id qui n’est pas un commentaire', () => {
    const { entretien, genId } = neuf()
    const k = ajouterCodage(entretien, { from: 1, to: 4, code: 'cat_001', auteur: 'moi' }, genId)!
    expect(modifierCommentaire(entretien, k.id, { auteur: 'X', texte: 'y' })).toBe(false)
  })
})

describe('journal des commentaires', () => {
  test('« Commentaire posé » → inverse retirerAnnotation applicable puis annulable', () => {
    const { entretien, genId } = neuf()
    const c = ajouterCommentaire(entretien, { from: 3, to: 9, auteur: 'K', texte: 'note' }, genId)!
    const journal = { entrees: [] }
    enregistrer(journal, 'Commentaire posé', { type: 'retirerAnnotation', annotationId: c.id }, genId)
    expect(estApplicable(journal.entrees[0].inverse, ctx(entretien))).toBe(true)
    expect(annuler(journal, journal.entrees[0].id, ctx(entretien))).toBe(true)
    expect(entretien.annotations).toHaveLength(0)
  })

  test('« Commentaire supprimé » → reposerAnnotation remet l’objet intact', () => {
    const { entretien, genId } = neuf()
    const c = ajouterCommentaire(entretien, { from: 3, to: 9, auteur: 'K', texte: 'note' }, genId)!
    retirerAnnotation(entretien, c.id)
    const journal = { entrees: [] }
    enregistrer(journal, 'Commentaire supprimé', { type: 'reposerAnnotation', annotation: { ...c } }, genId)
    expect(annuler(journal, journal.entrees[0].id, ctx(entretien))).toBe(true)
    expect(entretien.annotations[0].texte).toBe('note')
  })

  test('« Commentaire modifié » → editerAnnotation restaure auteur et texte d’avant', () => {
    const { entretien, genId } = neuf()
    const c = ajouterCommentaire(entretien, { from: 3, to: 9, auteur: 'K', texte: 'avant' }, genId)!
    modifierCommentaire(entretien, c.id, { auteur: 'A', texte: 'après' })
    const journal = { entrees: [] }
    enregistrer(
      journal,
      'Commentaire modifié',
      { type: 'editerAnnotation', annotationId: c.id, auteur: 'K', texte: 'avant' },
      genId,
    )
    expect(annuler(journal, journal.entrees[0].id, ctx(entretien))).toBe(true)
    expect(c.auteur).toBe('K')
    expect(c.texte).toBe('avant')
  })

  test('editerAnnotation visant autre chose qu’un commentaire : rien ne bouge', () => {
    const { entretien, genId } = neuf()
    const k = ajouterCodage(entretien, { from: 1, to: 4, code: 'cat_001', auteur: 'moi' }, genId)!
    const inv = { type: 'editerAnnotation' as const, annotationId: k.id, auteur: 'X', texte: 'Y' }
    // L'id existe → applicable en apparence ; mais l'application refuse de
    // réécrire un non-commentaire, et ne touche à rien.
    expect(estApplicable(inv, ctx(entretien))).toBe(true)
    expect(appliquerInverse(inv, ctx(entretien))).toBe(false)
    expect(k.code).toBe('cat_001')
  })
})
