import { describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { appliquerInverse, estApplicable, type CtxInverse, type Inverse } from '../src/shared/entretien/journal'
import { useJournalEntretien } from '../src/renderer/composables/entretien/useJournalEntretien'
import { participationParId, renommerParticipation } from '../src/shared/entretien/participations'
import { entretienCasNatif } from './fixtures/casNatifs'

function contexte(): CtxInverse {
  const data = entretienCasNatif()
  data.participations.push({ ...data.participations[0], id: '7', index: 11, locuteurRef: 'autre', valeursLoc: {} })
  return { entretienId: 'e1', entretien: { annotations: [], ancres: [], reperesPassages: [] },
    participations: data.participations, valeursGen: data.meta.valeursGen }
}

const inverse: Inverse = { type: 'renommerParticipation', reference: { entretienId: 'e1', participationId: '7' }, nom: 'Nom précédent' }

describe('noms locaux et journal par participation', () => {
  test('un renommage local et son inverse ne modifient ni les index ni les autres données', () => {
    const ctx = contexte(), avant = structuredClone(ctx.participations)
    expect(renommerParticipation(ctx.participations, '7', 'Nom local')).toBe(true)
    expect(appliquerInverse(inverse, ctx)).toBe(true)
    expect(ctx.participations).toEqual([avant[0], { ...avant[1], nom: 'Nom précédent' }])
  })

  test('l’ancien nom retrouve le même id après changement d’index et d’ordre', () => {
    const ctx = contexte()
    ctx.participations[0].index = 11
    ctx.participations[1].index = 7
    ctx.participations.reverse()
    expect(appliquerInverse(inverse, ctx)).toBe(true)
    expect(ctx.participations[0]).toMatchObject({ id: '7', index: 7, nom: 'Nom précédent' })
    expect(ctx.participations[1].nom).not.toBe('Nom précédent')
  })

  test('un id identique dans un autre entretien ne suffit pas à autoriser l’annulation', () => {
    const ctx = contexte()
    ctx.entretienId = 'e2'
    const avant = structuredClone(ctx)
    expect(estApplicable(inverse, ctx)).toBe(false)
    expect(appliquerInverse(inverse, ctx)).toBe(false)
    expect(ctx).toEqual(avant)
  })

  test('une participation retirée n’est pas remplacée par celle qui réutilise son index', () => {
    const ctx = contexte()
    ctx.participations[1].id = 'nouvelle'
    const avant = structuredClone(ctx)
    expect(appliquerInverse(inverse, ctx)).toBe(false)
    expect(renommerParticipation(ctx.participations, '7', 'Autre nom')).toBe(false)
    expect(ctx).toEqual(avant)
  })

  test('une recherche ne complète pas les ids absents et ne tranche pas une référence ambiguë', () => {
    const participations = [{ index: 7, id: undefined }, { index: 11, id: '7' }, { index: 12, id: '7' }]
    const avant = structuredClone(participations)
    expect(participationParId(participations, '')).toBeUndefined()
    expect(participationParId(participations, '7')).toBeUndefined()
    expect(participationParId(participations, '11')).toBeUndefined()
    expect(participations).toEqual(avant)
  })

  test('la perte des droits grise le journal et interdit sa sauvegarde même par un appel direct', async () => {
    const scope = effectScope()
    try {
      const ctx = contexte(), editable = ref(true), sauvegarder = vi.fn()
      const journal = scope.run(() => useJournalEntretien({
        entretien: ctx.entretien, ouvertId: ref('e1'), participations: ref(ctx.participations), notes: ref([]),
        editable: () => editable.value, lireValeursGen: () => ctx.valeursGen, lireEditeur: () => null,
        effetsAnnulation: { rafraichirProjections: vi.fn(), rafraichirDecorations: vi.fn(), rafraichirGouttiere: vi.fn(),
          rafraichirCompteursAnonymisation: vi.fn(), rafraichirReperage: vi.fn(), planifierSauvegarde: sauvegarder },
      }))!
      const entree = journal.enregistrerAction('Nom local', inverse)
      journal.rafraichirJournal()
      expect(journal.entreesJournal.value[0].annulable).toBe(true)
      editable.value = false
      await nextTick()
      expect(journal.entreesJournal.value[0].annulable).toBe(false)
      const avant = structuredClone(ctx)
      journal.annulerEntree(entree.id)
      expect(ctx).toEqual(avant)
      expect(sauvegarder).not.toHaveBeenCalled()
      expect(journal.journal.entrees).toHaveLength(1)
    } finally { scope.stop() }
  })
})
