import { afterEach, describe, expect, test, vi } from 'vitest'
import { ref } from 'vue'
import { useTableauBordCorpus } from '../src/renderer/composables/corpus/useTableauBordCorpus'
import { tableauBordParDefaut, type TableauBord } from '../src/shared/corpus/tableaubord'
import type { CorpusFichier } from '../src/shared/format'

const fenetreInitiale = globalThis.window
afterEach(() => {
  Object.defineProperty(globalThis, 'window', { value: fenetreInitiale, configurable: true })
  vi.restoreAllMocks()
})

function monter() {
  const tableaubord = ref<TableauBord | null>(tableauBordParDefaut())
  const composable = useTableauBordCorpus({ tableaubord })
  return { tableaubord, composable }
}

function stubCorpus(valeur: TableauBord) {
  const corpus = { tableaubord: valeur } as unknown as CorpusFichier
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sonal: {
        corpus: {
          tableaubordCommander: vi.fn(async () => corpus),
          ouvrir: vi.fn(async () => corpus),
        },
      },
    },
  })
  return corpus
}

describe('useTableauBordCorpus — commandes', () => {
  test('une commande met le modèle à jour depuis la réponse du store', async () => {
    const { tableaubord, composable } = monter()
    const valeur = tableauBordParDefaut()
    valeur.lignes.push({ id: 'l2', nom: 'Entretien 2' })
    stubCorpus(valeur)
    await composable.ajouterLigne('Entretien 3')
    expect(tableaubord.value!.lignes).toHaveLength(3)
    expect(composable.etatSauvegardeTableau.value).toBe('à jour')
  })

  test('un échec passe en conflit, affiche le message et relit le corpus', async () => {
    const { tableaubord, composable } = monter()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        sonal: {
          corpus: {
            tableaubordCommander: vi.fn(async () => { throw new Error('La case a changé.') }),
            ouvrir: vi.fn(async () => ({ tableaubord: tableauBordParDefaut() } as unknown as CorpusFichier)),
          },
        },
      },
    })
    await expect(composable.poserCellule('ent-1', 'contact', { statut: 'ok' })).rejects.toThrow()
    expect(composable.etatSauvegardeTableau.value).toBe('conflit')
    expect(composable.messageTableau.value).toBe('La case a changé.')
    composable.reinitialiserTableauBord()
    expect(composable.etatSauvegardeTableau.value).toBe('à jour')
    expect(composable.messageTableau.value).toBeNull()
  })

  test('poser une cellule lit la garde du contenu courant (attendu)', async () => {
    const { tableaubord, composable } = monter()
    tableaubord.value!.cellules['ent-1'] = { contact: { statut: 'encours' } }
    const stub = stubCorpus(tableauBordParDefaut())
    await composable.poserCellule('ent-1', 'contact', { statut: 'ok' })
    const commande = vi.mocked(globalThis.window as unknown as { sonal: { corpus: { tableaubordCommander: (c: unknown) => Promise<unknown> } } })
      .sonal.corpus.tableaubordCommander.mock.calls[0][0] as { type: string; attendu: unknown }
    expect(commande.type).toBe('poser-cellule')
    expect(commande.attendu).toEqual({ statut: 'encours' })
    expect((stub as unknown as { tableaubord?: unknown }).tableaubord).toBeDefined()
  })

  test('les ajouts transmettent l’emplacement choisi', async () => {
    const { composable } = monter()
    stubCorpus(tableauBordParDefaut())
    await composable.ajouterColonne('Relance', false, 'contact')
    await composable.ajouterLigne('Entretien 3')
    const commandes = vi.mocked(globalThis.window as unknown as { sonal: { corpus: { tableaubordCommander: (c: unknown) => Promise<unknown> } } })
      .sonal.corpus.tableaubordCommander.mock.calls
      .map(([commande]) => commande as { type: string; apresId?: string | null })
    expect(commandes[0]).toMatchObject({ type: 'ajouter-colonne', apresId: 'contact' })
    expect(commandes[1].type).toBe('ajouter-ligne')
    expect(commandes[1].apresId).toBeUndefined()
  })
})
