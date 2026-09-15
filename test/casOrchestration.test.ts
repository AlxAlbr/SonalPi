import { describe, expect, test, vi } from 'vitest'
import { executerCommandeCas } from '../src/main/casOrchestration'
import type { Cas, CommandeCas } from '../src/shared/corpus/cas'
import type { CorpusFichier } from '../src/shared/format'

const maintenant = '2026-09-01T10:00:00.000Z'
const corpus = { membership: {} } as CorpusFichier

function commandeDeuxSources(): CommandeCas {
  const cas: Cas = {
    id: 'cas-1',
    nom: 'Cas',
    memo: '',
    creeLe: maintenant,
    modifieLe: maintenant,
    regles: [],
    rattachements: [
      {
        id: 'r1',
        source: { entretienId: 'e1', repereId: 'p1' },
        provenance: 'manuel',
        creeLe: maintenant,
      },
      {
        id: 'r2',
        source: { entretienId: 'e2', repereId: 'p2' },
        provenance: 'manuel',
        creeLe: maintenant,
      },
    ],
  }
  return { type: 'creer', cas }
}

describe('orchestration main des commandes de cas', () => {
  test('la création vide ne publie aucun entretien et ne vérifie aucun repère', async () => {
    const commande = commandeDeuxSources()
    if (commande.type !== 'creer') throw new Error('Création attendue.')
    commande.cas.rattachements = []
    const publier = vi.fn(async () => ({ ok: true }))
    const repereExiste = vi.fn(() => true)
    const executer = vi.fn(() => corpus)
    await expect(executerCommandeCas(commande, {
      sessionsTenues: () => ['e1'],
      publierEntretien: publier,
      repereExiste,
      executerDefinitions: executer,
    })).resolves.toBe(corpus)
    expect(publier).not.toHaveBeenCalled()
    expect(repereExiste).not.toHaveBeenCalled()
    expect(executer).toHaveBeenCalledOnce()
  })

  test('publie chaque source tenue, vérifie le serveur puis le store avant le corpus', async () => {
    const trace: string[] = []
    const resultat = await executerCommandeCas(commandeDeuxSources(), {
      sessionsTenues: () => ['e1', 'e2'],
      publierEntretien: async (id) => { trace.push(`publier:${id}`); return { ok: true } },
      verifierReferencesPubliees: async (references) => {
        trace.push(`serveur:${references.map((reference) => reference.repereId).join(',')}`)
      },
      repereExiste: (id, repereId) => { trace.push(`store:${id}:${repereId}`); return true },
      executerDefinitions: () => { trace.push('corpus'); return corpus },
    })

    expect(resultat).toBe(corpus)
    expect(trace).toEqual([
      'publier:e1',
      'publier:e2',
      'serveur:p1,p2',
      'store:e1:p1',
      'store:e2:p2',
      'corpus',
    ])
  })

  test('ne publie qu’une fois plusieurs repères du même entretien', async () => {
    const commande = commandeDeuxSources()
    if (commande.type !== 'creer') return
    commande.cas.rattachements[1].source.entretienId = 'e1'
    const publier = vi.fn(async () => ({ ok: true }))
    await executerCommandeCas(commande, {
      sessionsTenues: () => ['e1'],
      publierEntretien: publier,
      repereExiste: () => true,
      executerDefinitions: () => corpus,
    })
    expect(publier).toHaveBeenCalledOnce()
    expect(publier).toHaveBeenCalledWith('e1')
  })

  test('une publication refusée interdit toute vérification et toute transaction corpus', async () => {
    const verifier = vi.fn(() => true)
    const executer = vi.fn(() => corpus)
    await expect(executerCommandeCas(commandeDeuxSources(), {
      sessionsTenues: () => ['e1'],
      publierEntretien: async () => ({ ok: false, raison: 'réseau' }),
      verifierReferencesPubliees: vi.fn(async () => {}),
      repereExiste: verifier,
      executerDefinitions: executer,
    })).rejects.toThrow(/réseau/)
    expect(verifier).not.toHaveBeenCalled()
    expect(executer).not.toHaveBeenCalled()
  })

  test('un repère absent après publication interdit la transaction corpus', async () => {
    const executer = vi.fn(() => corpus)
    await expect(executerCommandeCas(commandeDeuxSources(), {
      sessionsTenues: () => ['e1'],
      publierEntretien: async () => ({ ok: true }),
      verifierReferencesPubliees: async () => {},
      repereExiste: (_id, repereId) => repereId !== 'p1',
      executerDefinitions: executer,
    })).rejects.toThrow(/n'a pas été enregistré/)
    expect(executer).not.toHaveBeenCalled()
  })
})
