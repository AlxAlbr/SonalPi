import { describe, expect, test } from 'vitest'
import { inventorierCorrespondancesLocuteurs } from '../src/shared/corpus/correspondancesLocuteurs'
import { fixturePseudonymisation } from './fixtures/pseudonymisation'

describe('correspondances des locuteurs indépendantes du texte', () => {
  test('inclut un pseudo explicite sans aucun tour de parole et ne crée aucune règle', () => {
    const fixture = fixturePseudonymisation()
    const avant = structuredClone(fixture)
    const inventaire = inventorierCorrespondancesLocuteurs(fixture.entretiens)
    expect(inventaire.correspondances).toHaveLength(1)
    expect(inventaire.correspondances[0]).toMatchObject({ nom: 'Locuteur synthétique sans tour', pseudo: 'Voix témoin', utilisee: true })
    expect(inventaire.divergences).toEqual([])
    expect(fixture).toEqual(avant)
  })

  test('déduplique les mêmes couples en conservant tous les entretiens et identités locales', () => {
    const { entretiens } = fixturePseudonymisation()
    const e1 = entretiens[0]
    e1.data.locuteurs[0].id = 'loc-a'
    const e2 = { id: 'e2', data: structuredClone(e1.data) }
    e2.data.locuteurs[0].id = 'loc-b'
    const inventaire = inventorierCorrespondancesLocuteurs([e2, e1, e1])
    expect(inventaire.correspondances).toHaveLength(1)
    expect(inventaire.correspondances[0].origines).toHaveLength(2)
    expect(inventaire.correspondances[0].origines.map((o) => o.locuteurId).sort()).toEqual(['loc-a', 'loc-b'])
  })

  test('un même couple est exportable une fois même avec des décisions différentes selon l’entretien', () => {
    const { entretiens } = fixturePseudonymisation()
    const e1 = entretiens[0]
    const e2 = { id: 'e2', data: structuredClone(e1.data) }
    e2.data.locuteurs[0].pseudoEtat = 'refuse'
    const inventaire = inventorierCorrespondancesLocuteurs([e1, e2])
    expect(inventaire.correspondances).toHaveLength(1)
    expect(inventaire.correspondances[0].utilisee).toBe(true)
    expect(Object.fromEntries(inventaire.correspondances[0].origines.map((o) =>
      [o.entretienId, { etat: o.pseudoEtat, utilisee: o.utilisee }]))).toEqual({
      [e1.id]: { etat: 'confirme', utilisee: true }, [e2.id]: { etat: 'refuse', utilisee: false },
    })
  })

  test('signale une divergence de pseudo pour une personne et pour un nom, sans synchronisation', () => {
    const { entretiens } = fixturePseudonymisation()
    const e1 = entretiens[0]
    e1.data.locuteurs[0].personneRef = 'personne-partagee'
    const e2 = { id: 'e2', data: structuredClone(e1.data) }
    e2.data.locuteurs[0].pseudo = 'Autre voix'
    const avant = structuredClone([e1, e2])
    const inventaire = inventorierCorrespondancesLocuteurs([e1, e2])
    expect(inventaire.correspondances).toHaveLength(2)
    expect(inventaire.divergences.map((d) => d.nature)).toEqual(['nom', 'personne'])
    expect(inventaire.divergences[1]).toMatchObject({ cle: 'personne-partagee', pseudos: ['Autre voix', 'Voix témoin'] })
    expect([e1, e2]).toEqual(avant)
  })

  test('un refus ou un pseudo identique au nom ne produit pas réellement de pseudo', () => {
    const { entretiens } = fixturePseudonymisation()
    const original = entretiens[0].data.locuteurs[0]
    entretiens[0].data.locuteurs = [
      { ...original, index: 0, pseudoEtat: 'refuse' },
      { ...original, index: 1, pseudo: original.nom },
      { ...original, index: 2, pseudo: '   ' },
    ]
    const inventaire = inventorierCorrespondancesLocuteurs(entretiens)
    expect(inventaire.correspondances).toHaveLength(2)
    expect(inventaire.correspondances.every((c) => !c.utilisee)).toBe(true)
  })
})
