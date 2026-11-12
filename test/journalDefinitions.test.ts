// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { appliquerInverse, estApplicable, type CtxInverse, type Inverse } from '../src/shared/entretien/journal'
import { useJournalEntretien } from '../src/renderer/composables/entretien/useJournalEntretien'

function contexte(): CtxInverse {
  return {
    entretien: { annotations: [], ancres: [], reperesPassages: [] },
    locuteurs: [{ index: 1, nom: 'Karine', valeursLoc: { v: 'b' }, personneRef: null }],
    valeursGen: { v: 'b' },
    themeExiste: (id) => id === 'conserve',
    valeurExiste: (idVar, idMod) => idVar === 'v' && (idMod === null || idMod === 'b'),
  }
}

describe('Journal de l’entretien et définitions supprimées', () => {
  test.each(['poserValeurGen', 'poserValeurLoc'] as const)('%s ne restaure ni une modalité ni une variable disparue', (type) => {
    const ctx = contexte()
    for (const [idVar, idMod] of [['v', 'a'], ['supprimee', 'b'], ['supprimee', null]] as const) {
      const inverse: Inverse = { type, index: 1, idVar, idMod }
      expect(estApplicable(inverse, ctx)).toBe(false)
      expect(appliquerInverse(inverse, ctx)).toBe(false)
      expect(ctx.valeursGen).toEqual({ v: 'b' })
      expect(ctx.locuteurs[0].valeursLoc).toEqual({ v: 'b' })
    }
    expect(appliquerInverse({ type, index: 1, idVar: 'v', idMod: 'b' }, ctx)).toBe(true)
    expect(appliquerInverse({ type, index: 1, idVar: 'v', idMod: null }, ctx)).toBe(true)
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
        entretien: ctx.entretien, locuteurs: ref(ctx.locuteurs), notes: ref([]),
        lireValeursGen: () => ctx.valeursGen, lireEditeur: () => null,
        valeurExiste: (idVar, idMod) => idVar === 'v' && (idMod === null || modalites.value.includes(idMod)),
        effetsAnnulation: {
          rafraichirProjections: vi.fn(), rafraichirDecorations: vi.fn(), rafraichirGouttiere: vi.fn(),
          rafraichirCompteursAnonymisation: vi.fn(), rafraichirReperage: vi.fn(), planifierSauvegarde: sauvegarder,
        },
      }))!
      const valeur = journal.enregistrerAction('Valeur A', { type: 'poserValeurGen', idVar: 'v', idMod: 'a' })
      const nom = journal.enregistrerAction('Nom', { type: 'renommerLocuteur', index: 1, nom: 'Ancien nom' })
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
