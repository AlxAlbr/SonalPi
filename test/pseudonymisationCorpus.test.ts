import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  construireDiff,
  etatsDepuisDetails,
  type OccurrenceScan,
} from '../src/shared/corpus/scanAnon'
import { useCorpus } from '../src/renderer/composables/useCorpus'

const fenetreInitiale = globalThis.window
afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(globalThis, 'window', { value: fenetreInitiale, configurable: true })
})

const occurrence = (from: number, etat: OccurrenceScan['etat']): OccurrenceScan => ({
  from,
  to: from + 4,
  etat,
  avant: '',
  match: 'Lyon',
  apres: '',
})

describe('diff de pseudonymisation corpus', () => {
  const details = {
    e1: [occurrence(1, 'non'), occurrence(10, 'anon'), occurrence(20, 'exc'), occurrence(30, 'incl')],
  }

  test('est vide immédiatement après le chargement et après un abandon', () => {
    const etats = etatsDepuisDetails(details)
    expect(construireDiff('r1', details, etats.cochees, etats.exceptions).cibles).toEqual([])

    etats.cochees.e1['1:5'] = true
    const abandon = etatsDepuisDetails(details)
    expect(construireDiff('r1', details, abandon.cochees, abandon.exceptions).cibles).toEqual([])
  })

  test('détecte poses, retraits et changements d’exception', () => {
    const etats = etatsDepuisDetails(details)
    etats.cochees.e1['1:5'] = true
    etats.cochees.e1['10:14'] = false
    etats.exceptions.e1['1:5'] = true
    etats.exceptions.e1['20:24'] = false
    const diff = construireDiff('r1', details, etats.cochees, etats.exceptions)
    expect(diff).toMatchObject({ poses: 1, retraits: 1, exceptionsAjoutees: 1, exceptionsRetirees: 1 })
    expect(diff.cibles).toHaveLength(1)
  })
})

describe('cycle du scan', () => {
  test('réutilise un scan frais et fusionne les chargements concurrents', async () => {
    let terminer!: (valeur: unknown[]) => void
    const scanAnon = vi.fn(() => new Promise<unknown[]>((resolve) => { terminer = resolve }))
    const reglesAnon = vi.fn().mockResolvedValue([])
    Object.defineProperty(globalThis, 'window', {
      value: { sonal: { corpus: { scanAnon, reglesAnon } } },
      configurable: true,
    })
    const corpus = useCorpus({ flush: async () => {} })
    const premier = corpus.rafraichirScanAnon(false)
    const concurrent = corpus.rafraichirScanAnon(false)
    expect(scanAnon).toHaveBeenCalledTimes(1)
    terminer([])
    await Promise.all([premier, concurrent])
    await corpus.rafraichirScanAnon(false)
    expect(scanAnon).toHaveBeenCalledTimes(1)
    corpus.perimerScanAnon()
    const recharge = corpus.rafraichirScanAnon(false)
    terminer([])
    await recharge
    expect(scanAnon).toHaveBeenCalledTimes(2)
  })

  test('conserve un scan chargé après un échec et efface l’alerte au succès suivant', async () => {
    const scanAnon = vi.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Lecture impossible'))
      .mockResolvedValueOnce([])
    const reglesAnon = vi.fn().mockResolvedValue([])
    Object.defineProperty(globalThis, 'window', {
      value: { sonal: { corpus: { scanAnon, reglesAnon } } },
      configurable: true,
    })
    const corpus = useCorpus({ flush: async () => {} })

    await corpus.rafraichirScanAnon()
    corpus.perimerScanAnon()
    await corpus.rafraichirScanAnon()
    expect(corpus.scanAnonCharge.value).toBe(true)
    expect(corpus.scanAnonErreur.value).toBe('Lecture impossible')

    await corpus.rafraichirScanAnon()
    expect(corpus.scanAnonCharge.value).toBe(true)
    expect(corpus.scanAnonErreur.value).toBeNull()
  })
})
