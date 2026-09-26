import { afterEach, describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import {
  useDistantCorpus,
  verifierTriContenu,
} from '../src/renderer/composables/corpus/useDistantCorpus'
import { matriceCapacites } from '../src/main/gitlab/politiqueGestes'
import type { ResultatTiragePublic } from '../src/shared/distant'

const fenetreInitiale = globalThis.window
const scopes: EffectScope[] = []

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.restoreAllMocks()
  Object.defineProperty(globalThis, 'window', { value: fenetreInitiale, configurable: true })
})

function creerContexte(tirer: () => Promise<ResultatTiragePublic | null>) {
  let signalerProgression: (progression: {
    sens: 'rapatriement' | 'televersement'
    chemin: string
    octets: number
    total: number | null
  }) => void = () => {}
  let signalerSessionDegradee: (id: string) => void = () => {}
  let preparerFermeture: () => Promise<void> = async () => {}
  const arreterProgression = vi.fn()
  const arreterSession = vi.fn()
  const arreterFermeture = vi.fn()
  const preserverSauvegarde = vi.fn(async () => true)
  const annulerSauvegarde = vi.fn(async () => {})
  const viderSauvegarde = vi.fn(async () => {})
  const effets = {
    rafraichirCorpusSansFermer: vi.fn(async () => {}),
    nettoyerMiroirChange: vi.fn(),
    detecterDivergencesAnon: vi.fn(),
    majAudiosInaccessibles: vi.fn(),
    reinitialiserDivergence: vi.fn(),
    rendreEditeurEditable: vi.fn(),
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sonal: {
        distant: {
          tirer,
          orphelins: vi.fn(async () => []),
          reprendreOrphelin: vi.fn(async () => ({ ok: true })),
          abandonnerOrphelin: vi.fn(async () => {}),
          surProgression: vi.fn((cb) => {
            signalerProgression = cb
            return arreterProgression
          }),
        },
        corpus: {
          etatSession: vi.fn(async () => ({
            etat: 'a-nous' as const,
            dernierPubli: null,
            sale: false,
          })),
          publierEntretien: vi.fn(async () => ({ ok: true })),
          surSessionDegradee: vi.fn((cb) => {
            signalerSessionDegradee = cb
            return arreterSession
          }),
        },
        application: {
          surPreparationFermeture: vi.fn((cb) => {
            preparerFermeture = cb
            return arreterFermeture
          }),
        },
      },
    },
  })

  const ouvertId = ref<string | null>(null)
  const scope = effectScope()
  scopes.push(scope)
  const distant = scope.run(() => useDistantCorpus({
    vue: ref<'accueil' | 'corpus' | 'entretien'>('corpus'),
    entretien: {
      ouvertId,
      verrouAutrui: () => false,
      sauver: vi.fn(async () => {}),
      viderSauvegarde,
      preserverEtAnnulerSauvegarde: preserverSauvegarde,
      annulerEtAttendreSauvegarde: annulerSauvegarde,
    },
    effets,
  }))!

  return {
    distant,
    effets,
    ouvertId,
    preserverSauvegarde,
    annulerSauvegarde,
    viderSauvegarde,
    signalerProgression: (progression: Parameters<typeof signalerProgression>[0]) =>
      signalerProgression(progression),
    signalerSessionDegradee: (id: string) => signalerSessionDegradee(id),
    preparerFermeture: () => preparerFermeture(),
    arreterProgression,
    arreterSession,
    arreterFermeture,
    scope,
  }
}

const verrou = {
  chemin: 'verrous/e1.lock.json',
  etag: null,
  contenu: {
    userId: 'max',
    machineId: 'poste-1',
    acquiredAt: '2026-01-01T10:00:00.000Z',
  },
}

