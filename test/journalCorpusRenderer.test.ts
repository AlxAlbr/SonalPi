// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest'
import { useJournalCorpus } from '../src/renderer/composables/corpus/useJournalCorpus'
import type { EntreeJournalCorpusVue } from '../src/shared/corpus/journal'

test('une lecture d’un ancien corpus ne remplit pas le nouveau journal interne', async () => {
  let terminer!: (entrees: EntreeJournalCorpusVue[]) => void
  ;(window as any).sonal = { corpus: { journalLister: () => new Promise((resolve) => { terminer = resolve }) } }
  const journal = useJournalCorpus({ flush: async () => {} }, { rafraichirMatrice: async () => true, perimerScanAnon: () => {} })
  const lecture = journal.rafraichirJournalCorpus()
  await Promise.resolve()
  journal.reinitialiser()
  terminer([{ id: 'ancien', origine: 'notes', libelle: 'Ancienne note', horodatage: '2026-09-01T09:00:00Z', etat: 'annulable' }])
  await lecture
  expect(journal.entreesJournalCorpus.value).toEqual([])
})

test('un changement de corpus pendant la sauvegarde interdit l’annulation en attente', async () => {
  let terminer!: () => void
  const annuler = vi.fn()
  ;(window as any).sonal = { corpus: { journalAnnuler: annuler } }
  const journal = useJournalCorpus({ flush: () => new Promise<void>((resolve) => { terminer = resolve }) }, { rafraichirMatrice: async () => true, perimerScanAnon: () => {} })
  const action = journal.annulerEntreeJournalCorpus('ancienne-action')
  journal.reinitialiser()
  terminer()
  await expect(action).resolves.toMatchObject({ ok: false })
  expect(annuler).not.toHaveBeenCalled()
})
