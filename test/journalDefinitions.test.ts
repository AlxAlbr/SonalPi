// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { appliquerInverse, estApplicable, type CtxInverse, type Inverse } from '../src/shared/entretien/journal'
import type { CibleValeur } from '../src/shared/corpus/valeursVariables'
import { useJournalEntretien } from '../src/renderer/composables/entretien/useJournalEntretien'

function contexte(): CtxInverse {
  return {
    entretienId: 'e1',
    entretien: { annotations: [], ancres: [], reperesPassages: [] },
    participations: [{ id: 'p1', index: 1, nom: 'Karine', valeursLoc: { v: 'b' } }],
    valeursGen: { v: 'b' },
    themeExiste: (id) => id === 'conserve',
    valeurExiste: (idVar, idMod) => idVar === 'v' && (idMod === null || idMod === 'b'),
  }
}

const cibles: CibleValeur[] = [{ type: 'entretien' }, { type: 'participation', participationId: 'p1' }]
describe('Journal de l’entretien et définitions supprimées', () => {
  test.each(cibles)('%j ne restaure ni une modalité ni une variable disparue', (cible) => {
    const ctx = contexte()
    for (const [idVar, idMod] of [['v', 'a'], ['supprimee', 'b'], ['supprimee', null]] as const) {
      const inverse: Inverse = { type: 'poserValeur', entretienId: 'e1', cible, idVar, idMod }
      expect(estApplicable(inverse, ctx)).toBe(false)
      expect(appliquerInverse(inverse, ctx)).toBe(false)
      expect(ctx.valeursGen).toEqual({ v: 'b' })
      expect(ctx.participations[0].valeursLoc).toEqual({ v: 'b' })
    }
    expect(appliquerInverse({ type: 'poserValeur', entretienId: 'e1', cible, idVar: 'v', idMod: 'b' }, ctx)).toBe(true)
    expect(appliquerInverse({ type: 'poserValeur', entretienId: 'e1', cible, idVar: 'v', idMod: null }, ctx)).toBe(true)
  })

  test('un codage retiré ne revient pas si son thème a été supprimé', () => {
    const ctx = contexte()
    const inverse: Inverse = {
      type: 'reposerAnnotation',
      annotation: { id: 'a', type: 'codage', code: 'supprime', from: 1, to: 5, auteur: 'test' },
    }
    expect(appliquerInverse(inverse, ctx)).toBe(false)
    expect(ctx.entretien.annotations).toEqual([])
    inverse.annotation.code = 'conserve'
    expect(appliquerInverse(inverse, ctx)).toBe(true)
  })

  test('une suppression grise les anciennes actions sans effacer les autres annulations', async () => {
    const scope = effectScope()
    try {
      const modalites = ref(['a', 'b'])
      const ctx = contexte()
      const sauvegarder = vi.fn()
      const journal = scope.run(() => useJournalEntretien({
        entretien: ctx.entretien, ouvertId: ref('e1'), participations: ref(ctx.participations), notes: ref([]),
        lireValeursGen: () => ctx.valeursGen, lireEditeur: () => null,
        valeurExiste: (idVar, idMod) => idVar === 'v' && (idMod === null || modalites.value.includes(idMod)),
        effetsAnnulation: {
          rafraichirProjections: vi.fn(), rafraichirDecorations: vi.fn(), rafraichirGouttiere: vi.fn(),
          rafraichirCompteursAnonymisation: vi.fn(), rafraichirReperage: vi.fn(), planifierSauvegarde: sauvegarder,
        },
      }))!
      const valeur = journal.enregistrerAction('Valeur A', { type: 'poserValeur', entretienId: 'e1', cible: { type: 'entretien' }, idVar: 'v', idMod: 'a' })
      const nom = journal.enregistrerAction('Nom', { type: 'renommerParticipation', reference: { entretienId: 'e1', participationId: 'p1' }, nom: 'Ancien nom' })
      journal.rafraichirJournal()
      expect(journal.entreesJournal.value.every((e) => e.annulable)).toBe(true)
      modalites.value = ['b']
      await nextTick()
      expect(journal.entreesJournal.value.find((e) => e.id === valeur.id)?.annulable).toBe(false)
      journal.annulerEntree(valeur.id)
      expect(ctx.valeursGen.v).toBe('b')
      expect(sauvegarder).not.toHaveBeenCalled()
      journal.annulerEntree(nom.id)
      expect(sauvegarder).toHaveBeenCalledOnce()
    } finally {
      scope.stop()
    }
  })
})
