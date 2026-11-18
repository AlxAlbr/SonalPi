import { describe, expect, test } from 'vitest'
import { ref } from 'vue'
import { detailsVariablesEntretien } from '../src/shared/corpus/lectureVariables'
import { useSelectionCorpus } from '../src/renderer/composables/corpus/useSelectionCorpus'
import type { EntretienFichier, Variable } from '../src/shared/format'
import { corpusCasNatif, entretienCasNatif } from './fixtures/casNatifs'

describe('lecture des variables de participation', () => {
  test('garde deux blocs homonymes distincts avec leurs ids, index et valeurs propres', () => {
    const definitions = Object.values(corpusCasNatif().variables)
    const data = entretienCasNatif()
    data.participations.push({ ...data.participations[0], id: 'autre-local', index: 11, locuteurRef: 'autre', valeursLoc: { groupe: 'b', age: 'jeune' } })
    const avant = structuredClone([definitions, data])
    const details = detailsVariablesEntretien(definitions, data)
    expect(details.generales).toEqual([{ id: 'lieu', lib: 'Lieu', valeur: 'Ici' }])
    expect(details.parParticipation.map((p) => [p.participationId, p.participationIndex, p.nom, p.lignes.map((l) => l.valeur)])).toEqual([
      ['loc-conserve', 7, 'Nom local A', ['A', 'Adulte']], ['autre-local', 11, 'Nom local A', ['B', 'Jeune']],
    ])
    expect([definitions, data]).toEqual(avant)
  })

  test('le rôle est lu sur la participation de cet entretien uniquement', () => {
    const definitions = Object.values(corpusCasNatif().variables)
    const a = entretienCasNatif(), b = entretienCasNatif()
    b.participations[0].interviewer = true
    expect(detailsVariablesEntretien(definitions, a).parParticipation).toHaveLength(1)
    expect(detailsVariablesEntretien(definitions, b).parParticipation).toHaveLength(0)
    b.participations[0].interviewer = false
    b.participations[0].nom = 'Enquêteur ?'
    expect(detailsVariablesEntretien(definitions, b).parParticipation).toHaveLength(0)
  })

  test('une valeur sans modalité reste absente à l’affichage, sans effacement des données', () => {
    const definitions = Object.values(corpusCasNatif().variables)
    const data = entretienCasNatif()
    data.participations[0].valeursLoc.age = 'modalite-retiree'
    data.participations[0].valeursLoc.sansDefinition = 'conservee'
    const avant = structuredClone(data)
    const lignes = detailsVariablesEntretien(definitions, data).parParticipation[0].lignes
    expect(lignes).toEqual([{ id: 'groupe', lib: 'Groupe', valeur: 'A' }, { id: 'age', lib: 'Âge', valeur: null }])
    expect(data).toEqual(avant)
  })

  test('une projection ne fabrique pas un id depuis l’index local', () => {
    const data = entretienCasNatif()
    const { id: _id, ...locale } = data.participations[0]
    const details = detailsVariablesEntretien(Object.values(corpusCasNatif().variables), { meta: data.meta, participations: [locale] })
    expect(details.parParticipation[0]).toMatchObject({ participationId: null, participationIndex: 7 })
    expect(locale).not.toHaveProperty('id')
  })

  test('le panneau de sélection actif emploie les blocs de participation sans réécrire sa source', async () => {
    const definitions: Variable[] = [{ id: 'v', lib: 'Groupe', portee: 'locuteur', priv: false, ordre: 0, vExport: 1,
      modalites: [{ id: 'a', lib: 'A', mExport: 1 }, { id: 'b', lib: 'B', mExport: 2 }] }]
    const data: EntretienFichier = {
      formatVersion: 9, lastModified: '2026-01-01T00:00:00.000Z', corpsTexte: {}, annotations: [], ancres: [],
      meta: { valeursGen: {}, audioRef: null }, locuteurs: [
        { id: 'local-a', index: 7, nom: 'Même nom', personneRef: null, valeursLoc: { v: 'a' } },
        { id: 'local-b', index: 11, nom: 'Même nom', personneRef: null, valeursLoc: { v: 'b' } },
      ],
    }
    const avant = structuredClone(data)
    const selection = useSelectionCorpus({ variables: ref(definitions), lireEntretien: async () => ({ ok: true, data }) })
    await selection.selectionnerCorpus('e1')
    expect(selection.corpusSelMeta.value?.nbParticipations).toBe(2)
    expect(selection.corpusSelMeta.value?.parParticipation.map((p) => [p.participationId, p.lignes[0].valeur]))
      .toEqual([['local-a', 'A'], ['local-b', 'B']])
    expect(data).toEqual(avant)
  })
})