describe('orchestration distante du renderer', () => {
  test('absorbe un tirage et déclenche seulement les projections concernées', async () => {
    const tirer = vi.fn(async (): Promise<ResultatTiragePublic> => ({
      telecharges: ['corpus.json'],
      corbeille: [],
      verrous: [verrou],
      inaccessibles: [{ chemin: 'audio/test.mp3', raison: '403' }],
      presences: [{
        userId: 'olivier',
        machineId: 'poste-2',
        entretienOuvert: 'e1',
        refreshedAt: '2026-01-01T10:01:00.000Z',
      }],
      date: '2026-01-01T10:02:00.000Z',
    }))
    const contexte = creerContexte(tirer)
    contexte.ouvertId.value = 'e1'
    contexte.distant.activerDistant('d1', [], [])

    await expect(contexte.distant.actualiserDistant()).resolves.toBe(true)

    expect(contexte.distant.dernierTirage.value).toBe('2026-01-01T10:02:00.000Z')
    expect(contexte.distant.badgeVerrou('e1')).toEqual(verrou.contenu)
    expect(contexte.distant.presencesSur('e1')).toHaveLength(1)
    expect(contexte.effets.majAudiosInaccessibles).toHaveBeenLastCalledWith([
      { chemin: 'audio/test.mp3', raison: '403' },
    ])
    expect(contexte.effets.detecterDivergencesAnon).toHaveBeenCalledOnce()
    expect(contexte.effets.rafraichirCorpusSansFermer).toHaveBeenCalledOnce()
    expect(contexte.effets.nettoyerMiroirChange).not.toHaveBeenCalled()

    contexte.signalerProgression({
      sens: 'rapatriement',
      chemin: 'audio/test.mp3',
      octets: 25,
      total: 100,
    })
    expect(contexte.distant.pourcentageProgression.value).toBe(25)
  })

  test('un contexte GitLab ouvre les définitions, les sources gardées et le tri', () => {
    const contexte = creerContexte(vi.fn())

    contexte.distant.activerDistant('gitlab-1', [], [], false, matriceCapacites('gitlab'), 'gitlab')

    expect(contexte.distant.enLigne.value).toBe(true)
    expect(contexte.distant.lectureSeule.value).toBe(false)
    expect(contexte.distant.gesteDisponible('definitions')).toBe(true)
    expect(contexte.distant.gesteDisponible('definitionsAvecSources')).toBe(true)
    expect(contexte.distant.gesteDisponible('triContenu')).toBe(true)
    expect(contexte.distant.ajoutEntretienPossible.value).toBe(true)
    expect(contexte.distant.renommagePossible('e1')).toBe(true)
    expect(contexte.distant.tableLigneEditable('e1')).toBe(false)
    expect(contexte.distant.metaEditables('e1')).toBe(false)
    expect(contexte.distant.suppressionPossible('e1')).toBe(false)
  })

  test('un corpus Nextcloud garde toutes ses capacités', () => {
    const contexte = creerContexte(vi.fn())

    contexte.distant.activerDistant('webdav-1', [], [], false, matriceCapacites('webdav'), 'webdav')

    expect(contexte.distant.lectureSeule.value).toBe(false)
    expect(contexte.distant.gesteDisponible('definitionsAvecSources')).toBe(true)
    expect(contexte.distant.gesteDisponible('personnes')).toBe(true)
    expect(contexte.distant.gesteDisponible('notes')).toBe(false)
    expect(contexte.distant.tableLigneEditable('e1')).toBe(true)
    expect(contexte.distant.metaEditables('e1')).toBe(true)
    expect(contexte.distant.suppressionPossible('e1')).toBe(true)
  })

  test('l’hors ligne et la consultation seule priment sur les capacités', () => {
    const contexte = creerContexte(vi.fn())

    contexte.distant.activerDistant('gitlab-1', [], [], false, matriceCapacites('gitlab'), 'gitlab')
    contexte.distant.enLigne.value = false
    expect(contexte.distant.lectureSeule.value).toBe(true)
    expect(contexte.distant.gesteDisponible('definitions')).toBe(false)
    expect(contexte.distant.ajoutEntretienPossible.value).toBe(false)

    contexte.distant.enLigne.value = true
    contexte.distant.activerDistant('gitlab-1', [], [], true, matriceCapacites('gitlab'), 'gitlab')
    expect(contexte.distant.lectureSeule.value).toBe(true)
    expect(contexte.distant.gesteDisponible('definitions')).toBe(false)
  })

  test('une observation des détenteurs en panne est signalée, puis effacée', async () => {
    const tirer = vi.fn()
      .mockResolvedValueOnce({
        telecharges: [],
        corbeille: [],
        verrous: [],
        verrousIndisponibles: true,
        date: '2026-01-01T10:02:00.000Z',
      } satisfies ResultatTiragePublic)
      .mockResolvedValueOnce({
        telecharges: [],
        corbeille: [],
        verrous: [verrou],
        date: '2026-01-01T10:03:00.000Z',
      } satisfies ResultatTiragePublic)
    const contexte = creerContexte(tirer)
    contexte.distant.activerDistant('d1', [], [], false, matriceCapacites('webdav'), 'webdav', true)
    expect(contexte.distant.verrousIndisponibles.value).toBe(true)

    await expect(contexte.distant.actualiserDistant()).resolves.toBe(true)
    expect(contexte.distant.verrousIndisponibles.value).toBe(true)
    // Le drapeau n'accorde rien : l'édition suit l'état du corpus, pas les badges.
    expect(contexte.distant.tableLigneEditable('e1')).toBe(true)

    await expect(contexte.distant.actualiserDistant()).resolves.toBe(true)
    expect(contexte.distant.verrousIndisponibles.value).toBe(false)
    expect(contexte.distant.badgeVerrou('e1')).toEqual(verrou.contenu)
    expect(contexte.distant.tableLigneEditable('e1')).toBe(false)

    contexte.distant.quitterDistant()
    expect(contexte.distant.verrousIndisponibles.value).toBe(false)
  })

  test('un échec silencieux conserve le miroir et verrouille les définitions', async () => {
    const tirer = vi.fn(async () => {
      throw new Error('réseau indisponible')
    })
    const contexte = creerContexte(tirer)
    contexte.distant.activerDistant('d1', [], [])

    await expect(contexte.distant.actualiserDistant(true)).resolves.toBe(false)

    expect(contexte.distant.idDistantCourant.value).toBe('d1')
    expect(contexte.distant.enLigne.value).toBe(false)
    expect(contexte.distant.lectureSeule.value).toBe(true)
    await expect(contexte.distant.actualiserDistant(false)).rejects.toThrow('réseau indisponible')
  })

  test.each([true, false])('un tirage échoué suspend l’édition sans oublier la session (silencieux : %s)', async (silencieux) => {
    const contexte = creerContexte(async () => {
      throw new Error('réseau indisponible')
    })
    contexte.ouvertId.value = 'e1'
    contexte.distant.activerDistant('d1', [], [])
    await nextTick()
    expect(contexte.distant.statutSession.value.etat).toBe('a-nous')
    expect(contexte.distant.entretienEditable.value).toBe(true)
    contexte.effets.rendreEditeurEditable.mockClear()

    if (silencieux) {
      expect(await contexte.distant.actualiserDistant(true)).toBe(false)
    } else {
      await expect(contexte.distant.actualiserDistant(false)).rejects.toThrow('réseau indisponible')
    }
    await nextTick()

    expect(contexte.distant.entretienEditable.value).toBe(false)
    expect(contexte.effets.rendreEditeurEditable).toHaveBeenLastCalledWith(false)
    expect(contexte.distant.statutSession.value.etat).toBe('a-nous')
    expect(contexte.ouvertId.value).toBe('e1')
    expect(contexte.effets.nettoyerMiroirChange).not.toHaveBeenCalled()
    expect(contexte.effets.rafraichirCorpusSansFermer).not.toHaveBeenCalled()
    expect(contexte.annulerSauvegarde).not.toHaveBeenCalled()
    expect(window.sonal.corpus.publierEntretien).not.toHaveBeenCalled()
  })

  test('le retour du réseau ne réactive pas une session dont le droit a été perdu', async () => {
    const tirer = vi.fn(async (): Promise<ResultatTiragePublic> => ({
      telecharges: [],
      corbeille: [],
      verrous: [],
      date: '2026-01-01T10:05:00.000Z',
    }))
    const contexte = creerContexte(tirer)
    contexte.ouvertId.value = 'e1'
    contexte.distant.activerDistant('d1', [], [])
    await nextTick()
    expect(contexte.distant.statutSession.value.etat).toBe('a-nous')
    contexte.signalerSessionDegradee('e1')
    contexte.distant.enLigne.value = false
    await nextTick()

    expect(await contexte.distant.actualiserDistant(true)).toBe(true)
    await nextTick()

    expect(contexte.distant.enLigne.value).toBe(true)
    expect(contexte.distant.statutSession.value).toEqual({ etat: 'degrade' })
    expect(contexte.distant.entretienEditable.value).toBe(false)
    expect(contexte.effets.rendreEditeurEditable).toHaveBeenLastCalledWith(false)
    expect(window.sonal.corpus.publierEntretien).not.toHaveBeenCalled()
  })

  test('un échec de copie de récupération reste visible', async () => {
    const contexte = creerContexte(async () => null)
    contexte.ouvertId.value = 'e1'
    contexte.distant.activerDistant('d1', [], [])
    contexte.preserverSauvegarde.mockResolvedValueOnce(false)
    await nextTick()

    contexte.signalerSessionDegradee('e1')
    await nextTick()

    expect(contexte.distant.publiErreur.value).toContain('Gardez cette fenêtre ouverte')
    expect(contexte.distant.entretienEditable.value).toBe(false)
  })

  test('une session dégradée préserve le debounce puis nettoie les ressources', async () => {
    const contexte = creerContexte(async () => null)
    contexte.ouvertId.value = 'e1'
    contexte.distant.activerDistant('d1', [], [])
    await nextTick()

    contexte.signalerSessionDegradee('e1')
    expect(contexte.distant.statutSession.value).toEqual({ etat: 'degrade' })
    expect(contexte.effets.rendreEditeurEditable).toHaveBeenCalledWith(false)
    expect(contexte.preserverSauvegarde).toHaveBeenCalledOnce()
    expect(contexte.annulerSauvegarde).not.toHaveBeenCalled()

    await contexte.preparerFermeture()
    expect(contexte.annulerSauvegarde).toHaveBeenCalledOnce()
    expect(contexte.viderSauvegarde).not.toHaveBeenCalled()

    contexte.scope.stop()
    expect(contexte.arreterProgression).toHaveBeenCalledOnce()
    expect(contexte.arreterSession).toHaveBeenCalledOnce()
    expect(contexte.arreterFermeture).toHaveBeenCalledOnce()
  })
})

describe('tri par contenu', () => {
  test('un corpus qui ne sait pas le trier le dit par son nom', () => {
    expect(() => verifierTriContenu({ capacite: false, distant: true, entretienOuvert: false }))
      .toThrow(/n’est pas disponible sur ce corpus/)
  })

  test('un corpus distant refuse un entretien ouvert plutôt que de le publier', () => {
    expect(() => verifierTriContenu({ capacite: true, distant: true, entretienOuvert: true }))
      .toThrow(/fermeture de tous les entretiens/)
    expect(() => verifierTriContenu({ capacite: true, distant: true, entretienOuvert: false }))
      .not.toThrow()
  })

  test('en local, un entretien ouvert se vide comme avant', () => {
    expect(() => verifierTriContenu({ capacite: true, distant: false, entretienOuvert: true }))
      .not.toThrow()
  })
})
