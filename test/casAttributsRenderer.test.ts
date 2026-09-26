// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { ref, toRaw } from 'vue'
import { appliquerCommandeCas, type Cas, type CommandeCas } from '../src/shared/corpus/cas'
import type { EntretienFichier, Variable } from '../src/shared/format'
import { useCasCorpus } from '../src/renderer/composables/corpus/useCasCorpus'
import {
  casModalite,
  corpusFamille,
  dateFamille,
  familleCas,
  sourceFamille,
} from './fixtures/casFamilles'

function variableTaille(): Variable {
  return {
    id: 'taille', lib: 'Taille', portee: 'locuteur', priv: true, ordre: 1, vExport: 2,
    modalites: [
      { id: 'petit', lib: 'Moins de 10', mExport: 1 },
      { id: 'grand', lib: '10 à 100', mExport: 2 },
    ],
  }
}

function poserTailles(
  source: EntretienFichier,
  valeurs: Record<number, string>,
): EntretienFichier {
  for (const [index, valeur] of Object.entries(valeurs)) {
    const locuteur = source.locuteurs.find((candidat) => candidat.index === Number(index))
    if (locuteur) locuteur.valeursLoc.taille = valeur
  }
  return source
}

function outil() {
  let id = 0
  vi.stubGlobal('crypto', { randomUUID: () => `id-${++id}` })
  const disque = corpusFamille()
  disque.variables.taille = variableTaille()
  const famille = familleCas()
  disque.famillesCas = { f: famille }
  const manuel: Cas = {
    id: 'manuel', nom: 'Cas manuel', memo: '', creeLe: dateFamille, modifieLe: dateFamille,
    regles: [], rattachements: [],
  }
  disque.cas = {
    'cas-f-a': casModalite('a', famille),
    'cas-f-b': casModalite('b', famille),
    manuel,
  }
  disque.attributsCas = {}
  const sources: Record<string, EntretienFichier> = {
    e1: poserTailles(sourceFamille(), { 2: 'petit', 3: 'petit', 4: 'grand', 6: 'petit' }),
    e2: poserTailles(sourceFamille(true), { 2: 'grand', 3: 'petit', 4: 'grand', 6: 'petit' }),
  }
  const cas = ref(structuredClone(disque.cas))
  const famillesCas = ref(structuredClone(disque.famillesCas))
  const attributsCas = ref(structuredClone(disque.attributsCas))
  const variables = ref(Object.values(structuredClone(disque.variables)))
  const lireEntretien = vi.fn(async (entretienId: string) => ({
    ok: true as const,
    data: structuredClone(sources[entretienId]),
  }))
  const casCommander = vi.fn(async (commande: CommandeCas) => {
    disque.cas = appliquerCommandeCas(disque.cas, structuredClone(commande), {
      maintenant: () => dateFamille,
      personneExiste: () => true,
      entretienExiste: (entretienId) => Boolean(disque.membership[entretienId]),
      familles: disque.famillesCas,
      attributs: disque.attributsCas,
      variables: disque.variables,
    })
    return structuredClone(disque)
  })
  ;(window as any).sonal = {
    corpus: {
      lireEntretien,
      casCommander,
      ouvrir: async () => structuredClone(disque),
    },
  }
  const api = useCasCorpus({
    cas,
    famillesCas,
    attributsCas,
    variables,
    membership: ref(disque.membership),
    ouvertId: ref(null),
    sourceOuverte: () => null,
    selectionCourante: () => null,
    enregistrerRepereSelection: vi.fn(),
    lirePersonnes: vi.fn(async () => ({ personnes: [], locuteurs: [] })),
    ouvrirSource: vi.fn(),
    fermerRecueils: vi.fn(),
    definitionsAvecSources: () => true,
  })
  return { api, disque, sources, attributsCas, casCommander }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('définition, confidentialité et valeur saisie traversent le store renderer', async () => {
  const { api, disque, attributsCas, casCommander } = outil()
  await api.creerDefinitionAttribut({
    lib: 'Statut de suivi', type: 'texte', priv: false, modalites: [],
  })
  const definition = Object.values(attributsCas.value)[0]
  expect(definition).toMatchObject({ lib: 'Statut de suivi', type: 'texte', priv: false })

  await api.ouvrirCas('manuel')
  await api.definirValeurAttribut(definition.id, 'À revoir')
  expect(disque.cas!.manuel.valeursAttributsSaisis).toEqual({ [definition.id]: 'À revoir' })
  expect(api.attributsCasOuvert.value[0]).toMatchObject({
    attributId: definition.id,
    origine: 'saisi',
    valeurSaisie: 'À revoir',
  })

  await api.modifierDefinitionAttribut(definition.id, { priv: true })
  expect(attributsCas.value[definition.id].priv).toBe(true)
  expect(api.attributsCasOuvert.value[0].definition?.priv).toBe(true)
  expect(casCommander.mock.calls.map(([commande]) => commande.type)).toEqual([
    'creer-attribut', 'definir-valeur-attribut', 'modifier-attribut',
  ])
})

test('une recette familiale fraîche devient suspendue partout après un conflit sur A', async () => {
  const { api, sources, attributsCas } = outil()
  const candidates = await api.apercuVariablesFamille('f')
  expect(candidates.find((candidate) => candidate.variable.id === 'taille')).toMatchObject({
    disponible: true,
  })

  await api.ajouterDerivationFamille('f', {
    variableSourceId: 'taille',
    nouvelleDefinition: { lib: 'Taille de l’établissement', priv: true },
  })
  const attributId = Object.values(attributsCas.value)[0].id
  await api.ouvrirCas('cas-f-a')
  expect(api.attributsCasOuvert.value[0].diagnostic).toMatchObject({
    statut: 'coherent', valeur: 'petit', valeurLibelle: 'Moins de 10',
  })

  const locuteurA = sources.e1.locuteurs.find((locuteur) => locuteur.index === 3)!
  locuteurA.valeursLoc.taille = 'grand'
  await api.rafraichirProjectionsCas()
  expect(api.attributsProjeteCas.value['cas-f-a'][0].diagnostic).toMatchObject({
    statut: 'incoherent', valeur: null, suspensionFamille: {},
  })
  expect(api.attributsProjeteCas.value['cas-f-b'][0].diagnostic).toMatchObject({
    statut: 'coherent', valeur: null, valeurLibelle: null, suspensionFamille: {},
  })
  expect(api.attributsProjeteCas.value['cas-f-b'][0].diagnostic?.problemes.join(' '))
    .toMatch(/suspendu pour toute la famille/)

  locuteurA.valeursLoc.taille = 'petit'
  await api.rafraichirProjectionsCas()
  expect(api.attributsProjeteCas.value['cas-f-b'][0].diagnostic).toMatchObject({
    statut: 'coherent', valeur: 'grand', valeurLibelle: '10 à 100',
  })
  expect(api.attributsProjeteCas.value['cas-f-b'][0].diagnostic?.suspensionFamille).toBeUndefined()
  expect(toRaw(api.famillesCas.value.f.derivationsAttributs)).toEqual([
    { attributId, variableSourceId: 'taille', porteeSource: 'locuteur' },
  ])
})
