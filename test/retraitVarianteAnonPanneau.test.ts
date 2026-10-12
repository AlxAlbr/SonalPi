// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import PseudonymisationCorpus from '../src/renderer/components/corpus/PseudonymisationCorpus.vue'
import { fixtureRetraitVarianteAnon } from './fixtures/retraitVarianteAnon'
import { scannerCorpus } from '../src/shared/corpus/scanAnon'
import { inventorierRetraitVarianteAnon, type SuiviRetraitVarianteAnon } from '../src/shared/corpus/retraitVarianteAnon'
import { tirageAutomatiqueSuspendu } from '../src/renderer/tirageAutomatique'

let modele: ReturnType<typeof modeleDe>
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => modele }))
function modeleDe() {
  const f = fixtureRetraitVarianteAnon(), regles = Object.values(f.corpus.reglesAnon), capacitesDisponibles = ref(true)
  return {
    membership: ref(f.corpus.membership), reglesAnon: ref(regles), scanAnon: ref(scannerCorpus(regles, f.sources)),
    rafraichirScanAnon: vi.fn(async () => true), rafraichirReglesAnon: vi.fn(async () => {}), perimerScanAnon: vi.fn(),
    scanAnonCharge: ref(true), scanAnonPerime: ref(false), scanAnonEnCours: ref(false), scanAnonErreur: ref<string | null>(null),
    paramsAnon: ref({ prioriteValidation: 'corpus' }), majParamsAnon: vi.fn(), lectureSeule: ref(false), badgeVerrou: vi.fn(() => null),
    capacitesDisponibles, pseudonymisationLigneEditable: vi.fn(() => true), gesteDisponible: vi.fn(() => capacitesDisponibles.value), vue: ref('corpus'), dernierTirage: ref(null),
    fournisseurCourant: ref<string | null>('gitlab'), demandeDissociationAnon: ref(null), revisionCorpus: ref(1),
  }
}
const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((a) => a.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers() })
async function rendu() { for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve() } }
const bouton = (texte: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === texte)!
const modifier = () => document.querySelector<HTMLButtonElement>('button[aria-label="Modifier les pseudonymes de Karine"]')!
async function monter(configurer?: (api: ReturnType<typeof apiDe>, suivi: SuiviRetraitVarianteAnon) => void) {
  modele = modeleDe()
  const f = fixtureRetraitVarianteAnon(), inventaire = inventorierRetraitVarianteAnon(f.corpus, f.sources, f.demande)
  const suivi: SuiviRetraitVarianteAnon = { ...inventaire.bilan, operationId: 'retrait-variante-prive', demande: f.demande,
    annotations: 3, entretiens: 1, varianteRetiree: false, statut: 'partiel', miroirIncomplet: false, differes: [{ id: 'e2', motif: 'Session à fermer.' }], nouvellesCibles: [] }
  const api = apiDe(suivi); configurer?.(api, suivi)
  Object.defineProperty(window, 'sonal', { value: { corpus: api }, configurable: true })
  const actif = ref(true), host = document.createElement('div'); document.body.append(host)
  const app = createApp({ render: () => h(PseudonymisationCorpus, { actif: actif.value }) })
  apps.push(app); app.mount(host); await rendu()
  return { api, suivi, app, actif, modele }
}
function apiDe(suivi: SuiviRetraitVarianteAnon) {
  return {
    suiviRetraitVarianteAnon: vi.fn(async (): Promise<SuiviRetraitVarianteAnon | null> => structuredClone(suivi)),
    relireSuiviRetraitVarianteAnon: vi.fn(async () => { const { demande: _demande, ...bilan } = structuredClone(suivi); return bilan }),
    suiviSuppressionAnon: vi.fn(async () => null), suiviDissociationAnon: vi.fn(async () => null), suiviRenommageAnon: vi.fn(async () => null),
    apercuRetraitVarianteAnon: vi.fn(), apercuRepriseRetraitVarianteAnon: vi.fn(), retirerVarianteAnon: vi.fn(),
  }
}

