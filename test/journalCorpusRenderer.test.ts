// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import PanneauJournalCorpus from '../src/renderer/components/traiter/corpus/PanneauJournalCorpus.vue'
import { useJournalCorpus } from '../src/renderer/composables/corpus/useJournalCorpus'
import type { EntreeJournalCorpusVue } from '../src/shared/corpus/journal'

const injection = vi.hoisted(() => ({ contexte: {} as any }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.contexte }))
const apps: App[] = []
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
  document.body.innerHTML = ''
})

async function monter(distant = false) {
  const entrees: EntreeJournalCorpusVue[] = [
    { id: 'note', origine: 'notes', libelle: 'Note modifiée', horodatage: '2026-09-01T10:00:00Z', etat: 'annulable' },
    { id: 'nom', origine: 'personnes', libelle: 'Personne renommée', horodatage: '2026-09-01T09:00:00Z', etat: 'annulable' },
    { id: 'lien', origine: 'personnes', libelle: 'Locuteur dissocié', horodatage: '2026-09-01T08:00:00Z', etat: 'inapplicable', raison: 'Le lien a changé.' },
  ]
  const annuler = vi.fn(async () => ({ ok: true }))
  injection.contexte = {
    entreesJournalCorpus: ref(entrees),
    rafraichirJournalCorpus: vi.fn(async () => {}),
    annulerEntreeJournalCorpus: annuler,
    idDistantCourant: ref(distant ? 'distant' : null),
    dossierCourantDir: ref('/corpus'),
  }
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(PanneauJournalCorpus, { actif: true, origine: 'personnes' })
  apps.push(app)
  app.mount(host)
  await nextTick()
  await nextTick()
  return { host, annuler }
}

test('les annulations Personnes excluent Notes et désignent précisément l’action choisie', async () => {
  const { host, annuler } = await monter()
  expect(host.textContent).not.toContain('Note modifiée')
  expect(host.textContent).toContain('Personne renommée')
  expect(host.textContent).toContain('Le lien a changé.')
  const boutons = host.querySelectorAll<HTMLButtonElement>('.annuler-action')
  expect(boutons[0].disabled).toBe(false)
  expect(boutons[1].disabled).toBe(true)
  boutons[0].click()
  await nextTick()
  expect(annuler).toHaveBeenCalledExactlyOnceWith('nom')
})

test('une lecture d’un ancien corpus ne remplit pas le nouveau journal', async () => {
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

test('la consultation distante conserve les libellés sans autoriser d’annulation', async () => {
  const { host, annuler } = await monter(true)
  expect(host.textContent).toContain('n’est pas encore disponible')
  for (const bouton of host.querySelectorAll<HTMLButtonElement>('.annuler-action')) {
    expect(bouton.disabled).toBe(true)
    bouton.click()
  }
  expect(annuler).not.toHaveBeenCalled()
})
