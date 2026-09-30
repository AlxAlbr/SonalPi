// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  confirmerOperationGlobale,
  installerOperationGlobaleCorpus,
  lancerOperationGlobale,
  messageOperationGlobale,
  operationGlobaleEnCours,
  reinitialiserOperationGlobale,
} from '../src/renderer/operationGlobaleCorpus'

function installer(options: {
  gitlab?: boolean
  entretiens?: number
  verrous?: number
} = {}): void {
  installerOperationGlobaleCorpus({
    estCorpusGitLab: () => options.gitlab ?? true,
    compterEntretiens: () => options.entretiens ?? 3,
    compterVerrousAutrui: () => options.verrous ?? 0,
  })
}

function simulerConfirmation(reponse: boolean) {
  const confirmer = vi.fn(() => reponse)
  Object.defineProperty(window, 'confirm', {
    configurable: true,
    value: confirmer,
  })
  return confirmer
}

afterEach(() => {
  reinitialiserOperationGlobale()
  vi.restoreAllMocks()
})

describe('opération globale d’un corpus', () => {
  it('confirme seulement sur GitLab et annonce les entretiens et les verrous', () => {
    const confirmer = simulerConfirmation(true)
    installer({ entretiens: 12, verrous: 2 })

    expect(confirmerOperationGlobale()).toBe(true)
    expect(confirmer).toHaveBeenCalledOnce()
    expect(confirmer.mock.calls[0][0]).toContain('vérifier les 12 entretiens publiés')
    expect(confirmer.mock.calls[0][0]).toContain('2 entretiens sont actuellement ouverts')
    expect(confirmer.mock.calls[0][0]).toContain('risque d’échouer')

    installer({ gitlab: false })
    expect(confirmerOperationGlobale()).toBe(true)
    expect(confirmer).toHaveBeenCalledOnce()
  })

  it('ne lance rien lorsque la confirmation est refusée', async () => {
    simulerConfirmation(false)
    installer()
    const operation = vi.fn(async () => {})

    await expect(lancerOperationGlobale(operation)).resolves.toBe(false)
    expect(operation).not.toHaveBeenCalled()
    expect(operationGlobaleEnCours.value).toBe(false)
    expect(messageOperationGlobale.value).toBeNull()
  })

  it('interdit un second lancement pendant la première promesse', async () => {
    const confirmer = simulerConfirmation(true)
    installer({ entretiens: 1 })
    let terminer!: () => void
    const attente = new Promise<void>((resolve) => { terminer = resolve })
    const operation = vi.fn(() => attente)

    const premiere = lancerOperationGlobale(operation)
    expect(operationGlobaleEnCours.value).toBe(true)
    expect(messageOperationGlobale.value).toBe('Vérification de 1 entretien publié…')
    await expect(lancerOperationGlobale(operation)).resolves.toBe(false)
    expect(confirmer).toHaveBeenCalledOnce()
    expect(operation).toHaveBeenCalledOnce()

    terminer()
    await expect(premiere).resolves.toBe(true)
    expect(operationGlobaleEnCours.value).toBe(false)
    expect(messageOperationGlobale.value).toBeNull()
  })

  it('rétablit l’état après un refus de l’opération', async () => {
    simulerConfirmation(true)
    installer({ entretiens: 4 })

    await expect(lancerOperationGlobale(async () => {
      throw new Error('conflit')
    })).rejects.toThrow('conflit')
    expect(operationGlobaleEnCours.value).toBe(false)
    expect(messageOperationGlobale.value).toBeNull()
  })

  it('ne montre ni confirmation ni message GitLab sur les autres corpus', async () => {
    const confirmer = simulerConfirmation(true)
    installer({ gitlab: false, entretiens: 9 })
    let etatPendant = false
    let messagePendant: string | null = 'inattendu'

    await expect(lancerOperationGlobale(async () => {
      etatPendant = operationGlobaleEnCours.value
      messagePendant = messageOperationGlobale.value
    })).resolves.toBe(true)
    expect(etatPendant).toBe(true)
    expect(messagePendant).toBeNull()
    expect(confirmer).not.toHaveBeenCalled()
  })
})
