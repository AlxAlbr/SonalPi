// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import ThemesOpsCorpus from '../src/renderer/components/traiter/corpus/ThemesOpsCorpus.vue'
import type { ApercuOperationTheme, SuiviOperationTheme } from '../src/shared/corpus/themes'
import { FORMAT_VERSION } from '../src/shared/format'
import { reinitialiserOperationGlobale } from '../src/renderer/operationGlobaleCorpus'

const injection = vi.hoisted(() => ({ contexte: null as unknown }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.contexte }))
const apps: App[] = []
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  document.body.replaceChildren()
  reinitialiserOperationGlobale()
  vi.unstubAllGlobals()
})
async function terminerRendu() { for (let n = 0; n < 8; n++) { await Promise.resolve(); await nextTick() } }
function bouton(texte: string): HTMLButtonElement {
  const b = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte)
  if (!b) throw new Error(`Bouton absent : ${texte}`)
  return b
}
async function monter(suiviInitial: SuiviOperationTheme | null) {
  let suivi = suiviInitial
  const codebook = {
    s: { id: 's', nom: 'Source', parent: null, ordre: 0, actif: true, codeExport: 'S' },
    c: { id: 'c', nom: 'Cible', parent: null, ordre: 1, actif: true, codeExport: 'C' },
    N1: { id: 'N1', nom: 'Destination renommée', parent: 's', ordre: 2, actif: true, codeExport: 'A' },
    N2: { id: 'N2', nom: 'Deuxième destination', parent: 's', ordre: 3, actif: true, codeExport: 'B' },
  }
  const apercu: ApercuOperationTheme = { operationId: 'nouvel-apercu', sources: ['s'], execution: 'entretiens-sequentiels',
    parEntretien: [{ id: 'e2', titre: 'Entretien 2', passages: 1, orphelins: 0, aModifier: false }],
    totaux: { entretiens: 1, passages: 1, orphelins: 0, doublonsPrevisibles: 0 }, faisable: true, obstacles: [] }
  const api = {
    lireSuiviOperationTheme: vi.fn(async () => structuredClone(suivi)),
    preparerRepriseOperationTheme: vi.fn(async () => ({ demande: { ...structuredClone(suivi!.demande), choix: [] }, apercu })),
    analyserOperationTheme: vi.fn(async () => apercu),
    detailsOperationTheme: vi.fn(async (operationId: string, entretienId: string) => ({ operationId, entretienId,
      codages: [{ annotationId: 'a', codage: { entretienId, annotationId: 'a' }, from: 1, to: 5, orphelin: false, avant: '', extrait: 'Passage', apres: '' }] })),
    executerOperationTheme: vi.fn(),
    surProgressionOperationTheme: vi.fn(() => () => {}),
    reconcilierOperationTheme: vi.fn(async () => {
      suivi!.indeterminee = false
      return { statut: 'partielle', operationId: suivi!.operationId,
        corpus: { formatVersion: FORMAT_VERSION, codebook, membership: {}, variables: {}, reglesAnon: {}, personnes: {} }, bilan: suivi!.bilan }
    }),
    abandonnerOperationTheme: vi.fn(async () => { suivi = null }),
  }
  vi.stubGlobal('sonal', { corpus: api })
  const categories = ref(Object.values(codebook))
  injection.contexte = {
    codebook: categories, arbreThemes: () => categories.value.map((cat) => ({ cat, profondeur: 0 })),
    gesteDisponible: (geste: string) => ['transfertThemes', 'divisionThemes'].includes(geste),
    lectureSeule: ref(false), majCodebook: vi.fn(), rafraichirUsages: vi.fn(async () => {}),
    vue: ref('corpus'), revisionCorpus: ref(0), ouvrirEntretien: vi.fn(), membership: ref({ e1: { titre: 'Entretien 1' }, e2: { titre: 'Entretien 2' } }),
  }
  const conteneur = document.createElement('div')
  document.body.append(conteneur)
  const app = createApp(ThemesOpsCorpus, { actif: true })
  apps.push(app)
  app.mount(conteneur)
  await terminerRendu()
  return api
}
function lot(indeterminee = false): SuiviOperationTheme {
  return { operationId: 'lot-durable', indeterminee, demande: { type: 'division', source: 's', effacerSource: false,
    cibles: ['N1', 'N2'],
    choix: [{ codage: { entretienId: 'e1', annotationId: 'a' }, destination: 'N1' }] },
    bilan: { reussis: [{ id: 'e1', reaffectes: 1, doublonsSupprimes: 0 }], echecs: [{ id: 'e2', motif: 'tenu par un tiers' }],
      ciblesCreees: [], sourceConservee: true, finalisation: 'non-demandee' } }
}

test('le lot durable est visible après ouverture et reprend les destinations existantes', async () => {
  const api = await monter(lot())
  expect(bouton('Transférer…').disabled).toBe(true)
  expect(bouton('Diviser…').disabled).toBe(true)
  bouton('Recalculer et reprendre').click()
  await terminerRendu()
  expect(api.preparerRepriseOperationTheme).toHaveBeenCalledExactlyOnceWith('lot-durable')
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('codage(s) sans destination')
  document.querySelector<HTMLButtonElement>('.entete')!.click()
  await terminerRendu()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Destination renommée')
  expect(bouton('Modifier les destinations').disabled).toBe(true)
  expect(api.executerOperationTheme).not.toHaveBeenCalled()
})

test('publication inconnue : vérifier sans rejouer, puis proposer la reprise explicite', async () => {
  const api = await monter(lot(true))
  expect(document.body.textContent).not.toContain('Clôturer le suivi sans reprendre')
  bouton('Vérifier la publication').click()
  await terminerRendu()
  expect(api.reconcilierOperationTheme).toHaveBeenCalledExactlyOnceWith('lot-durable')
  expect(api.executerOperationTheme).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('les succès restent acquis')
  expect(bouton('Recalculer et reprendre').disabled).toBe(false)
})

test('la confirmation WebDAV décrit les succès partiels et non la transaction locale', async () => {
  const api = await monter(null)
  bouton('Transférer…').click()
  await terminerRendu()
  const selects = document.querySelectorAll<HTMLSelectElement>('[role="dialog"] select')
  selects[0].value = 's'
  selects[0].dispatchEvent(new Event('change', { bubbles: true }))
  await terminerRendu()
  selects[1].value = 'c'
  selects[1].dispatchEvent(new Event('change', { bubbles: true }))
  document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await terminerRendu()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('sans atomicité globale')
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('transaction interrompue sera reprise')
  expect(api.executerOperationTheme).not.toHaveBeenCalled()
})