test('suivi persistant visible sans préparation distante automatique, y compris politique fermée', async () => {
  const b = await monter(); b.modele.capacitesDisponibles.value = false; await rendu()
  expect(document.body.textContent).toContain('Retrait de variante GitLab à reprendre')
  expect(document.body.textContent).toContain('3 choix remplacé(s) dans 1 entretien(s)')
  bouton('Examiner le retrait de variante').click(); await rendu()
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(bouton('Recalculer la reprise').disabled).toBe(true)
  expect(b.api.apercuRetraitVarianteAnon).not.toHaveBeenCalled(); expect(b.api.apercuRepriseRetraitVarianteAnon).not.toHaveBeenCalled()
})
test('retrait en cours prioritaire sur toute nouvelle édition ou renommage', async () => {
  const b = await monter(); modifier().click(); await rendu()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Retirer une variante')
  expect(b.api.suiviRenommageAnon).not.toHaveBeenCalled()
  expect(document.querySelector('input[aria-label="Pseudonymes"]')).toBeNull()
  expect(b.api.retirerVarianteAnon).not.toHaveBeenCalled()
})
test('échec de lecture du suivi : nouvelle édition bloquée, aucun renommage de repli', async () => {
  const b = await monter((api) => api.suiviRetraitVarianteAnon.mockRejectedValue(new Error('Disque')))
  modifier().click(); await rendu()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.body.textContent).toContain('Impossible de vérifier')
  expect(b.api.suiviRenommageAnon).not.toHaveBeenCalled()
})
test('relecture reconnue complète : panneau actualisé, suivi retiré, aucun nouvel envoi', async () => {
  const b = await monter()
  b.api.relireSuiviRetraitVarianteAnon.mockResolvedValueOnce({ ...b.suivi, varianteRetiree: true, statut: 'termine', differes: [] })
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(b.api.relireSuiviRetraitVarianteAnon).toHaveBeenCalledExactlyOnceWith(b.suivi.operationId)
  expect(document.body.textContent).toContain('Variante retirée')
  expect(document.body.textContent).not.toContain('Retrait de variante GitLab à reprendre')
  expect(b.modele.perimerScanAnon).toHaveBeenCalledOnce()
  expect(b.api.retirerVarianteAnon).not.toHaveBeenCalled()
})
test('réponse de suivi ancienne ignorée après changement de corpus', async () => {
  let terminer!: (s: SuiviRetraitVarianteAnon | null) => void
  const b = await monter((api) => { api.suiviRetraitVarianteAnon.mockResolvedValue(null); api.suiviRetraitVarianteAnon.mockImplementationOnce(() => new Promise((r) => { terminer = r })) })
  b.modele.revisionCorpus.value++; await rendu(); terminer(b.suivi); await rendu()
  expect(document.body.textContent).not.toContain('Retrait de variante GitLab à reprendre')
})
test('suivi précédemment connu devenu absent ne permet pas une nouvelle édition', async () => {
  vi.useFakeTimers()
  const b = await monter(); b.api.suiviRetraitVarianteAnon.mockResolvedValue(null)
  bouton('⟳ Actualiser').click(); await rendu()
  expect(document.body.textContent).toContain('Le suivi n’est plus disponible')
  modifier().click(); await rendu()
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(b.api.suiviRenommageAnon).not.toHaveBeenCalled()
})
test('relecture en attente : navigation gardée, tirage suspendu et résultat ancien ignoré', async () => {
  const b = await monter(); let terminer!: (r: Awaited<ReturnType<typeof b.api.relireSuiviRetraitVarianteAnon>>) => void
  b.api.relireSuiviRetraitVarianteAnon.mockImplementationOnce(() => new Promise((r) => { terminer = r }))
  try {
    bouton('Relire le suivi GitLab').click(); await rendu()
    expect(tirageAutomatiqueSuspendu.value).toBe(true)
    expect(bouton('Examiner le retrait de variante').disabled).toBe(true)
    b.modele.revisionCorpus.value++; await rendu()
  } finally { terminer({ ...b.suivi, statut: 'termine', varianteRetiree: true }); await rendu() }
  expect(document.body.textContent).not.toContain('Variante retirée')
  expect(tirageAutomatiqueSuspendu.value).toBe(false)
})
test('au repos : aucune lecture de suivi périodique, y compris après plusieurs minutes', async () => {
  vi.useFakeTimers()
  const b = await monter(), lectures = b.api.suiviRetraitVarianteAnon.mock.calls.length
  await vi.advanceTimersByTimeAsync(180_000); await rendu()
  expect(b.api.suiviRetraitVarianteAnon).toHaveBeenCalledTimes(lectures)
})
test('changement vers local : suivi distant effacé, aucune nouvelle lecture distante périodique', async () => {
  vi.useFakeTimers()
  const b = await monter(); b.modele.fournisseurCourant.value = null; await rendu()
  expect(document.body.textContent).not.toContain('Retrait de variante GitLab à reprendre')
  const lectures = b.api.suiviRetraitVarianteAnon.mock.calls.length
  await vi.advanceTimersByTimeAsync(2_001); await rendu()
  expect(b.api.suiviRetraitVarianteAnon).toHaveBeenCalledTimes(lectures)
})
