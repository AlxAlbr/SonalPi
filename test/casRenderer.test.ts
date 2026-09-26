// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ref, toRaw } from 'vue'
import { appliquerCommandeCas, type Cas, type CommandeCas } from '../src/shared/corpus/cas'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../src/shared/format'
import { useCasCorpus } from '../src/renderer/composables/corpus/useCasCorpus'

const maintenant = '2026-09-01T10:00:00.000Z'

function source(repereId = 'repere-1'): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION,
    lastModified: maintenant,
    corpsTexte: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { loc: null },
        content: [{ type: 'text', text: 'Passage sélectionné.' }],
      }],
    },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
    reperesPassages: [{ id: repereId, from: 1, to: 20 }],
  }
}

function outilLot() {
  let numero = 0
  vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++numero}` })
  const personnes = Array.from({ length: 30 }, (_, index) => ({ id: `p${index}`, nom: index < 2 ? 'Homonyme' : `Personne ${index}` }))
  let disque: Record<string, Cas> = {}
  const dictionnaire = ref<Record<string, Cas>>({})
  const lirePersonnes = vi.fn(async () => ({ personnes, locuteurs: [], notes: [], indisponibles: [] }))
  const lireEntretien = vi.fn(async () => ({ ok: true as const, data: source() }))
  const enregistrerRepereSelection = vi.fn()
  const casCommander = vi.fn(async (commande: CommandeCas) => {
    disque = appliquerCommandeCas(structuredClone(disque), commande, {
      maintenant: () => maintenant,
      personneExiste: (id) => personnes.some((personne) => personne.id === id),
      entretienExiste: (id) => id === 'e1' || id === 'e2',
    })
    return { cas: structuredClone(disque) }
  })
  ;(window as any).sonal = { corpus: { lireEntretien, casCommander, ouvrir: async () => ({ cas: structuredClone(disque) }) } }
  const cas = useCasCorpus({
    cas: dictionnaire,
    membership: ref({
      e1: { titre: 'Même titre', date: null, lastModified: maintenant },
      e2: { titre: 'Même titre', date: null, lastModified: maintenant },
    }),
    ouvertId: ref(null), sourceOuverte: () => null, selectionCourante: () => null,
    enregistrerRepereSelection, lirePersonnes, ouvrirSource: vi.fn(), fermerRecueils: vi.fn(),
    definitionsAvecSources: () => true,
  })
  return { cas, dictionnaire, personnes, lirePersonnes, lireEntretien, enregistrerRepereSelection, casCommander }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('orchestration renderer des cas', () => {
  test('prévisualise 30 personnes avec noms distincts et une seule lecture de chaque source', async () => {
    const outil = outilLot()
    const apercu = await outil.cas.preparerLotCas({ type: 'personnes', ids: outil.personnes.map((personne) => personne.id), inclureEnqueteurs: false }, 'individuel')
    expect(apercu).toHaveLength(30)
    expect(new Set(apercu.map((item) => item.cas.id)).size).toBe(30)
    expect(apercu.slice(0, 2).map((item) => item.cas.nom)).toEqual(['Homonyme', 'Homonyme (2)'])
    expect(outil.lireEntretien).toHaveBeenCalledTimes(2)
    expect(outil.lirePersonnes).toHaveBeenCalledOnce()
    expect(outil.casCommander).not.toHaveBeenCalled()
    expect(outil.enregistrerRepereSelection).not.toHaveBeenCalled()
    await outil.cas.creerLotCas(ref(apercu).value.map((item) => item.cas))
    expect(Object.keys(outil.dictionnaire.value)).toHaveLength(30)
    expect(outil.casCommander).toHaveBeenCalledOnce()
    const suivants = await outil.cas.preparerLotCas({ type: 'personnes', ids: ['p0', 'p1'], inclureEnqueteurs: false }, 'collectif')
    expect(suivants).toHaveLength(1)
    expect(suivants[0].cas.regles).toEqual([{ type: 'personnes', membres: [
      { personneId: 'p0', inclureEnqueteurs: false }, { personneId: 'p1', inclureEnqueteurs: false },
    ] }])
    const doublon = await outil.cas.preparerLotCas({ type: 'personnes', ids: ['p0'], inclureEnqueteurs: false }, 'individuel')
    expect(doublon[0].casExistants).toEqual(['Homonyme'])
    expect(doublon[0].cas.nom).toBe('Homonyme (3)')
  })

  test('prévisualise et crée des entretiens entiers sans inventaire ni repères', async () => {
    const outil = outilLot()
    const apercu = await outil.cas.preparerLotCas({ type: 'entretiens', ids: ['e1', 'e2'] }, 'individuel')
    expect(apercu.map((item) => item.cas.nom)).toEqual(['Même titre', 'Même titre (2)'])
    expect(apercu.map((item) => item.sources)).toEqual([1, 1])
    await outil.cas.creerLotCas(apercu.map((item) => item.cas))
    expect(outil.lirePersonnes).not.toHaveBeenCalled()
    expect(outil.enregistrerRepereSelection).not.toHaveBeenCalled()
    expect(outil.lireEntretien.mock.calls.map((appel: any[]) => appel[0])).toEqual(['e1', 'e2', 'e1', 'e2'])
    const collectif = await outil.cas.preparerLotCas({ type: 'entretiens', ids: ['e1', 'e2'] }, 'collectif')
    expect(collectif).toHaveLength(1)
    expect(collectif[0].cas.regles).toEqual([{ type: 'entretiens', entretienIds: ['e1', 'e2'] }])
  })

  test('une réponse perdue se reprend avec le même lot et ne double pas les cas enregistrés', async () => {
    const outil = outilLot()
    const apercu = await outil.cas.preparerLotCas({ type: 'entretiens', ids: ['e1', 'e2'] }, 'individuel')
    const implementation = outil.casCommander.getMockImplementation()!
    outil.casCommander.mockImplementationOnce(async (commande) => {
      await implementation(commande)
      throw new Error('Réponse perdue')
    })
    await expect(outil.cas.creerLotCas(apercu.map((item) => item.cas))).rejects.toThrow('Réponse perdue')
    const commande = structuredClone(outil.casCommander.mock.calls[0][0])
    expect(Object.keys(outil.dictionnaire.value)).toHaveLength(2)
    expect(outil.cas.creationCasEnAttente.value).not.toBeNull()
    apercu[0].cas.nom = 'Nom ignoré au rejeu'
    await outil.cas.creerLotCas(apercu.map((item) => item.cas))
    expect(outil.casCommander.mock.calls[1][0]).toEqual(commande)
    expect(Object.keys(outil.dictionnaire.value)).toHaveLength(2)
    expect(outil.cas.creationCasEnAttente.value).toBeNull()
  })

  test('ne réinjecte pas le résultat d’une création dans un autre corpus', async () => {
    const outil = outilLot()
    const apercu = await outil.cas.preparerLotCas({ type: 'entretiens', ids: ['e1'] }, 'individuel')
    let terminer!: (resultat: { cas: Record<string, Cas> }) => void
    outil.casCommander.mockImplementationOnce(() => new Promise((resolve) => { terminer = resolve }))
    const creation = outil.cas.creerLotCas(apercu.map((item) => item.cas))
    outil.cas.reinitialiserCas()
    terminer({ cas: { ancien: apercu[0].cas } })
    await expect(creation).rejects.toThrow('corpus a changé')
    expect(outil.dictionnaire.value).toEqual({})
    expect(outil.cas.creationCasEnAttente.value).toBeNull()
  })

  test('crée un cas vide sans lire de source ni créer de repère ; le filtre reste local', async () => {
    let numero = 0
    vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++numero}` })
    const dictionnaire = ref<Record<string, Cas>>({})
    const enregistrer = vi.fn()
    const lirePersonnes = vi.fn()
    const lireEntretien = vi.fn()
    const casCommander = vi.fn(async (commande: CommandeCas) => ({
      cas: appliquerCommandeCas(structuredClone(toRaw(dictionnaire.value)), commande, {
        maintenant: () => maintenant, personneExiste: () => false, entretienExiste: () => true,
      }),
    }))
    ;(window as any).sonal = { corpus: { lireEntretien, casCommander } }
    const cas = useCasCorpus({
      cas: dictionnaire,
      membership: ref({ e1: { titre: 'Entretien', date: null, lastModified: maintenant } }),
      ouvertId: ref(null),
      sourceOuverte: () => null,
      selectionCourante: () => null,
      enregistrerRepereSelection: enregistrer,
      lirePersonnes,
      ouvrirSource: vi.fn(),
      fermerRecueils: vi.fn(),
      definitionsAvecSources: () => true,
    })

    const id = await cas.creerCasVide({ nom: 'À documenter', memo: 'Premières idées.' })
    expect(cas.casOuvert.value).toMatchObject({
      id, nom: 'À documenter', memo: 'Premières idées.', regles: [], rattachements: [],
    })
    expect(cas.projectionCas.value?.problemes).toBe(0)
    const avant = JSON.stringify(dictionnaire.value)
    const projectionComplete = cas.projectionCas.value
    cas.modeMateriauxCas.value = 'manuels'
    expect(cas.vueMateriauxCas.value).toEqual(projectionComplete?.vues.manuels)
    cas.modeMateriauxCas.value = 'regles'
    expect(cas.vueMateriauxCas.value).toEqual(projectionComplete?.vues.regles)
    expect(cas.projectionCas.value).toBe(projectionComplete)
    expect(JSON.stringify(dictionnaire.value)).toBe(avant)
    expect(casCommander).toHaveBeenCalledOnce()
    expect(enregistrer).not.toHaveBeenCalled()
    expect(lirePersonnes).not.toHaveBeenCalled()
    expect(lireEntretien).not.toHaveBeenCalled()

    const autreId = await cas.creerCasVide({ nom: 'Autre cas', memo: '' })
    expect(cas.modeMateriauxCas.value).toBe('tous')
    cas.modeMateriauxCas.value = 'manuels'
    await cas.ouvrirCas(id)
    expect(cas.modeMateriauxCas.value).toBe('tous')
    expect(autreId).not.toBe(id)
    cas.modeMateriauxCas.value = 'regles'
    cas.reinitialiserCas()
    expect(cas.modeMateriauxCas.value).toBe('tous')
    expect(cas.vueMateriauxCas.value).toBeNull()
  })

  test('une annulation avant confirmation ne crée aucun repère', async () => {
    const enregistrer = vi.fn(async () => ({ id: 'repere-1', from: 1, to: 20 }))
    ;(window as any).sonal = { corpus: {
      lireEntretien: vi.fn(),
      casCommander: vi.fn(),
      ouvrir: vi.fn(),
    } }
    const cas = useCasCorpus({
      cas: ref({}),
      membership: ref({ e1: { titre: 'Entretien 1', date: null, lastModified: maintenant } }),
      ouvertId: ref('e1'),
      sourceOuverte: () => source(),
      selectionCourante: () => ({
        entretienId: 'e1', from: 1, to: 20, texte: 'Passage sélectionné.',
      }),
      enregistrerRepereSelection: enregistrer,
      lirePersonnes: async () => ({ personnes: [], locuteurs: [], notes: [], indisponibles: [] }),
      ouvrirSource: vi.fn(),
      fermerRecueils: vi.fn(),
      definitionsAvecSources: () => true,
    })

    await cas.afficherCasPourAssociation()
    cas.annulerAssociationCas()

    expect(enregistrer).not.toHaveBeenCalled()
    expect(cas.associationCas.value).toBeNull()
    expect(cas.casOuverts.value).toBe(false)
  })

  test('réessaie le rattachement avec le même repère après un échec corpus', async () => {
    let numero = 0
    vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++numero}` })
    const enregistrer = vi.fn(async () => ({ id: 'repere-1', from: 1, to: 20 }))
    const casCommander = vi.fn()
      .mockRejectedValueOnce(new Error('conflit réseau'))
      .mockImplementationOnce(async (commande: any) => ({
        formatVersion: FORMAT_VERSION,
        codebook: {},
        variables: {},
        reglesAnon: {},
        personnes: {},
        membership: { e1: { titre: 'Entretien 1', date: null, lastModified: maintenant } },
        recueils: {},
        cas: { [commande.nouveauCas.id]: commande.nouveauCas },
      } satisfies CorpusFichier))
    ;(window as any).sonal = { corpus: {
      lireEntretien: vi.fn(async () => ({ ok: true, data: source() })),
      casCommander,
      ouvrir: vi.fn(async () => ({ cas: {} })),
    } }
    const dictionnaire = ref({})
    const cas = useCasCorpus({
      cas: dictionnaire,
      membership: ref({ e1: { titre: 'Entretien 1', date: null, lastModified: maintenant } }),
      ouvertId: ref('e1'),
      sourceOuverte: () => source(),
      selectionCourante: () => ({
        entretienId: 'e1', from: 1, to: 20, texte: 'Passage sélectionné.',
      }),
      enregistrerRepereSelection: enregistrer,
      lirePersonnes: async () => ({ personnes: [], locuteurs: [], notes: [], indisponibles: [] }),
      ouvrirSource: vi.fn(),
      fermerRecueils: vi.fn(),
      definitionsAvecSources: () => true,
    })

    await cas.afficherCasPourAssociation()
    await expect(cas.associerSelectionCas([], { nom: 'Cas manuel', memo: '' }))
      .rejects.toThrow('conflit réseau')
    const premiereCommande = structuredClone(casCommander.mock.calls[0][0])
    expect(cas.ajoutCasEnAttente.value?.rattachement.source.repereId).toBe('repere-1')

    await cas.associerSelectionCas([], { nom: 'Valeurs ignorées au rejeu', memo: 'autre' })

    expect(enregistrer).toHaveBeenCalledOnce()
    expect(casCommander).toHaveBeenCalledTimes(2)
    expect(casCommander.mock.calls[1][0]).toEqual(premiereCommande)
    expect(cas.ajoutCasEnAttente.value).toBeNull()
    expect(Object.values(dictionnaire.value)).toHaveLength(1)
  })
  test('un corpus qui ne garde pas les sources refuse avant d’enregistrer un repère', async () => {
    const enregistrer = vi.fn(async () => ({ id: 'repere-1', from: 1, to: 20 }))
    const casCommander = vi.fn()
    ;(window as any).sonal = { corpus: {
      lireEntretien: vi.fn(),
      casCommander,
      ouvrir: vi.fn(),
    } }
    const cas = useCasCorpus({
      cas: ref({}),
      membership: ref({ e1: { titre: 'Entretien 1', date: null, lastModified: maintenant } }),
      ouvertId: ref('e1'),
      sourceOuverte: () => source(),
      selectionCourante: () => ({
        entretienId: 'e1', from: 1, to: 20, texte: 'Passage sélectionné.',
      }),
      enregistrerRepereSelection: enregistrer,
      lirePersonnes: async () => ({ personnes: [], locuteurs: [], notes: [], indisponibles: [] }),
      ouvrirSource: vi.fn(),
      fermerRecueils: vi.fn(),
      definitionsAvecSources: () => false,
    })

    await cas.afficherCasPourAssociation()

    // Ni le repère ni la commande : le refus précède les deux.
    await expect(cas.associerSelectionCas([], { nom: 'Cas manuel', memo: '' }))
      .rejects.toThrow(/ne sait pas relire les entretiens publiés/)
    expect(enregistrer).not.toHaveBeenCalled()
    expect(casCommander).not.toHaveBeenCalled()
  })
})
