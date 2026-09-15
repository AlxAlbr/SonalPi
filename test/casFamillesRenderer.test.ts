// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { ref, toRaw } from 'vue'
import { appliquerCommandeCas, type CommandeCas } from '../src/shared/corpus/cas'
import { useCasCorpus } from '../src/renderer/composables/corpus/useCasCorpus'
import { corpusFamille, sourceFamille, dateFamille } from './fixtures/casFamilles'

function outil() {
  let id = 0
  vi.stubGlobal('crypto', { randomUUID: () => `id-${++id}` })
  const disque = corpusFamille()
  const cas = ref(structuredClone(disque.cas!))
  const famillesCas = ref(structuredClone(disque.famillesCas!))
  const variables = ref(Object.values(structuredClone(disque.variables)))
  const lirePersonnes = vi.fn()
  const lireEntretien = vi.fn(async (id: string) => ({ ok: true as const, data: sourceFamille(id === 'e2') }))
  const casCommander = vi.fn(async (commande: CommandeCas) => {
    disque.cas = appliquerCommandeCas(disque.cas, structuredClone(commande), {
      maintenant: () => dateFamille, personneExiste: () => false, entretienExiste: () => true,
      familles: disque.famillesCas, variables: disque.variables,
    })
    return structuredClone(disque)
  })
  ;(window as any).sonal = { corpus: { lireEntretien, casCommander, ouvrir: async () => structuredClone(disque) } }
  const api = useCasCorpus({ cas, famillesCas, variables, membership: ref(disque.membership), ouvertId: ref(null),
    sourceOuverte: () => null, selectionCourante: () => null, enregistrerRepereSelection: vi.fn(), lirePersonnes,
    ouvrirSource: vi.fn(), fermerRecueils: vi.fn() })
  return { api, disque, casCommander, lireEntretien, lirePersonnes, variables }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const choix = { variableId: 'v', nom: 'Établissements', inclureEnqueteurs: false }

test('aperçu sans écriture, membres muets observés, modalités non observées opt-in et lecture sans registre des personnes', async () => {
  const { api, disque, lirePersonnes, casCommander } = outil()
  const apercu = await api.preparerFamilleCas(choix)
  expect(apercu.cas.map((c) => c.selectionne)).toEqual([true, true, false])
  expect(apercu.cas[0].projection.observationsModalite).toMatchObject({ membres: 5, valeursAbsentes: 2 })
  expect(casCommander).not.toHaveBeenCalled()
  expect(disque.famillesCas).toEqual({})
  apercu.cas[2].selectionne = true
  await api.creerOuCompleterFamilleCas(ref(apercu).value)
  expect(Object.keys(disque.cas!)).toHaveLength(3)
  expect(Object.keys(api.famillesCas.value)).toHaveLength(1)
  expect(lirePersonnes).not.toHaveBeenCalled()
  const avant = structuredClone(disque)
  await api.rafraichirProjectionsCas()
  expect(disque).toEqual(avant)
})

test('source illisible ne devient ni manquante ni vide certifiée et ne sélectionne pas les modalités non observées', async () => {
  const { api, lireEntretien } = outil()
  lireEntretien.mockResolvedValue({ ok: false, raison: 'hors ligne' } as any)
  const apercu = await api.preparerFamilleCas(choix)
  expect(apercu.cas.every((item) => !item.selectionne)).toBe(true)
  expect(apercu.cas[0].projection.observationsModalite).toMatchObject({ sourcesIllisibles: 2, valeursAbsentes: 0, membres: 0 })
  expect(apercu.cas[0].projection.problemes).toBe(2)
})

test.each([false, true])('réponse perdue : identités de la création ou du complément conservées (complément=%s)', async (completion) => {
  const { api, disque, casCommander } = outil()
  let apercu = await api.preparerFamilleCas(choix)
  if (completion) {
    await api.creerOuCompleterFamilleCas(apercu)
    apercu = await api.preparerFamilleCas({ ...choix, familleId: apercu.famille.id })
    expect(apercu.cas.map((c) => c.dejaPresent)).toEqual([true, true, false])
    apercu.cas[2].selectionne = true
  }
  const appliquer = casCommander.getMockImplementation()!
  casCommander.mockImplementationOnce(async (commande) => { await appliquer(commande); throw new Error('réponse perdue') })
  await expect(api.creerOuCompleterFamilleCas(apercu)).rejects.toThrow('réponse perdue')
  const tentative = structuredClone(toRaw(api.creationFamilleEnAttente.value))
  expect(tentative).not.toBeNull()
  const apres = structuredClone(disque)
  await api.creerOuCompleterFamilleCas()
  expect(casCommander.mock.lastCall![0]).toEqual(tentative)
  expect(disque).toEqual(apres)
  expect(api.creationFamilleEnAttente.value).toBeNull()
})

test('changement de corpus invalide aperçu, commande en attente et réponse retardée', async () => {
  const { api, casCommander } = outil()
  const apercu = await api.preparerFamilleCas(choix)
  let terminer!: (valeur: any) => void
  casCommander.mockImplementationOnce(() => new Promise((resolve) => { terminer = resolve }))
  const attente = api.creerOuCompleterFamilleCas(apercu)
  api.reinitialiserCas()
  terminer(corpusFamille())
  await expect(attente).rejects.toThrow(/corpus a changé/)
  expect(api.creationFamilleEnAttente.value).toBeNull()
  await expect(api.creerOuCompleterFamilleCas(apercu)).rejects.toThrow(/corpus courant/)
  expect(api.famillesCas.value).toEqual({})
})

test('nouvelles modalités seulement via complément explicite, noms homonymes distingués par identité', async () => {
  const { api, disque, variables } = outil()
  disque.variables.v.modalites[1].lib = 'A'
  variables.value = Object.values(structuredClone(disque.variables))
  const apercu = await api.preparerFamilleCas(choix)
  expect(apercu.cas.slice(0, 2).map((c) => c.cas.nom)).toEqual(['A', 'A (2)'])
  await api.creerOuCompleterFamilleCas(apercu)
  disque.variables.v.modalites.push({ id: 'nouveau', lib: 'Nouveau', mExport: 4 })
  variables.value = Object.values(structuredClone(disque.variables))
  await api.rafraichirProjectionsCas()
  expect(Object.keys(disque.cas!)).toHaveLength(2)
  const complement = await api.preparerFamilleCas({ ...choix, familleId: apercu.famille.id })
  expect(complement.cas[3]).toMatchObject({ selectionne: false, dejaPresent: false })
  complement.cas[3].selectionne = true
  await api.creerOuCompleterFamilleCas(complement)
  expect(Object.keys(disque.cas!)).toHaveLength(3)
})
