// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import RetraitVarianteAnon from '../src/renderer/components/corpus/RetraitVarianteAnon.vue'
import { inventorierRetraitVarianteAnon, type ApercuRetraitVarianteAnon, type BilanRetraitVarianteDistant, type SuiviRetraitVarianteAnon } from '../src/shared/corpus/retraitVarianteAnon'
import { fixtureRetraitVarianteAnon } from './fixtures/retraitVarianteAnon'
import { tirageAutomatiqueSuspendu } from '../src/renderer/tirageAutomatique'

const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((a) => a.unmount()); document.body.replaceChildren(); vi.restoreAllMocks() })
async function rendu() { await nextTick(); await Promise.resolve(); await nextTick() }
const action = 'Remplacer les choix et retirer la variante'
const bouton = (texte: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === texte)!
async function monter(initial?: 'partiel' | 'indetermine' | 'miroir', disponibleAvant = true) {
  const f = fixtureRetraitVarianteAnon()
  const apercu: ApercuRetraitVarianteAnon = { ...inventorierRetraitVarianteAnon(f.corpus, f.sources, f.demande), token: 'prive', lecture: 'gitlab', applicationDisponible: true }
  const partiel: BilanRetraitVarianteDistant = { ...apercu.bilan, annotations: 3, entretiens: 1, varianteRetiree: false, operationId: 'retrait-variante-prive', statut: 'partiel', miroirIncomplet: false, differes: [{ id: 'e2', motif: 'Session à fermer.' }], nouvellesCibles: [] }
  const suivi: SuiviRetraitVarianteAnon = { ...partiel, demande: f.demande }
  if (initial === 'indetermine') suivi.statut = 'indetermine'
  if (initial === 'miroir') { suivi.varianteRetiree = true; suivi.miroirIncomplet = true }
  const termine: BilanRetraitVarianteDistant = { ...partiel, ...apercu.bilan, statut: 'termine', differes: [] }
  const api = {
    apercuRetraitVarianteAnon: vi.fn(async () => structuredClone(apercu)),
    apercuRepriseRetraitVarianteAnon: vi.fn(async () => ({ ...structuredClone(apercu), token: 'reprise', reprise: suivi.operationId, ciblesRetirees: ['retiree'] })),
    retirerVarianteAnon: vi.fn(async () => structuredClone(partiel)),
    suiviRetraitVarianteAnon: vi.fn(async (): Promise<SuiviRetraitVarianteAnon | null> => structuredClone(suivi)),
    relireSuiviRetraitVarianteAnon: vi.fn(async () => structuredClone(partiel)),
  }
  Object.defineProperty(window, 'sonal', { value: { corpus: api }, configurable: true })
  const contexte = ref(1), disponible = ref(disponibleAvant), fournisseur = ref<string | null>('gitlab'), demande = ref(f.demande)
  const fini = vi.fn(), ferme = vi.fn(), memorise = vi.fn(), activite = vi.fn()
  const host = document.createElement('div'); document.body.append(host)
  const app = createApp({ render: () => h(RetraitVarianteAnon, { demande: demande.value, disponible: disponible.value, contexte: contexte.value, fournisseur: fournisseur.value,
    suivi: initial ? suivi : null, onTermine: fini, onPartiel: memorise, onFermer: ferme, onActivite: activite }) })
  apps.push(app); app.mount(host); await rendu()
  return { f, api, apercu, partiel, suivi, termine, fini, ferme, memorise, activite, contexte, disponible, fournisseur, demande, app }
}
async function confirmer() { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); await rendu() }
async function preparer() { bouton('Préparer le retrait de variante').click(); await rendu() }

