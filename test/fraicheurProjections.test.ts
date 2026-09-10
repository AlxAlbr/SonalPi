import { afterEach, describe, expect, test, vi } from 'vitest'
import { useCorpus } from '../src/renderer/composables/useCorpus'
import { effacerErreurGlobale, erreurGlobale } from '../src/renderer/erreurs'
import type { MatriceCorpus } from '../src/shared/format'

const fenetreInitiale = globalThis.window

afterEach(() => {
  vi.restoreAllMocks()
  effacerErreurGlobale()
  Object.defineProperty(globalThis, 'window', { value: fenetreInitiale, configurable: true })
})

const resultat: MatriceCorpus = [{
  entretienId: 'e1',
  titre: 'Entretien A',
  valeursGen: {},
  locuteurs: [],
}]

describe('fraîcheur de la matrice du corpus', () => {
  test('fusionne les lectures concurrentes et distingue le premier chargement', async () => {
    let terminer!: (valeur: MatriceCorpus) => void
    const matrice = vi.fn(() => new Promise<MatriceCorpus>((resolve) => { terminer = resolve }))
    Object.defineProperty(globalThis, 'window', {
      value: { sonal: { corpus: { matrice } } },
      configurable: true,
    })
    const corpus = useCorpus({ flush: async () => {} })

    const premiere = corpus.rafraichirMatrice()
    const concurrente = corpus.rafraichirMatrice()
    expect(matrice).toHaveBeenCalledTimes(1)
    expect(corpus.matriceEnCours.value).toBe(true)
    expect(corpus.matriceChargee.value).toBe(false)

    terminer(resultat)
    await Promise.all([premiere, concurrente])
    expect(corpus.matrice.value).toEqual(resultat)
    expect(corpus.matriceChargee.value).toBe(true)
    expect(corpus.matriceEnCours.value).toBe(false)
  })

  test('conserve le dernier résultat après un échec et retire sa bannière au succès suivant', async () => {
    const matrice = vi.fn()
      .mockResolvedValueOnce(resultat)
      .mockRejectedValueOnce(new Error('Serveur indisponible'))
      .mockResolvedValueOnce([])
    Object.defineProperty(globalThis, 'window', {
      value: { sonal: { corpus: { matrice } } },
      configurable: true,
    })
    const corpus = useCorpus({ flush: async () => {} })

    await corpus.rafraichirMatrice()
    await corpus.rafraichirMatrice()
    expect(corpus.matrice.value).toEqual(resultat)
    expect(corpus.matriceChargee.value).toBe(true)
    expect(erreurGlobale.value).toContain('Actualisation des données impossible')

    await corpus.rafraichirMatrice()
    expect(corpus.matrice.value).toEqual([])
    expect(erreurGlobale.value).toBeNull()
  })

  test('ignore une lecture terminée après un changement de corpus', async () => {
    const terminaisons: Array<(valeur: MatriceCorpus) => void> = []
    const matrice = vi.fn(() => new Promise<MatriceCorpus>((resolve) => { terminaisons.push(resolve) }))
    Object.defineProperty(globalThis, 'window', {
      value: { sonal: { corpus: { matrice } } },
      configurable: true,
    })
    const corpus = useCorpus({ flush: async () => {} })

    const ancienne = corpus.rafraichirMatrice()
    corpus.reinitialiserMatrice()
    const nouvelle = corpus.rafraichirMatrice()
    terminaisons[0](resultat)
    terminaisons[1]([])
    await Promise.all([ancienne, nouvelle])

    expect(matrice).toHaveBeenCalledTimes(2)
    expect(corpus.matrice.value).toEqual([])
    expect(corpus.matriceChargee.value).toBe(true)
  })
})
