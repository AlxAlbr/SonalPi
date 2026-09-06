import { afterEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executerFermetureApplication } from '../src/main/fermetureApplication'

function differee<T>() {
  let resoudre!: (valeur: T) => void
  const promesse = new Promise<T>((resolve) => { resoudre = resolve })
  return { promesse, resoudre }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('fermeture de l’application', () => {
  test('attend l’autosave du renderer avant le nettoyage distant et la sortie', async () => {
    const autosave = differee<boolean>()
    const nettoyage = differee<void>()
    const trace: string[] = []

    const execution = executerFermetureApplication({
      viderRenderers: async () => {
        trace.push('demander-autosave')
        const resultat = await autosave.promesse
        trace.push('autosave-termine')
        return resultat
      },
      nettoyerDistant: async () => {
        trace.push('nettoyer')
        await nettoyage.promesse
        trace.push('nettoyage-termine')
      },
      quitter: () => { trace.push('quitter') },
      delaiNettoyageMs: 1_000,
    })

    await Promise.resolve()
    expect(trace).toEqual(['demander-autosave'])
    autosave.resoudre(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(trace).toEqual(['demander-autosave', 'autosave-termine', 'nettoyer'])
    nettoyage.resoudre()

    await expect(execution).resolves.toEqual({
      renderersVides: true,
      nettoyage: 'termine',
    })
    expect(trace).toEqual([
      'demander-autosave',
      'autosave-termine',
      'nettoyer',
      'nettoyage-termine',
      'quitter',
    ])
  })

  test('borne un nettoyage bloqué et laisse miroir et journal disponibles', async () => {
    vi.useFakeTimers()
    const dir = mkdtempSync(join(tmpdir(), 'sonal-fermeture-app-'))
    const miroir = join(dir, 'entretien.json')
    const journal = join(dir, '.verrous-natifs.json')
    writeFileSync(miroir, 'copie locale', 'utf8')
    writeFileSync(journal, '{"e1":"reprise"}', 'utf8')
    let sorties = 0

    const execution = executerFermetureApplication({
      viderRenderers: async () => true,
      nettoyerDistant: () => new Promise<void>(() => {}),
      quitter: () => { sorties += 1 },
      delaiNettoyageMs: 6_000,
    })

    await vi.advanceTimersByTimeAsync(5_999)
    expect(sorties).toBe(0)
    await vi.advanceTimersByTimeAsync(1)

    await expect(execution).resolves.toEqual({
      renderersVides: true,
      nettoyage: 'expire',
    })
    expect(sorties).toBe(1)
    expect(existsSync(miroir)).toBe(true)
    expect(readFileSync(miroir, 'utf8')).toBe('copie locale')
    expect(existsSync(journal)).toBe(true)
  })

  test('un échec d’autosave interdit le nettoyage mais ne bloque pas la sortie', async () => {
    const nettoyer = vi.fn(async () => {})
    const quitter = vi.fn()

    await expect(executerFermetureApplication({
      viderRenderers: async () => false,
      nettoyerDistant: nettoyer,
      quitter,
    })).resolves.toEqual({ renderersVides: false, nettoyage: 'ignore' })

    expect(nettoyer).not.toHaveBeenCalled()
    expect(quitter).toHaveBeenCalledOnce()
  })

  test('un échec du nettoyage reste borné au protocole et autorise la sortie', async () => {
    const quitter = vi.fn()

    await expect(executerFermetureApplication({
      viderRenderers: async () => true,
      nettoyerDistant: async () => { throw new Error('réseau indisponible') },
      quitter,
    })).resolves.toEqual({ renderersVides: true, nettoyage: 'echec' })

    expect(quitter).toHaveBeenCalledOnce()
  })
})