test('préparation distante explicite seulement ; slash et remplacement restant, jamais lecture automatique', async () => {
  const b = await monter()
  expect(b.api.apercuRetraitVarianteAnon).not.toHaveBeenCalled(); expect(b.api.suiviRetraitVarianteAnon).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('retirer Claire, conserver Rebecca')
  await preparer(); expect(b.api.apercuRetraitVarianteAnon).toHaveBeenCalledExactlyOnceWith(b.f.demande)
  expect(bouton(action).disabled).toBe(true)
  expect(document.body.textContent).toContain('3 exception(s) et 2 choix masqué(s)')
  await confirmer(); bouton(action).click(); await rendu()
  expect(b.api.retirerVarianteAnon).toHaveBeenCalledExactlyOnceWith('prive', true)
  expect(b.fini).not.toHaveBeenCalled(); expect(b.memorise).toHaveBeenCalledExactlyOnceWith({ ...b.partiel, demande: b.f.demande })
  expect(document.body.textContent).toContain('3 choix remplacé(s) dans 1 entretien(s)')
  expect(bouton('Recalculer la reprise').disabled).toBe(false)
})
test('reprise explicite avec bilan frais, cibles retirées signalées et nouveau consentement', async () => {
  const b = await monter('partiel')
  expect(b.api.apercuRepriseRetraitVarianteAnon).not.toHaveBeenCalled()
  bouton('Recalculer la reprise').click(); await rendu()
  expect(b.api.apercuRepriseRetraitVarianteAnon).toHaveBeenCalledExactlyOnceWith(b.suivi.operationId)
  expect(b.api.apercuRetraitVarianteAnon).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('1 entretien(s) ne sont plus concernés')
  expect(bouton(action).disabled).toBe(true)
  await confirmer(); b.api.retirerVarianteAnon.mockResolvedValueOnce(b.termine)
  bouton(action).click(); await rendu()
  expect(b.api.retirerVarianteAnon).toHaveBeenCalledExactlyOnceWith('reprise', true); expect(b.fini).toHaveBeenCalledExactlyOnceWith(b.termine)
})
test('issue indéterminée : relecture sans envoi, puis nouveau bilan et accord', async () => {
  const b = await monter('indetermine')
  expect(bouton('Recalculer la reprise').disabled).toBe(true)
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(b.api.relireSuiviRetraitVarianteAnon).toHaveBeenCalledExactlyOnceWith(b.suivi.operationId)
  expect(b.api.retirerVarianteAnon).not.toHaveBeenCalled()
  expect(bouton('Recalculer la reprise').disabled).toBe(false)
  bouton('Recalculer la reprise').click(); await rendu(); expect(bouton(action).disabled).toBe(true)
})
test('variante déjà retirée, miroir incomplet : seulement suivi, jamais nouvelle application', async () => {
  const b = await monter('miroir')
  expect(bouton('Recalculer la reprise').disabled).toBe(true)
  b.api.relireSuiviRetraitVarianteAnon.mockResolvedValueOnce(b.termine)
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(b.fini).toHaveBeenCalledExactlyOnceWith(b.termine)
  expect(b.api.apercuRepriseRetraitVarianteAnon).not.toHaveBeenCalled(); expect(b.api.retirerVarianteAnon).not.toHaveBeenCalled()
})
test('erreur d’application : pas de répétition aveugle, relecture retrouve le lot privé', async () => {
  const b = await monter(); await preparer(); await confirmer()
  b.api.retirerVarianteAnon.mockRejectedValueOnce(new Error('Réponse perdue'))
  bouton(action).click(); await rendu()
  expect(bouton('Préparer le retrait de variante').disabled).toBe(true)
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(b.api.suiviRetraitVarianteAnon).toHaveBeenCalledOnce()
  expect(b.api.retirerVarianteAnon).toHaveBeenCalledTimes(1)
  bouton('Recalculer la reprise').click(); await rendu(); expect(bouton(action).disabled).toBe(true)
})
test.each(['absent', 'autre-demande'])('suivi %s ne donne aucune permission de recommencer', async (cas) => {
  const b = await monter(); await preparer(); await confirmer()
  b.api.retirerVarianteAnon.mockRejectedValueOnce(new Error('Interruption'))
  bouton(action).click(); await rendu()
  b.api.suiviRetraitVarianteAnon.mockResolvedValueOnce(cas === 'absent' ? null : { ...b.suivi, demande: { ...b.f.demande, pseudoRetire: 'Rebecca', pseudoConserve: 'Claire' } })
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(document.body.textContent).toContain('Aucun suivi correspondant n’a été trouvé')
  expect(bouton('Préparer le retrait de variante').disabled).toBe(true)
  expect(b.api.relireSuiviRetraitVarianteAnon).not.toHaveBeenCalled()
  expect(b.api.retirerVarianteAnon).toHaveBeenCalledTimes(1)
})
test('suivi momentanément indisponible : lecture renouvelable, pas préparation ni envoi', async () => {
  const b = await monter('partiel')
  b.api.relireSuiviRetraitVarianteAnon.mockRejectedValueOnce(new Error('Lecture refusée'))
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(bouton('Recalculer la reprise').disabled).toBe(true)
  expect(document.body.textContent).toContain('Réessayez la lecture du suivi avant de continuer')
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(bouton('Recalculer la reprise').disabled).toBe(false)
  expect(b.api.retirerVarianteAnon).not.toHaveBeenCalled()
})
test('politique fermée : bilan interdit, suivi toujours consultable sans écriture', async () => {
  const b = await monter('partiel', false)
  expect(bouton('Recalculer la reprise').disabled).toBe(true)
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(b.api.relireSuiviRetraitVarianteAnon).toHaveBeenCalledOnce()
  expect(b.api.apercuRepriseRetraitVarianteAnon).not.toHaveBeenCalled()
})
test.each(['contexte', 'fournisseur', 'demande'] as const)('origine %s changée : aucune reprise, suivi ancien non invoqué', async (cas) => {
  const b = await monter('partiel')
  if (cas === 'contexte') b.contexte.value++
  if (cas === 'fournisseur') b.fournisseur.value = 'webdav'
  if (cas === 'demande') b.demande.value = { ...b.f.demande, pseudoConserve: 'Intrus' }
  await rendu()
  expect(bouton('Relire le suivi GitLab').disabled).toBe(true)
  expect(bouton('Recalculer la reprise').disabled).toBe(true)
  expect(b.api.relireSuiviRetraitVarianteAnon).not.toHaveBeenCalled()
})
test('recherche du suivi tardive : ne relit jamais un ancien lot dans le nouveau contexte', async () => {
  const b = await monter(); let terminer!: (s: SuiviRetraitVarianteAnon | null) => void
  b.api.suiviRetraitVarianteAnon.mockImplementationOnce(() => new Promise((r) => { terminer = r }))
  bouton('Relire le suivi GitLab').click(); await rendu()
  b.contexte.value++; await rendu(); terminer(b.suivi); await rendu()
  expect(b.api.relireSuiviRetraitVarianteAnon).not.toHaveBeenCalled()
  expect(b.memorise).not.toHaveBeenCalled(); expect(tirageAutomatiqueSuspendu.value).toBe(false)
})
test('relecture tardive ignorée, activité maintenue et annulation bloquée jusqu’à réponse', async () => {
  const b = await monter('partiel'); let terminer!: (r: BilanRetraitVarianteDistant) => void
  b.api.relireSuiviRetraitVarianteAnon.mockImplementationOnce(() => new Promise((r) => { terminer = r }))
  try {
    bouton('Relire le suivi GitLab').click(); await rendu()
    expect(tirageAutomatiqueSuspendu.value).toBe(true)
    bouton('Annuler').click(); expect(b.ferme).not.toHaveBeenCalled()
    b.contexte.value++; await rendu(); expect(b.activite).toHaveBeenLastCalledWith(true)
  } finally { terminer(b.termine); await rendu() }
  expect(b.fini).not.toHaveBeenCalled(); expect(b.memorise).not.toHaveBeenCalled()
  expect(tirageAutomatiqueSuspendu.value).toBe(false)
})
test('budget dépassé : conséquence lisible et détails facultatifs ; aucune autorité', async () => {
  const b = await monter()
  b.api.apercuRetraitVarianteAnon.mockResolvedValueOnce({ ...b.apercu, applicationDisponible: false, motifIndisponible: 'La finalisation gardée est limitée à 248 entretiens modifiés par lot avec le publieur actuel.' })
  await preparer()
  expect(document.body.textContent).toContain('plus de 248 entretiens à la fois')
  expect(bouton(action).disabled).toBe(true)
  expect(document.querySelector('details')!.open).toBe(false)
  expect(b.api.retirerVarianteAnon).not.toHaveBeenCalled()
})
