// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import RetraitVarianteAnon from '../src/renderer/components/traiter/corpus/RetraitVarianteAnon.vue'
import { inventorierRetraitVarianteAnon, type ApercuRetraitVarianteAnon } from '../src/shared/corpus/retraitVarianteAnon'
import { fixtureRetraitVarianteAnon } from './fixtures/retraitVarianteAnon'
import { tirageAutomatiqueSuspendu } from '../src/renderer/tirageAutomatique'

const apps: App[] = []
afterEach(() => { for (const a of apps.splice(0)) a.unmount(); document.body.replaceChildren(); vi.restoreAllMocks() })
async function rendu() { await nextTick(); await Promise.resolve(); await nextTick() }
function bouton(texte: string) { return [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === texte)! }
const action = 'Remplacer les choix et retirer la variante'
async function monter(configurer?: (api: ReturnType<typeof apiDe>, apercu: ApercuRetraitVarianteAnon) => void, disponibleAvant = true) {
  const f = fixtureRetraitVarianteAnon(), apercu: ApercuRetraitVarianteAnon = { ...inventorierRetraitVarianteAnon(f.corpus, f.sources, f.demande), token: 'prive', lecture: 'local', applicationDisponible: true }
  const api = apiDe(apercu); configurer?.(api, apercu)
  Object.defineProperty(window, 'sonal', { value: { corpus: api }, configurable: true })
  const demande = ref(f.demande), disponible = ref(disponibleAvant), contexte = ref(1), termine = vi.fn(), fermer = vi.fn(), activite = vi.fn()
  const host = document.createElement('div'); document.body.append(host)
  const app = createApp({ render: () => h(RetraitVarianteAnon, { demande: demande.value, disponible: disponible.value, contexte: contexte.value, onTermine: termine, onFermer: fermer, onActivite: activite }) })
  apps.push(app); app.mount(host); await rendu()
  return { f, apercu, api, app, demande, disponible, contexte, termine, fermer, activite }
}
function apiDe(apercu: ApercuRetraitVarianteAnon) {
  return { apercuRetraitVarianteAnon: vi.fn(async () => structuredClone(apercu)), retirerVarianteAnon: vi.fn(async () => structuredClone(apercu.bilan)) }
}
async function confirmer() { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); await rendu() }
test('bilan automatique, remplacement explicite, exceptions en clair et consentement avant toute écriture', async () => {
  const b = await monter()
  expect(b.api.apercuRetraitVarianteAnon).toHaveBeenCalledExactlyOnceWith(b.f.demande)
  expect(document.body.textContent).toContain('6 choix à remplacer dans 2 entretien(s)')
  expect(document.body.textContent).toContain('3 exception(s) et 2 choix masqué(s)')
  expect(document.body.textContent).toContain('Les passages laissés en clair restent en clair')
  expect(document.body.textContent).toContain('remplace ses choix liés par Rebecca')
  expect(bouton(action).disabled).toBe(true); expect(b.api.retirerVarianteAnon).not.toHaveBeenCalled()
  await confirmer(); bouton(action).click(); await rendu()
  expect(b.api.retirerVarianteAnon).toHaveBeenCalledExactlyOnceWith('prive', true); expect(b.termine).toHaveBeenCalledExactlyOnceWith(b.apercu.bilan)
})
test('annulation sans écriture et restitution du focus', async () => {
  const avant = document.createElement('button'); document.body.append(avant); avant.focus()
  const b = await monter(); bouton('Annuler').click(); await rendu()
  expect(b.fermer).toHaveBeenCalledOnce(); expect(b.api.retirerVarianteAnon).not.toHaveBeenCalled()
  b.app.unmount(); apps.splice(apps.indexOf(b.app), 1); await rendu(); expect(document.activeElement).toBe(avant)
})
test.each(['capacite', 'contexte', 'demande'] as const)('changement de %s invalide bilan et choix du remplacement', async (cas) => {
  const b = await monter(); await confirmer()
  if (cas === 'capacite') b.disponible.value = false
  if (cas === 'contexte') b.contexte.value++
  if (cas === 'demande') b.demande.value = { ...b.demande.value, pseudoConserve: 'Autre' }
  await rendu(); expect(document.querySelector('input[type="checkbox"]')).toBeNull()
  expect(bouton('Actualiser le bilan').disabled).toBe(true); expect(b.api.retirerVarianteAnon).not.toHaveBeenCalled()
})
test.each(['session', 'obstacle'])('bilan ne donnant pas d’autorité : %s', async (cas) => {
  await monter((api, p) => api.apercuRetraitVarianteAnon.mockResolvedValueOnce({ ...p, applicationDisponible: cas !== 'session', faisable: cas !== 'obstacle', obstacles: cas === 'obstacle' ? [{ code: 'annotation-invalide', entretienId: 'e1' }] : [] }))
  expect(bouton(action).disabled).toBe(true); expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true)
  expect(document.body.textContent).toContain(cas === 'session' ? 'fermez et rouvrez cette fenêtre' : 'Entretien e1')
})
test('envoi unique, tirage suspendu et navigation bloquée jusqu’au résultat', async () => {
  const b = await monter(); await confirmer(); let terminer!: (r: typeof b.apercu.bilan) => void
  b.api.retirerVarianteAnon.mockImplementation(() => new Promise((r) => { terminer = r }))
  try {
    bouton(action).click(); await rendu(); expect(tirageAutomatiqueSuspendu.value).toBe(true)
    bouton('Annuler').click(); document.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(b.fermer).not.toHaveBeenCalled(); expect(b.activite).toHaveBeenLastCalledWith(true)
    expect(b.api.retirerVarianteAnon).toHaveBeenCalledTimes(1)
  } finally { terminer(b.apercu.bilan); await rendu() }
  expect(tirageAutomatiqueSuspendu.value).toBe(false)
})
test('réponse tardive ignorée, activité conservée pendant un changement de contexte', async () => {
  const b = await monter(); await confirmer(); let terminer!: (r: typeof b.apercu.bilan) => void
  b.api.retirerVarianteAnon.mockImplementation(() => new Promise((r) => { terminer = r }))
  try {
    bouton(action).click(); await rendu(); b.contexte.value++; await rendu()
    expect(b.activite).toHaveBeenLastCalledWith(true); expect(b.termine).not.toHaveBeenCalled()
  } finally { terminer(b.apercu.bilan); await rendu() }
  expect(b.termine).not.toHaveBeenCalled(); expect(b.activite).toHaveBeenLastCalledWith(false)
})
test('erreur après tentative : aucune nouvelle préparation ni répétition, détails d’assistance repliés', async () => {
  const b = await monter(); await confirmer()
  b.api.retirerVarianteAnon.mockRejectedValueOnce(new Error("Error invoking remote method 'corpus:retirerVarianteAnon': Error: Interruption."))
  bouton(action).click(); await rendu()
  expect(document.body.textContent).toContain('rouvrez le corpus pour vérifier ce qui a été enregistré')
  expect(document.body.textContent).not.toContain('Error invoking'); expect(bouton('Actualiser le bilan').disabled).toBe(true)
  expect(document.querySelector('details')!.open).toBe(false); expect(b.termine).not.toHaveBeenCalled()
})
test('calcul échoué : relecture explicite possible, sans autorité d’écriture héritée', async () => {
  const b = await monter((api) => api.apercuRetraitVarianteAnon.mockRejectedValueOnce(new Error('Lecture refusée.')))
  expect(bouton('Actualiser le bilan').disabled).toBe(false); bouton('Actualiser le bilan').click(); await rendu()
  expect(b.api.apercuRetraitVarianteAnon).toHaveBeenCalledTimes(2); expect(bouton(action).disabled).toBe(true)
})
test('piège de focus n’inclut pas les détails fermés', async () => {
  await monter(); await confirmer(); const premier = bouton('Annuler'), dernier = bouton(action)
  dernier.focus(); dernier.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(premier)
  premier.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(dernier)
})
test('calcul en attente : réponse après démontage ignorée et suspension rendue', async () => {
  let terminer!: (r: ApercuRetraitVarianteAnon) => void
  const b = await monter((api) => api.apercuRetraitVarianteAnon.mockImplementation(() => new Promise((r) => { terminer = r })))
  expect(tirageAutomatiqueSuspendu.value).toBe(true)
  b.app.unmount(); apps.splice(apps.indexOf(b.app), 1); terminer(b.apercu); await rendu()
  expect(b.api.retirerVarianteAnon).not.toHaveBeenCalled(); expect(b.termine).not.toHaveBeenCalled(); expect(tirageAutomatiqueSuspendu.value).toBe(false)
})
test('capacité refusée avant montage : aucune lecture et aucune écriture', async () => {
  const b = await monter(undefined, false); expect(b.api.apercuRetraitVarianteAnon).not.toHaveBeenCalled(); expect(b.api.retirerVarianteAnon).not.toHaveBeenCalled()
})
